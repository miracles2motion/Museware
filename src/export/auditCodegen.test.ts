import { describe, expect, it } from 'vitest';
import { transform } from 'esbuild';
import { generateProjectFiles } from './reactCodegen';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import type { ComponentNode } from '../types/tree';
const node = (
  id: string,
  type: ComponentNode['type'],
  props: Record<string, unknown> = {},
  children: ComponentNode[] = [],
): ComponentNode => ({ id, type, props, styles: {}, children });

describe('exported interactive components', () => {
  it('emits valid TSX for progress, tabs, visibility, card titles and tap events', async () => {
    const screen = emptyScreen('Home', { id: 'home', entry: true });
    const card = node('card_a', 'card', { title: 'Hello' });
    card.events = { tap: [{ type: 'toast', text: 'Tapped' }] };
    card.visibleWhen = { key: 'enabled', equals: false };
    screen.root.children = [
      node('bar_a', 'progress', { bindKey: 'percent', value: 45 }),
      node('tabs_a', 'tabs', { items: ['One', 'Two'] }, [
        node('text_one', 'text', { text: 'One' }),
        node('text_two', 'text', { text: 'Two' }),
      ]),
      card,
    ];
    const files = generateProjectFiles({ ...createProject(), screens: [screen] });
    const source = files['src/screens/Home.tsx'];
    expect(source).toContain('String(state["percent"] ?? 45) + \'%\'');
    expect(source).toContain('matchesValue(state["enabled"], false)');
    expect(source).toContain('Hello');
    expect(source).toContain('Tapped');
    expect(files['src/runtime.tsx']).toContain('Children.toArray(children)[active]');
    await expect(transform(source, { loader: 'tsx' })).resolves.toBeTruthy();
  });
});
