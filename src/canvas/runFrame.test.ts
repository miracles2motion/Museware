import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('run frame scroll ownership', () => {
  it('keeps the stage clipped and gives the device native vertical scrolling', () => {
    const css = readFileSync('src/design/app.css', 'utf8');
    const stage = css.match(/\.run-stage\s*\{([^}]*)\}/)?.[1] || '';
    const device = css.match(/\.run-device\s*\{([^}]*)\}/)?.[1] || '';
    expect(stage).toMatch(/overflow:\s*hidden/);
    expect(device).toMatch(/height:\s*100%/);
    expect(device).toMatch(/overflow-y:\s*auto/);
    expect(device).toMatch(/overflow-x:\s*hidden/);
    expect(css).toMatch(
      /\.run-stage\[data-scroll='true'\] \.run-frame\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*100%/,
    );
    expect(css).toMatch(
      /\.run-stage\[data-scroll='true'\] \.run-frame \.mw-app\s*\{[^}]*height:\s*auto/,
    );
    expect(css).toMatch(
      /\.run-stage\[data-scroll='true'\] \.run-frame \.mw-app > \[class\^='n-'\]\s*\{[^}]*overflow-y:\s*visible/,
    );
    expect(css).toMatch(/\.run-stage\[data-scroll='false'\]\s*\{\s*overflow:\s*auto/);
    expect(css).toMatch(/\.run-frame\s*\{[^}]*container-type:\s*inline-size/);
  });
});
