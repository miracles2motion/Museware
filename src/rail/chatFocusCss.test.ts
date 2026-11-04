import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/design/app.css', 'utf8');
function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('fullscreen chat CSS', () => {
  it('keeps the focused rail transparent and shadowless and the launcher in the bottom middle', () => {
    const rail = rule('.chat-focus .rail[data-chat-focused]');
    expect(rail).toMatch(/background:\s*transparent\s*;/);
    expect(rail).toMatch(/box-shadow:\s*none\s*;/);
    expect(rail).toMatch(/border:\s*0\s*;/);
    const launcher = rule('.chat-launcher');
    expect(launcher).toMatch(/left:\s*50%\s*;/);
    expect(launcher).toMatch(/transform:\s*translateX\(-50%\)\s*;/);
  });
  it('uses a legible, full-width blurred overlay with centered readable content', () => {
    expect(rule('.chat-focus')).toMatch(/var\(--mw-bg\)\s+92%/);
    expect(rule('.chat-focus')).toMatch(/backdrop-filter:\s*blur\(var\(--mw-blur-chat\)\)/);
    expect(rule('.chat-focus-column')).toMatch(/width:\s*100%\s*;/);
    const messages = rule('.chat-focus .rail-body > *');
    expect(messages).toMatch(/width:\s*100%\s*;/);
    expect(messages).toMatch(/max-width:\s*var\(--mw-chat-content-width\)\s*;/);
    expect(messages).toMatch(/margin-inline:\s*auto\s*;/);
    const header = rule('.chat-focus .rail[data-chat-focused] .rail-header');
    expect(header).toMatch(/border-bottom:\s*1px solid color-mix/);
    const composer = rule('.chat-focus .composer');
    expect(composer).toMatch(/width:\s*100%\s*;/);
    expect(composer).toMatch(/background:\s*transparent\s*;/);
    expect(composer).toMatch(/border-top:\s*1px solid color-mix/);
    expect(css).toMatch(
      /\.chat-focus \.composer > \.composer-box[\s\S]*?max-width:\s*var\(--mw-chat-content-width\)[\s\S]*?margin-inline:\s*auto/,
    );
  });
  it('caps desktop conversation and composer width and keeps user bubbles narrower', () => {
    expect(css).toMatch(/@media \(min-width: 900px\)\s*\{\s*\.chat-focus \.rail-body > \*,[\s\S]*?max-width:\s*var\(--mw-shell-geometry-720\)/);
    expect(css).toMatch(/\.chat-focus \.bubble-user\s*\{\s*max-width:\s*80%/);
  });
  it('animates minimization toward the launcher and respects reduced motion', () => {
    const closing = rule(".chat-focus[data-minimizing='true']");
    expect(closing).toContain('transform-origin:');
    expect(closing).toContain('chat-minimize-out');
    expect(closing).toContain('pointer-events: none');
    expect(css).toMatch(/@keyframes chat-minimize-out[\s\S]*?scale\(0\.06\)/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?chat-focus\[data-minimizing='true'\][\s\S]*?animation: none/,
    );
  });
});
