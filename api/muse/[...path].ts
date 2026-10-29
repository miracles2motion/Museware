/**
 * Production: the entire server side of Museware is this one serverless file.
 * It is the same `handleMuse` the dev server mounts as Vite middleware, so
 * there is exactly one implementation of the key handling, the model matrix
 * and the SSE pipe. `process.env` is the only place the key can live; nothing
 * here (or in the client) ever serialises it.
 *
 * Vercel/Netlify Node runtime: rewrite `/api/muse/(.*)` to this file.
 * The catch-all keeps the sub-path (`/status`, `/health`, `/chat`, `/probe`,
 * `/keytest`, `/images`, `/segment`, `/transcribe`), which is how `handleMuse`
 * routes.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMuse, type MuseEnv } from '../../server/museProxy';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    await handleMuse(req, res, process.env as MuseEnv);
  } catch (err) {
    // `handleMuse` catches its own failures, so reaching here means something
    // broke before routing (or the runtime itself misbehaved). Answer in the
    // same JSON shape as everything else: a bare platform 500 tells a visitor
    // nothing, and the client can then say what actually happened.
    console.error('[muse] function crashed before routing:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          error: 'proxy',
          route: req.url || '(unknown)',
          detail: err instanceof Error ? err.message : String(err),
          hint: 'The serverless function failed before it could answer. Check the function logs on Vercel.',
        }),
      );
    } else {
      res.end();
    }
  }
}
