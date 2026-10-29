import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyScreen } from '../ops/screenOps';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import type { ComponentNode } from '../types/tree';
import { toolSchemas } from '../types/tools';
import { generateImage, chatStream, type ChatResult } from './client';
import { autoIllustrate, illustrateTarget } from './imagery';
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
