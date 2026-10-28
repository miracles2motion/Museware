#!/usr/bin/env node
/**
 * The dist is a static app. Two rules:
 *   1. No secret ever reaches it — the muse key lives on the server (env) or in
 *      sessionStorage; the bundle only ever knows the header name.
 *   2. It is actually shippable — index.html, hashed assets, no sourcemaps,
 *      sane size, no dev-only endpoints baked in.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const problems = [];

if (!existsSync(DIST)) {
  console.error('✖ dist/ is missing — run `npm run build` first.');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(DIST);
const rel = (file) => relative(DIST, file).split(sep).join('/');

if (!files.some((f) => rel(f) === 'index.html'))
  problems.push('dist/index.html is missing');

const textFiles = files.filter((f) => /\.(js|mjs|css|html|json|map|txt)$/.test(f));
// A variable NAME is not a secret — the app is allowed to tell a stranded
// visitor "set MUSE_API_KEY on the server and redeploy". A variable VALUE is.
const SECRET_PATTERNS = [
  [/MUSE_API_KEY\s*[:=]\s*['"`][^'"`]{6,}/, 'a hardcoded MUSE_API_KEY value'],
  [/MUSE_API_BASE\s*[:=]\s*['"`][^'"`]{6,}/, 'a hardcoded MUSE_API_BASE value'],
  [/OPENAI_API_KEY\s*[:=]\s*['"`][^'"`]{6,}/, 'a hardcoded OpenAI key'],
  [/sk-[A-Za-z0-9_-]{24,}/, 'something that looks like an API key'],
  [/api[_-]?key\s*[:=]\s*['"][A-Za-z0-9_-]{16,}['"]/i, 'a hardcoded api key'],
];

let bytes = 0;
for (const file of files) {
  const size = statSync(file).size;
  bytes += size;
  if (file.endsWith('.map')) problems.push(`${rel(file)}: sourcemaps must not ship`);
  if (!textFiles.includes(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const [pattern, label] of SECRET_PATTERNS) {
    if (pattern.test(text)) problems.push(`${rel(file)}: contains ${label}`);
  }
  if (/localhost:5173/.test(text))
    problems.push(`${rel(file)}: contains the dev server address`);
}

// The proxy path must still be present (that is how the app talks to the key).
const js = files
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
if (!/\/api\/muse/.test(js))
  problems.push('the built bundle lost the /api/muse client path');

const hashedAssets = files.filter((f) =>
  /assets\/.+-[A-Za-z0-9_-]{8}\.(js|css)$/.test(rel(f)),
);
if (hashedAssets.length < 2)
  problems.push('expected hashed js + css assets in dist/assets');

const megabytes = bytes / (1024 * 1024);
if (megabytes > 8)
  problems.push(`dist is ${megabytes.toFixed(1)} MB — over the 8 MB budget`);

if (problems.length) {
  console.error(`✖ dist check failed (${problems.length})`);
  for (const problem of problems) console.error(`  · ${problem}`);
  process.exit(1);
}

console.log(
  `✓ dist: ${files.length} files, ${megabytes.toFixed(2)} MB, no key material, no sourcemaps`,
);
