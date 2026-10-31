// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RailCard } from './RailCard';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { emptyScreen } from '../ops/screenOps';
import type { RailEntry } from '../types/tree';
afterEach(cleanup);
describe('finished progress cards', () => {
  it('shows asset counts and failure reasons in the progress card', () => {
    const entry: RailEntry = {
      id: 'progress_assets',
      at: Date.now(),
      role: 'card',
      text: '',
      card: {
        kind: 'progress',
        state: 'answered',
        data: {
          title: 'Screens built',
          parts: [],
          assets: [
            { nodeId: 'hero_img', state: 'done' },
            { nodeId: 'tea_img', state: 'failed', reason: 'timeout' },
            { nodeId: 'story_img', state: 'queued' },
          ],
        },
      },
    };
    render(<RailCard entry={entry} />);
    expect(screen.getByText(/Generating assets/).textContent).toContain('2 of 3');
    expect(screen.getByText(/tea_img: failed/).textContent).toContain('timeout');
  });
  it('stays visible and offers safe screen undo after a build', () => {
    useProject.getState().replaceDoc(createProject());
    const built = emptyScreen('Home', { id: 'home', entry: true });
    useProject
      .getState()
      .applyBatch([{ op: 'addScreen', screen: built }], { source: 'agent' });
    useProject.getState().rememberScreenBuild('progress_1', 'home', null);
    useAgent.setState({ busy: false, progress: null });
    const entry: RailEntry = {
      id: 'progress_1',
      at: Date.now(),
      role: 'card',
      text: 'Built',
      card: {
        kind: 'progress',
        state: 'answered',
        data: {
          title: 'Screens built',
          parts: [{ id: 'home', label: 'Home', state: 'done' }],
        },
      },
    };
    render(<RailCard entry={entry} />);
    fireEvent.click(screen.getByRole('button', { name: /home/i }));
    fireEvent.click(screen.getByRole('button', { name: /undo this screen/i }));
    expect(useProject.getState().doc.screens).toHaveLength(0);
  });
});
