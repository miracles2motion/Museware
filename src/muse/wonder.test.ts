// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProject } from '../store/useProject';
import { useAgent, type ModelMatrix } from '../store/useAgent';
import { runAgentTurn } from './loop';

/**
 * Wonder mode is opt-in and narrow: the architect role plans, the builder builds.
 * Nothing else in the loop is allowed to switch models on cost grounds.
 */

const MODELS: ModelMatrix = {
  builder: { id: 'muse-spark-1.3', role: 'Builder', effort: 'high' },
  architect: { id: 'muse-wonder-1.0', role: 'Architect', effort: 'max' },
  chat: { id: 'muse-spark-1.3', role: 'Chat', effort: 'low' },
  contributor: { id: 'muse-spark-1.3-contributor', role: 'Dev', effort: 'xhigh' },
  image: { id: 'muse-image-1.0', role: 'Image', effort: null },
  sam: { id: 'sam-3.1', role: 'SAM', effort: null },
  voice: { id: 'muse-voice-transcribe-1.0', role: 'Voice', effort: null },
};

function sse(text: string): Response {
  const body = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text }, index: 0 }] })}`,
    '',
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop', index: 0 }] })}`,
    '',
    'data: [DONE]',
    '',
  ].join('\n');
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

const sent: Array<Record<string, unknown>> = [];

beforeEach(() => {
  const doc = useProject.getState().doc;
  useProject.getState().replaceDoc({ ...doc, screens: [], opLog: [], rail: [] });
  useAgent.setState({
    busy: false,
    demoMode: false,
    configured: true,
    keySource: 'env',
    models: MODELS,
    wonder: false,
    pendingRetry: null,
    receipts: [],
    liveText: '',
    verification: 'idle',
    lastError: null,
  });
  sent.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>);
      return Promise.resolve(sse('Planning it now.'));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  useProject.getState().replaceDoc({
    ...useProject.getState().doc,
    screens: [],
    opLog: [],
    rail: [],
  });
});

describe('wonder mode', () => {
  it('off: the first planning round runs on the builder model', async () => {
    await runAgentTurn('design a bakery page');
    expect(sent[0].model).toBe('muse-spark-1.3');
    expect(sent[0].effort).toBe('medium');
    expect(useAgent.getState().receipts[0].role).toBe('builder');
  });

  it('on: the architect role plans, at max effort', async () => {
    useAgent.getState().setWonder(true);
    await runAgentTurn('design a bakery page');
    expect(sent[0].model).toBe('muse-wonder-1.0');
    expect(sent[0].effort).toBe('max');
    expect(useAgent.getState().receipts[0].role).toBe('architect');
    useAgent.getState().setWonder(false);
  });

  it('on: never hijacks later turns once screens exist', async () => {
    useAgent.getState().setWonder(true);
    // A screen already on the canvas: this is a fill/edit turn, not planning.
    useProject.getState().replaceDoc({
      ...useProject.getState().doc,
      screens: [
        {
          id: 'home',
          name: 'Home',
          entry: true,
          root: {
            id: 'root',
            type: 'screen',
            props: {},
            styles: {},
            children: [],
          },
        },
      ],
    });
    await runAgentTurn('now add a footer');
    expect(sent[0].model).toBe('muse-spark-1.3');
    useAgent.getState().setWonder(false);
  });
});
