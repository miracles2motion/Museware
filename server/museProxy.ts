/**
 * The one and only muse gate. Dev runs this as Vite middleware
 * (vite.config.ts); production runs the same function as a serverless
 * handler (api/muse/[...path].ts).
 *
 * Key resolution is per request, in this order:
 *   1. the user's key  (x-muse-key header — sessionStorage in the tab)
 *   2. the house key   (MUSE_API_KEY env, only ever on the server)
 *   3. none            (typed 503, the client shows the key card)
 *
 * Two things this file refuses to do: leak a key to the browser, and pretend
 * a dead house key is a working muse. When the house key answers 401/402/429
 * the client gets a TYPED 402 HOUSE_KEY_EXHAUSTED and asks the visitor for
 * their own key — it never silently swaps in the demo engine.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { budget, usageFromSseLine, type UsageLike } from './museBudget';

export interface MuseEnv {
  MUSE_API_KEY?: string;
  MUSE_BASE_URL?: string;
  MUSE_CODE_MODEL?: string;
  MUSE_CHAT_MODEL?: string;
  MUSE_ARCHITECT_MODEL?: string;
  MUSE_CONTRIBUTOR_MODEL?: string;
  MUSE_IMAGE_MODEL?: string;
  MUSE_BUILD_IMAGES?: string;
  MUSE_SAM_MODEL?: string;
  MUSE_VOICE_MODEL?: string;
  MUSE_REASONING?: string;
  /** Soft 80% warn + hard stop for the HOUSE key only, USD per UTC day. */
  MUSE_DAILY_CAP?: string;
  /** Set to 1 to run the real models end-to-end (CI never sets it). */
  MUSE_LIVE?: string;
}

const DEFAULTS = {
  baseUrl: 'https://api.meta.ai',
  code: 'muse-spark-1.3',
  chat: 'muse-spark-1.3',
  architect: 'muse-wonder-1.0',
  contributor: 'muse-spark-1.3-contributor',
  image: 'muse-image-1.0',
  sam: 'sam-3.1',
  voice: 'muse-voice-transcribe-1.0',
};

function envOf(env: MuseEnv) {
  return {
    baseUrl: (env.MUSE_BASE_URL || DEFAULTS.baseUrl).replace(/\/+$/, ''),
    code: env.MUSE_CODE_MODEL || DEFAULTS.code,
    chat: env.MUSE_CHAT_MODEL || DEFAULTS.chat,
    architect: env.MUSE_ARCHITECT_MODEL || DEFAULTS.architect,
    contributor: env.MUSE_CONTRIBUTOR_MODEL || DEFAULTS.contributor,
    image: env.MUSE_IMAGE_MODEL || DEFAULTS.image,
    sam: env.MUSE_SAM_MODEL || DEFAULTS.sam,
    voice: env.MUSE_VOICE_MODEL || DEFAULTS.voice,
    reasoning: env.MUSE_REASONING === '1',
    live: env.MUSE_LIVE === '1',
  };
}

/** `https://api.meta.ai` and `https://api.meta.ai/v1` both work; never double up. */
function apiRoot(baseUrl: string) {
  return /\/v\d+(\.\d+)?$/.test(baseUrl) ? baseUrl : `${baseUrl}/v1`;
}

/**
 * Cap how long a check may take. `/status` runs on every boot, so a hung
 * upstream used to hold the request until the platform killed it — which the
 * browser can only report as "the proxy answered 500".
 */
function withDeadline(
  signal: AbortSignal | undefined,
  ms: number,
): { signal: AbortSignal; done: () => void; timedOut: () => boolean } {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort(new Error(`no answer within ${ms}ms`));
  }, ms);
  timer.unref?.();
  const onAbort = () => ctrl.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    timedOut: () => timedOut,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

/** The probe is a health check, not a model call: it must not take 60 s. */
const PROBE_DEADLINE_MS = 4000;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(text);
}

function readBody(req: IncomingMessage, limitBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson<T>(req: IncomingMessage, limit = 8 * 1024 * 1024): Promise<T> {
  const buf = await readBody(req, limit);
  if (!buf.length) return {} as T;
  return JSON.parse(buf.toString('utf8')) as T;
}

function sessionKey(req: IncomingMessage): string {
  const raw = req.headers['x-muse-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value.trim() : '';
}

type KeySource = 'user' | 'house' | 'none';

function resolveKey(
  req: IncomingMessage,
  env: MuseEnv,
): { key: string; source: KeySource } {
  const user = sessionKey(req);
  if (user) return { key: user, source: 'user' };
  const house = (env.MUSE_API_KEY || '').trim();
  if (house) return { key: house, source: 'house' };
  return { key: '', source: 'none' };
}

// ---------------------------------------------------------------- house key

/**
 * Why the server's own key is (not) usable. These are FOUR different problems
 * and the visitor sees a different sentence for each, because "out of budget"
 * printed over a typo'd key is exactly the kind of lie this product exists not
 * to tell:
 *
 *   ok            Meta accepted it
 *   absent        MUSE_API_KEY is not set for THIS deployment (redeploy)
 *   unverified    the key is set but Meta could not be reached to confirm it
 *   exhausted     accepted auth, no money left (402)
 *   rejected      Meta refused the key itself (401 / 403)
 *   rate_limited  accepted, but throttled right now (429)
 */
export type HouseKeyState =
  'ok' | 'absent' | 'unverified' | 'exhausted' | 'rejected' | 'rate_limited';

/**
 * Which upstream failures actually mean "the KEY is the problem"?
 *
 * Only these four. Everything else — 400 (the request was malformed), 404 (the
 * model name is unknown), 422, 5xx — says something about the REQUEST or about
 * Meta, not about the key. Mapping those to 'rejected' told a visitor with a
 * perfectly good key that it was wrong: the status probe passed, then the first
 * chat call 400'd on a payload detail and the rail accused the key.
 */
export function isKeyFault(status: number): boolean {
  return status === 401 || status === 402 || status === 403 || status === 429;
}

/** The three ways a key can fail without being absent. */
export type KeyFault = 'rejected' | 'exhausted' | 'rate_limited';

/** Status code → the honest name for it. Returns null when the key is blameless. */
export function houseStateFromStatus(status: number): KeyFault | null {
  if (status === 402) return 'exhausted';
  if (status === 401 || status === 403) return 'rejected';
  if (status === 429) return 'rate_limited';
  return null;
}

interface HouseProbe {
  state: HouseKeyState;
  at: number;
  detail?: string;
  status?: number;
}

let houseProbe: HouseProbe = { state: 'absent', at: 0 };
const HOUSE_TTL_MS = 60_000;

/**
 * One cheap ping per minute, cached across requests. The client needs to know
 * whether the house key is alive WITHOUT spending a turn to find out.
 */
export async function houseKeyState(
  env: MuseEnv,
  opts: { force?: boolean; signal?: AbortSignal } = {},
): Promise<HouseProbe> {
  const cfg = envOf(env);
  const house = (env.MUSE_API_KEY || '').trim();
  if (!house) {
    houseProbe = { state: 'absent', at: Date.now() };
    return houseProbe;
  }
  const fresh = Date.now() - houseProbe.at < HOUSE_TTL_MS;
  if (!opts.force && fresh && houseProbe.state !== 'absent') return houseProbe;

  const guard = withDeadline(opts.signal, PROBE_DEADLINE_MS);
  try {
    const r = await fetch(`${apiRoot(cfg.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${house}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: cfg.code,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: guard.signal,
    });
    if (r.ok) {
      await r.text();
      houseProbe = { state: 'ok', at: Date.now(), status: r.status };
    } else {
      const detail = (await r.text().catch(() => '')).slice(0, 300);
      const state = houseStateFromStatus(r.status);
      houseProbe = state
        ? {
            state,
            at: Date.now(),
            status: r.status,
            detail: detail || `status ${r.status}`,
          }
        : {
            // 400/404/5xx from the ping says nothing about the key. Do not
            // turn it into a verdict — say the check itself did not land.
            state: 'unverified',
            at: Date.now(),
            status: r.status,
            detail:
              `the key check got HTTP ${r.status} instead of a verdict, so the key ` +
              `could not be confirmed${detail ? `: ${detail}` : ''}`,
          };
    }
  } catch (err) {
    // A network hiccup is not a working key and not a dead one. Say the truth:
    // the key is present but unverified, and let the real call report its own
    // failure rather than blocking the visitor on our guess.
    const previous = houseProbe.state;
    // A rejected key is a claim about the key's identity, and a network failure
    // is no evidence for it: keep only the states that are facts about the
    // account (spent, throttled), and let rejection be re-proven each time.
    const keep = previous === 'exhausted' || previous === 'rate_limited';
    houseProbe = {
      state: keep ? previous : 'unverified',
      at: Date.now(),
      detail: guard.timedOut()
        ? `Meta did not answer within ${PROBE_DEADLINE_MS / 1000}s, so the key could not be checked`
        : `could not reach Meta from the server to check the key: ${
            err instanceof Error ? err.message : String(err)
          }`,
      status: guard.timedOut() ? undefined : houseProbe.status,
    };
  } finally {
    guard.done();
  }
  return houseProbe;
}

export function markHouseState(
  state: HouseKeyState,
  detail: string,
  status?: number,
): void {
  houseProbe = { state, at: Date.now(), detail, status };
}

/** Kept for the older call sites: a dead key defaults to exhausted. */
export function markHouseExhausted(detail: string, status?: number): void {
  markHouseState((status && houseStateFromStatus(status)) || 'exhausted', detail, status);
}

/** Tests only. */
export function resetHouseState(): void {
  houseProbe = { state: 'absent', at: 0 };
}

// ---------------------------------------------------------------- forwarding

async function forward(
  url: string,
  key: string,
  body: unknown,
  init: { stream?: boolean; signal?: AbortSignal } = {},
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      Accept: init.stream ? 'text/event-stream' : 'application/json',
    },
    body: JSON.stringify(body),
    signal: init.signal,
  });
}

/** True when the house key cannot be used right now — the key card applies. */
function isDeadKey(status: number): boolean {
  return isKeyFault(status);
}

/**
 * Upstream failures. A dead HOUSE key is typed for the client (so it can ask
 * for a personal key); a dead USER key streams its real error verbatim, because
 * that failure is the visitor's own and they deserve the actual message.
 */
const HOUSE_FAILURE: Record<
  'exhausted' | 'rejected' | 'rate_limited',
  { error: string; detail: string }
> = {
  exhausted: {
    error: 'HOUSE_KEY_EXHAUSTED',
    detail:
      'The shared key for this demo is out of budget or credit. Add your own Meta API key to keep building.',
  },
  rejected: {
    error: 'HOUSE_KEY_REJECTED',
    detail:
      'Meta rejected the shared key this deployment is configured with — it is wrong, revoked, or was never valid. Your own key will work; the server key needs replacing.',
  },
  rate_limited: {
    error: 'HOUSE_KEY_RATE_LIMITED',
    detail:
      'Meta is rate-limiting the shared key right now. Your own key is not throttled by other visitors.',
  },
};

async function upstreamError(
  res: ServerResponse,
  r: Response,
  source: KeySource,
): Promise<void> {
  const detail = await r.text().catch(() => '');
  const houseState = houseStateFromStatus(r.status);
  if (source === 'house' && houseState) {
    markHouseState(houseState, detail.slice(0, 300) || `status ${r.status}`, r.status);
    const failure = HOUSE_FAILURE[houseState];
    // Always 402 downstream: the client's key card is the fix for all three,
    // and the typed `error` carries WHY so the sentence can be true. Meta's own
    // words ride in `upstream` and are shown, not paraphrased.
    return sendJson(res, 402, {
      error: failure.error,
      status: r.status,
      houseKey: houseState,
      detail: failure.detail,
      upstream: detail.slice(0, 400),
    });
  }
  // Not a key fault: the request or Meta itself is the problem. Pass the real
  // status and Meta's own sentence through — never dress it up as a key issue.
  sendJson(res, r.status, {
    error:
      r.status === 429 ? 'rate_limited' : r.status === 401 ? 'unauthorized' : 'upstream',
    status: r.status,
    detail: detail.slice(0, 800),
    metaSaid: detail.slice(0, 800),
  });
}

/** Pipe an SSE / JSON response through without buffering, charging the ledger. */
async function pipeThrough(
  res: ServerResponse,
  r: Response,
  charge: ((usage: UsageLike, model?: string) => void) | null,
): Promise<void> {
  res.statusCode = r.status;
  res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  if (r.headers.get('x-request-id')) {
    res.setHeader('x-request-id', r.headers.get('x-request-id')!);
  }
  const state = budgetState();
  if (state.warn) res.setHeader('x-muse-budget', 'warn');
  if (!r.body) {
    res.end();
    return;
  }

  // A small line sniffer: the SSE usage frame is what the ledger needs, and we
  // must not buffer the stream to find it.
  let tail = '';
  let lastUsage: UsageLike | null = null;
  let lastModel: string | undefined;
  const sniff = (chunk: string) => {
    if (!charge) return;
    const text = tail + chunk;
    const lines = text.split('\n');
    tail = lines.pop()?.slice(-2000) || '';
    for (const line of lines) {
      if (!line.includes('usage')) continue;
      const hit = usageFromSseLine(line);
      if (hit) {
        lastUsage = hit.usage;
        lastModel = hit.model;
      }
    }
  };

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        if (charge) sniff(decoder.decode(value, { stream: true }));
        res.write(Buffer.from(value));
      }
      if (res.writableEnded) break;
    }
  } catch {
    /* client went away — nothing to report */
  } finally {
    if (charge) {
      const drained = tail;
      if (drained.includes('usage')) {
        const hit = usageFromSseLine(drained);
        if (hit) {
          lastUsage = hit.usage;
          lastModel = hit.model;
        }
      }
      if (lastUsage) charge(lastUsage as UsageLike, lastModel);
    }
    res.end();
  }
}

function budgetState() {
  return budget().state;
}

const cleanBase = (v: unknown) =>
  typeof v === 'string' && /^(data:image\/(png|jpe?g|webp);base64,|https:\/\/)/.test(v)
    ? v
    : '';

export async function handleMuse(
  req: IncomingMessage,
  res: ServerResponse,
  env: MuseEnv,
): Promise<void> {
  const cfg = envOf(env);
  const [rawPath, rawQuery = ''] = (req.url || '/').split('?');
  const path = rawPath.replace(/\/+$/, '') || '/';
  const route = path.replace(/^\/api\/muse/, '') || '/status';
  // `?force=1` re-checks the house key instead of trusting a cached verdict.
  const force = /(?:^|&)force=1(?:&|$)/.test(rawQuery);
  const { key, source } = resolveKey(req, env);
  const abort = new AbortController();
  // Abort only when the CLIENT hung up mid-flight. `req` 'close' fires as soon
  // as the body has been read, which would cancel every request we make.
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  const ledger = budget(env.MUSE_DAILY_CAP);
  // Only the house key is capped: a visitor's own key is their own money.
  const chargeHouse =
    source === 'house'
      ? (usage: UsageLike, model?: string) => {
          ledger.charge(model || cfg.code, usage);
        }
      : null;

  try {
    // The cheapest possible liveness check: no key, no upstream call, no
    // secrets — only booleans. When /status is suspect, this says whether the
    // function is deployed and running at all.
    if (route === '/health' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        route,
        runtime: typeof process !== 'undefined' ? process.version : 'unknown',
        uptimeMs:
          typeof process !== 'undefined' ? Math.round(process.uptime() * 1000) : undefined,
        hasHouseKey: Boolean((env.MUSE_API_KEY || '').trim()),
        keySource: source,
        baseUrl: cfg.baseUrl,
      });
    }

    if (route === '/status' && req.method === 'GET') {
      // A probe may not be allowed to break the boot path: if it throws for a
      // reason we did not foresee, the status still answers, honestly.
      let house: HouseProbe;
      try {
        house = await houseKeyState(env, { signal: abort.signal, force });
      } catch (err) {
        house = {
          state: 'unverified',
          at: Date.now(),
          detail: `the key check itself failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        };
      }
      const usable =
        source === 'user' ||
        (source === 'house' && (house.state === 'ok' || house.state === 'unverified'));
      return sendJson(res, 200, {
        configured: usable,
        source,
        houseKey: house.state,
        houseKeyDetail: house.detail || null,
        budget: ledger.state,
        live: cfg.live,
        buildImages: Math.max(
          0,
          Math.min(
            30,
            Number.isFinite(Number(env.MUSE_BUILD_IMAGES)) &&
              env.MUSE_BUILD_IMAGES !== undefined &&
              env.MUSE_BUILD_IMAGES.trim() !== ''
              ? Math.floor(Number(env.MUSE_BUILD_IMAGES))
              : 6,
          ),
        ),
        baseUrl: cfg.baseUrl,
        reasoning: cfg.reasoning,
        models: {
          builder: { id: cfg.code, role: 'Builder', effort: 'high' },
          architect: { id: cfg.architect, role: 'Architect', effort: 'max' },
          chat: { id: cfg.chat, role: 'Chat', effort: 'low' },
          contributor: { id: cfg.contributor, role: 'Dev budget', effort: 'xhigh' },
          image: { id: cfg.image, role: 'Image', effort: null },
          sam: { id: cfg.sam, role: 'Screenshot→Canvas', effort: null },
          voice: { id: cfg.voice, role: 'Voice', effort: null },
        },
      });
    }

    // Test a key WITHOUT spending a turn. The Settings "Test this key" button
    // and the key card both use it, so a visitor can tell a typo from a budget
    // problem before they blame themselves.
    if (route === '/keytest' && req.method === 'POST') {
      const body = await readJson<{ key?: string; model?: string }>(req);
      const pasted = (body.key || '').trim();
      const candidate = pasted || key;
      // Report where the key under test came from, not where a chat would get it.
      const candidateSource: KeySource = pasted ? 'user' : source;
      if (!candidate) {
        return sendJson(res, 200, {
          ok: false,
          status: 0,
          source: candidateSource,
          detail:
            'No key to test: this deployment has none, and none was sent with the request.',
        });
      }
      const model = body.model || cfg.chat;
      const started = Date.now();
      try {
        const r = await fetch(`${apiRoot(cfg.baseUrl)}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${candidate}`,
            Accept: 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
            stream: false,
          }),
          signal: abort.signal,
        });
        const ms = Date.now() - started;
        const text = await r.text().catch(() => '');
        if (r.ok) {
          return sendJson(res, 200, {
            ok: true,
            status: r.status,
            source: candidateSource,
            model,
            ms,
          });
        }
        // A key that was just proven bad is bad news the UI should keep. A
        // non-key failure (400, 404, 5xx) proves nothing about the key.
        const state = houseStateFromStatus(r.status);
        if (candidateSource === 'house' && state) {
          markHouseState(state, text.slice(0, 300) || `status ${r.status}`, r.status);
        }
        return sendJson(res, 200, {
          ok: false,
          status: r.status,
          state,
          source: candidateSource,
          model,
          ms,
          detail: text.slice(0, 600) || `Meta answered ${r.status} with no body.`,
        });
      } catch (err) {
        return sendJson(res, 200, {
          ok: false,
          status: 0,
          source: candidateSource,
          model,
          ms: Date.now() - started,
          detail:
            err instanceof Error
              ? `The server could not reach Meta at all: ${err.message}`
              : String(err),
        });
      }
    }

    if (!key) {
      return sendJson(res, 503, {
        error: 'no_key',
        detail:
          'No muse key on this server. Add MUSE_API_KEY to .env, or paste your own key in Settings.',
      });
    }

    if (source === 'house' && !ledger.maySpend()) {
      return sendJson(res, 402, {
        error: 'BUDGET_EXHAUSTED',
        status: 402,
        detail: `The shared key hit its daily cap ($${ledger.state.capUsd}). Add your own key to keep building.`,
        budget: ledger.state,
      });
    }

    if (route === '/chat' && req.method === 'POST') {
      const body = await readJson<Record<string, unknown>>(req);
      const model = typeof body.model === 'string' && body.model ? body.model : cfg.code;
      const effort = typeof body.effort === 'string' ? body.effort : '';
      const payload: Record<string, unknown> = {
        model,
        messages: body.messages,
        tools: body.tools,
        tool_choice: body.tools ? 'auto' : undefined,
        temperature: body.temperature ?? 0.4,
        max_tokens: body.max_tokens ?? 4096,
        stream: true,
        stream_options: { include_usage: true },
      };
      if (effort && cfg.reasoning) payload.reasoning_effort = effort;
      if (body.include_reasoning && cfg.reasoning)
        payload.include = ['reasoning.encrypted_content'];
      if (Array.isArray(body.include) && cfg.reasoning) payload.include = body.include;
      const r = await forward(`${apiRoot(cfg.baseUrl)}/chat/completions`, key, payload, {
        stream: true,
        signal: abort.signal,
      });
      if (!r.ok) return await upstreamError(res, r, source);
      return await pipeThrough(res, r, chargeHouse);
    }

    if (route === '/probe' && req.method === 'POST') {
      const body = await readJson<{ model?: string }>(req);
      const model = body.model || cfg.code;
      const started = Date.now();
      try {
        const r = await forward(
          `${apiRoot(cfg.baseUrl)}/chat/completions`,
          key,
          {
            model,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
            stream: false,
          },
          { signal: abort.signal },
        );
        const ms = Date.now() - started;
        if (!r.ok) {
          const detail = (await r.text()).slice(0, 400);
          if (source === 'house' && isDeadKey(r.status)) {
            markHouseExhausted(detail, r.status);
          }
          return sendJson(res, 200, { model, ok: false, ms, status: r.status, detail });
        }
        await r.text();
        return sendJson(res, 200, { model, ok: true, ms });
      } catch (err) {
        return sendJson(res, 200, {
          model,
          ok: false,
          ms: Date.now() - started,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (route === '/images' && req.method === 'POST') {
      const body = await readJson<{ prompt?: string; size?: string }>(req);
      const r = await forward(
        `${apiRoot(cfg.baseUrl)}/images/generations`,
        key,
        {
          model: cfg.image,
          prompt: String(body.prompt || '').slice(0, 1200),
          size: body.size || '1024x1024',
          n: 1,
          response_format: 'b64_json',
        },
        { signal: abort.signal },
      );
      if (!r.ok) return await upstreamError(res, r, source);
      return await pipeThrough(res, r, chargeHouse);
    }

    if (route === '/segment' && req.method === 'POST') {
      const body = await readJson<{ image?: string; prompt?: string }>(
        req,
        12 * 1024 * 1024,
      );
      const image = cleanBase(body.image);
      if (!image) return sendJson(res, 400, { error: 'bad_image' });
      const prompt = String(
        body.prompt ||
          'button, input field, label, icon, image, card, navigation bar, list row, tab, toggle, checkbox, text',
      );
      const r = await forward(
        `${apiRoot(cfg.baseUrl)}/responses`,
        key,
        {
          model: cfg.sam,
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: prompt },
                { type: 'input_image', image_url: image },
              ],
            },
          ],
          max_output_tokens: 4096,
        },
        { signal: abort.signal },
      );
      if (!r.ok) return await upstreamError(res, r, source);
      return await pipeThrough(res, r, chargeHouse);
    }

    if (route === '/transcribe' && req.method === 'POST') {
      const body = await readJson<{ audio?: string; mime?: string }>(req, 14 * 1024 * 1024);
      if (!body.audio) return sendJson(res, 400, { error: 'no_audio' });
      const bytes = Buffer.from(body.audio, 'base64');
      const form = new FormData();
      form.append(
        'file',
        new Blob([bytes], { type: body.mime || 'audio/webm' }),
        'speech.webm',
      );
      form.append('model', cfg.voice);
      const r = await fetch(`${apiRoot(cfg.baseUrl)}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: abort.signal,
      });
      if (!r.ok) return await upstreamError(res, r, source);
      return await pipeThrough(res, r, null);
    }

    return sendJson(res, 404, { error: 'not_found', route });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // Logged as well as returned: Vercel's runtime logs are where the stack
    // lives, and a visitor should never have to read a stack to learn that the
    // server crashed.
    console.error(`[muse] ${req.method} ${route} failed:`, err);
    if (!res.headersSent) {
      sendJson(res, 500, {
        error: 'proxy',
        route,
        detail,
        hint: 'The proxy itself failed, not your key. The Vercel runtime logs for this function hold the stack trace.',
      });
    } else {
      res.end();
    }
  }
}
