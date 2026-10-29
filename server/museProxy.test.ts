import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { handleMuse, resetHouseState, type MuseEnv } from './museProxy';
import { resetBudget } from './museBudget';

/**
 * The proxy is tested through real HTTP against a fake upstream, because the
 * things that break here are transport things: status codes, SSE framing,
 * header passthrough, and which key paid.
 */

interface UpstreamState {
  status: number;
  body: string;
  contentType: string;
  calls: Array<{ key: string; body: Record<string, unknown> }>;
  /** Accept the request and never answer — a hung upstream. */
  hang: boolean;
}

const upstream: UpstreamState = {
  status: 200,
  body: '',
  contentType: 'application/json',
  calls: [],
  hang: false,
};
let upServer: Server;
let proxyServer: Server;
let baseUrl = '';
let env: MuseEnv = {};

function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function urlOf(server: Server): string {
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

beforeAll(async () => {
  upServer = await listen((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: Record<string, unknown> = {};
      try {
        body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        body = { raw };
      }
      upstream.calls.push({ key: String(req.headers.authorization || ''), body });
      if (upstream.hang) return; // never answer
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', upstream.contentType);
      res.end(upstream.body);
    });
  });

  proxyServer = await listen((req, res) => {
    void handleMuse(req, res, env);
  });
  baseUrl = urlOf(proxyServer);
});

afterAll(async () => {
  await new Promise<void>((resolve) => upServer.close(() => resolve()));
  await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
});

const SSE_OK = [
  'data: {"id":"x","model":"muse-spark-1.3","choices":[{"delta":{"content":"hello"},"index":0}]}',
  '',
  'data: {"id":"x","model":"muse-spark-1.3","choices":[{"delta":{},"finish_reason":"stop","index":0}],"usage":{"prompt_tokens":1000,"completion_tokens":500,"prompt_tokens_details":{"cached_tokens":200}}}',
  '',
  'data: [DONE]',
  '',
].join('\n');

beforeEach(() => {
  upstream.status = 200;
  upstream.body = SSE_OK;
  upstream.contentType = 'text/event-stream';
  upstream.calls = [];
  upstream.hang = false;
  resetHouseState();
  resetBudget(null);
  env = {
    MUSE_BASE_URL: `${urlOf(upServer)}/v1`,
    MUSE_CODE_MODEL: 'muse-spark-1.3',
  };
});

async function status(headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}/api/muse/status`, { headers });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function chat(headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}/api/muse/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

describe('key resolution', () => {
  it('reports absent when the server has no house key', async () => {
    const { status: code, json } = await status();
    expect(code).toBe(200);
    expect(json.houseKey).toBe('absent');
    expect(json.configured).toBe(false);
    expect(json.source).toBe('none');
  });

  it('pings the house key once and reports ok', async () => {
    env.MUSE_API_KEY = 'house-key';
    upstream.body = '{"ok":true}';
    upstream.contentType = 'application/json';
    const { json } = await status();
    expect(json.houseKey).toBe('ok');
    expect(json.configured).toBe(true);
    expect(json.source).toBe('house');
    expect(upstream.calls[0].key).toBe('Bearer house-key');
  });

  it('caches the probe for a minute instead of pinging every request', async () => {
    env.MUSE_API_KEY = 'house-key';
    upstream.body = '{"ok":true}';
    upstream.contentType = 'application/json';
    await status();
    const afterFirst = upstream.calls.length;
    await status();
    await status();
    expect(upstream.calls.length).toBe(afterFirst);
  });

  it('names a rejected key "rejected", not "out of budget"', async () => {
    env.MUSE_API_KEY = 'dead-key';
    upstream.status = 401;
    upstream.body = '{"error":"invalid api key"}';
    const { json } = await status();
    expect(json.houseKey).toBe('rejected');
    expect(json.configured).toBe(false);
    expect(String(json.houseKeyDetail)).toContain('invalid api key');
  });

  it('distinguishes a spent key (402) from a revoked one (403)', async () => {
    env.MUSE_API_KEY = 'spent-key';
    upstream.status = 402;
    upstream.body = '{"error":"insufficient_quota"}';
    expect((await status()).json.houseKey).toBe('exhausted');

    resetHouseState();
    env.MUSE_API_KEY = 'revoked-key';
    upstream.status = 403;
    upstream.body = '{"error":"forbidden"}';
    expect((await status()).json.houseKey).toBe('rejected');
  });

  it('distinguishes rate limiting (429) from both', async () => {
    env.MUSE_API_KEY = 'busy-key';
    upstream.status = 429;
    upstream.body = '{"error":"slow down"}';
    const { json } = await status();
    expect(json.houseKey).toBe('rate_limited');
    expect(json.configured).toBe(false);
  });

  it('keeps a broken network from being reported as a working key', async () => {
    env.MUSE_API_KEY = 'house-key';
    // A port nothing listens on: the key is present, Meta is unreachable.
    env.MUSE_BASE_URL = 'http://127.0.0.1:1/v1';
    const { json } = await status();
    // Present but unproven — not "ok", and usable so the real call can speak.
    expect(json.houseKey).toBe('unverified');
    expect(json.configured).toBe(true);
    expect(String(json.houseKeyDetail)).toMatch(/could not reach/i);
  });

  it('a user key makes the request usable even with no house key', async () => {
    const { json } = await status({ 'x-muse-key': 'user-key' });
    expect(json.source).toBe('user');
    expect(json.configured).toBe(true);
  });
});

describe('house key failure is typed, user key failure is verbatim', () => {
  it('turns a rejected house key into a typed 402 that names rejection', async () => {
    env.MUSE_API_KEY = 'dead-key';
    upstream.status = 401;
    upstream.body = '{"error":"invalid api key"}';
    const res = await chat();
    expect(res.status).toBe(402);
    const body = JSON.parse(res.text) as Record<string, unknown>;
    expect(body.error).toBe('HOUSE_KEY_REJECTED');
    expect(body.status).toBe(401);
    expect(String(body.detail)).toMatch(/your own key will work/i);
  });

  it('keeps a genuinely spent house key as HOUSE_KEY_EXHAUSTED', async () => {
    env.MUSE_API_KEY = 'spent-key';
    upstream.status = 402;
    upstream.body = '{"error":"insufficient_quota"}';
    const res = await chat();
    expect(res.status).toBe(402);
    const body = JSON.parse(res.text) as Record<string, unknown>;
    expect(body.error).toBe('HOUSE_KEY_EXHAUSTED');
    expect(String(body.detail)).toMatch(/out of budget/i);
  });

  it('turns a rate-limited house key into its own typed 402', async () => {
    env.MUSE_API_KEY = 'busy-key';
    upstream.status = 429;
    upstream.body = '{"error":"quota"}';
    const res = await chat();
    expect(res.status).toBe(402);
    const body = JSON.parse(res.text) as {
      error: string;
      detail: string;
      houseKey: string;
    };
    expect(body.error).toBe('HOUSE_KEY_RATE_LIMITED');
    expect(body.houseKey).toBe('rate_limited');
    expect(body.detail).toMatch(/rate-limiting/i);
  });

  it('never calls a rejected house key "out of budget"', async () => {
    env.MUSE_API_KEY = 'dead-key';
    upstream.status = 401;
    upstream.body = '{"error":"invalid api key"}';
    const res = await chat();
    expect(res.status).toBe(402);
    const body = JSON.parse(res.text) as { error: string; detail: string };
    expect(body.error).toBe('HOUSE_KEY_REJECTED');
    expect(body.detail).toMatch(/rejected/i);
    expect(body.detail).not.toMatch(/out of budget/i);
  });

  it('passes a user key failure through with its own status and text', async () => {
    env.MUSE_API_KEY = 'house-key';
    upstream.status = 401;
    upstream.body = '{"error":"invalid api key for THIS user"}';
    const res = await chat({ 'x-muse-key': 'bad-user-key' });
    expect(res.status).toBe(401);
    const body = JSON.parse(res.text) as Record<string, unknown>;
    expect(body.error).toBe('unauthorized');
    expect(String(body.detail)).toContain('THIS user');
    expect(body.error).not.toBe('HOUSE_KEY_EXHAUSTED');
  });

  it('prefers the user key over the house key when both exist', async () => {
    env.MUSE_API_KEY = 'house-key';
    await chat({ 'x-muse-key': 'user-key' });
    expect(upstream.calls[0].key).toBe('Bearer user-key');
  });
});

describe('streaming and spend', () => {
  it('pipes SSE through unchanged', async () => {
    env.MUSE_API_KEY = 'house-key';
    const res = await chat();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.text).toContain('hello');
    expect(res.text).toContain('[DONE]');
  });

  it('charges the ledger from the SSE usage frame', async () => {
    env.MUSE_API_KEY = 'house-key';
    env.MUSE_DAILY_CAP = '10';
    await chat();
    const { json } = await status();
    const budgetState = json.budget as { spentUsd: number; capUsd: number };
    // 800 fresh in @ $1.25/M + 200 cached @ 10% + 500 out @ $4.25/M
    expect(budgetState.spentUsd).toBeCloseTo(0.0033, 3);
    expect(budgetState.capUsd).toBe(10);
  });

  it('hard-stops the house key at the cap with BUDGET_EXHAUSTED', async () => {
    env.MUSE_API_KEY = 'house-key';
    env.MUSE_DAILY_CAP = '0.001';
    await chat(); // 0.0033 spent > 0.001 cap
    const second = await chat();
    expect(second.status).toBe(402);
    expect((JSON.parse(second.text) as { error: string }).error).toBe('BUDGET_EXHAUSTED');
    expect(upstream.calls.length).toBe(1);
  });

  it('never caps a visitor spending their own money', async () => {
    env.MUSE_API_KEY = 'house-key';
    env.MUSE_DAILY_CAP = '0.001';
    await chat({ 'x-muse-key': 'user-key' });
    await chat({ 'x-muse-key': 'user-key' });
    await chat({ 'x-muse-key': 'user-key' });
    expect(upstream.calls.length).toBe(3);
  });
});

describe('no key at all', () => {
  it('answers 503 no_key so the client can ask for one', async () => {
    const res = await chat();
    expect(res.status).toBe(503);
    expect((JSON.parse(res.text) as { error: string }).error).toBe('no_key');
  });
});

describe('POST /keytest proves a key without spending a turn', () => {
  async function keytest(
    body: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    const res = await fetch(`${baseUrl}/api/muse/keytest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }

  it('reports a working key with what it actually sent', async () => {
    upstream.status = 200;
    upstream.body = '{"ok":true}';
    upstream.contentType = 'application/json';
    const { json } = await keytest({ key: 'good-key' });
    expect(json.ok).toBe(true);
    expect(json.status).toBe(200);
    expect(json.source).toBe('user');
    expect(upstream.calls[0].key).toBe('Bearer good-key');
    // One token, not a real turn.
    expect(upstream.calls[0].body.max_tokens).toBe(1);
  });

  it("returns Meta's own words when the key is refused", async () => {
    upstream.status = 401;
    upstream.body = '{"error":{"message":"Incorrect API key provided"}}';
    upstream.contentType = 'application/json';
    const { json } = await keytest({ key: 'typo-key' });
    expect(json.ok).toBe(false);
    expect(json.status).toBe(401);
    expect(json.state).toBe('rejected');
    expect(String(json.detail)).toContain('Incorrect API key provided');
  });

  it('tells a spent key (402) apart from a bad one (401)', async () => {
    upstream.status = 402;
    upstream.body = '{"error":"insufficient_quota"}';
    upstream.contentType = 'application/json';
    const { json } = await keytest({ key: 'broke-key' });
    expect(json.state).toBe('exhausted');
  });

  it('says there is nothing to test when no key exists anywhere', async () => {
    const { json } = await keytest({});
    expect(json.ok).toBe(false);
    expect(String(json.detail)).toMatch(/no key to test/i);
  });

  it('a failed test of the SERVER key updates /status, so the UI cannot lie', async () => {
    env.MUSE_API_KEY = 'dead-house-key';
    upstream.status = 403;
    upstream.body = '{"error":"forbidden"}';
    upstream.contentType = 'application/json';
    await keytest({});
    const { json } = await status();
    expect(json.houseKey).toBe('rejected');
    expect(String(json.houseKeyDetail)).toContain('forbidden');
  });
});

describe('the boot path cannot be held hostage', () => {
  it('/health answers without a key and without touching Meta', async () => {
    const res = await fetch(`${baseUrl}/api/muse/health`);
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.hasHouseKey).toBe(false);
    // No upstream call: a liveness check must not spend anything.
    expect(upstream.calls.length).toBe(0);
  });

  it('/health never reveals the key, only whether one exists', async () => {
    env.MUSE_API_KEY = 'super-secret-house-key';
    const res = await fetch(`${baseUrl}/api/muse/health`);
    const text = await res.text();
    expect(text).toContain('"hasHouseKey":true');
    expect(text).not.toContain('super-secret-house-key');
  });

  it('/status answers honestly when Meta accepts the request and never replies', async () => {
    env.MUSE_API_KEY = 'house-key';
    upstream.hang = true;
    const started = Date.now();
    const { status: code, json } = await status();
    const elapsed = Date.now() - started;
    expect(code).toBe(200);
    // The probe gives up on its own instead of being killed by the platform.
    expect(elapsed).toBeLessThan(6000);
    expect(json.houseKey).toBe('unverified');
    expect(String(json.houseKeyDetail)).toMatch(/did not answer/i);
  }, 12000);
});
