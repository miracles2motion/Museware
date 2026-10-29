// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Canvas } from './Canvas';
import { fitScale } from './fit';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import type { ComponentNode, ScreenDoc } from '../types/tree';

/**
 * "The phone goes tiny after I visit tablet and desktop."
 *
 * The fit used to be derived from `frame.offsetWidth`. The switcher animated
 * width, so the effect that measures ran while the box still reported its old
 * width, and the phone inherited the desktop's scale — permanently, because
 * nothing re-measured afterwards.
 *
 * These tests lie about the frame's measured width on purpose (it always says
 * 1280): the display scale must come from the breakpoint's declared width, so
 * a stale box cannot decide how big a phone looks.
 */

const CANVAS_W = 900;
const CANVAS_H = 700;
const FRAME_H = 780;
/** The canvas hint line under the artboard is subtracted before the fit. */
const HINT_H = 10;

function setMetric(el: Element, prop: string, value: number) {
  Object.defineProperty(el, prop, { value, configurable: true });
}

beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const screen: ScreenDoc = {
    id: 'screen_1',
    name: 'Screen 1',
    entry: true,
    root: {
      id: 'screen_1_root',
      type: 'screen',
      props: {},
      styles: {},
      children: [{ id: 'col_main', type: 'col', props: {}, styles: {}, children: [] }],
    } as ComponentNode,
  };
  useProject
    .getState()
    .replaceDoc({ ...useProject.getState().doc, screens: [screen], opLog: [], rail: [] });
  useUi.setState({
    activeScreenId: 'screen_1',
    selectedId: null,
    route: 'editor',
    breakpoint: 'compact',
    runMode: false,
    toasts: [],
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** jsdom reports no padding at all; the fit maths needs a number. */
function stubBoxModel() {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation(((el: Element) => {
    const style = real(el);
    return new Proxy(style, {
      get(target, key) {
        if (key === 'paddingLeft' || key === 'paddingRight') return '0px';
        if (key === 'paddingTop' || key === 'paddingBottom') return '0px';
        return Reflect.get(target, key);
      },
    });
  }) as typeof window.getComputedStyle);
}

function renderCanvas() {
  stubBoxModel();
  const view = render(<Canvas />);
  const scroller = document.querySelector('.canvas-scroll') as HTMLElement;
  const frame = document.querySelector('.device-frame') as HTMLElement;
  setMetric(scroller, 'clientWidth', CANVAS_W);
  setMetric(scroller, 'clientHeight', CANVAS_H);
  // The lie: this box is mid-swap and still reports the desktop width.
  setMetric(frame, 'offsetWidth', 1280);
  setMetric(frame, 'offsetHeight', FRAME_H);
  return view;
}

function scaleNow(): number {
  const frame = document.querySelector('.device-frame') as HTMLElement;
  return Number(frame.style.getPropertyValue('--mw-fit'));
}

/** The fit recomputes on a resize and after the breakpoint changes. */
async function settle() {
  await act(async () => {
    window.dispatchEvent(new Event('resize'));
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

describe('the breakpoint switcher keeps its own scale', () => {
  it('sizes the phone from 390px, not from whatever the frame last measured', async () => {
    renderCanvas();
    await settle();

    const phone = fitScale(CANVAS_W, CANVAS_H - HINT_H, 390, FRAME_H);
    expect(scaleNow()).toBeCloseTo(phone, 3);

    await act(async () => useUi.getState().setBreakpoint('expanded'));
    await settle();
    const desktop = fitScale(CANVAS_W, CANVAS_H - HINT_H, 1280, FRAME_H);
    expect(scaleNow()).toBeCloseTo(desktop, 3);
    expect(desktop).toBeLessThan(phone);
  });

  it('comes back to the phone scale after a desktop round trip', async () => {
    renderCanvas();
    await settle();
    const phone = fitScale(CANVAS_W, CANVAS_H - HINT_H, 390, FRAME_H);

    for (const bp of ['medium', 'expanded', 'compact', 'expanded', 'compact'] as const) {
      await act(async () => useUi.getState().setBreakpoint(bp));
      await settle();
    }

    expect(scaleNow()).toBeCloseTo(phone, 3);
  });
});
