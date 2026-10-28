// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MuseError, fetchStatus } from './client';
import { diagnose } from './connection';
import { recreateFromScreenshot } from './screenshot';
import { useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';

/**
 * The field bug this file exists for: a deployment where the api/ folder never
 * shipped told the visitor "you need a key for that". Three different problems,
 * three different sentences.
 */

function reset() {
  const doc = useProject.getState().doc;
  useProject.getState().replaceDoc({ ...doc, screens: [], opLog: [], rail: [] });
  useAgent.setState({
    busy: false,
    demoMode: false,
    configured: false,
    statusError: null,
    keySource: 'none',
    models: null,
    liveText: '',
    receivedProbes: undefined,
  } as never);
}

beforeEach(reset);
afterEach(() => {
  vi.unstubAllGlobals();
  reset();
});

describe('fetchStatus names its own failures', () => {
  it('an HTML answer means /api/* is rewritten to the app shell', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('<!doctype html><title>app</title>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
        ),
      ),
    );
    await expect(fetchStatus()).rejects.toMatchObject({
      code: 'network',
      message: expect.stringContaining('HTML'),
    });
  });

  it('a 404 keeps its status so the diagnosis can call it undeployed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('not found', { status: 404 }))),
    );
    const err = await fetchStatus().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MuseError);
    expect((err as MuseError).status).toBe(404);
    expect(diagnose(err).kind).toBe('unreachable');
    expect(diagnose(err).offerKey).toBe(false);
  });

  it('a dead network is a dead network, not a missing key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const err = await fetchStatus().catch((e: unknown) => e);
    expect((err as MuseError).code).toBe('network');
    expect(diagnose(err).text).toMatch(/not answering|not deployed/i);
  });
});

describe('diagnose tells the three stories apart', () => {
  it('no_key blames the deployment and offers the key card', () => {
    const diag = diagnose(new MuseError('no_key', 'No muse key on this server.', 503));
    expect(diag.kind).toBe('no_key');
    expect(diag.offerKey).toBe(true);
    expect(diag.text).toContain('MUSE_API_KEY');
    expect(diag.text).toMatch(/redeploy/i);
  });

  it('a spent house key is a budget problem, not a deployment problem', () => {
    const diag = diagnose(
      new MuseError('house_key_exhausted', 'shared key is out', 402, 'invalid api key'),
    );
    expect(diag.kind).toBe('budget');
    expect(diag.offerKey).toBe(true);
    expect(diag.text).toContain('invalid api key');
  });

  it('a 404 from the API is never blamed on the visitor', () => {
    const diag = diagnose(new MuseError('upstream', 'GET /api/muse/segment 404', 404));
    expect(diag.kind).toBe('unreachable');
    expect(diag.offerKey).toBe(false);
    expect(diag.text).toMatch(/deployment problem, not a key problem/i);
  });
});

describe('a dropped screenshot reports the true reason', () => {
  function stubSegment(body: string, status: number) {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(body, { status, headers: { 'Content-Type': 'application/json' } }),
        ),
      ),
    );
  }

  const shot = () => new File([new Blob(['x'])], 'shot.png', { type: 'image/png' });

  it('no_key: says MUSE_API_KEY + redeploy, and offers the key card', async () => {
    stubSegment(
      JSON.stringify({ error: 'no_key', detail: 'No muse key on this server.' }),
      503,
    );
    await recreateFromScreenshot(shot());

    const rail = useProject.getState().doc.rail;
    const system = rail.filter((r) => r.role === 'system').map((r) => r.text);
    expect(system.join(' ')).toContain('MUSE_API_KEY');
    expect(system.join(' ')).toMatch(/redeploy/i);
    const card = rail.find((r) => r.role === 'card' && r.card?.kind === 'key');
    expect(card?.card?.state).toBe('pending');
    // Nothing was built and no blueprint was invented.
    expect(useProject.getState().doc.screens.length).toBe(0);
    expect(useProject.getState().doc.blueprint).toBeUndefined();
    expect(useAgent.getState().busy).toBe(false);
  });

  it('a 404 means the function is not deployed, and the rail says so', async () => {
    stubSegment('<html>not found</html>', 404);
    await recreateFromScreenshot(shot());

    const rail = useProject.getState().doc.rail;
    const system = rail
      .filter((r) => r.role === 'system')
      .map((r) => r.text)
      .join(' ');
    expect(system).toMatch(/deployment problem, not a key problem/i);
    expect(system).not.toMatch(/MUSE_API_KEY/);
    // No key card: pasting a key would not fix a missing server.
    expect(rail.some((r) => r.role === 'card' && r.card?.kind === 'key')).toBe(false);
  });

  it('an explicitly chosen local engine explains itself without blaming anyone', async () => {
    useAgent.setState({ demoMode: true, statusError: null });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await recreateFromScreenshot(shot());

    const system = useProject
      .getState()
      .doc.rail.filter((r) => r.role === 'system')
      .map((r) => r.text)
      .join(' ');
    expect(system).toMatch(/local engine/i);
    expect(system).toMatch(/no vision/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
