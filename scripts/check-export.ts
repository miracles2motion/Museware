/**
 * End-to-end proof that the export is real code, not a promise:
 *   demo doc → generateProjectFiles → temp dir → `tsc --noEmit` → `vite build`.
 * Run with `npx vite-node scripts/check-export.ts` (part of `npm run check:export`).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createProject } from '../src/store/useProject';
import { applyOps } from '../src/ops/apply';
import { TEMPLATES, buildScreensFor } from '../src/muse/demo/build';
import { generateProjectFiles } from '../src/export/reactCodegen';
import { manifestFor, serviceWorkerTemplate } from '../src/export/pwa';
import type { ProjectDoc } from '../src/types/tree';

const OUT = '/tmp/museware-export-check';
const repo = process.cwd();

function demoDoc(): ProjectDoc {
  const template = TEMPLATES[0];
  let doc: ProjectDoc = { ...createProject(template.projectName), kind: template.kind };
  const screens = buildScreensFor(template, doc.tokens);
  for (let i = 0; i < screens.length; i += 1) {
    const res = applyOps(
      [{ op: 'addScreen', screen: { ...screens[i], ...(i === 0 ? { entry: true } : {}) } }],
      doc,
      { source: 'user' },
    );
    if (res.errors.length) throw new Error(res.errors[0].message);
    doc = res.doc;
  }
  doc.screens[0].root.children.push(
    {
      id: 'pr_a_marquee',
      type: 'marquee',
      props: { items: 'Tea, Coffee, Cocoa, Spice', variant: 'pills', speed: 30 },
      styles: {},
      children: [],
    },
    {
      id: 'pr_a_faq',
      type: 'accordion',
      props: { items: 'Why tea? | It tastes good.' },
      styles: {},
      children: [],
    },
    {
      id: 'pr_a_section',
      type: 'section',
      props: { eyebrow: 'Hello', title: 'Tea', subtitle: 'For you', surface: 'glow' },
      styles: {},
      children: [],
    },
  );
  return doc;
}

const files = {
  ...generateProjectFiles(demoDoc()),
  'public/manifest.webmanifest': manifestFor(demoDoc()),
  'public/sw.js': serviceWorkerTemplate(),
};

rmSync(OUT, { recursive: true, force: true });
for (const [path, content] of Object.entries(files)) {
  const full = join(OUT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}
symlinkSync(join(repo, 'node_modules'), join(OUT, 'node_modules'), 'dir');
writeFileSync(join(OUT, '.gitignore'), 'node_modules\ndist\n');

const count = Object.keys(files).length;
console.log(`· wrote ${count} files to ${OUT}`);

function run(label: string, bin: string, args: string[]) {
  process.stdout.write(`· ${label}… `);
  try {
    execFileSync(bin, args, { cwd: OUT, stdio: 'pipe' });
    console.log('ok');
  } catch (err) {
    const error = err as { stdout?: Buffer; stderr?: Buffer };
    console.log('FAILED');
    console.error(error.stdout?.toString().slice(-4000) || '');
    console.error(error.stderr?.toString().slice(-4000) || '');
    process.exit(1);
  }
}

run('typecheck the export', join(repo, 'node_modules/.bin/tsc'), ['--noEmit', '-p', '.']);
run('build the export', join(repo, 'node_modules/.bin/vite'), ['build']);
console.log('✓ export: the generated project typechecks and builds');
