#!/usr/bin/env node
/** Keep product-facing source independent, without matching ordinary words. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Split names so this checker can scan itself without triggering on its own list.
const names = [
  ['fig', 'ma'],
  ['sketch', 'ware'],
  ['lov', 'able'],
  ['awww', 'ards'],
  ['web', 'flow'],
  ['fram', 'er'],
  ['tail', 'wind'],
  ['can', 'va'],
  ['w', 'ix'],
  ['square', 'space'],
  ['rep', 'lit'],
  ['v', '0'],
  ['bo', 'lt'],
].map((parts) => parts.join(''));
// Avoid false positives on the ordinary canvas and frame-reference names.
// Other names match even when embedded; the two short names use word boundaries.
const alternatives = names.map((name, index) => {
  if (index === 5) return `${name}(?!ef)`;
  if (index === 7) return `${name}(?!s)`;
  if (index >= 11) return `\\b${name}\\b`;
  return name;
});
const pattern = new RegExp(`(?:${alternatives.join('|')})`, 'gi');
function matches(text) {
  return [...text.matchAll(pattern)].map((hit) => hit[0]);
}
function files(dir, all = false) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory()
      ? files(path, all)
      : all || /\.(?:ts|tsx|css|md)$/.test(path)
        ? [path]
        : [];
  });
}
if (process.argv.includes('--self-test')) {
  for (const name of names) {
    if (!matches(`Example: ${name.toUpperCase()}!`).length)
      throw new Error('brand checker missed a forbidden name');
  }
  if (matches('canvas frameRef -apple-system Inter SF Pro Meta muse-image').length)
    throw new Error('brand checker flagged an allowed term');
  console.log('✓ brand checker rejects forbidden names and accepts ordinary terms');
} else {
  const targets = [...files('src'), ...files('scripts', true), 'README.md', 'index.html'];
  let failed = false;
  for (const file of targets) {
    const hits = matches(readFileSync(file, 'utf8'));
    if (hits.length) {
      console.error(`${file}: forbidden product name found`);
      failed = true;
    }
  }
  if (failed) process.exitCode = 1;
  else console.log('✓ brand: product-facing source contains no forbidden app names');
}
