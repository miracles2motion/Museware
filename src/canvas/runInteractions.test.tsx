// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NodeView } from './NodeView';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import type { ComponentNode } from '../types/tree';
import type { RuntimeApi } from '../preview/runtime';
const n = (
  id: string,
  type: ComponentNode['type'],
  props: Record<string, unknown> = {},
  children: ComponentNode[] = [],
): ComponentNode => ({ id, type, props, styles: {}, children });
afterEach(cleanup);
function setup(child: ComponentNode) {
  const screenDoc = emptyScreen('Home', { id: 'home', entry: true });
  screenDoc.root.children = [child];
  const doc = { ...createProject(), screens: [screenDoc] };
  const runtime: RuntimeApi = {
    screenId: 'home',
    state: {},
    screens: [screenDoc],
    setKey: vi.fn(),
    toast: vi.fn(),
    navigate: vi.fn(),
    openUrl: vi.fn(),
  };
  render(<NodeView doc={doc} screen={screenDoc} mode="run" runtime={runtime} />);
  return runtime;
}
describe('run interactions', () => {
  it('fires textarea change on blur', () => {
    const child = n('input_a', 'textarea', { bindKey: 'note', placeholder: 'Notes' });
    child.events = { change: [{ type: 'toast', text: 'changed' }] };
    const runtime = setup(child);
    fireEvent.blur(screen.getByPlaceholderText('Notes'));
    expect(runtime.toast).toHaveBeenCalledWith('changed');
  });
  it('clicks a switch by its label without firing its parent', () => {
    const toggle = n('switch_a', 'switch', { bindKey: 'enabled', label: 'Enable feature' });
    toggle.events = { change: [{ type: 'toast', text: 'changed' }] };
    const card = n('card_a', 'card', {}, [toggle]);
    card.events = { tap: [{ type: 'toast', text: 'parent' }] };
    const runtime = setup(card);
    fireEvent.click(screen.getByText('Enable feature'));
    expect(runtime.setKey).toHaveBeenCalledWith('enabled', true);
    expect(runtime.toast).toHaveBeenCalledWith('changed');
    expect(runtime.toast).not.toHaveBeenCalledWith('parent');
  });
});
