import { zodToJsonSchema } from 'zod-to-json-schema';
import { TOOL_NAMES, toolSchemas, type ToolName } from '../types/tools';
import { useAgent } from '../store/useAgent';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { buildTokenSheet } from './tokenSheet';
import { buildProjectIndex } from './projectIndex';
import { canvasOutline } from './canvasOutline';
import { parseBlueprint } from './blueprintParse';
import { parseTypedOptions } from './typedOptions';
import {
  MuseError,
  chatStream,
  estimateCents,
  type ChatMessage,
  type ChatResult,
} from './client';
import {
  JSON_CORRECTION,
  SYSTEM_PROMPT,
  adjustBlueprintPrompt,
  fillPrompt,
  rebuildNote,
  reviewerPrompt,
} from './prompts';
import type { Action, OpError, ProjectDoc } from '../types/tree';
import { entryScreen } from '../ops/treeUtils';

const TURN_CALL_CAP = 24;
const MAX_RESULT = 8000;

const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  read_canvas:
    'Read the compact canvas index (screens, ids, actions, state keys). ≤4000 chars.',
  set_design_tokens:
    'Patch the design tokens: brand_color, secondary_color, radii_dp, metrics_dp, light_colors, dark_colors, fonts. Repaints the canvas.',
  propose_blueprint:
    'Show a plain-text blueprint to the user for approval. Does not build. Format: RULES, per screen SCREEN/component lines/LOOK with hard numbers, STATE, WIRING.',
  ask_choice:
    'Ask the user to pick 1 of 2–4 whole directions. Each option has a label and up to 4 hex swatches. The card leaves on tap.',
  edit_canvas:
    'Apply a batch of ops to the canvas. ALL adds for a screen in ONE call, then ONE styling call. All-or-nothing; ≤40 ops.',
  finish: 'End the turn with a two-sentence user-facing summary.',
};

const TOOL_DEFS = TOOL_NAMES.map((name) => ({
  type: 'function' as const,
  function: {
    name,
    description: TOOL_DESCRIPTIONS[name],
    parameters: zodToJsonSchema(toolSchemas[name], { target: 'openApi3' }),
  },
}));

let controller: AbortController | null = null;
let running = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let turnScreenAdds = 0;
let changedThisTurn = false;

export function isAgentRunning(): boolean {
  return running;
}

export function stopAgent(): void {
  controller?.abort();
  useAgent.getState().requestStop();
  useUi.getState().toast('Stopping after the current step…', 'warn');
}

function addSystem(text: string) {
  useProject.getState().addRail({ role: 'system', text });
}

function addAgent(text: string) {
  if (!text.trim()) return;
  useProject.getState().addRail({ role: 'agent', text: text.slice(0, 4000) });
}

function addCard(
  kind: 'build_choice' | 'blueprint' | 'choice' | 'color' | 'progress' | 'error' | 'key',
  data: Record<string, unknown>,
  text = '',
) {
  return useProject.getState().addRail({
    role: 'card',
    text,
    card: { kind, state: 'pending', data },
  });
}

function startHeartbeat(anchor: number) {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!useAgent.getState().busy) return;
    const secs = Math.round((Date.now() - anchor) / 1000);
    if (secs < 40) return;
    const mins = Math.floor(secs / 60);
    const label = mins >= 1 ? `${mins}m${String(secs % 60).padStart(2, '0')}s` : `${secs}s`;
    useAgent
      .getState()
      .setLive(
        `Still working… ${label}. Silence is normal. (${useAgent.getState().liveLine || 'muse is thinking'})`,
      );
  }, 15000);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function history(): ChatMessage[] {
  const rail = useProject.getState().doc.rail;
  const recent = rail
    .filter((r) => (r.role === 'user' || r.role === 'agent') && r.text.trim())
    .slice(-8);
  return recent.map((r) => {
    const content =
      r.text.length > 700 ? `${r.text.slice(0, 420)}\n…\n${r.text.slice(-240)}` : r.text;
    return { role: r.role === 'user' ? 'user' : 'assistant', content };
  });
}

function contextMessages(
  doc: ProjectDoc,
  userText: string,
  extraSystem: string[] = [],
): ChatMessage[] {
  const sheet = buildTokenSheet(doc.tokens);
  const index = buildProjectIndex(doc, { selectionId: useUi.getState().selectedId });
  return [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\nTOKEN SHEET (design law):\n${sheet}` },
    {
      role: 'system',
      content: `CANVAS INDEX:\n${index}${extraSystem.length ? `\n${extraSystem.join('\n')}` : ''}`,
    },
    ...history(),
    { role: 'user', content: userText },
  ];
}

function recordReceipt(
  result: ChatResult,
  role: string,
  promptChars: number,
  toolNames: string[],
) {
  useAgent.getState().addReceipt({
    role,
    model: result.model,
    promptChars,
    toolNames,
    latencyMs: result.latencyMs,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cachedTokens: result.usage.cachedTokens,
    cents: estimateCents(result.model, result.usage),
    key: useAgent.getState().keySource === 'session' ? 'user' : 'house',
  });
}

function formatErrors(errors: OpError[]): string {
  return errors
    .slice(0, 8)
    .map((e) => `${e.code}: ${e.message}${e.guidance ? ` — ${e.guidance}` : ''}`)
    .join('\n');
}

interface ToolLoopOptions {
  messages: ChatMessage[];
  maxCalls: number;
  role?: string;
  effort?: string;
  model?: string;
  onProgress?: (line: string) => void;
}

interface ToolLoopResult {
  text: string;
  finished: boolean;
  choiceAsked: boolean;
  changed: boolean;
  screenAdded: boolean;
  calls: number;
  stopped: boolean;
}

async function executeToolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult> {
  const models = useAgent.getState().models;
  // One pinned model per role: the role picks the model, never the other way
  // round. Wonder mode can only move a planning turn onto the architect role.
  const model =
    opts.model ||
    (opts.role === 'architect' ? models?.architect.id : models?.builder.id) ||
    'muse-spark-1.3';
  const effort = opts.effort || 'medium';
  const messages = [...opts.messages];
  let calls = 0;
  let finished = false;
  let choiceAsked = false;
  let stopped = false;
  const changedBefore = useProject.getState().doc.opLog.length;

  while (calls < opts.maxCalls) {
    if (controller?.signal.aborted) {
      stopped = true;
      break;
    }
    let result: ChatResult;
    try {
      const promptChars = messages.reduce((n, m) => n + m.content.length, 0);
      result = await chatStream({
        model,
        effort,
        messages,
        tools: TOOL_DEFS,
        signal: controller?.signal,
        onText: (t) => useAgent.getState().appendText(t),
        onNotice: (n) => addSystem(n),
      });
      recordReceipt(
        result,
        opts.role || 'builder',
        promptChars,
        result.toolCalls.map((c) => c.name),
      );
    } catch (err) {
      if (err instanceof MuseError && err.code === 'aborted') {
        stopped = true;
        break;
      }
      throw err;
    }

    if (result.text) useAgent.getState().resetText();

    if (!result.toolCalls.length) {
      if (/\{\s*"op"|<\/?[a-z]+>|```/.test(result.text)) {
        addSystem('Correction: prose only — the canvas changes through tools.');
        messages.push({ role: 'assistant', content: result.text });
        messages.push({ role: 'user', content: JSON_CORRECTION });
        calls += 1;
        if (calls < opts.maxCalls) continue;
      }
      const typed = parseTypedOptions(result.text);
      if (typed) {
        addCard(
          'choice',
          {
            question: typed.question,
            options: typed.options,
            source: 'typed',
          },
          typed.question,
        );
        choiceAsked = true;
        addAgent(
          'Those are tappable above now — pick one. (The model typed them as text; the fallback caught it.)',
        );
        break;
      }
      if (result.text) addAgent(result.text);
      break;
    }

    if (result.text) addAgent(result.text);
    messages.push({
      role: 'assistant',
      content: result.text || '',
      tool_calls: result.toolCalls.map((c) => ({
        id: c.id || `call_${calls}_${c.name}`,
        type: 'function' as const,
        function: { name: c.name, arguments: c.arguments },
      })),
    });

    let endTurn = false;
    for (const call of result.toolCalls) {
      calls += 1;
      useAgent.getState().bumpCalls();
      if (calls > opts.maxCalls) break;
      if (controller?.signal.aborted) {
        stopped = true;
        break;
      }
      const name = call.name as ToolName;
      let outcome: string;
      try {
        const parsedArgs = call.arguments?.trim()
          ? (JSON.parse(call.arguments) as unknown)
          : {};
        const schema = toolSchemas[name];
        if (!schema) throw new Error(`unknown tool ${name}`);
        const args = schema.parse(parsedArgs);
        const res = await runTool(name, args, {} as ToolLoopOptions);
        outcome = res.text;
        if (res.endTurn) endTurn = true;
        if (res.choiceAsked) choiceAsked = true;
        if (res.finished) finished = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code = /JSON/i.test(message) ? 'E_BAD_ARGS' : 'E_BAD_OP';
        outcome = `${code}: ${message.slice(0, 500)}. Fix the tool arguments and retry strict JSON.`;
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id || `call_${calls}_${name}`,
        name,
        content: outcome.slice(0, MAX_RESULT),
      });
      if (endTurn || finished || choiceAsked) break;
    }
    if (stopped || endTurn || finished || choiceAsked) break;
  }

  const changed = useProject.getState().doc.opLog.length > changedBefore;
  return {
    text: '',
    finished,
    choiceAsked,
    changed: changed || changedThisTurn,
    screenAdded: turnScreenAdds > 0,
    calls,
    stopped,
  };
}

interface ToolOutcome {
  text: string;
  finished?: boolean;
  endTurn?: boolean;
  choiceAsked?: boolean;
}

async function runTool(
  name: ToolName,
  args: unknown,
  _opts: ToolLoopOptions,
): Promise<ToolOutcome> {
  const doc = useProject.getState().doc;
  switch (name) {
    case 'read_canvas':
      return { text: buildProjectIndex(doc, { selectionId: useUi.getState().selectedId }) };

    case 'set_design_tokens': {
      const a = args as { patch: Record<string, unknown>; title?: string };
      const patch: Record<string, unknown> = { ...a.patch };
      if (a.title) patch.title = a.title;
      const res = useProject
        .getState()
        .applyBatch([{ op: 'setTokens', patch }], { source: 'agent' });
      if (res.errors.length) return { text: `REJECTED\n${formatErrors(res.errors)}` };
      changedThisTurn = true;
      useAgent.getState().setLive('Repainting the canvas with your tokens…');
      addSystem(`🎨 Design updated — ${res.summary}`);
      return { text: 'ok: tokens applied everywhere. Canvas repainted.' };
    }

    case 'propose_blueprint': {
      const a = args as { blueprint_text: string };
      const parsed = presentBlueprint(a.blueprint_text);
      addAgent(
        parsed.screens.length > 1
          ? `Blueprint ready — ${parsed.screens.length} screens. Approve it and I'll fill them, or tweak the plan first.`
          : "Blueprint ready. Approve it and I'll build the screen, or tweak the plan first.",
      );
      return {
        text: 'ok: blueprint persisted and the approval card is on screen. Call finish().',
        endTurn: true,
      };
    }

    case 'ask_choice': {
      const a = args as {
        question: string;
        options: Array<{ label: string; hexes?: string[] }>;
      };
      addCard(
        'choice',
        { question: a.question, options: a.options, source: 'tool' },
        a.question,
      );
      return {
        text: 'ok: choice card is on screen. The user answers by tapping. End the turn now.',
        endTurn: true,
        choiceAsked: true,
      };
    }

    case 'edit_canvas': {
      const a = args as { screen_id?: string; ops: unknown[] };
      if (
        turnScreenAdds >= 1 &&
        Array.isArray(a.ops) &&
        a.ops.some((o) => (o as { op?: string }).op === 'addScreen')
      ) {
        return {
          text: 'E_BUILD_CARD: a second addScreen in one turn is blocked. End the turn with finish(); the user picks a mode on the card.',
        };
      }
      useAgent.getState().setLive('Writing canvas changes…');
      const res = useProject.getState().applyBatch(a.ops, {
        source: 'agent',
        screenAddsThisTurn: turnScreenAdds,
      });
      if (res.errors.length) {
        return { text: `REJECTED (nothing applied)\n${formatErrors(res.errors)}` };
      }
      changedThisTurn = true;
      const addScreens = a.ops.filter(
        (o) => (o as { op?: string }).op === 'addScreen',
      ).length;
      turnScreenAdds += addScreens;
      useAgent.getState().setLive(`${res.summary} — ${a.ops.length} ops applied`);
      addSystem(`✦ ${res.summary} — applied to ${a.screen_id || 'the canvas'}`);
      if (addScreens > 0) {
        addCard('build_choice', { reason: 'first-screen' }, 'Build it — how?');
        addAgent(
          'Screens exist. How do you want to build them out? Blueprint first (recommended), steady screens, or fast screens.',
        );
        return {
          text: 'ok: applied. Law 12 — the turn ends here; the user picks a build mode on the card. Do not add another screen this turn.',
          endTurn: true,
        };
      }
      return { text: `ok: ${res.summary} (${a.ops.length} ops applied).` };
    }

    case 'finish': {
      const a = args as { summary: string };
      addAgent(a.summary);
      return { text: 'ok: turn finished.', finished: true };
    }

    default:
      return { text: `E_BAD_ARGS: unknown tool ${String(name)}` };
  }
}

async function reviewer(
  task: string,
  outline: string,
): Promise<{ verdict: 'pass' | 'problems' | 'error'; notes: string }> {
  const models = useAgent.getState().models;
  try {
    const wonder = useAgent.getState().wonder;
    const result = await chatStream({
      model: (wonder ? models?.architect.id : models?.chat.id) || 'muse-spark-1.3',
      effort: wonder ? 'max' : 'medium',
      messages: [
        {
          role: 'system',
          content: 'You are a strict design reviewer. Reply with PASS or PROBLEMS only.',
        },
        { role: 'user', content: reviewerPrompt(task, outline) },
      ],
      signal: controller?.signal,
      maxTokens: 700,
    });
    recordReceipt(result, 'reviewer', outline.length, []);
    const text = result.text.trim();
    if (/^PASS\b/i.test(text)) return { verdict: 'pass', notes: '' };
    if (/^PROBLEMS/i.test(text)) return { verdict: 'problems', notes: text.slice(0, 1200) };
    return { verdict: text ? 'problems' : 'error', notes: text.slice(0, 1200) };
  } catch {
    return { verdict: 'error', notes: '' };
  }
}

async function verifyGate(
  task: string,
  doc: ProjectDoc,
  screenIds: string[],
): Promise<void> {
  useAgent.getState().setVerification('running');
  const outline = canvasOutline(doc, screenIds);
  const first = await reviewer(task, outline);
  if (first.verdict === 'pass') {
    useAgent.getState().setVerification('pass');
    addSystem('✓ Verified — reviewer said PASS');
    return;
  }
  if (first.verdict === 'error') {
    useAgent.getState().setVerification('unverified');
    addSystem('Unverified — the reviewer call failed, so the build ships with that label.');
    return;
  }
  addSystem('Reviewer saw problems — one rebuild round.');
  useAgent.getState().setLive('Fixing what the reviewer flagged…');
  const repairMessages = contextMessages(doc, rebuildNote(first.notes));
  try {
    await executeToolLoop({
      messages: repairMessages,
      maxCalls: 8,
      role: 'builder',
      effort: 'high',
    });
  } catch (err) {
    addSystem(`Rebuild call failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const after = useProject.getState().doc;
  const second = await reviewer(task, canvasOutline(after, screenIds));
  useAgent
    .getState()
    .setVerification(second.verdict === 'pass' ? 'pass' : 'problems', second.notes);
  if (second.verdict === 'pass') {
    addSystem('✓ Rebuild verified — PASS');
  } else {
    addSystem("Shipped with the reviewer's remaining notes below (honest > perfect).");
    useAgent.getState().setError(second.notes || 'Reviewer still saw problems.');
  }
}

/**
 * The key card (§2b): one honest card, one paste field, one retry. It appears
 * when the shared key is gone or out of budget — never a silent demo fallback,
 * because a scripted build pretending to be muse is the lie this product exists
 * to avoid.
 */
export function offerKey(detail: string, retryText: string) {
  const agent = useAgent.getState();
  agent.setPendingRetry(retryText || null);
  const already = useProject
    .getState()
    .doc.rail.some(
      (entry) =>
        entry.role === 'card' &&
        entry.card?.kind === 'key' &&
        entry.card.state === 'pending',
    );
  addSystem(detail);
  if (already) return;
  addCard(
    'key',
    { reason: detail, retryText: retryText || '', houseKey: useAgent.getState().houseKey },
    'Add your Meta API key',
  );
}

function wrapError(err: unknown, userText: string) {
  const message = err instanceof Error ? err.message : String(err);
  const code = err instanceof MuseError ? err.code : 'error';
  useAgent.getState().setError(message);
  if (code === 'house_key_exhausted') {
    useAgent.getState().setStatus({
      configured: false,
      demoMode: false,
      houseKey: 'exhausted',
      statusError: message,
    });
    offerKey(`The shared key for this demo is out of budget. ${message}`, userText);
    return;
  }
  if (code === 'no_key') {
    useAgent
      .getState()
      .setStatus({ configured: false, demoMode: false, houseKey: 'absent' });
    offerKey('No muse key on this server yet.', userText);
    return;
  }
  addCard('error', { message, code, retryText: userText }, 'That did not finish.');
}

/** Persist-on-create + approval card. Shared by the tool, the screenshot path and the local engine. */
export function presentBlueprint(text: string) {
  const doc = useProject.getState().doc;
  useProject.getState().setBlueprint(text, false);
  const parsed = parseBlueprint(text, doc.tokens);
  addCard(
    'blueprint',
    {
      blueprint: text,
      screens: parsed.screens.map((s) => ({ id: s.id, name: s.name })),
      look: parsed.look,
      stateKeys: parsed.stateKeys,
      wiring: parsed.wiring,
      title: parsed.screens.map((s) => s.name).join(' · '),
    },
    'Blueprint ready for approval',
  );
  return parsed;
}

export interface TurnOptions {
  role?: 'builder' | 'architect';
  effort?: string;
  silent?: boolean;
  skipVerify?: boolean;
}

/** One user turn: paced, streamed, tool-validated, verified (§8.1). */
export async function runAgentTurn(
  userText: string,
  opts: TurnOptions = {},
): Promise<void> {
  if (running) {
    useUi.getState().toast('muse is already working — Stop first.', 'warn');
    return;
  }
  running = true;
  controller = new AbortController();
  turnScreenAdds = 0;
  changedThisTurn = false;
  const agent = useAgent.getState();
  agent.startTurn();
  const startedAt = Date.now();
  startHeartbeat(startedAt);
  const before = useProject.getState().doc;

  if (useAgent.getState().demoMode) {
    const { runDemoTurn } = await import('./demo/agent');
    try {
      await runDemoTurn(userText, { stopSignal: controller.signal, turnScreenAdds });
    } catch (err) {
      if (!(err instanceof MuseError && err.code === 'aborted')) wrapError(err, userText);
    } finally {
      stopHeartbeat();
      useAgent.getState().endTurn();
      running = false;
      controller = null;
    }
    return;
  }

  try {
    const messages = contextMessages(before, userText);
    // Wonder mode (§6.1): an opt-in, 4x-priced planning round on the architect
    // role. Only the FIRST turn — before anything exists to fill — and never
    // for the routine edits that follow.
    const wonder = useAgent.getState().wonder && before.screens.length === 0;
    const result = await executeToolLoop({
      messages,
      maxCalls: TURN_CALL_CAP,
      role: opts.role || (wonder ? 'architect' : 'builder'),
      effort: opts.effort || (wonder ? 'max' : 'medium'),
    });
    if (result.stopped) {
      addSystem(
        `Stopped — ${useProject.getState().doc.opLog.length - before.opLog.length} batches applied, nothing lost.`,
      );
      return;
    }
    if (result.changed && !result.choiceAsked && !opts.skipVerify) {
      const doc = useProject.getState().doc;
      const ids = doc.screens.map((s) => s.id);
      await verifyGate(userText, doc, ids);
    }
    if (!result.finished && !result.choiceAsked && !result.stopped) {
      addAgent("That's where this turn landed. Look it over, or tell me the next move.");
    }
  } catch (err) {
    if (err instanceof MuseError && err.code === 'aborted') {
      addSystem('Stopped — applied batches stay, nothing lost.');
    } else {
      wrapError(err, userText);
    }
  } finally {
    stopHeartbeat();
    useAgent.getState().endTurn();
    running = false;
    controller = null;
  }
}

export interface FillOptions {
  mode: 'blueprint' | 'steady' | 'fast';
}

/** The fill queue: one screen at a time, N-of-M, Stop, per-screen snapshots. */
export async function runFillQueue(options: FillOptions): Promise<void> {
  if (running) return;
  const doc = useProject.getState().doc;
  const blueprint = doc.blueprint?.text || '';
  if (!blueprint) {
    await runAgentTurn('Build the screens for this project.');
    return;
  }
  running = true;
  controller = new AbortController();
  turnScreenAdds = 1;
  changedThisTurn = false;
  useAgent.getState().startTurn();
  const startedAt = Date.now();
  startHeartbeat(startedAt);

  const parsed = parseBlueprint(blueprint, doc.tokens);
  const targets = parsed.screens.length
    ? parsed.screens
    : doc.screens.map((s) => ({ id: s.id, name: s.name, root: s.root }));
  const card = addCard(
    'progress',
    {
      title: 'Building screens',
      parts: targets.map((s) => ({ id: s.id, label: s.name, state: 'queued' })),
      startedAt,
    },
    'Building screens',
  );
  useAgent.getState().setProgress({
    title: 'Building screens',
    startedAt,
    live: '',
    parts: targets.map((s) => ({ id: s.id, label: s.name, state: 'queued' as const })),
  });

  try {
    for (let i = 0; i < targets.length; i += 1) {
      if (controller.signal.aborted) break;
      const target = targets[i];
      const existing = useProject.getState().doc.screens.find((s) => s.id === target.id);
      if (!existing) {
        const provisional = parsed.screens.find((s) => s.id === target.id);
        const create = useProject.getState().applyBatch(
          [
            {
              op: 'addScreen',
              screen: provisional
                ? {
                    id: provisional.id,
                    name: provisional.name,
                    root: provisional.root,
                    ...(provisional.entry ? { entry: true } : {}),
                  }
                : {
                    id: target.id,
                    name: target.name,
                    root: target.root,
                    entry: useProject.getState().doc.screens.length === 0,
                  },
            },
          ],
          { source: 'agent', screenAddsThisTurn: 0 },
        );
        if (create.errors.length) {
          useAgent.getState().patchPart(target.id, {
            state: 'failed',
            note: create.errors.map((e) => e.code).join(', '),
          });
          continue;
        }
        changedThisTurn = true;
      }
      useAgent.getState().patchPart(target.id, { state: 'active' });
      useAgent
        .getState()
        .patchProgress({ live: `Screens ${i + 1} of ${targets.length} — ${target.name}…` });
      useProject.getState().patchRail(card.id, {
        card: {
          kind: 'progress',
          state: 'pending',
          data: {
            title: `Screens ${i + 1} of ${targets.length}`,
            parts: useAgent.getState().progress?.parts || [],
            startedAt,
          },
        },
      });
      const section =
        parsed.text
          .split(/^\s*SCREEN:/im)
          .find((chunk) =>
            chunk.trim().toLowerCase().startsWith(target.name.toLowerCase()),
          ) || target.name;
      const fillText = fillPrompt({
        screenName: target.name,
        section: section.slice(0, 1600),
        lookLine: `pad ${parsed.look.pad}, gap ${parsed.look.gap}, card radius ${parsed.look.cardRadius}, title ${parsed.look.title}px, body ${parsed.look.body}px`,
        tokenSheet: buildTokenSheet(useProject.getState().doc.tokens),
        indexRules:
          '^[a-z][a-z0-9_]{2,30}$; semantic prefixes (btn_, txt_, card_, input_); unique per project',
        existingIndex: buildProjectIndex(useProject.getState().doc).slice(0, 1400),
      });
      try {
        await executeToolLoop({
          messages: contextMessages(useProject.getState().doc, fillText),
          maxCalls: 6,
          role: 'builder',
          effort: options.mode === 'fast' ? 'low' : 'medium',
        });
        useAgent.getState().patchPart(target.id, { state: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        useAgent
          .getState()
          .patchPart(target.id, { state: 'failed', note: message.slice(0, 300) });
      }
    }

    const stopped = controller.signal.aborted;
    useProject.getState().patchRail(card.id, {
      card: {
        kind: 'progress',
        state: stopped ? 'cancelled' : 'answered',
        data: {
          title: stopped ? 'Stopped' : 'Screens built',
          parts: useAgent.getState().progress?.parts || [],
          startedAt,
        },
      },
    });

    if (!stopped) {
      const latest = useProject.getState().doc;
      await verifyGate(
        blueprint.slice(0, 240),
        latest,
        latest.screens.map((s) => s.id),
      );
      const count = latest.screens.length;
      addAgent(
        `${count} screen${count === 1 ? '' : 's'} ready — your tokens, real components, and it runs. Hit ▶ Run.`,
      );
    } else {
      addSystem('Stopped — finished screens stay, the queue clears.');
    }
  } catch (err) {
    wrapError(err, 'Continue the build.');
  } finally {
    stopHeartbeat();
    useAgent.getState().endTurn();
    useAgent.getState().setProgress(null);
    running = false;
    controller = null;
  }
}

export async function approveBlueprint(
  mode: 'blueprint' | 'steady' | 'fast',
): Promise<void> {
  const doc = useProject.getState().doc;
  if (!doc.blueprint?.text) return;
  useProject.getState().setBlueprint(doc.blueprint.text, true);
  addSystem('✓ Blueprint approved');
  if (mode === 'blueprint') {
    addSystem('Blueprint stored — build it whenever you are ready.');
    return;
  }
  await runFillQueue({ mode });
}

export async function adjustBlueprint(wish: string): Promise<void> {
  if (running) return;
  const doc = useProject.getState().doc;
  const base = doc.blueprint?.text || '';
  useProject.getState().addRail({ role: 'user', text: wish });
  running = true;
  controller = new AbortController();
  useAgent.getState().startTurn();
  startHeartbeat(Date.now());
  try {
    const models = useAgent.getState().models;
    const wonder = useAgent.getState().wonder;
    const result = await chatStream({
      model: (wonder ? models?.architect.id : models?.builder.id) || 'muse-spark-1.3',
      effort: wonder ? 'max' : 'high',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: `CURRENT BLUEPRINT:\n${base}` },
        { role: 'system', content: `TOKEN SHEET:\n${buildTokenSheet(doc.tokens)}` },
        { role: 'user', content: adjustBlueprintPrompt(wish) },
      ],
      signal: controller.signal,
      maxTokens: 1800,
      onText: (t) => useAgent.getState().appendText(t),
    });
    recordReceipt(result, wonder ? 'architect' : 'builder', base.length, []);
    const text = result.text || base;
    useProject.getState().setBlueprint(text, false);
    const parsed = parseBlueprint(text, doc.tokens);
    addCard(
      'blueprint',
      {
        blueprint: text,
        screens: parsed.screens.map((s) => ({ id: s.id, name: s.name })),
        look: parsed.look,
        stateKeys: parsed.stateKeys,
        wiring: parsed.wiring,
      },
      'Revised blueprint',
    );
    addAgent('Revised. Approve it, or adjust again.');
  } catch (err) {
    wrapError(err, wish);
  } finally {
    stopHeartbeat();
    useAgent.getState().endTurn();
    running = false;
    controller = null;
  }
}

export function registerChoiceAnswer(cardId: string, label: string) {
  const rail = useProject.getState().doc.rail;
  const card = rail.find((r) => r.id === cardId);
  if (!card?.card) return;
  useProject.getState().patchRail(cardId, {
    card: { ...card.card, state: 'answered', data: { ...card.card.data, picked: label } },
  });
}

export function firstScreenId(doc: ProjectDoc): string {
  return entryScreen(doc)?.id || doc.screens[0]?.id || '';
}

export type { Action };
