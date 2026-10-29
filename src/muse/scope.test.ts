import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyScreen } from '../ops/screenOps';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import type { ComponentNode } from '../types/tree';
import { chatStream, type ChatResult } from './client';
import { decisionLedger, runScopedAction } from './loop';

vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
  chatStream: vi.fn(),
}));
const node = (
  id: string,
  type: ComponentNode['type'],
  children: ComponentNode[] = [],
): ComponentNode => ({
  id,
  type,
  props: type === 'text' ? { text: id } : {},
  styles: {},
  children,
});
const reply = (name: string, args: unknown): ChatResult => ({
  text: '',
  toolCalls: [{ id: name, name, arguments: JSON.stringify(args) }],
  finishReason: 'tool_calls',
  model: 'test',
  latencyMs: 1,
  usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, totalTokens: 2 },
});
const finish = () => reply('finish', { summary: 'Done.' });
beforeEach(() => {
  vi.mocked(chatStream).mockReset();
  const a = emptyScreen('A', { id: 'aaa', entry: true });
  a.root.children = [
    node('section_a', 'col', [node('text_aaa', 'text')]),
    node('section_b', 'col', [node('text_bbb', 'text')]),
  ];
  const b = emptyScreen('B', { id: 'bbb' });
  b.root.children = [node('text_ccc', 'text')];
  useProject.getState().replaceDoc({ ...createProject(), screens: [a, b] });
  useAgent.setState({
    demoMode: false,
    keySource: 'session',
    models: null,
    contributorMode: false,
    receipts: [],
  });
});
describe('scoped redesign', () => {
  it('drops foreign ops, groups all accepted edits into one undo, and records the decision', async () => {
    const before = structuredClone(useProject.getState().doc);
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [
            { op: 'setText', id: 'text_aaa', text: 'New copy' },
            { op: 'setText', id: 'text_bbb', text: 'Forbidden' },
            { op: 'removeScreen', id: 'bbb' },
            {
              op: 'add',
              parentId: 'section_a',
              node: { id: 'added_one', type: 'text', props: { text: 'Added' } },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [{ op: 'setStyles', id: 'added_one', styles: { color: 'red' } }],
        }),
      )
      .mockResolvedValueOnce(finish());
    await runScopedAction('section_a', 'Make it better');
    const after = useProject.getState().doc;
    expect(after.screens[1]).toEqual(before.screens[1]);
    expect(after.screens[0].root.children[1]).toEqual(before.screens[0].root.children[1]);
    expect(after.screens[0].root.children[0].children[0].props.text).toBe('New copy');
    expect(after.screens[0].root.children[0].children[1].styles.color).toBe('red');
    expect(after.rail.some((r) => r.text.includes('dropped 2'))).toBe(true);
    expect(decisionLedger(after)).toContain('section section_a redesigned at');
    expect(
      useAgent.getState().receipts.filter((r) => r.role === 'scope:section_a'),
    ).toHaveLength(1);
    expect(useProject.getState().undoStack).toHaveLength(1);
    useProject.getState().undo();
    expect(useProject.getState().doc.screens).toEqual(before.screens);
  });
  it('styles-only allows only styling the chosen widget', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [
            { op: 'setText', id: 'text_aaa', text: 'bad' },
            { op: 'setStyles', id: 'text_bbb', styles: { color: 'red' } },
            { op: 'setStyles', id: 'text_aaa', styles: { color: 'blue' } },
          ],
        }),
      )
      .mockResolvedValueOnce(finish());
    await runScopedAction('text_aaa', 'Blue', true);
    const a = useProject.getState().doc.screens[0].root.children;
    expect(a[0].children[0].props.text).toBe('text_aaa');
    expect(a[0].children[0].styles.color).toBe('blue');
    expect(a[1].children[0].styles.color).toBeUndefined();
  });
  it('does not overwrite a concurrent edit to the selection', async () => {
    vi.mocked(chatStream)
      .mockImplementationOnce(async () => {
        useProject
          .getState()
          .applyBatch([{ op: 'setText', id: 'text_aaa', text: 'User edit' }], {
            source: 'user',
          });
        return reply('edit_canvas', {
          ops: [{ op: 'setText', id: 'text_aaa', text: 'Agent edit' }],
        });
      })
      .mockResolvedValueOnce(finish());
    await runScopedAction('section_a', 'Redesign');
    expect(
      useProject.getState().doc.screens[0].root.children[0].children[0].props.text,
    ).toBe('User edit');
    expect(
      useProject.getState().doc.rail.some((r) => r.text.includes('selection changed')),
    ).toBe(true);
  });
  it('does not apply staged work after the project is replaced, even with identical ids', async () => {
    vi.mocked(chatStream)
      .mockImplementationOnce(async () => {
        useProject.getState().replaceDoc(structuredClone(useProject.getState().doc));
        return reply('edit_canvas', {
          ops: [{ op: 'setText', id: 'text_aaa', text: 'Agent edit' }],
        });
      })
      .mockResolvedValueOnce(finish());
    await runScopedAction('section_a', 'Redesign');
    expect(
      useProject.getState().doc.screens[0].root.children[0].children[0].props.text,
    ).toBe('text_aaa');
  });

  it('preserves concurrent changes outside the scope through undo', async () => {
    vi.mocked(chatStream)
      .mockImplementationOnce(async () => {
        useProject
          .getState()
          .applyBatch([{ op: 'setText', id: 'text_bbb', text: 'Other edit' }], {
            source: 'user',
          });
        return reply('edit_canvas', {
          ops: [{ op: 'setText', id: 'text_aaa', text: 'Agent edit' }],
        });
      })
      .mockResolvedValueOnce(finish());
    await runScopedAction('section_a', 'Redesign');
    useProject.getState().undo();
    const nodes = useProject.getState().doc.screens[0].root.children;
    expect(nodes[0].children[0].props.text).toBe('text_aaa');
    expect(nodes[1].children[0].props.text).toBe('Other edit');
  });
});
