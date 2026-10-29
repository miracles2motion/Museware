// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Canvas } from './Canvas';
import { Palette } from '../palette/Palette';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { useDrag } from './drag';
import type { ComponentNode, ProjectDoc, ScreenDoc } from '../types/tree';

/**
 * "Drag and drop does nothing" was true for the most ordinary gesture there
 * is: pick up a block, drop it in the middle of the screen. The old resolver
 * only understood nodes, so a release over the artboard's padding — the
 * biggest target on the canvas — returned null and the drag was thrown away
 * without a word.
 *
 * jsdom has no layout, so geometry is stubbed. What is pinned here is the
 * decision: which node a drop belongs to, and what op it produces.
 */

function node(
  id: string,
  type: ComponentNode['type'],
  children: ComponentNode[] = [],
): ComponentNode {
  return { id, type, props: {}, styles: {}, children };
}

function docWith(): ProjectDoc {
  const screen: ScreenDoc = {
    id: 'screen_1',
    name: 'Screen 1',
    entry: true,
    root: node('screen_1_root', 'screen', [
      node('col_main', 'col', [node('card_hero', 'card', [node('txt_title', 'heading')])]),
    ]),
  };
  return { ...useProject.getState().doc, screens: [screen], opLog: [], rail: [] };
}

function rect(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 200,
    width: 200,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

beforeEach(() => {
  if (!globalThis.ResizeObserver) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  useProject.getState().replaceDoc(docWith());
  useUi.setState({
    activeScreenId: 'screen_1',
    selectedId: null,
    route: 'editor',
    breakpoint: 'compact',
    runMode: false,
    leftTab: 'insert',
    leftCollapsed: false,
    leftFlyout: false,
    toasts: [],
  });
  useDrag.getState().end();
});

afterEach(() => {
  cleanup();
  useDrag.getState().end();
});

function pointer(type: string, x: number, y: number): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  Object.defineProperty(event, 'isPrimary', { value: true });
  return event;
}

function paletteButton(label: string): HTMLElement {
  const found = Array.from(document.querySelectorAll('.palette-item')).find((el) =>
    (el.textContent || '').includes(label),
  );
  if (!found) throw new Error(`no palette block called ${label}`);
  return found as HTMLElement;
}

function dragTo(target: Element, y = 160) {
  const button = paletteButton('Heading');
  fireEvent(button, pointer('pointerdown', 300, 300));
  document.elementFromPoint = () => target;
  fireEvent(window, pointer('pointermove', 120, y));
  fireEvent(window, pointer('pointerup', 120, y));
}

describe('dragging a block from the palette onto the canvas', () => {
  it('adds the block where it was dropped, and selects it', () => {
    render(
      <>
        <Palette />
        <Canvas />
      </>,
    );
    const card = document.querySelector('.n-card_hero') as HTMLElement;
    card.getBoundingClientRect = () => rect(100, 120);

    dragTo(card, 160);

    const doc = useProject.getState().doc;
    const cardNode = doc.screens[0].root.children[0].children[0];
    expect(cardNode.children.map((c) => c.id)).toHaveLength(2);
    expect(doc.opLog).toHaveLength(1);
    expect(useUi.getState().selectedId).toBe(cardNode.children[1].id);
  });

  it('drops into the screen when released on empty artboard space', () => {
    render(
      <>
        <Palette />
        <Canvas />
      </>,
    );
    const viewport = document.querySelector('.frame-viewport') as HTMLElement;
    const root = document.querySelector('.n-screen_1_root') as HTMLElement;
    root.getBoundingClientRect = () => rect(0, 780);
    // The pointer is over the artboard's padding, not over any node's element.
    dragTo(viewport, 700);

    const doc = useProject.getState().doc;
    expect(doc.opLog).toHaveLength(1);
    expect(doc.screens[0].root.children).toHaveLength(2);
  });

  it('drops nothing when released outside the artboard', () => {
    render(
      <>
        <Palette />
        <Canvas />
      </>,
    );
    dragTo(document.body, 10);

    expect(useProject.getState().doc.opLog).toHaveLength(0);
    expect(useDrag.getState().drag.active).toBe(false);
  });

  it('shows the ghost above the panels, not inside the canvas', () => {
    render(
      <>
        <Palette />
        <Canvas />
      </>,
    );
    fireEvent(paletteButton('Heading'), pointer('pointerdown', 300, 300));
    const ghost = document.querySelector('.drag-ghost');
    expect(ghost).toBeTruthy();
    expect(ghost?.parentElement).toBe(document.body);
    fireEvent(window, pointer('pointercancel', 300, 300));
    expect(useDrag.getState().drag.active).toBe(false);
  });
});
