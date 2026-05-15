import React, { useEffect, useRef } from "react";
import { palm8BitIndexToRGB } from "../utils/palm-palette";

import {
    PLACEHOLDER_SIZE,
    placeholderBitmap
} from "../utils/taib-extractor";

import { TAIBBitmap } from "../utils/taib-types";

interface PalmIconProps {
    bitmap?: TAIBBitmap;
    scale?: number;
}

export const drawTAIBBitmap = (
    canvas: HTMLCanvasElement,
    bitmap?: TAIBBitmap,
    scale = 2
) => {
    const bmp = bitmap ?? placeholderBitmap;

    const width = Number(bmp.width) || 0;
    const height = Number(bmp.height) || 0;

    /*
     * CRITICAL:
     * Old code safely handled invalid dimensions.
     * Restore that behavior so other parts of the app don't explode.
     */
    if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
    ) {
        canvas.width = PLACEHOLDER_SIZE;
        canvas.height = PLACEHOLDER_SIZE;

        const ctx = canvas.getContext("2d");

        if (ctx) {
            ctx.clearRect(
                0,
                0,
                canvas.width,
                canvas.height
            );
        }

        return;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
        return;
    }

    const {
        pixels,
        palette,
        pixelSize = 1,
        transparentIndex = null
    } = bmp;

    /*
     * Another important compatibility guard
     */
    if (
        !pixels ||
        pixels.length < width * height
    ) {
        drawTAIBBitmap(
            canvas,
            placeholderBitmap,
            scale
        );

        return;
    }

    const scaledWidth = Math.max(
        1,
        Math.floor(width * scale)
    );

    const scaledHeight = Math.max(
        1,
        Math.floor(height * scale)
    );

    canvas.width = scaledWidth;
    canvas.height = scaledHeight;

    let imageData: ImageData;

    /*
     * Browser safety guard
     */
    try {
        imageData = ctx.createImageData(
            scaledWidth,
            scaledHeight
        );
    } catch (e) {
        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        return;
    }

    const out = imageData.data;

    const maxIndex =
        Math.max(1, (1 << pixelSize) - 1);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx =
                pixels[y * width + x] | 0;

            let r = 0;
            let g = 0;
            let b = 0;
            let a = 255;

            if (
                transparentIndex !== null &&
                transparentIndex !== undefined &&
                idx === transparentIndex
            ) {
                a = 0;
            } else if (
                palette &&
                palette.length > 0 &&
                idx < palette.length
            ) {
                const p = palette[idx];

                r = p.r;
                g = p.g;
                b = p.b;
            } else if (
                pixelSize === 8 &&
                (!palette || palette.length === 0)
            ) {
                [r, g, b] =
                    palm8BitIndexToRGB(idx);
            } else {
                let val = 0;

                if (pixelSize === 1) {
                    val = idx ? 0 : 255;
                } else if (pixelSize === 2) {
                    val = Math.round(
                        255 * (1 - idx / 3)
                    );
                } else if (pixelSize === 4) {
                    val = Math.round(
                        255 * (1 - idx / 15)
                    );
                } else {
                    val = Math.round(
                        255 *
                        (1 -
                            idx / maxIndex)
                    );
                }

                r = g = b = val;
            }

            const baseX = x * scale;
            const baseY = y * scale;

            for (let dy = 0; dy < scale; dy++) {
                for (
                    let dx = 0;
                    dx < scale;
                    dx++
                ) {
                    const px =
                        (baseY + dy) *
                        scaledWidth +
                        (baseX + dx);

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

export const PalmIcon: React.FC<PalmIconProps> = ({
                                                      bitmap,
                                                      scale = 1
                                                  }) => {
    const canvasRef =
        useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (canvasRef.current) {
            drawTAIBBitmap(
                canvasRef.current,
                bitmap,
                scale
            );
        }
    }, [bitmap, scale]);

    const cssWidth =
        (bitmap?.width ?? PLACEHOLDER_SIZE) *
        scale;

    const cssHeight =
        (bitmap?.height ?? PLACEHOLDER_SIZE) *
        scale;

    return (
        <canvas
            ref={canvasRef}
            style={{
                width: cssWidth,
                height: cssHeight,
                imageRendering: "pixelated",
            }}
        />
    );
};