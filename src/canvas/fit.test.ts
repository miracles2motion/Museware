import { describe, expect, it } from 'vitest';
import { MIN_SCALE, fitScale, fitSize, toLocalBox } from './fit';

describe('fitting a real frame into the canvas', () => {
  it('never upscales a small artboard in a big canvas', () => {
    expect(fitScale(1200, 900, 390, 780)).toBe(1);
    expect(fitScale(1280, 1000, 768, 780)).toBe(1);
  });

  it('shrinks an artboard that is wider than the canvas', () => {
    expect(fitScale(640, 900, 1280, 780)).toBe(0.5);
    expect(fitScale(320, 900, 1280, 780)).toBe(0.25);
  });

  it('shrinks for height too, so a whole phone screen is visible', () => {
    // A 390x780 screen on a 378x600 canvas: height wins at ~0.758.
    expect(fitScale(378, 600, 390, 780)).toBeCloseTo(0.769, 2);
    expect(fitScale(378, 300, 390, 780)).toBeCloseTo(0.385, 3);
  });

  it('keeps a floor so a degenerate box cannot collapse the frame', () => {
    expect(fitScale(4, 4, 1280, 780)).toBe(MIN_SCALE);
    expect(fitScale(0, 0, 1280, 780)).toBe(1);
    expect(fitScale(800, 800, 0, 0)).toBe(1);
  });

  it('reserves the scaled size so the canvas can centre and scroll it', () => {
    expect(fitSize(1280, 780, 0.5)).toEqual({ w: 640, h: 390 });
    expect(fitSize(390, 780, 1)).toEqual({ w: 390, h: 780 });
  });
});

describe('overlay coordinates inside a scaled frame', () => {
  const base = { left: 100, top: 50 };

  it('is a plain subtraction at 100%', () => {
    const box = toLocalBox({ left: 130, top: 90, width: 200, height: 40 }, base, 1, 0, 0);
    expect(box).toEqual({ left: 30, top: 40, width: 200, height: 40 });
  });

  it('divides out the display scale, or every outline would drift', () => {
    // Rendered at 50%: a node 15px right of the frame is 30px into the tree.
    const box = toLocalBox({ left: 115, top: 65, width: 50, height: 20 }, base, 0.5, 0, 0);
    expect(box).toEqual({ left: 30, top: 30, width: 100, height: 40 });
  });

  it('adds the frame scroll after unscaling it', () => {
    const box = toLocalBox({ left: 115, top: 65, width: 50, height: 20 }, base, 0.5, 12, 4);
    expect(box).toEqual({ left: 42, top: 34, width: 100, height: 40 });
  });

  it('survives a missing scale instead of dividing by zero', () => {
    const box = toLocalBox({ left: 110, top: 60, width: 10, height: 10 }, base, 0);
    expect(box).toEqual({ left: 10, top: 10, width: 10, height: 10 });
  });
});
