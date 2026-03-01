import { useEffect, useRef, useState } from "react";
import {
  Button,
  Box,
  List,
  ListItem,
  ListItemText,
  IconButton,
  ListItemIcon,
  PaperProps,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { RawPdbDatabase, RawPrcDatabase, RsrcEntryType } from "palm-pdb";
import { Panel } from "../panel";
import { WebDatabaseStorageImplementation } from "../database-storage/web-db-stg-impl";
import hotsyncEvents, {
  HotsyncEvents,
} from "../event-emitter/hotsync-event-emitter";
import { prefsStore } from "../prefs-store";

interface PaletteEntry {
  r: number;
  g: number;
  b: number;
}

interface TAIBBitmap {
  width: number;
  height: number;
  rowBytes: number;
  flags: number;
  pixelSize: number;
  version: number;
  transparentIndex?: number | null;
  compressionType?: number | null;
  pixels: Uint8Array;
  palette?: PaletteEntry[]; // if provided
}

const PilCompressed = 0x8000;
const PilHasColorTable = 0x4000;
const PilTransparent = 0x2000;

/**
 * Decompressors follow the same logic used in gifpil.c:
 * - Scanline compression: flag byte every 8 output bytes group; a set bit means a new byte follows,
 *   otherwise the byte is copied from the previous scanline.
 * - RLE compression: each scanline is encoded as pairs <count><value> until the scanline is full.
 */

function decompressScanline(
  compressed: Uint8Array,
  rowBytes: number,
  height: number
): Uint8Array {
  const out = new Uint8Array(rowBytes * height);
  let p = 0;
  const prev = new Uint8Array(rowBytes);
  const cur = new Uint8Array(rowBytes);

  for (let r = 0; r < height; r++) {
    let sli = 0;
    while (sli < rowBytes) {
      if (p >= compressed.length) {
        // truncated stream => stop early
        return out;
      }
      const db = compressed[p++];
      for (let rbi = 0; rbi < 8 && sli + rbi < rowBytes; rbi++) {
        const bit = 1 << (7 - rbi);
        if (db & bit) {
          // byte supplied
          if (p >= compressed.length) {
            cur[sli + rbi] = 0;
          } else {
            cur[sli + rbi] = compressed[p++];
          }
        } else {
          // copy from previous scanline
          cur[sli + rbi] = prev[sli + rbi];
        }
      }
      sli += 8;
    }
    // write cur into out
    out.set(cur.subarray(0, rowBytes), r * rowBytes);
    // swap prev / cur (copy)
    prev.set(cur.subarray(0, rowBytes));
  }

  return out;
}

function decompressRLE(
  compressed: Uint8Array,
  rowBytes: number,
  height: number
): Uint8Array {
  const out = new Uint8Array(rowBytes * height);
  let p = 0;

  for (let r = 0; r < height; r++) {
    let dest = r * rowBytes;
    let produced = 0;
    while (produced < rowBytes) {
      if (p + 1 >= compressed.length) {
        return out;
      }
      const cnt = compressed[p++];
      const val = compressed[p++];
      for (let k = 0; k < cnt && produced < rowBytes; k++) {
        out[dest + produced] = val;
        produced++;
      }
    }
  }

  return out;
}

/**
 * Unpack packed bytes into pixel indices array (width * height).
 * - `packed` is `rowBytes * height` bytes where each byte contains 8/pixelSize pixels.
 * - pixelSize is 1,2,4,8.
 */
function unpackPixels(
  packed: Uint8Array,
  pixelSize: number,
  width: number,
  height: number,
  rowBytes: number
): Uint8Array {
  const pixels = new Uint8Array(width * height);
  const mask = (1 << pixelSize) - 1;
  const pixelsPerByte = 8 / pixelSize;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    let px = 0;
    outer: for (let b = 0; b < rowBytes; b++) {
      const byte = packed[rowOffset + b];
      for (let i = 0; i < pixelsPerByte; i++) {
        const shift = 8 - pixelSize * (i + 1);
        const val = (byte >> shift) & mask;
        const x = b * pixelsPerByte + i;
        if (x >= width) {
          break outer;
        }
        pixels[y * width + x] = val;
        px++;
      }
    }
  }

  return pixels;
}

const ENABLE_TAIB_DEBUG = true;

const extractTAIBResource = (
  rawDb: RawPdbDatabase | RawPrcDatabase
): TAIBBitmap => {
  const dbg = (...args: any[]) => {
    if (ENABLE_TAIB_DEBUG) console.debug("[tAIB]", ...args);
  };

  let element;
  for (let index = 0; index < rawDb.records.length; index++) {
    const record = rawDb.records[index];
    const entries = record.entry as RsrcEntryType;
    if (entries.type === "tAIB" && entries.resourceId == 1000) {
      element = record;
      break;
    }
  }

  if (!element) {
    dbg("No tAIB resource found in database", rawDb?.header?.name);
    return {
      width: 22, height: 22, rowBytes: 3, flags: 0, pixelSize: 1, version: 1,
      transparentIndex: null, compressionType: null, pixels: new Uint8Array(22 * 22),
    };
  }

  dbg("tAIB resource found; length:", element.data?.length);

  const dataView = new DataView(
    element.data.buffer,
    element.data.byteOffset,
    element.data.byteLength
  );
  
  let offset = 0;
  const candidates: {
    bitmap: TAIBBitmap;
    pixelSize: number;
    paletteLen: number;
    version: number;
    offset: number;
    density: "single" | "double";
  }[] = [];

  let loopGuard = 0;
  while (offset + 10 <= dataView.byteLength && loopGuard++ < 1000) {
    const startOffset = offset;
    try {
      const width = dataView.getUint16(offset, false);
      const height = dataView.getUint16(offset + 2, false);
      const rowBytes = dataView.getUint16(offset + 4, false);
      const flags = dataView.getUint16(offset + 6, false);
      const pixelSize = dataView.getUint8(offset + 8);
      const version = dataView.getUint8(offset + 9);

      let transparentIndex: number | null = null;
      let compressionType: number | null = null;
      let headerSize = 16;
      let nextOffsetDelta = 0;

      if (version === 0) {
        headerSize = 16;
        nextOffsetDelta = 0;
      } else if (version === 1) {
        if (pixelSize === 255) {
          dbg(`  depth @${startOffset}: Dummy v1 header found. Skipping 16 bytes.`);
          offset += 16;
          continue;
        }
        headerSize = 16;
        nextOffsetDelta = dataView.getUint16(offset + 10, false) * 4;
      } else if (version === 2) {
        headerSize = 16;
        nextOffsetDelta = dataView.getUint16(offset + 10, false) * 4;
        transparentIndex = dataView.getUint8(offset + 12);
        compressionType = dataView.getUint8(offset + 13);
      } else if (version === 3) {
        headerSize = dataView.getUint8(offset + 10);
        if (headerSize < 24) headerSize = 24;
        compressionType = dataView.getUint8(offset + 13);
        nextOffsetDelta = dataView.getUint32(offset + 20, false);
      } else {
        dbg(`  depth @${startOffset}: Unsupported version ${version}.`);
        break;
      }

      const hasColorTable = Boolean(flags & PilHasColorTable);
      const isCompressed = Boolean(flags & PilCompressed);
      const hasTransparency = Boolean(flags & PilTransparent);
      const densityMode = (flags & 0x08) !== 0 ? "double" : "single";

      dbg(`depth @${startOffset}: w=${width} h=${height} rowBytes=${rowBytes} pixelSize=${pixelSize} v=${version} flags=0x${flags.toString(16)} comp=${isCompressed} colors=${hasColorTable} transp=${hasTransparency} nextDelta=${nextOffsetDelta}`);

      let dataStart = startOffset + headerSize;
      let palette: PaletteEntry[] | undefined = undefined;
      let paletteLen = 0;

      if (hasColorTable) {
        const colorCount = dataView.getUint16(dataStart, false);
        dataStart += 2;
        palette = [];
        for (let i = 0; i < colorCount; i++) {
          dataStart++;
          const rRaw = dataView.getUint8(dataStart++);
          const gRaw = dataView.getUint8(dataStart++);
          const bRaw = dataView.getUint8(dataStart++);
          palette.push({ r: rRaw, g: gRaw, b: bRaw });
        }
        paletteLen = palette.length;
      }

      let cbDst = nextOffsetDelta > 0
        ? nextOffsetDelta - (dataStart - startOffset)
        : dataView.byteLength - dataStart;

      if (cbDst < 0) cbDst = dataView.byteLength - dataStart;

      let pixelsPacked: Uint8Array | null = null;
      if (isCompressed) {
        let compressedBytesLen = 0;
        let compressedStart = dataStart;

        if (dataStart + 2 <= dataView.byteLength) {
          const len = dataView.getUint16(dataStart, false);
          if (len >= 2 && len <= cbDst + 2) {
            compressedBytesLen = len - 2;
            compressedStart = dataStart + 2;
          } else {
            compressedBytesLen = cbDst;
          }
        } else {
          compressedBytesLen = cbDst;
        }

        const bufferOffset = element.data.byteOffset + compressedStart;
        const compressed = new Uint8Array(element.data.buffer, bufferOffset, compressedBytesLen);
        const comp = compressionType ?? 0;

        if (comp === 0) {
          pixelsPacked = decompressScanline(compressed, rowBytes, height);
        } else if (comp === 1) {
          pixelsPacked = decompressRLE(compressed, rowBytes, height);
        }
      } else {
        const dataLen = rowBytes * height;
        if (dataStart + dataLen <= dataView.byteLength) {
          const bufferOffset = element.data.byteOffset + dataStart;
          pixelsPacked = new Uint8Array(element.data.buffer, bufferOffset, dataLen);
        }
      }

      if (pixelsPacked) {
        const pixels = unpackPixels(pixelsPacked, pixelSize, width, height, rowBytes);
        const expectedPixelCount = width * height;
        if (width > 0 && height > 0 && pixels.length === expectedPixelCount) {
          candidates.push({
            bitmap: {
              width, height, rowBytes, flags, pixelSize, version,
              transparentIndex: hasTransparency ? transparentIndex ?? null : null,
              compressionType: compressionType ?? null,
              pixels, palette,
            },
            pixelSize, paletteLen, version, offset: startOffset, density: densityMode,
          });
        }
      }

      if (nextOffsetDelta <= 0) break;
      offset = startOffset + nextOffsetDelta;

    } catch (err) {
      console.error("[tAIB] exception parsing depth at offset", offset, err);
      break;
    }
  }

  if (candidates.length === 0) {
    return {
      width: 22, height: 22, rowBytes: 3, flags: 0, pixelSize: 1, version: 1,
      transparentIndex: null, compressionType: null, pixels: new Uint8Array(22 * 22),
    };
  }


  candidates.sort((a, b) => {
    if (b.version !== a.version) return b.version - a.version;
    if (b.pixelSize !== a.pixelSize) return b.pixelSize - a.pixelSize;
    
    const areaA = a.bitmap.width * a.bitmap.height;
    const areaB = b.bitmap.width * b.bitmap.height;
    if (areaB !== areaA) return areaB - areaA;
    
    return 0;
  });

  return candidates[0].bitmap;
};


const PLACEHOLDER_SIZE = 22;
const placeholderBitmap: TAIBBitmap = {
  width: PLACEHOLDER_SIZE,
  height: PLACEHOLDER_SIZE,
  rowBytes: 3,
  flags: 0,
  pixelSize: 1,
  version: 1,
  transparentIndex: null,
  compressionType: null,
  pixels: new Uint8Array(PLACEHOLDER_SIZE * PLACEHOLDER_SIZE),
  palette: undefined,
};

export function buildPalmOS8BitPalette(): Array<[number, number, number]> {
  return [
    [255,255,255], [255,204,255], [255,153,255], [255,102,255],
    [255,51,255],  [255,0,255],   [255,255,204], [255,204,204],
    [255,153,204], [255,102,204], [255,51,204],  [255,0,204],
    [255,255,153], [255,204,153], [255,153,153], [255,102,153],
    [255,51,153],  [255,0,153],   [204,255,255], [204,204,255],
    [204,153,255], [204,102,255], [204,51,255],  [204,0,255],
    [204,255,204], [204,204,204], [204,153,204], [204,102,204],
    [204,51,204],  [204,0,204],   [204,255,153], [204,204,153],
    [204,153,153], [204,102,153], [204,51,153],  [204,0,153],
    [153,255,255], [153,204,255], [153,153,255], [153,102,255],
    [153,51,255],  [153,0,255],   [153,255,204], [153,204,204],
    [153,153,204], [153,102,204], [153,51,204],  [153,0,204],
    [153,255,153], [153,204,153], [153,153,153], [153,102,153],
    [153,51,153],  [153,0,153],   [102,255,255], [102,204,255],
    [102,153,255], [102,102,255], [102,51,255],  [102,0,255],
    [102,255,204], [102,204,204], [102,153,204], [102,102,204],
    [102,51,204],  [102,0,204],   [102,255,153], [102,204,153],
    [102,153,153], [102,102,153], [102,51,153],  [102,0,153],
    [51,255,255],  [51,204,255],  [51,153,255],  [51,102,255],
    [51,51,255],   [51,0,255],    [51,255,204],  [51,204,204],
    [51,153,204],  [51,102,204],  [51,51,204],   [51,0,204],
    [51,255,153],  [51,204,153],  [51,153,153],  [51,102,153],
    [51,51,153],   [51,0,153],    [0,255,255],   [0,204,255],
    [0,153,255],   [0,102,255],   [0,51,255],    [0,0,255],
    [0,255,204],   [0,204,204],   [0,153,204],   [0,102,204],
    [0,51,204],    [0,0,204],     [0,255,153],   [0,204,153],
    [0,153,153],   [0,102,153],   [0,51,153],    [0,0,153],
    [255,255,102], [255,204,102], [255,153,102], [255,102,102],
    [255,51,102],  [255,0,102],   [255,255,51],  [255,204,51],
    [255,153,51],  [255,102,51],  [255,51,51],   [255,0,51],
    [255,255,0],   [255,204,0],   [255,153,0],   [255,102,0],
    [255,51,0],    [255,0,0],     [204,255,102], [204,204,102],
    [204,153,102], [204,102,102], [204,51,102],  [204,0,102],
    [204,255,51],  [204,204,51],  [204,153,51],  [204,102,51],
    [204,51,51],   [204,0,51],    [204,255,0],   [204,204,0],
    [204,153,0],   [204,102,0],   [204,51,0],    [204,0,0],
    [153,255,102], [153,204,102], [153,153,102], [153,102,102],
    [153,51,102],  [153,0,102],   [153,255,51],  [153,204,51],
    [153,153,51],  [153,102,51],  [153,51,51],   [153,0,51],
    [153,255,0],   [153,204,0],   [153,153,0],   [153,102,0],
    [153,51,0],    [153,0,0],     [102,255,102], [102,204,102],
    [102,153,102], [102,102,102], [102,51,102],  [102,0,102],
    [102,255,51],  [102,204,51],  [102,153,51],  [102,102,51],
    [102,51,51],   [102,0,51],    [102,255,0],   [102,204,0],
    [102,153,0],   [102,102,0],   [102,51,0],    [102,0,0],
    [51,255,102],  [51,204,102],  [51,153,102],  [51,102,102],
    [51,51,102],   [51,0,102],    [51,255,51],   [51,204,51],
    [51,153,51],   [51,102,51],   [51,51,51],    [51,0,51],
    [51,255,0],    [51,204,0],    [51,153,0],    [51,102,0],
    [51,51,0],     [51,0,0],      [0,255,102],   [0,204,102],
    [0,153,102],   [0,102,102],   [0,51,102],    [0,0,102],
    [0,255,51],    [0,204,51],    [0,153,51],    [0,102,51],
    [0,51,51],     [0,0,51],      [0,255,0],     [0,204,0],
    [0,153,0],     [0,102,0],     [0,51,0],      [17,17,17],
    [34,34,34],    [68,68,68],    [85,85,85],    [119,119,119],
    [136,136,136], [170,170,170], [187,187,187], [221,221,221],
    [238,238,238], [192,192,192], [128,0,0],     [128,0,128],
    [0,128,0],     [0,128,128],   [0,0,0],       [0,0,0],
    [0,0,0],       [0,0,0],       [0,0,0],       [0,0,0],
    [0,0,0],       [0,0,0],       [0,0,0],       [0,0,0],
    [0,0,0],       [0,0,0],       [0,0,0],       [0,0,0],
    [0,0,0],       [0,0,0],       [0,0,0],       [0,0,0],
    [0,0,0],       [0,0,0],       [0,0,0],       [0,0,0],
    [0,0,0],       [0,0,0],       [0,0,0],       [0,0,0],
    [0,0,0],       [0,0,0],       [0,0,0],       [0,0,0],
    [0,0,0],       [0,0,0],       [0,0,0],       [0,0,0]
  ];
}

const PALM_OS_8BIT_PALETTE = buildPalmOS8BitPalette();

function palm8BitIndexToRGB(idx: number): [number, number, number] {
  const i = Math.max(0, Math.min(255, idx | 0));
  return PALM_OS_8BIT_PALETTE[i];
}

const drawTAIBBitmap = (canvas: HTMLCanvasElement, bitmap?: TAIBBitmap) => {
  const bmp = bitmap ?? placeholderBitmap;

  const width = Number(bmp.width) || 0;
  const height = Number(bmp.height) || 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    canvas.width = PLACEHOLDER_SIZE;
    canvas.height = PLACEHOLDER_SIZE;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { pixels, palette, pixelSize = 1, transparentIndex = null } = bmp;
  if (!pixels || pixels.length < width * height) {
    drawTAIBBitmap(canvas, placeholderBitmap);
    return;
  }

  try {
    const sample = Array.from(pixels.slice(0, Math.min(32, pixels.length)));
    console.debug("[tAIB] pixel sample indices:", sample);
  } catch (e) {}

  const scale = 2;
  const newWidth = Math.max(1, Math.floor(width * scale));
  const newHeight = Math.max(1, Math.floor(height * scale));
  canvas.width = newWidth;
  canvas.height = newHeight;

  let imageData: ImageData;
  try {
    imageData = ctx.createImageData(newWidth, newHeight);
  } catch (e) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const out = imageData.data;

  const maxIndex = (1 << pixelSize) - 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = pixels[y * width + x] | 0;
      let r = 0, g = 0, b = 0, a = 255;

      if (transparentIndex !== null && idx === transparentIndex) {
        a = 0;
      } else if (palette && palette.length > 0 && idx < palette.length) {
        const p = palette[idx];
        r = p.r; g = p.g; b = p.b;
      } else if (pixelSize === 8 && (!palette || palette.length === 0)) {
        [r, g, b] = palm8BitIndexToRGB(idx);
      } else {
        let val = 0;
        if (pixelSize === 1) {
          val = idx ? 0 : 255;
        } else if (pixelSize === 2) {
          const l = Math.round(255 * (1 - idx / 3));
          val = l;
        } else if (pixelSize === 4) {
          const l = Math.round(255 * (1 - idx / 15));
          val = l;
        } else {
          const l = Math.round(255 * (1 - idx / Math.max(1, maxIndex)));
          val = l;
        }
        r = g = b = val;
      }

      const baseX = x * scale;
      const baseY = y * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (baseY + dy) * newWidth + (baseX + dx);
          const off = px * 4;
          out[off] = r;
          out[off + 1] = g;
          out[off + 2] = b;
          out[off + 3] = a;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
};

const BitmapCanvas: React.FC<{ bitmap?: TAIBBitmap }> = ({ bitmap }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      drawTAIBBitmap(canvasRef.current, bitmap);
    }
  }, [bitmap]);

  const cssWidth = (bitmap?.width ?? PLACEHOLDER_SIZE) * 2;
  const cssHeight = (bitmap?.height ?? PLACEHOLDER_SIZE) * 2;

  return <canvas ref={canvasRef} style={{ width: cssWidth, height: cssHeight }} />;
};


const dbStg = new WebDatabaseStorageImplementation();

export function InstallAppPanel(props: PaperProps) {
  const [hasValidUser, setHasValidUser] = useState<boolean>(true);
  const [filenames, setFilenames] = useState<string[]>([]);
  const [databasesState, setDatabasesState] = useState<
    (RawPdbDatabase | RawPrcDatabase)[]
  >([]);

  async function renderFiles() {
    const deviceName = prefsStore.get("selectedDevice") as string;

    try {
      let { databases, filenames } = await dbStg.getDatabasesFromInstallList(
        deviceName
      );

      setFilenames(filenames);
      setDatabasesState(databases);
      setHasValidUser(true);
    } catch (error) {
      setHasValidUser(false);
      setFilenames([]);
      setDatabasesState([]);
    }
  }

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      const validFiles = files.filter(
        (file) => file.name.endsWith(".prc") || file.name.endsWith(".pdb")
      );

      const deviceName = prefsStore.get("selectedDevice") as string;

      for (const file of validFiles) {
        await dbStg.putDatabaseInInstallList(deviceName, file);
      }

      renderFiles();
    }
  };

  const handleRemoveFile = async (index: number) => {
    const deviceName = prefsStore.get("selectedDevice") as string;
    await dbStg.removeDatabaseBeforeInstallFromList(
      deviceName,
      filenames[index]
    );
    renderFiles();
  };

  useEffect(() => {
    renderFiles();

    const refreshScreen = () => {
      renderFiles();
    };

    hotsyncEvents.on(HotsyncEvents.HotsyncFinished, refreshScreen);
    hotsyncEvents.on(HotsyncEvents.HotsyncUserChanged, refreshScreen);

    return () => {
      hotsyncEvents.off(HotsyncEvents.HotsyncFinished, refreshScreen);
      hotsyncEvents.off(HotsyncEvents.HotsyncUserChanged, refreshScreen);
    };
  }, []);

  return (
    <Panel
      title="Install list"
      isExpandedByDefault={true}
      {...props}
      sx={{ width: "100%" }}
    >
      <Box>
        <Box p={2}>
          <Button
            variant="contained"
            component="label"
            disabled={!hasValidUser}
          >
            Select Files
            <input
              type="file"
              hidden
              onChange={handleFileChange}
              multiple
              accept=".prc,.pdb"
            />
          </Button>
        </Box>

        {!hasValidUser && (
          <div
            style={{
              display: "grid",
              placeContent: "center",
              textAlign: "center",
              padding: "2em",
            }}
          >
            <Typography variant="h5" gutterBottom>
              That's a new device! 🎉
            </Typography>
            <Typography variant="body1">
              Please hotsync it first before installing new software.
            </Typography>
          </div>
        )}

        <List>
          {databasesState.map((db, index) => {
            // derive everything from the database object we have here
            const appName = db?.header?.name ?? "Loading...";
            // filenames array is expected to be in same order as databases
            const filename = filenames[index] ?? "";
            // extract bitmap on-the-fly from the database (safe — extractor returns placeholder on failure)
            const bitmap = extractTAIBResource(db);

            return (
              <ListItem
                key={`${filename}-${index}`}
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={() => handleRemoveFile(index)}
                  >
                    <DeleteIcon />
                  </IconButton>
                }
              >
                <ListItemIcon style={{
                  marginInlineEnd: "1em"
                }}>
                  <BitmapCanvas bitmap={bitmap} />
                </ListItemIcon>
                <ListItemText primary={appName} secondary={filename} />
              </ListItem>
            );
          })}
        </List>
      </Box>
    </Panel>
  );
}