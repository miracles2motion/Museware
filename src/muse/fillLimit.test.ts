import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyScreen } from '../ops/screenOps';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { chatStream, type ChatResult } from './client';
import { runFillQueue } from './loop';
vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
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
  vi.mocked(chatStream).mockReset();
  const screen = emptyScreen('Tea', { id: 'tea', entry: true });
  screen.root.children = [
    {
      id: 'head_tea',
      type: 'heading',
      props: { text: 'Tea', level: 1 },
      styles: {},
      children: [],
    },
  ];
  useProject.getState().replaceDoc({
    ...createProject(),
    screens: [screen],
    blueprint: {
      text: 'SCREEN: Tea\n- head_tea (heading) Tea',
      decided: true,
      updatedAt: Date.now(),
    },
  });
  useAgent.setState({
    demoMode: false,
    models: null,
    contributorMode: false,
    wonder: false,
    buildImages: 0,
    receipts: [],
  });
});
describe('fill call allowance', () => {
  it('does not claim success when the builder stops without finish', async () => {
    vi.mocked(chatStream).mockResolvedValueOnce({
      ...reply('finish', { summary: 'unused' }),
      text: 'Stopped early',
      toolCalls: [],
      finishReason: 'stop',
    });
    await runFillQueue({ mode: 'steady' });
    expect(useAgent.getState().verification).toBe('problems');
    expect(
      useProject
        .getState()
        .doc.rail.some((entry) => entry.text.includes('no screens completed')),
    ).toBe(true);
  });

  it('finishes after seven edit batches instead of stopping at six', async () => {
    for (let i = 1; i <= 7; i += 1)
      vi.mocked(chatStream).mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [{ op: 'setText', id: 'head_tea', text: `Tea ${i}` }],
        }),
      );
    vi.mocked(chatStream)
      .mockResolvedValueOnce(reply('finish', { summary: 'Finished screen' }))
      .mockResolvedValueOnce({
        ...reply('finish', { summary: 'unused' }),
        text: 'PASS',
        toolCalls: [],
        finishReason: 'stop',
      });
    await runFillQueue({ mode: 'steady' });
    expect(useProject.getState().doc.screens[0].root.children[0].props.text).toBe('Tea 7');
    expect(vi.mocked(chatStream)).toHaveBeenCalledTimes(9);
    expect(useAgent.getState().verification).toBe('pass');
  });
});
