import { describe, expect, it } from 'vitest';
import { generateProjectFiles } from './reactCodegen';
import { useProject } from '../store/useProject';

describe('exported wrapper height contract', () => {
  it('gives an app project a definite 100vh viewport', () => {
    const doc = { ...useProject.getState().doc, kind: 'app' as const };
    const css = generateProjectFiles(doc)['src/nodes.css'];
    expect(css).toContain('.mw-app{height:100vh;overflow-y:auto;');
  });
  it('lets a web project grow', () => {
    const doc = { ...useProject.getState().doc, kind: 'web' as const };
    const css = generateProjectFiles(doc)['src/nodes.css'];
    expect(css).toContain('.mw-app{min-height:100vh;');
  });
});
