// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Topbar } from './Topbar';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { emptyScreen } from '../ops/screenOps';

beforeEach(() => {
  useProject
    .getState()
    .replaceDoc({
      ...createProject(),
      screens: [emptyScreen('Screen 1', { id: 'screen_1', entry: true })],
    });
  useUi.setState({ activeScreenId: 'screen_1', selectedId: null });
});
afterEach(cleanup);
describe('screen switcher actions', () => {
  it('opens the screen actions outside the scrolling tabs', () => {
    render(<Topbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Screen actions' }));
    const menu = screen.getByRole('menu');
    expect(menu.querySelector('button')?.textContent).toContain('Add screen');
    expect(menu.closest('.screen-tabs')).toBeNull();
    expect(menu.closest('.screen-switcher')).not.toBeNull();
    expect(screen.getByText('Duplicate current')).toBeTruthy();
    expect(screen.getByText('Delete current')).toBeTruthy();
  });
});
