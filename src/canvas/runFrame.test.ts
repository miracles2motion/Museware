import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('run frame scroll ownership', () => {
  it('keeps its minimum height without adding an overflow scroll container', () => {
    const css = readFileSync('src/design/app.css', 'utf8');
    const frame = css.match(/\.run-frame\s*\{([^}]*)\}/)?.[1] || '';
    const stage = css.match(/\.run-stage\s*\{([^}]*)\}/)?.[1] || '';
    expect(frame).toMatch(/min-height:\s*100%/);
    expect(frame).not.toMatch(/\boverflow(?:-x|-y)?\s*:/);
    expect(stage).toMatch(/overflow:\s*auto/);
  });
});
