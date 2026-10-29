/**
 * Preview scaling.
 *
 * The canvas always LAYS OUT the artboard at its true breakpoint width, so
 * container queries reflow exactly as a real device would. When that width
 * (or the 780px height) is bigger than the canvas, only the DISPLAY is shrunk
 * — the design is never re-flowed to a narrower "pretend" size.
 *
 * Two consequences the rest of the canvas has to live with:
 *   1. `getBoundingClientRect()` reports rendered pixels, so anything measured
 *      from it must be divided by the scale before it is used as an offset
 *      inside the scaled frame (overlays, drop lines, the inline editor).
 *   2. Hit-testing and pointer coordinates stay in rendered pixels, so they
 *      need no adjustment at all.
 */

export interface FitBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Never upscale: a 390px artboard in a 1200px canvas stays 100%. */
export const MIN_SCALE = 0.2;

export function fitScale(availW: number, availH: number, w: number, h: number): number {
  if (!(availW > 0) || !(availH > 0) || !(w > 0) || !(h > 0)) return 1;
  const scale = Math.min(1, availW / w, availH / h);
  return Math.max(MIN_SCALE, Math.round(scale * 1000) / 1000);
}

/** Rendered rect → the frame's own (unscaled) coordinates. */
export function toLocalBox(
  rect: { left: number; top: number; width: number; height: number },
  base: { left: number; top: number },
  scale = 1,
  scrollLeft = 0,
  scrollTop = 0,
): FitBox {
  const k = scale > 0 ? scale : 1;
  return {
    left: (rect.left - base.left) / k + scrollLeft,
    top: (rect.top - base.top) / k + scrollTop,
    width: rect.width / k,
    height: rect.height / k,
  };
}

/** The size the wrapper must reserve for a scaled frame. */
export function fitSize(w: number, h: number, scale: number): { w: number; h: number } {
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}
