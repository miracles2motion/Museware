import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
describe('work card contrast', () => {
  it('does not dim disabled text-bearing cards', () => {
    const block = css.match(
      /\.chat-card:disabled,\s*\.chat-chip:disabled\s*\{([^}]*)\}/,
    )?.[1];
    expect(block).toBeDefined();
    expect(block).not.toMatch(/opacity\s*:/);
    expect(block).toMatch(/background:\s*var\(--mw-surface-2\)/);
  });
  it('uses a solid danger surface and light text for stop', () => {
    const block = css.match(/\.stop-btn\s*\{([^}]*)\}/)?.[1];
    expect(block).toMatch(/background:\s*var\(--mw-danger\)/);
    expect(block).toMatch(/color:\s*var\(--mw-on-accent\)/);
    expect(block).toMatch(/--mw-danger:\s*var\(--mw-red-600\)/);
  });
});
