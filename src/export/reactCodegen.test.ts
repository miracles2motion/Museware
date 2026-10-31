import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { generateProjectFiles } from './reactCodegen';
import { useProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';

/**
 * The exported zip is the third consumer of the generated CSS — canvas, Run mode
 * and export all have to agree, or the demo lies about what ships.
 *
 * The contract being pinned here is the height chain (§4.4): an APP is the phone
 * model, so the wrapper is a definite 100vh and a child's Height: Match still
 * fills something once it leaves the builder. A WEB project is a document, so
 * the wrapper is min-height and the page grows instead.
 */
describe('the exported wrapper keeps the height contract', () => {
  it('gives an app project a definite 100vh viewport', () => {
    const doc = { ...useProject.getState().doc, kind: 'app' as const };
    const css = generateProjectFiles(doc)['src/nodes.css'];
    expect(css).toContain('.mw-app{height:100vh;overflow-y:auto;');
  });

  it('lets a web project grow with its content', () => {
    const doc = { ...useProject.getState().doc, kind: 'web' as const };
    const css = generateProjectFiles(doc)['src/nodes.css'];
    expect(css).toContain('.mw-app{min-height:100vh;');
  });
  it('exports a browser-framed hero with media and a themed icon card', () => {
    const original = useProject.getState().doc;
    const screen = emptyScreen('Home', { id: 'home', entry: true });
    screen.root.props.lookTitle = 30;
    screen.root.props.lookBody = 16;
    screen.root.children = [
      {
        id: 'hero_a',
        type: 'hero',
        props: { title: 'Tea', frame: 'browser', surface: 'glow' },
        styles: {},
        children: [
          {
            id: 'card_a',
            type: 'card',
            props: { variant: 'spotlight', icon: 'star' },
            styles: {},
            children: [],
          },
        ],
      },
    ];
    const files = generateProjectFiles({ ...original, kind: 'web', screens: [screen] });
    const module =
      Object.entries(files).find(([key]) => key.startsWith('src/screens/'))?.[1] || '';
    expect(module).toContain('data-frame="browser"');
    expect(module).toContain('mw-browser-bar');
    expect(module).toContain('data-variant="spotlight"');
    expect(module).toContain('mw-card-icon');
    expect(module).toContain('--type-title-base');
    expect(files['src/nodes.css']).toContain('max-width:1120px');
  });
});
