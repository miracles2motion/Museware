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
  it('never claims an unwired form was submitted', () => {
    const runtime = setup(n('form_a', 'form', { submitLabel: 'Reserve' }));
    fireEvent.submit(screen.getByRole('button', { name: 'Reserve' }).closest('form')!);
    expect(runtime.toast).toHaveBeenCalledWith('This form has no submit action yet.');
    expect(runtime.toast).not.toHaveBeenCalledWith('Submitted');
  });
  it('runs configured form actions without adding a misleading success', () => {
    const form = n('form_a', 'form', { submitLabel: 'Send' });
    form.events = { submit: [{ type: 'toast', text: 'Your draft is ready' }] };
    const runtime = setup(form);
    fireEvent.submit(screen.getByRole('button', { name: 'Send' }).closest('form')!);
    expect(runtime.toast).toHaveBeenCalledWith('Your draft is ready');
    expect(runtime.toast).not.toHaveBeenCalledWith('Submitted');
  });
  it('opens the compact navbar menu and navigates from a menu link', () => {
    const runtime = setup(n('nav_a', 'navbar', { brand: 'Tea', items: ['Home'] }));
    const summary = screen.getByLabelText('Toggle navigation menu');
    const details = summary.closest('details')!;
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    fireEvent.click(details.querySelector('button')!);
    expect(runtime.navigate).toHaveBeenCalledWith('home');
  });
  it('smoothly scrolls to an in-page section when navbar item is clicked on a single-page site', () => {
    const screenDoc = emptyScreen('Landing', { id: 'landing_root', entry: true });
    const sectionCoffees = n('section_coffees', 'section', { title: 'Three coffees' });
    const nav = n('nav_main', 'navbar', { brand: 'Ember', items: ['Coffees'] });
    screenDoc.root.children = [nav, sectionCoffees];
    const doc = { ...createProject(), screens: [screenDoc] };
    const runtime: RuntimeApi = {
      screenId: 'landing_root',
      state: {},
      screens: [screenDoc],
      setKey: vi.fn(),
      toast: vi.fn(),
      navigate: vi.fn(),
      openUrl: vi.fn(),
    };
    const { container } = render(<NodeView doc={doc} screen={screenDoc} mode="run" runtime={runtime} />);
    const sectionEl = container.querySelector('#section_coffees') as HTMLElement;
    sectionEl.scrollIntoView = vi.fn();

    const navButton = screen.getAllByRole('button', { name: 'Coffees' })[0];
    fireEvent.click(navButton);

    expect(sectionEl.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(runtime.navigate).not.toHaveBeenCalled();
  });
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

describe('PR-A live components', () => {
  it('renders native accordion details and toggles without a state key', () => {
    const runtime = setup(
      n('faq_a', 'accordion', { items: 'Why tea? | It is delicious.\nHow? | Steep it.' }),
    );
    const summary = screen.getByText('Why tea?');
    const details = summary.closest('details');
    expect(details?.open).toBe(false);
    fireEvent.click(summary);
    expect(details?.open).toBe(true);
    expect(runtime.setKey).not.toHaveBeenCalled();
  });
  it('renders an editorial header and two marquee groups', () => {
    setup(
      n(
        'section_a',
        'section',
        {
          eyebrow: 'Handmade',
          title: 'Tea time',
          subtitle: 'Our selection',
          surface: 'glow',
          align: 'center',
        },
        [n('mq_a', 'marquee', { items: 'One,Two,Three,Four', variant: 'pills' })],
      ),
    );
    expect(screen.getByText('Handmade')).toBeTruthy();
    expect(screen.getByText('Tea time')).toBeTruthy();
    expect(document.querySelectorAll('.mw-marquee-group')).toHaveLength(2);
    expect(document.querySelector('.mw-section')?.getAttribute('data-surface')).toBe(
      'glow',
    );
  });
});
