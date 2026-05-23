export interface PalmGlyph {
    width: number;          // raster width (pixels)
    rows: string[];         // pixel rows (. and @)
    rightBearing?: number;  // from per-glyph property
    leftBearing?: number;
    shiftUp?: number;       // vertical offset
    scalableWidth?: number; // overrides advance if present
}

export type PalmFont = {
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