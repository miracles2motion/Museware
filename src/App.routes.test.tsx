// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createProject, useProject } from './store/useProject';
import { useUi } from './store/useUi';

const mocks = vi.hoisted(() => ({
  migrate: vi.fn(),
  active: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
}));
vi.mock('./persist/save', () => ({
  migrateCurrent: mocks.migrate,
  getActiveProjectId: mocks.active,
  openProject: mocks.open,
  saveProjectSoon: mocks.save,
}));
vi.mock('./shell/Editor', () => ({ Editor: () => <div data-testid="editor">Editor</div> }));
vi.mock('./shell/Home', () => ({ Home: () => <div data-testid="projects">Projects</div> }));
vi.mock('./shell/Landing', () => ({
  Landing: () => <div data-testid="landing">Landing</div>,
}));
vi.mock('./shell/Gallery', () => ({ Gallery: () => <div>Gallery</div> }));
vi.mock('./shell/Modals', () => ({ Modals: () => null }));
vi.mock('./preview/RunMode', () => ({ RunMode: () => null }));
vi.mock('./components/ui', () => ({ Toasts: () => null }));
vi.mock('./muse/client', () => ({ fetchStatus: () => new Promise(() => {}) }));
vi.mock('./muse/loop', () => ({ offerKey: vi.fn() }));
import App, { routeFromHash } from './App';

beforeEach(() => {
  mocks.migrate.mockReset().mockResolvedValue(undefined);
  mocks.active.mockReset().mockResolvedValue(null);
  mocks.open.mockReset();
  mocks.save.mockReset();
  useProject.setState({ ready: false, projectId: null });
  useUi.setState({ route: 'landing', runMode: false });
  localStorage.setItem('museware/onboarded', '1');
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});
describe('boot and project routes', () => {
  it('maps the front door and explicit IDs without treating unknown paths as projects', () => {
    expect(routeFromHash('#/')).toEqual({ route: 'landing', projectId: null });
    expect(routeFromHash('#/projects')).toEqual({ route: 'projects', projectId: null });
    expect(routeFromHash('#/app/p_abc')).toEqual({ route: 'editor', projectId: 'p_abc' });
    expect(routeFromHash('#/unknown')).toEqual({ route: 'landing', projectId: null });
  });
  it('shows only the splash while loading, then opens exactly the URL project without a projects flash', async () => {
    let resolve!: () => void;
    mocks.migrate.mockReturnValue(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    mocks.open.mockResolvedValue(createProject('URL project'));
    window.history.replaceState(null, '', '/#/app/p_target');
    render(<App />);
    expect(screen.getByRole('status', { name: 'Loading Museware' })).toBeTruthy();
    expect(screen.queryByTestId('landing')).toBeNull();
    expect(screen.queryByTestId('projects')).toBeNull();
    expect(screen.queryByTestId('editor')).toBeNull();
    await act(async () => resolve());
    await waitFor(() => expect(screen.getByTestId('editor')).toBeTruthy());
    expect(screen.queryByTestId('projects')).toBeNull();
    expect(mocks.open).toHaveBeenCalledWith('p_target');
    expect(useProject.getState()).toMatchObject({
      projectId: 'p_target',
      doc: { name: 'URL project' },
    });
    expect(window.location.hash).toBe('#/app/p_target');
  });
  it('opens landing with no hash even when an active project exists', async () => {
    mocks.active.mockResolvedValue('p_old');
    window.history.replaceState(null, '', '/');
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('landing')).toBeTruthy());
    expect(mocks.open).not.toHaveBeenCalled();
    expect(screen.queryByTestId('projects')).toBeNull();
  });
  it('resolves app to active and changes projects on hashchange without rerunning boot', async () => {
    mocks.active.mockResolvedValue('p_one');
    mocks.open.mockImplementation(async (id) => createProject(id));
    window.history.replaceState(null, '', '/#/app');
    render(<App />);
    await waitFor(() => expect(useProject.getState().projectId).toBe('p_one'));
    expect(window.location.hash).toBe('#/app/p_one');
    await act(async () => {
      window.history.replaceState(null, '', '/#/app/p_two');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(useProject.getState().projectId).toBe('p_two'));
    expect(useProject.getState().doc.name).toBe('p_two');
    expect(mocks.migrate).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls.at(-1)?.[0]).toBe('p_two');
    useUi.setState({ route: 'projects' });
    await act(async () => {
      window.history.replaceState(null, '', '/#/app/p_two');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(useUi.getState().route).toBe('editor'));
    expect(mocks.open.mock.calls.filter((call) => call[0] === 'p_two')).toHaveLength(2);
  });
});
