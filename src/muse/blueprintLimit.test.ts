import { beforeEach, describe, expect, it } from 'vitest';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { answerBlueprint } from './cards';

beforeEach(() => {
  useProject.getState().replaceDoc(createProject());
  useAgent.setState({ demoMode: true, busy: false });
});
describe('blueprint adjustment cap', () => {
  it('keeps the blueprint available when the local engine cannot adjust', async () => {
    const entry = useProject
      .getState()
      .addRail({
        role: 'card',
        text: 'Plan',
        card: { kind: 'blueprint', state: 'pending', data: { blueprint: 'plan' } },
      });
    await answerBlueprint(entry.id, 'adjust', 'Change the heading');
    expect(useProject.getState().doc.rail.find((r) => r.id === entry.id)?.card?.state).toBe(
      'pending',
    );
  });
  it('refuses a fourth adjustment and keeps the card pending', async () => {
    const entry = useProject
      .getState()
      .addRail({
        role: 'card',
        text: 'Plan',
        card: {
          kind: 'blueprint',
          state: 'pending',
          data: { blueprint: 'plan', adjustCount: 3 },
        },
      });
    await answerBlueprint(entry.id, 'adjust', 'One more');
    const card = useProject.getState().doc.rail.find((r) => r.id === entry.id)?.card;
    expect(card?.state).toBe('pending');
    expect(card?.data.adjustCount).toBe(3);
  });
});
