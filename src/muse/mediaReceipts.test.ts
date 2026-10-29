import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateImage, segmentImage, transcribe } from './client';
import { useAgent } from '../store/useAgent';

beforeEach(() =>
  useAgent.setState({ receipts: [], sessionRequests: 0, keySource: 'session' }),
);
afterEach(() => vi.unstubAllGlobals());
describe('media request receipts', () => {
  it('records image, segmentation, and transcription requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ data: [{ url: 'https://example.com/image.png' }] }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ boxes: [] }), { status: 200 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ text: 'hello' }), { status: 200 }),
        ),
    );
    await generateImage('draw a star');
    await segmentImage('data:image/png;base64,AAA');
    await transcribe('AAA', 'audio/webm');
    expect(useAgent.getState().receipts.map((r) => r.role)).toEqual([
      'image',
      'sam',
      'voice',
    ]);
    expect(useAgent.getState().receipts.every((r) => r.key === 'user')).toBe(true);
  });
  it('records a failed attempted request without claiming it succeeded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(segmentImage('image')).rejects.toThrow('offline');
    expect(useAgent.getState().receipts).toHaveLength(1);
    expect(useAgent.getState().receipts[0].role).toBe('sam');
    expect(useAgent.getState().receipts[0].status).toBe('failed');
  });
});
