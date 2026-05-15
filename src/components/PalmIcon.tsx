import React, { useEffect, useRef } from "react";
import { TAIBBitmap, PLACEHOLDER_SIZE, placeholderBitmap } from "../utils/taib-extractor";
import { palm8BitIndexToRGB } from "../utils/palm-palette";

const drawTAIBBitmap = (canvas: HTMLCanvasElement, bitmap?: TAIBBitmap) => {
    const bmp = bitmap ?? placeholderBitmap;
    const width = Number(bmp.width) || 0;
    const height = Number(bmp.height) || 0;

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        canvas.width = PLACEHOLDER_SIZE;
        canvas.height = PLACEHOLDER_SIZE;
        canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { pixels, palette, pixelSize = 1, transparentIndex = null } = bmp;
    if (!pixels || pixels.length < width * height) {
        drawTAIBBitmap(canvas, placeholderBitmap);
        return;
    }

    const scale = 2;
    const newWidth = Math.max(1, Math.floor(width * scale));
    const newHeight = Math.max(1, Math.floor(height * scale));
    canvas.width = newWidth;
    canvas.height = newHeight;

    let imageData: ImageData;
    try {
        imageData = ctx.createImageData(newWidth, newHeight);
    } catch (e) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const out = imageData.data;
    const maxIndex = (1 << pixelSize) - 1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = pixels[y * width + x] | 0;
            let r = 0, g = 0, b = 0, a = 255;

            if (transparentIndex !== null && idx === transparentIndex) {
                a = 0;
            } else if (palette && palette.length > 0 && idx < palette.length) {
                const p = palette[idx];
                r = p.r; g = p.g; b = p.b;
            } else if (pixelSize === 8 && (!palette || palette.length === 0)) {
                [r, g, b] = palm8BitIndexToRGB(idx);
            } else {
                let val = 0;
                if (pixelSize === 1) val = idx ? 0 : 255;
                else if (pixelSize === 2) val = Math.round(255 * (1 - idx / 3));
                else if (pixelSize === 4) val = Math.round(255 * (1 - idx / 15));
                else val = Math.round(255 * (1 - idx / Math.max(1, maxIndex)));
                r = g = b = val;
            }

            const baseX = x * scale;
            const baseY = y * scale;
            for (let dy = 0; dy < scale; dy++) {
                for (let dx = 0; dx < scale; dx++) {
                    const px = (baseY + dy) * newWidth + (baseX + dx);
                    const off = px * 4;
                    out[off] = r;
                    out[off + 1] = g;
                    out[off + 2] = b;
                    out[off + 3] = a;
                }
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
};

export const PalmIcon: React.FC<{ bitmap?: TAIBBitmap }> = ({ bitmap }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (canvasRef.current) {
            drawTAIBBitmap(canvasRef.current, bitmap);
        }
    }, [bitmap]);

    const cssWidth = (bitmap?.width ?? PLACEHOLDER_SIZE) * 2;
    const cssHeight = (bitmap?.height ?? PLACEHOLDER_SIZE) * 2;

    return <canvas ref={canvasRef} style={{ width: cssWidth, height: cssHeight }} />;
};