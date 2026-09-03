import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { assertCanvasResourceLimits } from "../runtime/limits";

/**
 * Turn a rendered single gradient period into a repeating canvas pattern.
 * `reflect` is a true mirrored period: adjacent tiles reverse in both axes,
 * eliminating the discontinuity created by treating reflect as ordinary repeat.
 */
export function createRepeatingGradientPattern(
  ctx: SKRSContext2D,
  gradient: CanvasGradient,
  repeat: "repeat" | "reflect",
  width: number,
  height: number
): CanvasPattern {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  assertCanvasResourceLimits(w, h);

  const period = createCanvas(w, h);
  const periodCtx = period.getContext("2d") as SKRSContext2D;
  periodCtx.fillStyle = gradient;
  periodCtx.fillRect(0, 0, w, h);

  let source = period;
  if (repeat === "reflect") {
    const reflectedWidth = w * 2;
    const reflectedHeight = h * 2;
    assertCanvasResourceLimits(reflectedWidth, reflectedHeight);

    const reflected = createCanvas(reflectedWidth, reflectedHeight);
    const rctx = reflected.getContext("2d") as SKRSContext2D;

    rctx.drawImage(period, 0, 0);

    rctx.save();
    rctx.translate(reflectedWidth, 0);
    rctx.scale(-1, 1);
    rctx.drawImage(period, 0, 0);
    rctx.restore();

    rctx.save();
    rctx.translate(0, reflectedHeight);
    rctx.scale(1, -1);
    rctx.drawImage(period, 0, 0);
    rctx.restore();

    rctx.save();
    rctx.translate(reflectedWidth, reflectedHeight);
    rctx.scale(-1, -1);
    rctx.drawImage(period, 0, 0);
    rctx.restore();

    source = reflected;
  }

  const pattern = ctx.createPattern(source, "repeat");
  if (!pattern) throw new Error("Failed to create repeating gradient pattern");
  return pattern;
}
