import {useMemo, useEffect, useRef} from "react";
import { Box } from "@mui/material";

import {loadPalmOSFont, PalmFont, PalmGlyph} from "../../utils/yaff-font.ts";
import {AtToken, parseFormHeader, parseWidgets} from "../../utils/pilrc-parser.ts";
import Grid2 from "@mui/material/Grid2";
import {PilrcTextVisualizer} from "./PilrcTextVisualizer.tsx";
import {drawTAIBBitmapToCtx} from "../PalmIcon.tsx";

export interface PalmFormVisualizerProps {
    pilrcText: string;
    fetchBitmapData?: (id: number | string) => any | null;
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
    baselineY: number,
    opts: {
        color?: string;
        scale?: number;
        lineGap?: number;
        isBold?: boolean;
    } = {}
): Promise<void> {
    const font = await loadPalmOSFont(opts.isBold? "/PalmOS-Bold.yaff" : "/PalmOS-Standard.yaff");
    const color = opts.color ?? "#000000";
    const scale = Math.max(1, Math.floor(opts.scale ?? 1));
    const lineGap = opts.lineGap ?? 0;

    let penY = baselineY;

    for (const line of text.split("\n")) {
        let penX = baselineX;

        for (const ch of [...line]) {
            const glyph = resolveGlyph(font, ch);
            if (!glyph) continue;

            const topY = penY - font.ascent * scale;
            drawGlyph(ctx, glyph, penX, topY, color, scale);

            penX += getAdvanceWidth(glyph, scale);
        }

        penY += (font.lineHeight + lineGap) * scale;
    }
}

function getAdvanceWidth(glyph: PalmGlyph, scale: number): number {
    if (glyph.scalableWidth !== undefined) return glyph.scalableWidth * scale;
    const l = glyph.leftBearing ?? 0;
    const r = glyph.rightBearing ?? 0;
    return (l + glyph.width + r) * scale;
}

export async function measurePalmOSText(
    text: string,
    opts: { scale?: number; lineGap?: number; isBold?: boolean } = {}
): Promise<{ width: number; height: number }> {
    const font = await loadPalmOSFont(opts.isBold? "/PalmOS-Bold.yaff" : "/PalmOS-Standard.yaff");
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
    return {width: maxWidth, height};
}

export const PalmFormVisualizer = ({pilrcText, fetchBitmapData}: PalmFormVisualizerProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const form = useMemo(() => {
        const header = parseFormHeader(pilrcText);
        const widgets = parseWidgets(pilrcText, header);
        return {header, widgets};
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
            const fontStandard = await loadPalmOSFont("/PalmOS-Standard.yaff");
            const fontBold = await loadPalmOSFont("/PalmOS-Bold.yaff");
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const measureTextWidth = async (text: string, scale: number, isBold: boolean) => {
                const {width} = await measurePalmOSText(text, {scale, isBold});
                return width;
            };

            const drawBitmapText = async (
                text: string,
                x: number,
                y: number,
                isBold: boolean,
                invert = false
            ) => {
                const scale = 1;
                const color = invert ? "#fff" : "#000";
                const baselineY = y + (isBold? fontBold.ascent : fontStandard.ascent) * scale;
                await drawPalmOSText(ctx, text, x, baselineY, {color, scale, isBold});
            };

            // --- Form background ---
            ctx.fillStyle = "#fff";
            ctx.fillRect(formBounds.x, formBounds.y, formBounds.w, formBounds.h);

            const drawDottedLine = (x: number, y: number, w: number, h: number) => {
                ctx.beginPath();
                ctx.strokeStyle = "#000";
                ctx.lineWidth = 1;
                ctx.setLineDash([1, 1]);

                const step = 11;
                for (let offset = step; offset <= h; offset += step) {
                    const currentY = y + offset;

                    ctx.moveTo(x, currentY + 0.5);
                    ctx.lineTo(x + w, currentY + 0.5);
                }

                ctx.stroke();
                ctx.setLineDash([]);
            };

            const drawButtonRect = (x: number, y: number, w: number, h: number) => {
                ctx.fillStyle = "#000";

                // 1. Draw main edges
                ctx.fillRect(x + 2, y, w - 4, 1);             // Top
                ctx.fillRect(x + 2, y + h - 1, w - 4, 1);     // Bottom
                ctx.fillRect(x, y + 2, 1, h - 4);             // Left
                ctx.fillRect(x + w - 1, y + 2, 1, h - 4);     // Right

                // 2. Draw the transitional corner pixels
                ctx.fillRect(x + 1, y + 1, 1, 1);             // Top-Left
                ctx.fillRect(x + w - 2, y + 1, 1, 1);         // Top-Right
                ctx.fillRect(x + 1, y + h - 2, 1, 1);         // Bottom-Left
                ctx.fillRect(x + w - 2, y + h - 2, 1, 1);     // Bottom-Right
            };

            if (form.header.modal) {
                ctx.fillStyle = "#00007f";

                // Expand the boundary by 2 pixels in all directions to wrap the white background
                const bx = formBounds.x - 2;
                const by = formBounds.y - 2;
                const bw = formBounds.w + 4;
                const bh = formBounds.h + 4;

                // Top edge (2px thick, indented 1px on left and right for rounding)
                ctx.fillRect(bx + 1, by, bw - 2, 2);

                // Bottom edge (2px thick, indented 1px on left and right for rounding)
                ctx.fillRect(bx + 1, by + bh - 2, bw - 2, 2);

                // Left edge (2px thick, indented 1px on top and bottom for rounding)
                ctx.fillRect(bx, by + 1, 2, bh - 2);

                // Right edge (2px thick, indented 1px on top and bottom for rounding)
                ctx.fillRect(bx + bw - 2, by + 1, 2, bh - 2);
            }

            // --- Draw shapes & text (no bitmaps – they are handled in React) ---
            for (const w of form.widgets) {
                const xOffset = formBounds.x;
                const yOffset = formBounds.y;

                switch (w.kind) {
                    case "title": {
                        const titleText = w.text.replace(/\r/g, "\n");
                        const scale = 1;
                        const textWidth = await measureTextWidth(titleText, scale, true);
                        const textHeight = fontBold.lineHeight * scale; // 11px

                        const padding = 4; // Horizontal space inside the pill
                        const isModal = form.header.modal;
                        const pillHeight = 12;

                        ctx.fillStyle = "#00007f";

                        if (isModal) {
                            // Modal: Fill the interior space perfectly flush against the inner edge of the borders.
                            // The outer 2px boundary already handles the rounded corners.
                            ctx.fillRect(xOffset, yOffset, formBounds.w, pillHeight);

                            // Draw the separator line at the bottom of the title bar
                            ctx.fillRect(xOffset, yOffset + pillHeight - 1, formBounds.w, 2);

                            // Position text: Centered
                            const textX = Math.round(xOffset + (formBounds.w - textWidth) / 2);
                            const textTopY = Math.round(yOffset + (pillHeight - textHeight) / 2);

                            await drawBitmapText(titleText, textX, textTopY, true, true);
                        } else {
                            // Regular Form: The title wraps tightly and creates its own rounded corners.
                            const pillWidth = textWidth + (padding * 2);

                            // Middle horizontal band (omitting top & bottom pixel rows)
                            ctx.fillRect(xOffset, yOffset + 1, pillWidth, pillHeight - 2);
                            // Top row (omitting left & right corner pixels)
                            ctx.fillRect(xOffset + 1, yOffset, pillWidth - 2, 1);
                            // Bottom row (omitting left & right corner pixels)
                            ctx.fillRect(xOffset + 1, yOffset + pillHeight - 1, pillWidth - 2, 1);

                            // 2px horizontal line extending to the right screen edge
                            ctx.fillRect(xOffset, yOffset + pillHeight - 1, formBounds.w, 2);

                            // Position text: Left-aligned with padding
                            const textX = Math.round(xOffset + padding);
                            const textTopY = Math.round(yOffset + (pillHeight - textHeight) / 2);

                            await drawBitmapText(titleText, textX, textTopY, true, true);
                        }
                        break;
                    }

                    case "label": {
                        const rawText = w.text.replace(/\r/g, "\n");
                        const isBold = w.font === 1 || w.font === 3;
                        const scale = 1;
                        const textWidth = await measureTextWidth(rawText, scale, isBold);
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
                        const bx = xOffset + w.rect?.x;
                        const by = yOffset + w.rect?.y;
                        const bw = w.rect?.w || 30;
                        const bh = w.rect?.h || 12;
                        drawDottedLine(bx, by, bw, bh);

                        break;
                    }

                    case "button": {
                        const bx = xOffset + (w.rect?.x || 0);
                        const by = yOffset + (w.rect?.y || 0);
                        const bw = w.rect?.w || 30;
                        const bh = w.rect?.h || 12;

                        const rawText = w.text.replace(/\r/g, "\n");
                        const scale = 1;

                        // Palm OS Font IDs: 1 and 7 are generally bold variants
                        const isBold = w.font === 1 || w.font === 7;
                        const textWidth = await measureTextWidth(rawText, scale, isBold);
                        const textHeight = fontStandard.lineHeight * scale; // 11px

                        ctx.fillStyle = "#000";
                        ctx.strokeStyle = "#000";
                        ctx.lineWidth = 1;

                        // Helper for vertical text centering
                        const textTopY = Math.round(by + (bh - textHeight) / 2) - 1;

                        switch (w.style) {
                            case "CHECKBOX": {
                                // Draw 9x9 checkbox box
                                const boxSize = 9;
                                const boxY = Math.round(by + (bh - boxSize) / 2);
                                ctx.strokeRect(bx + 0.5, boxY + 0.5, boxSize, boxSize);

                                // Text is positioned to the right of the checkbox
                                const textX = bx + boxSize + 4;
                                await drawBitmapText(rawText, textX, textTopY, isBold);
                                break;
                            }

                            case "POPUPTRIGGER": {
                                // Popup triggers are generally left-aligned text with a trailing triangle
                                const triX = bx;
                                const triY = Math.round(by + bh / 2) - 1;

                                ctx.beginPath();
                                ctx.moveTo(triX, triY);
                                ctx.lineTo(triX + 6, triY);
                                ctx.lineTo(triX + 3, triY + 3);
                                ctx.fill();

                                // Then draw the text after the triangle
                                const textX = triX + 9;
                                await drawBitmapText(rawText, textX, textTopY, isBold);
                                break;
                            }

                            case "SELECTORTRIGGER": {
                                const textX = Math.round(bx + (bw - textWidth) / 2);
                                await drawBitmapText(rawText, textX, textTopY, isBold);

                                // Manually draw a 1‑pixel dotted border around the rectangle
                                ctx.fillStyle = "#000";
                                const drawDot = (x: number, y: number) => {
                                    ctx.fillRect(x, y, 1, 1);
                                };

                                // Top and bottom edges: draw dots every 2 pixels
                                for (let x = bx + 2; x < bx + bw - 2; x += 2) {
                                    drawDot(x, by);          // top
                                    drawDot(x, by + bh - 1); // bottom
                                }
                                // Left and right edges (skip corners)
                                for (let y = by + 2; y < by + bh - 2; y += 2) {
                                    drawDot(bx, y);           // left
                                    drawDot(bx + bw - 1, y);  // right
                                }

                                // Draw the four corners
                                drawDot(bx, by);                     // top‑left
                                drawDot(bx + bw - 1, by);           // top‑right
                                drawDot(bx, by + bh - 1);           // bottom‑left
                                drawDot(bx + bw - 1, by + bh - 1);  // bottom‑right

                                break;
                            }

                            case "PUSHBUTTON": {
                                // Pushbuttons traditionally have standard rectangular borders.
                                // In a group, they touch borders, but drawn alone they are just stroked rects.
                                ctx.strokeRect(bx - 1 + 0.5, by + 0.5 - 1, bw + 1, bh + 1);

                                const textX = Math.round(bx + (bw - textWidth) / 2);
                                await drawBitmapText(rawText, textX, textTopY, isBold);
                                break;
                            }

                            case "BUTTON":
                            case "REPEATBUTTON":
                            default: {
                                // Handle explicit framing
                                if (w.frame === "NOFRAME") {
                                    // Draw nothing around the text
                                } else if (w.frame === "RECTFRAME") {
                                    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
                                } else if (w.frame === "BOLDFRAME") {
                                    ctx.fillRect(bx, by, bw, bh);
                                    ctx.clearRect(bx + 2, by + 2, bw - 4, bh - 4);
                                } else {
                                    // "FRAME" or default falls back to standard rounded corners
                                    drawButtonRect(bx, by, bw, bh);
                                }

                                const textX = Math.round(bx + (bw - textWidth) / 2);
                                await drawBitmapText(rawText, textX, textTopY, isBold);
                                break;
                            }
                        }
                        break;
                    }

                    case "frame": {
                        const rx = xOffset + (w.rect?.x || 0);
                        const ry = yOffset + (w.rect?.y || 0);
                        const rw = w.rect?.w || 0;
                        const rh = w.rect?.h || 0;

                        ctx.fillStyle = "#000";
                        ctx.strokeStyle = "#000";

                        // Standard 1px structural frame
                        ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);

                        break;
                    }

                    case "rectangle": {
                        const rx = xOffset + (w.rect?.x || 0);
                        const ry = yOffset + (w.rect?.y || 0);
                        const rw = w.rect?.w || 0;
                        const rh = w.rect?.h || 0;

                        ctx.fillStyle = "#000";
                        ctx.strokeStyle = "#000";

                        ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
                        break;
                    }

                    case "list": {
                        if (w.usable === false) break;
                        const rx = xOffset + (w.rect?.x || 0);
                        const ry = yOffset + (w.rect?.y || 0);
                        const rw = w.rect?.w || 0;
                        const rh = w.rect?.h || 0;

                        ctx.strokeStyle = "#000";
                        ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);

                        // If items array is present, populate the list text matching 11px row layout
                        if (w.items && Array.isArray(w.items)) {
                            let itemY = ry + 2;
                            const isBold = w.font === 1 || w.font === 7;

                            for (let i = 0; i < w.items.length; i++) {
                                if (itemY + 11 > ry + rh) break; // Row boundary clip

                                await drawBitmapText(w.items[i], rx + 4, itemY, isBold);
                                itemY += 12; // Palm OS standard row interval increment
                            }
                        }
                        break;
                    }

                    case "table": {
                        const rx = xOffset + (w.rect?.x || 0);
                        const ry = yOffset + (w.rect?.y || 0);
                        const rw = w.rect?.w || 0;
                        const rh = w.rect?.h || 0;

                        ctx.fillStyle = "#000";
                        ctx.strokeStyle = "#000";

                        // Draw outer containing boundary
                        ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);

                        // Palm OS tables don't automatically render thick grids,
                        // but they define structural layout row cuts (traditionally ~12px intervals)
                        const rowHeight = 12;
                        for (let y = ry + rowHeight; y < ry + rh - 2; y += rowHeight) {
                            ctx.fillRect(rx, y, rw, 1);
                        }
                        break;
                    }

                    case "scrollbar": {
                        const rx = xOffset + (w.rect?.x || 0);
                        const ry = yOffset + (w.rect?.y || 0);
                        const rw = w.rect?.w || 7; // Default Palm OS scrollbar width is 7px
                        const rh = w.rect?.h || 0;

                        ctx.fillStyle = "#000";
                        ctx.strokeStyle = "#000";

                        // 1. Draw outer boundary vertical shaft
                        ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);

                        // 2. Button segments bounds (Top & Bottom squares)
                        const btnSize = rw;
                        ctx.fillRect(rx, ry + btnSize, rw, 1);              // Top cap divider
                        ctx.fillRect(rx, ry + rh - btnSize - 1, rw, 1);     // Bottom cap divider

                        // 3. Render Top Arrow (Up Triangle)
                        ctx.beginPath();
                        ctx.moveTo(rx + Math.floor(rw / 2) + 0.5, ry + 2);
                        ctx.lineTo(rx + 1.5, ry + btnSize - 3);
                        ctx.lineTo(rx + rw - 1.5, ry + btnSize - 3);
                        ctx.closePath();
                        ctx.fill();

                        // 4. Render Bottom Arrow (Down Triangle)
                        ctx.beginPath();
                        ctx.moveTo(rx + Math.floor(rw / 2) + 0.5, ry + rh - 3);
                        ctx.lineTo(rx + 1.5, ry + rh - btnSize + 2);
                        ctx.lineTo(rx + rw - 1.5, ry + rh - btnSize + 2);
                        ctx.closePath();
                        ctx.fill();

                        // 5. Scrollbar central thumb elevator track indicator block
                        const trackMaxH = rh - (btnSize * 2) - 4;
                        const thumbH = Math.max(8, Math.round(trackMaxH * 0.35)); // Mock proportional height
                        const thumbY = ry + btnSize + 2 + Math.round((trackMaxH - thumbH) * 0.2); // Proportional placement

                        ctx.fillRect(rx + 1, thumbY, rw - 2, thumbH);
                        break;
                    }

                    case "slider": {
                        const rx = xOffset + (w.rect?.x || 0);
                        const ry = yOffset + (w.rect?.y || 0);
                        const rw = w.rect?.w || 0;
                        const rh = w.rect?.h || 12;

                        ctx.fillStyle = "#000";
                        ctx.strokeStyle = "#000";

                        // 1. Render core horizontal slider center line rail
                        const trackY = Math.round(ry + rh / 2) - 1;
                        ctx.fillRect(rx, trackY, rw, 1);

                        // 2. Render slider thumb knob control mechanism box (centered in track rail)
                        const thumbW = 8;
                        const thumbH = 8;
                        const thumbX = Math.round(rx + (rw - thumbW) / 2); // Placed at center by default
                        const thumbYPos = Math.round(trackY - (thumbH / 2)) + 0.5;

                        // Clear line segment hidden directly underneath the active slider control knob
                        ctx.clearRect(thumbX, Math.floor(thumbYPos), thumbW, thumbH);

                        // Draw distinct 1-bit square slider thumb frame
                        ctx.strokeRect(thumbX + 0.5, thumbYPos, thumbW - 1, thumbH - 1);

                        // Add central pixel anchor core accent inside control knob
                        ctx.fillRect(thumbX + Math.floor(thumbW / 2) - 1, Math.floor(thumbYPos + thumbH / 2) - 1, 2, 2);
                        break;
                    }

                    case "graffitistateindicator": {
                        const gx = xOffset + (w.rect?.x || 0);
                        const gy = yOffset + (w.rect?.y || 0);
                        const gw = w.rect?.w || 9;
                        const gh = w.rect?.h || 10;

                        ctx.fillStyle = "#000";
                        ctx.strokeStyle = "#000";
                        ctx.lineWidth = 1;

                        ctx.beginPath();
                        ctx.moveTo(gx + Math.floor(gw / 2) + 0.5, gy);
                        ctx.lineTo(gx, gy + gh - 5);
                        ctx.lineTo(gx + gw, gy + gh - 5);
                        ctx.closePath();
                        ctx.fill();
                        // Base bar element
                        ctx.fillRect(gx + 2, gy + gh - 5, gw - 4, 5);
                        break;
                    }

                    case "gadget":
                        ctx.fillStyle = "rgba(0,0,0,0.05)";
                        ctx.fillRect(xOffset + w.rect.x, yOffset + w.rect.y, w.rect.w, w.rect.h);
                        ctx.strokeStyle = "#000";
                        ctx.lineWidth = 1;
                        ctx.setLineDash([2, 2]);
                        ctx.strokeRect(xOffset + w.rect.x, yOffset + w.rect.y, w.rect.w, w.rect.h);
                        ctx.setLineDash([]);
                        break;

                    case "bitmap": {
                        if (!fetchBitmapData) break;
                        const targetBmp = fetchBitmapData(w.id);
                        if (targetBmp) {
                            const bitX = xOffset + w.at.x;
                            const bitY = yOffset + w.at.y;

                            drawTAIBBitmapToCtx(ctx, targetBmp, bitX, bitY, 1);
                        }
                        break;
                    }

                }
            }
        };

        render();
    }, [form, fetchBitmapData, formBounds]);

    return (
        <Grid2 container spacing={2}>
            <Grid2 size={{ xs: 12, md: 6 }}>
                <PilrcTextVisualizer pilrcText={pilrcText} />
            </Grid2>

            <Grid2 size={{ xs: 12, md: 6 }}>
                {pilrcText && (
                    <Box
                        sx={{
                            width: outerW + 4,
                            height: outerH + 4,
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            bgcolor: "#fff",
                            border: "1px solid #fff",
                            borderRadius: 0,
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


                        </Box>
                    </Box>
                )}
            </Grid2>
        </Grid2>
    );
};