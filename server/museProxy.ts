/**
 * The one and only muse gate. Dev runs this as Vite middleware
 * (vite.config.ts); production runs the same function as a serverless
 * handler (api/muse/[...path].ts). The API key is read from the server
 * environment (or a session key the user pasted into onboarding) and is
 * NEVER sent to the browser.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface MuseEnv {
  MUSE_API_KEY?: string;
  MUSE_BASE_URL?: string;
  MUSE_CODE_MODEL?: string;
  MUSE_CHAT_MODEL?: string;
  MUSE_ARCHITECT_MODEL?: string;
  MUSE_CONTRIBUTOR_MODEL?: string;
  MUSE_IMAGE_MODEL?: string;
  MUSE_SAM_MODEL?: string;
  MUSE_VOICE_MODEL?: string;
  MUSE_REASONING?: string;
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
  };
}

function apiRoot(baseUrl: string) {
  return /\/v\d+(\.\d+)?$/.test(baseUrl) ? baseUrl : `${baseUrl}/v1`;
}

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

async function upstreamError(res: ServerResponse, r: Response) {
  let detail = '';
  try {
    detail = await r.text();
  } catch {
    detail = '';
  }
  sendJson(res, r.status, {
    error:
      r.status === 429 ? 'rate_limited' : r.status === 401 ? 'unauthorized' : 'upstream',
    status: r.status,
    detail: detail.slice(0, 800),
  });
}

/** Pipe an SSE / JSON response through to the browser without buffering. */
async function pipeThrough(res: ServerResponse, r: Response) {
  res.statusCode = r.status;
  res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  if (r.headers.get('x-request-id'))
    res.setHeader('x-request-id', r.headers.get('x-request-id')!);
  if (!r.body) {
    res.end();
    return;
  }
  const reader = r.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
      if (res.writableEnded) break;
    }
  } catch {
    /* client went away — nothing to report */
  } finally {
    res.end();
  }
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
  const path = (req.url || '/').split('?')[0].replace(/\/+$/, '') || '/';
  const route = path.replace(/^\/api\/muse/, '') || '/status';
  const key = sessionKey(req) || env.MUSE_API_KEY || '';
  const abort = new AbortController();
  req.on('close', () => abort.abort());

  try {
    if (route === '/status' && req.method === 'GET') {
      return sendJson(res, 200, {
        configured: Boolean(key),
        source: sessionKey(req) ? 'session' : env.MUSE_API_KEY ? 'env' : 'none',
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

    if (!key) {
      return sendJson(res, 503, {
        error: 'no_key',
        detail:
          'No muse key on this server. Set MUSE_API_KEY in .env (or paste one at first run).',
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
      if (!r.ok) return await upstreamError(res, r);
      return await pipeThrough(res, r);
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
      if (!r.ok) return await upstreamError(res, r);
      return await pipeThrough(res, r);
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
      if (!r.ok) return await upstreamError(res, r);
      return await pipeThrough(res, r);
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
      if (!r.ok) return await upstreamError(res, r);
      return await pipeThrough(res, r);
    }

    return sendJson(res, 404, { error: 'not_found', route });
  } catch (err) {
    if (!res.headersSent) {
      sendJson(res, 500, {
        error: 'proxy',
        detail: err instanceof Error ? err.message : String(err),
      });
    } else {
      res.end();
    }
  }
}
