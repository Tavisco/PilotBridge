import { PalmBinaryReader } from "./palm-binary-reader";
import { toUint8Array } from "./taib-extractor"; // existing utility
import type { RectLike } from "./prc-types";

// --- helper: null‑terminated C string at absolute offset ---
export function readCStringAtOffset(reader: PalmBinaryReader, offset: number): string {
    let out = "";
    for (let i = offset; i < reader.length; i++) {
        const b = reader.u8(i);
        if (b === 0) break;
        if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) break;
        out += String.fromCharCode(b);
    }
    return out;
}

// --- struct parsers (68K big‑endian) ---
export function parseTitle(reader: PalmBinaryReader, offset: number) {
    const rect: RectLike = {
        x: reader.i16be(offset),
        y: reader.i16be(offset + 2),
        w: reader.i16be(offset + 4),
        h: reader.i16be(offset + 6),
    };
    const text = readCStringAtOffset(reader, offset + 12);
    return { rect, text };
}

export function parseLabel(reader: PalmBinaryReader, offset: number) {
    const id = reader.u16be(offset);
    const pos = { x: reader.i16be(offset + 2), y: reader.i16be(offset + 4) };
    const attrWord = reader.u16be(offset + 6);
    const font = reader.u8(offset + 8);
    const usable = (attrWord & 0x8000) !== 0;
    const text = readCStringAtOffset(reader, offset + 14);
    return { id, pos, font, text, usable };
}

export function parseControl(reader: PalmBinaryReader, offset: number) {
    const id = reader.u16be(offset);
    const rect: RectLike = {
        x: reader.i16be(offset + 2),
        y: reader.i16be(offset + 4),
        w: reader.i16be(offset + 6),
        h: reader.i16be(offset + 8),
    };
    const attrWord = reader.u16be(offset + 14);
    const style = reader.u8(offset + 16);
    const font = reader.u8(offset + 17);
    const group = reader.u8(offset + 18);

    const usable = !!(attrWord & 0x8000);
    const enabled = !!(attrWord & 0x4000);
    const visible = !!(attrWord & 0x2000);
    const on = !!(attrWord & 0x1000);
    const leftAnchor = !!(attrWord & 0x0800);
    const frame = (attrWord >> 8) & 0x07;

    const text = readCStringAtOffset(reader, offset + 20);
    return { id, rect, style, font, group, text, usable, enabled, visible, on, leftAnchor, frame };
}

export function parseFormBitmap(reader: PalmBinaryReader, offset: number) {
    const attrWord = reader.u16be(offset);
    const pos = { x: reader.i16be(offset + 2), y: reader.i16be(offset + 4) };
    const rscID = reader.u16be(offset + 6);
    const usable = !!(attrWord & 0x8000);
    return { pos, rscID, usable };
}

export function parseField(reader: PalmBinaryReader, offset: number) {
    const id = reader.u16be(offset);
    const rect: RectLike = {
        x: reader.i16be(offset + 2),
        y: reader.i16be(offset + 4),
        w: reader.i16be(offset + 6),
        h: reader.i16be(offset + 8),
    };
    // maxChars is at a fixed offset (see original comment)
    const maxChars = reader.u16be(offset + 28);
    return { id, rect, maxChars };
}

// --- helper string / formatting ---
export function escapeQuotedText(text: string): string {
    return text
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n");
}

export function fmtBounds(r: RectLike, container?: RectLike): string {
    const x = fmtCoord(r.x, r.w, container?.w, "x");
    const y = fmtCoord(r.y, r.h, container?.h, "y");
    const ww = r.w === 0 ? "AUTO" : String(r.w);
    const hh = r.h === 0 ? "AUTO" : String(r.h);
    return `(${x} ${y} ${ww} ${hh})`;
}

export function isPrintableAsciiByte(byte: number): boolean {
    return byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e);
}

export function extractAsciiRuns(bytes: Uint8Array, minLen = 3): string[] {
    const runs: string[] = [];
    let start = -1;
    const flush = (endExclusive: number) => {
        if (start < 0) return;
        const chunk = bytes.slice(start, endExclusive);
        let text = "",
            printable = 0;
        for (const b of chunk) {
            if (isPrintableAsciiByte(b)) {
                text += String.fromCharCode(b);
                printable++;
            }
        }
        if (printable >= minLen) {
            const trimmed = text.replace(/\s+/g, " ").trim();
            if (trimmed) runs.push(trimmed);
        }
        start = -1;
    };
    for (let i = 0; i < bytes.length; i++) {
        if (isPrintableAsciiByte(bytes[i])) {
            if (start < 0) start = i;
        } else flush(i);
    }
    flush(bytes.length);
    return Array.from(new Set(runs));
}

export function kindName(kind: number): string {
    switch (kind) {
        case 0: return "frmFieldObj";
        case 1: return "frmControlObj";
        case 2: return "frmListObj";
        case 3: return "frmTableObj";
        case 4: return "frmBitmapObj";
        case 5: return "frmLineObj";
        case 6: return "frmFrameObj";
        case 7: return "frmRectangleObj";
        case 8: return "frmLabelObj";
        case 9: return "frmTitleObj";
        case 10: return "frmPopupObj";
        case 11: return "frmGraffitiStateObj";
        case 12: return "frmGadgetObj";
        case 13: return "frmScrollBarObj";
        case 14: return "frmSliderObj";
        case 15: return "frmGraphicalControlObj";
        default: return `unknown(${kind})`;
    }
}

export function formatHexView(bytes: Uint8Array): string {
    if (bytes.length === 0) return "EMPTY BUFFER";
    const out: string[] = [];
    for (let i = 0; i < bytes.length; i += 16) {
        const chunk = bytes.slice(i, i + 16);
        out.push(
            Array.from(chunk)
                .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
                .join(" ")
        );
    }
    return out.join("\n");
}

function fmtCoord(value: number, extent: number, containerExtent: number | undefined, axis: "x" | "y"): string {
    if (containerExtent == null) return String(value);

    // PilRC can resolve CENTER / RIGHT / BOTTOM. We can recover those
    // when the stored coordinates match the resolved result.
    // if (extent > 0 && value === Math.floor((containerExtent - extent) / 2)) {
    //     return "CENTER";
    // }
    // if (extent > 0 && value === containerExtent - extent) {
    //     return axis === "x" ? "RIGHT" : "BOTTOM";
    // }
    return String(value);
}

function parseFormHeader68K(reader: PalmBinaryReader) {
    const windowFlags = reader.u16be(0x08);

    return {
        formId: reader.u16be(0x28),
        bounds: {
            x: reader.i16be(0x0A),
            y: reader.i16be(0x0C),
            w: reader.i16be(0x0E),
            h: reader.i16be(0x10),
        },
        frameWidth: reader.u8(0x1F),
        modal: (windowFlags & 0x2000) !== 0,
        defaultBtnId: reader.u16be(0x38),
        helpRscId: reader.u16be(0x3A),
        menuRscId: reader.u16be(0x3C),
        numObjects: reader.u16be(0x3E),

        usable: (reader.u16be(0x2A) & 0x8000) !== 0,
        saveBehind: (reader.u16be(0x2A) & 0x0800) !== 0,
    };
}

// --- main tFRM decompiler ---
export function decodeTFRM(
    data: Uint8Array | number[] | ArrayBuffer,
    resourceId: number
): string {
    const bytes = toUint8Array(data);
    const reader = new PalmBinaryReader(bytes);

    const form = parseFormHeader68K(reader);

    const lines: string[] = [];
    lines.push(`FORM ID ${resourceId} AT ${fmtBounds(form.bounds)}`);

    if (form.frameWidth > 0) lines.push("\tFRAME");
    if (form.modal) lines.push("\tMODAL");
    if (form.defaultBtnId > 0) lines.push(`\tDEFAULTBTNID ${form.defaultBtnId}`);
    if (form.helpRscId > 0) lines.push(`\tHELPID ${form.helpRscId}`);
    if (form.menuRscId > 0) lines.push(`\tMENUID ${form.menuRscId}`);

    // Do not print defaults unless they are explicitly disabled.
    if (!form.usable) lines.push("\tNONUSABLE");
    if (!form.saveBehind) lines.push("\tNOSAVEBEHIND");

    lines.push("BEGIN");

    const dirStart = 0x44;
    const dirEntrySize = 6;
    const objects: { type: number; offset: number }[] = [];

    for (let i = 0; i < form.numObjects; i++) {
        const entryOffset = dirStart + i * dirEntrySize;
        objects.push({
            type: reader.u8(entryOffset),
            offset: reader.u32be(entryOffset + 2),
        });
    }

    for (const obj of objects) {
        let line = "";
        switch (obj.type) {
            case 9: {
                const t = parseTitle(reader, obj.offset);
                line = `TITLE "${escapeQuotedText(t.text)}"`;
                break;
            }
            case 8: {
                const l = parseLabel(reader, obj.offset);
                const parts = [
                    `LABEL "${escapeQuotedText(l.text)}"`,
                    `ID ${l.id}`,
                    `AT (${l.pos.x} ${l.pos.y})`,
                ];
                if (l.font > 0) parts.push(`FONT ${l.font}`);
                line = parts.join(" ");
                break;
            }
            case 0: {
                const c = parseControl(reader, obj.offset);
                const parts = [
                    `FIELD `,
                    `ID ${c.id}`,
                    `AT ${fmtBounds(c.rect, form.bounds)}`,
                ];
                if (!c.usable) parts.push("NONUSABLE");
                if (!c.enabled) parts.push("DISABLED");
                if (!c.visible) parts.push("HIDDEN");
                if (c.on) parts.push("ON");
                if (!c.leftAnchor) parts.push("RIGHTANCHOR");
                if (c.frame === 0) parts.push("NOFRAME");
                else if (c.frame === 2) parts.push("BOLDFRAME");
                else if (c.frame === 3) parts.push("RECTFRAME");
                line = parts.join(" ");
                break;
            }
            case 1: {
                const c = parseControl(reader, obj.offset);
                const parts = [
                    `BUTTON "${escapeQuotedText(c.text)}"`,
                    `ID ${c.id}`,
                    `AT ${fmtBounds(c.rect, form.bounds)}`,
                ];
                if (!c.usable) parts.push("NONUSABLE");
                if (!c.enabled) parts.push("DISABLED");
                if (!c.visible) parts.push("HIDDEN");
                if (c.on) parts.push("ON");
                if (!c.leftAnchor) parts.push("RIGHTANCHOR");
                if (c.frame === 0) parts.push("NOFRAME");
                else if (c.frame === 2) parts.push("BOLDFRAME");
                else if (c.frame === 3) parts.push("RECTFRAME");
                line = parts.join(" ");
                break;
            }
            case 2: {
                const c = parseControl(reader, obj.offset);
                const parts = [
                    `LIST "${escapeQuotedText(c.text)}"`,
                    `ID ${c.id}`,
                    `AT ${fmtBounds(c.rect, form.bounds)}`,
                ];
                if (!c.usable) parts.push("NONUSABLE");
                if (!c.enabled) parts.push("DISABLED");
                if (!c.visible) parts.push("HIDDEN");
                if (c.on) parts.push("ON");
                if (!c.leftAnchor) parts.push("RIGHTANCHOR");
                if (c.frame === 0) parts.push("NOFRAME");
                else if (c.frame === 2) parts.push("BOLDFRAME");
                else if (c.frame === 3) parts.push("RECTFRAME");
                line = parts.join(" ");
                break;
            }
            case 4: {
                const bm = parseFormBitmap(reader, obj.offset);
                line = `FORMBITMAP AT (${bm.pos.x} ${bm.pos.y}) BITMAP ${bm.rscID}`;
                break;
            }
            default:
                line = `OBJECT ${kindName(obj.type)}`;
        }

        lines.push(`\t${line}`);
    }

    lines.push("END");
    return lines.join("\n");
}

// --- tSTR decoder (kept separate because it’s simple) ---
export function decodeTSTR(data: Uint8Array | number[] | ArrayBuffer): string {
    const bytes = toUint8Array(data);
    let out = "";
    for (const byte of bytes) {
        if (byte === 0x00) break;
        out += String.fromCharCode(byte);
    }
    return out;
}

// --- tSTL decoder ---
export function decodeTSTL(data: Uint8Array | number[] | ArrayBuffer): string[] {
    const bytes = toUint8Array(data);
    let startIndex = 0;

    // 1. Skip the header bytes
    // By advancing until we hit a printable ASCII character (>= 32),
    // we safely bypass the `00 00 07` prefix regardless of exact byte alignment.
    while (startIndex < bytes.length && bytes[startIndex] < 32) {
        startIndex++;
    }

    const strings: string[] = [];
    let currentStr = "";

    for (let i = startIndex; i < bytes.length; i++) {
        const byte = bytes[i];
        if (byte === 0x00) {
            strings.push(currentStr);
            currentStr = "";
        } else {
            currentStr += String.fromCharCode(byte);
        }
    }

    if (currentStr.length > 0) {
        strings.push(currentStr);
    }

    return strings;
}

// --- Talt (Alert) decoder ---
export function decodeAlert(data: Uint8Array | number[] | ArrayBuffer, resourceId: string | number = "ID"): string {
    const bytes = toUint8Array(data);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // Parse the 8-byte header
    const alertTypeVal = view.getUint16(0, false); // false = Big-Endian
    const helpRscID = view.getUint16(2, false);
    const numButtons = view.getUint16(4, false);
    const defaultButton = view.getUint16(6, false);

    // Map the integer to PilRC alert types
    const alertTypes = ["INFORMATION", "CONFIRMATION", "WARNING", "ERROR"];
    const alertTypeStr = alertTypes[alertTypeVal] || "INFORMATION";

    let offset = 8;

    // Helper to read null-terminated strings
    function readString() {
        let str = "";
        while (offset < bytes.length && bytes[offset] !== 0x00) {
            str += String.fromCharCode(bytes[offset]);
            offset++;
        }
        offset++; // Skip the null terminator
        return str;
    }

    const title = readString();
    const message = readString();

    const buttons: string[] = [];
    for (let i = 0; i < numButtons; i++) {
        buttons.push(readString());
    }

    // Reconstruct the PilRC format
    let pilrc = `ALERT ID ${resourceId}\n`;
    if (helpRscID !== 0) pilrc += `HELPID ${helpRscID}\n`;
    pilrc += `DEFAULTBUTTON ${defaultButton}\n`;
    pilrc += `${alertTypeStr}\n`;
    pilrc += `BEGIN\n`;
    pilrc += `    TITLE "${title}"\n`;

    // Escape raw newlines/quotes back into PilRC string literal format
    const escapedMessage = message
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/"/g, '\\"');

    pilrc += `    MESSAGE "${escapedMessage}"\n`;

    if (buttons.length > 0) {
        const buttonsStr = buttons.map(b => `"${b}"`).join(" ");
        pilrc += `    BUTTONS ${buttonsStr}\n`;
    }

    pilrc += `END`;

    return pilrc;
}

// --- MBAR (Menu Bar) decoder ---
// Based strictly on PilRC's emitted layouts:
//   RCMENUBAR      -> szRCMENUBAR
//   RCMENUPULLDOWN -> szRCMENUPULLDOWN
//   RCMENUITEM     -> szRCMENUITEM
//
// PilRC writes resource-relative offsets into the pointer fields, then appends
// strings after the struct blocks.

type MenuVariant = {
    name: "68K" | "LE32";
    littleEndian: boolean;
    headerNumMenusOffset: number;   // where numMenus lives in the menu bar struct
    pulldownSize: number;           // exact emitted size of one pull-down struct
    pulldownCountOffset: number;    // word offset used for hidden/count packing
    pulldownItemsPtrOffset: number; // pointer to the item table
};

const MENU_VARIANTS: MenuVariant[] = [
    // szRCMenuBarBA16 / szRCMenuPullDownBA16
    {
        name: "68K",
        littleEndian: false,
        headerNumMenusOffset: 26,
        pulldownSize: 34,
        pulldownCountOffset: 28,   // packed hidden + numItems
        pulldownItemsPtrOffset: 30,
    },
    // szRCMenuBarBA32 / szRCMenuPullDownBA32
    {
        name: "LE32",
        littleEndian: true,
        headerNumMenusOffset: 22,
        pulldownSize: 36,
        pulldownCountOffset: 28,   // hidden bitword
        pulldownItemsPtrOffset: 32,
    },
];

export function decodeMBAR(
    data: Uint8Array | number[] | ArrayBuffer,
    resourceId: string | number = "ID",
): string {
    const bytes = toUint8Array(data);

    if (bytes.length < 32) {
        return `// Invalid MBAR resource: Too small`;
    }

    const best = tryDecodeWithAnyVariant(bytes, resourceId);
    if (best) return best;

    return `// Invalid MBAR resource: Unable to decode with PilRC layouts`;
}

function tryDecodeWithAnyVariant(bytes: Uint8Array, resourceId: string | number): string | null {
    let bestText: string | null = null;
    let bestScore = -Infinity;

    for (const variant of MENU_VARIANTS) {
        const result = tryDecodeVariant(bytes, resourceId, variant);
        if (result && result.score > bestScore) {
            bestScore = result.score;
            bestText = result.text;
        }
    }

    return bestText;
}

function tryDecodeVariant(
    bytes: Uint8Array,
    resourceId: string | number,
    variant: MenuVariant,
): { text: string; score: number } | null {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const numMenus = readU16(view, variant.headerNumMenusOffset, variant.littleEndian);
    if (numMenus > 32) return null; // PilRC's impdMax is 32
    if (numMenus === 0) {
        return {
            text: `MENU ID ${resourceId}\nBEGIN\nEND`,
            score: 1,
        };
    }

    const pulldownsStart = 32; // exact emitted size of szRCMENUBAR
    const pulldownsEnd = pulldownsStart + (numMenus * variant.pulldownSize);
    if (pulldownsEnd > bytes.length) return null;

    const menus: string[] = [];
    let score = 0;

    // First pass: read pulldowns and all menu items by following the emitted offsets.
    for (let i = 0; i < numMenus; i++) {
        const pdOffset = pulldownsStart + (i * variant.pulldownSize);
        if (pdOffset + variant.pulldownSize > bytes.length) return null;

        const titlePtr = readU32(view, pdOffset + 24, variant.littleEndian);
        const title = readCString(bytes, titlePtr);
        if (!title) return null;

        const packedCount = readU16(view, pdOffset + variant.pulldownCountOffset, variant.littleEndian);

        let numItems: number;
        if (variant.name === "68K") {
            // szRCMenuPullDownBA16: hidden bit + 15-bit numItems in one word
            numItems = packedCount & 0x7fff;
        } else {
            // szRCMenuPullDownBA32: hidden word at +28, numItems word at +30
            numItems = readU16(view, pdOffset + 30, variant.littleEndian);
        }

        if (numItems > 128) return null; // PilRC's imiMax is 128
        const itemsPtr = readU32(view, pdOffset + variant.pulldownItemsPtrOffset, variant.littleEndian);
        if (itemsPtr >= bytes.length) return null;

        const items: string[] = [];
        for (let j = 0; j < numItems; j++) {
            const itemOffset = itemsPtr + (j * 8); // szRCMENUITEM is always 8 bytes
            if (itemOffset + 8 > bytes.length) return null;

            const id = readU16(view, itemOffset + 0, variant.littleEndian);
            const command = bytes[itemOffset + 2];
            const strPtr = readU32(view, itemOffset + 4, variant.littleEndian);
            const text = readCString(bytes, strPtr);

            if (!text) return null;

            if (text === "-") {
                items.push(`\t\tMENUITEM SEPARATOR`);
            } else {
                let line = `\t\tMENUITEM "${escapePilrcText(text)}" ID ${id}`;
                if (command !== 0) {
                    line += ` "${escapePilrcCommand(command)}"`;
                }
                items.push(line);
            }
            score += 1;
        }

        menus.push(`\tPULLDOWN "${escapePilrcText(title)}"\n\tBEGIN\n${items.join("\n")}\n\tEND`);
        score += title.length;
    }

    const text = `MENU ID ${resourceId}\nBEGIN\n${menus.join("\n")}\nEND`;
    score += numMenus * 4;
    return { text, score };
}

function readU16(view: DataView, offset: number, littleEndian: boolean): number {
    if (offset < 0 || offset + 2 > view.byteLength) return 0;
    return view.getUint16(offset, littleEndian);
}

function readU32(view: DataView, offset: number, littleEndian: boolean): number {
    if (offset < 0 || offset + 4 > view.byteLength) return 0;
    return view.getUint32(offset, littleEndian);
}

function readCString(bytes: Uint8Array, offset: number): string {
    if (offset < 0 || offset >= bytes.length) return "";

    let out = "";
    for (let i = offset; i < bytes.length; i++) {
        const b = bytes[i];
        if (b === 0x00) break;
        out += String.fromCharCode(b);
    }
    return out;
}

function escapePilrcText(text: string): string {
    return text
        .replaceAll("\\", "\\\\")
        .replaceAll('"', '\\"');
}

function escapePilrcCommand(cmd: number): string {
    const ch = String.fromCharCode(cmd);
    return ch
        .replaceAll("\\", "\\\\")
        .replaceAll('"', '\\"');
}