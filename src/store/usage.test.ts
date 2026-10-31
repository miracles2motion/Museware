// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readUsage, useAgent } from './useAgent';

describe('lifetime usage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.removeItem('museware/usage');
    useAgent.setState({ receipts: [], sessionCents: 0, sessionRequests: 0, turns: 0 });
  });
  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    localStorage.removeItem('museware/usage');
  });
  it('restores receipts and totals after a reset', () => {
    useAgent.getState().startTurn();
    useAgent
      .getState()
      .addReceipt({
        role: 'builder',
        model: 'test',
        promptChars: 1,
        toolNames: [],
        latencyMs: 20,
        cents: 2,
      });
    vi.advanceTimersByTime(300);
    const saved = localStorage.getItem('museware/usage');
    useAgent.setState({ receipts: [], sessionCents: 0, sessionRequests: 0, turns: 0 });
    expect(saved).toBeTruthy();
    localStorage.setItem('museware/usage', saved!);
    useAgent.setState(readUsage());
    expect(useAgent.getState().receipts).toHaveLength(1);
    expect(useAgent.getState()).toMatchObject({
      sessionCents: 2,
      sessionRequests: 1,
      turns: 1,
    });
  });
  it('handles invalid stored data without failing boot', () => {
    localStorage.setItem('museware/usage', '{');
    expect(readUsage()).toEqual({
      receipts: [],
      sessionCents: 0,
      sessionRequests: 0,
      turns: 0,
    });
  });
});
