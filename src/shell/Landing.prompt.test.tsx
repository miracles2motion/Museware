// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Landing } from './Landing';
import { useProject, createProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { useAgent } from '../store/useAgent';
import { listProjects, deleteSavedProject, createSavedProject } from '../persist/save';
import { runAgentTurn } from '../muse/loop';
vi.mock('../muse/loop', () => ({ runAgentTurn: vi.fn(async () => {}) }));
beforeEach(async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  for (const project of await listProjects()) await deleteSavedProject(project.id);
  useProject.getState().hydrate(createProject());
  useUi.setState({ route: 'landing', draft: '' });
  useAgent.setState({ busy: false, statusError: 'status resolved', demoMode: true });
  vi.mocked(runAgentTurn).mockClear();
});
afterEach(cleanup);
it('creates a new project and sends the hero prompt even when another project exists', async () => {
  await createSavedProject(createProject('Existing'));
  render(<Landing />);
  const button = screen.getByRole('button', {
    name: /Make a project/,
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Describe your idea'), {
    target: { value: ' A tea shop ' },
  });
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
  expect(await listProjects()).toHaveLength(2);
});
