// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Landing } from './Landing';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});
afterEach(cleanup);
describe('landing doors', () => {
  it('creates and opens a new project if there are none, otherwise opens Projects', async () => {
    useUi.setState({ route: 'landing' });
    render(<Landing />);
    fireEvent.click(screen.getAllByRole('button', { name: /Start building/ })[0]);
    await waitFor(() => expect(useUi.getState().route).toBe('editor'));
    const id = useProject.getState().projectId;
    expect(id).toMatch(/^p_/);
    expect(window.location.hash).toBe(`#/app/${id}`);
    useUi.getState().setRoute('landing');
    fireEvent.click(screen.getAllByRole('button', { name: /Start building/ })[0]);
    await waitFor(() => expect(useUi.getState().route).toBe('projects'));
    expect(window.location.hash).toBe('#/projects');
    expect(screen.getByRole('link', { name: 'Your projects' })).toBeTruthy();
  });
});
