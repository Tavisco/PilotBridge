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

export function fmtBounds(r: RectLike | null): string {
    if (!r) return "(? ? ? ?)";
    const ww = r.w === 0 ? "AUTO" : String(r.w);
    const hh = r.h === 0 ? "AUTO" : String(r.h);
    return `(${r.x} ${r.y} ${ww} ${hh})`;
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

// --- main tFRM decompiler ---
export function decodeTFRM(
    data: Uint8Array | number[] | ArrayBuffer,
    resourceId: number
): string {
    const bytes = toUint8Array(data);
    const reader = new PalmBinaryReader(bytes);

    const formAttr = reader.u16be(0x2a);
    const defaultBtnId = reader.u16be(0x38);
    const numObjects = reader.u16be(0x3e);
    const formBounds: RectLike = {
        x: reader.i16be(0x14),
        y: reader.i16be(0x16),
        w: reader.i16be(0x18),
        h: reader.i16be(0x1a),
    };

    const fUsable = !!(formAttr & 0x8000);
    const fEnabled = !!(formAttr & 0x4000);
    const fVisible = !!(formAttr & 0x2000);
    const fSaveBehind = !!(formAttr & 0x0800);
    const fDoingDialog = !!(formAttr & 0x0100);

    const formFlags: string[] = [];
    if (fUsable) formFlags.push("USABLE");
    if (fEnabled) formFlags.push("ENABLED");
    if (fVisible) formFlags.push("VISIBLE");
    if (fSaveBehind) formFlags.push("SAVEBEHIND");
    if (fDoingDialog) formFlags.push("MODAL");

    const dirStart = 0x44;
    const dirEntrySize = 6;
    const objects: { type: number; offset: number }[] = [];

    for (let i = 0; i < numObjects; i++) {
        const entryOffset = dirStart + i * dirEntrySize;
        const type = reader.u8(entryOffset);
        const objOff = reader.u32be(entryOffset + 2);
        objects.push({ type, offset: objOff });
    }

    const objectLines: string[] = [];
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
                if (l.usable) parts.push("USABLE");
                parts.push(`FONT ${l.font}`);
                line = parts.join(" ");
                break;
            }
            case 1: {
                const c = parseControl(reader, obj.offset);
                const styleNames = [
                    "BUTTON",
                    "PUSHBUTTON",
                    "CHECKBOX",
                    "POPUPTRIGGER",
                    "SELECTORTRIGGER",
                    "REPEATBUTTON",
                    "SLIDER",
                    "FEEDBACKSLIDER",
                ];
                const styleName = styleNames[c.style] ?? "BUTTON";
                const parts = [
                    styleName,
                    `"${escapeQuotedText(c.text)}"`,
                    `ID ${c.id}`,
                    `AT ${fmtBounds(c.rect)}`,
                ];
                if (c.usable) parts.push("USABLE");
                if (c.leftAnchor) parts.push("LEFTANCHOR");
                if (c.frame === 1) parts.push("FRAME");
                else if (c.frame === 0) parts.push("NOFRAME");
                line = parts.join(" ");
                break;
            }
            case 4: {
                const bm = parseFormBitmap(reader, obj.offset);
                const parts = [
                    "FORMBITMAP",
                    `AT (${bm.pos.x} ${bm.pos.y})`,
                    `BITMAP ${bm.rscID}`,
                ];
                if (bm.usable) parts.push("USABLE");
                line = parts.join(" ");
                break;
            }
            case 0: {
                const f = parseField(reader, obj.offset);
                line = `FIELD ID ${f.id} AT ${fmtBounds(f.rect)} MAXCHARS ${f.maxChars}`;
                break;
            }
            default:
                line = `OBJECT ${kindName(obj.type)}`;
        }
        objectLines.push(`  ${line}`);
    }

    const headerParts = [`FORM ID ${resourceId}`];
    if (formBounds.w > 0 || formBounds.h > 0) {
        headerParts.push(`AT ${fmtBounds(formBounds)}`);
    }
    const lines = [headerParts.join(" ")];
    if (formFlags.length > 0) lines.push(`\tFRAME ${formFlags.join(" ")}`);
    if (defaultBtnId > 0) lines.push(`\tDEFAULTBTNID ${defaultBtnId}`);
    lines.push("BEGIN");
    lines.push(...objectLines);
    lines.push("END");

    const discovered = extractAsciiRuns(bytes, 3);
    if (discovered.length > 0) {
        lines.push("", "; discovered strings");
        for (const s of discovered.slice(0, 128)) {
            lines.push(`; "${escapeQuotedText(s)}"`);
        }
    }

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