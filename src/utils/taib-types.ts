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

export interface TAIBBitmapCollection {
    bitmaps: TAIBBitmap[];
}