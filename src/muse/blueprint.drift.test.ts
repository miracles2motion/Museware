import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MUSEWARE_DEFAULT_THEME } from '../design/starter';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { parseBlueprint, blueprintScreenSections } from './blueprintParse';
import { answerBlueprint } from './cards';
import { chatStream, type ChatResult } from './client';
import { decisionLedger, presentBlueprint, runFillQueue } from './loop';

vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
  chatStream: vi.fn(),
}));
const result = (text: string, finish = false): ChatResult => ({
  text,
  toolCalls: finish
    ? [{ id: 'finish', name: 'finish', arguments: '{"summary":"Done."}' }]
    : [],
  finishReason: finish ? 'tool_calls' : 'stop',
  model: 'test',
  latencyMs: 1,
  usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 },
});
const parse = (text: string) => parseBlueprint(text, MUSEWARE_DEFAULT_THEME);
beforeEach(() => {
  vi.mocked(chatStream).mockReset();
  vi.mocked(chatStream).mockImplementation(async (opts) =>
    opts.tools ? result('', true) : result('PASS'),
  );
  useProject.getState().replaceDoc(createProject('Tea Landing'));
  useAgent.setState({
    demoMode: false,
    models: null,
    wonder: false,
    contributorMode: false,
    receipts: [],
    verification: 'idle',
    buildImages: 3,
  });
});
describe('blueprint header drift', () => {
  it('accepts the canonical colon-before-name form', () =>
    expect(parse('SCREEN: Home\n- title_a (heading) Welcome').screens[0].name).toBe(
      'Home',
    ));
  it('removes generated ids and single-scrolling descriptions from screen names', () => {
    expect(
      parse('SCREEN: Landing (id: landing) - single scrolling\n- hero (hero)').screens[0]
        .name,
    ).toBe('Landing');
    expect(
      parse('SCREEN: Tea Landing (id: landing) - single scrolling page').screens[0].name,
    ).toBe('Tea Landing');
  });
  it('accepts numbered, colon-after-name headers', () =>
    expect(
      parse('SCREEN 1 - landing (entry):\n- title_a (heading) Tea').screens[0].name,
    ).toBe('landing (entry)'));
  it('accepts markdown headings and varied separators', () =>
    expect(parse('## SCREEN 2 — Products:\n- title_a (heading) Tea').screens[0].name).toBe(
      'Products',
    ));
  it('does not mistake SCREENS or SCREENSHOT headings for screens', () =>
    expect(
      parse('SCREENS TO BUILD:\nSCREENSHOT area:\nSCREEN WITHOUT COLON').screens,
    ).toHaveLength(0));
  it('keeps each drifted section available to the correct screen', () => {
    const plan =
      'SCREEN 1 - Home:\n- first_one (text) First\nSCREEN 2 - Shop:\n- second_one (text) Second';
    expect(blueprintScreenSections(plan)).toEqual([
      'SCREEN 1 - Home:\n- first_one (text) First',
      'SCREEN 2 - Shop:\n- second_one (text) Second',
    ]);
    expect(parse(plan).screens.map((s) => s.name)).toEqual(['Home', 'Shop']);
  });
  it('keeps long and duplicate generated root ids valid and unique', () => {
    const name = 'A very long and descriptive screen heading';
    const screens = parse(`SCREEN: ${name}\nSCREEN: ${name}`).screens;
    expect(new Set(screens.map((s) => s.root.id)).size).toBe(2);
    expect(screens.every((s) => /^[a-z][a-z0-9_]{2,30}$/.test(s.root.id))).toBe(true);
  });
  it('creates a fallback screen and supplies the whole plan to its builder', async () => {
    const plan = 'A modern tea shop landing with product cards and warm colors';
    useProject.getState().setBlueprint(plan, true);
    await runFillQueue({ mode: 'steady' });
    expect(useProject.getState().doc.screens.map((s) => s.id)).toEqual(['screen_plan']);
    expect(
      useProject
        .getState()
        .doc.rail.some((r) => r.text.includes('building it as ONE screen')),
    ).toBe(true);
    const requests = vi.mocked(chatStream).mock.calls;
    expect(
      requests.some(([opts]) => opts.messages.some((m) => m.content.includes(plan))),
    ).toBe(true);
  });
  it('logs one approval and records approved build state', async () => {
    presentBlueprint('SCREEN: Tea\n- head_tea (heading) Good tea');
    const card = useProject.getState().doc.rail.find((r) => r.card?.kind === 'blueprint')!;
    await answerBlueprint(card.id, 'build');
    const doc = useProject.getState().doc;
    expect(doc.rail.filter((r) => r.text === '✓ Blueprint approved')).toHaveLength(1);
    expect(doc.blueprint?.decided).toBe(true);
    expect(decisionLedger(doc)).toContain('blueprint APPROVED');
    expect(decisionLedger(doc)).toContain('screens in doc: 1');
  });
  it('does not review a screen removed during its build', async () => {
    useProject.getState().setBlueprint('SCREEN: Tea\n- head_tea (heading) Good tea', true);
    vi.mocked(chatStream).mockImplementationOnce(async () => {
      useProject.setState((state) => ({ doc: { ...state.doc, screens: [] } }));
      return result('', true);
    });
    await runFillQueue({ mode: 'steady' });
    expect(useAgent.getState().verification).toBe('problems');
    expect(
      useProject.getState().doc.rail.some((r) => r.text.includes('no screens completed')),
    ).toBe(true);
    expect(vi.mocked(chatStream)).toHaveBeenCalledTimes(1);
  });
});
