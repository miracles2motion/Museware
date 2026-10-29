import { describe, expect, it } from 'vitest';
import { isVisible, matchesValue, runActions, type RuntimeApi } from './runtime';

describe('state comparisons', () => {
  it('handles boolean values and initial unset state', () => {
    expect(matchesValue(true, 'true')).toBe(true);
    expect(matchesValue(undefined, 'false')).toBe(true);
    expect(isVisible({ visibleWhen: { key: 'on', equals: false } }, {})).toBe(true);
    expect(isVisible({ visibleWhen: { key: 'on', equals: false } }, { on: true })).toBe(
      false,
    );
  });
  it('compares numeric values without treating blank or undefined as zero', () => {
    expect(matchesValue(50, '50')).toBe(true);
    expect(matchesValue(undefined, 0)).toBe(false);
    expect(matchesValue('', 0)).toBe(false);
  });
  it('uses the same comparison for conditional actions', () => {
    const messages: string[] = [];
    const api: RuntimeApi = {
      screenId: 'home',
      state: {},
      screens: [],
      setKey: () => {},
      toast: (s) => messages.push(s),
      navigate: () => {},
      openUrl: () => {},
    };
    runActions(
      [{ type: 'when', key: 'on', equals: false, then: [{ type: 'toast', text: 'off' }] }],
      api,
    );
    expect(messages).toEqual(['off']);
  });
});
