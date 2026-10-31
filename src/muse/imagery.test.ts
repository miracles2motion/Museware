import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyScreen } from '../ops/screenOps';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import type { ComponentNode } from '../types/tree';
import { toolSchemas } from '../types/tools';
import { generateImage, chatStream, type ChatResult } from './client';
import { autoIllustrate, illustrateTarget, imageSizeFor } from './imagery';
import { runAgentTurn } from './loop';

vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
  generateImage: vi.fn(),
  chatStream: vi.fn(),
}));
const reply = (name: string, args: unknown): ChatResult => ({
  text: '',
  toolCalls: [{ id: name, name, arguments: JSON.stringify(args) }],
  finishReason: 'tool_calls',
  model: 'test',
  latencyMs: 1,
  usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 },
});
beforeEach(() => {
  vi.mocked(generateImage).mockReset().mockResolvedValue('https://example.com/image.png');
  vi.mocked(chatStream).mockReset();
  const screen = emptyScreen('Tea', { id: 'tea', entry: true });
  screen.root.children = Array.from(
    { length: 5 },
    (_, i): ComponentNode => ({
      id: `image_${i}`,
      type: 'image',
      props: { src: '', alt: 'Tea' },
      styles: {},
      children: [],
    }),
  );
  useProject
    .getState()
    .replaceDoc({ ...createProject(), name: 'Tea Shop', screens: [screen] });
  useAgent.setState({
    demoMode: false,
    keySource: 'session',
    houseKey: 'ok',
    budget: null,
    models: null,
    receipts: [],
  });
});
describe('build imagery', () => {
  it('schema validates at most six targets', () => {
    expect(
      toolSchemas.illustrate_images.parse({ targets: [{ id: 'image_0', prompt: 'tea' }] })
        .targets,
    ).toHaveLength(1);
    expect(
      toolSchemas.illustrate_images.safeParse({
        targets: Array.from({ length: 7 }, () => ({ id: 'image_0' })),
      }).success,
    ).toBe(false);
  });
  it('auto pass caps images, uses palette, and makes image src undoable', async () => {
    const outcomes = await autoIllustrate(['tea'], 'modern tea shop', 3);
    expect(outcomes).toHaveLength(3);
    expect(generateImage).toHaveBeenCalledTimes(3);
    expect(vi.mocked(generateImage).mock.calls[0][0]).toContain(
      useProject.getState().doc.tokens.openuiTheme.brand_color,
    );
    expect(useProject.getState().doc.screens[0].root.children[2].props.src).toBe(
      'https://example.com/image.png',
    );
    useProject.getState().undo();
    expect(useProject.getState().doc.screens[0].root.children[2].props.src).toBe('');
  });
  it('records failures with the cause and preserves the image', async () => {
    vi.mocked(generateImage).mockRejectedValueOnce(new Error('Provider timed out'));
    await illustrateTarget({ id: 'image_0' });
    const lines = useProject.getState().doc.rail.map((entry) => entry.text);
    expect(lines.some((line) => line.includes('Illustrating image_0'))).toBe(true);
    expect(
      lines.some((line) => line.includes('image_0') && line.includes('Provider timed out')),
    ).toBe(true);
    expect(useProject.getState().doc.screens[0].root.children[0].props.src).toBe('');
  });
  it('uses nearby product copy to request a photograph rather than a vector', async () => {
    const doc = structuredClone(useProject.getState().doc);
    const image = doc.screens[0].root.children[0];
    image.props.alt = 'Image';
    doc.screens[0].root.children = [
      {
        id: 'card_tea',
        type: 'card',
        props: {},
        styles: {},
        children: [
          image,
          {
            id: 'tea_name',
            type: 'heading',
            props: { text: 'Jasmine Green Tea' },
            styles: {},
            children: [],
          },
        ],
      },
    ];
    useProject.getState().replaceDoc(doc);
    await illustrateTarget({ id: 'image_0' });
    const prompt = vi.mocked(generateImage).mock.calls[0][0];
    expect(prompt).toMatch(/photograph/i);
    expect(prompt).toContain('Jasmine Green Tea');
    expect(prompt).not.toMatch(/flat vector|abstract background|no text/i);
  });
  it('identifies targets skipped by the automated cap', async () => {
    await autoIllustrate(['tea'], 'tea', 3);
    expect(
      useProject
        .getState()
        .doc.rail.some(
          (entry) =>
            entry.text.includes('skipped') &&
            entry.text.includes('image_3') &&
            entry.text.includes('image_4'),
        ),
    ).toBe(true);
  });
  it('generates strictly one at a time and updates pending states', async () => {
    const resolvers: Array<(src: string) => void> = [];
    vi.mocked(generateImage).mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    const pending = autoIllustrate(['tea'], 'tea', 2);
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalledTimes(1));
    expect([...useAgent.getState().assetsPending]).toEqual(['image_0']);
    expect(useAgent.getState().assetJobs.map((j) => j.state)).toEqual([
      'running',
      'queued',
      'skipped',
      'skipped',
      'skipped',
    ]);
    resolvers[0]('https://example.com/one.png');
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalledTimes(2));
    expect([...useAgent.getState().assetsPending]).toEqual(['image_1']);
    resolvers[1]('https://example.com/two.png');
    await pending;
    expect(useAgent.getState().assetsPending.size).toBe(0);
    expect(useAgent.getState().assetJobs.map((j) => j.state)).toEqual([
      'done',
      'done',
      'skipped',
      'skipped',
      'skipped',
    ]);
  });
  it('retries once after a three-second backoff within the call cap', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(generateImage)
        .mockRejectedValueOnce(new Error('temporary'))
        .mockResolvedValueOnce('https://example.com/retry.png');
      const pending = autoIllustrate(['tea'], 'tea', 2);
      await vi.advanceTimersByTimeAsync(2999);
      expect(generateImage).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(generateImage).toHaveBeenCalledTimes(2);
      expect(useAgent.getState().assetJobs[0].state).toBe('done');
      expect(useAgent.getState().assetJobs[1].state).toBe('skipped');
    } finally {
      vi.useRealTimers();
    }
  });
  it('chooses wide sizes for hero or story and square for cards', () => {
    const s = useProject.getState().doc.screens[0];
    const hero: ComponentNode = {
      id: 'hero_img',
      type: 'image',
      props: {},
      styles: {},
      children: [],
    };
    expect(imageSizeFor(s, hero)).toBe('1200x640');
    expect(imageSizeFor(s, s.root.children[0])).toBe('768x768');
  });
  it('reports an exhausted shared key without making requests', async () => {
    useAgent.setState({ keySource: 'env', houseKey: 'exhausted' });
    await autoIllustrate(['tea'], 'tea', 3);
    expect(generateImage).not.toHaveBeenCalled();
    expect(
      useProject.getState().doc.rail.some((r) => r.text.includes('budget exhausted')),
    ).toBe(true);
  });
  it('exposes the tool to the live loop and writes src', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('illustrate_images', { targets: [{ id: 'image_0', prompt: 'tea' }] }),
      )
      .mockResolvedValueOnce(reply('finish', { summary: 'Image done' }));
    await runAgentTurn('Illustrate this image', { skipVerify: true });
    expect(useProject.getState().doc.screens[0].root.children[0].props.src).toBe(
      'https://example.com/image.png',
    );
  });
  it('does not apply an image to a different project opened during generation', async () => {
    let resolve!: (src: string) => void;
    vi.mocked(generateImage).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = illustrateTarget({ id: 'image_0' });
    useProject.getState().replaceDoc(structuredClone(useProject.getState().doc));
    resolve('https://example.com/agent.png');
    expect((await pending).ok).toBe(false);
    expect(useProject.getState().doc.screens[0].root.children[0].props.src).toBe('');
  });

  it('does not overwrite a user edit made while generation is in flight', async () => {
    let resolve!: (src: string) => void;
    vi.mocked(generateImage).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = illustrateTarget({ id: 'image_0' });
    useProject
      .getState()
      .applyBatch(
        [{ op: 'setProps', id: 'image_0', props: { src: 'https://example.com/user.png' } }],
        { source: 'user' },
      );
    resolve('https://example.com/agent.png');
    expect((await pending).ok).toBe(false);
    expect(useProject.getState().doc.screens[0].root.children[0].props.src).toBe(
      'https://example.com/user.png',
    );
  });
});
