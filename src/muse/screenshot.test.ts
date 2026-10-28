import { describe, expect, it } from 'vitest';
import {
  elementsOutline,
  flattenSegments,
  layoutSegments,
  type SegmentBox,
} from './screenshot';

/**
 * §8.9 golden mock: a hand-drawn bakery card, 6 elements, SAM boxes only.
 * The layout pass must produce what a human sees — reading order, nested by
 * containment — before a single pixel reaches the model.
 */
const MOCK: SegmentBox[] = [
  { label: 'card', box: [0, 0, 360, 300] },
  { label: 'heading "Sunrise Bakery"', box: [16, 16, 200, 30] },
  { label: 'text "Fresh sourdough, every morning"', box: [16, 56, 320, 40] },
  { label: 'row', box: [16, 110, 328, 60] },
  { label: 'button "Order"', box: [24, 120, 140, 40] },
  { label: 'button "Menu"', box: [176, 120, 140, 40] },
];

describe('screenshot layout — reading order and containment', () => {
  it('nests the 6 mock elements into the tree a human sees', () => {
    const roots = layoutSegments(MOCK);
    expect(roots).toHaveLength(1);
    expect(roots[0].label).toBe('card');
    expect(roots[0].depth).toBe(0);

    const top = roots[0].children.map((c) => c.label);
    expect(top).toEqual([
      'heading "Sunrise Bakery"',
      'text "Fresh sourdough, every morning"',
      'row',
    ]);

    const row = roots[0].children[2];
    expect(row.depth).toBe(1);
    expect(row.children.map((c) => c.label)).toEqual(['button "Order"', 'button "Menu"']);
    expect(row.children.every((c) => c.depth === 2)).toBe(true);
  });

  it('sorts reading order (y first, then x) whatever order SAM returns', () => {
    const shuffled = [MOCK[4], MOCK[1], MOCK[5], MOCK[0], MOCK[3], MOCK[2]];
    const order = flattenSegments(layoutSegments(shuffled)).map((n) => n.label);
    expect(order).toEqual([
      'card',
      'heading "Sunrise Bakery"',
      'text "Fresh sourdough, every morning"',
      'row',
      'button "Order"',
      'button "Menu"',
    ]);
  });

  it('drops the duplicate box SAM reports for the same words', () => {
    const roots = layoutSegments([
      ...MOCK,
      { label: 'heading "Sunrise Bakery"', box: [16, 16, 200, 30] },
      { label: 'button "Order"', box: [24, 120, 140, 60] },
    ]);
    expect(flattenSegments(roots)).toHaveLength(6);
  });

  it('writes the one-batched-pass outline with indentation and geometry', () => {
    const outline = elementsOutline(layoutSegments(MOCK));
    const lines = outline.split('\n');
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe('1. card @ 0,0 360x300');
    expect(lines[1]).toMatch(/^2\. {3}heading/);
    expect(lines[3]).toBe('4.   row @ 16,110 328x60');
    expect(lines[5]).toMatch(/^6\. {5}button "Menu"/);
  });

  it('survives a box-free image and a nonsense pile', () => {
    expect(layoutSegments([])).toEqual([]);
    expect(elementsOutline([])).toBe('');
    const roots = layoutSegments([
      { label: 'label', box: [10, 10, 50, 20] },
      { label: 'label', box: [10, 10, 50, 20] },
    ]);
    expect(flattenSegments(roots)).toHaveLength(1);
  });
});
