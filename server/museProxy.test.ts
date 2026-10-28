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
}

const upstream: UpstreamState = {
  status: 200,
  body: '',
  contentType: 'application/json',
  calls: [],
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

  it('reports exhausted when the house key is rejected', async () => {
    env.MUSE_API_KEY = 'dead-key';
    upstream.status = 401;
    upstream.body = '{"error":"invalid api key"}';
    const { json } = await status();
    expect(json.houseKey).toBe('exhausted');
    expect(json.configured).toBe(false);
    expect(String(json.houseKeyDetail)).toContain('invalid api key');
  });

  it('a user key makes the request usable even with no house key', async () => {
    const { json } = await status({ 'x-muse-key': 'user-key' });
    expect(json.source).toBe('user');
    expect(json.configured).toBe(true);
  });
});

describe('house key failure is typed, user key failure is verbatim', () => {
  it('turns a dead house key into 402 HOUSE_KEY_EXHAUSTED', async () => {
    env.MUSE_API_KEY = 'dead-key';
    upstream.status = 401;
    upstream.body = '{"error":"invalid api key"}';
    const res = await chat();
    expect(res.status).toBe(402);
    const body = JSON.parse(res.text) as Record<string, unknown>;
    expect(body.error).toBe('HOUSE_KEY_EXHAUSTED');
    expect(body.status).toBe(401);
    expect(String(body.detail)).toMatch(/add your own/i);
  });

  it('turns a rate-limited house key into the same typed 402', async () => {
    env.MUSE_API_KEY = 'busy-key';
    upstream.status = 429;
    upstream.body = '{"error":"quota"}';
    const res = await chat();
    expect(res.status).toBe(402);
    expect((JSON.parse(res.text) as { error: string }).error).toBe('HOUSE_KEY_EXHAUSTED');
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
