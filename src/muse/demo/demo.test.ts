// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useProject, createProject } from '../../store/useProject';
import { useAgent } from '../../store/useAgent';
import { useUi } from '../../store/useUi';
import { runAgentTurn } from '../loop';
import { answerBlueprint } from '../cards';

/**
 * The §8.8 trace, run against the local engine: one prompt → a blueprint card →
 * approve → screens land with an entry screen → the verify pass lands in the
 * rail. No network, no key, real ops.
 */
beforeEach(() => {
  useProject.getState().replaceDoc(createProject('Demo'));
  useAgent.setState({
    busy: false,
    stopping: false,
    liveText: '',
    liveLine: null,
    receipts: [],
    sessionCents: 0,
    sessionRequests: 0,
    progress: null,
    verification: 'idle',
    lastError: null,
  });
  useAgent.setState({ demoMode: true, configured: false });
  useUi.setState({ activeScreenId: null, selectedId: null, route: 'editor' });
});

describe('the local engine end to end', () => {
  it('turns one prompt into an approved blueprint and a built, verified app', async () => {
    await runAgentTurn('Design me a landing page website');

    const rail = useProject.getState().doc.rail;
    const blueprintCard = rail.find((entry) => entry.card?.kind === 'blueprint');
    expect(blueprintCard).toBeTruthy();
    expect(String(blueprintCard?.card?.data.blueprint || '').length).toBeGreaterThan(200);
    expect(useProject.getState().doc.blueprint?.text).toBeTruthy();

    // A blueprint is a proposal: nothing has been added to the canvas yet.
    expect(useProject.getState().doc.screens).toHaveLength(0);

    await answerBlueprint(blueprintCard!.id, 'build');

    const doc = useProject.getState().doc;
    expect(doc.screens.length).toBeGreaterThan(0);
    expect(doc.screens.filter((s) => s.entry)).toHaveLength(1);
    expect(doc.opLog.length).toBeGreaterThan(0);
    expect(doc.rail.some((entry) => /Verified|PASS/.test(entry.text))).toBe(true);
    expect(useAgent.getState().busy).toBe(false);

    // The canvas the user sees is the tree that was built.
    const built = doc.screens[0];
    const count = (node: { children: unknown[] }): number =>
      1 +
      node.children.reduce<number>(
        (n, child) => n + count(child as { children: unknown[] }),
        0,
      );
    expect(count(built.root)).toBeGreaterThan(12);
    expect(built.root.type).toBe('screen');
  }, 30000);

  it('asks for a direction instead of inventing a palette when the brief is open', async () => {
    await runAgentTurn('design a warm little bakery page');
    const rail = useProject.getState().doc.rail;
    const choice = rail.find((entry) => entry.card?.kind === 'choice');
    expect(choice).toBeTruthy();
    const options = (choice?.card?.data.options || []) as Array<{ label: string }>;
    expect(options.length).toBeGreaterThanOrEqual(3);
    expect(useProject.getState().doc.screens).toHaveLength(0);
  });
});
