import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { emptyScreen } from '../ops/screenOps';
import { chatStream, type ChatResult } from './client';
import { verifyGate } from './loop';
import { lintScreen } from './qualityLint';
import type { ComponentNode } from '../types/tree';

vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
  chatStream: vi.fn(),
}));
const node = (
  id: string,
  type: ComponentNode['type'],
  props: Record<string, unknown>,
): ComponentNode => ({ id, type, props, styles: {}, children: [] });
const reply = (calls: ChatResult['toolCalls'] = [], text = ''): ChatResult => ({
  text,
  toolCalls: calls,
  finishReason: calls.length ? 'tool_calls' : 'stop',
  model: 'test',
  latencyMs: 1,
  usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 },
});
beforeEach(() => {
  vi.mocked(chatStream).mockReset();
  const screen = emptyScreen('Tea', { id: 'tea', entry: true });
  screen.root.children = [
    node('tea_text', 'text', { text: 'Body text that says something useful.' }),
    node('tea_hero', 'hero', { title: 'Fresh leaves', image: '' }),
  ];
  useProject.getState().replaceDoc({ ...createProject(), screens: [screen] });
  useAgent.setState({
    demoMode: false,
    models: null,
    contributorMode: false,
    wonder: false,
    receipts: [],
  });
});
describe('quality lint and gate', () => {
  it('flags placeholder and empty hero independently, and accepts clean copy and imagery', () => {
    const screen = useProject.getState().doc.screens[0];
    expect(
      lintScreen(screen)
        .filter((f) => f.severity === 'block')
        .map((f) => f.code),
    ).toEqual(['scaffold', 'imagery']);
    screen.root.children[0].props.text = 'Whole leaf tea';
    screen.root.children[1].props.image = 'https://example.com/tea.png';
    expect(lintScreen(screen)).toEqual([]);
  });
  it('warns when a named landing has no imagery at all', () => {
    const screen = emptyScreen('Tea Landing', { id: 'tea', entry: true });
    screen.root.children = [node('tea_text', 'text', { text: 'Whole leaf tea' })];
    expect(lintScreen(screen)).toEqual([
      expect.objectContaining({
        severity: 'warn',
        code: 'imagery',
        nodeId: screen.root.id,
      }),
    ]);
  });
  it('runs a targeted repair then reports reviewer failure honestly', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply([
          {
            id: 'repair',
            name: 'edit_canvas',
            arguments: JSON.stringify({
              ops: [
                { op: 'setText', id: 'tea_text', text: 'Whole leaf tea' },
                {
                  op: 'setProps',
                  id: 'tea_hero',
                  props: { image: 'https://example.com/tea.png' },
                },
              ],
            }),
          },
        ]),
      )
      .mockResolvedValueOnce(
        reply([
          {
            id: 'done',
            name: 'finish',
            arguments: JSON.stringify({ summary: 'Repaired.' }),
          },
        ]),
      )
      .mockRejectedValueOnce(new Error('review offline'));
    const doc = useProject.getState().doc;
    await verifyGate('Tea landing', doc, ['tea']);
    expect(vi.mocked(chatStream)).toHaveBeenCalledTimes(3);
    expect(useAgent.getState().verification).toBe('unverified');
    expect(useAgent.getState().reviewNotes).toContain('review offline');
    expect(lintScreen(useProject.getState().doc.screens[0])).toEqual([]);
  });
  it('never calls the reviewer or passes when repair fails and blockers remain', async () => {
    vi.mocked(chatStream).mockRejectedValue(new Error('offline'));
    await verifyGate('Tea landing', useProject.getState().doc, ['tea']);
    expect(useAgent.getState().verification).toBe('problems');
    expect(useAgent.getState().reviewNotes).toContain('tea_text');
    expect(useAgent.getState().reviewNotes).toContain('tea_hero');
    expect(vi.mocked(chatStream)).toHaveBeenCalledTimes(1);
  });
});
