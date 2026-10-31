// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Home, relativeUpdated } from './Home';
import { createProject, useProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { createSavedProject } from '../persist/save';
afterEach(cleanup);
describe('project home', () => {
  it('searches and sorts projects and offers a real first-screen preview', async () => {
    const page = emptyScreen('Tea', { id: 'tea', entry: true });
    await createSavedProject({ ...createProject('Zulu'), screens: [page], kind: 'web' });
    await createSavedProject({ ...createProject('Alpha'), screens: [page], kind: 'app' });
    useProject.getState().hydrate(createProject());
    render(<Home />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy());
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
  });
});
