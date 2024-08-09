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
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { DlpReadUserInfoRespType } from "palm-sync";
import { RawPdbDatabase, RawPrcDatabase, RsrcEntryType } from "palm-pdb";
import { Panel } from "../panel";
import { WebDatabaseStorageImplementation } from "../database-storage/web-db-stg-impl";

interface TAIBBitmap {
  width: number;
  height: number;
  rowBytes: number;
  flags: number;
  pixelSize: number;
  version: number;
  transparentIndex?: number;
  compressionType?: number;
  data: Uint8Array;
}

const extractTAIBResource = (
  rawDb: RawPdbDatabase | RawPrcDatabase
): TAIBBitmap => {
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
    return {
      width: 0,
      height: 0,
      rowBytes: 0,
      flags: 0,
      pixelSize: 0,
      version: 0,
      transparentIndex: 0,
      compressionType: 0,
      data: new Uint8Array(),
    }; // No "tAIB" resource found.
  }

  let dataView = new DataView(element.data.buffer);
  let arrayBuffer = element.data.buffer;

  const bitmaps: TAIBBitmap[] = [];

  let offset = 0;
  while (offset < arrayBuffer.byteLength) {
    const width = dataView.getUint16(offset, false);
    const height = dataView.getUint16(offset + 2, false);
    const rowBytes = dataView.getUint16(offset + 4, false);
    const flags = dataView.getUint16(offset + 6, false);
    const pixelSize = dataView.getUint8(offset + 8);
    const version = dataView.getUint8(offset + 9);
    const nextDepthOffset = dataView.getUint16(offset + 10, false);

    let transparentIndex: number | undefined;
    let compressionType: number | undefined;

    if (version >= 2) {
      transparentIndex = dataView.getUint8(offset + 12);
      compressionType = dataView.getUint8(offset + 13);
    }

    const bitmapHeaderSize = version >= 2 ? 16 : 12;
    const dataStart = offset + bitmapHeaderSize;
    const dataLength = rowBytes * height;

    const data = new Uint8Array(arrayBuffer, dataStart, dataLength);

    return {
      width,
      height,
      rowBytes,
      flags,
      pixelSize,
      version,
      transparentIndex,
      compressionType,
      data,
    };

    // Early return to only get the first bitmap because
    // the rest of the code is not prepared to handle
    // multiple images
    // return { bitmaps };

    // offset += bitmapHeaderSize + dataLength;

    // if (nextDepthOffset === 0) {
    //   break;
    // }

    // Update offset to the next bitmap's header
    // offset = dataStart + nextDepthOffset * 4;
  }

  return {
    width: 0,
    height: 0,
    rowBytes: 0,
    flags: 0,
    pixelSize: 0,
    version: 0,
    transparentIndex: 0,
    compressionType: 0,
    data: new Uint8Array(),
  };
  // console.log(bitmaps);

  // return { bitmaps };
};

const drawTAIBBitmap = (canvas: HTMLCanvasElement, bitmap: TAIBBitmap) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height, rowBytes, pixelSize, data } = bitmap;

  // Set canvas size to be double the size of the original bitmap
  const newWidth = width * 2;
  const newHeight = height * 2;
  canvas.width = newWidth;
  canvas.height = newHeight;

  // Create a scaled image data object
  const imageData = ctx.createImageData(newWidth, newHeight);
  const pixels = imageData.data;

  // Iterate over the bitmap data and scale it
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byteIndex = y * rowBytes + Math.floor(x / 8);
      const bitIndex = 7 - (x % 8);

      const color = data[byteIndex] & (1 << bitIndex) ? 0 : 255;

      // Calculate the corresponding position in the scaled canvas
      const newX = x * 2;
      const newY = y * 2;

      // Set the pixel values for the 2x2 block
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const pixelIndex = ((newY + dy) * newWidth + (newX + dx)) * 4;
          pixels[pixelIndex] = color;
          pixels[pixelIndex + 1] = color;
          pixels[pixelIndex + 2] = color;
          pixels[pixelIndex + 3] = 255; // Alpha channel
        }
      }
    }
  }

  // Put the scaled image data onto the canvas
  ctx.putImageData(imageData, 0, 0);
};

const BitmapCanvas: React.FC<{ bitmap: TAIBBitmap }> = ({ bitmap }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      drawTAIBBitmap(canvasRef.current, bitmap);
    }
  }, [bitmap]);

  return <canvas ref={canvasRef}></canvas>;
};

export function InstallAppPanel(props: PaperProps) {
  const [filenames, setFilenames] = useState<string[]>([]);
  const [appNames, setAppNames] = useState<string[]>([]);
  const [bitmaps, setBitmaps] = useState<TAIBBitmap[]>([]);

  // const [databases, setDatabases] = useState<{[filename: string]: RawPdbDatabase | RawPrcDatabase}>({});

  const dbStg = new WebDatabaseStorageImplementation();

  async function renderFiles() {
    const asdf = new DlpReadUserInfoRespType();
    asdf.userName = "TaviscoVisor";
    let { databases, filenames } = await dbStg.getDatabasesFromInstallList(
      asdf
    );

    setAppNames(databases.flatMap((db) => db.header.name));
    setFilenames(filenames);
    setBitmaps(databases.flatMap((db) => extractTAIBResource(db)));
  }

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      const validFiles = files.filter(
        (file) => file.name.endsWith(".prc") || file.name.endsWith(".pdb")
      );

      for (const file of validFiles) {
        await dbStg.putDatabaseInInstallList("TaviscoVisor", file);
      }

      renderFiles();
    }
  };

  const handleRemoveFile = async (index: number) => {
    await dbStg.removeDatabaseBeforeInstallFromList(
      "TaviscoVisor",
      filenames[index]
    );
    renderFiles();
  };

  useEffect(() => {
    renderFiles();
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
          <Button variant="contained" component="label">
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
        <List>
          {appNames.map((appName, index) => (
            <ListItem
              key={index}
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
              <ListItemIcon>
                <BitmapCanvas key={index} bitmap={bitmaps[index]} />
              </ListItemIcon>
              <ListItemText
                primary={`${appName || "Loading..."}`}
                secondary={`${filenames[index]}`}
              />
            </ListItem>
          ))}
        </List>
      </Box>
    </Panel>
  );
}
