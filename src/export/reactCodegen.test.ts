import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { generateProjectFiles } from './reactCodegen';
import { useProject } from '../store/useProject';

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
});
