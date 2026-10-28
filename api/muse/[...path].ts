/**
 * Production: the entire server side of Museware is this one serverless file.
 * It is the same `handleMuse` the dev server mounts as Vite middleware, so
 * there is exactly one implementation of the key handling, the model matrix
 * and the SSE pipe. `process.env` is the only place the key can live; nothing
 * here (or in the client) ever serialises it.
 *
 * Vercel/Netlify Node runtime: rewrite `/api/muse/(.*)` to this file.
 * The catch-all keeps the sub-path (`/status`, `/chat`, `/probe`, `/image`,
 * `/segment`, `/transcribe`), which is how `handleMuse` routes.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMuse, type MuseEnv } from '../../server/museProxy';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await handleMuse(req, res, process.env as MuseEnv);
}
