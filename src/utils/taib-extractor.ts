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
    pixelSize: number;
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
    pixelSize: 1,
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

function pickDensity(width: number, height: number, flags: number): number {
    if ((flags & 0x08) !== 0) return 144;
    if (width >= 33 || height >= 33) return 108;
    return 72;
}

function scoreBitmapForSorting(b: TAIBBitmap): number {
    const densityScore = b.density ?? 72;
    const versionScore = b.version;
    const pixelSizeScore = b.pixelSize;
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

    const width = dataView.getUint16(offset, false);
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

    try {
        if (version === 0) {
            nextOffsetDelta = 0;
        } else if (version === 1) {
            if (pixelSize === 255) return null;
            nextOffsetDelta = dataView.getUint16(offset + 10, false) * 4;
        } else if (version === 2) {
            nextOffsetDelta = dataView.getUint16(offset + 10, false) * 4;
            transparentIndex = dataView.getUint8(offset + 12);
            compressionType = dataView.getUint8(offset + 13);
        } else if (version === 3) {
            headerSize = Math.max(24, dataView.getUint8(offset + 10));
            compressionType = dataView.getUint8(offset + 13);
            const transparentValue = dataView.getUint32(offset + 16, false);
            transparentIndex = pixelSize <= 8 ? (transparentValue & 0xff) : transparentValue;
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
    const density = pickDensity(width, height, flags);

    let dataStart = startOffset + headerSize;
    let palette: PaletteEntry[] | undefined = undefined;

    if (hasColorTable) {
        if (dataStart + 2 > dataView.byteLength) return null;

        const colorCount = dataView.getUint16(dataStart, false);
        dataStart += 2;
        palette = [];

        for (let i = 0; i < colorCount; i++) {
            if (dataStart + 4 > dataView.byteLength) return null;
            dataStart++; // internal index / padding byte
            palette.push({
                r: dataView.getUint8(dataStart++),
                g: dataView.getUint8(dataStart++),
                b: dataView.getUint8(dataStart++)
            });
        }
    }

    let cbDst = nextOffsetDelta > 0
        ? nextOffsetDelta - (dataStart - startOffset)
        : dataView.byteLength - dataStart;

    if (cbDst < 0) cbDst = dataView.byteLength - dataStart;

    let pixelsPacked: Uint8Array | null = null;

    if (isCompressed) {
        let compressedBytesLen = cbDst;
        let compressedStart = dataStart;

        if (version === 3) {
            if (dataStart + 4 <= dataView.byteLength) {
                const len = dataView.getUint32(dataStart, false);
                if (len >= 4 && len <= cbDst) {
                    compressedBytesLen = len - 4;
                    compressedStart = dataStart + 4;
                }
            }
        } else {
            if (dataStart + 2 <= dataView.byteLength) {
                const len = dataView.getUint16(dataStart, false);
                if (len >= 2 && len <= cbDst) {
                    compressedBytesLen = len - 2;
                    compressedStart = dataStart + 2;
                }
            }
        }

        if (compressedStart + compressedBytesLen > dataView.byteLength) return null;

        const compressed = new Uint8Array(
            resourceBytes.buffer,
            resourceBytes.byteOffset + compressedStart,
            compressedBytesLen
        );

        const comp = compressionType ?? 0;

        if (comp === 0) {
            pixelsPacked = decompressScanline(compressed, rowBytes, height);
        } else if (comp === 1) {
            pixelsPacked = decompressRLE(compressed, rowBytes, height);
        } else if (comp === 2) {
            pixelsPacked = decompressPackBits(compressed, rowBytes, height);
        } else {
            return null;
        }
    } else {
        const dataLen = rowBytes * height;
        if (dataStart + dataLen <= dataView.byteLength) {
            pixelsPacked = new Uint8Array(
                resourceBytes.buffer,
                resourceBytes.byteOffset + dataStart,
                dataLen
            );
        }
    }

    if (!pixelsPacked) return null;

    const pixels = unpackPixels(pixelsPacked, pixelSize, width, height, rowBytes);

    if (pixels.length !== width * height) return null;

    return {
        bitmap: {
            width,
            height,
            rowBytes,
            flags,
            pixelSize,
            version,
            transparentIndex: hasTransparency ? transparentIndex : null,
            compressionType,
            density,
            pixels,
            palette
        },
        endOffset: nextOffsetDelta > 0 ? startOffset + nextOffsetDelta : dataView.byteLength
    };
}

function collectBitmapsByScanning(resourceBytes: Uint8Array): TAIBBitmap[] {
    const candidates: Array<{ offset: number; bitmap: TAIBBitmap }> = [];
    const seenOffsets = new Set<number>();

    // First try the old linear interpretation from offset 0.
    let linearOffset = 0;
    let loopGuard = 0;
    while (linearOffset + 10 <= resourceBytes.byteLength && loopGuard++ < 1000) {
        const parsed = tryParseTAIBAtOffset(resourceBytes, linearOffset);
        if (!parsed) break;

        if (!seenOffsets.has(linearOffset)) {
            seenOffsets.add(linearOffset);
            candidates.push({ offset: linearOffset, bitmap: parsed.bitmap });
        }

        if (parsed.endOffset <= linearOffset || parsed.endOffset > resourceBytes.byteLength) {
            break;
        }

        // If the next block doesn't look sane, let the full scan pick up the rest.
        linearOffset = parsed.endOffset;
    }

    // Full fallback scan: this is what recovers the missing density/depth variants.
    for (let offset = 0; offset + 10 <= resourceBytes.byteLength; offset += 2) {
        if (seenOffsets.has(offset)) continue;

        const parsed = tryParseTAIBAtOffset(resourceBytes, offset);
        if (!parsed) continue;

        seenOffsets.add(offset);
        candidates.push({ offset, bitmap: parsed.bitmap });
    }

    candidates.sort((a, b) => {
        const sa = scoreBitmapForSorting(a.bitmap);
        const sb = scoreBitmapForSorting(b.bitmap);
        if (sb !== sa) return sb - sa;
        return a.offset - b.offset;
    });

    // Deduplicate by visible identity, preferring the earliest occurrence.
    const out: TAIBBitmap[] = [];
    const seenKeys = new Set<string>();

    for (const c of candidates) {
        const key = [
            c.bitmap.width,
            c.bitmap.height,
            c.bitmap.rowBytes,
            c.bitmap.pixelSize,
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
        if (db !== da) return db - da;
        if (b.version !== a.version) return b.version - a.version;
        if (b.pixelSize !== a.pixelSize) return b.pixelSize - a.pixelSize;
        return (b.width * b.height) - (a.width * a.height);
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