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

interface PalmFormVisualizerProps {
    pilrcText: string;
    renderBitmap?: (id: number) => React.ReactNode;
}type AtToken = number | "CENTER" | "RIGHT" | "BOTTOM";
type RectLike = { x: AtToken; y: AtToken; w: number; h: number };

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
    | { kind: "bitmap"; id: number; at: { x: AtToken; y: AtToken }; hidden: boolean }
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
                x: parseNumberOrWord(parts[0]) || 0,
                y: parseNumberOrWord(parts[1]) || 0,
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

    for (const line of lines) {
        if (/^FORM\b/i.test(line) || /^BEGIN$/i.test(line) || /^END$/i.test(line)) continue;
        if (/^FRAME$/i.test(line)) continue;
        if (/^MODAL$/i.test(line)) continue;
        if (/^NOSAVEBEHIND$/i.test(line)) continue;
        if (/^DEFAULTBTNID\b/i.test(line)) continue;
        if (/^HELPID\b/i.test(line)) continue;
        if (/^MENUID\b/i.test(line)) continue;
        if (/^OBJECT\b/i.test(line)) continue;

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
                rect: { x: at.x, y: at.y, w: at.w ?? 0, h: at.h ?? 0 },
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
                rect: { x: at.x, y: at.y, w: at.w ?? 0, h: at.h ?? 0 },
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
                at: { x: at.x, y: at.y },
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
                rect: { x: at.x, y: at.y, w: at.w ?? 0, h: at.h ?? 0 },
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
                rect: { x: at.x, y: at.y, w: at.w ?? 0, h: at.h ?? 0 },
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
                id: line.match(/\bID\s+(\d+)/i)?.[1] ? Number(line.match(/\bID\s+(\d+)/i)![1]) : undefined,
                rect: { x: at.x, y: at.y, w: at.w ?? 0, h: at.h ?? 0 },
                value: line.match(/\bVALUE\s+(-?\d+)/i)?.[1] ? Number(line.match(/\bVALUE\s+(-?\d+)/i)![1]) : undefined,
                minValue: line.match(/\bMINVALUE\s+(-?\d+)/i)?.[1] ? Number(line.match(/\bMINVALUE\s+(-?\d+)/i)![1]) : undefined,
                maxValue: line.match(/\bMAXVALUE\s+(-?\d+)/i)?.[1] ? Number(line.match(/\bMAXVALUE\s+(-?\d+)/i)![1]) : undefined,
                pageSize: line.match(/\bPAGESIZE\s+(-?\d+)/i)?.[1] ? Number(line.match(/\bPAGESIZE\s+(-?\d+)/i)![1]) : undefined,
            });
            continue;
        }

        if (/^SLIDER\b/i.test(line)) {
            const at = parseAtSpec(line);
            if (!at) continue;
            widgets.push({
                kind: "slider",
                id: line.match(/\bID\s+(\d+)/i)?.[1] ? Number(line.match(/\bID\s+(\d+)/i)![1]) : undefined,
                rect: { x: at.x, y: at.y, w: at.w ?? 0, h: at.h ?? 0 },
                minValue: line.match(/\bMINVALUE\s+(-?\d+)/i)?.[1] ? Number(line.match(/\bMINVALUE\s+(-?\d+)/i)![1]) : undefined,
                maxValue: line.match(/\bMAXVALUE\s+(-?\d+)/i)?.[1] ? Number(line.match(/\bMAXVALUE\s+(-?\d+)/i)![1]) : undefined,
                value: line.match(/\bVALUE\s+(-?\d+)/i)?.[1] ? Number(line.match(/\bVALUE\s+(-?\d+)/i)![1]) : undefined,
                vertical: /\bVERTICAL\b/i.test(line),
                thumbId: line.match(/\bTHUMBID\s+(\d+)/i)?.[1] ? Number(line.match(/\bTHUMBID\s+(\d+)/i)![1]) : undefined,
                backgroundId: line.match(/\bBACKGROUNDID\s+(\d+)/i)?.[1] ? Number(line.match(/\bBACKGROUNDID\s+(\d+)/i)![1]) : undefined,
                feedback: /\bFEEDBACK\b/i.test(line),
            });
            continue;
        }

        if (/^GADGET\b/i.test(line)) {
            const at = parseAtSpec(line);
            if (!at) continue;
            widgets.push({
                kind: "gadget",
                id: line.match(/\bID\s+(\d+)/i)?.[1] ? Number(line.match(/\bID\s+(\d+)/i)![1]) : undefined,
                rect: { x: at.x, y: at.y, w: at.w ?? 0, h: at.h ?? 0 },
                extended: /\bEXTENDED\b/i.test(line),
            });
            continue;
        }

        if (/^LINE\b/i.test(line) || /^FRAME\b/i.test(line) || /^RECTANGLE\b/i.test(line)) {
            const at = parseAtSpec(line);
            if (!at) continue;
            const kind = line.split(/\s+/)[0].toLowerCase() as "line" | "frame" | "rectangle";
            widgets.push({ kind, rect: { x: at.x, y: at.y, w: at.w ?? 0, h: at.h ?? 0 } });
            continue;
        }
    }

    return widgets;
}

// ── UI Components ─────────────────────────────────────────────────────────────

type WidgetProps<T> = { widget: T; formWidth: number; formHeight: number };

function PalmButton({ widget, formWidth, formHeight }: WidgetProps<Extract<ParsedWidget, { kind: "button" }>>) {
    const width = widget.rect.w || Math.max(26, estimateTextWidth(widget.text, 9) + 10);
    const height = widget.rect.h || 12;
    const left = resolveCoord(widget.rect.x, width, formWidth);
    const top = resolveCoord(widget.rect.y, height, formHeight);

    const frameStyle =
        widget.frame === "NOFRAME"
            ? { border: "none", borderRadius: 0 }
            : widget.frame === "BOLDFRAME"
                ? { border: "2px solid #000", borderRadius: "4px" }
                : widget.frame === "RECTFRAME"
                    ? { borderRadius: 0 }
                    : { borderRadius: "4px" }; // Standard Palm Button curve

    return (
        <Box sx={{
            position: "absolute", left, top, width, height, boxSizing: "border-box",
            border: "1px solid #000",
            bgcolor: widget.defaultBtn ? "#000" : "#fff",
            color: widget.defaultBtn ? "#fff" : "#000",
            opacity: widget.hidden ? 0.35 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", px: "3px",
            fontSize: "9px", fontWeight: 700, lineHeight: "10px",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontFamily: "PalmOS, monospace",
            ...frameStyle,
        }}>
            {widget.text}
        </Box>
    );
}

function PalmField({ widget, formWidth, formHeight }: WidgetProps<Extract<ParsedWidget, { kind: "field" }>>) {
    const w = widget.rect.w || 60;
    const h = widget.rect.h || 12;
    const left = resolveCoord(widget.rect.x, w, formWidth);
    const top = resolveCoord(widget.rect.y, h, formHeight);

    return (
        <Box sx={{
            position: "absolute", left, top, width: w, height: h, boxSizing: "border-box",
            bgcolor: "transparent", overflow: "hidden",
        }}>
            <Box sx={{
                position: "absolute", left: 0, right: 0, bottom: 1,
                borderBottom: "1px dotted #000", // Standard PilRC Field Underline
                opacity: widget.editable ? 1 : 0.4,
            }} />
            <Box sx={{
                position: "absolute", inset: 0, py: "1px",
                fontSize: "9px", fontFamily: "PalmOS, monospace", lineHeight: "10px", color: "#000",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
                {widget.maxChars ? `Field (${widget.maxChars})` : "Field"}
            </Box>
        </Box>
    );
}

function PalmList({ widget, formWidth, formHeight }: WidgetProps<Extract<ParsedWidget, { kind: "list" }>>) {
    const visible = Math.max(1, widget.visibleItems ?? Math.min(widget.items.length || 1, 4));
    const h = widget.rect.h || visible * 11 + 2;
    const left = resolveCoord(widget.rect.x, widget.rect.w, formWidth);
    const top = resolveCoord(widget.rect.y, h, formHeight);

    return (
        <Box sx={{
            position: "absolute", left, top, width: widget.rect.w, height: h,
            boxSizing: "border-box", border: "1px solid #000", bgcolor: "#fff", overflow: "hidden",
        }}>
            {Array.from({ length: visible }).map((_, i) => {
                const text = widget.items[i] ?? "";
                return (
                    <Box key={i} sx={{
                        height: 11, px: "2px", display: "flex", alignItems: "center",
                        bgcolor: i === 0 ? "#000" : "transparent",
                        color: i === 0 ? "#fff" : "#000",
                        fontSize: "9px", fontFamily: "PalmOS, monospace", lineHeight: "10px",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                        {text || (widget.search ? "Search…" : "Item")}
                    </Box>
                );
            })}
        </Box>
    );
}

function PalmTable({ widget, formWidth, formHeight }: WidgetProps<Extract<ParsedWidget, { kind: "table" }>>) {
    const cols = Math.max(1, widget.numColumns ?? 2);
    const rows = Math.max(1, widget.numRows ?? 3);
    const cellW = Math.max(12, Math.floor((widget.rect.w || 60) / cols));
    const cellH = 10;
    const h = widget.rect.h || rows * cellH + 2;
    const left = resolveCoord(widget.rect.x, widget.rect.w, formWidth);
    const top = resolveCoord(widget.rect.y, h, formHeight);

    return (
        <Box sx={{
            position: "absolute", left, top, width: widget.rect.w, height: h,
            boxSizing: "border-box", border: "1px solid #000", bgcolor: "#fff", overflow: "hidden",
        }}>
            {Array.from({ length: rows }).map((_, r) => (
                <Box key={r} sx={{ display: "flex", height: cellH }}>
                    {Array.from({ length: cols }).map((__, c) => (
                        <Box key={c} sx={{
                            width: cellW,
                            borderRight: c < cols - 1 ? "1px solid #000" : "none",
                            borderBottom: r < rows - 1 ? "1px solid #000" : "none",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "7px", fontFamily: "PalmOS, monospace",
                        }}>
                            &nbsp;
                        </Box>
                    ))}
                </Box>
            ))}
        </Box>
    );
}

function PalmScrollbar({ widget, formWidth, formHeight }: WidgetProps<Extract<ParsedWidget, { kind: "scrollbar" }>>) {
    const w = widget.rect.w || 7;
    const h = widget.rect.h || 48;
    const left = resolveCoord(widget.rect.x, w, formWidth);
    const top = resolveCoord(widget.rect.y, h, formHeight);

    const min = widget.minValue ?? 0;
    const max = widget.maxValue ?? 100;
    const value = widget.value ?? min;
    const pct = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
    const thumbH = Math.max(10, Math.floor(h * 0.25));
    const thumbY = Math.floor((h - thumbH - 2) * pct) + 1;

    return (
        <Box sx={{
            position: "absolute", left, top, width: w, height: h,
            border: "1px solid #000", bgcolor: "#fff", boxSizing: "border-box",
        }}>
            <Box sx={{
                position: "absolute", left: 1, right: 1, top: thumbY, height: thumbH, bgcolor: "#000",
            }} />
        </Box>
    );
}

function PalmSlider({ widget, formWidth, formHeight }: WidgetProps<Extract<ParsedWidget, { kind: "slider" }>>) {
    const left = resolveCoord(widget.rect.x, widget.rect.w, formWidth);
    const top = resolveCoord(widget.rect.y, widget.rect.h, formHeight);
    const vertical = widget.vertical || widget.rect.h > widget.rect.w;
    const min = widget.minValue ?? 0;
    const max = widget.maxValue ?? 100;
    const value = widget.value ?? min;
    const pct = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0.5;

    const railInset = 3;
    const thumbSize = 6;
    const travel = vertical
        ? Math.max(0, widget.rect.h - thumbSize - railInset * 2)
        : Math.max(0, widget.rect.w - thumbSize - railInset * 2);
    const thumbPos = railInset + Math.floor(travel * pct);

    return (
        <Box sx={{
            position: "absolute", left, top, width: widget.rect.w, height: widget.rect.h,
            border: "1px solid #000", bgcolor: "#fff", boxSizing: "border-box", overflow: "hidden",
        }}>
            <Box sx={{
                position: "absolute",
                ...(vertical
                    ? { left: "50%", top: railInset, bottom: railInset, width: 1, transform: "translateX(-50%)", bgcolor: "#000" }
                    : { top: "50%", left: railInset, right: railInset, height: 1, transform: "translateY(-50%)", bgcolor: "#000" }),
            }} />
            <Box sx={{
                position: "absolute",
                ...(vertical
                    ? { left: 1, top: thumbPos, width: widget.rect.w - 2, height: thumbSize }
                    : { top: 1, left: thumbPos, width: thumbSize, height: widget.rect.h - 2 }),
                bgcolor: "#000",
            }} />
        </Box>
    );
}

// ── Main Renderer ─────────────────────────────────────────────────────────────

export const PalmFormVisualizer = ({ pilrcText, renderBitmap }: PalmFormVisualizerProps) => {
    const form = useMemo(() => {
        const header = parseFormHeader(pilrcText);
        const widgets = parseWidgets(pilrcText, header);
        return { header, widgets };
    }, [pilrcText]);

    const outerW = 320;
    const outerH = 320;
    const fw = form.header.bounds.w;
    const fh = form.header.bounds.h;
    const formBounds = form.header.bounds;

    return (
        <Box sx={{
            width: outerW, height: outerH, display: "flex", justifyContent: "center", alignItems: "center",
            bgcolor: "#e0e0e0", borderRadius: 1,
        }}>
            <Box sx={{
                width: 160, height: 160, backgroundColor: "#fff", position: "relative",
                transform: "scale(2)", transformOrigin: "center center",
                border: form.header.modal ? "2px solid #000" : "1px solid #999",
                boxShadow: "0px 4px 12px rgba(0,0,0,0.15)",
                fontFamily: "sans-serif", overflow: "hidden", boxSizing: "border-box",
                backgroundImage: "radial-gradient(#d3d3d3 1px, transparent 1px)", backgroundSize: "4px 4px",
            }}>
                <Box sx={{
                    position: "absolute",
                    left: resolveCoord(formBounds.x, fw, 160),
                    top: resolveCoord(formBounds.y, fh, 160),
                    width: fw, height: fh, bgcolor: "#fff",
                    border: form.header.modal ? "2px solid #000" : "none",
                    boxSizing: "border-box", overflow: "hidden",
                }}>
                    {form.widgets.map((w, i) => {
                        switch (w.kind) {
                            case "title":
                                return (
                                    <Box key={i} sx={{
                                        position: "absolute", left: 0, top: 0, width: "100%", height: 14,
                                        bgcolor: "#000", color: "#fff", px: "3px",
                                        display: "flex", alignItems: "center",
                                        fontFamily: "PalmOS, monospace", fontSize: "12px", fontWeight: 700,
                                        boxSizing: "border-box", overflow: "hidden",
                                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    }}>
                                        {w.text}
                                    </Box>
                                );

                            case "label": {
                                const text = w.text.replace(/\r/g, "\n");
                                const fontSize = (w.font === 2 || w.font === 7) ? 12 : 9;
                                const isBold = w.font === 1 || w.font === 7;
                                const width = estimateTextWidth(text.replace(/\n/g, " "), fontSize);
                                const x = resolveCoord(w.at.x, width, fw, width);
                                const y = resolveCoord(w.at.y, fontSize + 2, fh, fontSize + 2);
                                return (
                                    <Box key={i} sx={{
                                        position: "absolute", left: x, top: y, width, color: "#000",
                                        fontFamily: "PalmOS, monospace", fontSize: `${fontSize}px`,
                                        fontWeight: isBold ? 700 : 400, lineHeight: `${fontSize + 1}px`,
                                        whiteSpace: "pre-wrap", textOverflow: "ellipsis", textAlign: "left",
                                    }}>
                                        {text}
                                    </Box>
                                );
                            }

                            case "field":
                                return <PalmField key={i} widget={w} formWidth={fw} formHeight={fh} />;
                            case "button":
                                return <PalmButton key={i} widget={w} formWidth={fw} formHeight={fh} />;
                            case "list":
                                return <PalmList key={i} widget={w} formWidth={fw} formHeight={fh} />;
                            case "table":
                                return <PalmTable key={i} widget={w} formWidth={fw} formHeight={fh} />;
                            case "scrollbar":
                                return <PalmScrollbar key={i} widget={w} formWidth={fw} formHeight={fh} />;
                            case "slider":
                                return <PalmSlider key={i} widget={w} formWidth={fw} formHeight={fh} />;

                            case "bitmap":
                                return (
                                    <Box key={i} sx={{
                                        position: "absolute",
                                        left: resolveCoord(w.at.x, 0, fw),
                                        top: resolveCoord(w.at.y, 0, fh)
                                    }}>
                                        {renderBitmap ? renderBitmap(w.id) : <Box sx={{ width: 16, height: 16, border: '1px solid #aaa', bgcolor: '#ccc' }} />}
                                    </Box>
                                );

                            case "line":
                                return (
                                    <Box key={i} sx={{
                                        position: "absolute",
                                        left: resolveCoord(w.rect.x, w.rect.w, fw),
                                        top: resolveCoord(w.rect.y, w.rect.h, fh),
                                        width: w.rect.w || 1, height: w.rect.h || 1, bgcolor: "#000"
                                    }} />
                                );

                            case "frame":
                            case "rectangle":
                                return (
                                    <Box key={i} sx={{
                                        position: "absolute",
                                        left: resolveCoord(w.rect.x, w.rect.w, fw),
                                        top: resolveCoord(w.rect.y, w.rect.h, fh),
                                        width: w.rect.w, height: w.rect.h,
                                        border: w.kind === "frame" ? "1px solid #000" : "none",
                                        bgcolor: w.kind === "rectangle" ? "#000" : "transparent"
                                    }} />
                                );

                            case "gadget":
                                return (
                                    <Box key={i} sx={{
                                        position: "absolute",
                                        left: resolveCoord(w.rect.x, w.rect.w, fw),
                                        top: resolveCoord(w.rect.y, w.rect.h, fh),
                                        width: w.rect.w, height: w.rect.h,
                                        border: "1px dashed #999", bgcolor: "rgba(0,0,0,0.05)"
                                    }} />
                                );

                            default:
                                return null;
                        }
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