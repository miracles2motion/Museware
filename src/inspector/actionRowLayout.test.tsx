// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ActionEditor } from './ActionEditor';
import { useProject, createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';

afterEach(cleanup);
describe('set value editor', () => {
  it('places state key chips above the two inputs', () => {
    const page = emptyScreen('Tea', { id: 'tea' });
    page.root.children = ['alpha', 'beta', 'gamma', 'delta'].map((key) => ({
      id: `input_${key}`,
      type: 'input',
      props: { bindKey: key },
      styles: {},
      children: [],
    }));
    useProject.getState().replaceDoc({ ...createProject(), screens: [page] });
    render(
      <ActionEditor
        actions={[{ type: 'setState', key: 'alpha', value: 'yes' }]}
        screens={[page]}
        onChange={vi.fn()}
      />,
    );
    const row = screen.getByLabelText('State key').closest('.set-state-inputs');
    expect(row).not.toBeNull();
    expect(row?.contains(screen.getByLabelText('State value'))).toBe(true);
    expect(row?.contains(screen.getByRole('button', { name: 'alpha' }))).toBe(false);
    expect(
      row?.parentElement?.contains(screen.getByRole('button', { name: 'alpha' })),
    ).toBe(true);
  });
});
