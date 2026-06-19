export interface ResourceRecord {
    entry: {
        type: string;
        resourceId: number;
        localChunkId?: number;
    };
    data: Uint8Array | number[] | ArrayBuffer;
}

export interface RectLike {
    x: number;
    y: number;
    w: number;
    h: number;
}