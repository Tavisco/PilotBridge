export class PalmBinaryReader {
    private readonly bytes: Uint8Array;
    private readonly view: DataView;

    constructor(data: Uint8Array | ArrayBuffer) {
        this.bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        this.view = new DataView(
            this.bytes.buffer,
            this.bytes.byteOffset,
            this.bytes.byteLength
        );
    }

    get length() {
        return this.bytes.length;
    }

    u8(offset: number): number {
        return offset < 0 || offset >= this.length ? 0 : this.view.getUint8(offset);
    }

    i16be(offset: number): number {
        return offset < 0 || offset + 2 > this.length ? 0 : this.view.getInt16(offset, false);
    }

    u16be(offset: number): number {
        return offset < 0 || offset + 2 > this.length ? 0 : this.view.getUint16(offset, false);
    }

    u32be(offset: number): number {
        return offset < 0 || offset + 4 > this.length ? 0 : this.view.getUint32(offset, false);
    }
}