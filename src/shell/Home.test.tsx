// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Home, previewScale, relativeUpdated } from './Home';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { useAgent } from '../store/useAgent';
import { emptyScreen } from '../ops/screenOps';
import { createSavedProject, deleteSavedProject, listProjects } from '../persist/save';
import { runAgentTurn } from '../muse/loop';
vi.mock('../muse/loop', () => ({ runAgentTurn: vi.fn(async () => {}) }));
beforeEach(async () => {
  for (const project of await listProjects()) await deleteSavedProject(project.id);
  useProject.getState().hydrate(createProject());
  useUi.setState({ route: 'projects', draft: '' });
  useAgent.setState({ busy: false, statusError: 'status resolved', demoMode: true });
  vi.mocked(runAgentTurn).mockClear();
});
afterEach(cleanup);
describe('project home', () => {
  it('searches and sorts projects and renders one preview per card', async () => {
    const page = emptyScreen('Tea', { id: 'tea', entry: true });
    await createSavedProject({ ...createProject('Zulu'), screens: [page], kind: 'web' });
    await createSavedProject({ ...createProject('Alpha'), screens: [page], kind: 'app' });
    render(<Home />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy());
    expect(document.querySelectorAll('.project-grid iframe')).toHaveLength(2);
    expect(screen.getByTitle('Preview of Alpha')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Sort projects'), { target: { value: 'name' } });
    const cards = document.querySelectorAll('.projects-card');
    expect(within(cards[0] as HTMLElement).getByText('Alpha')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search projects'), {
      target: { value: 'zul' },
    });
    expect(screen.getByText('Zulu')).toBeTruthy();
    expect(screen.queryByText('Alpha')).toBeNull();
    expect(relativeUpdated(Date.now() - 7200000)).toBe('Updated 2h ago');
    expect(previewScale(390)).toBe(1);
    expect(previewScale(312)).toBe(0.8);
    expect(previewScale(585)).toBe(1.5);
  });
  it('puts the empty prompt before starters and submits one first message', async () => {
    render(<Home />);
    const heading = await screen.findByText(
      'Describe your first project — muse does the rest',
    );
    expect(
      heading.compareDocumentPosition(screen.getByText('Tea landing')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const button = screen.getByRole('button', {
      name: 'Make a project →',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Describe your idea'), {
      target: { value: '  A tea shop  ' },
    });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(runAgentTurn).toHaveBeenCalledWith('A tea shop'));
    expect(runAgentTurn).toHaveBeenCalledTimes(1);
    expect(useUi.getState().route).toBe('editor');
    expect(window.location.hash).toBe(`#/app/${useProject.getState().projectId}`);
    expect(useUi.getState().draft).toBe('');
    expect(
      useProject
        .getState()
        .doc.rail.filter((entry) => entry.role === 'user')
        .map((entry) => entry.text),
    ).toEqual(['A tea shop']);
    expect(await listProjects()).toHaveLength(1);
  });
  it('waits for boot status before starting the agent', async () => {
    useAgent.setState({
      statusError: null,
      configured: false,
      models: null,
      houseKey: 'absent',
    });
    render(<Home />);
    await screen.findByText('Describe your first project — muse does the rest');
    fireEvent.change(screen.getByLabelText('Describe your idea'), {
      target: { value: 'Tea' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Make a project →' }));
    expect(runAgentTurn).not.toHaveBeenCalled();
    useAgent.setState({ statusError: 'offline', demoMode: true });
    await waitFor(() => expect(runAgentTurn).toHaveBeenCalledWith('Tea'));
  });
});
