import { getSessionKey } from './sessionKey';

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
}

export interface ChatResult {
  text: string;
  toolCalls: ChatToolCall[];
  usage: Usage;
  latencyMs: number;
  model: string;
  finishReason: string;
  reasoningEncrypted?: string;
}

export interface ModelRole {
  id: string;
  role: string;
  effort: string | null;
}

/**
 * Mirror of the server's honest vocabulary. A rejected key and an empty
 * wallet are different sentences, so they are different states.
 */
export type HouseKeyState =
  | 'ok'
  | 'exhausted'
  | 'rejected'
  | 'rate_limited'
  | 'unverified'
  | 'absent';

export interface BudgetState {
  capUsd: number | null;
  spentUsd: number;
  day: string;
  warn: boolean;
  exhausted: boolean;
}

export interface ServerStatus {
  configured: boolean;
  source: 'env' | 'session' | 'none';
  /** The owner's shared key. Drives the key card without spending a turn. */
  houseKey: HouseKeyState;
  houseKeyDetail?: string | null;
  budget?: BudgetState;
  live?: boolean;
  baseUrl: string;
  reasoning: boolean;
  models: {
    builder: ModelRole;
    architect: ModelRole;
    chat: ModelRole;
    contributor: ModelRole;
    image: ModelRole;
    sam: ModelRole;
    voice: ModelRole;
  };
}

export type MuseErrorCode =
  | 'no_key'
  | 'house_key_exhausted'
  | 'house_key_rejected'
  | 'house_key_rate_limited'
  | 'rate_limited'
  | 'unauthorized'
  | 'network'
  | 'aborted'
  | 'stream'
  | 'upstream'
  | 'bad_args';

export class MuseError extends Error {
  code: MuseErrorCode;
  status?: number;
  detail?: string;

  constructor(code: MuseErrorCode, message: string, status?: number, detail?: string) {
    super(message);
    this.name = 'MuseError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/** Rate card from the matrix (§6.1), per 1M tokens. */
const PRICING: Record<string, { in: number; out: number }> = {
  'muse-spark-1.3': { in: 1.25, out: 4.25 },
  'muse-spark-1.2': { in: 1.1, out: 3.9 },
  'muse-spark-1.1': { in: 1.0, out: 3.5 },
  'muse-wonder-1.0': { in: 4.0, out: 20.0 },
  'muse-spark-1.3-contributor': { in: 0.1, out: 0.2 },
};

export function estimateCents(model: string, usage: Usage): number {
  const rate = PRICING[model] || PRICING['muse-spark-1.3'];
  const fresh = Math.max(0, usage.inputTokens - usage.cachedTokens);
  const dollars =
    (fresh / 1_000_000) * rate.in +
    (usage.cachedTokens / 1_000_000) * rate.in * 0.1 +
    (usage.outputTokens / 1_000_000) * rate.out;
  return Math.round(dollars * 10_000) / 100;
}

function headers(): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = getSessionKey();
  if (key) h['x-muse-key'] = key;
  return h;
}

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new MuseError('aborted', 'Stopped'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new MuseError('aborted', 'Stopped'));
      },
      { once: true },
    );
  });

interface Gate {
  lastStart: number;
  chain: Promise<unknown>;
}

const gate: Gate = { lastStart: 0, chain: Promise.resolve() };

/**
 * LAW 10: ≥4s between request STARTS, one in-flight request at a time.
 * Tests run the same gate with an empty floor so suites do not sleep; the shipped
 * build always uses PACE_MS.
 */
const PACE_MS = 4000;
const PACE_FLOOR = import.meta.env.MODE === 'test' ? 0 : PACE_MS;

async function pace(signal?: AbortSignal, minGapMs = PACE_FLOOR): Promise<void> {
  const previous = gate.chain;
  let release: () => void = () => undefined;
  gate.chain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  const wait = Math.max(0, gate.lastStart + minGapMs - Date.now());
  try {
    if (wait > 0) await delay(wait, signal);
  } finally {
    gate.lastStart = Date.now();
  }
  const originalRelease = release;
  return new Promise<void>((resolve) => {
    originalRelease();
    resolve();
  });
}

/**
 * Boot's one question: who is this server?
 *
 * The failure modes here are invisible if we let `res.json()` throw, and the app
 * ends up telling a visitor "you need a key" when the truth is "your deployment
 * has no serverless function". So every branch names itself.
 */
export async function fetchStatus(): Promise<ServerStatus> {
  let res: Response;
  try {
    res = await fetch('/api/muse/status', { headers: headers() });
  } catch {
    throw new MuseError(
      'network',
      'could not reach /api/muse/status — the proxy is not deployed on this domain',
    );
  }
  const type = res.headers.get('content-type') || '';
  if (!res.ok) {
    const hint =
      res.status === 404
        ? 'the API function is not deployed on this domain'
        : `the proxy answered ${res.status}`;
    throw new MuseError('upstream', `GET /api/muse/status failed: ${hint}`, res.status);
  }
  if (!type.includes('json')) {
    // A SPA rewrite sending /api/* to index.html lands here.
    throw new MuseError(
      'network',
      'the server answered /api/muse/status with HTML — /api/* is being rewritten to the app shell',
    );
  }
  return (await res.json()) as ServerStatus;
}

export async function probeModel(model: string): Promise<{
  model: string;
  ok: boolean;
  ms: number;
  status?: number;
  detail?: string;
}> {
  try {
    const res = await fetch('/api/muse/probe', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ model }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      return { model, ok: false, ms: 0, detail: body.detail || `status ${res.status}` };
    }
    return (await res.json()) as {
      model: string;
      ok: boolean;
      ms: number;
      status?: number;
      detail?: string;
    };
  } catch (err) {
    return {
      model,
      ok: false,
      ms: 0,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface KeyTest {
  ok: boolean;
  status: number;
  state?: HouseKeyState;
  source?: 'user' | 'house' | 'none';
  model?: string;
  ms?: number;
  /** Meta's own words when it refused — never paraphrased. */
  detail?: string;
}

/**
 * Prove a key before trusting it: one 1-token call through the proxy with the
 * key under test. Returns Meta's real status and body, so a typo can be told
 * apart from a budget problem instead of being guessed at.
 */
export async function testKey(key?: string): Promise<KeyTest> {
  const candidate = (key ?? '').trim() || getSessionKey();
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (candidate) h['x-muse-key'] = candidate;
  try {
    const res = await fetch('/api/muse/keytest', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ key: candidate || undefined }),
    });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        detail: `The proxy answered ${res.status} instead of a verdict — /api/muse/keytest is not deployed.`,
      };
    }
    return (await res.json()) as KeyTest;
  } catch (err) {
    return {
      ok: false,
      status: 0,
      detail:
        err instanceof Error
          ? `The request never left the browser: ${err.message}`
          : String(err),
    };
  }
}

interface SSEParseState {
  text: string;
  toolCalls: Map<number, ChatToolCall>;
  usage: Usage;
  finishReason: string;
  reasoningEncrypted?: string;
}

async function consumeStream(
  body: ReadableStream<Uint8Array>,
  state: SSEParseState,
  onText: (text: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawDone = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf('\n');
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line || line.startsWith(':')) {
        nl = buffer.indexOf('\n');
        continue;
      }
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          sawDone = true;
        } else {
          try {
            const json = JSON.parse(payload) as Record<string, unknown>;
            handleChunk(json, state, onText);
          } catch {
            /* partial or vendor comment — ignored */
          }
        }
      }
      nl = buffer.indexOf('\n');
    }
    if (sawDone) break;
  }
}

function handleChunk(
  json: Record<string, unknown>,
  state: SSEParseState,
  onText: (t: string) => void,
) {
  const choices = json.choices as
    | Array<{
        delta?: {
          content?: string;
          tool_calls?: Array<{
            index: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
          reasoning?: { encrypted_content?: string };
        };
        message?: {
          content?: string;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
        finish_reason?: string;
      }>
    | undefined;
  const usage = json.usage as
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      }
    | undefined;
  if (usage) {
    state.usage = {
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      cachedTokens: usage.prompt_tokens_details?.cached_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    };
  }
  const reasoning = json.reasoning as { encrypted_content?: string } | undefined;
  if (reasoning?.encrypted_content) state.reasoningEncrypted = reasoning.encrypted_content;
  const choice = choices?.[0];
  if (!choice) return;
  if (choice.finish_reason) state.finishReason = choice.finish_reason;
  const delta = choice.delta;
  if (delta?.content) {
    state.text += delta.content;
    onText(delta.content);
  }
  if (delta?.reasoning?.encrypted_content)
    state.reasoningEncrypted = delta.reasoning.encrypted_content;
  if (delta?.tool_calls) {
    for (const frag of delta.tool_calls) {
      const idx = typeof frag.index === 'number' ? frag.index : 0;
      const prev = state.toolCalls.get(idx) || { id: '', name: '', arguments: '' };
      state.toolCalls.set(idx, {
        id: frag.id || prev.id,
        name: frag.function?.name || prev.name,
        arguments: `${prev.arguments}${frag.function?.arguments || ''}`,
      });
    }
  }
  if (choice.message?.tool_calls) {
    choice.message.tool_calls.forEach((tc, i) => {
      state.toolCalls.set(i, {
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      });
    });
  }
  if (choice.message?.content) {
    state.text += choice.message.content;
    onText(choice.message.content);
  }
}

function parseErrorBody(raw: string): { error?: string; detail?: string } {
  try {
    const json = JSON.parse(raw) as { error?: unknown; detail?: unknown };
    return {
      error: typeof json.error === 'string' ? json.error : undefined,
      detail: typeof json.detail === 'string' ? json.detail : raw.slice(0, 400),
    };
  } catch {
    return { detail: raw.slice(0, 400) };
  }
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  tools?: unknown[];
  effort?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onText?: (text: string) => void;
  onNotice?: (notice: string) => void;
  /** Tests override the backoff ladder. */
  backoffMs?: number[];
  minGapMs?: number;
}

/**
 * One muse call. SSE tool-call accumulation by index, usage captured, aborts
 * honoured, 429/5xx backed off (2s/8s/30s, max 3) with an honest notice.
 */
export async function chatStream(opts: ChatOptions): Promise<ChatResult> {
  const started = Date.now();
  const backoff = opts.backoffMs || [2000, 8000, 30000];
  let attempt = 0;
  for (;;) {
    await pace(opts.signal, opts.minGapMs ?? PACE_FLOOR);
    const state: SSEParseState = {
      text: '',
      toolCalls: new Map(),
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 },
      finishReason: 'stop',
    };
    let res: Response;
    try {
      res = await fetch('/api/muse/chat', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          model: opts.model,
          messages: opts.messages,
          tools: opts.tools,
          effort: opts.effort,
          temperature: opts.temperature ?? 0.4,
          max_tokens: opts.maxTokens ?? 4096,
          include_reasoning: true,
        }),
        signal: opts.signal,
      });
    } catch (err) {
      if (opts.signal?.aborted) throw new MuseError('aborted', 'Stopped');
      if (attempt < 2) {
        attempt += 1;
        opts.onNotice?.(`Network hiccup — retrying in ${backoff[attempt - 1] / 1000}s.`);
        await delay(backoff[attempt - 1], opts.signal);
        continue;
      }
      throw new MuseError('network', err instanceof Error ? err.message : 'network error');
    }

    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      const info = parseErrorBody(raw);
      if (info.error === 'no_key') {
        throw new MuseError(
          'no_key',
          'No muse key on this server.',
          res.status,
          info.detail,
        );
      }
      // The shared key cannot be used. Never retry, never fall back to the demo
      // engine: ask the visitor for their own key — but keep WHICH failure it
      // was, so the card can say "rejected" instead of "out of budget".
      if (
        info.error === 'HOUSE_KEY_EXHAUSTED' ||
        info.error === 'BUDGET_EXHAUSTED' ||
        info.error === 'HOUSE_KEY_REJECTED' ||
        info.error === 'HOUSE_KEY_RATE_LIMITED'
      ) {
        const code: MuseErrorCode =
          info.error === 'HOUSE_KEY_REJECTED'
            ? 'house_key_rejected'
            : info.error === 'HOUSE_KEY_RATE_LIMITED'
              ? 'house_key_rate_limited'
              : 'house_key_exhausted';
        throw new MuseError(
          code,
          info.detail || 'The shared key cannot be used right now.',
          res.status,
          info.detail,
        );
      }
      if ((res.status === 429 || res.status >= 500) && attempt < backoff.length) {
        const wait = backoff[attempt] ?? 30000;
        attempt += 1;
        opts.onNotice?.(
          res.status === 429
            ? `Rate limited — waiting ${Math.round(wait / 1000)}s. Silence is normal.`
            : `muse returned ${res.status} — retrying in ${Math.round(wait / 1000)}s.`,
        );
        await delay(wait, opts.signal);
        continue;
      }
      throw new MuseError(
        res.status === 429
          ? 'rate_limited'
          : res.status === 401
            ? 'unauthorized'
            : 'upstream',
        info.detail || `muse returned ${res.status}`,
        res.status,
        info.detail,
      );
    }

    const contentType = res.headers.get('content-type') || '';
    try {
      if (contentType.includes('text/event-stream') && res.body) {
        await consumeStream(res.body, state, opts.onText || (() => undefined));
      } else if (contentType.includes('application/json')) {
        const json = (await res.json()) as Record<string, unknown>;
        if (json.error) {
          throw new MuseError(
            'upstream',
            String((json as { detail?: string }).detail || json.error),
          );
        }
        handleChunk(json, state, opts.onText || (() => undefined));
      } else if (res.body) {
        await consumeStream(res.body, state, opts.onText || (() => undefined));
      }
    } catch (err) {
      if (opts.signal?.aborted) throw new MuseError('aborted', 'Stopped');
      if (attempt < 1 && !state.text && !state.toolCalls.size) {
        attempt += 1;
        opts.onNotice?.('Stream dropped — retrying once.');
        await delay(1200, opts.signal);
        continue;
      }
      throw new MuseError('stream', err instanceof Error ? err.message : 'stream failed');
    }

    const toolCalls = Array.from(state.toolCalls.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v)
      .filter((c) => c.name);
    return {
      text: state.text.trim(),
      toolCalls,
      usage: state.usage,
      latencyMs: Date.now() - started,
      model: opts.model,
      finishReason: state.finishReason,
      ...(state.reasoningEncrypted ? { reasoningEncrypted: state.reasoningEncrypted } : {}),
    };
  }
}

/** Non-streaming convenience (reviewer, vision, blueprint adjust). */
export async function chatOnce(opts: Omit<ChatOptions, 'onText'>): Promise<string> {
  const result = await chatStream(opts);
  return result.text;
}

export async function generateImage(prompt: string, size = '1024x1024'): Promise<string> {
  const res = await fetch('/api/muse/images', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ prompt, size }),
  });
  if (!res.ok) {
    const info = parseErrorBody(await res.text().catch(() => ''));
    throw new MuseError(
      'upstream',
      info.detail || `image generation failed (${res.status})`,
      res.status,
    );
  }
  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    images?: Array<{ b64_json?: string; url?: string }>;
  };
  const first = json.data?.[0] || json.images?.[0];
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  if (first?.url) return first.url;
  throw new MuseError('upstream', 'image response had no image');
}

export async function segmentImage(image: string): Promise<unknown> {
  const res = await fetch('/api/muse/segment', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ image }),
  });
  if (!res.ok) {
    const info = parseErrorBody(await res.text().catch(() => ''));
    throw new MuseError(
      'upstream',
      info.detail || `segmentation failed (${res.status})`,
      res.status,
    );
  }
  return res.json();
}

export async function transcribe(audioBase64: string, mime: string): Promise<string> {
  const res = await fetch('/api/muse/transcribe', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ audio: audioBase64, mime }),
  });
  if (!res.ok) {
    const info = parseErrorBody(await res.text().catch(() => ''));
    throw new MuseError(
      'upstream',
      info.detail || `transcription failed (${res.status})`,
      res.status,
    );
  }
  const json = (await res.json()) as { text?: string };
  return json.text || '';
}
