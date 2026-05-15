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
    pixels: new Uint8Array(PLACEHOLDER_SIZE * PLACEHOLDER_SIZE),
    palette: undefined,
};

function decompressScanline(compressed: Uint8Array, rowBytes: number, height: number): Uint8Array {
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

function decompressRLE(compressed: Uint8Array, rowBytes: number, height: number): Uint8Array {
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

function decompressPackBits(compressed: Uint8Array, rowBytes: number, height: number): Uint8Array {
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

function unpackPixels(packed: Uint8Array, pixelSize: number, width: number, height: number, rowBytes: number): Uint8Array {
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
                if (x >= width) break outer;
                pixels[y * width + x] = val;
                px++;
            }
        }
    }
    return pixels;
}

export const extractTAIBResource = (rawDb: RawPdbDatabase | RawPrcDatabase): TAIBBitmap => {
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
        return placeholderBitmap;
    }

    const dataView = new DataView(element.data.buffer, element.data.byteOffset, element.data.byteLength);
    let offset = 0;
    const candidates: any[] = [];
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
                // Legacy v0 parsing fallback structure mapping
                nextOffsetDelta = 0;
            } else if (version === 1) {
                if (pixelSize === 255) { offset += 16; continue; }
                nextOffsetDelta = dataView.getUint16(offset + 10, false) * 4;
            } else if (version === 2) {
                nextOffsetDelta = dataView.getUint16(offset + 10, false) * 4;
                transparentIndex = dataView.getUint8(offset + 12);
                compressionType = dataView.getUint8(offset + 13);
            } else if (version === 3) {
                headerSize = Math.max(24, dataView.getUint8(offset + 10));
                compressionType = dataView.getUint8(offset + 13);

                // Extract 32-bit transparentValue; parse lower byte for indexed sizes
                const transparentValue = dataView.getUint32(offset + 16, false);
                transparentIndex = pixelSize <= 8 ? (transparentValue & 0xFF) : transparentValue;

                nextOffsetDelta = dataView.getUint32(offset + 20, false);
            } else {
                break;
            }

            const hasColorTable = Boolean(flags & PilHasColorTable);
            const isCompressed = Boolean(flags & PilCompressed);
            const hasTransparency = Boolean(flags & PilTransparent);
            const densityMode = (flags & 0x08) !== 0 ? "double" : "single";

            let dataStart = startOffset + headerSize;
            let palette: PaletteEntry[] | undefined = undefined;
            let paletteLen = 0;

            if (hasColorTable) {
                const colorCount = dataView.getUint16(dataStart, false);
                dataStart += 2;
                palette = [];
                for (let i = 0; i < colorCount; i++) {
                    dataStart++; // Advance past internal index padding flag field
                    palette.push({
                        r: dataView.getUint8(dataStart++),
                        g: dataView.getUint8(dataStart++),
                        b: dataView.getUint8(dataStart++)
                    });
                }
                paletteLen = palette.length;
            }

            let cbDst = nextOffsetDelta > 0 ? nextOffsetDelta - (dataStart - startOffset) : dataView.byteLength - dataStart;
            if (cbDst < 0) cbDst = dataView.byteLength - dataStart;

            let pixelsPacked: Uint8Array | null = null;
            if (isCompressed) {
                let compressedBytesLen = cbDst;
                let compressedStart = dataStart;

                // Version 3 uses a 32-bit compressed length prefix instead of a 16-bit word
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

                const bufferOffset = element.data.byteOffset + compressedStart;
                const compressed = new Uint8Array(element.data.buffer, bufferOffset, compressedBytesLen);
                const comp = compressionType ?? 0;

                if (comp === 0) pixelsPacked = decompressScanline(compressed, rowBytes, height);
                else if (comp === 1) pixelsPacked = decompressRLE(compressed, rowBytes, height);
                else if (comp === 2) pixelsPacked = decompressPackBits(compressed, rowBytes, height);
            } else {
                const dataLen = rowBytes * height;
                if (dataStart + dataLen <= dataView.byteLength) {
                    pixelsPacked = new Uint8Array(element.data.buffer, element.data.byteOffset + dataStart, dataLen);
                }
            }

            if (pixelsPacked) {
                const pixels = unpackPixels(pixelsPacked, pixelSize, width, height, rowBytes);
                if (width > 0 && height > 0 && pixels.length === width * height) {
                    candidates.push({
                        bitmap: {
                            width,
                            height,
                            rowBytes,
                            flags,
                            pixelSize,
                            version,
                            transparentIndex: hasTransparency ? transparentIndex : null,
                            compressionType,
                            pixels,
                            palette
                        },
                        pixelSize, paletteLen, version, offset: startOffset, density: densityMode,
                    });
                }
            }

            if (nextOffsetDelta <= 0) break;
            offset = startOffset + nextOffsetDelta;

        } catch (err) {
            console.error("[tAIB] exception parsing depth", err);
            break;
        }
    }

    if (candidates.length === 0) return placeholderBitmap;

    candidates.sort((a, b) => {
        if (b.version !== a.version) return b.version - a.version;
        if (b.pixelSize !== a.pixelSize) return b.pixelSize - a.pixelSize;
        return (b.bitmap.width * b.bitmap.height) - (a.bitmap.width * a.bitmap.height);
    });

    return candidates[0].bitmap;
};