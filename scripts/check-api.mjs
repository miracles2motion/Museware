#!/usr/bin/env node
/**
 * Prove the DEPLOYED artifact boots, not just the source.
 *
 * This runs the built function in a fresh Node process with nothing but the
 * bundle on disk, the way Vercel does: import the file, hand it a request, read
 * the answer. If a relative import or a top-level error would break it in
 * production, this fails here instead — in CI, with a stack, before a visitor
 * ever sees `FUNCTION_INVOCATION_FAILED`.
 *
 * `node:http` request/response objects are faked just enough: the handler only
 * reads headers/method/url and writes a body.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const ENTRY = 'api/muse/[...path].js';
const ROUTES = ['/api/muse/health', '/api/muse/status', '/api/muse/keytest'];

if (!existsSync(ENTRY)) {
  console.error(`✗ api check: ${ENTRY} is missing — run scripts/build-api.mjs first.`);
  process.exit(1);
}

const source = readFileSync(ENTRY, 'utf8');
const relativeImports = [...source.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)].map(
  (m) => m[1],
);
const requires = [...source.matchAll(/\brequire\(\s*['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
if (relativeImports.length || requires.length) {
  console.error(
    `✗ api check: the bundle still has relative imports: ${[...relativeImports, ...requires].join(', ')}`,
  );
  process.exit(1);
}

const script = `
import handler from ${JSON.stringify(new URL(`../${ENTRY}`, import.meta.url).href)};

function call(url, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url,
      headers: { host: 'localhost', 'content-type': 'application/json' },
      on(event, cb) {
        if (event === 'data' && body) cb(Buffer.from(JSON.stringify(body)));
        if (event === 'end') cb();
        return req;
      },
      destroy() {},
      socket: { remoteAddress: '127.0.0.1' },
    };
    const headers = {};
    let status = 0;
    let text = '';
    const res = {
      get headersSent() { return status !== 0; },
      set statusCode(v) { status = v; },
      get statusCode() { return status; },
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      getHeader(k) { return headers[k.toLowerCase()]; },
      end(chunk) { text += chunk ?? ''; resolve({ status, headers, text }); },
      write(chunk) { text += chunk ?? ''; },
      on() {},
    };
    try { handler(req, res).catch(reject); } catch (err) { reject(err); }
  });
}

const out = [];
for (const route of ${JSON.stringify(ROUTES)}) {
  const r = await call(route, route.endsWith('keytest') ? 'POST' : 'GET', route.endsWith('keytest') ? {} : undefined);
  let parsed = null;
  try { parsed = JSON.parse(r.text); } catch { parsed = null; }
  out.push({
    route,
    status: r.status,
    type: r.headers['content-type'] || '',
    isJson: parsed !== null && typeof parsed === 'object',
    text: r.text.slice(0, 300),
  });
}
process.stdout.write(JSON.stringify(out));
`;

const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
  cwd: process.cwd(),
  env: { ...process.env, MUSE_API_KEY: '' },
});

let out = '';
let err = '';
child.stdout.on('data', (d) => (out += d));
child.stderr.on('data', (d) => (err += d));
child.on('close', (code) => {
  if (code !== 0) {
    console.error('✗ api check: the built function failed to boot.');
    console.error(err.trim() || `exit ${code}`);
    process.exit(1);
  }
  let rows;
  try {
    rows = JSON.parse(out);
  } catch {
    console.error('✗ api check: the function answered something that is not our JSON.');
    console.error(out || err);
    process.exit(1);
  }
  let failed = false;
  for (const row of rows) {
    const ok = row.status === 200 && row.type.includes('json') && row.isJson;
    console.log(
      `${ok ? '·' : '✗'} ${row.route} → ${row.status} ${row.type.includes('json') ? 'json' : 'NOT json'}`,
    );
    if (!ok) {
      failed = true;
      console.log(`  body: ${row.text}`);
    }
  }
  if (failed) {
    console.error('✗ api check: a route did not answer JSON with a status.');
    process.exit(1);
  }
  console.log(`✓ api: the built function boots and answers (${rows.length} routes)`);
});
