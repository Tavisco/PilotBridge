import { useState, useMemo, useEffect, type ChangeEvent } from "react";
import {
    Box,
    Typography,
    List,
    ListItemButton,
    ListItemText,
    Collapse,
    Paper,
    Divider,
    Button,
    Stack
} from "@mui/material";
import Grid2 from "@mui/material/Grid2";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import FolderIcon from "@mui/icons-material/Folder";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import { DatabaseHdrType, RawPdbDatabase, RawPrcDatabase } from "palm-pdb";

import { Panel } from "../panel";
import { PalmIcon } from "../components/PalmIcon";
import {
    extractAllTAIBBitmapsFromResource,
    toUint8Array
} from "../utils/taib-extractor";
import { TAIBBitmap } from "../utils/taib-types";

interface PrcExplorerPanelProps {
    database: RawPdbDatabase | RawPrcDatabase | null;
}

interface ResourceRecord {
    entry: {
        type: string;
        resourceId: number;
        localChunkId?: number;
    };
    data: Uint8Array | number[] | ArrayBuffer;
}

interface DirEntry {
    type: number;
    offset: number;
}

interface RectLike {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface PointLike {
    x: number;
    y: number;
}

interface TfrmDebugInfo {
    resourceId: number;
    formBounds: RectLike | null;
    countOffset: number;
    countEndian: "be" | "le";
    numObjects: number;
    layoutStart: number;
    dirFormat: string;
    score: number;
    entries: DirEntry[];
    notes: string[];
}

function decodeTSTR(data: Uint8Array | number[] | ArrayBuffer): string {
    const bytes = toUint8Array(data);

    let out = "";
    for (const byte of bytes) {
        if (byte === 0x00) break;
        out += String.fromCharCode(byte);
    }

    return out;
}

function readPalmCString(bytes: Uint8Array, offset: number): string {
    if (offset < 0 || offset >= bytes.length) return "";

    let out = "";

    for (let i = offset; i < bytes.length; i++) {
        const b = bytes[i];

        if (b === 0x00) break;

        // allow CR/LF/TAB
        if (
            b !== 0x09 &&
            b !== 0x0A &&
            b !== 0x0D &&
            (b < 0x20 || b > 0x7E)
        ) {
            break;
        }

        out += String.fromCharCode(b);
    }

    return out;
}

function readInlineCString(slice: Uint8Array, offset: number): string {
    if (offset < 0 || offset >= slice.length) return "";

    let out = "";

    for (let i = offset; i < slice.length; i++) {
        const b = slice[i];

        if (b === 0x00) break;

        if (
            b !== 0x09 &&
            b !== 0x0A &&
            b !== 0x0D &&
            (b < 0x20 || b > 0x7E)
        ) {
            break;
        }

        out += String.fromCharCode(b);
    }

    return out;
}

function readRectBE(slice: Uint8Array, offset: number): RectLike {
    const r = new PalmBinaryReader(slice);

    return {
        x: r.i16be(offset + 0),
        y: r.i16be(offset + 2),
        w: r.i16be(offset + 4),
        h: r.i16be(offset + 6)
    };
}

function readPointBE(slice: Uint8Array, offset: number): PointLike {
    const r = new PalmBinaryReader(slice);

    return {
        x: r.i16be(offset + 0),
        y: r.i16be(offset + 2)
    };
}

function decodeFormAttr(flags: number): string[] {
    const out: string[] = [];

    // FrmAttrType
    if (flags & 0x8000) out.push("USABLE");
    if (flags & 0x4000) out.push("ENABLED");
    if (flags & 0x2000) out.push("VISIBLE");
    if (flags & 0x0800) out.push("SAVEBEHIND");
    if (flags & 0x0400) out.push("MODAL");

    return out;
}

function decodeControlAttr(flags: number): string[] {
    const out: string[] = [];

    if (flags & 0x8000) out.push("USABLE");
    if (flags & 0x2000) out.push("ENABLED");
    if (flags & 0x1000) out.push("VISIBLE");
    if (flags & 0x0080) out.push("LEFTANCHOR");
    if (flags & 0x0040) out.push("FRAME");

    return out;
}

class PalmBinaryReader {
    private readonly bytes: Uint8Array;
    private readonly view: DataView;

    constructor(data: Uint8Array | ArrayBuffer) {
        this.bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    }

    get length() {
        return this.bytes.length;
    }

    u8(offset: number): number {
        if (offset < 0 || offset >= this.length) return 0;
        return this.view.getUint8(offset);
    }

    i16be(offset: number): number {
        if (offset < 0 || offset + 2 > this.length) return 0;
        return this.view.getInt16(offset, false);
    }

    u16be(offset: number): number {
        if (offset < 0 || offset + 2 > this.length) return 0;
        return this.view.getUint16(offset, false);
    }

    u16le(offset: number): number {
        if (offset < 0 || offset + 2 > this.length) return 0;
        return this.view.getUint16(offset, true);
    }

    u32be(offset: number): number {
        if (offset < 0 || offset + 4 > this.length) return 0;
        return this.view.getUint32(offset, false);
    }

    u32le(offset: number): number {
        if (offset < 0 || offset + 4 > this.length) return 0;
        return this.view.getUint32(offset, true);
    }

    slice(offset: number, length: number): Uint8Array {
        const start = Math.max(0, offset);
        const end = Math.min(this.length, offset + length);
        return this.bytes.slice(start, end);
    }
}

function isPrintableAsciiByte(byte: number): boolean {
    return byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e);
}

function escapeQuotedText(text: string): string {
    return text
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n");
}

function fmtHex(v: number, width = 4): string {
    return `0x${v.toString(16).toUpperCase().padStart(width, "0")}`;
}

function fmtPoint(p: PointLike | null): string {
    if (!p) return "(? ?)";
    return `(${p.x} ${p.y})`;
}

function fmtBounds(r: RectLike | null): string {
    if (!r) return "(? ? ? ?)";
    const ww = r.w === 0 ? "AUTO" : String(r.w);
    const hh = r.h === 0 ? "AUTO" : String(r.h);
    return `(${r.x} ${r.y} ${ww} ${hh})`;
}

function extractAsciiRuns(bytes: Uint8Array, minLen = 3): string[] {
    const runs: string[] = [];
    let start = -1;

    const flush = (endExclusive: number) => {
        if (start < 0) return;

        const chunk = bytes.slice(start, endExclusive);
        let text = "";
        let printable = 0;

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
        } else {
            flush(i);
        }
    }

    flush(bytes.length);

    return Array.from(new Set(runs));
}

function readCStringAt(bytes: Uint8Array, offset: number): string {
    if (offset <= 0 || offset >= bytes.length) return "";

    let out = "";
    for (let i = offset; i < bytes.length; i++) {
        const b = bytes[i];
        if (b === 0x00) break;
        if (!isPrintableAsciiByte(b)) return "";
        out += String.fromCharCode(b);
    }
    return out;
}

function scoreTextCandidate(text: string): number {
    if (!text) return -9999;

    let score = text.length;
    if (/[A-Za-z]/.test(text)) score += 10;
    if (/\s/.test(text)) score += 2;
    if (/^[\x20]+$/.test(text)) score += 20; // preserve title strings that are intentionally spaces
    if (text.length <= 2) score -= 4;

    return score;
}

function findTextPointerCandidates(bytes: Uint8Array, baseOffset: number, scanLimit = 64): string[] {
    const reader = new PalmBinaryReader(bytes);
    const candidates = new Map<string, number>();
    const end = Math.min(bytes.length - 4, baseOffset + scanLimit);

    for (let off = baseOffset; off <= end; off += 2) {
        const possible = [
            reader.u32be(off),
            reader.u32le(off),
            reader.u16be(off),
            reader.u16le(off)
        ];

        for (const ptr of possible) {
            if (ptr <= 0 || ptr >= bytes.length) continue;

            const s = readCStringAt(bytes, ptr);
            if (!s) continue;

            const key = `${ptr}:${s}`;
            const score = scoreTextCandidate(s);
            const prev = candidates.get(key);
            if (prev === undefined || score > prev) {
                candidates.set(key, score);
            }
        }
    }

    return [...candidates.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([key]) => key.slice(key.indexOf(":") + 1));
}

function bestPointerText(bytes: Uint8Array, baseOffset: number, scanLimit = 64): string {
    const candidates = findTextPointerCandidates(bytes, baseOffset, scanLimit);
    if (candidates.length > 0) return candidates[0];

    return "";
}

function guessIdCandidate(bytes: Uint8Array, baseOffset: number, scanLimit = 24): number {
    const reader = new PalmBinaryReader(bytes);
    let bestValue = -1;
    let bestScore = -9999;

    const end = Math.min(bytes.length - 2, baseOffset + scanLimit);

    for (let off = baseOffset; off <= end; off += 2) {
        const vals = [reader.u16be(off), reader.u16le(off)];

        for (const v of vals) {
            let score = 0;
            if (v >= 1 && v <= 40000) score += 10;
            if (v >= 1000 && v <= 20000) score += 10;
            if (v >= 1100 && v <= 1200) score += 20;
            if (v === 0) score -= 10;

            if (score > bestScore) {
                bestScore = score;
                bestValue = v;
            }
        }
    }

    return bestValue;
}

function guessU16Candidate(
    bytes: Uint8Array,
    baseOffset: number,
    scanLimit = 32,
    predicate: (v: number) => boolean = () => true
): number {
    const reader = new PalmBinaryReader(bytes);
    let bestValue = -1;
    let bestScore = -9999;

    const end = Math.min(bytes.length - 2, baseOffset + scanLimit);

    for (let off = baseOffset; off <= end; off += 2) {
        const vals = [reader.u16be(off), reader.u16le(off)];

        for (const v of vals) {
            if (!predicate(v)) continue;

            let score = 0;
            if (v > 0) score += 8;
            if (v <= 65535) score += 2;
            if (v === 1024) score += 20;
            if (v === 160 || v === 161 || v === 166) score += 5;
            if (v === 0) score -= 20;

            if (score > bestScore) {
                bestScore = score;
                bestValue = v;
            }
        }
    }

    return bestValue;
}

function guessPointCandidate(bytes: Uint8Array, baseOffset: number, scanLimit = 16): PointLike | null {
    const reader = new PalmBinaryReader(bytes);
    let best: PointLike | null = null;
    let bestScore = -9999;

    const end = Math.min(bytes.length - 4, baseOffset + scanLimit);

    for (let off = baseOffset; off <= end; off += 2) {
        const x = reader.i16be(off);
        const y = reader.i16be(off + 2);

        let score = 0;
        if (x >= -20 && x <= 400) score += 8;
        if (y >= -20 && y <= 400) score += 8;
        if (x >= 0 && y >= 0) score += 4;
        if (x <= 160 && y <= 160) score += 4;

        if (score > bestScore) {
            bestScore = score;
            best = { x, y };
        }
    }

    return best;
}

function guessRectCandidate(bytes: Uint8Array, baseOffset: number, scanLimit = 24): RectLike | null {
    const reader = new PalmBinaryReader(bytes);
    let best: RectLike | null = null;
    let bestScore = -9999;

    const end = Math.min(bytes.length - 8, baseOffset + scanLimit);

    for (let off = baseOffset; off <= end; off += 2) {
        const x = reader.i16be(off);
        const y = reader.i16be(off + 2);
        const w = reader.i16be(off + 4);
        const h = reader.i16be(off + 6);

        let score = 0;
        if (x >= -20 && x <= 400) score += 6;
        if (y >= -20 && y <= 400) score += 6;
        if (w >= 0 && w <= 400) score += 8;
        if (h >= 0 && h <= 400) score += 8;
        if (w > 0 && h > 0) score += 4;
        if (x >= 0 && y >= 0) score += 3;
        if (x <= 160 && y <= 160) score += 3;

        if (score > bestScore) {
            bestScore = score;
            best = { x, y, w, h };
        }
    }

    return best;
}

function parseFormBounds(bytes: Uint8Array): RectLike | null {
    const candidate = guessRectCandidate(bytes, 0, 64);
    if (!candidate) return null;

    const looksLikeForm =
        candidate.x >= -2 &&
        candidate.x <= 4 &&
        candidate.y >= -2 &&
        candidate.y <= 4 &&
        candidate.w >= 100 &&
        candidate.w <= 240 &&
        candidate.h >= 100 &&
        candidate.h <= 240;

    return looksLikeForm ? candidate : candidate;
}

function kindName(kind: number): string {
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

function controlStyleName(style: number): string {
    switch (style) {
        case 0: return "BUTTON";
        case 1: return "REPEATBUTTON";
        case 2: return "PUSHBUTTON";
        case 3: return "CHECKBOX";
        case 4: return "POPUPTRIGGER";
        case 5: return "SELECTORTRIGGER";
        case 6: return "SLIDER";
        case 7: return "FEEDBACKSLIDER";
        default: return "BUTTON";
    }
}

function readHeaderCountCandidates(bytes: Uint8Array): Array<{ offset: number; value: number; endian: "be" | "le" }> {
    const r = new PalmBinaryReader(bytes);
    const out: Array<{ offset: number; value: number; endian: "be" | "le" }> = [];

    for (let off = 0; off <= 0x80 && off + 1 < bytes.length; off += 2) {
        const be = r.u16be(off);
        const le = r.u16le(off);

        if (be > 0 && be <= 128) out.push({ offset: off, value: be, endian: "be" });
        if (le > 0 && le <= 128) out.push({ offset: off, value: le, endian: "le" });
    }

    return out;
}

type DirFormat = {
    entrySize: 4 | 6 | 8;
    typeOffset: number;
    typeWidth: 1 | 2;
    offsetOffset: number;
    offsetWidth: 2 | 4;
    offsetEndian: "be" | "le";
};

function readDirEntry(bytes: Uint8Array, base: number, fmt: DirFormat): DirEntry | null {
    const r = new PalmBinaryReader(bytes);

    let type = 0;
    if (fmt.typeWidth === 1) {
        type = r.u8(base + fmt.typeOffset);
    } else {
        type = r.u16be(base + fmt.typeOffset);
    }

    let offset = 0;
    if (fmt.offsetWidth === 2) {
        offset = fmt.offsetEndian === "be" ? r.u16be(base + fmt.offsetOffset) : r.u16le(base + fmt.offsetOffset);
    } else {
        offset = fmt.offsetEndian === "be" ? r.u32be(base + fmt.offsetOffset) : r.u32le(base + fmt.offsetOffset);
    }

    if (!Number.isFinite(type) || !Number.isFinite(offset)) return null;
    return { type, offset };
}

function pickBestText(bytes: Uint8Array): string {
    const runs = extractAsciiRuns(bytes, 3)
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter((s) => s.length > 0);

    if (runs.length === 0) return "";

    runs.sort((a, b) => b.length - a.length);
    return runs[0];
}

function renderObjectLine(
    type: number,
    bytes: Uint8Array,
    start: number,
    end: number
): { line: string; notes: string[] } {

    const slice = bytes.slice(start, Math.min(end, bytes.length));
    const r = new PalmBinaryReader(slice);

    switch (type) {

        // TITLE
        case 9: {
            const text = readInlineCString(slice, 0);

            return {
                line: `TITLE "${escapeQuotedText(text)}"`,
                notes: []
            };
        }

        // LABEL
        case 8: {
            const id = r.u16be(0);
            const x = r.i16be(2);
            const y = r.i16be(4);

            const attr = r.u16be(6);
            const font = r.u8(8);

            const text = readInlineCString(slice, 14);

            const parts: string[] = [];

            parts.push(`LABEL "${escapeQuotedText(text)}"`);

            parts.push(`ID ${id}`);

            parts.push(`AT (${x} ${y})`);

            if (attr & 0x8000) {
                parts.push("USABLE");
            }

            parts.push(`FONT ${font}`);

            return {
                line: parts.join(" "),
                notes: []
            };
        }

        // BUTTON / CONTROL
        case 1: {
            const id = r.u16be(0);

            const rect = readRectBE(slice, 2);

            const attr = r.u16be(10);

            const style = r.u8(12);

            const text = readInlineCString(slice, 20);

            const styleName = controlStyleName(style);

            const parts: string[] = [];

            parts.push(styleName);

            parts.push(`"${escapeQuotedText(text)}"`);

            parts.push(`ID ${id}`);

            parts.push(`AT ${fmtBounds(rect)}`);

            parts.push(...decodeControlAttr(attr));

            return {
                line: parts.join(" "),
                notes: []
            };
        }

        // BITMAP
        case 4: {
            const pt = readPointBE(slice, 2);

            const bitmapId = r.u16be(6);

            const attr = r.u16be(0);

            const parts: string[] = [];

            parts.push(`FORMBITMAP`);

            parts.push(`AT (${pt.x} ${pt.y})`);

            parts.push(`BITMAP ${bitmapId}`);

            if (attr & 0x8000) {
                parts.push("USABLE");
            }

            return {
                line: parts.join(" "),
                notes: []
            };
        }

        // FIELD
        case 0: {
            const id = r.u16be(0);

            const rect = readRectBE(slice, 2);

            const maxChars = r.u16be(18);

            return {
                line:
                    `FIELD ID ${id} ` +
                    `AT ${fmtBounds(rect)} ` +
                    `MAXCHARS ${maxChars}`,
                notes: []
            };
        }

        // LIST
        case 2: {
            const id = r.u16be(0);

            const rect = readRectBE(slice, 2);

            return {
                line:
                    `LIST ID ${id} ` +
                    `AT ${fmtBounds(rect)}`,
                notes: []
            };
        }

        // TABLE
        case 3: {
            const id = r.u16be(0);

            const rect = readRectBE(slice, 2);

            return {
                line:
                    `TABLE ID ${id} ` +
                    `AT ${fmtBounds(rect)}`,
                notes: []
            };
        }

        // GADGET
        case 12: {
            const id = r.u16be(0);

            const rect = readRectBE(slice, 4);

            return {
                line:
                    `GADGET ID ${id} ` +
                    `AT ${fmtBounds(rect)}`,
                notes: []
            };
        }

        // SCROLLBAR
        case 13: {
            const rect = readRectBE(slice, 0);

            const id = r.u16be(18);

            return {
                line:
                    `SCROLLBAR ID ${id} ` +
                    `AT ${fmtBounds(rect)}`,
                notes: []
            };
        }

        // SLIDER
        case 14: {
            const id = r.u16be(0);

            const rect = readRectBE(slice, 2);

            return {
                line:
                    `SLIDER ID ${id} ` +
                    `AT ${fmtBounds(rect)}`,
                notes: []
            };
        }

        case 5:
            return { line: "LINE", notes: [] };

        case 6:
            return { line: "FRAME", notes: [] };

        case 7:
            return { line: "RECTANGLE", notes: [] };

        default:
            return {
                line: `OBJECT ${kindName(type)}`,
                notes: []
            };
    }
}

function parseTfrmCountAndLayout(bytes: Uint8Array): TfrmDebugInfo | null {
    const countCandidates = readHeaderCountCandidates(bytes);
    if (countCandidates.length === 0) return null;

    const dirFormats: DirFormat[] = [
        { entrySize: 4, typeOffset: 0, typeWidth: 2, offsetOffset: 2, offsetWidth: 2, offsetEndian: "be" },
        { entrySize: 4, typeOffset: 0, typeWidth: 1, offsetOffset: 2, offsetWidth: 2, offsetEndian: "be" },
        { entrySize: 4, typeOffset: 0, typeWidth: 1, offsetOffset: 2, offsetWidth: 2, offsetEndian: "le" },
        { entrySize: 4, typeOffset: 0, typeWidth: 2, offsetOffset: 2, offsetWidth: 2, offsetEndian: "le" },
        { entrySize: 6, typeOffset: 0, typeWidth: 2, offsetOffset: 4, offsetWidth: 2, offsetEndian: "be" },
        { entrySize: 6, typeOffset: 0, typeWidth: 1, offsetOffset: 4, offsetWidth: 2, offsetEndian: "be" },
        { entrySize: 6, typeOffset: 0, typeWidth: 1, offsetOffset: 4, offsetWidth: 2, offsetEndian: "le" },
        { entrySize: 8, typeOffset: 0, typeWidth: 2, offsetOffset: 4, offsetWidth: 4, offsetEndian: "be" }
    ];

    let best: TfrmDebugInfo | null = null;

    for (const countCand of countCandidates) {
        for (let start = 0x20; start <= 0xc0; start += 2) {
            for (const fmt of dirFormats) {
                const entries: DirEntry[] = [];
                let score = 0;
                let bad = false;

                for (let i = 0; i < countCand.value; i++) {
                    const base = start + i * fmt.entrySize;
                    const entry = readDirEntry(bytes, base, fmt);
                    if (!entry) {
                        bad = true;
                        break;
                    }

                    entries.push(entry);

                    if (entry.type >= 0 && entry.type <= 15) score += 6;
                    else score -= 7;

                    if (entry.offset >= 0x20 && entry.offset < bytes.length) score += 4;
                    else score -= 8;

                    if (i > 0) {
                        if (entries[i].offset >= entries[i - 1].offset) score += 3;
                        else score -= 7;
                    }
                }

                if (bad || entries.length !== countCand.value) continue;

                const endOfDir = start + countCand.value * fmt.entrySize;
                const sortedOffsets = [...entries.map((e) => e.offset)].sort((a, b) => a - b);

                if (sortedOffsets.length > 0) {
                    const first = sortedOffsets[0];
                    const last = sortedOffsets[sortedOffsets.length - 1];

                    if (first >= endOfDir) score += 10;
                    if (last < bytes.length) score += 8;
                }

                let recognizable = 0;
                for (const entry of entries.slice(0, Math.min(entries.length, 6))) {
                    const next = entries
                        .map((e) => e.offset)
                        .filter((o) => o > entry.offset)
                        .sort((a, b) => a - b)[0];

                    const sliceEnd = next ?? bytes.length;
                    const preview = renderObjectLine(entry.type, bytes, entry.offset, sliceEnd);

                    const line = preview.line.toUpperCase();
                    if (
                        line.startsWith("TITLE ") ||
                        line.startsWith("LABEL ") ||
                        line.startsWith("BUTTON ") ||
                        line.startsWith("PUSHBUTTON ") ||
                        line.startsWith("REPEATBUTTON ") ||
                        line.startsWith("CHECKBOX ") ||
                        line.startsWith("POPUPTRIGGER ") ||
                        line.startsWith("SELECTORTRIGGER ") ||
                        line.startsWith("FORMBITMAP ") ||
                        line.startsWith("FIELD ") ||
                        line.startsWith("LIST ") ||
                        line.startsWith("TABLE ") ||
                        line.startsWith("SCROLLBAR ") ||
                        line.startsWith("SLIDER ")
                    ) {
                        recognizable += 2;
                    }

                    if (preview.line.includes('"')) recognizable += 2;
                    if (preview.notes.length > 0) recognizable += 1;
                }

                score += recognizable * 6;

                const formBounds = parseFormBounds(bytes);
                if (formBounds && formBounds.w > 0 && formBounds.h > 0) score += 6;

                const notes: string[] = [];
                if (countCand.offset === 8) notes.push("count at offset 0x08");
                if (fmt.entrySize === 4) notes.push("4-byte directory entries");
                if (fmt.entrySize === 6) notes.push("6-byte directory entries");
                if (fmt.entrySize === 8) notes.push("8-byte directory entries");

                const candidate: TfrmDebugInfo = {
                    resourceId: 0,
                    formBounds,
                    countOffset: countCand.offset,
                    countEndian: countCand.endian,
                    numObjects: countCand.value,
                    layoutStart: start,
                    dirFormat: `entrySize=${fmt.entrySize}, typeWidth=${fmt.typeWidth}, typeOffset=${fmt.typeOffset}, offsetOffset=${fmt.offsetOffset}, offsetWidth=${fmt.offsetWidth}, offsetEndian=${fmt.offsetEndian}`,
                    score,
                    entries,
                    notes
                };

                if (!best || candidate.score > best.score) {
                    best = candidate;
                }
            }
        }
    }

    return best;
}

function decodeTFRM(
    data: Uint8Array | number[] | ArrayBuffer,
    resourceId: number
): { text: string; debug: TfrmDebugInfo | null } {
    const bytes = toUint8Array(data);
    const layout = parseTfrmCountAndLayout(bytes);

    if (!layout) {
        const strings = extractAsciiRuns(bytes, 3);
        return {
            text: [
                resourceId ? `FORM ID ${resourceId}` : "FORM",
                "BEGIN",
                ...strings.slice(0, 128).map((s) => `  ; ${s}`),
                "END"
            ].join("\n"),
            debug: null
        };
    }

    layout.resourceId = resourceId;

    const reader = new PalmBinaryReader(bytes);

    const formAttr = reader.u16be(40);

    const defaultBtnId = reader.u16be(56);

    const headerParts: string[] = [];

    headerParts.push(
        resourceId
            ? `FORM ID ${resourceId}`
            : "FORM"
    );

    if (layout.formBounds) {
        headerParts.push(`AT ${fmtBounds(layout.formBounds)}`);
    }

    const headerLine = headerParts.join(" ");

    const lines: string[] = [];
    lines.push(headerLine);
    const formFlags = decodeFormAttr(formAttr);

    if (formFlags.length > 0) {
        lines.push(`\tFRAME ${formFlags.join(" ")}`);
    }

    if (defaultBtnId > 0) {
        lines.push("");
        lines.push(`\tDEFAULTBTNID ${defaultBtnId}`);
    }
    lines.push("BEGIN");

    const sortedOffsets = [...layout.entries.map((e) => e.offset)].sort((a, b) => a - b);

    for (const entry of layout.entries) {
        const next = sortedOffsets.find((o) => o > entry.offset) ?? bytes.length;
        const { line, notes } = renderObjectLine(entry.type, bytes, entry.offset, next);

        lines.push(`  ${line}`);
        for (const note of notes) {
            lines.push(`    ; ${note}`);
        }
    }

    lines.push("END");

    const discovered = extractAsciiRuns(bytes, 3);
    if (discovered.length > 0) {
        lines.push("");
        lines.push("; discovered strings");
        for (const s of discovered.slice(0, 128)) {
            lines.push(`; "${escapeQuotedText(s)}"`);
        }
    }

    return {
        text: lines.join("\n"),
        debug: layout
    };
}

function formatHexView(bytes: Uint8Array): string {
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

export function PrcExplorerPanel({ database: propsDatabase, ...props }: PrcExplorerPanelProps) {
    const [localDatabase, setLocalDatabase] = useState<RawPdbDatabase | RawPrcDatabase | null>(null);
    const [openTypes, setOpenTypes] = useState<Record<string, boolean>>({});
    const [selectedRecord, setSelectedRecord] = useState<ResourceRecord | null>(null);

    useEffect(() => {
        if (propsDatabase) {
            setLocalDatabase(propsDatabase);
            setSelectedRecord(null);
            setOpenTypes({});
        }
    }, [propsDatabase]);

    const selectedTSTRText = useMemo(() => {
        if (!selectedRecord || (selectedRecord.entry.type !== "tSTR" && selectedRecord.entry.type !== "tver")) return "";
        return decodeTSTR(selectedRecord.data);
    }, [selectedRecord]);

    const selectedTFRM = useMemo(() => {
        if (!selectedRecord || selectedRecord.entry.type !== "tFRM") return { text: "", debug: null };
        return decodeTFRM(selectedRecord.data, selectedRecord.entry.resourceId);
    }, [selectedRecord]);

    const handleInspectFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files?.[0]) return;

        const file = event.target.files[0];

        if (!file.name.endsWith(".prc") && !file.name.endsWith(".pdb")) {
            alert("Please select a valid Palm .prc or .pdb file");
            return;
        }

        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                const fileBuffer = Buffer.from(arrayBuffer);
                const header = DatabaseHdrType.from(fileBuffer);
                const parsedDatabase = header.attributes.resDB
                    ? RawPrcDatabase.from(fileBuffer)
                    : RawPdbDatabase.from(fileBuffer);

                setLocalDatabase(parsedDatabase);
                setSelectedRecord(null);
                setOpenTypes({});
            };

            reader.readAsArrayBuffer(file);
        } catch (error) {
            console.error("Error parsing upload inside inspector frame:", error);
            alert("Could not load or format this file layout via palm-pdb parsing.");
        }
    };

    const activeDb = localDatabase || propsDatabase;

    const groupedResources = useMemo(() => {
        if (!activeDb?.records) return {};

        const groups: Record<string, ResourceRecord[]> = {};

        for (const rec of activeDb.records as ResourceRecord[]) {
            const type = rec.entry?.type ?? "unknown";
            if (!groups[type]) groups[type] = [];
            groups[type].push(rec);
        }

        return Object.keys(groups)
            .sort()
            .reduce((acc, key) => {
                acc[key] = groups[key].sort((a, b) => a.entry.resourceId - b.entry.resourceId);
                return acc;
            }, {} as Record<string, ResourceRecord[]>);
    }, [activeDb]);

    const selectedBitmaps: TAIBBitmap[] = useMemo(() => {
        if (!selectedRecord || selectedRecord.entry.type !== "tAIB") return [];
        return extractAllTAIBBitmapsFromResource(toUint8Array(selectedRecord.data));
    }, [selectedRecord]);

    const toggleTypeOpen = (type: string) => {
        setOpenTypes((prev) => ({ ...prev, [type]: !prev[type] }));
    };

    const selectedBytes = selectedRecord ? toUint8Array(selectedRecord.data) : new Uint8Array();

    return (
        <Panel
            title={activeDb ? `${activeDb.header?.name ?? "Database"} - PRC Explorer` : "PRC Explorer"}
            isExpandedByDefault={true}
            {...props}
            sx={{ width: "100%" }}
        >
            <Box>
                <Box p={2} display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" color="textSecondary">
                        {activeDb ? "Exploring loaded data module." : "Select an app below or open a local file directly to inspect."}
                    </Typography>
                    <Button variant="outlined" component="label" startIcon={<FileUploadIcon />}>
                        OPEN FILE TO INSPECT
                        <input type="file" hidden onChange={handleInspectFileChange} accept=".prc,.pdb" />
                    </Button>
                </Box>

                {!activeDb ? (
                    <Box p={4} textAlign="center" border="1px dashed #ccc" m={2} borderRadius={1}>
                        <Typography color="textSecondary">No database loaded into explorer view.</Typography>
                    </Box>
                ) : (
                    <Grid2 container spacing={0} sx={{ border: "1px solid #ccc", minHeight: 400, m: 2, borderRadius: 1 }}>
                        <Grid2
                            size={{ xs: 12, sm: 4 }}
                            sx={{ borderRight: "1px solid #ccc", maxHeight: 500, overflowY: "auto", bgcolor: "#f9f9f9" }}
                        >
                            <List dense component="nav">
                                {Object.entries(groupedResources).map(([type, records]) => {
                                    const isExpanded = !!openTypes[type];
                                    return (
                                        <Box key={type}>
                                            <ListItemButton onClick={() => toggleTypeOpen(type)} sx={{ py: 0.5 }}>
                                                <FolderIcon fontSize="small" sx={{ mr: 1, color: "#e0a910" }} />
                                                <ListItemText
                                                    primary={`${type} (${records.length})`}
                                                    primaryTypographyProps={{ style: { fontFamily: "monospace", fontWeight: 600 } }}
                                                />
                                                {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                                            </ListItemButton>

                                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                                <List dense component="div" disablePadding sx={{ pl: 3 }}>
                                                    {records.map((rec) => {
                                                        const isSelected = selectedRecord === rec;
                                                        const resIdHex = `0x${rec.entry.resourceId.toString(16).padStart(4, "0")}`;
                                                        return (
                                                            <ListItemButton
                                                                key={`${type}-${rec.entry.resourceId}`}
                                                                selected={isSelected}
                                                                onClick={() => setSelectedRecord(rec)}
                                                                sx={{ py: 0.2 }}
                                                            >
                                                                <InsertDriveFileIcon fontSize="small" sx={{ mr: 1, color: "#757575" }} />
                                                                <ListItemText
                                                                    primary={`${rec.entry.resourceId} (${resIdHex})`}
                                                                    primaryTypographyProps={{ style: { fontFamily: "monospace" } }}
                                                                />
                                                            </ListItemButton>
                                                        );
                                                    })}
                                                </List>
                                            </Collapse>
                                        </Box>
                                    );
                                })}
                            </List>
                        </Grid2>

                        <Grid2
                            size={{ xs: 12, sm: 8 }}
                            sx={{ p: 2, maxHeight: 500, overflowY: "auto", display: "flex", flexDirection: "column", bgcolor: "#fff" }}
                        >
                            {selectedRecord ? (
                                <Box>
                                    <Typography variant="subtitle2" color="textSecondary" sx={{ fontFamily: "monospace" }}>
                                        Type: <strong>{selectedRecord.entry.type}</strong> | ID: <strong>{selectedRecord.entry.resourceId}</strong>
                                    </Typography>
                                    <Typography variant="body2" color="textSecondary" sx={{ fontFamily: "monospace", mb: 1 }}>
                                        Resource Size: {selectedBytes.length} bytes
                                        {selectedRecord.entry.localChunkId !== undefined &&
                                            ` | Chunk Offset: 0x${selectedRecord.entry.localChunkId.toString(16).toUpperCase()}`}
                                    </Typography>

                                    <Divider sx={{ my: 1.5 }} />

                                    <Box my={2}>
                                        {selectedRecord.entry.type === "tAIB" ? (
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    Bitmap Visualizer:
                                                </Typography>

                                                <Stack spacing={2}>
                                                    {selectedBitmaps.length > 0 ? (
                                                        selectedBitmaps.map((bmp, index) => (
                                                            <Box key={index}>
                                                                <Typography
                                                                    variant="body2"
                                                                    sx={{ fontFamily: "monospace", mb: 1 }}
                                                                >
                                                                    {bmp.width} x {bmp.height}, {bmp.pixelSize} bpp, {bmp.density} dpi
                                                                </Typography>
                                                                <Box p={2} border="1px dashed #ccc" width="fit-content" borderRadius={1} bgcolor="#f0f0f0">
                                                                    <PalmIcon bitmap={bmp} />
                                                                </Box>
                                                            </Box>
                                                        ))
                                                    ) : (
                                                        <Typography variant="body2" color="textSecondary">
                                                            No decodable bitmap variants found in this resource.
                                                        </Typography>
                                                    )}
                                                </Stack>
                                            </Box>
                                        ) : selectedRecord.entry.type === "tFRM" ? (
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    Form Decompiler:
                                                </Typography>

                                                <Paper
                                                    variant="outlined"
                                                    sx={{
                                                        p: 2,
                                                        bgcolor: "#fafafa",
                                                        borderRadius: 1,
                                                        fontFamily: "monospace",
                                                        whiteSpace: "pre-wrap",
                                                        wordBreak: "break-word",
                                                        maxHeight: 320,
                                                        overflowY: "auto"
                                                    }}
                                                >
                                                    {selectedTFRM.text || "Could not decompile this tFRM resource."}
                                                </Paper>

                                                {selectedTFRM.debug ? (
                                                    <Paper
                                                        variant="outlined"
                                                        sx={{
                                                            mt: 1.5,
                                                            p: 1.5,
                                                            bgcolor: "#fcfcfc",
                                                            borderRadius: 1,
                                                            fontFamily: "monospace"
                                                        }}
                                                    >
                                                        <Typography variant="caption" display="block" color="textSecondary" gutterBottom>
                                                            Debug
                                                        </Typography>
                                                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                                                            {[
                                                                `Resource ID: ${selectedTFRM.debug.resourceId}`,
                                                                `Objects: ${selectedTFRM.debug.numObjects}`,
                                                                `Count offset: ${fmtHex(selectedTFRM.debug.countOffset)}`,
                                                                `Count endian: ${selectedTFRM.debug.countEndian}`,
                                                                `Layout start: ${fmtHex(selectedTFRM.debug.layoutStart)}`,
                                                                `Dir format: ${selectedTFRM.debug.dirFormat}`,
                                                                `Score: ${selectedTFRM.debug.score}`,
                                                                selectedTFRM.debug.formBounds ? `Form bounds: ${fmtBounds(selectedTFRM.debug.formBounds)}` : "",
                                                                selectedTFRM.debug.notes.length > 0 ? `Notes: ${selectedTFRM.debug.notes.join(", ")}` : ""
                                                            ].filter(Boolean).join("\n")}
                                                        </Typography>
                                                        <Typography variant="body2" sx={{ mt: 1, whiteSpace: "pre-wrap" }}>
                                                            {selectedTFRM.debug.entries
                                                                .map((e, i) => `#${i.toString().padStart(2, "0")}  type=${e.type}  offset=${fmtHex(e.offset)}`)
                                                                .join("\n")}
                                                        </Typography>
                                                    </Paper>
                                                ) : null}
                                            </Box>
                                        ) : selectedRecord.entry.type === "tSTR" || selectedRecord.entry.type === "tver" ? (
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    String Decoder:
                                                </Typography>

                                                <Paper
                                                    variant="outlined"
                                                    sx={{
                                                        p: 2,
                                                        bgcolor: "#fafafa",
                                                        borderRadius: 1,
                                                        fontFamily: "monospace",
                                                        whiteSpace: "pre-wrap",
                                                        wordBreak: "break-word"
                                                    }}
                                                >
                                                    {selectedTSTRText.length > 0 ? selectedTSTRText : "EMPTY STRING"}
                                                </Paper>
                                            </Box>
                                        ) : (
                                            <Typography variant="body2" color="textSecondary" sx={{ fontStyle: "italic" }}>
                                                No visual handler compiled for type "{selectedRecord.entry.type}".
                                            </Typography>
                                        )}
                                    </Box>

                                    <Divider sx={{ my: 1.5 }} />

                                    <Typography variant="caption" display="block" color="textSecondary" sx={{ mb: 0.5 }}>
                                        Hex View:
                                    </Typography>
                                    <Paper
                                        variant="outlined"
                                        sx={{ p: 1, bgcolor: "#1e1e1e", color: "#39ff14", maxHeight: 200, overflowY: "auto", borderRadius: 1 }}
                                    >
                                        <Typography
                                            variant="body2"
                                            component="pre"
                                            sx={{
                                                fontFamily: "'Courier New', Courier, monospace",
                                                whiteSpace: "pre-wrap",
                                                wordBreak: "break-all",
                                                m: 0,
                                                fontSize: "0.85rem"
                                            }}
                                        >
                                            {formatHexView(selectedBytes)}
                                        </Typography>
                                    </Paper>
                                </Box>
                            ) : (
                                <Box m="auto" textAlign="center">
                                    <Typography color="textSecondary" variant="body2">
                                        Select an entry inside the directory tree hierarchy to view its contents.
                                    </Typography>
                                </Box>
                            )}
                        </Grid2>
                    </Grid2>
                )}
            </Box>
        </Panel>
    );
}