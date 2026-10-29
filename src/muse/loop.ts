import { zodToJsonSchema } from 'zod-to-json-schema';
import { editCanvasWire, readCanvasWire, illustrateImagesWire } from '../types/wire';
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
  TYPED_OPTIONS_CORRECTION,
  adjustBlueprintPrompt,
  fillPrompt,
  rebuildNote,
  reviewerPrompt,
} from './prompts';
import type { Action, OpError, ProjectDoc } from '../types/tree';
import { entryScreen } from '../ops/treeUtils';
import { lintScreen, type LintFinding } from './qualityLint';
import { autoIllustrate, illustrateTargets, type ImageTarget } from './imagery';

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
    'Apply a batch of ops to the canvas. Add parents before children and split large screens into ordered batches of at most 12 ops. Each batch is all-or-nothing; the hard limit is 40 ops. ' +
    'Each op = {op:"add",parentId,node:{type,id?,props?,styles?,children?}} | {op:"remove",id} | {op:"move",id,parentId} | ' +
    '{op:"setProps",id,props} | {op:"setStyles",id,styles} | {op:"setText",id,text} | {op:"rename",id,name} | ' +
    '{op:"addScreen",screen:{id,name,root}} | {op:"removeScreen",id} | {op:"renameScreen",id,name} | {op:"setEntry",id} | ' +
    '{op:"setTokens",patch} | {op:"saveComponent",name,description,root} | {op:"placeComponent",name,parentId}. ' +
    'Nest at most 3 levels inside one add node; deeper structure is more add ops with parentId in the same call. ' +
    'Events ride on setProps: {events:{tap:[{type:"navigate",to:"home"}]}} — types navigate, setState, toggle, toast, openUrl, when. ' +
    'styles keys: gap, align(start|center|end|stretch = align children), justify(start|center|end|space-between = distribute), wrap, grow(1 = fill leftover space), selfAlign, padding, width/height ("match"|"hug"|length), background, color, fontSize, fontWeight, textAlign, borderRadius, boxShadow, opacity. ' +
    'props are per-type: button{text,variant,icon,disabled}, input{placeholder,bindKey,inputType}, list{dataKey}, grid{columns}. ' +
    'Long batches: split them into several edit_canvas calls of at most 12 ops each. An oversized call can be cut off mid-JSON and dropped without being applied.',
  illustrate_images:
    'Generate images for up to six existing hero, image or card nodes: targets [{id, prompt?}]. One image per target, with palette-aware prompts.',
  finish: 'End the turn with a two-sentence user-facing summary.',
};

/**
 * The wire schema for a tool. `edit_canvas` and `read_canvas` use the shallow
 * mirrors from `src/types/wire.ts`. Two upstream refusals are why:
 *
 * - `400 Recursive JSON schemas are not currently supported` — the truthful
 *   schemas in `src/types/tools.ts` are recursive.
 * - `400 JSON schema exceeds the maximum nesting depth of 10 levels` — even a
 *   bounded tree mirror inlined to ~27 levels. The wire now names the op and
 *   leaves the payload open; `TOOL_DESCRIPTIONS.edit_canvas` carries the
 *   grammar and `opSchema` remains the runtime authority.
 */
function wireSchema(name: ToolName) {
  if (name === 'edit_canvas') return editCanvasWire;
  if (name === 'read_canvas') return readCanvasWire;
  if (name === 'illustrate_images') return illustrateImagesWire;
  return toolSchemas[name];
}

/**
 * Cosmetic but load-bearing clean-up of the emitted JSON Schema:
 *
 * - `additionalProperties: {}` (what `z.record(z.unknown())` becomes) means
 *   "anything", and `true` says the same thing in a form every validator
 *   accepts.
 * - an empty `required` list carries no information and is dropped, because a
 *   schema nobody can read is a schema the model guesses at.
 *
 * Emptied containers are removed bottom-up, so a parent never keeps a key that
 * points at nothing.
 */
function tighten(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tighten);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const next = tighten(value);
    // An empty `properties` stays: a no-argument tool still reads as an object.
    if (key === 'required' && Array.isArray(next) && next.length === 0) continue;
    if (key === 'additionalProperties' && next && typeof next === 'object') {
      if (Object.keys(next as object).length === 0) {
        out[key] = true;
        continue;
      }
    }
    out[key] = next;
  }
  return out;
}

/**
 * `$refStrategy: 'none'` inlines every sub-schema. Without it zod hoists any
 * schema object used twice (a node appears in `add`, `addScreen` and
 * `saveComponent`) into `definitions` and points at it with `$ref` — and Meta
 * answers a `$ref` with 400 "Recursive JSON schemas are not currently
 * supported", which killed every turn before the first token.
 */
export function toolParameters(name: ToolName): Record<string, unknown> {
  const raw = zodToJsonSchema(wireSchema(name), {
    target: 'openApi3',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  // Belt and braces: never send a reference to anywhere.
  delete raw.$schema;
  delete raw.definitions;
  return tighten(raw) as Record<string, unknown>;
}

export const TOOL_DEFS = TOOL_NAMES.map((name) => ({
  type: 'function' as const,
  function: {
    name,
    description: TOOL_DESCRIPTIONS[name],
    parameters: toolParameters(name),
  },
}));

let controller: AbortController | null = null;
let running = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let turnScreenAdds = 0;
let changedThisTurn = false;

/**
 * The one turn that starts from a card tap, or null.
 *
 * Why this exists: `history()` replays prose only, so a tap used to arrive at
 * the model as a bare user line — "Museware Default" — with no trace of the
 * card that asked for it and no trace that the question was already answered.
 * The model answered that line by offering directions again, every tap, for as
 * long as the user was willing to tap: a loop that costs money and builds
 * nothing. A tap is a DECISION, not a new request, and this is what tells the
 * model that.
 */
let pickTurn: PickDirective | null = null;

export interface PickDirective {
  question: string;
  label: string;
  hexes: string[];
}

/**
 * A greeting is not a build order. The first turn of the loop in the wild was
 * "Hello" answered with a look-choice card, so the app now refuses to open the
 * design flow on small talk — belt as well as braces, because a prompt rule is
 * only a request and this is a guarantee.
 */
const SMALL_TALK =
  /^(?:hi|hii+|hey|heya|hello|yo|sup|hiya|good (?:morning|afternoon|evening)|how are you|how's it going|thanks|thank you|cheers)[\s!.,?~-]*$/i;

export function isSmallTalk(text: string): boolean {
  return SMALL_TALK.test(text.trim());
}

let smallTalkTurn = false;

/** The sentence that turns a tap into a decision the model cannot re-ask. */
export function pickReceipt(pick: PickDirective): string {
  const colours = pick.hexes.length
    ? ` Its palette is already on the token sheet — brand ${pick.hexes[0]}` +
      `${pick.hexes[1] ? `, secondary ${pick.hexes[1]}` : ''} — applied by the app, so do not call ` +
      'set_design_tokens for these colours again.'
    : '';
  return (
    `PICK RECEIPT: the user just tapped "${pick.label}" on your card "${pick.question}". ` +
    `That decision is final and is already recorded.${colours} ` +
    'Do NOT call ask_choice in this turn, do not offer more directions, and do not stop at an ' +
    'acknowledgement. Your next move is propose_blueprint with the plan for their app — or, if a ' +
    'blueprint is already on screen, build the screens it asks for.'
  );
}

/**
 * What has already been decided, restated on every turn.
 *
 * `history()` carries the last few prose lines and nothing else, so without
 * this the model begins each turn with no memory of the cards it sent or the
 * palette the user chose — which is exactly how "Museware Default Blue" got
 * offered back to the person who had just picked it.
 */
export function decisionLedger(doc: ProjectDoc): string {
  const picks: string[] = [];
  for (const entry of doc.rail) {
    const card = entry.card;
    if (card?.kind !== 'choice' || card.state !== 'answered') continue;
    const data = card.data as { question?: string; picked?: string };
    if (!data.picked) continue;
    picks.push(
      data.question ? `"${data.picked}" (for "${data.question}")` : `"${data.picked}"`,
    );
  }
  const theme = doc.tokens.openuiTheme;
  return [
    picks.length
      ? `DECIDED ALREADY — tapped: ${picks.slice(-4).join('; ')}. Never ask for these again.`
      : '',
    `TOKEN SHEET NOW — brand ${theme.brand_color}, secondary ${theme.secondary_color}.`,
    doc.blueprint?.text
      ? 'A blueprint is on screen awaiting approval.'
      : 'No blueprint yet.',
  ]
    .filter(Boolean)
    .join('\n');
}

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

/** Repair common incomplete JSON without changing already-valid arguments. */
export function repairJson(raw: string): string | null {
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
  }
  if (!text) return '{}';

  // Remove commas before a closing bracket, but never edit text inside strings.
  const removeTrailingCommas = (value: string) => {
    let output = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      if (inString) {
        output += ch;
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else {
        if (ch === '"') inString = true;
        if (ch === ',' && /^[\s]*[}\]]/.test(value.slice(i + 1))) continue;
        output += ch;
      }
    }
    return output;
  };

  const close = (prefix: string): string | null => {
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    for (const ch of prefix) {
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
      else if (ch === '}' || ch === ']') {
        if (stack.pop() !== ch) return null;
      }
    }
    let result = prefix;
    if (inString) {
      if (escaped) result = result.slice(0, -1);
      result += '"';
    }
    result += stack.reverse().join('');
    return result;
  };
  const valid = (candidate: string | null): string | null => {
    if (candidate === null) return null;
    for (const attempt of [candidate, removeTrailingCommas(candidate)]) {
      try {
        JSON.parse(attempt);
        return attempt;
      } catch {
        /* try the next candidate */
      }
    }
    return null;
  };
  const original = valid(text);
  if (original !== null) return original;
  const closed = valid(close(text));
  if (closed !== null) return closed;

  // Fall back at value boundaries, keeping the longest complete prefix.
  let inString = false;
  let escaped = false;
  const boundaries: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') {
        inString = false;
        boundaries.push(i + 1);
      }
    } else if (ch === '"') inString = true;
    else if (ch === '}' || ch === ']' || ch === ',' || /[0-9eE]/.test(ch))
      boundaries.push(i + 1);
  }
  for (let i = boundaries.length - 1; i >= 0; i -= 1) {
    const candidate = valid(close(text.slice(0, boundaries[i])));
    if (candidate !== null) return candidate;
  }
  return null;
}

const TOOL_SPLIT_NUDGE =
  'Your previous tool call did not arrive complete and was dropped, not applied. Re-send the same work as SEVERAL edit_canvas calls of at most 12 ops each; run finish() only after every op has been applied.';

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
      content: `CANVAS INDEX:\n${index}\n\n${decisionLedger(doc)}${extraSystem.length ? `\n${extraSystem.join('\n')}` : ''}`,
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
  // The contributor tier is a dev/testing switch with a legal catch (§6.1):
  // its output can never leave a production build, so touching it marks the doc.
  const contributor = useAgent.getState().contributorMode && import.meta.env.DEV;
  const model =
    opts.model ||
    (contributor
      ? models?.contributor.id
      : opts.role === 'architect'
        ? models?.architect.id
        : models?.builder.id) ||
    'muse-spark-1.3';
  if (contributor) useProject.getState().markContributor();
  const effort = opts.effort || 'medium';
  const messages = [...opts.messages];
  let calls = 0;
  let finished = false;
  let choiceAsked = false;
  let correctedPick = false;
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
        contributor ? 'contributor' : opts.role || 'builder',
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

    if (result.finishReason === 'length') {
      addSystem(
        'The model hit the output cap mid-call — that batch was dropped before it could corrupt anything. Asking for smaller chunks.',
      );
      messages.push({ role: 'user', content: TOOL_SPLIT_NUDGE });
      calls += 1;
      if (calls < opts.maxCalls) continue;
      break;
    }

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
        /*
         * Same loop, typed instead of tool-called: options printed as prose
         * after a tap. The fallback must not turn those into a second card —
         * it corrects the model once, then stops asking either way.
         */
        if (pickTurn) {
          if (!correctedPick) {
            correctedPick = true;
            addSystem('Correction: the user already picked — no second choice card.');
            messages.push({ role: 'assistant', content: result.text });
            messages.push({
              role: 'user',
              content: `${TYPED_OPTIONS_CORRECTION} ${pickReceipt(pickTurn)}`,
            });
            calls += 1;
            if (calls < opts.maxCalls) continue;
          }
          if (result.text) addAgent(result.text);
          break;
        }
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
    const repaired = result.toolCalls.map((call, index) => ({
      call,
      id: call.id || `call_${calls}_${call.name}_${index}`,
      args: repairJson(call.arguments || ''),
    }));
    const validCalls = repaired.filter(
      (item): item is typeof item & { args: string } => item.args !== null,
    );
    const usable = validCalls.slice(0, Math.max(0, opts.maxCalls - calls));
    const dropped = repaired.length - usable.length;
    if (dropped)
      addSystem(
        `${dropped} tool call(s) were invalid or exceeded the call limit and were dropped; the rest ran.`,
      );
    if (usable.length)
      messages.push({
        role: 'assistant',
        content: result.text || '',
        tool_calls: usable.map(({ call, id, args }) => ({
          id,
          type: 'function' as const,
          function: { name: call.name, arguments: args },
        })),
      });

    let endTurn = false;
    for (const { call, id, args: cleanArgs } of usable) {
      calls += 1;
      useAgent.getState().bumpCalls();
      if (controller?.signal.aborted) {
        stopped = true;
        break;
      }
      const name = call.name as ToolName;
      let outcome: string;
      try {
        const parsedArgs = JSON.parse(cleanArgs) as unknown;
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
        tool_call_id: id,
        name,
        content: outcome.slice(0, MAX_RESULT),
      });
      if (endTurn || finished || choiceAsked) break;
    }
    if (dropped && !stopped && !endTurn && !finished && !choiceAsked) {
      messages.push({ role: 'user', content: TOOL_SPLIT_NUDGE });
      calls += 1;
      if (calls < opts.maxCalls) continue;
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
  if (
    smallTalkTurn &&
    (name === 'ask_choice' || name === 'propose_blueprint' || name === 'edit_canvas')
  ) {
    return {
      text:
        'E_SMALL_TALK: that message was a greeting, not a build order. No card, no blueprint, ' +
        'no ops. Answer in one or two sentences and call finish().',
    };
  }
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
      /*
       * The deterministic half of the loop fix. The receipt above tells the
       * model not to ask again; this makes it impossible. A second card in a
       * turn that started from a tap would be the same question the user just
       * answered, so no card is added and the model is told what to do next.
       */
      if (pickTurn) {
        return {
          text:
            `E_CHOICE_REPEAT: the user already answered "${pickTurn.question}" with ` +
            `"${pickTurn.label}" — that is the loop they are stuck in, and no card was added. ` +
            'Call propose_blueprint now with the plan, or edit_canvas if a blueprint already exists.',
        };
      }
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

    case 'illustrate_images': {
      const { targets } = args as { targets: ImageTarget[] };
      const results = await illustrateTargets(targets, { signal: controller?.signal });
      return {
        text: results.map((r) => `${r.id}: ${r.ok ? 'applied' : r.message}`).join('\n'),
      };
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
  findings: string,
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
        { role: 'user', content: reviewerPrompt(task, outline, findings) },
      ],
      signal: controller?.signal,
      maxTokens: 700,
    });
    recordReceipt(result, 'reviewer', outline.length, []);
    const text = result.text.trim();
    if (/^PASS\b/i.test(text)) return { verdict: 'pass', notes: '' };
    if (/^PROBLEMS/i.test(text)) return { verdict: 'problems', notes: text.slice(0, 1200) };
    return { verdict: text ? 'problems' : 'error', notes: text.slice(0, 1200) };
  } catch (err) {
    return {
      verdict: 'error',
      notes: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    };
  }
}

function findingsFor(doc: ProjectDoc, screenIds: string[]): LintFinding[] {
  return doc.screens
    .filter((screen) => screenIds.includes(screen.id))
    .flatMap((screen) => lintScreen(screen, doc.tokens));
}

function formatFindings(findings: LintFinding[]): string {
  return findings.length
    ? findings.map((f) => `[${f.severity}] ${f.nodeId}: ${f.message}`).join('\n')
    : 'No lint findings.';
}

export async function verifyGate(
  task: string,
  doc: ProjectDoc,
  screenIds: string[],
): Promise<void> {
  useAgent.getState().setVerification('running');
  let findings = findingsFor(doc, screenIds);
  const blocking = findings.filter((f) => f.severity === 'block');
  if (blocking.length) {
    useAgent.getState().setVerification('problems', formatFindings(blocking));
    addSystem(
      `Quality lint found ${blocking.length} blocking issue(s); attempting one targeted repair.\n${formatFindings(blocking)}`,
    );
    useAgent.getState().setLive('Repairing quality issues…');
    const affected = [
      ...new Set(
        doc.screens
          .filter((s) => lintScreen(s, doc.tokens).some((f) => f.severity === 'block'))
          .map((s) => s.id),
      ),
    ];
    try {
      await executeToolLoop({
        messages: [
          {
            role: 'system',
            content:
              'Repair ONLY the listed quality findings in the affected screen outline. Use setProps, setText, setStyles or add an image; do not alter unrelated nodes or screens. Use small edit_canvas batches then finish.',
          },
          {
            role: 'user',
            content: `FINDINGS:\n${formatFindings(blocking)}\nAFFECTED OUTLINE:\n${canvasOutline(doc, affected)}`,
          },
        ],
        maxCalls: 8,
        role: 'builder',
        effort: 'high',
      });
    } catch (err) {
      addSystem(
        `Quality repair failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    doc = useProject.getState().doc;
    findings = findingsFor(doc, screenIds);
  }
  const remaining = findings.filter((f) => f.severity === 'block');
  if (remaining.length) {
    const notes = formatFindings(findings);
    useAgent.getState().setVerification('problems', notes);
    addSystem(`Not verified — quality lint still found blocking issues:\n${notes}`);
    return;
  }
  const outline = canvasOutline(doc, screenIds);
  const first = await reviewer(task, outline, formatFindings(findings));
  if (first.verdict === 'pass') {
    useAgent
      .getState()
      .setVerification('pass', findings.length ? formatFindings(findings) : null);
    addSystem(
      `✓ Verified — lint passed and reviewer said PASS${findings.length ? ` (warnings:\n${formatFindings(findings)})` : ''}`,
    );
    return;
  }
  if (first.verdict === 'error') {
    useAgent
      .getState()
      .setVerification(
        'unverified',
        `${first.notes || 'Reviewer failed.'}\n${formatFindings(findings)}`,
      );
    addSystem(
      `Unverified — lint passed, but reviewer failed (${first.notes || 'no detail'}).\n${formatFindings(findings)}`,
    );
    return;
  }
  addSystem('Reviewer saw problems — one rebuild round.');
  try {
    await executeToolLoop({
      messages: contextMessages(doc, rebuildNote(first.notes)),
      maxCalls: 8,
      role: 'builder',
      effort: 'high',
    });
  } catch (err) {
    addSystem(`Rebuild call failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const after = useProject.getState().doc;
  findings = findingsFor(after, screenIds);
  if (findings.some((f) => f.severity === 'block')) {
    useAgent.getState().setVerification('problems', formatFindings(findings));
    addSystem(
      `Not verified — rebuild introduced blocking quality issues:\n${formatFindings(findings)}`,
    );
    return;
  }
  const second = await reviewer(
    task,
    canvasOutline(after, screenIds),
    formatFindings(findings),
  );
  const state =
    second.verdict === 'pass'
      ? 'pass'
      : second.verdict === 'error'
        ? 'unverified'
        : 'problems';
  useAgent
    .getState()
    .setVerification(
      state,
      [second.notes, findings.length ? formatFindings(findings) : '']
        .filter(Boolean)
        .join('\n') || null,
    );
  addSystem(
    state === 'pass'
      ? '✓ Rebuild verified — PASS'
      : state === 'unverified'
        ? `Unverified — reviewer failed (${second.notes || 'no detail'}).`
        : `Not verified — reviewer still saw problems: ${second.notes}`,
  );
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
  if (code === 'house_key_rejected') {
    // A refused key is NOT a spent budget. Say which one it was.
    useAgent.getState().setStatus({
      configured: false,
      demoMode: false,
      houseKey: 'rejected',
      statusError: message,
    });
    offerKey(
      `The server's shared key was rejected by Meta — not a budget problem, the key itself. ${message}`,
      userText,
    );
    return;
  }
  if (code === 'house_key_rate_limited') {
    useAgent.getState().setStatus({
      configured: false,
      demoMode: false,
      houseKey: 'rate_limited',
      statusError: message,
    });
    offerKey(`Meta is rate-limiting the shared key right now. ${message}`, userText);
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
  /** Set when this turn is the answer to a choice card the user just tapped. */
  pick?: PickDirective;
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
  pickTurn = opts.pick ?? null;
  smallTalkTurn = isSmallTalk(userText);
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
      pickTurn = null;
      smallTalkTurn = false;
    }
    return;
  }

  try {
    const messages = contextMessages(
      before,
      userText,
      pickTurn ? [pickReceipt(pickTurn)] : [],
    );
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
      const ids = doc.screens
        .filter((screen) => {
          const old = before.screens.find((item) => item.id === screen.id);
          return !old || JSON.stringify(old) !== JSON.stringify(screen);
        })
        .map((screen) => screen.id);
      await autoIllustrate(
        ids,
        userText,
        useAgent.getState().buildImages,
        controller.signal,
      );
      await verifyGate(userText, useProject.getState().doc, ids);
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
    pickTurn = null;
    smallTalkTurn = false;
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

  const beforeScreens = new Map(
    doc.screens.map((screen) => [screen.id, structuredClone(screen)]),
  );
  const completed = new Set<string>();
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
                    root: { ...provisional.root, children: [] },
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
        completed.add(target.id);
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
      await autoIllustrate(
        [...completed],
        blueprint,
        useAgent.getState().buildImages,
        controller.signal,
      );
      await verifyGate(blueprint.slice(0, 240), useProject.getState().doc, [...completed]);
      for (const id of completed)
        useProject
          .getState()
          .rememberScreenBuild(card.id, id, beforeScreens.get(id) ?? null);
      const count = latest.screens.length;
      addAgent(
        useAgent.getState().verification === 'pass'
          ? `${count} screen${count === 1 ? '' : 's'} ready — your tokens, real components, and it runs. Hit ▶ Run.`
          : `${count} screen${count === 1 ? '' : 's'} built, but not verified. See the quality notes above before relying on the result.`,
      );
    } else {
      for (const id of completed)
        useProject
          .getState()
          .rememberScreenBuild(card.id, id, beforeScreens.get(id) ?? null);
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

export async function adjustBlueprint(wish: string, adjustCount = 1): Promise<boolean> {
  if (running) return false;
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
        adjustCount,
        screens: parsed.screens.map((s) => ({ id: s.id, name: s.name })),
        look: parsed.look,
        stateKeys: parsed.stateKeys,
        wiring: parsed.wiring,
      },
      'Revised blueprint',
    );
    addAgent('Revised. Approve it, or adjust again.');
    return true;
  } catch (err) {
    wrapError(err, wish);
    return false;
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
