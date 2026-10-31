#!/usr/bin/env node
/**
 * Enforce tokenized shell spacing and dimensions in app.css. PostCSS is already
 * present through the existing Vite toolchain; this adds no dependency.
 * Hairlines (0, 1 and 2px) are permitted. Font sizes, icon glyph drawing,
 * radii, shadows, and illustration properties outside these declarations are
 * not layout spacing and are intentionally outside this check.
 */
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const TRACKED =
  /^(?:gap|row-gap|column-gap|margin(?:-[\w-]+)?|padding(?:-[\w-]+)?|(?:min-|max-)?(?:width|height))$/i;
const PIXELS = /(?<![\w.-])(-?(?:\d+(?:\.\d+)?|\.\d+))px\b/gi;
// Explicit exceptions must specify an exact selector, property, and value.
// No large dimensions need an exception today: even one-off geometry is tokenized.
const ALLOWLIST = [];

export function findCssLiterals(source, filename = 'src/design/app.css') {
  const root = postcss.parse(source, { from: filename });
  const errors = [];
  root.walkDecls((decl) => {
    if (!TRACKED.test(decl.prop)) return;
    const selector = decl.parent.type === 'rule' ? decl.parent.selector : '';
    const value = decl.value.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const hit of value.matchAll(PIXELS)) {
      if ([0, 1, 2].includes(Math.abs(Number(hit[1])))) continue;
      if (
        ALLOWLIST.some(
          (entry) =>
            entry.selector === selector &&
            entry.property === decl.prop &&
            entry.pixel === hit[0],
        )
      )
        continue;
      errors.push(
        `${filename}:${decl.source.start.line}: ${selector} ${decl.prop}: ${hit[0]} — use an mw token`,
      );
    }
  });
  return errors;
}

if (process.argv.includes('--self-test')) {
  const bad = findCssLiterals(
    '.sample { gap: 4px; margin-inline: -6px; padding: calc(100% - 12px); height: 28px; min-width: 3px; max-height: .5px; }',
  );
  const good = findCssLiterals(
    '/* width: 100px */ .ok { gap: var(--mw-space-1); padding: 0 1px 2px; width: 100%; border-radius: 12px; box-shadow: 0 4px 8px black; }',
  );
  // Fractional pixel values are not among the documented 0/1/2px exemptions.
  if (bad.length !== 6 || good.length !== 0)
    throw new Error(
      `CSS token self-test failed: ${bad.length} violations, ${good.length} false positives`,
    );
  console.log(
    '✓ CSS token checker rejects raw layout lengths and accepts documented exemptions',
  );
} else {
  const file = 'src/design/app.css';
  const errors = findCssLiterals(readFileSync(file, 'utf8'), file);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else
    console.log(
      '✓ CSS layout: no raw spacing or dimension lengths outside hairline exemptions',
    );
}
