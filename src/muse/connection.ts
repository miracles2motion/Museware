/**
 * Why did a model call fail? The three cases look identical in a toast and are
 * completely different problems:
 *
 *   no_key      the server is up and has no key        → redeploy with MUSE_API_KEY
 *   budget      the shared key is spent                → paste your own key
 *   unreachable /api/muse never answered               → the function is not deployed
 *
 * Guessing "you need a key" at a broken deployment is the kind of lie this
 * product exists not to tell.
 */
import { MuseError } from './client';

export type ConnectionKind = 'no_key' | 'budget' | 'auth' | 'unreachable' | 'other';

export interface Diagnosis {
  kind: ConnectionKind;
  /** One honest line for the rail. */
  text: string;
  /** Should we offer the key card? Only when a key would actually fix it. */
  offerKey: boolean;
}

const DEPLOY_HINT =
  'This is a deployment problem, not a key problem: the serverless function at /api/muse is not answering. Check that the Vercel build deployed the api/ folder.';

export function diagnose(err: unknown): Diagnosis {
  if (err instanceof MuseError) {
    if (err.code === 'no_key') {
      return {
        kind: 'no_key',
        text:
          'The muse proxy answered, but this deployment has no key: MUSE_API_KEY is not set for it. ' +
          'Vercel bakes env vars per deployment — add the variable for Production, then redeploy.',
        offerKey: true,
      };
    }
    if (err.code === 'house_key_exhausted') {
      return {
        kind: 'budget',
        text: `The shared key is out of budget: ${err.detail || err.message}`,
        offerKey: true,
      };
    }
    if (err.code === 'unauthorized') {
      return {
        kind: 'auth',
        text: `The key this server is using was rejected: ${err.detail || err.message}`,
        offerKey: true,
      };
    }
    if (err.code === 'network') {
      return {
        kind: 'unreachable',
        text: `${DEPLOY_HINT} (${err.message})`,
        offerKey: false,
      };
    }
    if (err.status === 404) {
      return {
        kind: 'unreachable',
        text: `${DEPLOY_HINT} (404 from /api/muse)`,
        offerKey: false,
      };
    }
    if (err.status === 402 || err.code === 'rate_limited') {
      return {
        kind: 'budget',
        text: `The model call was refused: ${err.detail || err.message}`,
        offerKey: true,
      };
    }
    return { kind: 'other', text: err.message, offerKey: false };
  }
  const message =
    err instanceof TypeError
      ? 'the request never left the browser (offline, blocked, or no /api/muse route)'
      : err instanceof Error
        ? err.message
        : String(err);
  if (err instanceof TypeError) {
    return { kind: 'unreachable', text: `${DEPLOY_HINT} (${message})`, offerKey: false };
  }
  return { kind: 'other', text: message, offerKey: false };
}

/** True when retrying after a key paste can work; false when the server is gone. */
export function isDeploymentProblem(err: unknown): boolean {
  const kind = diagnose(err).kind;
  return kind === 'unreachable';
}
