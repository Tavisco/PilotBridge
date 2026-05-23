import {useState, useMemo, useEffect, type ChangeEvent, useRef} from "react";
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
    Stack, GlobalStyles,
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
    toUint8Array,
} from "../utils/taib-extractor";
import type { ResourceRecord } from "../utils/prc-types";
import {
    decodeAlert, decodeMBAR,
    decodeTFRM, decodeTSTL,
    decodeTSTR,
    formatHexView,
} from "../utils/prc-resource-parsers";

import fontSpritesheet from "../assets/Palm OS.png";

interface PalmFormVisualizerProps {
    pilrcText: string;
    renderBitmap?: (id: number) => React.ReactNode;
}

type RectLike = { x: number; y: number; w: number; h: number };
type AtToken = number | "CENTER" | "RIGHT" | "BOTTOM";

type ParsedFormHeader = {
    id: number | string;
    bounds: RectLike;
    title: string;
    frame: boolean;
    modal: boolean;
    defaultBtnId: number | null;
    helpId: number | null;
    menuId: number | null;
};

type ParsedWidget =
    | { kind: "title"; text: string }
    | { kind: "label"; text: string; id?: number; at: { x: AtToken; y: AtToken }; font?: number }
    | { kind: "field"; id?: number; rect: RectLike; maxChars?: number; editable: boolean; singleLine: boolean }
    | { kind: "button"; id?: number; text: string; rect: RectLike; hidden: boolean; defaultBtn: boolean; frame?: string }
    | { kind: "bitmap"; id: number; at: { x: number; y: number }; hidden: boolean }
    | { kind: "list"; id?: number; rect: RectLike; items: string[]; visibleItems?: number; search?: boolean }
    | { kind: "table"; id?: number; rect: RectLike; numColumns?: number; numRows?: number }
    | { kind: "scrollbar"; id?: number; rect: RectLike; value?: number; minValue?: number; maxValue?: number; pageSize?: number }
    | { kind: "slider"; id?: number; rect: RectLike; minValue?: number; maxValue?: number; value?: number; vertical?: boolean; thumbId?: number; backgroundId?: number; feedback?: boolean }
    | { kind: "gadget"; id?: number; rect: RectLike; extended?: boolean }
    | { kind: "line" | "frame" | "rectangle"; rect: RectLike };

function escapeQuotedText(text: string): string {
    return text
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n");
}

function parseNumberOrWord(token: string): AtToken {
    const t = token.trim().toUpperCase();
    if (t === "CENTER" || t === "RIGHT" || t === "BOTTOM") return t;
    const n = Number(token);
    return Number.isFinite(n) ? n : 0;
}

function parseAtSpec(raw: string): { x: AtToken; y: AtToken; w?: number; h?: number } | null {
    const m = raw.match(/AT\s*\(\s*([^)]+?)\s*\)/i);
    if (!m) return null;
    const parts = m[1].trim().split(/\s+/);
    if (parts.length < 2) return null;

    const x = parseNumberOrWord(parts[0]);
    const y = parseNumberOrWord(parts[1]);
    const w = parts[2] != null ? Number(parts[2]) : undefined;
    const h = parts[3] != null ? Number(parts[3]) : undefined;

    return {
        x,
        y,
        w: Number.isFinite(w as number) ? (w as number) : undefined,
        h: Number.isFinite(h as number) ? (h as number) : undefined,
    };
}

function estimateTextWidth(text: string, fontSize: number): number {
    return Math.max(8, Math.ceil(text.length * (fontSize * 0.55)));
}

function resolveCoord(
    value: AtToken,
    extent: number | undefined,
    containerExtent: number,
    textExtent = 0
): number {
    const size = extent ?? textExtent;
    switch (value) {
        case "CENTER":
            return Math.floor((containerExtent - size) / 2);
        case "RIGHT":
        case "BOTTOM":
            return Math.max(0, containerExtent - size);
        default:
            return value;
    }
}

function parseFormHeader(text: string): ParsedFormHeader {
    const headerMatch = text.match(/FORM\s+ID\s+([^\s]+)\s+AT\s+\(\s*([^)]+?)\s*\)/i);

    const defaultBounds: RectLike = { x: 0, y: 0, w: 160, h: 160 };
    const bounds = headerMatch
        ? (() => {
            const parts = headerMatch[2].trim().split(/\s+/);
            return {
                x: Number(parts[0]) || 0,
                y: Number(parts[1]) || 0,
                w: Number(parts[2]) || 160,
                h: Number(parts[3]) || 160,
            };
        })()
        : defaultBounds;

    const id = headerMatch
        ? (Number.isFinite(Number(headerMatch[1])) ? Number(headerMatch[1]) : headerMatch[1])
        : "ID";

    const titleMatch = text.match(/^\s*TITLE\s+"((?:\\.|[^"])*)"/im);
    const title = titleMatch ? titleMatch[1].replace(/\\r/g, "\r").replace(/\\n/g, "\n") : "";

    const frame = /\bFRAME\b/i.test(text);
    const modal = /\bMODAL\b/i.test(text) || /\bDOINGDIALOG\b/i.test(text);

    const defaultBtnId = text.match(/DEFAULTBTNID\s+(\d+)/i)?.[1];
    const helpId = text.match(/HELPID\s+(\d+)/i)?.[1];
    const menuId = text.match(/MENUID\s+(\d+)/i)?.[1];

    return {
        id,
        bounds,
        title,
        frame,
        modal,
        defaultBtnId: defaultBtnId != null ? Number(defaultBtnId) : null,
        helpId: helpId != null ? Number(helpId) : null,
        menuId: menuId != null ? Number(menuId) : null,
    };
}

function parseWidgets(pilrcText: string, form: ParsedFormHeader): ParsedWidget[] {
    const widgets: ParsedWidget[] = [];
    const lines = pilrcText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    // Helper to get numeric x,y from AtToken (crude fallback to 0 for tokens)
    const getNumericPos = (token: AtToken): number =>
        typeof token === "number" ? token : 0;

    for (const line of lines) {
        if (/^FORM\b/i.test(line) || /^BEGIN$/i.test(line) || /^END$/i.test(line)) continue;
        if (/^FRAME$/i.test(line)) continue;
        if (/^MODAL$/i.test(line)) continue;
        if (/^NOSAVEBEHIND$/i.test(line)) continue;
        if (/^DEFAULTBTNID\b/i.test(line)) continue;
        if (/^HELPID\b/i.test(line)) continue;
        if (/^MENUID\b/i.test(line)) continue;
        if (/^OBJECT\b/i.test(line)) continue; // ignore frmFieldObj etc.

        if (/^TITLE\s+"/i.test(line)) {
            const title = line.match(/^TITLE\s+"((?:\\.|[^"])*)"/i)?.[1] ?? "";
            widgets.push({ kind: "title", text: title.replace(/\\r/g, "\r").replace(/\\n/g, "\n") });
            continue;
        }

        if (/^LABEL\b/i.test(line)) {
            const text = line.match(/^LABEL\s+"((?:\\.|[^"])*)"/i)?.[1] ?? "";
            const at = parseAtSpec(line);
            if (!at) continue;
            const id = line.match(/\bID\s+(\d+)/i)?.[1];
            const font = line.match(/\bFONT\s+(\d+)/i)?.[1];
            widgets.push({
                kind: "label",
                text: text.replace(/\\r/g, "\r").replace(/\\n/g, "\n"),
                id: id != null ? Number(id) : undefined,
                at: { x: at.x, y: at.y },
                font: font != null ? Number(font) : undefined,
            });
            continue;
        }

        if (/^(BUTTON|PUSHBUTTON|CHECKBOX|POPUPTRIGGER|SELECTORTRIGGER|REPEATBUTTON|CONTROL|GRAPHICALCONTROL)\b/i.test(line)) {
            const text = line.match(/^.+?"((?:\\.|[^"])*)"/i)?.[1] ?? "";
            const at = parseAtSpec(line);
            if (!at) continue;
            const id = line.match(/\bID\s+(\d+)/i)?.[1];
            const hidden = /\bHIDDEN\b/i.test(line) || /\bNONUSABLE\b/i.test(line);
            const defaultBtn = id != null && form.defaultBtnId != null && Number(id) === form.defaultBtnId;
            const frame =
                /\bNOFRAME\b/i.test(line) ? "NOFRAME" :
                    /\bBOLDFRAME\b/i.test(line) ? "BOLDFRAME" :
                        /\bRECTFRAME\b/i.test(line) ? "RECTFRAME" :
                            /\bFRAME\b/i.test(line) ? "FRAME" : undefined;

            widgets.push({
                kind: "button",
                id: id != null ? Number(id) : undefined,
                text: text.replace(/\\r/g, "\r").replace(/\\n/g, "\n"),
                rect: {
                    x: getNumericPos(at.x),
                    y: getNumericPos(at.y),
                    w: at.w ?? 0,
                    h: at.h ?? 0,
                },
                hidden,
                defaultBtn,
                frame,
            });
            continue;
        }

        if (/^FIELD\b/i.test(line)) {
            const at = parseAtSpec(line);
            if (!at) continue;
            const id = line.match(/\bID\s+(\d+)/i)?.[1];
            const maxChars = line.match(/\bMAXCHARS\s+(\d+)/i)?.[1];
            widgets.push({
                kind: "field",
                id: id != null ? Number(id) : undefined,
                rect: {
                    x: getNumericPos(at.x),
                    y: getNumericPos(at.y),
                    w: at.w ?? 0,
                    h: at.h ?? 0,
                },
                maxChars: maxChars != null ? Number(maxChars) : undefined,
                editable: !/\bNONEDITABLE\b/i.test(line),
                singleLine: /\bSINGLELINE\b/i.test(line) || !/\bMULTIPLELINES\b/i.test(line),
            });
            continue;
        }

        if (/^FORMBITMAP\b/i.test(line)) {
            const at = parseAtSpec(line);
            const id = line.match(/\bBITMAP\s+(\d+)/i)?.[1];
            if (!at || id == null) continue;
            widgets.push({
                kind: "bitmap",
                id: Number(id),
                at: { x: getNumericPos(at.x), y: getNumericPos(at.y) },
                hidden: /\bHIDDEN\b/i.test(line) || /\bNONUSABLE\b/i.test(line),
            });
            continue;
        }

        if (/^LIST\b/i.test(line)) {
            const at = parseAtSpec(line);
            if (!at) continue;
            const id = line.match(/\bID\s+(\d+)/i)?.[1];
            const items = [...line.matchAll(/"((?:\\.|[^"])*)"/g)].map((m) =>
                m[1].replace(/\\r/g, "\r").replace(/\\n/g, "\n")
            );
            const visibleItems = line.match(/\bVISIBLEITEMS\s+(\d+)/i)?.[1];
            widgets.push({
                kind: "list",
                id: id != null ? Number(id) : undefined,
                rect: {
                    x: getNumericPos(at.x),
                    y: getNumericPos(at.y),
                    w: at.w ?? 0,
                    h: at.h ?? 0,
                },
                items,
                visibleItems: visibleItems != null ? Number(visibleItems) : undefined,
                search: /\bSEARCH\b/i.test(line),
            });
            continue;
        }

        if (/^TABLE\b/i.test(line)) {
            const at = parseAtSpec(line);
            if (!at) continue;
            const id = line.match(/\bID\s+(\d+)/i)?.[1];
            const numColumns = line.match(/\bNUMCOLUMNS\s+(\d+)/i)?.[1];
            const numRows = line.match(/\bNUMROWS\s+(\d+)/i)?.[1];
            widgets.push({
                kind: "table",
                id: id != null ? Number(id) : undefined,
                rect: {
                    x: getNumericPos(at.x),
                    y: getNumericPos(at.y),
                    w: at.w ?? 0,
                    h: at.h ?? 0,
                },
                numColumns: numColumns != null ? Number(numColumns) : undefined,
                numRows: numRows != null ? Number(numRows) : undefined,
            });
            continue;
        }

        if (/^SCROLLBAR\b/i.test(line)) {
            const at = parseAtSpec(line);
            if (!at) continue;
            widgets.push({
                kind: "scrollbar",
                id: line.match(/\bID\s+(\d+)/i)?.[1]
                    ? Number(line.match(/\bID\s+(\d+)/i)![1])
                    : undefined,
                rect: {
                    x: getNumericPos(at.x),
                    y: getNumericPos(at.y),
                    w: at.w ?? 0,
                    h: at.h ?? 0,
                },
                value: line.match(/\bVALUE\s+(-?\d+)/i)?.[1]
                    ? Number(line.match(/\bVALUE\s+(-?\d+)/i)![1])
                    : undefined,
                minValue: line.match(/\bMINVALUE\s+(-?\d+)/i)?.[1]
                    ? Number(line.match(/\bMINVALUE\s+(-?\d+)/i)![1])
                    : undefined,
                maxValue: line.match(/\bMAXVALUE\s+(-?\d+)/i)?.[1]
                    ? Number(line.match(/\bMAXVALUE\s+(-?\d+)/i)![1])
                    : undefined,
                pageSize: line.match(/\bPAGESIZE\s+(-?\d+)/i)?.[1]
                    ? Number(line.match(/\bPAGESIZE\s+(-?\d+)/i)![1])
                    : undefined,
            });
            continue;
        }

        if (/^SLIDER\b/i.test(line)) {
            const at = parseAtSpec(line);
            if (!at) continue;
            widgets.push({
                kind: "slider",
                id: line.match(/\bID\s+(\d+)/i)?.[1]
                    ? Number(line.match(/\bID\s+(\d+)/i)![1])
                    : undefined,
                rect: {
                    x: getNumericPos(at.x),
                    y: getNumericPos(at.y),
                    w: at.w ?? 0,
                    h: at.h ?? 0,
                },
                minValue: line.match(/\bMINVALUE\s+(-?\d+)/i)?.[1]
                    ? Number(line.match(/\bMINVALUE\s+(-?\d+)/i)![1])
                    : undefined,
                maxValue: line.match(/\bMAXVALUE\s+(-?\d+)/i)?.[1]
                    ? Number(line.match(/\bMAXVALUE\s+(-?\d+)/i)![1])
                    : undefined,
                value: line.match(/\bVALUE\s+(-?\d+)/i)?.[1]
                    ? Number(line.match(/\bVALUE\s+(-?\d+)/i)![1])
                    : undefined,
                vertical: /\bVERTICAL\b/i.test(line),
                thumbId: line.match(/\bTHUMBID\s+(\d+)/i)?.[1]
                    ? Number(line.match(/\bTHUMBID\s+(\d+)/i)![1])
                    : undefined,
                backgroundId: line.match(/\bBACKGROUNDID\s+(\d+)/i)?.[1]
                    ? Number(line.match(/\bBACKGROUNDID\s+(\d+)/i)![1])
                    : undefined,
                feedback: /\bFEEDBACK\b/i.test(line),
            });
            continue;
        }

        if (/^GADGET\b/i.test(line)) {
            const at = parseAtSpec(line);
            if (!at) continue;
            widgets.push({
                kind: "gadget",
                id: line.match(/\bID\s+(\d+)/i)?.[1]
                    ? Number(line.match(/\bID\s+(\d+)/i)![1])
                    : undefined,
                rect: {
                    x: getNumericPos(at.x),
                    y: getNumericPos(at.y),
                    w: at.w ?? 0,
                    h: at.h ?? 0,
                },
                extended: /\bEXTENDED\b/i.test(line),
            });
            continue;
        }

        if (/^LINE\b/i.test(line) || /^FRAME\b/i.test(line) || /^RECTANGLE\b/i.test(line)) {
            const at = parseAtSpec(line);
            if (!at) continue;
            const kind = line.split(/\s+/)[0].toLowerCase() as "line" | "frame" | "rectangle";
            widgets.push({
                kind,
                rect: {
                    x: getNumericPos(at.x),
                    y: getNumericPos(at.y),
                    w: at.w ?? 0,
                    h: at.h ?? 0,
                },
            });
            continue;
        }
    }

    return widgets;
}

export interface PalmFormVisualizerProps {
    pilrcText: string;
    renderBitmap?: (id: number | string) => HTMLImageElement | string | null;
    // Pass your loaded Construct 3 PNG spritesheet here
    fontImage?: HTMLImageElement | null;
}

// 1. Build the lookup map from your Construct 3 Spacing Data
const buildCharWidthMap = () => {
    const map: Record<string, number> = {};
    const data: [number, string][] = [
        [3.0, " "], [4.0, "!'.:Iil|"], [7.0, "\"()-EFJcrstz{}"], [13.0, "#%@MWm"],
        [10.0, "$*+<=>DGHKNTUVXYZ^vwxy"], [11.0, "&OQ~"], [5.0, ",1;[]`j"],
        [8.0, "/023456789?ABCLPRS\\_abdefghknopqu"]
    ];

    data.forEach(([width, chars]) => {
        for (let i = 0; i < chars.length; i++) {
            map[chars[i]] = width;
        }
    });
    return map;
};

const CHAR_WIDTHS = buildCharWidthMap();
const DEFAULT_CHAR_WIDTH = 8;

// 2. Exact pixel-width estimator
const measureBitmapText = (text: string) => {
    let width = 0;
    for (const char of text) {
        width += CHAR_WIDTHS[char] || DEFAULT_CHAR_WIDTH;
    }
    return width;
};

interface PalmGlyph {
    width: number;          // raster width (pixels)
    rows: string[];         // pixel rows (. and @)
    rightBearing?: number;  // from per-glyph property
    leftBearing?: number;
    shiftUp?: number;       // vertical offset
    scalableWidth?: number; // overrides advance if present
}

type PalmFont = {
    ascent: number;
    descent: number;
    lineHeight: number;
    defaultChar: string;
    glyphs: Map<string, PalmGlyph>;
};

let palmFontPromise: Promise<PalmFont> | null = null;

export function loadPalmOSFont(url = "/PalmOS-Standard.yaff"): Promise<PalmFont> {
    if (!palmFontPromise) {
        palmFontPromise = fetch(url).then(async (res) => {
            if (!res.ok) {
                throw new Error(`Failed to load Palm OS font: ${res.status} ${res.statusText}`);
            }
            const text = await res.text();
            console.info("Yaff Loaded!");
            return parsePalmOSYaff(text);
        });
    }

    return palmFontPromise;
}
function isGlyphLabel(raw: string): boolean {
    const first = raw.charAt(0);
    return (
        /^\d/.test(raw) ||                     // e.g. 0x20, 32
        first === "'" ||                       // 'A'
        first === '"' ||                       // "latin_a"
        raw.toLowerCase().startsWith("u+")     // u+0041
    );
}

function normalizeLabel(raw: string): string {
    // Strip surrounding quotes (single or double)
    if (
        (raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'"))
    ) {
        raw = raw.slice(1, -1);
    }

    // Codepoint labels (e.g., 0x20, 32, 0o40) → canonical "0x" + uppercase hex
    if (/^\d/.test(raw) || /^0[xX]/i.test(raw)) {
        let num: number;
        if (raw.startsWith("0x") || raw.startsWith("0X")) {
            num = parseInt(raw.slice(2), 16);
        } else if (raw.startsWith("0o") || raw.startsWith("0O")) {
            num = parseInt(raw.slice(2), 8);
        } else {
            num = parseInt(raw, 10);
        }
        return "0x" + num.toString(16).toUpperCase().padStart(2, "0");
    }

    // Unicode character labels (e.g., u+0041) → actual character
    if (raw.toLowerCase().startsWith("u+")) {
        const hex = raw.slice(2);
        const cp = parseInt(hex, 16);
        return String.fromCodePoint(cp);
    }

    // Everything else (plain characters, tags without quotes) stays as‑is
    return raw;
}

function parsePalmOSYaff(text: string): PalmFont {
    const lines = text.replace(/\r/g, "").split("\n");
    const meta = new Map<string, string>();
    const glyphs = new Map<string, PalmGlyph>();

    let i = 0;
    let inProperties = true;

    while (i < lines.length) {
        const line = lines[i];

        // Skip blank lines and comments
        if (!line.trim() || line.trim().startsWith("#")) {
            i++;
            continue;
        }

        // Try to detect a glyph label first
        const labelMatch = /^([^:]+):\s*$/.exec(line);
        if (labelMatch) {
            const rawLabel = labelMatch[1].trim();
            if (isGlyphLabel(rawLabel)) {
                if (inProperties) {
                    inProperties = false; // switch to glyph mode
                }
                // Parse the glyph starting at i
                i = parseGlyph(lines, i, rawLabel, glyphs);
                continue;
            }
        }

        // Global properties
        if (inProperties) {
            const propMatch = /^([\w.-]+):\s*(.*)?$/.exec(line);
            if (propMatch) {
                const key = propMatch[1].toLowerCase().replace(/-/g, "_");
                let value = propMatch[2]?.trim() ?? "";
                if (value === "") {
                    i++;
                    const valueLines: string[] = [];
                    while (i < lines.length && /^\s/.test(lines[i])) {
                        valueLines.push(lines[i].trim());
                        i++;
                    }
                    value = valueLines.join("\n");
                    if (value.startsWith('"') && value.endsWith('"')) {
                        value = value.slice(1, -1);
                    }
                    meta.set(key, value);
                    continue;
                }
                meta.set(key, value);
                i++;
                continue;
            }
            // Line not a property or label → switch to glyphs anyway
            inProperties = false;
            continue;
        }

        // Unknown line in glyph area – skip
        i++;
    }

    return {
        ascent: Number(meta.get("ascent") ?? 9),
        descent: Number(meta.get("descent") ?? 2),
        lineHeight: Number(meta.get("line_height") ?? 11),
        defaultChar: meta.get("default_char") ?? "missing",
        glyphs,
    };
}

// Move the glyph parsing into its own function
function parseGlyph(
    lines: string[],
    startIdx: number,
    rawLabel: string,
    glyphs: Map<string, PalmGlyph>
): number {
    let i = startIdx + 1; // skip the label line
    const rows: string[] = [];
    let rightBearing, leftBearing, shiftUp, scalableWidth: number | undefined;
    let emptyGlyph = false;

    while (i < lines.length) {
        const l = lines[i];
        if (!/^\s/.test(l)) break;

        const trimmed = l.trim();
        if (trimmed === "") {
            i++;
            continue;
        }

        if (/^[\w.-]+\s*:/.test(trimmed)) {
            const [pKey, pVal] = trimmed.split(":").map(s => s.trim());
            switch (pKey.toLowerCase().replace(/-/g, "_")) {
                case "right_bearing": case "tracking": rightBearing = Number(pVal); break;
                case "left_bearing": leftBearing = Number(pVal); break;
                case "shift_up": case "offset": shiftUp = Number(pVal.split(/\s+/)[1] ?? pVal); break;
                case "scalable_width": scalableWidth = Number(pVal); break;
            }
            i++;
            continue;
        }

        if (trimmed === "-") {
            emptyGlyph = true;
            i++;
            break;
        }

        if (!/^[.@\s]+$/.test(trimmed)) break;

        rows.push(l.replace(/^\s+/, ""));
        i++;
    }

    // Use the normalizeLabel that is accessible (we'll pass it or define outside)
    const key = normalizeLabel(rawLabel);
    if (rows.length > 0) {
        const width = Math.max(...rows.map(r => r.length));
        const glyph: PalmGlyph = { width, rows };
        if (rightBearing !== undefined) glyph.rightBearing = rightBearing;
        if (leftBearing !== undefined) glyph.leftBearing = leftBearing;
        if (shiftUp !== undefined) glyph.shiftUp = shiftUp;
        if (scalableWidth !== undefined) glyph.scalableWidth = scalableWidth;
        glyphs.set(key, glyph);
    } else if (emptyGlyph) {
        glyphs.set(key, { width: 0, rows: [] });
    }
    return i;
}

function codepointKey(ch: string): string {
    const cp = ch.codePointAt(0);
    if (cp == null) return "missing";
    return "0x" + cp.toString(16).toUpperCase().padStart(2, "0");
}

function resolveGlyph(font: PalmFont, ch: string): PalmGlyph | undefined {
    return (
        font.glyphs.get(codepointKey(ch)) ??
        font.glyphs.get(ch) ??
        font.glyphs.get(font.defaultChar) ??
        font.glyphs.get("missing")
    );
}

function getAdvanceWidth(glyph: PalmGlyph, scale: number): number {
    if (glyph.scalableWidth !== undefined) return glyph.scalableWidth * scale;
    const l = glyph.leftBearing ?? 0;
    const r = glyph.rightBearing ?? 0;
    return (l + glyph.width + r) * scale;
}

function drawGlyph(
    ctx: CanvasRenderingContext2D,
    glyph: PalmGlyph,
    x: number,         // left edge (pixels)
    topY: number,      // top of glyph raster (pixels)
    color: string,
    scale: number
) {
    ctx.save();
    ctx.fillStyle = color;

    for (let row = 0; row < glyph.rows.length; row++) {
        const line = glyph.rows[row];
        for (let col = 0; col < glyph.width; col++) {
            if (col < line.length && line[col] === "@") {
                ctx.fillRect(
                    x + col * scale,
                    topY + row * scale,
                    scale,
                    scale
                );
            }
        }
    }

    ctx.restore();
}

export async function drawPalmOSText(
    ctx: CanvasRenderingContext2D,
    text: string,
    baselineX: number,
    baselineY: number,   // <-- changed: this is now the baseline
    opts: {
        color?: string;
        scale?: number;
        lineGap?: number;
    } = {}
): Promise<void> {
    const font = await loadPalmOSFont();
    const color = opts.color ?? "#000000";
    const scale = Math.max(1, Math.floor(opts.scale ?? 1));
    const lineGap = opts.lineGap ?? 0;

    let penY = baselineY;

    for (const line of text.split("\n")) {
        let penX = baselineX;

        for (const ch of [...line]) {
            const glyph = resolveGlyph(font, ch);
            if (!glyph) continue;

            const topY = penY - font.ascent * scale;   // <-- raster top
            drawGlyph(ctx, glyph, penX, topY, color, scale);

            penX += getAdvanceWidth(glyph, scale);
        }

        penY += (font.lineHeight + lineGap) * scale;
    }
}

export async function measurePalmOSText(
    text: string,
    opts: { scale?: number; lineGap?: number } = {}
): Promise<{ width: number; height: number }> {
    const font = await loadPalmOSFont();
    const scale = Math.max(1, Math.floor(opts.scale ?? 1));
    const lineGap = opts.lineGap ?? 0;

    const lines = text.split("\n");
    let maxWidth = 0;

    for (const line of lines) {
        let w = 0;
        for (const ch of [...line]) {
            const glyph = resolveGlyph(font, ch);
            if (glyph) w += getAdvanceWidth(glyph, scale);
        }
        maxWidth = Math.max(maxWidth, w);
    }

    const height = lines.length * (font.lineHeight + lineGap) * scale;
    return { width: maxWidth, height };
}

export const PalmFormVisualizer = ({ pilrcText, renderBitmap, fontImage }: PalmFormVisualizerProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const form = useMemo(() => {
        const header = parseFormHeader(pilrcText);
        const widgets = parseWidgets(pilrcText, header);
        return { header, widgets };
    }, [pilrcText]);

    const outerW = 320;
    const outerH = 320;
    const formBounds = form.header.bounds;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.imageSmoothingEnabled = false;

        const render = async () => {
            const font = await loadPalmOSFont();
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const measureTextWidth = async (text: string, scale: number) => {
                const { width } = await measurePalmOSText(text, { scale });
                return width;
            };

            const drawBitmapText = async (
                text: string,
                x: number,
                y: number,
                isBold = false,
                invert = false
            ) => {
                const scale = 1;
                const color = invert ? "#fff" : "#000";
                const baselineY = y + font.ascent * scale;
                await drawPalmOSText(ctx, text, x, baselineY, { color, scale });
            };

            // --- Form background ---
            ctx.fillStyle = "#fff";
            ctx.fillRect(formBounds.x, formBounds.y, formBounds.w, formBounds.h);

            const drawDottedLine = (x: number, y: number, w: number) => {
                ctx.beginPath();
                ctx.strokeStyle = "#000";
                ctx.lineWidth = 1;
                ctx.setLineDash([1, 1]);
                ctx.moveTo(x, y + 0.5);
                ctx.lineTo(x + w, y + 0.5);
                ctx.stroke();
                ctx.setLineDash([]);
            };

            const drawButtonRect = (x: number, y: number, w: number, h: number) => {
                ctx.fillStyle = "#000";
                ctx.fillRect(x + 1, y, w - 2, 1);
                ctx.fillRect(x + 1, y + h - 1, w - 2, 1);
                ctx.fillRect(x, y + 1, 1, h - 2);
                ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
            };

            if (form.header.modal) {
                ctx.strokeStyle = "#00007f";
                ctx.lineWidth = 2;
                // drawButtonRect(formBounds.x - 1, formBounds.y - 1, formBounds.w + 2, formBounds.h + 2)
                ctx.strokeRect(formBounds.x - 1, formBounds.y - 1, formBounds.w + 2, formBounds.h + 2);
            }

            // --- Draw shapes & text (no bitmaps – they are handled in React) ---
            for (const w of form.widgets) {
                const xOffset = formBounds.x;
                const yOffset = formBounds.y;

                switch (w.kind) {
                    case "title": {
                        ctx.fillStyle = "#00007f";
                        ctx.fillRect(xOffset, yOffset, formBounds.w, 12);

                        const titleText = w.text.replace(/\r/g, "\n");
                        const scale = 1;
                        const textWidth = await measureTextWidth(titleText, scale);
                        const textHeight = font.lineHeight * scale; // 11px

                        // Center horizontally in the title bar
                        const textX = Math.round(xOffset + (formBounds.w - textWidth) / 2);
                        // Center vertically within the 12px bar
                        const textTopY = Math.round(yOffset + (12 - textHeight) / 2);

                        await drawBitmapText(titleText, textX, textTopY, true, true);
                        break;
                    }

                    case "label": {
                        const rawText = w.text.replace(/\r/g, "\n");
                        const isBold = w.font === 1 || w.font === 3;
                        const scale = 1;
                        const textWidth = await measureTextWidth(rawText, scale);
                        const width = textWidth + (isBold ? rawText.length : 0);

                        const labelX = resolveCoord(w.at.x, width, formBounds.w, width);
                        const labelY = resolveCoord(w.at.y, 11 + 2, formBounds.h, 11 + 2);

                        await drawBitmapText(rawText, xOffset + labelX, yOffset + labelY, isBold);
                        break;
                    }

                    case "line":
                        ctx.fillStyle = "#000";
                        ctx.fillRect(xOffset + w.rect.x, yOffset + w.rect.y, Math.max(1, w.rect.w), 1);
                        break;

                    case "field": {
                        // Assuming fields have an x, y, and w property
                        const fw = w.rect?.w || w.rect?.w || 50;
                        drawDottedLine(xOffset + w.rect?.x, yOffset + w.rect?.y + 11, fw);
                        break;
                    }

                    case "button": {
                        const bx = xOffset + w.rect?.x;
                        const by = yOffset + w.rect?.y;
                        const bw = w.rect?.w || 30;
                        const bh = w.rect?.h || 12;

                        drawButtonRect(bx, by, bw, bh);

                        const rawText = w.text.replace(/\r/g, "\n");
                        const scale = 1;
                        const textWidth = await measureTextWidth(rawText, scale);
                        const textHeight = font.lineHeight * scale; // 11px

                        // Center and round to integer pixels to avoid sub‑pixel blur
                        const textX = Math.round(bx + (bw - textWidth) / 2);
                        const textTopY = Math.round(by + (bh - textHeight) / 2);

                        await drawBitmapText(rawText, textX, textTopY, false);
                        break;
                    }

                    case "frame":
                    case "rectangle":
                    case "list":
                    case "table":
                    case "scrollbar":
                    case "slider":
                        ctx.strokeStyle = "#000";
                        ctx.lineWidth = 1;
                        ctx.strokeRect(xOffset + w.rect.x, yOffset + w.rect.y, w.rect.w, w.rect.h);
                        break;

                    case "gadget":
                        ctx.fillStyle = "rgba(0,0,0,0.05)";
                        ctx.fillRect(xOffset + w.rect.x, yOffset + w.rect.y, w.rect.w, w.rect.h);
                        ctx.strokeStyle = "#000";
                        ctx.lineWidth = 1;
                        ctx.setLineDash([2, 2]);
                        ctx.strokeRect(xOffset + w.rect.x, yOffset + w.rect.y, w.rect.w, w.rect.h);
                        ctx.setLineDash([]);
                        break;

                }
            }
        };

        render();
    }, [form, renderBitmap, fontImage, formBounds]);

    return (
        <Box
            sx={{
                width: outerW,
                height: outerH,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                bgcolor: "#e0e0e0",
                borderRadius: 1,
            }}
        >
            <Box
                sx={{
                    width: 160,
                    height: 160,
                    position: "relative",
                    transform: "scale(2)",
                    transformOrigin: "center center",
                    boxShadow: "0px 4px 12px rgba(0,0,0,0.15)",
                    backgroundImage: "radial-gradient(#d3d3d3 1px, transparent 1px)",
                    backgroundSize: "4px 4px",
                    bgcolor: "#fff",
                }}
            >
                <canvas
                    ref={canvasRef}
                    width={160}
                    height={160}
                    style={{
                        display: "block",
                        width: "100%",
                        height: "100%",
                        imageRendering: "pixelated",
                    }}
                />

                {/* Overlay for bitmaps – uses the same coordinate system as the canvas */}
                <Box
                    position="absolute"
                    top={0}
                    left={0}
                    width="100%"
                    height="100%"
                    sx={{ pointerEvents: "none" }}
                >
                    {form.widgets
                        .filter((w) => w.kind === "bitmap")
                        .map((w) => {
                            const bitX = w.at.x + formBounds.x;
                            const bitY = w.at.y + formBounds.y;
                            return (
                                <Box
                                    key={`bitmap-${w.id}-${bitX}-${bitY}`}
                                    position="absolute"
                                    left={bitX}
                                    top={bitY}
                                >
                                    {renderBitmap ? renderBitmap(w.id) : null}
                                </Box>
                            );
                        })}
                </Box>
            </Box>
        </Box>
    );
};


interface PalmAlertVisualizerProps {
    pilrcText: string;
}

export const PalmAlertVisualizer = ({ pilrcText }: PalmAlertVisualizerProps) => {
    const alert = useMemo(() => {
        const data = {
            type: "INFORMATION",
            title: "",
            message: "",
            buttons: [] as string[]
        };

        // Ensure we are working with a string
        const text = String(pilrcText || "");
        if (!text) return data;

        // 1. Extract Alert Type using simple includes (ignores boundary quirks)
        const upperText = text.toUpperCase();
        if (upperText.includes("CONFIRMATION")) data.type = "CONFIRMATION";
        else if (upperText.includes("WARNING")) data.type = "WARNING";
        else if (upperText.includes("ERROR")) data.type = "ERROR";
        else if (upperText.includes("INFORMATION")) data.type = "INFORMATION";

        // 2. Extract Title: Looks for "TITLE", skips any junk (even newlines or missing spaces), and grabs the first quoted string
        const titleMatch = text.match(/TITLE[^"]*"([^"]*)"/i);
        if (titleMatch) data.title = titleMatch[1];

        // 3. Extract Message: Same logic, but unescapes PilRC newlines
        const msgMatch = text.match(/MESSAGE[^"]*"([^"]*)"/i);
        if (msgMatch) {
            data.message = msgMatch[1].replace(/\\n/g, '\n').replace(/\\r/g, '');
        }

        // 4. Extract Buttons: Find where "BUTTONS" starts, then grab every quoted string after it
        const buttonsIndex = upperText.indexOf("BUTTONS");
        if (buttonsIndex !== -1) {
            const buttonsSection = text.slice(buttonsIndex);
            const btnMatches = buttonsSection.match(/"([^"]*)"/g);
            if (btnMatches) {
                // Remove the actual quotes from the matched strings
                data.buttons = btnMatches.map(b => b.replace(/"/g, ''));
            }
        }

        return data;
    }, [pilrcText]);

    // Render a simple 1-bit icon based on the alert type
    const renderIcon = () => {
        let symbol = "i";
        if (alert.type === "CONFIRMATION") symbol = "?";
        if (alert.type === "WARNING") symbol = "!";
        if (alert.type === "ERROR") symbol = "X";

        return (
            <Box sx={{
                width: 18,
                height: 18,
                border: '2px solid #000',
                borderRadius: alert.type === "WARNING" ? '0' : '50%', // Square for warning, circle for others
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '12px',
                fontFamily: 'serif',
                color: '#000',
                flexShrink: 0,
            }}>
                {symbol}
            </Box>
        );
    };

    return (
        <Box sx={{ width: 320, height: 320, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: '#e0e0e0', borderRadius: 1 }}>
            {/* Base Screen (160x160 scaled 2x) */}
            <Box sx={{
                width: 160, height: 160, backgroundColor: '#ffffff', position: 'relative',
                transform: 'scale(2)', border: '1px solid #999', boxShadow: '0px 4px 12px rgba(0,0,0,0.15)',
                fontFamily: 'sans-serif', overflow: 'hidden', boxSizing: 'border-box',
                // Add a subtle dot pattern to simulate background screen
                backgroundImage: 'radial-gradient(#d3d3d3 1px, transparent 1px)',
                backgroundSize: '4px 4px'
            }}>

                {/* Alert Modal Dialog */}
                <Box sx={{
                    position: 'absolute',
                    left: 2, right: 2, bottom: 2, // Alerts typically anchor near the bottom
                    border: '2px solid #000',
                    backgroundColor: '#fff',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                    boxShadow: '1px 1px 0px #000', // Classic Palm OS hard drop shadow
                    display: 'flex',
                    flexDirection: 'column',
                    p: 1,
                    gap: 1
                }}>
                    {/* Header: Icon + Title */}
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                        {renderIcon()}
                        <Box sx={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: '#000',
                            lineHeight: '14px',
                            mt: '2px'
                        }}>
                            {alert.title}
                        </Box>
                    </Box>

                    {/* Message Body */}
                    <Box sx={{
                        fontSize: '7px',
                        fontWeight: 400,
                        color: '#000',
                        whiteSpace: 'pre-wrap',
                        lineHeight: '12px',
                        letterSpacing: '-0.2px',
                        pl: '26px' // Indent to align with text next to the icon
                    }}>
                        {alert.message}
                    </Box>

                    {/* Buttons Row */}
                    <Box sx={{
                        display: 'flex',
                        gap: '6px',
                        pl: '26px', // Indent buttons as well
                        mt: 0.5,
                        flexWrap: 'wrap'
                    }}>
                        {alert.buttons.map((btn, i) => (
                            <Box key={`btn-${i}`} sx={{
                                border: '1px solid #000',
                                borderRadius: '4px',
                                backgroundColor: i === 0 ? '#000' : '#fff', // Typically the first button is filled/default
                                color: i === 0 ? '#fff' : '#000',
                                fontSize: '7px',
                                fontWeight: 700,
                                px: 1,
                                py: '2px',
                                minWidth: '24px',
                                textAlign: 'center'
                            }}>
                                {btn}
                            </Box>
                        ))}
                    </Box>
                </Box>

            </Box>
        </Box>
    );
};

interface PalmMenuVisualizerProps {
    pilrcText: string;
}

type MenuItem = {
    separator: boolean;
    id?: number;
    text?: string;
    command?: string;
};

type MenuPulldown = {
    title: string;
    items: MenuItem[];
};

type ParsedMenu = {
    resourceId: string;
    pulldowns: MenuPulldown[];
};

function unescapePilrcString(text: string): string {
    return text
        .replace(/\\r/g, "\r")
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
}

function parseMenuResource(pilrcText: string): ParsedMenu {
    const result: ParsedMenu = {
        resourceId: "ID",
        pulldowns: [],
    };

    const text = String(pilrcText || "");
    if (!text) return result;

    const headerMatch = text.match(/MENU\s+ID\s+([^\n]+)\s+BEGIN/i);
    if (headerMatch) {
        result.resourceId = headerMatch[1].trim();
    }

    const pulldownRegex = /PULLDOWN\s+"((?:\\.|[^"])*)"\s*\n\s*BEGIN([\s\S]*?)\n\s*END/gim;
    let pulldownMatch: RegExpExecArray | null;

    while ((pulldownMatch = pulldownRegex.exec(text)) !== null) {
        const title = unescapePilrcString(pulldownMatch[1].trim());
        const body = pulldownMatch[2];

        const items: MenuItem[] = [];

        const lines = body
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        for (const line of lines) {
            if (/^MENUITEM\s+SEPARATOR$/i.test(line)) {
                items.push({ separator: true });
                continue;
            }

            const itemMatch = line.match(
                /^MENUITEM\s+"((?:\\.|[^"])*)"\s+ID\s+([0-9+-]+)(?:\s+"((?:\\.|[^"])*)")?$/i
            );

            if (itemMatch) {
                items.push({
                    separator: false,
                    text: unescapePilrcString(itemMatch[1].trim()),
                    id: Number(itemMatch[2]),
                    command: itemMatch[3] ? unescapePilrcString(itemMatch[3]).slice(0, 1) : undefined,
                });
            }
        }

        result.pulldowns.push({ title, items });
    }

    return result;
}

export const PalmMenuVisualizer = ({ pilrcText }: PalmMenuVisualizerProps) => {
    const menu = useMemo(() => parseMenuResource(pilrcText), [pilrcText]);

    const [openIndex, setOpenIndex] = useState<number | null>(null);

    useEffect(() => {
        setOpenIndex(null);
    }, [pilrcText]);

    const titleLayout = useMemo(() => {
        let x = 4;
        return menu.pulldowns.map((pd) => {
            const w = Math.max(28, Math.min(56, Math.round(pd.title.length * 4.5 + 10)));
            const item = { x, w };
            x += w;
            return item;
        });
    }, [menu.pulldowns]);

    const activePulldown = openIndex !== null ? menu.pulldowns[openIndex] : null;
    const activeLayout = openIndex !== null ? titleLayout[openIndex] : null;

    const screenWidth = 160;
    const dropdownWidth = 120;

    const dropdownLeft =
        activeLayout
            ? Math.max(2, Math.min(activeLayout.x, screenWidth - dropdownWidth - 2))
            : 2;

    return (
        <Box
            sx={{
                width: 320,
                height: 320,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                bgcolor: "#e0e0e0",
                borderRadius: 1,
            }}
        >
            <Box
                sx={{
                    width: 160,
                    height: 160,
                    backgroundColor: "#ffffff",
                    position: "relative",
                    transform: "scale(2)",
                    transformOrigin: "center center",
                    border: "1px solid #999",
                    boxShadow: "0px 4px 12px rgba(0,0,0,0.15)",
                    fontFamily: "sans-serif",
                    overflow: "hidden",
                    boxSizing: "border-box",
                    backgroundImage: "radial-gradient(#d3d3d3 1px, transparent 1px)",
                    backgroundSize: "4px 4px",
                }}
            >
                <Box
                    sx={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 13,
                        bgcolor: "#fff",
                        borderBottom: "1px solid #000",
                        display: "flex",
                        alignItems: "center",
                        px: "2px",
                        gap: "1px",
                        zIndex: 2,
                        boxSizing: "border-box",
                    }}
                >
                    {menu.pulldowns.map((pd, index) => {
                        const layout = titleLayout[index];
                        const isOpen = openIndex === index;

                        return (
                            <Box
                                key={`${pd.title}-${index}`}
                                onClick={() => setOpenIndex((current) => (current === index ? null : index))}
                                sx={{
                                    position: "absolute",
                                    left: `${layout.x}px`,
                                    top: "1px",
                                    width: `${layout.w}px`,
                                    height: "10px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "7px",
                                    fontWeight: 700,
                                    bgcolor: isOpen ? "#000" : "transparent",
                                    color: isOpen ? "#fff" : "#000",
                                    border: "1px solid transparent",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                    userSelect: "none",
                                    lineHeight: 1,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {pd.title}
                            </Box>
                        );
                    })}
                </Box>

                {activePulldown && (
                    <Box
                        sx={{
                            position: "absolute",
                            top: "13px",
                            left: `${dropdownLeft}px`,
                            width: `${dropdownWidth}px`,
                            bgcolor: "#fff",
                            border: "1px solid #000",
                            boxShadow: "1px 1px 0px #000",
                            zIndex: 3,
                            boxSizing: "border-box",
                            pb: "1px",
                        }}
                    >

                        <Box sx={{ py: "1px" }}>
                            {activePulldown.items.map((item, itemIndex) => {
                                if (item.separator) {
                                    return (
                                        <Box
                                            key={`sep-${itemIndex}`}
                                            sx={{
                                                height: "5px",
                                                my: "1px",
                                                mx: "3px",
                                                borderTop: "1px solid #000",
                                            }}
                                        />
                                    );
                                }

                                const label = item.text || "";
                                const command = item.command ? `  [${item.command}]` : "";

                                return (
                                    <Box
                                        key={`item-${itemIndex}`}
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            px: "3px",
                                            py: "1px",
                                            fontSize: "7px",
                                            lineHeight: "10px",
                                            color: "#000",
                                            cursor: "pointer",
                                            userSelect: "none",
                                            "&:hover": {
                                                bgcolor: "#000",
                                                color: "#fff",
                                            },
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                minWidth: 0,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                                pr: "4px",
                                            }}
                                        >
                                            {label}
                                        </Box>
                                        <Box sx={{ flexShrink: 0, opacity: item.command ? 1 : 0.35 }}>
                                            {item.id !== undefined ? item.id : ""}
                                            {command}
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export interface PrcExplorerPanelProps {
    /** Database to inspect (embedding case). If omitted, only upload is available. */
    database?: RawPdbDatabase | RawPrcDatabase | null;
    /** Show the local file upload button. Default true. */
    enableFileUpload?: boolean;
    [key: string]: unknown;
}

export function PrcExplorerPanel({
                                     database: externalDb,
                                     enableFileUpload = true,
                                     ...panelProps
                                 }: PrcExplorerPanelProps) {
    const [localDb, setLocalDb] = useState<RawPdbDatabase | RawPrcDatabase | null>(null);
    const [openTypes, setOpenTypes] = useState<Record<string, boolean>>({});
    const [selectedRecord, setSelectedRecord] = useState<ResourceRecord | null>(null);

    // If an external database is provided (embedding case), clear local state.
    useEffect(() => {
        if (externalDb) {
            setLocalDb(null);
            setSelectedRecord(null);
            setOpenTypes({});
        }
        // 3. Create a new image object
        const img = new Image();

        // 4. Set the source to trigger the download
        img.src = fontSpritesheet;

        // 5. Wait for it to finish loading, then save it to state
        img.onload = () => {
            setLoadedFont(img);
            console.info("Loaded Palm OS Font");
        };

        // Optional: Handle loading errors so your app doesn't silently fail
        img.onerror = () => {
            console.error("Failed to load the retro font spritesheet.");
        };
    }, [externalDb]);

    const activeDb = externalDb ?? localDb;

    const handleRenderFormBitmap = (resourceId: number) => {
        if (!activeDb || !activeDb.records) return null;

        // Look up the specific record by the resourceId extracted from the PilRC text
        const imageRecord = (activeDb.records as ResourceRecord[]).find(
            (r) => r.entry.resourceId === resourceId && (r.entry.type === "Tbmp" || r.entry.type === "tAIB")
        );

        if (!imageRecord) {
            return null; // Will fallback to the green placeholder block
        }

        // Decode the raw buffer using the already imported extractor
        const decodedBitmaps = extractAllTAIBBitmapsFromResource(toUint8Array(imageRecord.data));

        // Forms usually use the first bitmap variant
        const targetBmp = decodedBitmaps
            .filter((x) => x.density == 72)
            .sort((a,b)=> a < b ? 1:-1)
            .at(0);

        if (!targetBmp) {
            return null;
        }

        return <PalmIcon bitmap={targetBmp} scale={1} />;
    };

    // --- file upload (only used when enableFileUpload is true) ---
    const handleInspectFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.name.endsWith(".prc") && !file.name.endsWith(".pdb")) {
            alert("Please select a valid Palm .prc or .pdb file");
            return;
        }
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                const fileBuffer = Buffer.from(arrayBuffer);
                const header = DatabaseHdrType.from(fileBuffer);
                const parsed = header.attributes.resDB
                    ? RawPrcDatabase.from(fileBuffer)
                    : RawPdbDatabase.from(fileBuffer);
                setLocalDb(parsed);
                setSelectedRecord(null);
                setOpenTypes({});
            };
            reader.readAsArrayBuffer(file);
        } catch (error) {
            console.error("Error parsing uploaded file:", error);
            alert("Could not load or parse the file. See console for details.");
        }
    };

    // --- resource grouping ---
    const groupedResources = useMemo(() => {
        if (!activeDb?.records) return {};
        const groups: Record<string, ResourceRecord[]> = {};
        for (const rec of activeDb.records as ResourceRecord[]) {
            const type = rec.entry?.type ?? "unknown";
            (groups[type] ??= []).push(rec);
        }
        return Object.keys(groups)
            .sort()
            .reduce((acc, key) => {
                acc[key] = groups[key].sort((a, b) => a.entry.resourceId - b.entry.resourceId);
                return acc;
            }, {} as Record<string, ResourceRecord[]>);
    }, [activeDb]);

    // --- decoders & extractors (only run when selected record matches) ---
    const selectedTSTR = useMemo(() => {
        if (!selectedRecord || (selectedRecord.entry.type !== "tSTR" && selectedRecord.entry.type !== "tver"))
            return "";
        return decodeTSTR(selectedRecord.data);
    }, [selectedRecord]);

    const selectedTSTL = useMemo(() => {
        if (!selectedRecord || selectedRecord.entry.type !== "tSTL") {
            return [""];
        }
        return decodeTSTL(selectedRecord.data);
    }, [selectedRecord]);

    const selectedAlert = useMemo(() => {
        if (!selectedRecord || selectedRecord.entry.type !== "Talt") {
            return "";
        }
        // Assuming your selectedRecord includes the resource ID in `.entry.id`
        const resId = selectedRecord.entry.resourceId || "UNKNOWN_ID";
        return decodeAlert(selectedRecord.data, resId);
    }, [selectedRecord]);

    const selectedTFRM = useMemo(() => {
        if (!selectedRecord || selectedRecord.entry.type !== "tFRM") return "";
        return decodeTFRM(selectedRecord.data, selectedRecord.entry.resourceId);
    }, [selectedRecord]);

    const selectedBitmaps = useMemo(() => {
        if (!selectedRecord || (selectedRecord.entry.type !== "Tbmp" && selectedRecord.entry.type !== "tAIB"))
            return [];
        return extractAllTAIBBitmapsFromResource(toUint8Array(selectedRecord.data));
    }, [selectedRecord]);

    const selectedMBAR = useMemo(() => {
        if (!selectedRecord || selectedRecord.entry.type !== "MBAR") {
            return "";
        }
        const resId = selectedRecord.entry.resourceId || "UNKNOWN_ID";
        return decodeMBAR(selectedRecord.data, resId);
    }, [selectedRecord]);

    const selectedBytes = selectedRecord ? toUint8Array(selectedRecord.data) : new Uint8Array();

    const [loadedFont, setLoadedFont] = useState<HTMLImageElement | null>(null);

    const toggleTypeOpen = (type: string) =>
        setOpenTypes((prev) => ({ ...prev, [type]: !prev[type] }));

    return (
        <Panel
            title={
                activeDb
                    ? `${activeDb.header?.name ?? "Database"} - PRC Explorer`
                    : "PRC Explorer"
            }
            isExpandedByDefault
            {...panelProps}
            sx={{ width: "100%", ...((panelProps as any)?.sx ?? {}) }}
        >
            <Box>
                <Box p={2} display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" color="textSecondary">
                        {activeDb
                            ? "Exploring loaded data module."
                            : "Select an app below or open a local file directly to inspect."}
                    </Typography>
                    {enableFileUpload && (
                        <Button variant="outlined" component="label" startIcon={<FileUploadIcon />}>
                            OPEN FILE TO INSPECT
                            <input
                                type="file"
                                hidden
                                onChange={handleInspectFileChange}
                                accept=".prc,.pdb"
                            />
                        </Button>
                    )}
                </Box>

                {!activeDb ? (
                    <Box p={4} textAlign="center" border="1px dashed #ccc" m={2} borderRadius={1}>
                        <Typography color="textSecondary">
                            No database loaded into explorer view.
                        </Typography>
                    </Box>
                ) : (
                    <Grid2 container spacing={0} sx={{ border: "1px solid #ccc", minHeight: 400, m: 2, borderRadius: 1 }}>
                        {/* Left sidebar: resource tree */}
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

                        {/* Right detail pane */}
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
                                        {/* Bitmap visualizer */}
                                        {(selectedRecord.entry.type === "Tbmp" || selectedRecord.entry.type === "tAIB") ? (
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    Bitmap Visualizer:
                                                </Typography>
                                                <Stack spacing={2}>
                                                    {selectedBitmaps.length > 0 ? (
                                                        selectedBitmaps.map((bmp, index) => (
                                                            <Box key={index}>
                                                                <Typography variant="body2" sx={{ fontFamily: "monospace", mb: 1 }}>
                                                                    {bmp.width} x {bmp.height}, {bmp.bpp} bpp, {bmp.density} dpi
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
                                            /* MODIFIED: Embedded Visualizer into the tFRM section */
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    Form Decompiler & Visualizer:
                                                </Typography>
                                                <Grid2 container spacing={2}>
                                                    <Grid2 size={{ xs: 12, md: 6 }}>
                                                        <Paper
                                                            variant="outlined"
                                                            sx={{
                                                                p: 2, bgcolor: "#fafafa", borderRadius: 1,
                                                                fontFamily: "monospace", whiteSpace: "pre-wrap",
                                                                wordBreak: "break-word", maxHeight: 320, overflowY: "auto",
                                                                fontSize: "7px"
                                                            }}
                                                        >
                                                            {selectedTFRM || "Could not decompile this tFRM resource."}
                                                        </Paper>
                                                    </Grid2>
                                                    <Grid2 size={{ xs: 12, md: 6 }}>
                                                        {selectedTFRM && (
                                                            <PalmFormVisualizer
                                                                pilrcText={selectedTFRM}
                                                                renderBitmap={handleRenderFormBitmap}
                                                                fontImage={loadedFont}
                                                            />
                                                        )}
                                                    </Grid2>
                                                </Grid2>
                                            </Box>
                                        ) : selectedRecord.entry.type === "tSTR" || selectedRecord.entry.type === "tver" ? (
                                            /* String decoder */
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    String Decoder:
                                                </Typography>
                                                <Paper
                                                    variant="outlined"
                                                    sx={{
                                                        p: 2, bgcolor: "#fafafa", borderRadius: 1,
                                                        fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word",
                                                    }}
                                                >
                                                    {selectedTSTR.length > 0 ? selectedTSTR : "EMPTY STRING"}
                                                </Paper>
                                            </Box>
                                        ) : selectedRecord.entry.type === "tSTL"? (
                                            /* String table decoder */
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    String Table Decoder:
                                                </Typography>
                                                <Paper
                                                    variant="outlined"
                                                    sx={{
                                                        bgcolor: "#fafafa",
                                                        borderRadius: 1,
                                                        overflow: "hidden",
                                                    }}
                                                >
                                                    {selectedTSTL.length > 0 ? (
                                                        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                                                            {selectedTSTL.map((str, index) => (
                                                                <Box
                                                                    component="li"
                                                                    key={index}
                                                                    sx={{
                                                                        display: "flex",
                                                                        px: 2,
                                                                        py: 1,
                                                                        borderBottom: index < selectedTSTL.length - 1 ? "1px solid #e0e0e0" : "none",
                                                                        fontFamily: "monospace",
                                                                        "&:hover": { bgcolor: "#f0f0f0" }, // Nice hover effect per row
                                                                    }}
                                                                >
                                                                    <Typography
                                                                        component="span"
                                                                        sx={{
                                                                            fontFamily: "inherit",
                                                                            color: "text.disabled",
                                                                            mr: 2,
                                                                            userSelect: "none",
                                                                        }}
                                                                    >
                                                                        {String(index).padStart(4, "0")}
                                                                    </Typography>
                                                                    <Typography
                                                                        component="span"
                                                                        sx={{
                                                                            fontFamily: "inherit",
                                                                            color: "text.primary",
                                                                            wordBreak: "break-word",
                                                                            whiteSpace: "pre-wrap",
                                                                        }}
                                                                    >
                                                                        {str}
                                                                    </Typography>
                                                                </Box>
                                                            ))}
                                                        </Box>
                                                    ) : (
                                                        <Typography
                                                            sx={{ p: 2, fontFamily: "monospace", color: "text.disabled" }}
                                                        >
                                                            EMPTY STRING TABLE
                                                        </Typography>
                                                    )}
                                                </Paper>
                                            </Box>
                                        ) : selectedRecord.entry.type === "Talt" ? (
                                            /* Alert resource decoder */
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    PilRC Alert Decoder:
                                                </Typography>
                                                <Grid2 container spacing={2}>
                                                    <Grid2 size={{ xs: 12, md: 6 }}>
                                                        <Paper
                                                            variant="outlined"
                                                            sx={{
                                                                p: 2, bgcolor: "#fafafa", borderRadius: 1,
                                                                fontFamily: "monospace", whiteSpace: "pre-wrap",
                                                                wordBreak: "break-word", maxHeight: 320, overflowY: "auto",
                                                                fontSize: "10px"
                                                            }}
                                                        >
                                                            {selectedAlert || "Could not decompile this Talt resource."}
                                                        </Paper>
                                                    </Grid2>
                                                    <Grid2 size={{ xs: 12, md: 6 }}>
                                                        {selectedAlert && (
                                                            <PalmAlertVisualizer
                                                                pilrcText={selectedAlert}
                                                            />
                                                        )}
                                                    </Grid2>
                                                </Grid2>
                                            </Box>
                                        ) : selectedRecord.entry.type === "MENU" || selectedRecord.entry.type === "MBAR" ? (
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    PilRC Menu Decoder:
                                                </Typography>
                                                <Grid2 container spacing={2}>
                                                    <Grid2 size={{ xs: 12, md: 6 }}>
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
                                                                overflowY: "auto",
                                                                fontSize: "9px"
                                                            }}
                                                        >
                                                            {selectedMBAR || "Could not decompile this menu resource."}
                                                        </Paper>
                                                    </Grid2>
                                                    <Grid2 size={{ xs: 12, md: 6 }}>
                                                        {selectedMBAR && <PalmMenuVisualizer pilrcText={selectedMBAR} />}
                                                    </Grid2>
                                                </Grid2>
                                            </Box>
                                        ) : (
                                            <Typography variant="body2" color="textSecondary" sx={{ fontStyle: "italic" }}>
                                                No visual handler compiled for type "{selectedRecord.entry.type}".
                                            </Typography>
                                        )}
                                    </Box>

                                    <Divider sx={{ my: 1.5 }} />

                                    {/* Hex view (always visible) */}
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
                                                whiteSpace: "pre-wrap", wordBreak: "break-all", m: 0, fontSize: "0.85rem",
                                            }}
                                        >
                                            {formatHexView(selectedBytes)}
                                        </Typography>
                                    </Paper>
                                </Box>
                            ) : (
                                <Box m="auto" textAlign="center">
                                    <Typography color="textSecondary" variant="body2">
                                        Select an entry inside the directory tree to view its contents.
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