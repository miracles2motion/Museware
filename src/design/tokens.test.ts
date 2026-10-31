import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/design/mw.css', 'utf8');
const appCss = readFileSync('src/design/app.css', 'utf8');
const removed = [
  '--mw-amber-100',
  '--mw-amber-200',
  '--mw-amber-300',
  '--mw-amber-50',
  '--mw-amber-500',
  '--mw-amber-700',
  '--mw-amber-950',
  '--mw-canvas-bg-light',
  '--mw-card-gap',
  '--mw-card-pad',
  '--mw-chip-pad-y',
  '--mw-flyout-w',
  '--mw-fs-18',
  '--mw-fs-24',
  '--mw-green-100',
  '--mw-green-200',
  '--mw-green-300',
  '--mw-green-50',
  '--mw-green-500',
  '--mw-green-700',
  '--mw-green-950',
  '--mw-grid-light',
  '--mw-icon-lg',
  '--mw-icon-md',
  '--mw-icon-sm',
  '--mw-indigo-100',
  '--mw-indigo-200',
  '--mw-indigo-300',
  '--mw-indigo-50',
  '--mw-indigo-800',
  '--mw-indigo-900',
  '--mw-indigo-950',
  '--mw-neutral-150',
  '--mw-neutral-700',
  '--mw-neutral-850',
  '--mw-on-danger',
  '--mw-radius-none',
  '--mw-rail-composer-min',
  '--mw-red-100',
  '--mw-red-200',
  '--mw-red-300',
  '--mw-red-50',
  '--mw-red-500',
  '--mw-red-700',
  '--mw-red-950',
  '--mw-row-h',
  '--mw-row-pad',
  '--mw-section-gap',
  '--mw-space-11',
  '--mw-space-12',
  '--mw-space-7',
  '--mw-space-9',
  '--mw-tab-pad',
  '--mw-touch-min',
  '--mw-violet-100',
  '--mw-violet-200',
  '--mw-violet-300',
  '--mw-violet-400',
  '--mw-violet-50',
  '--mw-violet-700',
  '--mw-violet-800',
  '--mw-violet-900',
  '--mw-violet-950',
  '--mw-chip-h',
  '--mw-shell-compact-height',
];
function token(name: string) {
  return css.match(new RegExp(`(?:^|\\n)\\s*${name}\\s*:\\s*([^;]+);`))?.[1].trim();
}
describe('Museware shell sizing tokens', () => {
  it('has exactly one compact control height and the normal control height', () => {
    expect(token('--mw-control-h-sm')).toBe('28px');
    expect(token('--mw-control-h')).toBe('36px');
    const controls = [...css.matchAll(/--mw-control-h(?:-[a-z]+)?\s*:\s*(\d+)px/g)].map(
      (m) => Number(m[1]),
    );
    expect(controls.filter((value) => value < 36)).toEqual([28]);
  });
  it('uses the renamed spacing scale and a default canvas fit', () => {
    expect(token('--mw-space-1-5')).toBe('6px');
    expect(token('--mw-space-2-5')).toBe('10px');
    expect(token('--mw-fit')).toBe('1');
    expect(css + appCss).not.toMatch(/--mw-space-(?:onehalf|twohalf)/);
    expect(appCss).not.toMatch(/var\(--mw-type-/);
  });
  it('does not define or reference the 65 purged tokens', () => {
    expect(removed).toHaveLength(65);
    for (const name of removed) {
      expect(token(name), name).toBeUndefined();
      expect((css + appCss).includes(`var(${name})`), name).toBe(false);
    }
  });
});
