// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RailCard } from './RailCard';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { emptyScreen } from '../ops/screenOps';
import { parseProjectDoc } from '../persist/schema';

afterEach(() => {
  cleanup();
  useAgent.setState({ busy: false, progress: null });
});
describe('thinking card', () => {
  it('collects the transcript, expands, auto-collapses on completion and persists', () => {
    useProject.getState().replaceDoc(createProject());
    act(() => {
      useAgent.getState().startTurn();
      useAgent.getState().setLive('stacking the hero');
      useProject.getState().addRail({ role: 'system', text: 'Still working…' });
    });
    const entry = useProject.getState().doc.rail.find((r) => r.card?.kind === 'thinking')!;
    function View() {
      const current = useProject((s) => s.doc.rail.find((r) => r.id === entry.id)!);
      return <RailCard entry={current} />;
    }
    render(<View />);
    const toggle = screen.getByRole('button', { name: /Thinking/ });
    expect(toggle.textContent).toContain('stacking the hero');
    fireEvent.click(toggle);
    expect(screen.getByText('Still working…')).toBeTruthy();
    act(() => {
      useProject
        .getState()
        .applyBatch(
          [{ op: 'addScreen', screen: emptyScreen('Home', { id: 'home', entry: true }) }],
          { source: 'agent' },
        );
      useAgent.getState().endTurn();
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('built 1 screen');
    fireEvent.click(toggle);
    const saved = parseProjectDoc(JSON.parse(JSON.stringify(useProject.getState().doc)));
    expect(saved.rail.find((r) => r.id === entry.id)?.card?.data.expanded).toBe(true);
  });
});
