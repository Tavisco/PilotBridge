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

type RectLike = { x: number; y: number; w: number; h: number };

export type AtToken = number | "CENTER" | "RIGHT" | "BOTTOM";

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

export function parseFormHeader(text: string): ParsedFormHeader {
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

export function parseWidgets(pilrcText: string, form: ParsedFormHeader): ParsedWidget[] {
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