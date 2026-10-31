// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountMotion } from './motion';
afterEach(() => vi.restoreAllMocks());
describe('canvas motion', () => {
  it('handles unavailable canvas context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(() => mountMotion(document.createElement('canvas'))).not.toThrow();
  });
  it('renders one static frame under reduced motion', () => {
    const fillRect = vi.fn();
    const ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      fillRect,
      beginPath: vi.fn(),
      ellipse: vi.fn(),
      stroke: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const stop = mountMotion(document.createElement('canvas'), { preset: 'globe' });
    expect(fillRect).toHaveBeenCalledTimes(1);
    expect(raf).not.toHaveBeenCalled();
    stop();
    vi.unstubAllGlobals();
  });
});
