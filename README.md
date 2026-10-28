# Museware

**Figma designs. Sketchware blocks. Museware builds.**

Museware is an editor with an agent inside it. You describe an app, the muse
proposes a blueprint, you approve it, and it writes real ops into the same tree
you drag — then it verifies the result before showing it to you. Nothing on the
canvas is a picture of an app: the tree runs, and the same tree exports as a
React + Vite project (or installs as a PWA).

```bash
npm install
cp .env.example .env      # optional: add MUSE_API_KEY
npm run dev               # http://localhost:5173
```

No key? The **local engine** runs the whole pipeline offline — same cards, same
ops, same verify gate — so you can judge the product rather than a promise.
Add a key in Settings (or `.env`) and the pinned muse models take over.

---

## The laws it is actually built on

1. **Tools, not typed UI.** The model gets six tools — `read_canvas`,
   `set_design_tokens`, `propose_blueprint`, `ask_choice`, `edit_canvas`,
   `finish` — and never emits UI as text. Prose stays prose.
2. **Every change is an op.** Yours and the agent's. `add`, `move`, `remove`,
   `setProps`, `setStyles`, `setText`, `rename`, `addScreen`, `removeScreen`,
   `renameScreen`, `setEntry`, `setTokens`, `saveComponent`, `placeComponent`.
   One op log, one undo stack, 50 snapshots deep.
3. **Batched and all-or-nothing.** `edit_canvas` takes up to 40 ops; if one
   fails validation, none of them land.
4. **Blueprint before pixels.** The architect plans screens, ids, LOOK numbers
   and wiring; the approval card renders real thumbnails of the plan.
5. **Verify before show.** A reviewer pass checks compact *and* expanded
   outlines. If it finds problems, the turn says so — it is allowed to fail.
6. **A constrained vocabulary.** 30 components, 51 icon names, 12 colour keys.
   The agent cannot invent a widget, a token, or an icon.
7. **One pinned model per role.** Builder, architect, chat, contributor, image,
   SAM, voice. No routing, no silent fallbacks.
8. **Stop is always visible.** Topbar pill, rail header, progress card, status
   bar — while the agent works, there is always a way out.
9. **Persist on create.** IndexedDB after every op; export/import as JSON.
10. **Cards leave on answer.** A tapped card collapses to a one-line receipt.
11. **Receipts, not claims.** Every model call is logged with role, model,
    latency, tokens and cost.
12. **No JSON in chat.** If the model pastes JSON, the loop corrects it.
13. **Bounded prompts and paced turns.** A 1800-char token sheet, 24 tool calls
    per turn, ≥4000 ms pacing, capped rail history.
14. **No code from the user, ever.** Logic is WHEN/THEN chips, not JavaScript.
15. **Clean room.** Built from the written specification alone. The reference
    repository was read for ideas only; no code, comments, strings, class names
    or assets were copied, and the product contains no trace of it.

## What is in the box

| Path | What it does |
|---|---|
| `src/types/` | The tree, tokens, the 30-component library, zod op + tool schemas |
| `src/ops/` | Ids, tree utils, hydration/validation, the all-or-nothing applier |
| `src/design/` | Museware's own three-tier token sheet, presets, CSS materialisation |
| `src/canvas/` | Generated CSS per node, the 30-type renderer, drag/drop, the canvas |
| `src/inspector/` | Schema-driven props, token-first styles, breakpoint overrides, actions |
| `src/rail/` | The agent rail: messages, six card kinds, composer, stop |
| `src/muse/` | Prompt pack, context builders, HTTP/SSE client, agent loop, cards, local engine |
| `src/export/` | React + Vite codegen, zip, PWA manifest + service worker |
| `src/persist/` | zod project schema, IndexedDB save/load, import/export |
| `src/preview/` | Run mode: navigation, state, toasts, WHEN/THEN execution |
| `server/museProxy.ts` | The **only** place the key is read (Vite middleware in dev) |
| `api/muse/[...path].ts` | Production: one serverless file running the same handler |

## Commands

```bash
npm run dev          # editor + the muse gate as Vite middleware
npm run build        # tsc --noEmit && vite build
npm run typecheck    # tsc --noEmit
npm test             # vitest: op model, blueprint parse, demo trace, shell smoke,
                     # the proxy over real HTTP, the key card, wonder routing
npm run check:tokens # no raw hex outside mw.css + WCAG AA in both themes
npm run check:dist   # no key material, no sourcemaps, size budget
npm run check:export # export a demo app, then typecheck + build it for real
```

`check:export` is the honest one: it renders the landing template through
`generateProjectFiles`, writes it to a temp directory, and runs `tsc --noEmit`
and `vite build` on the result. The export is code, not a promise.

## The key never reaches the browser

Dev: `vite.config.ts` mounts `server/museProxy.ts` as middleware on
`/api/muse/*`. Production: one serverless file wraps the same function. A key
pasted in the UI lives in `sessionStorage` and travels as `x-muse-key`; it is
never bundled, logged, or exported. `npm run check:dist` greps the built assets
for `MUSE_API_KEY`, key-shaped strings and dev-server URLs.

## Deploying with a house key

The deployed site is the honest version: one shared key, a daily cap, and a real
key card the moment the shared key is spent.

```bash
vercel            # preview
vercel --prod     # production
```

`vercel.json` points at `dist` and gives `api/muse/[...path].ts` 60 s. Set these
in the project's environment (never in the repo):

| Variable | What it does |
|---|---|
| `MUSE_API_KEY` | The house key. Without it `/status` reports `houseKey: "absent"` and the app asks visitors for their own. |
| `MUSE_DAILY_CAP` | USD per UTC day, house key only. 80% warns, 100% hard-stops with `BUDGET_EXHAUSTED`. Visitors' own keys are never capped. |
| `MUSE_LIVE` | `1` on the real deployment so `/status` reports `live: true`. CI and local dev leave it unset. |
| `MUSE_BASE_URL` | `https://api.meta.ai` — `/v1` is appended once, never twice. |
| `MUSE_REASONING` | `1` to send reasoning effort on the chat surface. |

What happens when the house key runs out, in order: the proxy answers
`402 HOUSE_KEY_EXHAUSTED` (or `BUDGET_EXHAUSTED` at the cap), the rail parks the
turn on a **key card**, the card asks for a key and retries the exact prompt you
typed with your key. The demo engine is never entered automatically — it is a
switch in Settings and the path CI uses.

A visitor's key lives in `sessionStorage` and travels as `x-muse-key`; it never
touches the bundle, the logs or the export.

## Design system

Museware's own chrome uses its own three-tier token architecture
(`src/design/mw.css`): primitives → semantic aliases → component tokens.
Components reference `var(--mw-*)` only; `scripts/check-tokens.mjs` fails the
build if a raw hex appears outside that file, and if any ink-on-surface pair in
either theme drops below 4.5:1.

The **user's** apps run on the `openui-1.0` token format — the same format the
presets use. One token edit restyles every screen, in the canvas, in run mode
and in the export, because all three consume the same generated CSS.

## Scope (v1, deliberate)

No collaboration, no server storage, no arbitrary JS or custom code, no RTL or
i18n, no watch UIs, no template marketplace. Watches are out because a wrist UI
is a different paradigm and Wear OS has no real browser for a PWA; the
small-screen guarantee v1 does make is "no layout break at 320 px".

## War stories this codebase takes seriously

- A model that types UI produces a screenshot of an app. Tools or nothing.
- A model that writes one op per request burns the budget and the undo stack.
  Batches.
- A model that styles by hex drifts from the theme within two turns. Tokens.
- A model that shows unverified work lies by accident. Verify, then show.
- An agent without a visible Stop is a demo you cannot interrupt — and therefore
  cannot trust.
- "It worked on my machine" is what unexported code says. Ship the export
  through a compiler in CI.
