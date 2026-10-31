// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Inspector } from './Inspector';
import { emptyScreen } from '../ops/screenOps';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { useAgent } from '../store/useAgent';
import { illustrate } from '../muse/cards';

vi.mock('../muse/cards', async (original) => ({
  ...(await original<typeof import('../muse/cards')>()),
  illustrate: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe('image actions', () => {
  it('disables both actions and shows a spinner while generating; explains budgets', async () => {
    const s = emptyScreen('Tea', { id: 'tea', entry: true });
    s.root.children = [
      { id: 'tea_image', type: 'image', props: { src: '' }, styles: {}, children: [] },
    ];
    useProject.getState().replaceDoc({ ...createProject(), screens: [s] });
    useUi.setState({
      activeScreenId: 'tea',
      selectedId: 'tea_image',
      propertiesOpen: true,
      inspectorCollapsed: false,
    });
    const epoch = useProject.getState().documentEpoch;
    useAgent.setState({
      buildImageUsage: { used: 3, cap: 3, documentEpoch: epoch },
      keySource: 'env',
      houseKey: 'exhausted',
    });
    let resolve!: () => void;
    vi.mocked(illustrate).mockReturnValue(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    const { container } = render(<Inspector />);
    expect(screen.getByText(/Automated build image budget exhausted/)).toBeTruthy();
    expect(screen.getByText(/Shared-key budget exhausted/)).toBeTruthy();
    const button = screen.getByRole('button', {
      name: /Illustrate with muse-image/,
    }) as HTMLButtonElement;
    const regenerate = screen.getByRole('button', {
      name: /Regenerate image/,
    }) as HTMLButtonElement;
    fireEvent.click(button);
    expect(button.disabled && regenerate.disabled).toBe(true);
    expect(container.querySelector('.image-spinner')).toBeTruthy();
    expect(screen.getByText(/Generating image/)).toBeTruthy();
    fireEvent.click(regenerate);
    expect(illustrate).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    expect(button.disabled || regenerate.disabled).toBe(false);
  });
});
