#!/usr/bin/env node
/**
 * Two guarantees, checked before every ship:
 *   1. Raw hex values live in ONE file (src/design/mw.css — its three tiers).
 *      Everything else references tokens; generated assets and the user's own
 *      token presets are the only exceptions.
 *   2. Every ink-on-surface pair in both themes clears WCAG AA (4.5:1), and
 *      the accent's paired text clears it too. The table in the spec is the
 *      sketch; this script is the truth.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const TOKENS_FILE = 'src/design/mw.css';

const HEX_ALLOWED = new Set([
  'src/design/mw.css',
  'src/design/presets.ts',
  'src/design/starter.ts',
  'src/muse/typedOptions.ts',
  'src/canvas/placeholder.ts',
  'src/design/palettes.ts',
  'src/persist/schema.ts',
  'src/export/reactCodegen.ts',
  'src/export/pwa.ts',
  'index.html',
  'public/favicon.svg',
]);

const HEX = /(?<!&)#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;
const problems = [];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

// ---- 1. token-only styling -------------------------------------------------
for (const file of [...walk(join(ROOT, 'src')), join(ROOT, 'index.html')]) {
  const rel = relative(ROOT, file).split(sep).join('/');
  if (HEX_ALLOWED.has(rel)) continue;
  const text = readFileSync(file, 'utf8');
  const hits = text.match(HEX);
  if (hits?.length) {
    problems.push(
      `${rel}: raw hex ${[...new Set(hits)].join(', ')} — use an mw-* token (${TOKENS_FILE})`,
    );
  }
}

// ---- 2. contrast ----------------------------------------------------------
const css = readFileSync(join(ROOT, TOKENS_FILE), 'utf8');

function blockFor(selector) {
  const start = css.indexOf(selector);
  if (start < 0) return '';
  let depth = 0;
  let began = false;
  let out = '';
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') {
      depth += 1;
      began = true;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (began && depth === 0) break;
      continue;
    }
    out += ch;
  }
  return out;
}

function declarations(block) {
  const map = new Map();
  for (const match of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    map.set(match[1], match[2].trim());
  }
  return map;
}

const primitives = declarations(blockFor(':root'));
const dark = new Map(primitives);
for (const [k, v] of declarations(blockFor(':root'))) dark.set(k, v);
const light = new Map([...dark, ...declarations(blockFor("[data-mw-theme='light']"))]);

function resolve(map, name, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  const raw = map.get(name) ?? primitives.get(name);
  if (!raw) return null;
  const ref = raw.match(/^var\(--([a-z0-9-]+)\)$/);
  if (ref) return resolve(map, ref[1], seen);
  return raw;
}

function toRgb(value) {
  if (!value) return null;
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(',').map((p) => Number(p.trim()));
    if (parts.length >= 3 && parts.every((p) => Number.isFinite(p)))
      return parts.slice(0, 3);
  }
  return null;
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ['mw-bg', 'mw-surface', 'mw-surface-2'];
const INKS = [
  ['mw-ink', 4.5],
  ['mw-ink-2', 4.5],
  ['mw-ink-3', 4.5],
];
const report = [];

for (const [themeName, map] of [
  ['dark', dark],
  ['light', light],
]) {
  for (const surface of SURFACES) {
    const bg = toRgb(resolve(map, surface));
    if (!bg) continue;
    for (const [ink, min] of INKS) {
      const fg = toRgb(resolve(map, ink));
      if (!fg) continue;
      const value = ratio(fg, bg);
      report.push([themeName, ink, surface, value]);
      if (value < min) {
        problems.push(
          `${themeName}: --${ink} on --${surface} is ${value.toFixed(2)}:1 (needs ${min}:1)`,
        );
      }
    }
  }
  const accent = toRgb(resolve(map, 'mw-accent'));
  const onAccent = toRgb(resolve(map, 'mw-on-accent'));
  if (accent && onAccent) {
    const value = ratio(accent, onAccent);
    report.push([themeName, 'mw-on-accent', 'mw-accent', value]);
    if (value < 4.5) {
      problems.push(`${themeName}: text on accent is ${value.toFixed(2)}:1 (needs 4.5:1)`);
    }
  }
}

if (problems.length) {
  console.error(`✖ token check failed (${problems.length})`);
  for (const problem of problems) console.error(`  · ${problem}`);
  process.exit(1);
}

const worst = report.reduce((min, row) => (row[3] < min[3] ? row : min), report[0]);
console.log(`✓ tokens: no raw hex outside ${TOKENS_FILE}`);
console.log(
  `✓ contrast: ${report.length} pairs pass AA; tightest is ${worst[1]} on ${worst[2]} (${worst[0]}) at ${worst[3].toFixed(2)}:1`,
);
