import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { downloadScreenshots } from './screenshots';

describe('three-width screenshots', () => {
  it('captures the current screen and downloads the three requested filenames and widths', async () => {
    const doc = {
      ...createProject('Tea Shop'),
      screens: [emptyScreen('Home', { id: 'home', entry: true })],
    };
    const capture = vi.fn(
      async (_doc, _screen, width: number) =>
        new Blob([String(width)], { type: 'image/png' }),
    );
    const download = vi.fn();
    await downloadScreenshots(doc, 'home', capture, download);
    expect(capture.mock.calls.map((call) => call[2])).toEqual([390, 768, 1280]);
    expect(download.mock.calls.map((call) => call[1])).toEqual([
      'tea-shop-mobile.png',
      'tea-shop-tablet.png',
      'tea-shop-desktop.png',
    ]);
    expect(download).toHaveBeenCalledTimes(3);
  });
  it('does not download a partial set if a render fails', async () => {
    const doc = {
      ...createProject(),
      screens: [emptyScreen('Home', { id: 'home', entry: true })],
    };
    const download = vi.fn();
    const capture = vi
      .fn()
      .mockResolvedValueOnce(new Blob())
      .mockRejectedValueOnce(new Error('failed'));
    await expect(downloadScreenshots(doc, 'home', capture, download)).rejects.toThrow(
      'failed',
    );
    expect(download).not.toHaveBeenCalled();
  });
});
