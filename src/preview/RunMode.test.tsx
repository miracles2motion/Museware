// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RunMode, initialRunDevice } from './RunMode';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { emptyScreen } from '../ops/screenOps';

beforeEach(() => {
  localStorage.removeItem('museware/runDevice');
  useUi.setState({ runScreenId: null, activeScreenId: null });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function setup(kind: 'web' | 'app', locked = false) {
  const page = emptyScreen('Home', { id: 'home', entry: true });
  page.root.props.scroll = !locked;
  useProject.getState().replaceDoc({ ...createProject(), kind, screens: [page] });
  return render(<RunMode />);
}
describe('run device presentation', () => {
  it('defaults by kind and remembers an explicit choice', () => {
    expect(initialRunDevice('web')).toBe(1280);
    expect(initialRunDevice('app')).toBe(390);
    setup('web');
    expect(
      screen.getByRole('button', { name: 'Desktop 1280' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect((document.querySelector('.run-frame') as HTMLElement).style.width).toBe(
      '1280px',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tablet 768' }));
    expect((document.querySelector('.run-frame') as HTMLElement).style.width).toBe('768px');
    expect(localStorage.getItem('museware/runDevice')).toBe('768');
    cleanup();
    setup('app');
    expect(
      screen.getByRole('button', { name: 'Tablet 768' }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Mobile 390' }));
    expect((document.querySelector('.run-frame') as HTMLElement).style.width).toBe('390px');
  });
  it('scales a desktop frame to the available stage width while retaining its 1280 layout width', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640);
    setup('web');
    const device = document.querySelector('.run-device') as HTMLElement;
    expect(device.style.width).toBe('1280px');
    expect(device.style.transform).toBe('scale(0.5)');
    expect(device.style.height).toBe('200%');
    expect(screen.getByText('1280 · 50%')).toBeTruthy();
  });
  it('preserves the legacy fit layout for locked screens', () => {
    setup('app', true);
    expect(document.querySelector('.run-stage')?.getAttribute('data-scroll')).toBe('false');
    expect(document.querySelector('.run-locked-layout .run-frame')).toBeTruthy();
    expect(document.querySelector('.run-device')).toBeNull();
  });
});
