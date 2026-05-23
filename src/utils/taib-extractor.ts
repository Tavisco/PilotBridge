import { RawPdbDatabase, RawPrcDatabase, RsrcEntryType } from "palm-pdb";

export interface PaletteEntry {
    r: number;
    g: number;
    b: number;
}

export interface TAIBBitmap {
    width: number;
    height: number;
    rowBytes: number;
    flags: number;
    bpp: number;
    version: number;
    transparentIndex?: number | null;
    compressionType?: number | null;
    density?: number | null;
    pixels: Uint8Array;
    palette?: PaletteEntry[];
}

const PilCompressed = 0x8000;
const PilHasColorTable = 0x4000;
const PilTransparent = 0x2000;

const ENABLE_TAIB_DEBUG = true;

export const PLACEHOLDER_SIZE = 22;

export const placeholderBitmap: TAIBBitmap = {
    width: PLACEHOLDER_SIZE,
    height: PLACEHOLDER_SIZE,
    rowBytes: 3,
    flags: 0,
    bpp: 1,
    version: 1,
    transparentIndex: null,
    compressionType: null,
    density: 72,
    pixels: new Uint8Array(PLACEHOLDER_SIZE * PLACEHOLDER_SIZE),
    palette: undefined,
};

function dbg(...args: any[]) {
    if (ENABLE_TAIB_DEBUG) {
        console.debug("[tAIB]", ...args);
    }
}

export function toUint8Array(
    input: Uint8Array | ArrayBuffer | ArrayBufferView | number[] | Buffer
): Uint8Array {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    return Uint8Array.from(input);
}

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
            if (p >= compressed.length) return out;

            const db = compressed[p++];
            for (let rbi = 0; rbi < 8 && sli + rbi < rowBytes; rbi++) {
                const bit = 1 << (7 - rbi);
                if (db & bit) {
                    cur[sli + rbi] = (p >= compressed.length) ? 0 : compressed[p++];
                } else {
                    cur[sli + rbi] = prev[sli + rbi];
                }
            }
            sli += 8;
        }
        out.set(cur.subarray(0, rowBytes), r * rowBytes);
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
            if (p + 1 >= compressed.length) return out;
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

function decompressPackBits(
    compressed: Uint8Array,
    rowBytes: number,
    height: number
): Uint8Array {
    const out = new Uint8Array(rowBytes * height);
    let p = 0;
    let dest = 0;
    const totalBytes = rowBytes * height;

    while (dest < totalBytes && p < compressed.length) {
        const n = compressed[p++];
        if (n >= 128) {
            const count = 257 - n;
            if (p >= compressed.length) break;
            const val = compressed[p++];
            for (let i = 0; i < count && dest < totalBytes; i++) {
                out[dest++] = val;
            }
        } else {
            const count = n + 1;
            for (let i = 0; i < count && dest < totalBytes; i++) {
                if (p >= compressed.length) break;
                out[dest++] = compressed[p++];
            }
        }
    }
    return out;
}

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
        outer: for (let b = 0; b < rowBytes; b++) {
            const byte = packed[rowOffset + b];
            for (let i = 0; i < pixelsPerByte; i++) {
                const shift = 8 - pixelSize * (i + 1);
                const val = (byte >> shift) & mask;
                const x = b * pixelsPerByte + i;
                if (x >= width) break outer;
                pixels[y * width + x] = val;
            }
        }
    }
    return pixels;
}

function normalizeDensity(raw: number): 72 | 108 | 144 {
    if (raw === 72 || raw === 108 || raw === 144) return raw;
    if (raw === 1) return 72;   // PilRC normalizes "1" to single density
    if (raw === 2) return 144;  // PilRC normalizes "2" to double density
    return 72;
}

function scoreBitmapForSorting(b: TAIBBitmap): number {
    const densityScore = b.density ?? 72;
    const versionScore = b.version;
    const pixelSizeScore = b.bpp;
    const areaScore = b.width * b.height;
    return (densityScore * 1_000_000) + (versionScore * 10_000) + (pixelSizeScore * 100) + areaScore;
}

function isPlausibleHeader(
    width: number,
    height: number,
    rowBytes: number,
    pixelSize: number,
    version: number
): boolean {
    if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(rowBytes)) return false;
    if (width <= 0 || height <= 0 || rowBytes <= 0) return false;
    if (width > 1024 || height > 1024 || rowBytes > 8192) return false;

    // Keep support for the depths we know the app needs.
    if (![1, 2, 4, 8].includes(pixelSize)) return false;
    if (![0, 1, 2, 3].includes(version)) return false;

    const minRowBytes = Math.ceil((width * pixelSize) / 8);
    if (rowBytes < minRowBytes) return false;

    return true;
}

function tryParseTAIBAtOffset(
    resourceBytes: Uint8Array,
    offset: number
): { bitmap: TAIBBitmap; endOffset: number } | null {
    const dataView = new DataView(
        resourceBytes.buffer,
        resourceBytes.byteOffset,
        resourceBytes.byteLength
    );

    if (offset + 10 > dataView.byteLength) return null;

    const startOffset = offset;

    const width = dataView.getUint16(offset + 0, false);
    const height = dataView.getUint16(offset + 2, false);
    const rowBytes = dataView.getUint16(offset + 4, false);
    const flags = dataView.getUint16(offset + 6, false);
    const pixelSize = dataView.getUint8(offset + 8);
    const version = dataView.getUint8(offset + 9);

    if (!isPlausibleHeader(width, height, rowBytes, pixelSize, version)) {
        return null;
    }

    let transparentIndex: number | null = null;
    let compressionType: number | null = null;
    let headerSize = 16;
    let nextOffsetDelta = 0;

    // IMPORTANT:
    // Density is NOT inferred from dimensions or flags.
    // PilRC stores it explicitly only in v3 headers.
    let density: 72 | 108 | 144 = 72;

    try {
        if (version === 0) {
            // BitmapType
            headerSize = 16;
            nextOffsetDelta = 0;
            density = 72;

        } else if (version === 1) {
            // BitmapTypeV1
            if (offset + 12 > dataView.byteLength) return null;

            headerSize = 16;

            if (pixelSize === 255) return null;

            nextOffsetDelta = dataView.getUint16(offset + 10, false) * 4;

            density = 72;

        } else if (version === 2) {
            // BitmapTypeV2
            if (offset + 14 > dataView.byteLength) return null;

            headerSize = 16;

            nextOffsetDelta = dataView.getUint16(offset + 10, false) * 4;

            transparentIndex = dataView.getUint8(offset + 12);
            compressionType = dataView.getUint8(offset + 13);

            density = 72;

        } else if (version === 3) {
            // BitmapTypeV3
            if (offset + 24 > dataView.byteLength) return null;

            const rawHeaderSize = dataView.getUint8(offset + 10);

            // PilRC emits at least 24-byte v3 headers
            headerSize = Math.max(24, rawHeaderSize || 24);

            if (offset + headerSize > dataView.byteLength) return null;

            // offset + 11 = pixelFormat
            // offset + 12 = unused / reserved

            compressionType = dataView.getUint8(offset + 13);

            // REAL density field
            const rawDensity = dataView.getUint16(offset + 14, false);
            density = normalizeDensity(rawDensity);

            const transparentValue = dataView.getUint32(offset + 16, false);

            transparentIndex =
                pixelSize <= 8
                    ? (transparentValue & 0xff)
                    : transparentValue;

            nextOffsetDelta = dataView.getUint32(offset + 20, false);

        } else {
            return null;
        }
    } catch {
        return null;
    }

    const hasColorTable = Boolean(flags & PilHasColorTable);
    const isCompressed = Boolean(flags & PilCompressed);
    const hasTransparency = Boolean(flags & PilTransparent);

    let dataStart = startOffset + headerSize;

    let palette: PaletteEntry[] | undefined = undefined;

    if (hasColorTable) {
        if (dataStart + 2 > dataView.byteLength) return null;

        const colorCount = dataView.getUint16(dataStart, false);
        dataStart += 2;

        palette = [];

        for (let i = 0; i < colorCount; i++) {
            if (dataStart + 4 > dataView.byteLength) return null;

            dataStart++; // index / padding byte

            palette.push({
                r: dataView.getUint8(dataStart++),
                g: dataView.getUint8(dataStart++),
                b: dataView.getUint8(dataStart++)
            });
        }
    }

    let cbDst =
        nextOffsetDelta > 0
            ? nextOffsetDelta - (dataStart - startOffset)
            : dataView.byteLength - dataStart;

    if (cbDst < 0) {
        cbDst = dataView.byteLength - dataStart;
    }

    let pixelsPacked: Uint8Array | null = null;

    if (isCompressed) {
        let compressedBytesLen = cbDst;
        let compressedStart = dataStart;

        if (version === 3) {
            // v3 compressed streams may be prefixed with a 32-bit length
            if (dataStart + 4 <= dataView.byteLength) {
                const len = dataView.getUint32(dataStart, false);

                if (len >= 4 && len <= cbDst) {
                    compressedBytesLen = len - 4;
                    compressedStart = dataStart + 4;
                }
            }
        } else {
            // older formats may use 16-bit length
            if (dataStart + 2 <= dataView.byteLength) {
                const len = dataView.getUint16(dataStart, false);

                if (len >= 2 && len <= cbDst) {
                    compressedBytesLen = len - 2;
                    compressedStart = dataStart + 2;
                }
            }
        }

        if (compressedStart + compressedBytesLen > dataView.byteLength) {
            return null;
        }

        const compressed = new Uint8Array(
            resourceBytes.buffer,
            resourceBytes.byteOffset + compressedStart,
            compressedBytesLen
        );

        const comp = compressionType ?? 0;

        if (comp === 0) {
            pixelsPacked = decompressScanline(
                compressed,
                rowBytes,
                height
            );
        } else if (comp === 1) {
            pixelsPacked = decompressRLE(
                compressed,
                rowBytes,
                height
            );
        } else if (comp === 2) {
            pixelsPacked = decompressPackBits(
                compressed,
                rowBytes,
                height
            );
        } else {
            return null;
        }

    } else {
        const dataLen = rowBytes * height;

        if (dataStart + dataLen > dataView.byteLength) {
            return null;
        }

        pixelsPacked = new Uint8Array(
            resourceBytes.buffer,
            resourceBytes.byteOffset + dataStart,
            dataLen
        );
    }

    if (!pixelsPacked) return null;

    const pixels = unpackPixels(
        pixelsPacked,
        pixelSize,
        width,
        height,
        rowBytes
    );

    if (pixels.length !== width * height) {
        return null;
    }

    return {
        bitmap: {
            width,
            height,
            rowBytes,
            flags,
            bpp: pixelSize,
            version,
            transparentIndex: hasTransparency
                ? transparentIndex
                : null,
            compressionType,
            density,
            pixels,
            palette
        },

        endOffset:
            nextOffsetDelta > 0
                ? startOffset + nextOffsetDelta
                : dataView.byteLength
    };
}

const PILRC_FAKE_BITMAP_HEADER_SIZE = 16;

function isPilrcFakeBitmapHeader(resourceBytes: Uint8Array, offset: number): boolean {
    if (offset + PILRC_FAKE_BITMAP_HEADER_SIZE > resourceBytes.byteLength) return false;

    const dv = new DataView(
        resourceBytes.buffer,
        resourceBytes.byteOffset,
        resourceBytes.byteLength
    );

    const width = dv.getUint16(offset + 0, false);
    const height = dv.getUint16(offset + 2, false);
    const rowBytes = dv.getUint16(offset + 4, false);
    const flags = dv.getUint16(offset + 6, false);
    const pixelSize = dv.getUint8(offset + 8);
    const version = dv.getUint8(offset + 9);

    // PilRC writes a zeroed RCBitmap header and only patches:
    // pixelsize = 255, version = 0x01 (68K) or 0x81 (LE32).
    return (
        width === 0 &&
        height === 0 &&
        rowBytes === 0 &&
        flags === 0 &&
        pixelSize === 255 &&
        (version === 0x01 || version === 0x81)
    );
}

function collectBitmapsByScanning(resourceBytes: Uint8Array): TAIBBitmap[] {
    const candidates: Array<{ offset: number; bitmap: TAIBBitmap }> = [];
    const visited = new Set<number>();

    let offset = 0;
    let guard = 0;

    while (offset + 10 <= resourceBytes.byteLength && guard++ < 2048) {
        if (visited.has(offset)) break;
        visited.add(offset);

        // PilRC inserts a fake header before the first non-single-density bitmap.
        if (isPilrcFakeBitmapHeader(resourceBytes, offset)) {
            offset += PILRC_FAKE_BITMAP_HEADER_SIZE;
            continue;
        }

        const parsed = tryParseTAIBAtOffset(resourceBytes, offset);
        if (!parsed) {
            // Deterministic PilRC resources should not require probing other offsets.
            break;
        }

        candidates.push({ offset, bitmap: parsed.bitmap });

        if (parsed.endOffset <= offset || parsed.endOffset > resourceBytes.byteLength) {
            break;
        }

        offset = parsed.endOffset;
    }

    candidates.sort((a, b) => {
        const sa = scoreBitmapForSorting(a.bitmap);
        const sb = scoreBitmapForSorting(b.bitmap);
        if (sb !== sa) return sb - sa;
        return a.offset - b.offset;
    });

    const out: TAIBBitmap[] = [];
    const seenKeys = new Set<string>();

    for (const c of candidates) {
        const key = [
            c.bitmap.width,
            c.bitmap.height,
            c.bitmap.rowBytes,
            c.bitmap.bpp,
            c.bitmap.version,
            c.bitmap.density ?? 72,
            c.bitmap.flags
        ].join(":");

        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        out.push(c.bitmap);
    }

    return out.sort((a, b) => {
        const da = a.density ?? 72;
        const db = b.density ?? 72;
        if (da !== db) return da - db;

        if (a.version !== b.version) return a.version - b.version;
        if (a.bpp !== b.bpp) return a.bpp - b.bpp;

        return (a.width * a.height) - (b.width * b.height);
    });
}

export function extractAllTAIBBitmapsFromResource(
    resourceData: Uint8Array | ArrayBuffer | ArrayBufferView | number[] | Buffer
): TAIBBitmap[] {
    const bytes = toUint8Array(resourceData);
    return collectBitmapsByScanning(bytes);
}

export function extractTAIBBitmapsFromDb(
    rawDb: RawPdbDatabase | RawPrcDatabase,
    resourceId?: number
): TAIBBitmap[] {
    for (let index = 0; index < rawDb.records.length; index++) {
        const record = rawDb.records[index];
        const entries = record.entry as RsrcEntryType;

        if (entries.type !== "tAIB") continue;
        if (resourceId !== undefined && entries.resourceId !== resourceId) continue;

        return extractAllTAIBBitmapsFromResource(record.data as any);
    }

    return [];
}

export function extractTAIBResourceById(
    rawDb: RawPdbDatabase | RawPrcDatabase,
    resourceId: number
): TAIBBitmap[] {
    return extractTAIBBitmapsFromDb(rawDb, resourceId);
}

/*
 * Backward-compatible API:
 * - Prefer the classic resource ID 1000
 * - Fall back to any tAIB resource if 1000 is absent
 * - Return the highest-density decoded bitmap as the single default
 */
export const extractTAIBResource = (
    rawDb: RawPdbDatabase | RawPrcDatabase
): TAIBBitmap => {
    let candidates = extractTAIBBitmapsFromDb(rawDb, 1000);

    if (candidates.length === 0) {
        for (const record of rawDb.records) {
            const entries = record.entry as RsrcEntryType;
            if (entries.type !== "tAIB") continue;
            candidates = extractAllTAIBBitmapsFromResource(record.data as any);
            if (candidates.length > 0) break;
        }
    }

    if (candidates.length === 0) {
        dbg("No tAIB resource found in database", rawDb?.header?.name);
        return placeholderBitmap;
    }

    candidates.sort((a, b) => {
        const sa = scoreBitmapForSorting(a);
        const sb = scoreBitmapForSorting(b);
        return sb - sa;
    });

    return candidates[0];
};