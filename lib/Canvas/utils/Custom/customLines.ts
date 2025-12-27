import { SKRSContext2D } from '@napi-rs/canvas';
import { createGradientFill } from "../Image/imageProperties";
import { CustomOptions } from "../types";
import { drawArrow, drawMarker, createSmoothPath, createCatmullRomPath, applyLinePattern, applyLineTexture, getPointOnLinePath } from "./advancedLines";

export async function customLines(ctx: SKRSContext2D, options: CustomOptions[]): Promise<void> {

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    let previousEndCoordinates: { x: number; y: number } | null = null;
    let currentStyle: CustomOptions['lineStyle'] | null = null;
    let inSingleLineSequence = false;

    for (let i = 0; i < options.length; i++) {
        const customOption = options[i];
        const { startCoordinates, endCoordinates, lineStyle, path, arrow, markers } = customOption;
        const isSingleLine = lineStyle?.singleLine;

        const allPoints: Array<{ x: number; y: number }> = [];
        if (i === 0 || !isSingleLine) {
            allPoints.push(startCoordinates);
        }
        allPoints.push(endCoordinates);

        if (isSingleLine && !inSingleLineSequence) {
            currentStyle = lineStyle;
            inSingleLineSequence = true;
            ctx.beginPath();
            ctx.moveTo(startCoordinates.x, startCoordinates.y);
        }

        if (!isSingleLine && inSingleLineSequence) {
            ctx.stroke();
            if (currentStyle) {
              applyStroke(ctx, currentStyle, startCoordinates, endCoordinates);
            }
            inSingleLineSequence = false;
            currentStyle = null;
        }

        const start = inSingleLineSequence && previousEndCoordinates
            ? previousEndCoordinates
            : startCoordinates;

        if (!inSingleLineSequence) {
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
        }

        if (path && allPoints.length >= 2) {
            ctx.beginPath();
            if (path.type === 'smooth') {
                createSmoothPath(ctx, allPoints, path.tension ?? 0.5, path.closed ?? false);
            } else if (path.type === 'catmull-rom') {
                createCatmullRomPath(ctx, allPoints, path.tension ?? 0.5, path.closed ?? false);
            } else if (path.type === 'bezier' && allPoints.length >= 4) {
                ctx.moveTo(allPoints[0].x, allPoints[0].y);
                for (let j = 1; j < allPoints.length - 2; j += 3) {
                    if (j + 2 < allPoints.length) {
                        ctx.bezierCurveTo(
                            allPoints[j].x, allPoints[j].y,
                            allPoints[j + 1].x, allPoints[j + 1].y,
                            allPoints[j + 2].x, allPoints[j + 2].y
                        );
                    }
                }
            } else {
                ctx.lineTo(endCoordinates.x, endCoordinates.y);
            }
        } else {
            ctx.lineTo(endCoordinates.x, endCoordinates.y);
        }

        const appliedStyle = inSingleLineSequence ? currentStyle : lineStyle;
        ctx.lineWidth = appliedStyle?.width || 1;

        if (appliedStyle?.gradient) {
            ctx.strokeStyle = createGradientFill(ctx, appliedStyle.gradient, { x: start.x, y: start.y, w: endCoordinates.x - start.x, h: endCoordinates.y - start.y });
        } else {
            ctx.strokeStyle = appliedStyle?.color || 'black';
        }

        ctx.lineJoin = appliedStyle?.lineJoin || 'miter';
        ctx.lineCap = appliedStyle?.lineCap || 'butt';

        if (appliedStyle?.pattern) {
            applyLinePattern(ctx, appliedStyle.pattern);
        } else if (appliedStyle?.lineDash) {
            ctx.setLineDash(appliedStyle.lineDash.dashArray || []);
            ctx.lineDashOffset = appliedStyle.lineDash.offset || 0;
        } else {
            ctx.setLineDash([]);
        }

        if (appliedStyle?.texture) {
            await applyLineTexture(ctx, appliedStyle.texture, appliedStyle.width || 1,
                Math.sqrt(Math.pow(endCoordinates.x - start.x, 2) + Math.pow(endCoordinates.y - start.y, 2)));
        }

        if (typeof appliedStyle?.lineRadius === 'number' && appliedStyle.lineRadius > 0) {
            const radius = appliedStyle.lineRadius;
            const dx = endCoordinates.x - start.x;
            const dy = endCoordinates.y - start.y;
            const angle = Math.atan2(dy, dx);

            ctx.lineCap = "round";
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(start.x, start.y, radius, angle + Math.PI / 2, angle - Math.PI / 2, true);
            ctx.arc(endCoordinates.x, endCoordinates.y, radius, angle - Math.PI / 2, angle + Math.PI / 2, false);
            ctx.fill();
        }

        else if (appliedStyle?.lineRadius === 'circular') {
            const dx = endCoordinates.x - start.x;
            const dy = endCoordinates.y - start.y;
            const length = Math.sqrt(dx * dx + dy * dy);

            ctx.beginPath();
            ctx.arcTo(start.x, start.y, endCoordinates.x, endCoordinates.y, length / 2);
            ctx.arcTo(endCoordinates.x, endCoordinates.y, start.x, start.y, length / 2);
            ctx.closePath();
            ctx.stroke();
        }

        if (!inSingleLineSequence || i === options.length - 1) {
            ctx.stroke();
            if (appliedStyle) {
              applyStroke(ctx, appliedStyle, startCoordinates, endCoordinates);
            }
        }

        if (arrow) {
            const dx = endCoordinates.x - start.x;
            const dy = endCoordinates.y - start.y;
            const angle = Math.atan2(dy, dx);
            const arrowColor = arrow.color || appliedStyle?.color || 'black';
            const arrowSize = arrow.size || 10;

            if (arrow.start) {
                drawArrow(ctx, start.x, start.y, angle + Math.PI, arrowSize, arrow.style || 'filled', arrowColor);
            }
            if (arrow.end) {
                drawArrow(ctx, endCoordinates.x, endCoordinates.y, angle, arrowSize, arrow.style || 'filled', arrowColor);
            }
        }

        if (markers && markers.length > 0) {
            const linePoints = [start, endCoordinates];
            for (const marker of markers) {
                const point = getPointOnLinePath(linePoints, marker.position);
                drawMarker(ctx, point.x, point.y, marker.shape, marker.size, marker.color);
            }
        }

        previousEndCoordinates = endCoordinates;

        if (!isSingleLine) {
            currentStyle = null;
            inSingleLineSequence = false;
        }
    }
}

function applyStroke(ctx: SKRSContext2D, style: CustomOptions['lineStyle'] | undefined, start: { x: number; y: number }, end: { x: number; y: number }): void {
    if (!style || !style.stroke) {
      return;
    }

    if (style.stroke) {
        const { color, width, gradient, lineRadius, lineCap } = style.stroke;
        const prevStrokeStyle = ctx.strokeStyle;
        const prevLineWidth = ctx.lineWidth;
        const prevLineCap = ctx.lineCap;

        if (gradient) {
            ctx.strokeStyle = createGradientFill(ctx, gradient, { x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y });
        } else {
            ctx.strokeStyle = color || prevStrokeStyle;
        }

        ctx.lineWidth = width || prevLineWidth;
        ctx.lineCap = lineCap || prevLineCap;
        ctx.stroke();

        if (typeof lineRadius === 'number' && lineRadius > 0) {
            ctx.beginPath();
            ctx.arc(start.x, start.y, lineRadius, 0, Math.PI * 2);
            ctx.arc(end.x, end.y, lineRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = prevStrokeStyle;
        ctx.lineWidth = prevLineWidth;
        ctx.lineCap = prevLineCap;
    }
}
