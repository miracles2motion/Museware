#!/usr/bin/env node
/**
 * Two guarantees, checked before every ship:
 *   1. Raw hex values live in ONE file (src/design/mw.css — its three tiers).
 *      Everything else references tokens; generated assets and the user's own
 *      token presets are the only exceptions.
 *   2. Every ink-on-surface pair in both themes clears WCAG AA (4.5:1), and
 *      the accent's paired text clears it too. The table in the spec is the
 *      sketch; this script is the truth.
 *   3. The definite-height chain survives. height:'match' compiles to 100%,
 *      and a percentage height against an INDEFINITE parent quietly falls back
 *      to auto — which is how match worked on width and did nothing on height
 *      for three passes without a single failing test.
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

// ---- 2. stacking: canvas chrome stays under the panels --------------------
/*
 * The selection outline, the hover ring, the id chip and the drop chrome are
 * absolutely positioned INSIDE the scaled artboard. Absolute positioning with
 * a z-index lets a descendant paint over anything the ancestor does not
 * out-rank — which is how an outline ended up drawn across the inspector and
 * the tab bar. One line fixes the whole class of bug: `.canvas-area` must own a
 * stacking context, so nothing inside it can escape above the panels that
 * slide over the canvas.
 */
const CSS_FILE = 'src/design/app.css';
const appCss = readFileSync(join(ROOT, CSS_FILE), 'utf8');

function ruleFor(selector) {
  const pattern = new RegExp(
    `(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
  );
  return appCss.match(pattern)?.[1] ?? null;
}

const TRAPPED = [
  '.hover-outline',
  '.selection-outline',
  '.drop-line',
  '.drop-inside',
  '.id-chip',
  '.node-handle',
  '.inline-edit',
];

function createsStackingContext(block) {
  if (/isolation\s*:\s*isolate/.test(block)) return true;
  const zIndex = block.match(/z-index\s*:\s*([^;]+);/)?.[1]?.trim();
  return Boolean(zIndex && zIndex !== 'auto');
}

const canvasArea = ruleFor('.canvas-area');
if (canvasArea === null) {
  problems.push(`${CSS_FILE}: .canvas-area is missing — the canvas lost its shell`);
} else if (!createsStackingContext(canvasArea)) {
  problems.push(
    `${CSS_FILE}: .canvas-area must create a stacking context (isolation: isolate) — ` +
      'without it the selection outline paints over the inspector, menus and the tab bar',
  );
}

for (const selector of TRAPPED) {
  const rule = ruleFor(selector);
  if (rule === null) continue;
  if (/position\s*:\s*fixed/.test(rule)) {
    problems.push(
      `${CSS_FILE}: ${selector} is position: fixed — canvas chrome must stay inside the ` +
        'artboard, or it floats over every panel on the page',
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

// ---- 3. the definite-height chain (height: match) -------------------------
/*
 * Three boxes have to agree before match-parent means anything:
 *   .frame-viewport / .run-frame  →  a SET height
 *   .mw-app                       →  100% of it (not min-height — that is not a height)
 *   screen (cssGen)               →  height:100% + overflow-y:auto when it scrolls
 * Break any link and the child's 100% resolves to auto again, silently.
 */
const HEIGHT_CHAIN = [
  ['.frame-viewport .mw-app', 'the canvas app wrapper'],
  ['.run-frame .mw-app', 'the run-mode app wrapper'],
  ['.run-frame', 'the run-mode frame for both app and web'],
];

/** A real `height: 100%` declaration — min-height is NOT one. */
function hasExactHeight(block) {
  return block
    .split(';')
    .map((decl) => decl.replace(/\/\*[\s\S]*?\*\//g, '').trim())
    .some((decl) => /^height\s*:\s*100%$/.test(decl));
}

for (const [selector, what] of HEIGHT_CHAIN) {
  const block = ruleFor(selector);
  if (block === null) {
    problems.push(`${CSS_FILE}: ${selector} is missing — ${what} has no definite height`);
  } else if (!hasExactHeight(block)) {
    problems.push(
      `${CSS_FILE}: ${selector} must be height: 100% — ${what} with an auto/min height is ` +
        "indefinite, so a child's height: match resolves to auto and does nothing",
    );
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
  `✓ stacking: .canvas-area traps its chrome; ${TRAPPED.length} overlays checked`,
);
console.log(
  `✓ contrast: ${report.length} pairs pass AA; tightest is ${worst[1]} on ${worst[2]} (${worst[0]}) at ${worst[3].toFixed(2)}:1`,
);
console.log(`✓ height chain: ${HEIGHT_CHAIN.length} wrappers keep height: match definable`);
