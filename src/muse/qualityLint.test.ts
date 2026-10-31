import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { emptyScreen } from '../ops/screenOps';
import { chatStream, generateImage, type ChatResult } from './client';
import { verifyGate } from './loop';
import { lintScreen } from './qualityLint';
import type { ComponentNode } from '../types/tree';

vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
  chatStream: vi.fn(),
  generateImage: vi.fn(),
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
  vi.mocked(generateImage).mockReset().mockResolvedValue('https://example.com/tea.png');
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
    keySource: 'session',
    houseKey: 'ok',
    budget: null,
    buildImages: 3,
  });
});
describe('quality lint and gate', () => {
  it('warns a web build when responsive overrides or navbar are absent', () => {
    const s = useProject.getState().doc.screens[0];
    const warnings = lintScreen(s, undefined, new Set(), 'web');
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'responsive', severity: 'warn' }),
    );
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'navbar', severity: 'warn' }),
    );
    s.root.children.push(node('nav_tea', 'navbar', { brand: 'Tea' }));
    s.root.styles.responsive = { medium: { gap: '16px' } };
    const updated = lintScreen(s, undefined, new Set(), 'web');
    expect(updated.some((f) => f.code === 'responsive' || f.code === 'navbar')).toBe(false);
  });
  it('retries one empty stop reviewer response before passing', async () => {
    const s = useProject.getState().doc.screens[0];
    s.root.children[0].props.text = 'Whole leaf tea';
    s.root.children[1].props.subtitle = 'Fresh tea';
    vi.mocked(chatStream)
      .mockResolvedValueOnce(reply([], ''))
      .mockResolvedValueOnce(reply([], 'PASS'));
    await verifyGate('tea', useProject.getState().doc, ['tea']);
    expect(chatStream).toHaveBeenCalledTimes(2);
    expect(useAgent.getState().verification).toBe('pass');
  });
  it('warns about desktop-first base grid columns only on web and without grid overrides', () => {
    const s = useProject.getState().doc.screens[0];
    const grid = node('hero_grid', 'grid', { columns: 2 });
    grid.styles = { columns: 2 };
    s.root.children.push(grid);
    const find = (kind: 'web' | 'app') =>
      lintScreen(s, undefined, new Set(), kind).filter(
        (f) => f.nodeId === 'hero_grid' && f.message.includes('Desktop-first'),
      );
    expect(find('web')).toHaveLength(1);
    expect(find('app')).toHaveLength(0);
    grid.styles.responsive = { expanded: { columns: 2 } };
    expect(find('web')).toHaveLength(0);
  });
  it('blocks placeholder copy but only warns about an empty hero, and accepts clean content', () => {
    const screen = useProject.getState().doc.screens[0];
    expect(
      lintScreen(screen)
        .filter((f) => f.severity === 'block')
        .map((f) => f.code),
    ).toEqual(['scaffold']);
    expect(lintScreen(screen)).toContainEqual(
      expect.objectContaining({ nodeId: 'tea_hero', code: 'imagery', severity: 'warn' }),
    );
    screen.root.children[0].props.text = 'Whole leaf tea';
    screen.root.children[1].props.image = 'https://example.com/tea.png';
    expect(lintScreen(screen)).toEqual([]);
  });
  it('accepts gradient heroes with a subtitle or children, while empty image nodes warn', () => {
    const screen = emptyScreen('Tea', { id: 'tea' });
    const hero = node('hero_tea', 'hero', {
      title: 'Fresh leaves',
      subtitle: 'A better cup',
    });
    screen.root.children = [hero, node('empty_image', 'image', { src: '', alt: 'Tea' })];
    expect(lintScreen(screen)).toEqual([
      expect.objectContaining({ nodeId: 'empty_image', severity: 'warn', code: 'imagery' }),
    ]);
    hero.props.subtitle = '';
    hero.children.push(node('hero_btn', 'button', { text: 'Shop tea' }));
    expect(lintScreen(screen).some((finding) => finding.nodeId === 'hero_tea')).toBe(false);
  });
  it('lets the targeted repair illustrate only affected nodes using remaining budget', async () => {
    const screen = useProject.getState().doc.screens[0];
    screen.root.children.push(node('other_img', 'image', { src: '', alt: 'Other' }));
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply([
          {
            id: 'images',
            name: 'illustrate_images',
            arguments: JSON.stringify({
              targets: [{ id: 'tea_hero' }, { id: 'other_img' }, { id: 'tea_text' }],
            }),
          },
        ]),
      )
      .mockResolvedValueOnce(
        reply([
          {
            id: 'repair',
            name: 'edit_canvas',
            arguments: JSON.stringify({
              ops: [{ op: 'setText', id: 'tea_text', text: 'Whole leaf tea' }],
            }),
          },
        ]),
      )
      .mockResolvedValueOnce(
        reply([
          {
            id: 'done',
            name: 'finish',
            arguments: JSON.stringify({ summary: 'Repaired' }),
          },
        ]),
      )
      .mockResolvedValueOnce(reply([], 'PASS'));
    const budget = { remaining: 1 };
    await verifyGate('Tea landing', useProject.getState().doc, ['tea'], budget);
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(budget.remaining).toBe(0);
    expect(useProject.getState().doc.screens[0].root.children[1].props.image).toBe(
      'https://example.com/tea.png',
    );
    expect(useAgent.getState().verification).toBe('pass');
    expect(
      useProject.getState().doc.rail.some((entry) => entry.text.includes('budget cap')),
    ).toBe(true);
  });
  it('keeps empty image placeholders as warnings when no image budget remains', async () => {
    const screen = useProject.getState().doc.screens[0];
    screen.root.children[0].props.text = 'Whole leaf tea';
    screen.root.children.push(node('empty_image', 'image', { src: '', alt: 'Tea' }));
    vi.mocked(chatStream).mockResolvedValueOnce(reply([], 'PASS'));
    await verifyGate('Tea landing', useProject.getState().doc, ['tea'], { remaining: 0 });
    expect(generateImage).not.toHaveBeenCalled();
    expect(useAgent.getState().verification).toBe('pass');
    expect(useAgent.getState().reviewNotes).toContain('empty_image');
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
  it('repairs an oversized screen padding before reviewer approval', async () => {
    const doc = useProject.getState().doc;
    doc.screens[0].root.children[0].props.text = 'Whole leaf tea';
    doc.screens[0].root.children[1].props.subtitle = 'Fresh and fragrant';
    doc.screens[0].root.styles.padding = '390px';
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply([
          {
            id: 'repair',
            name: 'edit_canvas',
            arguments: JSON.stringify({
              ops: [
                {
                  op: 'setStyles',
                  id: doc.screens[0].root.id,
                  styles: { padding: '24px' },
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
            arguments: JSON.stringify({ summary: 'Repaired' }),
          },
        ]),
      )
      .mockResolvedValueOnce(reply([], 'PASS'));
    await verifyGate('Tea landing', doc, ['tea']);
    expect(useProject.getState().doc.screens[0].root.styles.padding).toBe('24px');
    expect(useAgent.getState().verification).toBe('pass');
    expect(
      useProject
        .getState()
        .doc.rail.some(
          (entry) => entry.text.includes('spacing') || entry.text.includes('96px'),
        ),
    ).toBe(true);
  });
  it('names the finish reason when the reviewer response is empty', async () => {
    const doc = useProject.getState().doc;
    doc.screens[0].root.children[0].props.text = 'Whole leaf tea';
    doc.screens[0].root.children[1].props.subtitle = 'Fresh and fragrant';
    vi.mocked(chatStream).mockResolvedValueOnce({
      ...reply([], ''),
      finishReason: 'length',
    });
    await verifyGate('Tea landing', doc, ['tea']);
    expect(useAgent.getState().verification).toBe('unverified');
    expect(useAgent.getState().reviewNotes).toContain(
      'empty response (finish_reason: length)',
    );
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
