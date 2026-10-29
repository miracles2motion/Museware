import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Pencil,
  Play,
  RotateCcw,
  Square,
  Wand2,
  X,
} from 'lucide-react';
import type { RailEntry } from '../types/tree';
import { useProject, selectActiveScreen } from '../store/useProject';
import { useUi } from '../store/useUi';
import { useAgent } from '../store/useAgent';
import {
  answerBlueprint,
  answerBuildChoice,
  answerChoice,
  applyColorCard,
  retryTurn,
  type ChoiceOption,
} from '../muse/cards';
import { parseBlueprint } from '../muse/blueprintParse';
import { CanvasStyle } from '../canvas/NodeView';
import { NodeBody } from '../canvas/NodeBody';
import { runAgentTurn, stopAgent } from '../muse/loop';
import { QUICK_SWATCHES } from '../design/palettes';
import { KeyCard } from './KeyCard';

function ScreenThumbs({ blueprint }: { blueprint: string }) {
  const doc = useProject((s) => s.doc);
  const parsed = useMemo(
    () => parseBlueprint(blueprint, doc.tokens),
    [blueprint, doc.tokens],
  );
  const kind = useProject((s) => s.doc.kind);
  const previewDoc = useMemo(
    () => ({ ...doc, screens: parsed.screens }),
    [doc, parsed.screens],
  );
  if (!parsed.screens.length) return null;
  const frameWidth = kind === 'web' ? 1280 : 390;
  const frameHeight = kind === 'web' ? 800 : 844;
  return (
    <div className="thumb-strip">
      <CanvasStyle doc={previewDoc} />
      {parsed.screens.slice(0, 4).map((screen) => (
        <div className="thumb-card" key={screen.id}>
          <div
            className="thumb-scale"
            style={{
              width: frameWidth,
              height: frameHeight,
              transform: 'scale(0.115)',
              transformOrigin: 'top left',
              pointerEvents: 'none',
            }}
            aria-hidden="true"
          >
            <NodeBody
              node={screen.root}
              doc={previewDoc}
              mode="edit"
              screenId={screen.id}
            />
          </div>
          <span className="thumb-label">{screen.name}</span>
        </div>
      ))}
    </div>
  );
}

function BlueprintCard({ entry }: { entry: RailEntry }) {
  const card = entry.card!;
  const data = card.data as {
    blueprint?: string;
    title?: string;
    look?: {
      pad?: number;
      gap?: number;
      cardRadius?: number;
      title?: number;
      body?: number;
    };
    stateKeys?: string[];
    wiring?: string[];
    adjustCount?: number;
  };
  const [adjusting, setAdjusting] = useState(false);
  const [wish, setWish] = useState('');
  const text = data.blueprint || '';
  return (
    <div className="railcard">
      <div className="railcard-head">
        <span className="spread">
          <Wand2 size={14} /> <strong>{data.title || 'Blueprint'}</strong>
        </span>
        <span className="railcard-sub">{text.split(/\s+/).length} words</span>
      </div>
      <ScreenThumbs blueprint={text} />
      <div className="blueprint-text">{text}</div>
      {(data.stateKeys?.length || data.wiring?.length) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(data.stateKeys || []).slice(0, 6).map((key) => (
            <span className="chip chip-static mono" key={key} style={{ fontSize: 10 }}>
              {key}
            </span>
          ))}
          {(data.wiring || []).slice(0, 3).map((line) => (
            <span
              className="chip chip-static"
              key={line}
              style={{ fontSize: 10 }}
              title={line}
            >
              {line.length > 34 ? `${line.slice(0, 34)}…` : line}
            </span>
          ))}
        </div>
      )}
      {adjusting ? (
        <>
          <textarea
            className="textarea"
            rows={2}
            autoFocus
            placeholder="What should change? (e.g. drop the pricing section, warmer palette)"
            value={wish}
            onChange={(e) => setWish(e.target.value)}
          />
          <div className="card-actions">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                if (!wish.trim()) return;
                void answerBlueprint(entry.id, 'adjust', wish);
              }}
            >
              Send adjustment
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setAdjusting(false)}
            >
              Back
            </button>
          </div>
        </>
      ) : (
        <div className="card-actions">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => void answerBlueprint(entry.id, 'build')}
          >
            <Play size={12} /> Build it
          </button>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={(data.adjustCount || 0) >= 3}
            title={
              (data.adjustCount || 0) >= 3 ? 'Three adjustment rounds used' : undefined
            }
            onClick={() => setAdjusting(true)}
          >
            <Pencil size={12} /> Adjust it
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => void answerBlueprint(entry.id, 'cancel')}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function BuildChoiceCard({ entry }: { entry: RailEntry }) {
  const rows: Array<{
    mode: 'blueprint' | 'steady' | 'fast' | 'not_now';
    label: string;
    note: string;
    recommended?: boolean;
  }> = [
    {
      mode: 'blueprint',
      label: 'Blueprint first',
      note: 'Plan screens, ids and look before any code — recommended',
      recommended: true,
    },
    {
      mode: 'steady',
      label: 'Steady screens',
      note: 'One screen at a time, reviewed as it lands',
    },
    {
      mode: 'fast',
      label: 'Fast screens',
      note: 'Fire through the plan, verify at the end',
    },
    { mode: 'not_now', label: 'Not now', note: 'Leave the canvas as it is' },
  ];
  return (
    <div className="railcard">
      <div className="railcard-head">
        <span className="spread">
          <Wand2 size={14} /> <strong>Build it — how?</strong>
        </span>
      </div>
      {rows.map((row) => (
        <button
          type="button"
          className="choice-row"
          key={row.mode}
          onClick={() => void answerBuildChoice(entry.id, row.mode)}
        >
          <span className="choice-label">
            {row.label}
            {row.recommended && (
              <span className="chip chip-static" style={{ fontSize: 9 }}>
                recommended
              </span>
            )}
          </span>
          <span className="choice-note">{row.note}</span>
          <ArrowRight size={12} />
        </button>
      ))}
    </div>
  );
}

function ChoiceCard({ entry }: { entry: RailEntry }) {
  const data = entry.card!.data as { options?: ChoiceOption[]; question?: string };
  const options = data.options || [];
  return (
    <div className="railcard">
      <div className="railcard-head">
        <span className="spread">
          <Wand2 size={14} /> <strong>{data.question || 'Pick one'}</strong>
        </span>
      </div>
      {options.map((option, index) => (
        <button
          type="button"
          className="choice-row"
          key={`${option.label}-${index}`}
          onClick={() => void answerChoice(entry.id, index)}
        >
          <span className="choice-label">{option.label}</span>
          {option.note && <span className="choice-note">{option.note}</span>}
          {option.hexes && (
            <span className="swatches">
              {option.hexes.slice(0, 4).map((hex) => (
                <span className="swatch-dot" key={hex} style={{ background: hex }} />
              ))}
            </span>
          )}
          <ArrowRight size={12} />
        </button>
      ))}
    </div>
  );
}

function ColorCard({ entry }: { entry: RailEntry }) {
  const doc = useProject((s) => s.doc);
  const data = entry.card!.data as {
    nodeId?: string;
    initialHex?: string;
    title?: string;
    styleKey?: string;
    breakpoint?: 'compact' | 'medium' | 'expanded';
  };
  const [hex, setHex] = useState(data.initialHex || doc.tokens.openuiTheme.brand_color);
  const [scope, setScope] = useState<'everywhere' | 'element'>(
    data.nodeId ? 'element' : 'everywhere',
  );
  const setColorCard = useUi((s) => s.setColorCard);
  return (
    <div className="railcard">
      <div className="railcard-head">
        <span className="spread">
          <Wand2 size={14} /> <strong>{data.title || 'Which colour?'}</strong>
        </span>
        <span className="railcard-sub mono">{hex}</span>
      </div>
      <div className="swatches" style={{ gap: 8 }}>
        {QUICK_SWATCHES.map((preset) => (
          <button
            type="button"
            key={preset}
            className="swatch-dot"
            aria-label={preset}
            title={preset}
            style={{
              background: preset,
              outline: hex.toUpperCase() === preset ? '2px solid var(--mw-accent)' : 'none',
              outlineOffset: 2,
            }}
            onClick={() => setHex(preset)}
          />
        ))}
        <input
          type="color"
          value={hex}
          aria-label="Custom colour"
          onChange={(e) => setHex(e.target.value)}
          style={{ width: 32, height: 24, background: 'transparent', border: 'none' }}
        />
      </div>
      <div className="segmented" role="group" aria-label="Colour scope">
        <button
          type="button"
          aria-pressed={scope === 'everywhere'}
          onClick={() => setScope('everywhere')}
        >
          Everywhere
        </button>
        <button
          type="button"
          aria-pressed={scope === 'element'}
          disabled={!data.nodeId}
          onClick={() => setScope('element')}
        >
          {data.nodeId ? `Just ${data.nodeId}` : 'This element'}
        </button>
      </div>
      <div className="card-actions">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() =>
            void applyColorCard(
              hex,
              scope,
              data.nodeId,
              data.styleKey,
              data.breakpoint,
              entry.id,
            )
          }
        >
          <Check size={12} /> Apply
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => {
            setColorCard(null);
            useProject
              .getState()
              .patchRail(entry.id, { card: { ...entry.card!, state: 'cancelled' } });
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ProgressCard({ entry }: { entry: RailEntry }) {
  const busy = useAgent((s) => s.busy);
  const progress = useAgent((s) => s.progress);
  const [open, setOpen] = useState<string | null>(null);
  const data = entry.card!.data as {
    title?: string;
    parts?: Array<{
      id: string;
      label: string;
      state: string;
      note?: string;
      problems?: string;
    }>;
  };
  const parts =
    (entry.card?.state === 'pending' && progress?.parts?.length
      ? progress.parts
      : data.parts) || [];
  const done = parts.filter((p) => p.state === 'done').length;
  return (
    <div className="railcard">
      <div className="railcard-head">
        <span className="spread">
          <Wand2 size={14} /> <strong>{data.title || 'Building screens'}</strong>
        </span>
        <span className="railcard-sub">
          {done} of {parts.length}
        </span>
      </div>
      {parts.map((part) => (
        <div key={part.id}>
          <button
            type="button"
            className="part-row"
            data-state={part.state}
            onClick={() => setOpen(open === part.id ? null : part.id)}
          >
            <span className="part-icon" data-state={part.state}>
              {part.state === 'done' ? (
                <Check size={11} />
              ) : part.state === 'failed' ? (
                <X size={11} />
              ) : part.state === 'active' ? (
                <span className="spin" />
              ) : (
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 9,
                    background: 'currentColor',
                  }}
                />
              )}
            </span>
            <span className="grow">{part.label}</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--mw-ink-3)' }}>
              {part.state}
            </span>
          </button>
          {open === part.id && (
            <div className="problems-note">
              {part.problems ? (
                <p style={{ color: 'var(--mw-danger)' }}>{part.problems}</p>
              ) : (
                <p>
                  {part.note ||
                    `${part.label} landed — its ops are in the log with an undo step.`}
                </p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {part.state === 'done' && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={busy}
                    onClick={() => {
                      const problem = useProject
                        .getState()
                        .undoScreenBuild(entry.id, part.id);
                      useUi
                        .getState()
                        .toast(
                          problem || `Undid the build of ${part.label}.`,
                          problem ? 'warn' : 'ok',
                        );
                      if (!problem) {
                        const ui = useUi.getState();
                        if (
                          ui.activeScreenId === part.id &&
                          !useProject
                            .getState()
                            .doc.screens.some((screen) => screen.id === part.id)
                        ) {
                          const first = useProject.getState().doc.screens[0];
                          if (first) ui.setActiveScreen(first.id);
                          else useUi.setState({ activeScreenId: null, selectedId: null });
                        }
                        setOpen(null);
                      }
                    }}
                  >
                    Undo this screen
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    if (
                      useProject
                        .getState()
                        .doc.screens.some((screen) => screen.id === part.id)
                    )
                      useUi.getState().setActiveScreen(part.id);
                    void runAgentTurn(
                      `Rebuild the ${part.label} screen (id: ${part.id}) from the blueprint.`,
                    );
                  }}
                >
                  <RotateCcw size={11} /> Rebuild
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setOpen(null)}
                >
                  Keep it
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      {busy && (
        <div className="card-actions">
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => stopAgent()}
          >
            <Square size={11} /> Stop
          </button>
        </div>
      )}
    </div>
  );
}

function ErrorCard({ entry }: { entry: RailEntry }) {
  const data = entry.card!.data as { message?: string; code?: string; retryText?: string };
  return (
    <div className="railcard">
      <div className="railcard-head">
        <span className="spread">
          <AlertTriangle size={14} /> <strong>That did not finish</strong>
        </span>
        {data.code && <span className="railcard-sub mono">{data.code}</span>}
      </div>
      <p className="prose-agent" style={{ fontSize: 13 }}>
        {data.message || 'The request failed.'}
      </p>
      {data.retryText && (
        <div className="card-actions">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => void retryTurn(entry.id, data.retryText || '')}
          >
            <RotateCcw size={12} /> Retry
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => useUi.getState().setModal('settingsOpen', true)}
          >
            Check the key
          </button>
        </div>
      )}
    </div>
  );
}

/** Cards leave on answer (law 11): non-pending cards render nothing. */
export function RailCard({ entry }: { entry: RailEntry }) {
  const card = entry.card;
  if (!card || (card.state !== 'pending' && card.kind !== 'progress')) return null;
  switch (card.kind) {
    case 'build_choice':
      return <BuildChoiceCard entry={entry} />;
    case 'blueprint':
      return <BlueprintCard entry={entry} />;
    case 'choice':
      return <ChoiceCard entry={entry} />;
    case 'color':
      return <ColorCard entry={entry} />;
    case 'progress':
      return <ProgressCard entry={entry} />;
    case 'error':
      return <ErrorCard entry={entry} />;
    case 'key':
      return <KeyCard entry={entry} />;
    default:
      return null;
  }
}

export { selectActiveScreen };
