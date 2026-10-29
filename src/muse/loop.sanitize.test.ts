import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { emptyScreen } from '../ops/screenOps';
import { chatStream, type ChatMessage, type ChatResult } from './client';
import { repairJson, runAgentTurn } from './loop';

vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  chatStream: vi.fn(),
}));

const reply = (
  toolCalls: ChatResult['toolCalls'] = [],
  finishReason = 'tool_calls',
): ChatResult => ({
  text: '',
  toolCalls,
  finishReason,
  model: 'muse-spark-1.3',
  latencyMs: 1,
  usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 },
});
const finish = reply([{ id: 'end', name: 'finish', arguments: '{"summary":"Done"}' }]);
const call = (name: string, args: string, id = 'call_1') => ({ id, name, arguments: args });

beforeEach(() => {
  vi.mocked(chatStream).mockReset();
  const screen = emptyScreen('Home', { id: 'home', entry: true });
  useProject.getState().replaceDoc({ ...createProject(), screens: [screen] });
  useAgent.setState({
    demoMode: false,
    configured: true,
    busy: false,
    models: null,
    wonder: false,
    contributorMode: false,
    receipts: [],
  });
});

describe('repairJson', () => {
  it('keeps complete JSON unchanged', () => {
    const text = '{"ops":[{"op":"renameScreen","id":"home","name":"Shop"}]}';
    expect(repairJson(text)).toBe(text);
  });
  it('strips code fences', () =>
    expect(JSON.parse(repairJson('```json\n{"a":1}\n```')!)).toEqual({ a: 1 }));
  it('closes nested arrays and objects', () =>
    expect(JSON.parse(repairJson('{"ops":[{"op":"x"}')!)).toEqual({ ops: [{ op: 'x' }] }));
  it('closes an unterminated string', () =>
    expect(JSON.parse(repairJson('{"name":"Shop')!)).toEqual({ name: 'Shop' }));
  it('removes trailing commas without changing commas inside strings', () =>
    expect(JSON.parse(repairJson('{"label":",}","a":[1,],}')!)).toEqual({
      label: ',}',
      a: [1],
    }));
  it('drops a partial dangling property while preserving a complete preceding value', () =>
    expect(JSON.parse(repairJson('{"a":1,"broken":')!)).toEqual({ a: 1 }));
  it('rejects irreparable arguments', () =>
    expect(repairJson('definitely not json')).toBeNull());
});

describe('tool history sanitation', () => {
  it('drops all length-truncated tool calls without applying them and requests smaller batches', async () => {
    const calls: ChatMessage[][] = [];
    vi.mocked(chatStream).mockImplementation(async (opts) => {
      calls.push(JSON.parse(JSON.stringify(opts.messages)) as ChatMessage[]);
      return calls.length === 1
        ? reply(
            [
              call(
                'edit_canvas',
                '{"ops":[{"op":"renameScreen","id":"home","name":"Broken"}',
              ),
            ],
            'length',
          )
        : finish;
    });
    await runAgentTurn('Change the screen', { skipVerify: true });
    expect(useProject.getState().doc.screens[0].name).toBe('Home');
    expect(calls[1].some((m) => m.tool_calls?.length)).toBe(false);
    expect(calls[1].some((m) => m.content.includes('at most 12 ops'))).toBe(true);
    expect(
      useProject.getState().doc.rail.some((entry) => entry.text.includes('output cap')),
    ).toBe(true);
  });
  it('repairs valid recoverable arguments before execution and echo', async () => {
    const calls: ChatMessage[][] = [];
    vi.mocked(chatStream).mockImplementation(async (opts) => {
      calls.push(JSON.parse(JSON.stringify(opts.messages)) as ChatMessage[]);
      return calls.length === 1
        ? reply([
            call(
              'edit_canvas',
              '{"ops":[{"op":"renameScreen","id":"home","name":"Shop"}],}',
            ),
          ])
        : finish;
    });
    await runAgentTurn('Rename this screen', { skipVerify: true });
    expect(useProject.getState().doc.screens[0].name).toBe('Shop');
    const echoed = calls[1].find((m) => m.tool_calls)?.tool_calls?.[0].function.arguments;
    expect(JSON.parse(echoed!)).toEqual({
      ops: [{ op: 'renameScreen', id: 'home', name: 'Shop' }],
    });
  });
  it('drops a malformed call but runs valid calls from the same response', async () => {
    const requests: ChatMessage[][] = [];
    vi.mocked(chatStream).mockImplementation(async (opts) => {
      requests.push(JSON.parse(JSON.stringify(opts.messages)) as ChatMessage[]);
      return requests.length === 1
        ? reply([call('edit_canvas', 'not json', 'bad'), call('read_canvas', '{}', 'good')])
        : finish;
    });
    await runAgentTurn('Check the canvas', { skipVerify: true });
    const next = requests[1];
    expect(next.find((m) => m.tool_calls)?.tool_calls?.map((c) => c.id)).toEqual(['good']);
    expect(next.find((m) => m.role === 'tool')?.tool_call_id).toBe('good');
    expect(next.some((m) => m.content.includes('at most 12 ops'))).toBe(true);
  });
  it('also retries truncation with no tool calls without echoing partial text', async () => {
    const requests: ChatMessage[][] = [];
    vi.mocked(chatStream).mockImplementation(async (opts) => {
      requests.push(JSON.parse(JSON.stringify(opts.messages)) as ChatMessage[]);
      return requests.length === 1 ? { ...reply([], 'length'), text: '{"ops":[' } : finish;
    });
    await runAgentTurn('Edit the canvas', { skipVerify: true });
    expect(requests[1].some((m) => m.content === '{"ops":[')).toBe(false);
    expect(requests[1].some((m) => m.content.includes('at most 12 ops'))).toBe(true);
  });
  it('reports the reason when the reviewer fails', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply([
          call('edit_canvas', '{"ops":[{"op":"renameScreen","id":"home","name":"Shop"}]}'),
        ]),
      )
      .mockResolvedValueOnce(finish)
      .mockRejectedValueOnce(new Error('reviewer quota exhausted'));
    await runAgentTurn('Rename this screen');
    expect(useAgent.getState().verification).toBe('unverified');
    expect(
      useProject
        .getState()
        .doc.rail.some((r) => r.text.includes('reviewer quota exhausted')),
    ).toBe(true);
  });
});
