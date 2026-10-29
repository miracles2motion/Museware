// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { runAgentTurn } from './loop';
import { dismissKey, submitKey } from './cards';
import { setSessionKey } from './sessionKey';

/**
 * The house key dying must be HONEST: a card that asks for a key and parks the
 * turn. It must never quietly slide into the scripted demo engine — that would
 * dress a failure up as a working product.
 */

const HOUSE_402 = JSON.stringify({
  error: 'HOUSE_KEY_EXHAUSTED',
  status: 401,
  detail: 'House key rejected (401). Add your own key in Settings to keep building.',
  upstream: '{"error":"invalid api key"}',
});

function sse(body: string): Response {
  const text = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: body }, index: 0 }] })}`,
    '',
    `data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    })}`,
    '',
    'data: [DONE]',
    '',
  ].join('\n');
  return new Response(text, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

const USER_TURN = 'build me a coffee shop page';

let calls: Array<{ url: string; key: string }> = [];

function resetStores() {
  const doc = useProject.getState().doc;
  useProject.getState().replaceDoc({ ...doc, screens: [], opLog: [], rail: [] });
  useAgent.setState({
    busy: false,
    stopping: false,
    demoMode: false,
    configured: false,
    houseKey: 'ok',
    houseKeyDetail: null,
    pendingRetry: null,
    statusError: null,
    keySource: 'env',
    liveText: '',
    verification: 'idle',
    lastError: null,
    receipts: [],
    sessionCents: 0,
  });
}

beforeEach(() => {
  setSessionKey('');
  resetStores();
  calls = [];
});

afterEach(() => {
  setSessionKey('');
  vi.unstubAllGlobals();
  resetStores();
});

function stubFetch(answer: (call: number) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const headers = (init?.headers || {}) as Record<string, string>;
      calls.push({ url: String(url), key: headers['x-muse-key'] || '' });
      return Promise.resolve(answer(calls.length));
    }),
  );
}

function keyCards() {
  return useProject
    .getState()
    .doc.rail.filter((entry) => entry.role === 'card' && entry.card?.kind === 'key');
}

describe('a dead house key asks for a key instead of pretending', () => {
  it('parks the turn on a key card and does not touch the demo engine', async () => {
    stubFetch(() => new Response(HOUSE_402, { status: 402 }));

    await runAgentTurn(USER_TURN);

    const cards = keyCards();
    expect(cards.length).toBe(1);
    expect(cards[0].card?.state).toBe('pending');
    expect(String(cards[0].card?.data.reason)).toMatch(/shared key|out of/i);

    // The turn is parked, not lost.
    expect(useAgent.getState().pendingRetry).toBe(USER_TURN);
    // Honest: no screens were built, and demo was not entered behind our back.
    expect(useProject.getState().doc.screens.length).toBe(0);
    expect(useAgent.getState().demoMode).toBe(false);
    expect(useAgent.getState().houseKey).toBe('exhausted');
    expect(useAgent.getState().configured).toBe(false);
    expect(useAgent.getState().busy).toBe(false);
    // A house-key failure gets the key card, never a generic error card.
    expect(
      useProject
        .getState()
        .doc.rail.some((r) => r.role === 'card' && r.card?.kind === 'error'),
    ).toBe(false);
  });

  it('never asks twice while a key card is already pending', async () => {
    stubFetch(() => new Response(HOUSE_402, { status: 402 }));

    await runAgentTurn(USER_TURN);
    await runAgentTurn('now make it dark');

    expect(keyCards().length).toBe(1);
    expect(useAgent.getState().pendingRetry).toBe('now make it dark');
  });

  it('a pasted key answers the card and retries the parked turn with that key', async () => {
    stubFetch((n) => (n === 1 ? new Response(HOUSE_402, { status: 402 }) : sse('On it.')));

    await runAgentTurn(USER_TURN);
    const card = keyCards()[0];
    const cardId = card.id;

    await submitKey(cardId, '  sk-user-key  ');

    const after = useProject.getState().doc.rail.find((r) => r.id === cardId);
    expect(after?.card?.state).toBe('answered');

    // The retry is a real request, carrying the visitor's key in the header.
    expect(calls.length).toBe(2);
    expect(calls[1].key).toBe('sk-user-key');
    expect(useAgent.getState().pendingRetry).toBe(null);
    expect(useAgent.getState().demoMode).toBe(false);
    expect(useAgent.getState().keySource).toBe('session');
    expect(useAgent.getState().busy).toBe(false);

    // And the answer on screen is the model's, not a scripted one.
    const agentLines = useProject
      .getState()
      .doc.rail.filter((r) => r.role === 'agent')
      .map((r) => r.text);
    expect(agentLines.join(' ')).toContain('On it.');
    expect(keyCards().length).toBe(1);
  });

  it('"not now" leaves the canvas in hand-edit mode, demo off', async () => {
    stubFetch(() => new Response(HOUSE_402, { status: 402 }));

    await runAgentTurn(USER_TURN);
    dismissKey(keyCards()[0].id, false);

    expect(useAgent.getState().demoMode).toBe(false);
    expect(useAgent.getState().configured).toBe(false);
    expect(useAgent.getState().pendingRetry).toBe(null);
    expect(keyCards()[0].card?.state).toBe('cancelled');
  });

  it('"use the local engine" is the only road to demo, and it is explicit', async () => {
    stubFetch(() => new Response(HOUSE_402, { status: 402 }));

    await runAgentTurn(USER_TURN);
    dismissKey(keyCards()[0].id, true);

    expect(useAgent.getState().demoMode).toBe(true);
    expect(useAgent.getState().pendingRetry).toBe(null);
  });
});
