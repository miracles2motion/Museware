// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AgentRail } from './AgentRail';
import { useAgent } from '../store/useAgent';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
beforeEach(() => {
  useProject.getState().replaceDoc(createProject());
  useUi.setState({ railCollapsed: false, mobileRailOpen: false });
  useAgent.setState({ wonder: false, receipts: [], busy: false, screenshotPreview: null });
});
afterEach(cleanup);
describe('judge rail', () => {
  it('defaults Wonder off and persists a deliberate opt-in', () => {
    render(<AgentRail />);
    const button = screen.getByRole('button', { name: /Wonder · off/ });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(useAgent.getState().wonder).toBe(true);
    expect(localStorage.getItem('museware/wonder')).toBe('1');
    expect(screen.getByRole('button', { name: /Wonder · 4x cost/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Wonder · 4x cost/ }));
  });
  it('shows a replay badge and filters actual receipts', () => {
    useProject
      .getState()
      .addRail({ role: 'agent', text: 'A response', reasoningReplayed: true });
    useAgent.getState().addReceipt({
      model: 'muse-sam-3',
      role: 'sam',
      promptChars: 0,
      toolNames: [],
      latencyMs: 13,
    });
    render(<AgentRail />);
    expect(screen.getByLabelText('Reasoning replayed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^SAM/ }));
    expect(screen.getByLabelText('SAM calls').textContent).toContain('muse-sam-3');
    expect(screen.queryByText('A response')).toBeNull();
  });
});
