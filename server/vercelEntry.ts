/**
 * The one place the deployment's request handling is wired up.
 *
 * It lives OUTSIDE `api/` on purpose. Vercel's builder compiles the file it
 * finds in `api/`, but a relative import of a `.ts` file from another folder is
 * exactly the kind of cross-directory reference that can survive the build and
 * then fail at invocation with a bare `FUNCTION_INVOCATION_FAILED` — a 500 that
 * blames nothing and explains nothing.
 *
 * Instead `scripts/build-api.mjs` bundles this file (and everything it needs)
 * into `api/muse/[...path].js` before Vercel looks for functions. The emitted
 * function has no relative imports at all: it can only fail if our own code
 * throws, which the handler then reports in JSON.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMuse, type MuseEnv } from './museProxy';

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
