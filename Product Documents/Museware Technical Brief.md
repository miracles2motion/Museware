# TECHNICAL BRIEF
**Museware: Architecture & System Design**
*November 2026 | Version 1.0*

## Document Information
| Attribute | Details |
|---|---|
| Product Name | Museware |
| Team | Osasumwen Ngozi Scott (ONSInsights): Co-founder and Product Lead<br><br>Miracle Aigbomian (miracles2motion): Co-founder and Developer |
| Primary Stakeholders | Meta Global AI Developer Hackathon judges |
| Event / Track | Meta Global AI Developer Hackathon (Cerebral Valley), Indie track |
| Submission Date | November 4, 2026 |
| Project Duration | Hackathon window of Oct 26 to Nov 4, 2026. First commit Oct 29 |
| Stage | Hackathon prototype build |
| Live App | https://museware.vercel.app |
| Repository | https://github.com/miracles2motion/museware |
| Last Updated | November 2026 |

**Runtime:** React 18 / TypeScript 5.6 / Vite 5 / Node.js 20 / Vercel Serverless

> **In plain English.** Museware keeps your whole design in one project. You and the AI both change that same project, and every change from either of you goes through the same checks and the same undo history. The AI can't edit freely: it can only use a fixed set of editing tools, and each batch of changes is checked before it's applied. If a batch fails, nothing changes. The same design drives the editor, the preview and the exports, so what you see is what you export.

---

## 1. System Topology & Architecture Overview

Museware is a client-side-first single-page application (SPA), backed by a serverless proxy that handles calls to Meta's Model API.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                CLIENT (Browser)                                 │
│                                                                                 │
│  ┌───────────────────────────┐  ┌────────────────────────────────────────────┐  │
│  │   Zustand State Stores    │  │               Editor Chrome                │  │
│  │ - useProject (AST, Undo)  │  │ - Canvas (Artboard, Fit Scale, Drop Box)   │  │
│  │ - useUi (Active Screen)   │  │ - Palette (40 Block Library, Direct Insert)│  │
│  │ - useAgent (Turn, Stream) │  │ - Inspector (Props, Styles, Responsive BP) │  │
│  └─────────────┬─────────────┘  │ - AgentRail (Chat, Blueprint, Presenter)   │  │
│                │                └─────────────────────┬──────────────────────┘  │
│                ▼                                      ▼                         │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                            Turn Execution Loop                            │  │
│  │  - Context Assembler (Tokens, Project Index, History)                     │  │
│  │  - Quality Lint & Reviewer Gate (Deterministic Hierarchy Validation)     │  │
│  │  - 50-Step Universal Undo Stack (Unified Snapshot Buffer)                 │  │
│  └─────────────────────────────────────┬─────────────────────────────────────┘  │
└────────────────────────────────────────┼────────────────────────────────────────┘
                                         │ HTTPS / SSE Streaming
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     GATEWAY PROXY (Vercel Serverless / Node)                    │
│                                                                                 │
│  ┌───────────────────────────┐  ┌────────────────────────────────────────────┐  │
│  │   Key & Session Resolver  │  │           Budget & Spend Circuit           │  │
│  │ 1. User Header (x-muse-key│  │ - MUSE_DAILY_CAP (UTC Day Ceiling)         │  │
│  │ 2. House Env (MUSE_API_KEY│  │ - 80% Soft Warning / 100% Hard Stop        │  │
│  │ 3. Typed 402 Key Fallback │  │ - Token Rate Matrix (§6.1 Pricing)         │  │
│  └─────────────┬─────────────┘  └─────────────────────┬──────────────────────┘  │
│                └───────────────────────┬──────────────┘                         │
└────────────────────────────────────────┼────────────────────────────────────────┘
                                         │ Bearer Auth / Streaming Completions
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               Upstream AI Models                                │
│       - muse-spark-1.3 (Builder)           - muse-wonder-1.0 (Architect)       │
│       - muse-image-1.0 (Illustration)      - muse-spark-1.3-contributor         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Document Data Model & State Architecture

### 2.1 The AST Schema (`src/types/tree.ts`)
The entire canvas is modeled as an immutable document tree:
```typescript
interface ProjectDoc {
  format: 'museware/1';
  schemaVersion: 3;
  name: string;
  kind: 'web' | 'app';
  screens: ScreenDoc[];
  tokens: DesignTokens;
  customComponents: CustomComponent[];
  blueprint?: { text: string; decided: boolean; updatedAt: number };
  opLog: OpEntry[];
  rail: RailEntry[];
  layoutVersion: 2;
  automatedImageBudget: { used: number; cap?: number };
  updatedAt: number;
}

interface ScreenDoc {
  id: string;
  name: string;
  entry?: boolean;
  root: ComponentNode;
  mockData?: Record<string, MockRow[]>;
}

interface ComponentNode {
  id: string;
  type: ComponentType; // Exactly 40 supported types
  name?: string;
  props: Record<string, unknown>;
  styles: StyleSet;
  children: ComponentNode[];
  events?: { tap?: Action[]; change?: Action[]; submit?: Action[] };
  visibleWhen?: { key: string; equals?: unknown };
}
```

### 2.2 Style Cascade & Responsive Resolution (`src/canvas/cssGen.ts`)
Styling is strictly declarative and inherits through three viewport tiers:
1. **Compact (`compact`)**: Base style properties applied to mobile viewports (default 390px width).
2. **Medium (`medium ≥600px`)**: Overrides stored in `styles.responsive.medium`.
3. **Expanded (`expanded ≥1024px`)**: Overrides stored in `styles.responsive.expanded`.

At render time, `resolveStyles(node, breakpoint)` evaluates the cascade without duplicating base classes, so styles rendered in the editor match the exported output.

---

## 3. The Agent Turn Loop & Tool Calling Wire Protocol

### 3.1 Tool Schema Refusal Prevention (`src/types/wire.ts`)
Upstream frontier models (including Meta AI) enforce strict JSON Schema limits:
- `400 Recursive JSON schemas are not currently supported`
- `400 JSON schema exceeds the maximum nesting depth of 10 levels`

To prevent fatal upstream refusal errors:
1. **Wire Schemas vs. Runtime Validators**: `src/types/wire.ts` defines shallow, non-recursive tool mirrors where `edit_canvas` accepts bounded ops, and component props remain open scalars.
2. **Runtime Authority**: Bounded payloads are validated upon reception by `src/ops/apply.ts` using the authoritative `opSchema`.
3. **Zero References**: Tool parameter schemas are emitted with `$refStrategy: 'none'` and flattened via `tighten()`, yielding ~19 kB of schema definitions with zero `$ref` pointers.

### 3.2 Dual-Mode Awareness: New vs. Existing Projects
In `src/muse/loop.ts` and `src/muse/projectIndex.ts`:
- **When `doc.screens.length === 0`**: The agent enters **Planning Mode**, offering design palette choices (`ask_choice`), generating the multi-screen plain-text blueprint (`propose_blueprint`), and waiting for human approval.
- **When `doc.screens.length > 0`**: The agent detects an **Existing User Project**. The index tags the active screen (`(active screen currently viewed)`) and outlines its section hierarchy. The agent is explicitly prohibited from calling `addScreen` or proposing new multi-screen blueprints; all redesign and edit requests are executed as in-place `edit_canvas` batches on existing node IDs.

---

## 4. Shared Undo & Transactional Batching

### 4.1 The Unified Pipeline (`src/store/useProject.ts`)
Both user actions and agent tool calls route through a single dispatch point:
```typescript
applyBatch: (rawOps: unknown[], opts: { source: 'user' | 'agent'; lesson?: string }) => {
  const before = state.doc;
  const result = applyOps(rawOps, before, opts);
  if (result.errors.length) return result;

  const snap = snapshotOf(before);
  const undoStack = [...state.undoStack, snap].slice(-50);
  set({ doc: result.doc, undoStack, redoStack: [], lastResult: result });
  return result;
}
```
- **Atomicity**: If any op in a batch fails validation, the entire batch is rolled back and no snapshot is recorded.
- **FIFO 50-Step Buffer**: `undoStack` maintains up to 50 complete document snapshots.
- **Bi-Directional Traversability**: Hitting `⌘Z` pops the top snapshot and restores document state, regardless of whether that state was produced by human mouse interaction or AI token generation.

---

## 5. Security Architecture, Key Resolution & Budgeting

### 5.1 Key Hierarchy (`server/museProxy.ts`)
Key resolution is strictly isolated to the serverless proxy:
1. **User Key (`x-muse-key`)**: Passed from browser `sessionStorage`. If provided, it takes precedence and charges the user's personal quota directly.
2. **House Key (`MUSE_API_KEY`)**: Read exclusively from server environment variables. Never passed to client-side scripts.
3. **No Key**: Returns a typed `503 / HOUSE_KEY_EXHAUSTED` payload triggering the client Key Card.

### 5.2 Server-Side Spend Circuit Breaker (`server/museBudget.ts`)
To prevent abuse or denial-of-wallet on public deployments:
- Evaluates `MUSE_DAILY_CAP` per UTC day.
- Tallies exact token costs using the model rate matrix:
  - `muse-spark-1.3`: \$1.25 in / \$4.25 out per 1M tokens.
  - `muse-wonder-1.0`: \$4.00 in / \$20.00 out per 1M tokens.
- Emits soft warnings at 80% utilization and raises a hard block at 100%, rejecting requests before calling upstream APIs.

---

## 6. Export Engine & Code Generation

### 6.1 Export Pathways (`src/export/`)
- **Single HTML (`singleFile.ts`)**: Produces a standalone document bundling the complete CSS token sheet, inline SVG icons, and a lightweight client runtime handling interactive tabs, accordions, and form events.
- **Static Site ZIP (`zip.ts`)**: Generates structured web assets (`index.html`, `style.css`, media files) packaged directly in memory via `JSZip`.
- **React Application ZIP (`reactCodegen.ts`)**: Produces a fully configured Vite project:
  - `package.json` with React 18, Lucide React, and TypeScript dependencies.
  - Componentized screens and modular UI blocks.
  - Full TypeScript interfaces for props and datasets.

