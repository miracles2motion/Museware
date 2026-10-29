# MUSEWARE.md — The Complete Build Specification

**Status:** Authoritative spec. Any agent (or human) MUST be able to build the entire
product from scratch to finish using only this file. Nothing here requires access to
any prior conversation. Where a decision was painful to learn elsewhere, the lesson is
recorded as a **LAW** — do not relitigate laws during implementation.

**Spec version:** 1.6 — seventh pass: **the layout vocabulary**. One home per
concept (§2, §4.4): `styles` own presentation and layout, `props` own content
and behaviour; a container's `align` is align-items and its `justify` is
justify-content, while a child's `selfAlign` is align-self and its `grow` is
flex-grow (Sketchware's weight); sizing is `match` | `hug` | a length on BOTH
axes. The Style tab is rendered from one dictionary (§9.3), property sheets
carry a group and a hint, and events are a per-type map (§4.2). Also fixed and
now pinned: everything on the canvas selects in edit mode (§9.2), the artboard
keeps its own scale through a breakpoint round trip (§9.7), and saved projects
migrate to layout v2 on load (§11).

**Earlier passes:** 1.5 — sixth pass: the landing page (live-canvas hero), first-run
entry, the three-tier mw token architecture (own system, calibrated by the
iOS/Windows foundations, openui-1.0 architecture), and the professional-polish
checklist (the muse family strategy from v1.4 stands
same API key), Screenshot→Canvas via SAM, voice input, Muse Image generation,
and the full UI spec — Museware's own design language, desktop/tablet/mobile
layouts, the agent rail in detail (project-file format: `museware/1`).

**Product one-liner (the pitch):**
> Museware is the canvas where Meta's muse builds with you: every AI action is a
> reviewable, undoable operation on the same drag-and-drop canvas you edit by hand.

**Context for the builder:** this is for a Meta AI hackathon. One model family (muse,
including the top "muse code" tier) does all the work. ~$160 API credit (functionally
unlimited: one full app build costs well under $1). The app is a **web app only**.
"Mobile" is an export story (PWA install / Capacitor wrap), never a second pipeline.

**Reference product (yardstick only, NEVER copy code):** Sketchware Pro — an Android
visual builder with an AI agent. Its agent patterns (tool loop, blueprint flow,
verification gate, bounded context, board/stop UX) were field-tested for weeks against
real quota exhaustion, model drift, and crashes. Those patterns are distilled below as
laws. Sketchware Pro is source-available, NOT open-source — zero code reuse.

---

## 0. The Laws (non-negotiable, learned from field failures)

1. **The model never types UI — it calls tools.** Every canvas change is a tool call
   with JSON arguments. Free-form "here is the HTML:" answers are rejected. A small
   model WILL type its answer as markdown if you let it (proven: it typed colour
   options as text despite explicit instructions). The defence is architecture, not
   instructions.
2. **Batched operations.** One tool call may carry ALL widget operations for a screen.
   Never one-widget-per-call (a 20-widget screen at 1 call/widget is 20 requests —
   minutes of dead air). Prompt the model explicitly: "one edit call with ALL the
   add operations, then one styling call."
3. **Decide up front, fill in blanks.** Blueprint first (screens + components + hard
   LOOK numbers), user approves, then filling happens. Never let the model improvise
   the whole app turn-by-turn.
4. **Constrained vocabulary.** The model picks components from the fixed library
   (Section 4) and colour tokens from the design system (Section 5). It never invents
   arbitrary CSS hex values when a token exists.
5. **Verify before show.** After the model finishes a work package, render the result
   and make the model review it (PASS / PROBLEMS). Failed verification gets ONE
   rebuild attempt. This gate is the difference between "demo junk" and "demo good."
6. **Bound every prompt.** Design-token sheet for the AI ≤ 1800 chars. Tool results
   ≤ 8000 chars (older ones in history compacted to a 160-char remembrance). History:
   keep the last 8 messages, trim assistant messages > 700 chars to head+tail.
   The full design system NEVER enters a prompt — the summary sheet does.
7. **Everything visible, everything stoppable.** Progress lines with a 30-second
   heartbeat ("Still working… 1m30s. Silence is normal."), N-of-M progress, a Stop
   button that is ALWAYS on screen while the agent runs, per-step undo.
8. **Persist the instant it exists.** The blueprint, the token sheet, the op log —
   saved on CREATION, not on completion. A killed browser tab must never lose a
   generated artifact ("no way to get back the blueprint created" was a real bug).
9. **One pinned model PER ROLE — the matrix (§6.1), never dynamic routing.** No
   router, no Auto mode, no failover zoo (field data: 135 failovers in one session,
   design redone 3× by 3 different models). Roles are FIXED in config: spark-1.3
   builds, wonder plans the hard parts, contributor saves money in dev, image/
   SAM/voice have single dedicated jobs. The model never picks its own model.
10. **Pace requests.** ≥ 4000 ms between requests, hard per-turn op cap (24 tool
    calls/turn, then rollover to a new turn). One in-flight request at a time.
11. **Cards leave on answer.** Any decision card the user taps disappears from the
    chat, leaving a one-line record ("✓ Picked: Sunny Playground"). Dead clickable
    cards are a bug.
12. **The agent stops at creation milestones.** After the agent creates the project's
    first screens, it STOPS and hands control to the user (how-to-build card) — it must
    never run straight into filling/building ("why does it go ahead and start
    building?!!" was a real complaint). The mechanical gate: a turn that contains an
    `addScreen` op ENDS there (the loop forces `finish` right after the first
    screen-creating batch), and a SECOND `addScreen` within the same turn returns
    `E_BUILD_CARD`. Filling happens only via the fill queue after the user picks a
    mode. (User drags are exempt — this gates the model, not the human.)
13. **Answer from receipts.** Never claim a change happened unless the applied op log
    shows it. Progress lines come from real tool activity only.
14. **JSON is banned from chat text.** The model's user-facing text is prose. Data
    flows in tool arguments only. If the model prints JSON in a reply, the turn is
    retried once with a correction note.
15. **No-code is the ceiling, not the floor.** EVERY capability a user needs —
    layout, styling, logic, data — is reachable by drag, tap, and pick alone
    (palette, inspector, logic chips). The AI accelerates this; it is never a
    prerequisite. If a flow requires typing code, the design is wrong.
16. **One home per concept, one word per job.** A visual idea lives in exactly
    one place and is named for what it does: layout is `styles`, content is
    `props`; a container *aligns children*, a child *aligns in its parent*; a
    child that soaks up space is *grow*. Two fields with the same label doing
    different things is not a wording problem, it is a design failure — the
    user cannot learn a vocabulary whose words change meaning per panel (§4.4).

---

## 1. Stack & Project Layout (pinned — do not substitute)

```
React 18 + TypeScript + Vite 5        (demo-fast dev, easy deploy)
Zustand                               (state; ONE store, no redux ceremony)
dnd-kit                               (drag & drop; accessible, transform-based)
 nanoid                                (ids)
zod                                   (schema validation for tool args & project files)
No Tailwind, no CSS-in-JS libs.       Generated apps use plain CSS + custom properties
                                      (design tokens). Keeps codegen output clean and
                                      portable to PWA/Capacitor later.
```

```
museware/
  index.html
  vite.config.ts
  .env.example                # MUSE_API_KEY= , MUSE_BASE_URL= , MUSE_CODE_MODEL= , MUSE_CHAT_MODEL=
  src/
    main.tsx
    App.tsx                   # layout shell (see §9.1)
    store/
      useProject.ts           # the component tree + screens + tokens (single source of truth)
      useAgent.ts             # agent turn state machine, streaming, op queue
      useHistory.ts           # op log, undo/redo
      useUi.ts                # selection, panels, preview mode, modals
    types/
      tree.ts                 # ComponentNode, ScreenDoc, ProjectDoc, Op (§2, §3)
      tokens.ts               # DesignTokens (§5)
      tools.ts                # ToolCall/ToolResult zod schemas (§7)
    muse/
      client.ts               # fetch wrapper (streaming SSE), pacing, backoff (§6)
      prompts.ts              # system prompts, review prompt, blueprint prompt (§8)
      loop.ts                 # turn lifecycle: call → validate ops → apply → verify (§8)
      tokenSheet.ts           # bounded AI-facing design summary (§5.4)
      projectIndex.ts         # bounded AI-facing canvas summary (§8.2)
      typedOptions.ts         # fallback parser for typed-out choice lists (§8.6)
    ops/
      apply.ts                # pure op→tree reducer + validation (§3)
      snapshot.ts             # undo snapshots (structural clone of tree)
      validate.ts             # zod validation + semantic rules (§3.3)
    canvas/
      Canvas.tsx              # renders the tree live (§9.2)
      NodeView.tsx            # recursive renderer + drop targets + selection
      drag.ts                 # dnd-kit wiring, container rules
    inspector/
      Inspector.tsx           # props/style editor generated from schema (§9.3)
      Fields.tsx              # schema-driven field widgets
    layers/
      Layers.tsx              # tree panel: reorder, rename, delete, duplicate
    agentrail/
      Rail.tsx                # chat + cards (§9.5)
      cards/                  # BlueprintCard, ChoiceCard, ColorCard, BuildCard, ErrorCard
    preview/
      RunMode.tsx             # interactive preview: links, local state, forms (§9.6)
    export/
      reactCodegen.ts         # tree → React components (§10.1)
      pwa.ts                  # manifest + service worker template (§10.2)
      zip.ts                  # download bundle
    persist/
      save.ts                 # autosave to IndexedDB + project file I/O (§11)
    design/
      tokens.css              # Museware's own UI theme (dark, like a pro tool)
  public/
```

**Pinned versions (exact — no substitutes without editing this line):**
react 18.3.x, react-dom 18.3.x, typescript 5.5.x, vite 5.4.x, zustand 4.5.x,
@dnd-kit/core 6.1.x + @dnd-kit/sortable 8.0.x + @dnd-kit/utilities 3.2.x,
zod 3.23.x, zod-to-json-schema 3.23.x, nanoid 5.0.x, lucide-static (icons —
the NAME whitelist is §4), jszip 3.10.x, idb 8.0.x, vitest 2.x.

**Code rules:** TS `strict: true` (no `any` outside zod catch-guards);
functional components only; files kebab-case, components PascalCase; store
actions are verbs (`applyOps`, `undo`); no CSS frameworks (see stack); every
module exports the types it owns; ESLint (typescript-eslint + react-hooks)
and prettier (2-space, single quotes, printWidth 92) committed.

**CI (commit day one):** `.github/workflows/ci.yml` — node 20, `npm ci`,
lint, `tsc --noEmit`, `vitest run`, `vite build`, plus a grep asserting the
dist never contains `MUSE_API_KEY`. Required unit tests: the ops reducer
(every E_ code), tokenSheet (1800 cap + the key-field regression),
blueprintParse golden cases, typedOptions parser, reactCodegen snapshot.

**Quickstart:** node 20+, `npm ci`, copy `.env.example` → `.env` (paste the
muse key), `npm run dev` → http://localhost:5173. Build: `npm run build`.

**Dev/proxy rule (LAW):** the API key lives in `.env`, read ONLY by a Vite dev-server
middleware (`vite.config.ts` `server.proxy` → `/api/muse` → provider) or, in
production, a tiny serverless function. The browser never sees the key. The canvas
app calls `/api/muse/chat` (same-origin, relative URL — never localhost).

The proxy is small and total (dev = `vite.config.ts`, prod = one serverless
file doing the identical rewrite — key from env, body streamed through,
same-origin CORS only):

```ts
// vite.config.ts (dev)
server: { proxy: { "/api/muse": {
  target: process.env.MUSE_BASE_URL,   // https://api.meta.ai
  changeOrigin: true,
  rewrite: (p) => p.replace(/^\/api\/muse/, ""),
  headers: { Authorization: `Bearer ${process.env.MUSE_API_KEY}` },
}}}
```

---

## 2. Data Model — the JSON Component Tree (single source of truth)

```ts
// types/tree.ts
type NodeId = string;            // "btn_save" style ids — see §3.2 naming

interface ComponentNode {
  id: NodeId;                    // unique per project, stable across ops
  type: ComponentType;           // from the fixed library (§4)
  props: Record<string, unknown>;// content+behaviour, schema-checked per type (§4)
  styles: StyleSet;              // layout+presentation, token references FIRST
  children: ComponentNode[];     // containers only
  events?: Events;               // §4.2 — no-code logic (tap/change/submit)
  visibleWhen?: { key: string;   // declarative show/hide, zero logic:
                  equals?: string | number | boolean }  // state key + value
}

interface StyleSet {
  // Styles are presentation AND layout (§4.4). Every value is either a token
  // reference ("var(--openui-accent)") or a literal; numbers mean px except
  // the unitless keys (grow, opacity, fontWeight, lineHeight, letterSpacing).
  padding?: StyleValue | SpaceBox;   // SpaceBox = {top,right,bottom,left}
  margin?: StyleValue | SpaceBox;
  gap?: StyleValue;
  background?: StyleValue;           // "var(--openui-accent)" or "#FF0000"
  color?: StyleValue;
  border?: StyleValue;
  fontSize?: StyleValue;  fontWeight?: StyleValue;  fontFamily?: StyleValue;
  lineHeight?: StyleValue;  letterSpacing?: StyleValue;  textAlign?: string;
  borderRadius?: StyleValue;  boxShadow?: StyleValue;  opacity?: StyleValue;
  overflow?: "visible" | "hidden" | "auto";
  // Sketchware sizing on BOTH axes: match (fill the parent) | hug (fit the
  // content) | any length. 'match' → 100%, 'hug' → fit-content.
  width?: StyleValue;  height?: StyleValue;
  minWidth?: StyleValue;  maxWidth?: StyleValue;
  minHeight?: StyleValue;  maxHeight?: StyleValue;
  // ALIGNMENT — two axes, two homes, no shared word (§4.4):
  align?: "start"|"center"|"end"|"stretch";   // container → align-items
  justify?: "start"|"center"|"end"|"space-between"; // container → justify-content
  wrap?: boolean;                                 // container → flex-wrap
  selfAlign?: "start"|"center"|"end"|"stretch"; // child → align-self
  grow?: 0 | 1;                                   // child → flex-grow (weight)
  columns?: number;                               // grid only
  responsive?: { medium?: Partial<StyleSet>;   // ≥600 px overrides
                 expanded?: Partial<StyleSet> } // ≥1024 px overrides;
  [k: string]: unknown;              // raw CSS escape hatch (marginTop, …)
}
type StyleValue = string | number;
// RESPONSIVE MODEL (§9.7): base styles ARE the compact (mobile-first)
// design; medium/expanded override ONLY what should reflow. Rendered as
// generated CSS classes with @container queries (inline styles cannot carry
// them) — the same CSS ships in export (§10.1).
//
// ONE HOME PER CONCEPT (the law behind this shape — see §4.4):
//   styles = presentation + layout (gap, align, justify, wrap, grow, size…)
//   props  = content and behaviour only (text, src, items, bindKey, variant…)
// A Row therefore has NO gap/align/wrap props; a Card has NO `pad` prop. The
// CSS engine still reads those four legacy props as a migration fallback so an
// unmigrated document renders exactly as it did (§11).

interface ScreenDoc {
  id: string;                    // "home", "details" (slug)
  name: string;                  // "Home"
  root: ComponentNode;           // type:"screen" node, layout:"flex-col"
  entry?: boolean;               // the screen the app opens on
  mockData?: Record<string, unknown[]>; // rows for list/table/chart (≤ 20 stored; render ≤ 5/10)
}

interface ProjectDoc {
  format: "museware/1";
  layoutVersion?: number;        // 2 = styles own layout (§11); absent = v1
  name: string;
  screens: ScreenDoc[];
  tokens: DesignTokens;          // §5
  opLog: OpEntry[];              // full history (append-only, for undo + replay)
  rail: RailEntry[];             // the agent chat + cards, persisted (§2.1)
  kind: "web" | "app";           // §8.8 — sets DEFAULTS only; switchable anytime
  customComponents: CustomComponent[]; // §4.3 — reusable no-code blocks
  blueprint?: { text: string; decided: boolean; updatedAt: number };
  updatedAt: number;
}

// §2.1 Rail persistence — the rail is PART of the project file, not a
// side channel. Without this the "restore on reload" promise is a lie.
interface RailEntry {
  id: string;                    // nanoid
  at: number;                    // epoch ms
  role: "user" | "agent" | "system" | "card";
  text: string;                  // prose (never JSON — law 14)
  card?: {                       // present iff role === "card"
    kind: "build_choice" | "blueprint" | "choice" | "color"
        | "progress" | "error";
    state: "pending" | "answered" | "cancelled" | "expired";
    data: Record<string, unknown>; // blueprint text, options+hexes,
                                   // picked index, N-of-M snapshot…
  };
}
// Caps (enforced on save): ≤ 400 entries (oldest dropped), card data
// ≤ 8 KB/entry (a blueprint text truncates at 6000 chars with an
// explicit "…full text in the Design panel" note). RESTORE RULE: a
// pending card from a previous session loads as "expired" and renders
// its final state read-only — ghosts are never re-askable (§9.5).
```

Rendering rule: the Canvas renders `ProjectDoc` live; there is NO other representation.
The AI edits it only through ops; the user edits it only through the same ops
(drag/inspector produce the same op types — this is what makes everything undoable
and gives the verify gate one thing to inspect).

**Screen ids:** slugified from the name (`Habit Tracker` → `habit_tracker`),
pattern `^[a-z][a-z0-9_]{0,30}$`, unique. Ids NEVER change after creation
(rename changes `name` only) — `link.to`, actions, and the project index all
reference the id. The first screen is `entry`; exactly one entry at a time;
RunMode opens there.

**State (`bindKey`) semantics:** ONE global per-run store
`Record<string, unknown>` shared by all screens (cross-screen values are the
norm: a field on `home` feeds `details`). Keys follow
`^[a-z][a-z0-9_]{0,30}$`; every key in use appears in the project index so
the model reuses instead of inventing near-duplicates. Run-state is
EPHEMERAL — reset on Run toggle and reload, never written into ProjectDoc.

---

## 3. The Op Model (every change is an op)

### 3.1 Op types
```ts
type Op =
  | { op: "add"; parentId: NodeId; index?: number; node: ComponentNode }
  | { op: "remove"; id: NodeId }
  | { op: "move"; id: NodeId; parentId: NodeId; index?: number }
  | { op: "setProps"; id: NodeId; props: Record<string, unknown> }   // merge
  | { op: "setStyles"; id: NodeId; styles: StyleSet }                // merge
  | { op: "setText"; id: NodeId; text: string }                      // text-ish nodes
  | { op: "rename"; id: NodeId; name: string }
  | { op: "addScreen"; screen: ScreenDoc }
  | { op: "removeScreen"; id: string }
  | { op: "setTokens"; patch: Partial<DesignTokens> }              // §5
  | { op: "saveComponent"; name: string; description: string; root: ComponentNode }
  | { op: "placeComponent"; name: string; parentId: NodeId; index?: number }; // §4.3
```
`saveComponent` / `placeComponent` are user AND agent ops (§4.3); every other
row above is what the palette, the inspector, drag-and-drop and the agent all
produce — one vocabulary, one undo history.

### 3.2 Id naming (enforced by validate.ts)
Pattern `^[a-z][a-z0-9_]{2,30}$`, semantic prefix by kind: `btn_ txt_ img_ card_ row_
col_ input_ nav_ hero_ list_ chip_`. Uniqueness per project. On collision the op fails
with `E_NAME_TAKEN` and the model is told to pick another (suggestions included in the
error). If the model omits an id, the app generates one (`btn_3f2a`) — never block.

### 3.3 Validation (before ANY op applies)
- zod structural check → `E_BAD_OP` with the zod message.
- Semantic rules → `E_NO_PARENT` (add/move target missing), `E_NOT_CONTAINER`
  (child under a leaf — see §4 kinds), `E_NAME_TAKEN`, `E_SCREEN_MISSING`,
  `E_TOKEN_UNKNOWN` (style references an undefined token), `E_DEPTH` (tree > 8 deep),
  `E_COUNT` (screen > 120 nodes).
- On ANY failed op in a batch: apply nothing from that batch; return the error list to
  the model for one correction round. (All-or-nothing batches keep the canvas sane.)
- **Snapshot before every applied batch** (structural clone) → undo stack. Snapshot
  persisted with the op log entry (persist-on-create law).

#### 3.3.1 The vocabulary gate (what a style or a prop may contain)

A batch is checked against the SAME tables the UI renders from, so the agent
cannot write a value the panel could never produce (§4.4, §9.3):

- **Style keys the dictionary names are checked by name**: `align`/`selfAlign`
  ∈ start|center|end|stretch · `justify` ∈ start|center|end|space-between (a
  `stretch` here is refused with the valid words in the message) · `wrap` is a
  boolean · `grow` is 0 or 1 · `width`/`height`/`min*`/`max*` are
  `match` | `hug` | a length · `overflow` ∈ visible|hidden|auto ·
  `padding`/`margin` are a value or a `{top,right,bottom,left}` box. Any OTHER
  key still passes through as raw CSS (`marginTop`, `fontFamily`) — the
  dictionary names the vocabulary, it does not fence the canvas in.
- **Props are checked against the type's property sheet**: an unknown enum
  value comes back as `E_BAD_OP` naming the valid ones (`variant must be one
  of: primary, secondary, ghost, danger`), numbers are range-checked, toggles
  must be booleans, and a crossed range (`min` above `max`) is refused.
- **Required content is checked when a node ENTERS the canvas** — a button
  with no words is rejected. Edits are not policed the same way: clearing a
  field in the panel while you retype it must never throw errors at you.
- **A `navigate` target is checked for shape, not existence**: a half-built
  import may point `link.to` at a screen a later batch creates; Run mode says
  so honestly if it never arrives.
- Guidance travels with every error (the error table below), because the model
  gets exactly one correction round per batch.

### 3.4 OpEntry (the log)
```ts
interface OpEntry { at: number; source: "agent"|"user"; batch: Op[]; summary: string }
// summary example: "add 6 components to home + style hero card"
```
The op log IS the undo history, the crash-recovery replay, and the receipts the agent's
progress lines are generated from.

**Undo/redo mechanics:** one history for agent AND user batches. `undo` pops
the last snapshot, restores tree/tokens/screens from it, pushes the entry to
a redo stack; any newly applied op clears the redo stack. Snapshot = a
structural clone; stack cap 50 (drop oldest). Undo NEVER touches the rail or
rewrites the op log — history stays true; the undo itself logs an entry
with summary "undo".

**Error-code table (single source — validate.ts and tool results use exactly these):**

| code | meaning | guidance carried in the result |
|---|---|---|
| E_BAD_OP | zod structural failure | zod message verbatim + offending field |
| E_NO_PARENT | add/move target id missing | list of existing container ids |
| E_NOT_CONTAINER | child under a leaf kind | the leaf's id + kind |
| E_NAME_TAKEN | id collision | 3 suggested free alternatives |
| E_SCREEN_MISSING | unknown screen id | the list of screen ids |
| E_TOKEN_UNKNOWN | style references an undefined token | the token list from the sheet |
| E_DEPTH | tree deeper than 8 | flatten suggestion |
| E_COUNT | screen over 120 nodes | split across screens or remove |
| E_BAD_ARGS | tool args not valid JSON | retry with strict JSON |
| E_BUILD_CARD | a second addScreen in one turn (law 12) | end the turn with finish(); the user picks a mode on the card |
| E_RATE | internal pacing guard tripped | wait; the client paces automatically |

---

## 4. The Component Library (fixed vocabulary — the model picks from THIS, only THIS)

All styling resolves through design tokens (§5) by default; the model overrides via
`styles` only when the request demands it. Every component lists: kind (container or
leaf), props schema (zod-able), defaults.

**Layout containers** (children allowed). Since v1.6 a container's LAYOUT lives
in `styles` (gap / align / justify / wrap / padding — §4.4); `props` holds only
content and behaviour:
- `screen` — full-page flex; props: `layout` ("flex-col"|"flex-row", default
  flex-col — horizontal lays its sections out in a Row)
- `row` — "Row (horizontal)" · flex-row container; **props: none**
  (default styles: `gap: var(--gap-item)`, `align: center`, `wrap: true`)
- `col` — "Column (vertical)" · flex-col container; **props: none**
  (default styles: `gap: var(--gap-item)`, `align: stretch`)
- `grid` — CSS grid; props: `columns` (2–6); `gap` is a style. Responsive:
  override `columns` per breakpoint — 2 on compact, 3 medium, 4 expanded is the
  classic card page. In the panel the column count appears as "Columns at this
  width" only while editing a wider breakpoint (on compact it is content).
- `card` — elevated rounded surface; props: `title?` (padding is the `padding`
  style, default `var(--pad-card)`)
- `hero` — full-width banner; props: `title`, `subtitle`, `image?`
- `tabs` — tab strip + panels; props: `items: string[]` — one child per label.
  Only the ACTIVE panel renders; clicking a tab on the canvas switches it (and
  selects the tabs block), and the Layers panel reaches every panel's contents.
- `section` — titled grouping; props: `title`
- `form` — input-grouping container; props: `submitLabel` (default "Submit"),
  events: `submit` (§4.2); children inputs bind keys, submit fires the actions

**Text & display** (leaf): `heading` (`text`, `level` 1–4), `text` (`text`), `label`,
`badge` (`text`, `tone`: accent|success|danger|neutral), `divider`, `icon`
(`name` from a fixed Lucide set, `size`), `image` (`src` — `https:`/`data:` only, validated at op time; when the
  model has no real asset it MUST emit an inline SVG placeholder data-URI
  drawn from the token palette — never an invented URL that 404s on
  stage, `alt`, `fit`), `avatar` (`src`, `size`),
`progress` (`value` 0–100), `spinner`.

**Input** (leaf): `button` (`text`, `variant`: primary|secondary|ghost|danger,
`icon?` drawn before the text, `disabled`), `iconbutton` (`icon`, `variant`),
`input` (`placeholder`, `bindKey`, `inputType`: text|number|password|phone —
renders the matching HTML type, so a password field shows dots), `textarea`
(`placeholder`, `bindKey`, `rows`), `select` (`options: string[]`, `bindKey`),
`checkbox` (`label`, `bindKey`), `switch` (`label`, `bindKey`), `slider`
(`min`,`max`,`step`,`bindKey`, `label?` rendered above the track with its live
value in Run mode), `datepicker` (`bindKey`).

**Navigation** (leaf): `navbar` (`items: string[]` — top app bar with menu),
`bottomnav` (`items`), `link` (`text`, `to: screenId`), `fab` (`icon`).
Behaviour is never a prop: what these do on tap is an EVENT (§4.2) — the spec's
old `action` prop never existed in the tree and is gone from this list.

**Data display** (leaf, mock-data driven for the demo): `list` (`itemTemplate` — a
mini node map repeated over mock items; render first 5; `divider` draws hairlines
between rows instead of a card per row), `table` (`columns`, `dataKey`, rows ≤ 10),
`stat` (`label`, `value`, `delta`), `chart` (`kind`: bar|line|spark, `dataKey`, ≤ 12
points). The list's ROWS are not nodes: you select the list itself, the same model
Sketchware listviews use.

**Prop rules (two examples; every type is described the same way in
`types/library.ts`, and `ops/validate.ts` enforces the sheet — §3.3.1):**

```ts
// what the property sheet says, and therefore what validation enforces
button: {
  text:     { kind: 'text',     group: 'Content',  hint: 'The word on the button.', required: true },
  variant:  { kind: 'select',   group: 'Content',  hint: 'How loud the button is.',
              options: ['primary', 'secondary', 'ghost', 'danger'], defaultValue: 'primary' },
  icon:     { kind: 'icon',     group: 'Content',  hint: 'Optional icon drawn before the text.' },
  disabled: { kind: 'toggle',   group: 'Behavior', hint: 'Greyed out and untappable — but still selectable on the canvas.' },
}
card: {
  title:    { kind: 'text',     group: 'Content',  hint: 'Optional heading rendered above the children.' },
  // no `pad`: padding is the `padding` style (§4.4)
}
```
A required prop is checked when the node ENTERS the canvas, not on every edit —
so clearing a field while you retype it never throws (§3.3.1).
Every prop has a default OR `.optional()`, a max length on strings, and — from
v1.6 — a **group** (Content | Behavior | Advanced) plus a **hint**, both
required. A library test fails the build if any prop is missing either: a field
the user cannot understand is a field that should not be on screen.

```ts
interface PropDef {
  key: string; label: string; kind: PropKind;
  group: "Content" | "Behavior" | "Advanced";   // inspector section
  hint: string;                                // one line, always shown
  options?: string[]; min?: number; max?: number; required?: boolean;
}
```
`PropKind` = text | longtext | number | select | toggle | icon | screen | tone |
actions | data | bind — each kind has exactly one control in the panel (§9.3).

**Default styles per kind (under the token defaults, §5.3):** containers
render flex per their axis, with a gap from their own default styles — screen
`var(--gap-section)`, row/col/grid `var(--gap-item)`; `card`/`hero`
get `border-radius: var(--radius-card)` + `background: var(--openui-elevated)`;
buttons/inputs height `var(--h-button)`/`var(--h-input)` +
`border-radius: var(--radius-button)`; heading levels 28/22/18/15 px, body 14,
label 12. Fonts: `--font-heading`/`--font-body` CSS vars — default system
stack; a preset's `font_heading`/`font_body` sets them with graceful
fallbacks (`"X", system-ui, sans-serif`).

**Fixed icon set (the ONLY valid `icon.name` values — Lucide):** home, search,
settings, user, users, heart, star, bell, calendar, clock, check, check-circle,
plus, minus, x, chevron-right, chevron-left, chevron-down, arrow-right,
arrow-left, trash, edit, share, download, upload, image, camera, play, pause,
refresh-cw, filter, list, grid, menu, more-horizontal, map-pin, mail, phone,
shopping-cart, tag, gift, trophy, flame, moon, sun, droplet, book, music,
wifi, lock, eye. (49 names — the inspector picker and validate.ts enforce
exactly this list.)

**Mock data (list / table / chart):** rows come from
`ScreenDoc.mockData[dataKey]` — a component's `bindKey` doubles as its data
key unless an explicit `dataKey` prop is set; the fill queue generates 5–20
realistic rows per key during fill (law: realistic domain data, not
"Item 1"). `list` renders the first 5 rows through `itemTemplate` (a node
map where string props may reference `{{path.into.row}}`); `table` ≤ 10
rows; `chart.data` ≤ 12 points `{label, value}`.

### 4.1 Actions (the atomic verbs of the no-code logic system)
```ts
type Action =
  | { type: "navigate"; to: string }                 // screen id
  | { type: "setState"; key: string; value: unknown }// write the run store
  | { type: "toggle"; key: string }                  // flip a boolean state
  | { type: "toast"; text: string }
  | { type: "openUrl"; url: string }                 // confirm chip (§11.6)
  | { type: "when"; key: string; equals?: unknown;   // conditional:
      then: Action[] }                               // nested ≤ 2 deep
```
RunMode (§9.6) interprets actions client-side; codegen lowers them into a
~40-line runtime stub. This is the WHOLE verb set — deliberately tiny, but
COMPOSABLE (ordered lists + one conditional level covers forms, toggles,
wizards, filters, tab logic) and fully verifiable. No arbitrary JS, ever.

### 4.2 Events & logic chips (Sketchware's blocks, reborn without code)
Every interactive component exposes EVENTS; an event holds an ORDERED LIST
of actions rendered as chips:
```ts
type EventName = "tap" | "change" | "submit";
type Events = Partial<Record<EventName, Action[]>>;
```
**`EVENT_MAP` is the truth** (`types/library.ts`) — a block offers only the
triggers it can actually fire, and the panel renders ONLY those (v1.6; before
this, a Divider showed three dead editors and "every leaf gets tap" was a
promise the renderer did not keep):

| event | types |
|---|---|
| `tap` | heading, text, label, card, hero, section, image, avatar, button, iconbutton, fab, link, list, table, stat, chart, navbar, bottomnav |
| `change` | input, textarea, select, checkbox, switch, slider, datepicker, tabs |
| `submit` | form |

Everything else (divider, spinner, progress, icon, row, col, grid, screen) has
NO events, and the Events tab says so in one honest line rather than offering
editors that go nowhere. Two rules keep the map true:

- **A listed type really fires.** Card, Hero, Section, Image, Avatar, Heading,
  Text, Label, Stat, Chart and Table carry a tap handler in Run mode; the tab
  strip fires `change`; the navbar and bottom nav fire `tap` after navigating.
- **A tap belongs to the block it landed on**, not to every ancestor with a tap
  wired: clicking a Heading inside a tappable Card fires the Heading's actions
  and NOT the Card's. (The nearest `n-<id>` element decides.)

`link`/`bottomnav` items still carry navigate chips out of the box.

**The builder UI (Inspector → Events tab):** only the mapped triggers appear; a
"WHEN <event>" row per event; under it "+ add action" opens a picker —
Navigate (screen list) / Set state (key picker + value field) / Toggle /
Toast (text) / Open URL / If state equals… (then nested chips). Argument
fields are PICKERS (screens, existing state keys, tones) — nothing to
type but literal values. The AI writes the same structure through
`edit_canvas` (`setProps` on `events`), and the verify gate reviews it
like any other content. Beyond v1 (do NOT build): API-call action,
persisted storage action, loops.

### 4.3 Custom components (reusable blocks — place-as-copy in v1)
```ts
interface CustomComponent {
  name: string;                  // "habit_row" — §3.2 id rules
  description: string;           // one line, shown in the palette
  root: ComponentNode;           // subtree; ids preserved inside
  preview?: string;              // tiny data-URI snapshot for the palette
}
```
- **Save:** Inspector → "Save as component" (names the selection).
- **Place:** palette gains a "My components" group (top); placing inserts
  a COPY of the subtree (ids regenerated per §3.2 with the component name
  as prefix: `habit_row_btn_done`).
- **v1 honesty:** instances are copies — editing the source does NOT
  retro-update placed copies (deep sync is post-hackathon; the inspector
  says so in one line). The AI can `saveComponent`/`placeComponent` too
  (ops below), so "make me a card I can reuse" works end-to-end.
- Ops: `saveComponent` / `placeComponent` (§3.1) — validated like all ops;
  `E_NAME_TAKEN` on duplicate save.

---

### 4.4 The layout & style vocabulary (one home per concept)

**The problem this section exists to kill.** Before v1.6 the same idea had two
homes and sometimes two names: a `row` kept `gap`/`align`/`wrap` in PROPS while
a `screen` kept them in STYLES; `styles.align` compiled to align-self while
`props.align` compiled to align-items, so the panel showed two fields both
labelled "Align" that did different things and neither said which axis; width
accepted `match`/`hug` in the CSS engine but no field offered them; and height
had no field at all. Rows and Columns read as decoration because their one
interesting property — who grows — did not exist.

**The law.** `styles` = presentation + layout. `props` = content + behaviour.
Alignment is never one ambiguous word:

| key | who it applies to | label in the panel | compiles to |
|---|---|---|---|
| `align` | container | **Align children** | `align-items` |
| `justify` | container | **Distribute children** | `justify-content` |
| `wrap` | container | **Wrap to new lines** | `flex-wrap` |
| `gap` | container | **Space between children** | `gap` |
| `selfAlign` | any child | **Align in parent** | `align-self` |
| `grow` | any child | **Fill leftover space** | `flex-grow` |

`justify` takes start | center | end | **space-between** and never `stretch` —
`stretch` was never a valid justify-content and is refused at validation.
`grow` is Sketchware's `layout_weight`, Figma's `layoutGrow`, CSS `flex-grow`:
one concept, one friendly name. A spacer is an empty col/row with `grow: 1`.

The rest of the dictionary — defined once in `types/styleDict.ts` as
`STYLE_FIELDS: { key, label, hint, kind, options?, scope }` and consumed by the
inspector (renders the Style tab), the validator (§3.3.1) and the CSS engine
(`canvas/cssGen.ts` emits from it) — is:

| group | keys |
|---|---|
| Layout | align, justify, wrap, gap (containers) · selfAlign, grow (children) |
| Space | padding, margin, borderRadius |
| Size | width, height, minWidth, maxWidth, minHeight, maxHeight |
| Colour | background, color, border |
| Type | fontSize, fontWeight, lineHeight, letterSpacing, textAlign |
| Effects | boxShadow, opacity, overflow |

`scope` decides relevance: `container` (only if it holds children), `child`
(everything except the screen root), `text` (only the seven text-ish types:
heading, text, label, badge, button, link, stat), `every`. That one word is why
a Divider is no longer offered "Align children" and a Heading is.

**Sizing is Sketchware's, on both axes.** `width`/`height`/`min*`/`max*` accept
`match` (fill the parent → 100%), `hug` (fit the content → fit-content) or a
length. The panel offers Match / Hug / Fixed as a segmented control, with a
length box for Fixed; `hug` works on height, which it never did before. Hint
shown under the field: "match fills the parent when the parent stretches you —
use grow in the main axis."

**`padding`/`margin` accept a box** `{top,right,bottom,left}` from the agent,
emitted as one declaration per side. The inspector keeps one field (`Inner
space`) plus a hint — per-side editing is agent-only in v1.

**The migration window.** The CSS engine still honours a CONTAINER's legacy
`props.gap` / `props.align` / `props.wrap` when `styles` does not speak, and a
card's `props.pad`, so an unmigrated document renders exactly as it did; styles
always win. Saved documents are migrated on load (§11), so the fallback only
ever catches a project that has not been opened since v1.5.

---

## 5. Design System & Tokens

### 5.1 Token schema (compatible with the existing preset files)
Use the `openui-1.0` shape EXACTLY as the import format — the user already owns two
presets in this format (iPhone 17 Pro Max, Windows 11 Pro — Claude-made, with embedded
`foundations` sheets):

```jsonc
{
  "title": "...", "specVersion": "openui-1.0",
  "openuiTheme": {
    "brand_color": "#FF8A3D", "secondary_color": "#6366F1",
    "neutral_scale": "warm", "corner_profile": "soft",
    "density": "comfortable", "theme_mode": "DayNight",
    "radii_dp":   { "card": 26, "button": 999, "input": 14, "chip": 999, "tag": 8, "callout": 20 },
    "metrics_dp": { "screen_pad": 20, "section_gap": 24, "card_pad": 16,
                    "button_height": 50, "input_height": 50, "chip_height": 34, "row_height": 60 },
    "light_colors": { "openui_bg": "...", "openui_fg": "...", "openui_sunk": "...",
      "openui_elevated": "...", "openui_highlight": "...", "openui_accent": "...",
      "openui_accent_pressed": "...", "openui_accent_subtle": "...",
      "openui_text_on_accent": "...", "openui_secondary": "...",
      "openui_text_on_secondary": "...", "openui_text_primary": "...",
      "openui_text_secondary": "...", "openui_text_tertiary": "...",
      "openui_text_brand": "...", "openui_border_default": "...",
      "openui_border_interactive": "...", "openui_border_accent": "...",
      "openui_info_bg": "...", "openui_info_text": "...", "openui_info_border": "...",
      "openui_success_bg": "...", "openui_success_text": "...", "openui_success_border": "...",
      "openui_alert_bg": "...", "openui_alert_text": "...", "openui_alert_border": "...",
      "openui_danger_bg": "...", "openui_danger_text": "...", "openui_danger_border": "..." },
    "dark_colors": { …same 30 keys… },
    "foundations": { …optional deep sheet: typography styles, motion, materials — RIDE ALONG, never stripped… }
  },
  "tokens": [ { "key": "card", "label": "…", "kind": "card", "props": { "padding": "16", … } }, … ]
}
```
Import: accept this file AS IS; unknown top-level sections (foundations, motion,
materials, type scales) are **preserved on save** (never stripped — that was a real
bug: the save path silently dropped everything the engine didn't model).

### 5.2 Web materialization
`tokens → CSS custom properties` on the canvas root:
`--openui-bg, --openui-accent, …` (light + `[data-theme="dark"]`), plus
`--radius-card`, `--pad-screen`, `--gap-section`, `--h-button`… Default components
reference ONLY these variables. Changing `brand_color` repaints the whole canvas —
"colour propagation is the expectation."

```css
/* tokens.css — GENERATED by the token store, never hand-edited */
:root {
  /* 30 light keys */ --openui-bg:#F8FAFC; --openui-accent:#2563EB; /* … */
  /* derived scales */ --radius-card:14px; --radius-button:12px;
  --pad-screen:20px; --gap-section:16px; --h-button:50px; --h-input:50px;
  --font-heading: system-ui, sans-serif; --font-body: system-ui, sans-serif;
}
[data-theme="dark"] { /* the 30 dark keys */ --openui-bg:#0B1220; /* … */ }
```

The theme attribute is set on the canvas root; the topbar carries an explicit
Light / Dark / Auto toggle (Auto follows `prefers-color-scheme`). The canvas,
RunMode, and the exported code all read the same vars — one truth everywhere.

### 5.3 Component token defaults
Ship ~14 core component tokens (`screen, card, sunk_card, primary_button,
secondary_button, input, chip, list_row, title, body, nav_bar, tab_bar, fab, dialog`)
derived from the theme (radii/metrics/palette) — a component with no style overrides
renders from its token defaults. Preset `tokens[]` entries override by `key`.

### 5.4 The AI-facing token sheet (LAW: hard cap 1800 chars)
`tokenSheet.ts` renders, from the CURRENT tokens:
title; brand/secondary; neutral/corner/density/mode; fonts; up to 14 light + 14 dark
colour key=value pairs; the core component tokens (key + up to 6 props each, core
first, "+N more components (in the Design System panel)"); and ≤ 2 distilled lines
from foundations (font family, type range "12–34sp (11 styles)", grid, margin, tap
target, motion ms). THIS STRING is the only design context any prompt ever sees.
Read component tokens by their **`key`** field (a previous implementation read a
nonexistent `name` field and silently showed zero component tokens — do not repeat).

---

### 5.5 Default starter theme ("Museware Default" — shipped inline)
The canvas must work BEFORE any import: every new project starts with this
complete theme (the model may retune it via `set_design_tokens`). Full
values, all 30 keys, both modes:

- **light:** bg `#F8FAFC`, fg `#FFFFFF`, sunk `#EEF2F7`, elevated `#FFFFFF`,
  highlight `#E8EEF7`, accent `#2563EB`, accent_pressed `#1D4ED8`,
  accent_subtle `#DBEAFE`, text_on_accent `#FFFFFF`, secondary `#6366F1`,
  text_on_secondary `#FFFFFF`, text_primary `#0F172A`, text_secondary
  `#475569`, text_tertiary `#94A3B8`, text_brand `#2563EB`,
  border_default `#E2E8F0`, border_interactive `#93C5FD`,
  border_accent `#2563EB`; info bg/text/border `#EFF6FF/#1D4ED8/#BFDBFE`;
  success `#F0FDF4/#15803D/#BBF7D0`; alert `#FFFBEB/#B45309/#FDE68A`;
  danger `#FEF2F2/#B91C1C/#FECACA`.
- **dark:** bg `#0B1220`, fg `#111A2C`, sunk `#16203A`, elevated `#18233F`,
  highlight `#1E2B4D`, accent `#3B82F6`, accent_pressed `#2563EB`,
  accent_subtle `#1E3A8A`, text_on_accent `#FFFFFF`, secondary `#818CF8`,
  text_on_secondary `#FFFFFF`, text_primary `#F1F5F9`, text_secondary
  `#94A3B8`, text_tertiary `#64748B`, text_brand `#60A5FA`,
  border_default `#243049`, border_interactive `#3B82F6`,
  border_accent `#60A5FA`; info `#172554/#93C5FD/#1E3A8A`;
  success `#052E16/#4ADE80/#166534`; alert `#451A03/#FCD34D/#92400E`;
  danger `#450A0A/#F87171/#7F1D1D`.
- scales: `neutral_scale "slate"`, `corner_profile "balanced"` (radii
  card 14 / button 12 / input 12 / chip 20 / tag 8 / callout 12),
  `density "comfortable"` (20/16/16/50/50/34/60), `theme_mode "DayNight"`,
  no fonts (system stack). Component token defaults derive from these.

## 6. Muse API Client (`src/muse/client.ts`)

- Endpoint: the Llama API (OpenAI-compatible chat-completions w/ tools + streaming)
  via the server proxy (`POST /api/muse/chat`). Config via env: `MUSE_BASE_URL`,
  `MUSE_API_KEY`, `MUSE_CODE_MODEL` (tool work — pin the top muse code model),
  `MUSE_CHAT_MODEL` (rail chat).
- Streaming SSE with tool-call delta accumulation; non-streaming fallback flag.
- **Pacing:** ≥ 4000 ms between request STARTS (global). One in-flight request.
- **Backoff:** 429/5xx → exponential (2s/8s/30s) with an honest rail line
  ("Rate limited — waiting 30s. Silence is normal."); never silently retry-loop
  (cap 3, then an error card with a Retry button).
- **Cancels:** Stop button aborts the fetch (AbortController), marks the turn
  cancelled, keeps ops already applied, posts "Stopped — X of Y done."
**Wire format:** Meta Model API is OpenAI-compatible. PRIMARY surface: the
**Responses API** (`POST /v1/responses`) — it is where encrypted-reasoning
replay, image generation, and SAM live. FALLBACK surface: Chat Completions
(`POST /v1/chat/completions`) — the muse tool loop runs identically on
either. Auth header
`Authorization: Bearer $MUSE_API_KEY` (env `MUSE_API_KEY`; the docs' name
is MODEL_API_KEY — ours is namespaced). Body:
`{ model, messages, tools: [<function defs generated from the zod schemas
via zod-to-json-schema>], tool_choice: "auto", stream: true,
temperature: 0.4, max_tokens: 4096 }`. Tool outputs go back as `role:"tool"`
messages echoing `tool_call_id`.

**Streaming accumulation (implement EXACTLY this):** read SSE lines
(`data: {json}`, terminate on `data: [DONE]`); accumulate
`choices[0].delta.tool_calls[]` BY INDEX — each fragment appends
`id`/`name` when present and CONCATENATES `arguments` string parts; a call
is complete when its `arguments` parses as JSON; `finish_reason` of
`"tool_calls"` or `"stop"` ends the request phase. Text deltas stream into
the rail bubble. Heartbeat: 30 s without any delta → rail line (§8.1). A
stream error mid-turn: ONE retry with unchanged context — ops already
applied are never lost (they apply per batch, not per turn).

- Every request logs: model, prompt chars, tool names requested, latency → a tiny
  debug panel (receipts law).

---

### 6.1 The model matrix — every muse model has ONE job (all pinned, no routing)

Field-proven on THIS key (28 Oct export): muse-spark-1.1 ran a full
screenshot-clone build through Sketchware — design gate, project creation,
7 edit calls, 10/10 applied, ZERO quota errors — while muse-glimmer-30b
timed out twice (90 s) on hello-world and muse-wonder failed twice with
"Missing Authentication header" through the third-party path. Lessons: the
family is strong, glimmer is not a service model, and EVERY model must be
probed at key-setup with an honest per-model status (one 1-token ping per
role at onboarding; a red model shows red, with the error verbatim).

| Role (fixed) | Model | Reasoning effort | Why this one | Price/1M (in/out) | Limits |
|---|---|---|---|---|---|
| **Builder** (tool loop: fill, edits, fixes) | `muse-spark-1.3` | `high` blueprint round, `medium` fill | the documented default agent model; 1M ctx; parallel tool calls | $1.25 / $4.25 | 3000 RPM, 4M TPM |
| **Architect** (blueprint + final verify on big builds; opt-in "Wonder mode") | `muse-wonder-1.0` | `max` | the long-horizon heavyweight; one Wonder call plans the whole app, spark fills | $4.00 / $20.00 | 3000 RPM, 4M TPM |
| **Chat** (rail prose, choice wording, reviewer) | `muse-spark-1.3` | `low` (reviewer `medium`) | fast + cheap; the reviewer still judges, just without max depth | same | same |
| **Dev/budget tier** (development & testing only) | `muse-spark-1.3-contributor` | up to `xhigh` (no `max`) | **$0.10 / $0.20** — 20× cheaper; 150 RPM is plenty for one developer | $0.10 / $0.20 | 150 RPM, 3M TPM |
| **Vision describe / screenshot reading** | `muse-spark-1.3` | `low` | native image understanding | — | — |
| **Screenshot→Canvas segmentation** | `sam-3.1` | n/a | boxes + pixel masks for EVERY named element — structured recreation, not vision guessing | $2.50/1k images | 3000 RPM |
| **Image generation** (hero, icons, empty states, avatars) | `muse-image-1.0` | n/a | agentic gen/edit (can web-search references, multi-turn edits) | flat per image | 150 RPM |
| **Voice input** (hold-to-talk on the rail) | `muse-voice-transcribe-1.0` | n/a | streaming speech→text, billed per audio time | per hour | streams |

**Spark 1.1 / 1.2 (+1.2-contributor):** compatible spares — the settings
picker lists them, but NO role defaults to them (1.1 is standard-only;
field data shows it works, it is simply the older gen).

**CONTRIBUTOR-MODE CAUTION (legal, not just technical):** contributor
outputs carry a training-consent tradeoff AND Meta's Geographic Use Policy
adds end-user DEPLOYMENT restrictions on products built with contributor
output. Rule: hackathon demo and any shipped artifact run on STANDARD
models; contributor is for the developer's own testing budget only.

**Cost reality:** a full build ≈ 1–3M tokens ⇒ **$1.50–$4** on standard
spark, **under $0.50** on contributor; one Wonder plan ≈ $0.10–$0.30. The
$160 credit ≈ hundreds of standard builds. The receipts panel (§9.1)
shows spent cents per turn from real usage data.

### 6.2 The advanced primitives (use them ALL — this is how we transcend "basic tool calling")

1. **Encrypted reasoning replay (the big one).** Every Responses call
   includes `reasoning: { effort: <role>, summary: "auto" }` and the loop
   stores `reasoning.encrypted_content` per turn, replaying it
   (`include: ["reasoning.encrypted_content"]`, `store: false`) — the
   model's thinking CARRIES ACROSS TOOL CALLS. The fill queue stops
   re-planning from scratch on every call: coherent builds, fewer
   contradiction errors, less output-token spend. Persist the encrypted
   blobs with the turn (they are opaque; never rendered).
2. **Automatic prompt caching.** Cached input is 10–12× cheaper. Order
   EVERY prompt STATIC-FIRST: system prompt → token sheet → project index
   → history → user text. Never interpolate volatile data (timestamps,
   counters) into the static prefix — that would bust the cache.
3. **Parallel tool calls.** Accept multi-tool-call turns (e.g. edit two
   screens at once); EXECUTE them sequentially under the global pacer,
   feed results back in order.
4. **Search grounding (per-project toggle, default off).** For content
   builds ("landing page for my coffee shop") spark can ground text and —
   via muse-image — real visual references, with inline citations kept in
   the receipts panel, never pasted into user prose.
5. **Tool search / deferred tools (post-hackathon hook).** The API can
   defer tool loading to save tokens; our six tools are small enough that
   we don't need it — noted so nobody "discovers" it mid-demo.
6. **Computer use (post-hackathon).** Spark can drive a desktop from
   screenshots; a future "Museware tests its own PWA" feature. Out of v1.
7. **Streaming everywhere.** Text deltas to the rail; streamed tool-call
   arguments parsed incrementally (the accumulation algorithm §6) — a
   40-op edit_canvas starts applying within seconds of stream start...

Actually no — ops apply ONLY after the full arguments parse (all-or-
nothing batches, §3.3). The stream shows "writing canvas changes…"
progress instead. (Law 13: receipts, not theater.)

## 7. The Tool Surface (complete — the model gets these SIX and NOTHING else)

```
read_canvas()                       → compact project index (§8.2), ≤ 4000 chars
set_design_tokens(patch)            → §5 patch; validates hexes; repaints canvas
propose_blueprint(blueprint_text)   → starts the approval flow (§8.4); does NOT build
ask_choice(question, options[])      → choice card (§8.6); options ≤ 4, each
                                       {label ≤ 60 chars, hexes?: ≤ 4 #RRGGBB}
edit_canvas(screen_id, ops[])       → §3 batched ops, all-or-nothing, ≤ 40 ops/call
finish(summary)                     → ends the turn with a 2-sentence user summary
```
All calls validated by zod (§3.3). `edit_canvas` with ops referencing unknown
screens/tokens/components fails with the E_ codes and the model gets exactly one
correction round per batch. The system prompt instructs: "edit_canvas calls are
BIG: one call carries ALL the add ops for a screen; a second carries the
styling. NEVER one widget per call." (law 2 exists because models do it unless
told, every time).

**The model is told the same vocabulary the panel shows (v1.6).** Two lines ride
on `TOOL_DESCRIPTIONS.edit_canvas`, after the op grammar:

> styles keys: gap, align(start|center|end|stretch = align children), justify(start|center|end|space-between = distribute), wrap, grow(1 = fill leftover space), selfAlign, padding, width/height ("match"|"hug"|length), background, color, fontSize, fontWeight, textAlign, borderRadius, boxShadow, opacity.
> props are per-type: button{text,variant,icon,disabled}, input{placeholder,bindKey,inputType}, list{dataKey}, grid{columns}.

Descriptions are prose, not schema: the wire mirror (§7.1) stays SHALLOW, so the
depth refusal cannot come back. Before this, no prompt or description named a
single style key and the model guessed — which is how `justify: stretch` reached
the canvas. The `LAYOUT:` block in the system prompt (§8.5) is the third leg:
the vocabulary, the grammar, and an example of it in use.

### 7.1 The wire mirror — what the model actually receives

Two 400s killed whole turns before a single token was generated, because the
tools array rides on EVERY request:

1. `400 Recursive JSON schemas are not currently supported` — a truthful,
   recursive tree schema emits `$ref`s.
2. `400 JSON schema exceeds the maximum nesting depth of 10 levels` — even a
   BOUNDED tree mirror inlined to ~27 levels once you multiply op union × node ×
   children × styles × responsive.

The fix is the shape that makes both impossible: **the wire names the op and
leaves the payload open; the structure lives in prose.** `types/wire.ts`:

```ts
export const OP_NAMES = ["add","remove","move","setProps","setStyles","setText",
  "rename","addScreen","removeScreen","renameScreen","setEntry","setTokens",
  "saveComponent","placeComponent"] as const;                 // names, not shapes
export const editCanvasWire = z.object({
  screen_id: z.string().max(31).optional(),
  ops: z.array(z.object({ op: z.enum(OP_NAMES) }).catchall(z.unknown())).min(1).max(40),
});
```

`opSchema` (§3.1) stays the RUNTIME authority and validates every payload exactly
as deeply as before; only the wire stops describing it. `TOOL_DESCRIPTIONS`
(§7) carries the grammar instead — and, from v1.6, the style keys and per-type
props too. `types/wire.test.ts` enforces the invariants that keep this true:

- **no `$ref` anywhere** and no `definitions`;
- **every tool ≤ 8 levels deep** (headroom under Meta's cap of 10);
- every op name present in the enum, every payload left open;
- no empty sub-schema and no `additionalProperties: {}` (some validators refuse
  to interpret those), so the emitted JSON is cleaned up before it is sent;
- total parameters stay under a 24 kB budget, because they ride on every call;
- the runtime validator still accepts what the canvas really does.

**Structured output defence (law 1):** request tool-calls natively; if a reply
contains fenced JSON/HTML instead of tool calls, retry ONCE with a correction message.
If the model needs to offer CHOICES (styles/directions), it must call
`ask_choice` (§8.6) — if it still types options as
text, `typedOptions.ts` parses 2–6 numbered options (≥2 with hex codes) from the text
and renders tappable choice chips (coloured dots, hex-stripped labels, tap = send that
option as the user's message). The fallback exists because instructions alone were
proven insufficient.

---

## 8. The Agent Loop (`src/muse/loop.ts`)

### 8.1 Turn lifecycle
```
user message / card tap / milestone (first screen batch ends the turn — law 12)
→ assemble context (§8.2, LAW 6 caps)
→ [ paced, streaming ] muse call (tools on, CODE model)
→ for each tool call: validate → apply/queue → tool result (capped)
→ repeat while tool calls arrive (cap 24/turn → rollover: auto-continue new turn,
   progress line first: "Continuing — part 2")
→ verify gate (§8.3) when the turn touched the tree
→ finish(summary) → final rail line; op log persisted; tokens saved
```
Heartbeat: if no visible line for 30 s, the rail posts "Still working… 1m30s."
The rail shows one live line per tool call ("Adding hero + 6 components to home…"),
throttled: max one line per 12 s per work package (chatter kills trust less than
silence, but drowning the chat kills it entirely).

### 8.2 Context assembly (per request)
1. System prompt (§8.5) — static.
2. Token sheet (§5.4) — only the string.
3. Project index (`read_canvas` cached per turn): screens → node ids+types (≤ 18
   ids/screen), actions, bound state keys; plus the blueprint text if present
   (truncated 2000). NO full tree dump.
4. History: last 8 messages, assistant messages > 700 chars trimmed head+tail,
   tool results > 8000 chars truncated; results older than the last 24 calls replaced
   by a 160-char remembrance ("edit_canvas ok: 6 added, 2 styled — full result omitted").
5. The user's message (+ attachments: images described by muse vision on the CHAT model,
   ≤ 2 images, described into text before the code model sees the turn).

### 8.3 The Verify Gate (law 5 — non-negotiable, the best-paid pattern)
After a turn that applied tree/tokens changes:
1. `muse/canvasOutline.ts` renders the changed screens to a plain-text
   description (screens → tree outline with resolved styles; ≤ 4000 chars;
   when any node carries responsive overrides, outline BOTH compact and
   expanded — total still ≤ 4000).
2. Ask the CHAT model, as reviewer: "A builder was asked: <user ask>. It produced:
   <outline>. Answer exactly PASS, or PROBLEMS: a numbered list. Visual quality
   counts: cramped/default-padded layouts, ignored LOOK numbers, off-palette colours
   are PROBLEMS, not PASS."
3. PASS → done. PROBLEMS → ONE rebuild round: same ask + "A PREVIOUS ATTEMPT HAD
   PROBLEMS (fix ALL): …". After the rebuild, ship regardless and show the reviewer's
   remaining notes honestly under the result. (Max attempts = 2 total.)
If the reviewer call itself fails (network/model error), ship with the honest
label "unverified" in the rail — the demo never blocks on the reviewer.

### 8.4 The Blueprint flow (law 3)
- Trigger: user asks for an app/screen (or picks "Blueprint first").
- The agent calls `propose_blueprint`: plain text, sections `RULES:` (id style, one
  shared state file key namespace), then per screen `SCREEN: <Name>` + component
  lines (`- btn_next (button) opens details`) + a **`LOOK:` line with HARD numbers**
  (padding/gaps/radii/type sizes — from the token sheet), then `STATE:` and `WIRING:`
  (what navigates where). ≤ 600 words.
- On arrival: persist IMMEDIATELY (law 8), render an **approval card** in the rail:
  screen thumbnails rendered live from a first-pass tree interpretation of the
  blueprint + Build it / Adjust it (inline input) / Cancel. Card LEAVES on tap
  (law 11); adjust round posts a NEW card; 30-min silence = honest cancel (kept
  blueprint, reopenable from history).
- Build it → the fill queue: screens filled one `edit_canvas` per screen + one wiring
  pass (actions/navigation), progress card N-of-M with Stop (§9.5), verify gate at the
  end. "Fast mode" skips per-screen review, keeps the final gate.
Adjust rounds cap at 3 (then an honest line: the blueprint stands as-is or
the user cancels). Fill semantics: screens build in queue order; a screen
that FAILS after its rebuild marks FAILED and the queue CONTINUES — one
screen's failure never blocks the rest (its row shows the reviewer's
PROBLEMS + Rebuild, §9.5). Per-screen fill prompt (verbatim):

"Fill screen <name> from its blueprint section. SECTION: <the lines>.
LOOK numbers are binding: <the LOOK line>. Token sheet: <sheet>. ONE
edit_canvas call with ALL adds for this screen (library components only),
then ONE call with styling deviations. Ids: <§3.2 rules>. Generate
mockData rows (5–20, realistic) for every list/table/chart dataKey. Then
finish() with one sentence."

- **The stop law (12), mechanically:** the moment a turn applies its first
  `addScreen` batch, the loop appends `finish` and ends the turn; the UI then posts
  the how-to-build card. If the model tries another `addScreen` in that same turn,
  `edit_canvas` returns `E_BUILD_CARD` (one correction round: "end with finish()").
  Tapping the card cancels any still-finishing turn first. User drags bypass this
  entirely — it gates only the model.

### 8.5 System prompt (~2050 chars — pin exactly this spirit; the string lives in `prompts.ts`)
```
You are the muse builder inside Museware. You change the canvas ONLY through tools:
read_canvas, set_design_tokens, propose_blueprint, ask_choice, edit_canvas,
finish. edit_canvas ops are BIG — all adds for a screen in one call, then one
styling call; never one component per call. Components come from the library list; colours come from the
token sheet (hex literals only when the user explicitly demands a custom colour).
First agree the look (offer 2–4 whole directions with hexes), save it with
set_design_tokens, propose_blueprint, then fill in after approval. Never print HTML,
JSON, or code in your reply — prose only.

LAYOUT: Screens and Columns stack top-to-bottom, Rows go left-to-right; children
sit edge-to-edge with gap between. Give containers gap:var(--gap-item) and
align:stretch by default. A child with grow:1 soaks up leftover main-axis space
(a spacer is an empty col/row with grow). "match" fills the parent, "hug" fits
the content. Justify distributes: space-between pins the first child to the start
and the last to the end. Text aligns with textAlign, boxes with align/selfAlign.

The user's saved design system is LAW: use its tokens, never invent replacements.
Design COMPACT-FIRST (390px); add medium (≥600px) / expanded (≥1024px) overrides
only where the layout should reflow — grid columns, wrapping rows, hero splitting
side-by-side.
```
The verbatim strings live in `src/muse/prompts.ts` (this block included); §A1
points there. The LAYOUT paragraph is load-bearing: without it the builder
invented properties instead of using `gap`/`grow`.

### 8.6 Choice protocol (the colour moment)
The model asks the user to pick between 2–4 whole directions by calling
**`ask_choice`** (first-class: question + options with optional hexes → the
choice card): one row per option, up to 4 swatch dots per row (hexes from the
option text; word→colour fallback map for "pastel pink" etc.), display labels with hex
codes STRIPPED (the dots show the colour; the codes go to the model, not the user's
eyes). Tap = the answer; the card leaves; "✓ Picked: …" line stays.
The **colour card** (single pick): hex input + 8 quick swatches + three buttons —
"Everywhere (app theme)" (`applied_everywhere` → full token repaint), "Just this
element" (sets the one node's style), "Cancel". A non-parsing hex keeps the card open
with an honest line. (This was two popups chained in the old product; ONE card here.)

---

### 8.7 Blueprint → provisional tree (the approval-card thumbnails)
`muse/blueprintParse.ts` interprets blueprint text BEFORE any edit_canvas
exists: split on `SCREEN:` lines; per screen, parse `- <id> (<type>) …`
lines into ComponentNodes (unknown type → `text`; omitted id → generated;
verbs "opens / links to X" → action `{type:"navigate", to:slug(X)}`);
apply the LOOK line's numbers to the screen root styles (outer padding,
gap, type sizes); containers inferred from indentation when present,
otherwise a flat `col`. The result renders as the approval card's
thumbnails — and the SAME parser prefixes the fill queue's per-screen
prompts, so approve-what-you-see equals build-what-you-saw. Golden unit
tests: three hand-written blueprints with expected trees.

### 8.8 First-run scenario: "Design me a landing page website" (exact trace)
This is the demo's opening line, so it is pinned step by step:

| # | Surface | What happens |
|---|---|---|
| 1 | rail dots | Turn assembles: system prompt + starter-token sheet + (near-empty) index. |
| 2 | choice card | The model calls `ask_choice`: "Web page or app feel?" with two options — unless the user's wording already decided it ("website" → web, "app" → app). Here: **web**. |
| 3 | rail line | `kind:"web"` set: desktop viewport becomes default, navbar/footer pattern suggested. |
| 4 | blueprint card | `propose_blueprint`: one screen `landing` (hero → features → stats → CTA → footer), every section line with ids/types, a LOOK line with hard numbers FROM THE TOKEN SHEET, WIRING (CTA → sign-up form submit), STATE (email, submitted). Persist-on-create fires HERE. |
| 5 | user tap | Build it → card leaves → "✓ Blueprint approved" line → fill queue opens. |
| 6 | progress card | "🛠 Screens 1 of 1 — landing…" + typing dots; ONE `edit_canvas` batch with ALL adds (hero, 3 feature cards in a grid, stats with mockData rows, form with bindKey inputs), then ONE styling batch. Receipts in the op log. |
| 7 | verify gate | `canvasOutline` renders the screen → reviewer: PASS (or one rebuild). |
| 8 | final line | "Landing page ready — 14 components, your tokens, runs now." + [▶ Run] pulse. Total: ~6 requests, well under $0.10. |

**Web vs app — one system, different defaults (never two pipelines):**
the JSON tree is IDENTICAL; `kind` switches DEFAULTS only —

| | `kind: "web"` (default viewport 1280) | `kind: "app"` (default 390×844) |
|---|---|---|
| Navigation pattern | `navbar` + footer sections | `bottomnav` + `fab` |
| Content width | max-width page container | full-bleed screens |
| Blueprint hints | sections, SEO-ish headings, footer | screens, thumb-reach, bottom nav |
| Export button | "Deploy site" (static zip) | "Install as app" (PWA manifest + SW) |
| RunMode | identical (same runtime) | identical |

The model picks `kind` from the user's words and says so in one line; the
user can flip it any time (Project settings) — the tree just re-renders in
the new defaults. THAT is the whole website/app differentiation: honest,
visible, and zero duplicated build logic.

### 8.9 Screenshot → Canvas (SAM + spark — the structured recreation pipeline)
Pure-vision recreation is already field-proven on this exact key: spark-1.1
cloned a MeshTab screenshot into a real Sketchware screen, 10/10 ops applied
(28 Oct export). Museware makes it STRUCTURED — geometry from SAM, semantics
from spark:

1. User drops a screenshot on the canvas or rail ("Recreate this").
2. `sam-3.1` (POST /v1/responses): segment with a UI-noun-phrase prompt —
   "button, input field, label, icon, image, card, navigation bar, list row,
   tab, toggle, checkbox" — returns a BOX + MASK per element. Sort boxes
   reading-order (y, then x); nest by containment (a box fully inside
   another = its child).
3. Per element: crop the box region → spark (vision, `low` effort) names it
   in ONE batched pass over ALL crops: type (library §4), text verbatim,
   role guess ("this is a submit button"), approximate style (fill/radius/
   size from the crop + box).
4. spark assembles a `museware/1` tree: box geometry → flex estimates (the
   tree stays responsive — §9.7 — absolute boxes are a scaffold, never the
   output), texts and actions applied, tokens mapped to the nearest palette
   entries.
5. The result lands as a NORMAL blueprint-style approval card (rendered
   thumbnails from the provisional tree) — Build it / Adjust it / Cancel —
   then a standard fill. Verify gate runs like any build.
Cost per screenshot: 1 SAM call (~$0.0025) + 1–2 spark calls. Latency: the
rail narrates ("Reading 23 elements…"), heartbeat as always.
Unit test: a 6-element hand-drawn mock → ≥ 5 correctly typed components.

### 8.10 Voice input (hold-to-talk)
Rail input bar gains a mic button (press-and-hold on mobile, click-to-
toggle on desktop): stream the mic to `muse-voice-transcribe-1.0`, show the
live transcript in the composer as text, send as a normal user message on
release. Transcripts are not persisted in the rail (the TEXT message is).
Browser needs mic permission once; denial shows an honest line. v1 is
transcribe-only (no TTS voice for muse — reading the rail is the UX).

## 9. The Editor (UI of Museware itself)

### 9.0 The landing & first run (the anti-AI-tool landing)

The landing opens with THE PRODUCT, not a claim about it: the hero is a
**live mini-canvas** — a real, tiny editor embedded in the page. You can
drag one button into it, or type one prompt and watch muse build a small
screen in ~15 seconds. We never SAY the AI builds; the visitor just watched
it. Below: one line of positioning — "Figma designs. Sketchware blocks.
Museware builds." — with the same small card shown three ways (styled by
hand / given logic chips / built by the agent). Then the family strip
(spark builds · wonder plans · SAM sees structure · image illustrates ·
voice listens), the preset gallery (iPhone 17 Pro Max, Windows 11 Pro —
one tap imports each into a scratch project), a short how-it-works trio
(blueprint → approve → verified build), and a footer.

**Ruthless no-list:** no signup wall, no email capture, no testimonials,
no fake stats, no cookie banner, no marketing carousel. Your Meta API key
IS your account. The only CTA, everywhere: **[Start building]** (and
[Try the live canvas] on the hero itself).

**First run (one screen, ~40 s):** paste key → per-model probe chips light
up instantly (§6.1 — green/honest-red with the verbatim error) → straight
into the editor. The empty canvas teaches in one line + three chips:
[Start from blueprint] [Recreate a screenshot] [Import a preset].

The landing shares the mw token system (§9.1.1) plus a marketing layer
(display 48/64, wider rhythm) — visually one product, no "marketing site"
that looks like a different company built it.

### 9.1 Look & feel — Museware's own design language (we dogfood §5)

Museware itself is built on its own token engine — the app is the first
demo of the system. The personality: a **dark-first pro tool** (Figma-class
density) with a **muse gradient** signature (indigo→violet) and calm,
near-mono surfaces so the USER's canvas colors are the loudest thing on
screen. Full token set (Museware's own `mw-*` theme, light + dark):

| token | dark (default) | light |
|---|---|---|
| mw-bg | #0E1015 | #F7F8FA |
| mw-surface (panels) | #151821 | #FFFFFF |
| mw-surface2 (cards/wells) | #1C2029 | #F0F2F5 |
| mw-border | #262B36 | #E3E6EB |
| mw-ink (primary text) | #E8EAF0 | #171A21 |
| mw-ink2 (secondary) | #9AA1AE | #5A6170 |
| mw-ink3 (faint/labels) | #62697A | #8B93A3 |
| mw-accent | #6D5CFF (muse indigo) | #5B49F5 |
| mw-accent2 | #A855F7 (violet, gradient end) | #9333EA |
| mw-ok / mw-warn / mw-danger | #34D399 / #F5B544 / #F87171 | #059669 / #D97706 / #DC2626 |

Radii: panel 12 / card 16 / chip 999 / input 10 (px). Space: 4px base
grid; panel pad 12, section gap 16, control height 36. Type: Inter or
system stack — 13px UI base, 12 labels, 15 rail body, 20 page titles;
ids/code in a mono face. Shadows: rest `0 1px 2px rgba(0,0,0,.25)`,
raised `0 8px 24px rgba(0,0,0,.35)` (halved in light). The **muse
gradient** (`135deg, mw-accent → mw-accent2`) appears in exactly THREE
places — the logo, the RUN button, and the agent's active ring —
everything else stays calm so the user's canvas colors dominate. Focus
rings: 2px mw-accent @ 60%. Contrast: every ink-on-surface pair ≥ WCAG AA
in BOTH themes (CI-tested from this table).

Motion: 120–200 ms ease-out on panels/chips; the breakpoint frame MORPHS
(250 ms) when the switcher is tapped; cards enter with a 12px rise + fade
and LEAVE with a 150 ms fade-collapse (leave-on-answer must feel tactile);
the agent ring PULSES (2 s loop) while working; `prefers-reduced-motion`
disables all of it.

### 9.1.1 The mw token architecture — our OWN system, three tiers

**The ruling:** Museware's UI runs on its OWN token system — same
three-tier ARCHITECTURE as the user-facing `openui-1.0` engine (§5), its
own values. NOT Apple's or Windows' system wholesale: those encode
platform-native materials (Mica, liquid glass) and device metrics that
would make a web tool cosplay a phone OS. The two foundations files the
owner owns (iPhone 17 Pro Max, Windows 11 Pro) are CALIBRATION sources
for primitive values only — Windows gives the 4px grid, the spacing
ladder 4/8/12/16/24/32/40/48, 40px touch minimums, restrained radii;
iOS gives the readable type ladder and the 44px tap target. They also
remain user-import presets (§5.1) — separate concern, never our chrome.

**Tier 1 — Primitives** (complete hex ramps — never referenced by
components, only by Tier 2):

```
mw-indigo   50#EEEBFF 100#DFD9FF 200#C4BAFF 300#A897FF 400#8F79FF
            500#6D5CFF 600#5B49F5 700#4A38D6 800#3A2BB0 900#2B2090
            950#1F1A66
mw-violet   50#FAF5FF 100#F3E8FF 200#E9D5FF 300#D8B4FE 400#C084FC
            500#A855F7 600#9333EA 700#7E22CE 800#6B21A8 900#581C87
            950#3B0764
mw-neutral  0#FFFFFF 50#F7F8FA 100#F0F2F5 150#E8EBEF 200#E3E6EB
            300#D3D7DE 400#B9BFC9 500#8B93A3 600#62697A 700#5A6170
            800#454B57 850#333947 900#262B36 950#151821 1000#0E1015
mw-green    50#ECFDF5 100#D1FAE5 200#A7F3D0 300#6EE7B7 400#34D399
            500#10B981 600#059669 700#047857 800#065F46 900#064E3B
            950#022C22
mw-amber    50#FFFBEB 100#FEF3C7 200#FDE68A 300#FCD34D 400#F5B544
            500#F59E0B 600#D97706 700#B45309 800#92400E 900#78350F
            950#451A03
mw-red      50#FEF2F2 100#FEE2E2 200#FECACA 300#FCA5A5 400#F87171
            500#EF4444 600#DC2626 700#B91C1C 800#991B1B 900#7F1D1D
            950#450A0A
```

Spacing `mw-space-1…12`: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96 px.
Radii: `mw-radius-none(0) sm(6) md(10) lg(12) xl(16) pill(999)`.
Type sizes `mw-fs`: 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 40, 48 px
(mono face for ids/code at 11–13). Weights: 400 / 500 / 600 / 700.

**Tier 2 — Semantic aliases** (the ONLY layer components reference;
themes are alias remappings — dark default, `[data-mw-theme="light"]`):
the full §9.1 table above (mw-bg, mw-surface, mw-surface2, mw-border,
mw-ink/ink2/ink3, mw-accent, mw-accent2, mw-ok/warn/danger) PLUS state
overlays: `mw-hover` (ink @ 6%), `mw-active` (@ 10%), `mw-disabled` (40%
opacity), `mw-focus-ring` (accent @ 60%, 2px); semantic type roles:
`mw-type-display` (32/1.2/700), `mw-type-title` (20/1.3/600),
`mw-type-section` (16/1.4/600), `mw-type-body` (13/1.5/400),
`mw-type-label` (12/1.4/500, ink2), `mw-type-code` (12 mono);
elevation `mw-e0…e3` (flat / rest shadow / raised shadow / overlay
shadow + scrim); motion `mw-motion-fast(120ms)/base(180ms)/slow(250ms)/
morph(250ms)`, `mw-ease-out`, `mw-pulse(2s)`; breakpoints mirror §9.7
(compact/medium 600/expanded 1024).

**Tier 3 — Component tokens** (every named surface gets one — this is
how "every single chip" is covered):

```
layout    mw-topbar-h 64 · mw-statusbar-h 24 · mw-left-w 260 ·
          mw-left-icon-rail 48 · mw-rail-w 340 · mw-inspector-w 280 ·
          mw-rail-peek 88 · mw-flyout-w 240 · mw-menu-w 200 ·
          mw-panel-pad 12 · mw-section-gap 16 · mw-frame-radius 18
controls  mw-control-h 36 · mw-chip-h 28 · mw-row-h 44 · mw-tab-h 40 ·
          mw-input-h 36 · mw-icon-sm 16 · mw-icon-md 20 · mw-icon-lg 24 ·
          mw-touch-min 40
surfaces  mw-card-radius 16 · mw-panel-radius 12 · mw-input-radius 10 ·
          mw-chip-radius 999 · mw-card-pad 16 · mw-card-gap 12 ·
          mw-chip-pad-x 12 · mw-chip-pad-y 6 · mw-row-pad 12 ·
          mw-tab-pad 10
rail      mw-railcard-pad 12 · mw-railcard-head-size 14 ·
          mw-railcard-gap 8 · mw-rail-composer-min 56 ·
          mw-rail-max-rows 6 · mw-swatch-size 16 · mw-swatch-gap 5
```
Add one Tier-3 pair (pad + header-size) whenever a new named surface is
built; a component that cannot name its token is a review finding.

### 9.1.2 The complete element inventory — every visual thing has a token line

**Scrollbars:** `mw-scroll-w 10` (thumb 8) · thumb `mw-neutral-600` rest,
`neutral-800` hover, `neutral-400` while dragging · track transparent ·
radius pill · canvas/frame scrollbars auto-hide (overlay style) ·
`::-webkit-scrollbar` + `scrollbar-width/scrollbar-color` both set.

**Buttons** (variant × size grid; every cell token-resolved):
- variants: primary = `mw-accent` bg + white ink (hover accent-600, active
  accent-700); secondary = `mw-surface2` bg + `mw-border` + `mw-ink`;
  ghost = transparent + `mw-ink2` (hover `mw-hover` bg); danger = `mw-red-600`
  bg + white ink. Each variant a Tier-2 alias pair — never raw hex in JSX.
- sizes: `mw-btn-h-sm 28 / md 36 / lg 44` · pad-x 12/14/16 · icon-button
  square variants per size · label = `mw-type-label` 500.
- states: hover `mw-hover` (or variant hover) · active `mw-active` ·
  focus `mw-focus-ring` · disabled 40% opacity + `not-allowed` · loading =
  16px spinner + 70% opacity + pointer-events none.

**Inputs** (text, textarea, select): rest border `mw-border`, bg
`mw-surface`; focus 2px `mw-focus-ring` + border accent; error border
`mw-red-500` + 12px message row (`mw-red-400`); success border green-500;
disabled bg `mw-surface2`; placeholder `mw-ink3`; select adds chevron icon.
**Dropdown menu** (select, pickers): `mw-surface` + border + radius 10 +
`mw-e2` shadow; item h32 (hover `mw-hover`, selected `mw-accent-subtle` bg
+ accent text + check icon); max-h 320 + §scrollbars.

**Checkbox / radio / switch:** checkbox 18px r4 — unchecked border
`mw-border`, checked `mw-accent` bg + white check; radio 18px — checked
accent ring + accent dot; switch track 36×20 — off border-on-surface2,
on `mw-accent`, thumb 16 white 2px inset; all: 150ms motion, focus ring,
error variant ring red. Touch variant (mobile): track 44×26, thumb 22.

**Slider:** track 4px `mw-neutral-800`, fill accent, thumb 14px white +
2px accent border, value tooltip while dragging.

**Tabs:** screen-tab h40 — active `mw-ink` + 2px accent underline, inactive
`mw-ink2`, hover `mw-ink`; segmented control (viewport 📱💻🖥): track
`mw-surface2`, active segment `mw-surface` + `mw-e1` shadow.

**Chips / badges:** chip h28 pill — rest border + `mw-ink2`; selected =
accent-subtle bg + accent text + check; filter chips same; swatch chip =
16px color dot + label; **badge dot** 8px (ok/warn/danger aliases); count
badge 16px pill red-600 white 11px; **kbd chip** mono 11 `mw-surface2` +
border r4.

**Tooltips:** inverse — `mw-neutral-950` bg (light theme: `neutral-0` +
border) · 12px `mw-type-label` · r6 · arrow 6 · delay 400ms in / 0 out ·
max-w 240 · z 60.

**Toasts / banners:** toast bottom-center desktop / above composer mobile
— surface, r10, `mw-e3`, 3px left status border (ok/warn/danger), 4s
auto-dismiss + close, z 50. Inline banner: accent/green/amber/red subtle
bg pairs + 3px left border + icon + actions right.

**Modals:** scrim `mw-neutral-1000` @ 60% (40% in light) · panel surface
r16 `mw-e3` max-w 560 · header title 16/600 · footer right-aligned
buttons (danger confirm uses danger button) · Esc + scrim close except
destructive confirms · z 40. **Flyouts / context menus / popovers:** r10
border `mw-e2` · item h32 (icon 16 + label) · separator `mw-border` ·
danger item `mw-red-400` · z 30.

**Progress & loading:** spinner = rotating arc 1s (sm 16 / md 24 / lg 32);
determinate bar 4px track `mw-neutral-800` + accent fill; indeterminate =
1.2s shimmer; **skeletons** = `mw-surface2` blocks r8 + shimmer — layouts
load as skeletons, never spinners (and never blank).

**Text furniture:** link accent (underline on hover) · inline code
`mw-surface2` + mono 12 r4 · text selection accent @ 25% · diff view:
added green @ 15% bg, removed red @ 15% (op-log/receipts) · dividers
1px `mw-border` (inset variant 12px margins).

**Canvas furniture:** bg `mw-canvas-bg` = neutral-950 (light: neutral-100)
with 1px dot grid `mw-neutral-800` @ 24px spacing · device frame =
surface, r18, border, `mw-e2` · selection outline 2px accent
(radius-following) · hover outline 1px accent @ 40% · drop line 2px
accent · drop-into = inset 2px dashed accent · resize handles 8px white
squares + accent border · snap guide 1px violet dashed · measurement
label mono 11 chip · **cursors:** default / grab / grabbing (drag) /
text (dbl-click) / crosshair (insert mode) / not-allowed (illegal drop).

**Rail specifics:** user bubble accent @ 18% bg, radius 14/14/4/14 ·
muse prose plain on surface · system pill surface2 12px · recording =
mic button red bg + pulse ring · suggestion chips surface2 → hover
border-accent · token ring stroke accent → amber @70% → red @90% ·
model pill mono 11.

**Z-index scale (never ad-hoc):** canvas 0 · docked panels 10 ·
sticky/status 20 · flyout/popover/dropdown 30 · modal 40 · toast 50 ·
tooltip 60.

**Density:** exactly ONE — pro-compact (§9.1). A density switch is out of
v1 (§11.5); scale everything through the tokens, never per-screen hacks.

**The Gallery rule (enforcement):** a `/gallery` route renders EVERY
element above in EVERY state (rest/hover/active/focus/disabled/loading ×
both themes) — the visual QA page and the CI screenshot target. An
element missing from the gallery is missing from the product; a component
that cannot be rendered from tokens alone is a review finding.

**Enforcement (same discipline we preach to users):** zero hardcoded
hexes/px in components — ESLint stylelint rule + CI grep over src/ for
`#[0-9A-Fa-f]{3,8}` outside the token definitions; contrast: AA for
every ink-on-surface pair in BOTH themes, tested in CI from the alias
table; the landing uses the same tiers plus its marketing display sizes.

**Desktop ≥ 1024 px (the power surface):**
```
┌───────────────────────────────────────────────────────────────────────┐
│ TOPBAR 64px: (muse✦) screen-tabs [home +] │ viewport [📱|💻|🖥] ·      │
│ [▶ Run](gradient) · [↩][↪] · [Export ▾] · agent pill "✦ Building 2/4" │
│ + [⏹ Stop] (red, visible while live — law 7)                          │
├───────────┬────────────────────────────────────────┬──────────────────┤
│ LEFT 260px│ CANVAS (center, neutral checkered bg)  │ AGENT RAIL 340px │
│ tabs:     │ device frame, live ProjectDoc render;  │ full-height chat │
│ [Insert]  │ selection outline + id chip; drop      │ (§9.5): header · │
│ [Layers]  │ zones; dbl-click inline edit           │ messages · cards │
│ Insert =  │ INSPECTOR: 280px panel docked INSIDE   │ · composer       │
│ palette   │ the canvas right edge while a node is  │                  │
│ grouped;  │ selected (Esc / click-empty closes —   │                  │
│ Layers =  │ no third column fighting for width)    │                  │
│ tree      │                                        │                  │
├───────────┴────────────────────────────────────────┴──────────────────┤
│ STATUSBAR 24px: session spend · tokens this turn · autosaved ✓        │
└───────────────────────────────────────────────────────────────────────┘
```
Both side panels collapse to 48px icon rails (`⌘\` left, `⌘⏎` right);
collapsing the rail NEVER stops the agent (it streams on; the topbar pill
+ Stop remain). Empty canvas (first run): one centered line — "Describe
your app to Muse, drag a component in, or import a preset." — plus chips
[Start from blueprint] [Recreate a screenshot] [Import preset].

**Tablet 600–1023 px:** the same three zones reshaped — LEFT becomes a
56px icon rail (Insert/Layers open as flyovers); the AGENT RAIL becomes a
bottom sheet (peek = 88px showing the last line + Stop; drag to 50%/full);
the canvas runs full-width behind. Everything reachable one-thumbed in
landscape.

**Mobile < 600 px (companion — command, review, tweak):** single column:
topbar (logo, breakpoint pill, overflow) + full-bleed canvas + bottom bar
56px: [＋ Insert] [☰ Layers] [✦ Muse] [▶ Run]. Selection opens the
inspector as a bottom sheet with a drag handle. **✦ Muse opens the rail
full-screen** — on a phone the chat IS the primary building surface (the
field lesson: chat holds everything; popups die). Touch drag is coarse,
so mobile adds tap-to-add (pick component → tap parent) and leans on the
agent for heavy work; approve/stop/review/run all work fully — the whole
show is directable from a phone.

All three are the SAME components reflowed by Museware's own §9.7
breakpoint system — dogfood it or it doesn't ship.

**Global chrome:** Onboarding (first run, one screen, ~40 s): wordmark,
one line ("The canvas where Muse builds with you"), key paste with
instant per-model probe chips (§6.1 — red models honest with the verbatim
error), then the three start chips. No marketing carousel, no signup.
Settings modal: masked keys + re-probe, the model matrix read-only with
per-role effort overrides, daily budget cap (soft warn, hard stop), theme,
data (export/import/wipe). **Receipts drawer** (statusbar click): per-turn
model/token/cached-hit/image/SAM rows and cents — from real usage objects
only (law 13). Empty states teach in one line each.

### 9.2 Canvas
- Recursive `NodeView` renders the tree with resolved styles (tokens → CSS vars).
- **Dragging** (§9.2.1 below) is one pointer implementation for both gestures:
  palette → canvas (insert) and node → node (move). The layer panel owns the
  third: row → row with dnd-kit, reorder AND nest by indentation (§9.2.2).
- Drop indicators: before/after = a 2 px accent line across the edge; inside =
  an inset accent outline on the container (pointer within 12 px of the edge
  counts as before/after). Illegal drops are visibly impossible: the rule set is
  §3.3's, applied at drag time.
- **Selection: everything selects.** One delegated click handler on
  `.frame-viewport` resolves `e.target` up to the nearest `n-<id>` element.
  Cards, headings, rows and columns always worked; buttons, icon buttons, links,
  FABs, tab labels and every form field did not, for two reasons that are now
  laws:
  - *Edit mode = everything selects. Run mode = things behave.* An element may
    stop propagation ONLY when `mode === 'run'`; in edit mode a `tap` is a no-op
    and stopping the click is pure loss (it killed the selection).
  - *A field stays hit-testable.* `pointer-events: none` in edit mode (the old
    anti-typing guard) makes an element invisible to the mouse, so the click fell
    through to its parent and selected the wrong node. The guard is now
    `onPointerDown → preventDefault()`: the field remains the click target, still
    cannot take focus or open a picker, and a tap on it selects it.
  - *Chrome never steals the selection.* The move handle sits outside any
    `n-<id>`, so its click resolves to "nothing"; it stops propagation itself.
- Outline uses `--mw-accent`. Double-click text nodes → inline edit (Enter or
  blur commits, Esc cancels; the commit is a plain `setText` op). Hover shows the
  node's id chip (ids matter to the agent round-trips).
- **Chrome cannot escape the canvas.** Selection, hover, id chip and drop
  outlines are absolutely positioned INSIDE the scaled artboard, so an
  un-trapped `z-index` paints them over the inspector, menus and the mobile tab
  bar. `.canvas-area` therefore owns a stacking context
  (`isolation: isolate`), the drag ghost is portalled to `document.body` (it must
  float over the panels, and a `fixed` element inside a transformed frame is
  pinned to the frame instead of the pointer), and `check:tokens` fails the build
  if that context is removed or if any canvas overlay becomes `position: fixed`.
- User drags produce the SAME ops as the agent — one history, one undo.

#### 9.2.1 The pointer drag (palette → canvas, node → node)

- `pointerdown` on a palette tile (or the move handle) begins a drag in
  `useDrag`; `pointermove` resolves a target; `pointerup` commits ONE op;
  `pointercancel` CANCELS (it used to commit whatever the last hover was, which
  built things on a stray gesture).
- The target is resolved twice and the first hit wins: `dropTargetFor(e.target)`
  — the element the event reached — then `document.elementFromPoint(x, y)`.
  A single `elementFromPoint` alone answered "the canvas padding" or "an overlay"
  whenever the pointer was between nodes, so releasing in the middle of a screen
  silently did nothing. **Empty artboard space is a target**: it maps to the
  screen node, so a drop in the padding appends to the screen.
- Anything OUTSIDE `.frame-viewport` is not a target: a stray release over a
  panel cancels instead of building.
- The target speaks about the NODE, not the deepest span inside it — `before` and
  `after` therefore use the container's geometry, not a line of text's.
- On commit the drag reports honestly: an op applied → a toast naming what
  happened and that ⌘Z undoes it; a refusal ("That element cannot hold
  children", "Already there") → a warn toast saying why. A drop that does
  nothing must never be silent.

#### 9.2.2 The layer panel (reorder and nest)

`src/layers/move.ts` owns the decision, because the old inline maths had a bug
that made the panel feel fake: dragging a row DOWN one slot computed the index
the row already had, so nothing moved — silently. The solver: descend / move up /
move down (de-indexing the row's own slot when it leaves its parent), nest when
the row is dragged right by more than `NEST_INDENT_PX` (18 px) over a CONTAINER,
and refuse self, descendant, root and no-op moves with a sentence. The row under
the drag highlights (`data-over`) and a successful move toasts "Moved — ⌘Z undoes
it". The panel's hint says it in the same words: "drag a row to reorder it; drag
it right, over a container, to nest it inside."

### 9.3 Inspector

**Props tab** — schema-driven from §4: one control per `PropKind` (text /
longtext / number / select / toggle / icon-picker / screen-picker / tone /
data-key / bindKey), each with its required label and hint. A container with no
content props says so in a sentence instead of showing an empty section
("Row (horizontal) has no content of its own — what it holds, and how it spaces
it, lives in the Style tab").

**Style tab** — rendered from `STYLE_FIELDS` (§4.4), grouped and FILTERED BY
RELEVANCE. The old tab was one flat fourteen-field list shown to every widget,
which is why none of the fields meant anything. Now:

| section | shown when | fields |
|---|---|---|
| Layout · children | the node is a container | Align children, Distribute children, Wrap, Space between children (+ Columns at this width on a wider breakpoint) |
| Layout · in parent | the node is not the screen root | Align in parent, Fill leftover space |
| Space | always | Inner space, Outer space, Corners |
| Size · match, hug or fixed | always | Width, Height (Match/Hug/Fixed segmented + length box), Min/Max width, Min/Max height |
| Colour | always | Background, Text colour, Border — token swatch grid, custom hex last |
| Type | text-ish types only | Text size, Weight, Line height, Letter spacing, Text align |
| Effects | always | Shadow, Opacity, Overflow |

Every field prints its `hint` underneath. There is no field labelled bare
"Align", and a test asserts it: the two alignment words are "Align children"
(align-items) and "Align in parent" (align-self).

**Breakpoint awareness (§9.7):** the inspector edits the breakpoint the topbar
switcher currently shows; a field carrying an override at THIS breakpoint gets a
filled dot (tap to revert to inherit), and the tab shows how many overrides the
width has plus one "inherit" button that clears them.

**Events tab** (§4.2): only the triggers in `EVENT_MAP` for this type, each a
WHEN/THEN chip editor whose argument fields are pickers — zero code. A block with
no events says so once.

**Foot:** Save as component (§4.3), Duplicate (one op), Delete, and "Ask muse to
restyle this" → prefills the rail with a scoped request.

Bindings list (`bindKey`s on the screen) lives on the screen inspector (nothing
selected), next to the design-system presets.

### 9.4 Screens & viewport
Screen tabs add/duplicate/delete/rename screens. The viewport switch resizes the
canvas frame (390 / 768 / 1280 wide) — the tree is responsive (flex/grid), not
absolute. The initial viewport follows `kind` (§8.8); switching is always
manual-after.

**The artboard is laid out at its TRUE width and only the DISPLAY is scaled.**
Edit-mode height is 780 px (so a whole phone fits a laptop screen with the chrome
on); Run mode grows to 844 px. When either axis overflows the canvas,
`fitScale` shrinks what you see — clamped to [0.2, 1], never upscaled, rounded to
three decimals — and the frame's reserved box comes from that size so scrolling
and centring stay honest. Two consequences, both load-bearing:

1. `getBoundingClientRect()` reports RENDERED pixels: overlays, drop lines and
   the inline editor divide by the scale before speaking in frame coordinates.
2. Hit-testing and pointer coordinates stay in rendered pixels and need no
   adjustment at all.

The frame chrome prints the real numbers ("390 × 780 · 74%"), so the preview can
never lie about what it is showing.

### 9.5 Agent rail & cards (port of the field-proven set — richness identical)
- **How-to-build card** (auto-posted after a turn creates the first screens): "Build it — how?" with Blueprint
  first (recommended) / Steady screens / Fast screens / Not now. Leaves on tap.
- **Blueprint approval card**: rendered screen thumbnails + rules text (8-line clamp)
  + Build it / Adjust it / Cancel. New card per adjust round.
- **Progress card** (fill queue): "🛠 Screens 1 of 4 — Home…", live lines (12 s
  throttle), ⏹ Stop, tap a DONE screen to expand: summary + Undo this screen /
  Rebuild this screen / Keep it (snapshots make all three real). FAILED screen rows
  show the reviewer's PROBLEMS + Rebuild.
- **Choice card / Colour card** (§8.6). **Typing-dots bubble** with the heartbeat
  text during long agent work ("🛠 Building 2 of 4 — Details…"), settling to a final
  line. **Error card** with the honest message + Retry.
- The rail renders the LAST 100 messages (full history persisted; a
  "load earlier" chip reveals more).
- All cards: leave-on-answer (law 11); all rail content persisted with the project
  (restore on reload — cards older than the session restore as their decided/final
  state, never re-askable ghosts).

**Rail anatomy (all breakpoints):**
- **Header 48px:** ✦ + model pill ("spark-1.3 · effort:med" — tap opens the
  role picker read-only) · turn token meter (ring filling toward the 24-call
  cap) · session cents · [⏹ Stop] when live (red, ALWAYS here while
  running — even with the rail docked closed on desktop, the topbar pill
  carries it too).
- **Messages:** user = right-aligned mw-accent-surface bubbles; muse prose =
  left, plain text on mw-surface (15px/1.5); system lines ("✓ Picked: …",
  "🎨 #6D5CFF — applied everywhere") = centered 12px mw-ink3 pills; tool
  activity = one live line + typing dots during work, with the heartbeat
  text appended in place (never new lines per beat).
- **Cards:** mw-surface2, 1px mw-border, 16px radius, 12px rise-in; title
  row 14px semibold; content per kind (choice rows = 44px tall, 16px swatch
  dots, hover raises; blueprint = thumbnail grid 2-up; progress = part rows
  with state icons); answered cards LEAVE (fade-collapse 150 ms) leaving
  the quiet system pill.
- **Composer 56px+:** auto-growing text (max 6 rows) · [📷 screenshot]
  (image → §8.9 pipeline; also plain paste anywhere on the canvas) ·
  [🎙 hold-to-talk] (§8.10) · send = the muse-gradient circle. Idle state
  above the composer: three suggestion chips (context-aware: empty project
  → "Start from blueprint"; after a build → "Add a settings screen";
  selection → "Restyle this").
- **Status row (while running):** "✦ Writing canvas changes… 3 of 5
  screens" + mini progress + Stop — pinned directly above the composer so
  it survives scroll.

### 9.6 Run mode
Toggles the canvas to a real running app: navigation actions switch screens, state
actions mutate a per-run store (`bindKey`s read/write it), toasts toast, forms bind,
and every component's EVENTS fire their action lists in order (incl. `when`).
This is the judge-moment feature: "the AI built this, and it actually RUNS."

---

### 9.7 Responsive design (the thing Sketchware never had)
**The model: three named breakpoints, compact-first, zero code.**
- Breakpoints (pinned): **compact** = the base styles (design at 390×844);
  **medium** ≥ 600 px; **expanded** ≥ 1024 px. (Material window-size
  classes — three is enough for the demo and for real sites.)
- Mechanism: a node's `styles.responsive` holds per-breakpoint overrides
  (§2). Rendering generates one CSS class per node id plus
  `@container mw (min-width: …)` blocks — the canvas, RunMode, and the
  exported code all consume the SAME generated CSS. No duplicate styling logic
  anywhere. (Container queries, not media queries: the artboard is a container,
  so the same CSS reflows inside a 390 px canvas frame, a phone and a desktop
  browser without knowing the window size.)
- **Design-time UX (the topbar 📱 💻 🖥 switcher EDITS, it doesn't just
  preview):** the switcher selects the breakpoint being edited. On 📱 you
  edit base styles; on 💻/🖥 edited fields write `responsive.medium` /
  `.expanded` overrides. Fields inheriting from the lower breakpoint show
  an "inherits" chip; overriding one shows a filled dot (tap = clear
  override). The frame resizes instantly to the new width so the reflow is
  VISIBLE while you edit. It does NOT animate — see the round-trip law below.
  Nodes carrying an override at the current breakpoint get a small dot badge on
  the canvas too.
- Defaults are responsive already: containers flex/wrap, `grid.columns`
  overridable per breakpoint, hero splits side-by-side at expanded via
  its default overrides, text uses relative sizes. A fresh component
  needs zero breakpoint work to look right on all three.
- **The AI writes it too:** `setStyles` ops may include `responsive`
  overrides; the system prompt's compact-first rule (§8.5) plus the fill
  prompt's LOOK line keep it purposeful (reflow where it matters, not
  vanity overrides). The reviewer sees compact AND expanded outlines
  (§8.3), so a broken tablet layout FAILS review like any other defect.
- **The round-trip law (v1.6).** Switching compact → medium → expanded →
  compact must return the artboard to its original size. The fit used to be
  derived from the frame's MEASURED `offsetWidth` while a CSS width transition
  was still running, so the layout effect measured the OUTGOING breakpoint and
  the phone inherited the desktop's scale — permanently, because nothing
  re-measured afterwards. Two rules fix it for good:
  1. **Width comes from `BREAKPOINT_WIDTHS[breakpoint]`, never from a
     measurement.** Only height is measured (Run mode changes it). A stale box
     can no longer decide how big a phone looks.
  2. **No width transition on `.device-frame`,** and the fit re-runs once after
     two animation frames, so a settled layout is what gets measured.
  A test pins it: it lies to the frame (always reports 1280) and requires the
  scale to follow the breakpoint anyway, including a five-step round trip.
- RunMode reflows live with the browser window — judges will drag the
  window edge; let them.
- **Watches & tiny screens: honest fence.** v1 targets ≥ 320 px compact;
  a wrist UI is a different paradigm (glances, no scroll) and Wear OS has
  no real browser to run a PWA — so watches are explicitly OUT of v1
  (§11.5), stated in the README, not silently broken. The 320 px no-break
  test (§13) is the small-screen guarantee we DO make.
- Why not absolute positioning ever: absolute coordinates are the
  Sketchware trap — one screen size, everything else stretched. The
  flex/grid + override model is what makes one design truly be three.

## 10. Export

### 10.1 React codegen
`ProjectDoc → React components` (one component per screen; styles → the SAME
generated CSS classes + `@container` blocks the canvas used (plus
`tokens.css`), so breakpoints survive export exactly; actions → `useState`/`useNavigate`
equivalents in a 40-line runtime stub). Deterministic, readable, no AI in the loop.
Round-trip guarantee: exported projects re-import as `museware/1`.

### 10.2 PWA (the "mobile app" story)
Zip bundle: `index.html` + built JS/CSS + `manifest.webmanifest` (name/theme/icons
from tokens) + one-file service worker (offline shell). Button: "Install as app" in
the exported README. Optional appendix: Capacitor wrap instructions (out of demo
scope, two paragraphs max).

---

## 11. Persistence & Recovery
- IndexedDB autosave: debounced 800 ms on every applied batch + rail append.
  Persist-on-create law: blueprint card content, token changes, and op log entries are
  saved the moment they exist.
- Reload recovery: replay = load ProjectDoc; rail restores; an agent mid-turn at kill
  time restores as "interrupted" (honest line: what the op log shows was applied).
- Project file: download/upload `.museware.json` (the ProjectDoc). Import validates
  with zod; unknown fields preserved.

### 11.1 Layout v2 migration (one-time, idempotent, on every load)

`src/persist/migrate.ts` rewrites a pre-v1.6 document to the vocabulary in §4.4
BEFORE zod sees it — refusing to open somebody's project in order to teach them
a rule is the wrong trade, and a v1 document may hold a value the dictionary now
rejects (`justify: "stretch"`). It moves each value to the home that matches
what it always did:

| from | to | why |
|---|---|---|
| container `props.gap` / `props.align` / `props.wrap` | `styles.gap` / `.align` / `.wrap` | layout belongs to styles |
| `card` `props.pad` | `styles.padding` | it was an inline padding all along |
| LEAF `styles.align` | `styles.selfAlign` | it always compiled to align-self |
| `justify: "stretch"` (base or a breakpoint block) | dropped | never a valid justify-content |

Rules that make it safe: **a style value always wins** over the legacy prop;
`layoutVersion: 2` is stamped so it is a one-way trip per document (a migrated
CONTAINER's `align` now means align-items and must never be demoted a second
time); documents created now start at 2; and the CSS engine keeps the props
fallback (§4.4) so a document that is never re-saved still renders identically.
Golden test: a v1 document is migrated, rendered before and after, and the row's
rule is byte-identical.

---

### 11.5 Explicitly NOT in v1 (scope fence — do not build, do not promise)
Multi-user/collaboration; server-side project storage (IndexedDB + file I/O
only); custom code components or arbitrary-JS actions; real backend
connectors or auth; themes beyond light/dark; RTL; i18n; native mobile
builds (PWA/Capacitor wrap only); watch/wearable UIs (a wrist paradigm,
not a small phone — the compact breakpoint bottoms out at 320 px and that
is the honest floor); template gallery/marketplace; version branching. If a demo request drifts here, the answer is "post-hackathon".

### 11.6 Security & safety
The API key never reaches the browser bundle (CI greps the dist). Model
output is DATA, never executed: ops pass zod, no `eval`/`new Function`
anywhere, exported code is static text the user downloads. All text renders
as text (React escaping; `dangerouslySetInnerHTML` is banned repo-wide).
`image.src` accepts only `https:` and `data:` (validated at op time).
`openUrl` shows an explicit confirm chip in RunMode. Receipts/logs carry
lengths and tool names — never prompt content.

## 12. Milestones (hackathon clock; acceptance criteria are testable)

- **M0 (h1–2) Skeleton:** Vite+TS+Zustand runs; ProjectDoc store + ops reducer +
  undo; canvas renders a hardcoded tree; palette drag-drop with container rules.
  ✅ drag a button into a card, undo restores, reload persists.
- **M1 (h3–4) Muse loop:** proxy (api.meta.ai, Responses surface) + client + pacing
  + per-role efforts + reasoning replay; the six tools with zod;
  system prompt; rail with live lines + dots + stop. ✅ "make a landing page with a
  hero and 3 feature cards" → one batched edit_canvas → canvas shows it; receipts in
  the op log.
- **M2 (h5–6) Tokens & presets:** token store + CSS materialization; preset import
  (the two openui-1.0 preset files load day one, foundations preserved); token sheet
  generator (1800 cap, key-field test). ✅ set brand colour → whole canvas repaints.
- **M3 (h7–8) Blueprint flow:** propose_blueprint → persist-on-create → approval card
  with thumbnails → fill queue (N-of-M + Stop + per-screen undo) → verify gate with
  one rebuild round. ✅ full "habit tracker for my daughter" run end-to-end.
- **M4 (h9) Inspector & layers polish:** schema-driven editing; user drags = ops;
  Events tab (logic chips) + custom components (save/place).
- **M5 (h10) Run mode + export + the family:** actions run; React codegen +
  PWA zip; muse-image hero/icon generation into projects; SAM Screenshot→
  Canvas (§8.9); voice hold-to-talk (§8.10); per-model probe chips.
- **M6 (h11) Hardening:** reload recovery, choice/colour cards with swatch dots +
  typed-options fallback, error cards, heartbeat, caps audit.
- **M7 (h12) Demo:** script below; recorded fallback; README with the architecture
  diagram.

**Demo script (5 min):** 1) blank canvas → speak the prompt (voice) → blueprint
card with rendered thumbnails → approve → screens fill with N-of-M + dots + Stop.
2) Drop a screenshot → SAM reads it → thumbnails → build → compare side by side.
3) Tap a colour on a choice card → canvas repaints everywhere. 4) "Generate a hero
image for this" → muse-image lands a real picture in the frame. 5) Drag a button by
hand next to the AI's work → undo both histories together. 6) Run mode: click
through, resize the window through the breakpoints. 7) Export PWA → open on a phone.
Fallback: pre-recorded run.

---

## 13. Test Checklist (numbered, from the field scars — run ALL before demo)

1. One-prompt full build: zero unbatched add calls in the log (grep the op log —
   any `edit_canvas` with a single add op = law-2 violation, tighten prompt).
2. Kill the tab mid-blueprint → reopen → blueprint still there (persist-on-create).
3. Kill mid-fill → reload → honest "interrupted" state, N of M applied, no ghost
   pending cards.
4. Stop mid-fill → built screens stay, queue clears, final line exact.
5. Token import (both preset files) → foundations sections survive save→reload.
6. Token sheet length ≤ 1800 for both presets; component tokens non-empty
   (key-field regression).
7. Model types colour options as text (simulate by prompting) → typed-options chips
   appear, tap sends the option, dots show, labels hex-free.
8. Colour card: bad hex → card stays, honest line; Everywhere → canvas repaints;
   Just this element → only that node.
9. Verify gate: force a cramped result (prompt for "no padding") → reviewer says
   PROBLEMS → one rebuild → remaining notes shown honestly.
10. Undo across agent+user ops mixed (5 deep) — each restores exactly.
11. Rate-limit simulation (429) → countdown line, no retry storm, no data loss.
12. Stop button reachable at ALL times while running (including mid-stream).
13. Run mode: every navigate/setState/toast action works; no console errors.
14. Export: codegen compiles, PWA installs on Android Chrome, icon = brand colour.
15. Cost receipts panel: one full build ≤ 150 requests, ≤ $1 (log proves it).
16. The §8.8 landing-page trace runs EXACTLY as written, timed (≤ 6 requests).
17. Events in RunMode: a toggle chip flips `visibleWhen` content live; form submit
    fires its action list; nested `when` evaluates once per change.
18. Custom component: save a selection → palette group appears → place twice →
    both copies render; `E_NAME_TAKEN` on duplicate name; AI can do the same.
19. Responsive: build with overrides → drag the browser edge through
    600/1024 in RunMode → reflow matches the switcher; exported site
    reflows identically; 320 px compact shows no overflow/broken wrap.
20. Breakpoint editing: override a field on 💻 → filled dot appears, 📱
    unaffected; clear the override → inherits again; undo restores.
21. Model matrix: onboarding probe chips match reality (kill a model's key
    path → its chip goes red with the verbatim error; builds on the
    remaining roles still work).
22. Screenshot→Canvas: a 6-element mock → ≥ 5 correctly typed components,
    responsive tree (no absolute leftovers), approval card first.
23. muse-image: "generate a hero image" → image asset placed and persisted
    (reload keeps it); no key/never generated → SVG placeholder path still
    renders.
24. Voice: hold-to-talk → transcript in composer → sent as text; mic
    denied → honest line, composer still fine.
25. Contributor guard: budget/profile switch to contributor works in dev,
    and the demo profile REFUSES to export artifacts built with it
    (restriction honored, message explains).
26. **Everything selects:** click a card, a heading, a row, a form, a button, an
    icon button, a link, a FAB, a tab label, a text field, a textarea, a select,
    a slider and a date picker — each selects ITSELF, never its parent. Then
    press Run: the same clicks act like an app and do not re-select.
27. **Fields stay hit-testable:** in edit mode a field cannot take focus or open
    a picker (pointer-down is cancelled), and no edit-mode field carries
    `pointer-events: none`. Grabbing the move handle keeps the selection.
28. **Drag and drop:** a palette block dropped on the MIDDLE of a card inserts
    there and selects it; dropped on empty artboard it appends to the screen;
    released over a panel it cancels and builds nothing. A pointercancel builds
    nothing. The ghost follows the pointer over the panels.
29. **Layers:** drag a row DOWN one slot → it moves down one (the old maths wrote
    the index it already had); drag a row RIGHT over a container → it nests; a
    row onto its own child refuses with a sentence; the row under the drag
    highlights.
30. **Breakpoint round trip:** compact → medium → expanded → compact returns the
    artboard to its original scale. The fit follows the breakpoint even when the
    frame lies about its measured width.
31. **One vocabulary:** a Row's Style tab shows Align children / Distribute
    children / Wrap / Space between children and no field labelled bare "Align";
    Width and Height offer Match / Hug / Fixed; `grow` writes `flex-grow`; the
    agent cannot save `justify: "stretch"`, `variant: "banana"`, a button with no
    text on add, or a crossed range.
32. **Honest panel:** a Divider's Events tab shows one "no events" line, not
    three dead editors; every prop in the panel shows its hint; opening a
    v1.5 project migrates it silently and it still looks the same.

---

## 14. War Stories (one-line each — why the laws exist; cite in the README)
- 190 tool calls in ONE message (unpaced loop) → law 10.
- 135 failovers, design rebuilt 3× (Auto routing) → law 9.
- 429s cascading per-KEY across a whole model catalog → law 10 + pinned models.
- The pretty preview painted the spec while the text blueprint carried no numbers →
  LOOK lines with hard numbers (§8.4).
- Model typed colour options as chat text, tool never called → §7 structured-output
  defence + §8.6 fallback.
- Blueprint lost on process death ("no way to get back") → law 8.
- Crash: rail updated from the worker thread → §8.1 all-UI-on-main rule (web:
  never touch the store from a stream callback without the state library).
- "Didn't see the stop button… every other thing was trash" → law 7.
- Save path stripped unknown preset sections → §5.1 preservation rule.
- Agent ran straight into building after project creation → law 12 (E_BUILD_CARD).
- muse-glimmer-30b timed out twice (90 s) on hello-world; muse-wonder
  failed twice with "Missing Authentication header" through a third-party
  path (28 Oct export) → per-model probe at onboarding (§6.1) + the
  documented api.meta.ai base with Bearer auth only.
- The same export: spark-1.1 cloned a screenshot end-to-end, 10/10 ops,
  zero quota errors → the muse family carries Museware (§6.1 matrix).
- Dead cards stayed clickable after answering → law 11.
- Hex codes ate the labels ("Any need for those codes?") → display stripping §8.6.
- Two fields called "Align" did different things (`align-items` in one home,
  `align-self` in another) → one word per concept, `selfAlign`/`grow` named for
  what they do (§4.4).
- Row and Column had no property worth setting (gap as a raw CSS string, never a
  weight) → a row without `grow` cannot make a layout, so rows read as decoration
  ("rows and columns are useless and confusing") → the sizing and weight
  vocabulary of §4.4.
- Buttons, links, FABs and every form field were unselectable: `stopPropagation`
  in EDIT mode, where the tap was a no-op → "edit mode = everything selects"
  (§9.2).
- Form fields carried `pointer-events: none` as an anti-typing guard, which also
  removed them from hit-testing, so clicks selected their parent → guard the
  pointer's DEFAULT ACTION, never the element's visibility (§9.2).
- A palette drop released between two nodes did nothing at all, silently
  (`elementFromPoint` answers "padding" or "overlay") → dual hit-test + empty
  artboard is a target + outside the frame cancels (§9.2.1).
- The phone inherited the desktop's zoom after visiting desktop and coming back:
  the fit measured the frame while its width was still animating → measure the
  declared breakpoint width, never the box (§9.7).
- Dragging a layer row down one slot wrote the index it already had, so nothing
  moved and nothing was said → the move solver + a toast (§9.2.2).
- The selection outline drew across the inspector and the tab bar: absolutely
  positioned chrome with a z-index escapes any ancestor that does not out-rank it
  → the canvas owns a stacking context (§9.2).
- A dead `Layout` select on the screen (flex-row changed nothing) and a dead
  `Scrolls` toggle → wire it or delete it (§4).
- `justify: "stretch"` reached justify-content because nothing validated a style
  value and no prompt named a style key → the vocabulary gate (§3.3.1) + the
  grammar in the tool description (§7).

---

## 15. Glossary
**Op** — the single atomic change unit (§3). **Batch** — an all-or-nothing list of
ops from one tool call. **Blueprint** — the up-front plan text + its approval card.
**Fill queue** — the screen-by-screen build after blueprint approval. **Token sheet**
— the ≤1800-char AI-facing design summary. **Verify gate** — render + model
self-review PASS/PROBLEMS with one rebuild. **Rail** — the agent chat dock. **Card**
— an interactive rail message that leaves on answer. **Receipts** — the op log; the
only source of truth for "did it happen." **Event** — a
component trigger (tap/change/submit) holding an ordered action list (§4.2).
**Logic chip** — one action rendered in the Events tab; arguments are
pickers. **Custom component** — a saved subtree placed as copies (§4.3).
**kind** — the project's web/app mode: defaults only, one tree (§8.8).
**Style dictionary** — `types/styleDict.ts`, the single table of layout and
presentation keys with their labels, hints, scopes and CSS output; the inspector,
the validator and the CSS engine all read it (§4.4). **align / justify** — a
CONTAINER aligning its children across the cross axis / distributing them along
the main axis. **selfAlign** — a CHILD aligning itself inside its parent.
**grow** — a child soaking up leftover main-axis space; Sketchware's weight,
Figma's layoutGrow, CSS flex-grow (§4.4). **match / hug** — Sketchware sizing:
fill the parent / fit the content. **EVENT_MAP** — the per-type table of which
triggers a block can actually fire (§4.2). **layout v2** — the one-home layout
model and the migration that moves a v1 document onto it (§11.1). **fit scale** —
the display-only shrink applied to the artboard so the whole frame fits the
canvas; layout stays at the true breakpoint width (§9.4).

---

## 16. Position — beyond Figma AND Sketchware (README-ready)
| | Figma | Sketchware | **Museware** |
|---|---|---|---|
| Design on canvas | ✅ (best-in-class) | ➖ basic | ✅ token-driven, live |
| Logic without code | ❌ none | ✅ block events (Android only) | ✅ logic chips, web + PWA |
| AI builds FOR you | ➖ generating mockups, not an app | ➖ agent bolted on | ✅ AI-native: tools + verify gate |
| AI + human share one source | ❌ | ❌ | ✅ both write the same ops → one undo |
| Runs instantly | ❌ prototype only | ❌ compile step | ✅ Run mode, zero compile |
| What you ship | mockups | APK | website zip / PWA / React code |
| Verify before show | — | — | ✅ render + model self-review, PASS/PROBLEMS |
| Bounded AI context | — | — | ✅ capped sheets/idx/results (laws 6) |
| One model does everything | — | — | ❌ the whole muse FAMILY with fixed roles (§6.1): spark builds, wonder plans, SAM sees structure, image illustrates, voice listens |

The one-line pitch stays: every AI action is a reviewable, undoable
operation on the same canvas you drag on — Figma's canvas, Sketchware's
no-code logic, an AI that actually builds, and it RUNS.

## Appendix A — Verbatim prompt pack (pin these; the wording is load-bearing)

**A1 — System (code model, every request):** §8.5, exact text there.

**A2 — Blueprint:**
"You are the lead architect. One builder will fill every screen later, so
decide EVERYTHING now. Output plain text only. RULES: id style, ONE shared
state namespace, the screen list. Then per screen: 'SCREEN: <Name>' and one
line per component '- <id> (<type>) <what it does; use "opens X" for
navigation>', then 'LOOK: <n>dp outer padding, <n>dp between sections, card
radius <n>, title <n>px, body <n>px, colours by token name'. Then 'STATE:'
every cross-screen key, then 'WIRING:' every connection. ≤ 600 words total.
Colours come from the token sheet — never invent hexes."

**A3 — Reviewer (chat model):** §8.3, exact text there.

**A4 — Fill (per screen):** §8.4, exact text there.

**A5 — Adjust:**
"Revise the blueprint honoring EXACTLY these changes: <wish>. Keep everything
else as it was. Same format as before."

**A6 — Typed-options correction (the model printed options as text):**
"You offered choices as chat text. Call ask_choice with those options
(labels + hexes) instead. The user taps cards, not paragraphs."

**A8 — SAM segmentation prompt (sam-3.1, §8.9):**
"button, input field, label, icon, image, card, navigation bar, list row,
tab, toggle, checkbox, text"
(a noun-phrase list — SAM takes short prompts; every match returns box +
mask; the app sorts/nests, SAM does not).

**A9 — muse-image brief (hero/icon/empty-state, §6.1):**
"Flat vector-style <subject> on <token bg hex>, palette limited to <token
hexes>, generous negative space, no text in the image, <w>×<h>."
(the no-text rule avoids misspelled AI lettering; icons get the project's
brand color explicitly).

**A7 — Vision describe (chat model, ≤ 2 images, before the code model sees
the turn):**
"Describe this UI mockup for a builder: structure top→bottom, every
component with its type, every colour as hex, all text verbatim, spacing
impressions in dp. ≤ 250 words."

---

## 17. The Reference Repository & the Clean-Room Caution (read BEFORE writing any code)

**Reference repo (this branch — frozen as the yardstick):**
**https://github.com/miracles2motion/Sketchware-Pro/tree/arena/8a5fd688-sketchware-pro**
When a question is "how was X done there?" — the agent loop, blueprint flow, verify
gate, token sheet, board/stop UX, pacing, error handling — READ the implementation at
this link for the answer, then design Museware's own way per this spec. Useful starting
points in that tree: `app/src/main/java/pro/sketchware/ai/` (the whole agent:
`AgentLoop`, `AgentBoard`, `AgentTools`, `AgentJournal`, `OpenUiThemeEngine`,
`ChatAdapter`), `docs/AGENT_ROADMAP.md` (every field lesson as it happened), and
`museware.md` (this file, if the branch is newer).

**CAUTION — clean-room rules (non-negotiable):**

1. **The reference repo is source-AVAILABLE, not open-source.** Its own `LICENSE.md`
   says the code likely infringes original Sketchware copyright and must not be used
   in serious non-personal projects. Copying ANY of it into Museware is a legal and
   hackathon-disqualification problem.
2. **READ to understand, NEVER copy to include.** No copy-paste of code, no
   transpilation, no "adapted from", no renamed-variable copies, no resource/XML
   reuse, no regex-or-string constants lifted from that tree. Every line in Museware
   must originate in THIS spec or be written fresh for Museware.
3. **What MAY cross the gap (and only this):** IDEAS and PATTERNS — laws, data-shape
   concepts, UX behaviors, numbers learned from field failures (caps, pacing
   intervals), and the design-token JSON *schema* (`openui-1.0`), which is a format,
   not code. What may NOT: source code, comments, string literals, prompts copied
   verbatim from that repo (this spec's Appendix A is the only prompt source), names
   of internal classes, and any file from that repo included whole or in part.
4. **Audit yourself before shipping:** grep the Museware tree for identifiers that
   exist only in the reference (`AgentLoop`, `AgentBoard`, `openui_` asset names,
   Sketchware XML keys, pro.sketchware paths). Any hit is a violation — rewrite the
   concept from this spec instead. There must be **zero traces of Sketchware** in the
   final product: it should be impossible to tell the yardstick existed.

If an agent cannot honor these rules, it must stop and flag the conflict rather than
"helpfully" reuse code.
