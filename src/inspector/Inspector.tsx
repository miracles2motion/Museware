import { useEffect, useRef, useState } from 'react';
import {
  Copy,
  Layers as LayersIcon,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Paintbrush,
  PanelRightClose,
  Save,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { runScopedAction } from '../muse/loop';
import { useUi, type Breakpoint } from '../store/useUi';
import type { Action, ComponentNode, StyleSet } from '../types/tree';
import { ICON_NAMES, eventsFor, isContainerType, spec } from '../types/library';
import { StyleTab } from './StyleTab';
import { boundKeys, findNode, findParent } from '../ops/treeUtils';
import { parseStateValue } from './stateValue';
import { duplicateNodeBatch } from '../ops/screenOps';
import { PRESETS } from '../design/presets';
import { Icon } from '../canvas/Icon';
import { Segmented } from '../components/ui';
import { ActionEditor } from './ActionEditor';
import { illustrate } from '../muse/cards';
import { ClearOverride, NumberField, SelectField, TextField, ToggleField } from './Fields';

type Tab = 'props' | 'style' | 'events';

/** What each trigger means, in the words the blocks themselves use. */
const EVENT_COPY: Array<{
  name: 'tap' | 'change' | 'submit';
  label: string;
  hint: string;
}> = [
  {
    name: 'tap',
    label: 'When tapped',
    hint: 'Runs in Run mode. Common: go to a screen, then set a value — compose them in any order.',
  },
  {
    name: 'change',
    label: 'When changed',
    hint: 'Fires as the value changes, and stores it under the field’s state key.',
  },
  {
    name: 'submit',
    label: 'When submitted',
    hint: 'Fires when the form’s submit button is tapped in Run mode.',
  },
];

const BP_LABEL: Record<Breakpoint, string> = {
  compact: 'compact (base)',
  medium: 'medium ≥600',
  expanded: 'expanded ≥1024',
};

/**
 * The panel owns two buttons: minimize (get out of the way of the artboard,
 * leave an edge tab behind) and maximize (widen the panel when an event
 * editor needs the room). Both live in every inspector head.
 */
function PanelControls() {
  const wide = useUi((s) => s.inspectorWide);
  const setWide = useUi((s) => s.setInspectorWide);
  const minimize = useUi((s) => s.minimizeInspector);
  return (
    <>
      <button
        type="button"
        className="icon-btn icon-btn-sm inspector-max"
        aria-label={wide ? 'Restore the panel width' : 'Widen the panel'}
        aria-pressed={wide}
        title={wide ? 'Restore the panel width' : 'Widen the panel'}
        onClick={() => setWide(!wide)}
      >
        {wide ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
      </button>
      <button
        type="button"
        className="icon-btn icon-btn-sm inspector-min"
        aria-label="Minimize the panel"
        title="Minimize the panel (⌘/Ctrl + I)"
        onClick={minimize}
      >
        <PanelRightClose size={13} />
      </button>
    </>
  );
}

export function Inspector() {
  const doc = useProject((s) => s.doc);
  const documentEpoch = useProject((s) => s.documentEpoch);
  const applyBatch = useProject((s) => s.applyBatch);
  const selectedId = useUi((s) => s.selectedId);
  const select = useUi((s) => s.select);
  const breakpoint = useUi((s) => s.breakpoint);
  const toast = useUi((s) => s.toast);
  const propertiesOpen = useUi((s) => s.propertiesOpen);
  const [tab, setTab] = useState<Tab>('props');
  const [saving, setSaving] = useState(false);
  const [compName, setCompName] = useState('');
  const [compNote, setCompNote] = useState('');
  const [scopeInstruction, setScopeInstruction] = useState('');
  const agentBusy = useAgent((s) => s.busy);
  const imageUsage = useAgent((s) => s.buildImageUsage);
  const imageCap = useAgent((s) => s.buildImages);
  const currentImageUsage =
    imageUsage?.documentEpoch === documentEpoch
      ? imageUsage
      : doc.automatedImageBudget
        ? {
            used: doc.automatedImageBudget.used,
            cap: doc.automatedImageBudget.cap ?? imageCap,
            documentEpoch,
          }
        : null;
  const houseKey = useAgent((s) => s.houseKey);
  const keySource = useAgent((s) => s.keySource);
  const dollarBudget = useAgent((s) => s.budget);
  const [pendingImages, setPendingImages] = useState<Record<string, boolean>>({});
  const pendingImageRef = useRef(new Set<string>());
  const generate = async (id: string, regenerate: boolean) => {
    const key = `${documentEpoch}:${id}`;
    if (pendingImageRef.current.has(key)) return;
    pendingImageRef.current.add(key);
    setPendingImages((previous) => ({ ...previous, [key]: true }));
    try {
      await illustrate(
        id,
        regenerate ? 'A fresh photographic variation of the same subject' : undefined,
      );
    } finally {
      pendingImageRef.current.delete(key);
      setPendingImages((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
    }
  };
  useEffect(() => setScopeInstruction(''), [selectedId]);

  const activeScreenId = useUi((s) => s.activeScreenId);
  const screen = doc.screens.find((s) => s.id === activeScreenId) || doc.screens[0];
  const node = screen && selectedId ? findNode(screen.root, selectedId) : null;

  const run = (ops: unknown[], ok?: string) => {
    const res = applyBatch(ops, { source: 'user' });
    if (res.errors.length) {
      toast(res.errors[0].message, 'warn');
      return false;
    }
    if (ok) toast(ok);
    return true;
  };

  if (!screen) {
    return (
      <aside className="inspector" data-open={propertiesOpen}>
        <div className="inspector-head">
          <div className="node-title">
            <Icon name="grid" size={14} />
            <div>
              <strong>Inspector</strong>
              <span className="mono">nothing selected</span>
            </div>
          </div>
          <PanelControls />
        </div>
        <div className="inspector-body">
          <p className="field-hint">
            Nothing to inspect yet. Create a screen, then pick a node.
          </p>
        </div>
      </aside>
    );
  }

  if (!node) {
    return <ScreenInspector screenId={screen.id} open={propertiesOpen} />;
  }

  const info = spec(node.type);
  const parent = findParent(screen.root, node.id);
  const overrides = node.styles.responsive?.[breakpoint as 'medium' | 'expanded'] || {};
  const atBreakpoint = breakpoint !== 'compact';
  const isOverridden = (key: string) =>
    atBreakpoint && Object.prototype.hasOwnProperty.call(overrides, key);
  const valueOf = (key: string): string => {
    if (atBreakpoint) {
      const own = overrides[key];
      if (own !== undefined) return String(own);
      const medium =
        breakpoint === 'expanded' ? node.styles.responsive?.medium?.[key] : undefined;
      if (medium !== undefined) return String(medium);
    }
    const base = node.styles[key];
    return base === undefined ? '' : String(base);
  };

  const writeStyle = (key: string, value: string | number | boolean) => {
    const styles: StyleSet =
      breakpoint === 'compact'
        ? { [key]: value }
        : { responsive: { [breakpoint as 'medium' | 'expanded']: { [key]: value } } };
    run([{ op: 'setStyles', id: node.id, styles }]);
  };

  const clearStyle = (key: string) => {
    if (breakpoint === 'compact') {
      run([{ op: 'setStyles', id: node.id, styles: { [key]: '' } }]);
      return;
    }
    writeStyle(key, '');
  };

  const writeProps = (patch: Record<string, unknown>) =>
    run([{ op: 'setProps', id: node.id, props: patch }]);

  const eventValue = (name: 'tap' | 'change' | 'submit'): Action[] =>
    node.events?.[name] || [];

  const writeEvents = (name: 'tap' | 'change' | 'submit', actions: Action[]) =>
    run([{ op: 'setProps', id: node.id, props: { events: { [name]: actions } } }]);

  return (
    <aside className="inspector" data-open={propertiesOpen}>
      <div className="inspector-head">
        <div className="node-title">
          <Icon name={info?.icon || 'grid'} size={14} />
          <div>
            <strong>{info?.label || node.type}</strong>
            <span className="mono">{node.id}</span>
          </div>
        </div>
        <button
          type="button"
          className="icon-btn icon-btn-sm"
          aria-label="Copy id"
          title="Copy id"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(node.id);
              toast(`Copied ${node.id}`, 'ok');
            } catch {
              toast(node.id);
            }
          }}
        >
          <Copy size={12} />
        </button>
        <PanelControls />
        <button
          type="button"
          className="icon-btn icon-btn-sm inspector-close"
          aria-label="Close inspector"
          onClick={() => useUi.getState().setPropertiesOpen(false)}
        >
          <X size={13} />
        </button>
      </div>

      <div className="inspector-tabs">
        <Segmented<Tab>
          label="Inspector sections"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'props', label: 'Props' },
            { value: 'style', label: 'Style' },
            {
              value: 'events',
              label: (eventsFor(node.type).some((name) => eventValue(name).length)
                ? 'Events •'
                : 'Events') as string,
            },
          ]}
        />
      </div>

      <div className="inspector-body">
        {tab === 'props' && (
          <>
            {(node.type === 'hero' || node.type === 'image' || node.type === 'card') && (
              <div className="insp-section">
                <div className="insp-section-head">
                  <span className="eyebrow">Illustration</span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  disabled={Boolean(pendingImages[`${documentEpoch}:${node.id}`])}
                  onClick={() => void generate(node.id, false)}
                >
                  {pendingImages[`${documentEpoch}:${node.id}`] ? (
                    <LoaderCircle size={12} className="image-spinner" />
                  ) : (
                    <Sparkles size={12} />
                  )}{' '}
                  Illustrate with muse-image
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  disabled={Boolean(pendingImages[`${documentEpoch}:${node.id}`])}
                  onClick={() => void generate(node.id, true)}
                >
                  {pendingImages[`${documentEpoch}:${node.id}`] ? (
                    <LoaderCircle size={12} className="image-spinner" />
                  ) : (
                    <Sparkles size={12} />
                  )}{' '}
                  Regenerate image
                </button>
                <p className="field-hint" aria-live="polite">
                  {pendingImages[`${documentEpoch}:${node.id}`] && 'Generating image… '}
                  {currentImageUsage
                    ? `Automated project image attempts: ${currentImageUsage.used} of ${currentImageUsage.cap}; ${Math.max(0, currentImageUsage.cap - currentImageUsage.used)} remaining in this project. `
                    : `Automated project cap: ${imageCap} attempts; usage for this project is unknown. `}
                  {currentImageUsage &&
                    currentImageUsage.used >= currentImageUsage.cap &&
                    'Automated project image budget exhausted. '}
                  Manual requests are separate from that project cap and may incur key
                  charges.
                  {keySource !== 'session' &&
                  (houseKey === 'exhausted' || dollarBudget?.exhausted)
                    ? ' Shared-key budget exhausted.'
                    : keySource !== 'session' && dollarBudget?.capUsd != null
                      ? ` Shared-key budget last reported: $${dollarBudget.spentUsd.toFixed(2)} of $${dollarBudget.capUsd.toFixed(2)} used.`
                      : ' Current key balance is not known here.'}{' '}
                  A successful image is saved in the project and can be undone.
                </p>
              </div>
            )}
            <div className="insp-section">
              <div className="insp-section-head">
                <span className="eyebrow">Layer</span>
                {parent ? (
                  <button
                    type="button"
                    className="chip"
                    style={{ height: 22, fontSize: 10 }}
                    onClick={() => select(parent.parent.id)}
                  >
                    <LayersIcon size={10} /> {parent.parent.id}
                  </button>
                ) : (
                  <span className="faint" style={{ fontSize: 10 }}>
                    root
                  </span>
                )}
              </div>
              <TextField
                label="Name"
                value={node.name || ''}
                placeholder={info?.label || node.type}
                onCommit={(name) => {
                  if (!name.trim()) return;
                  run([{ op: 'rename', id: node.id, name: name.trim() }]);
                }}
              />
              <p className="field-hint">{info?.hint}</p>
            </div>

            {(['Content', 'Behavior', 'Advanced'] as const).map(
              (group) =>
                (info?.props || []).some((def) => def.group === group) && (
                  <div className="insp-section" key={group}>
                    <div className="insp-section-head">
                      <span className="eyebrow">{group}</span>
                    </div>
                    {(info?.props || [])
                      .filter((def) => def.group === group)
                      .map((def) => {
                        const raw = node.props[def.key];
                        /*
                         * A prop the document does not carry behaves as the sheet's
                         * DEFAULT, not as empty — an older project has no `scroll`
                         * prop, and showing the toggle off while the screen scrolls
                         * would be the panel lying about the canvas.
                         */
                        const value =
                          raw === undefined || raw === null
                            ? (def.defaultValue ?? '')
                            : raw;
                        if (def.kind === 'actions') {
                          return (
                            <p className="field-hint" key={def.key}>
                              {def.label} — wired in the Events tab.
                            </p>
                          );
                        }
                        if (def.kind === 'toggle') {
                          return (
                            <ToggleField
                              key={def.key}
                              label={def.label}
                              hint={def.hint}
                              checked={Boolean(value)}
                              onChange={(checked) => writeProps({ [def.key]: checked })}
                            />
                          );
                        }
                        if (def.kind === 'number') {
                          return (
                            <NumberField
                              key={def.key}
                              label={def.label}
                              hint={def.hint}
                              value={Number(value) || 0}
                              min={def.min}
                              max={def.max}
                              onCommit={(n) => writeProps({ [def.key]: n })}
                            />
                          );
                        }
                        if (def.kind === 'select' || def.kind === 'tone') {
                          const options = (
                            def.options || ['neutral', 'accent', 'success', 'danger']
                          ).map((o) => ({
                            value: o,
                            label: o,
                          }));
                          const current = String(value || options[0]?.value || '');
                          if (!options.some((o) => o.value === current)) {
                            options.unshift({
                              value: current,
                              label: `${current} (custom)`,
                            });
                          }
                          return (
                            <SelectField
                              key={def.key}
                              label={def.label}
                              hint={def.hint}
                              value={current}
                              options={options}
                              onChange={(next) => writeProps({ [def.key]: next })}
                            />
                          );
                        }
                        if (def.kind === 'icon') {
                          const options = ICON_NAMES.map((name) => ({
                            value: name,
                            label: name,
                          }));
                          return (
                            <SelectField
                              key={def.key}
                              label={def.label}
                              hint={def.hint}
                              value={String(value || 'star')}
                              options={options}
                              onChange={(next) => writeProps({ [def.key]: next })}
                            />
                          );
                        }
                        if (def.kind === 'screen') {
                          const options = doc.screens.map((s2) => ({
                            value: s2.id,
                            label: `${s2.name} · ${s2.id}`,
                          }));
                          return (
                            <SelectField
                              key={def.key}
                              label={def.label}
                              hint={def.hint}
                              value={String(value || options[0]?.value || '')}
                              options={options}
                              onChange={(next) => writeProps({ [def.key]: next })}
                            />
                          );
                        }
                        if (def.kind === 'bind') {
                          return (
                            <TextField
                              key={def.key}
                              label={def.label}
                              hint={def.hint}
                              mono
                              value={String(value)}
                              placeholder="lower_snake_case"
                              onCommit={(next) =>
                                writeProps({ [def.key]: next.trim() || null })
                              }
                            />
                          );
                        }
                        if (def.kind === 'data') {
                          const keys = Object.keys(screen.mockData || {});
                          return (
                            <div key={def.key}>
                              <TextField
                                label={def.label}
                                hint={def.hint}
                                value={String(value)}
                                onCommit={(next) => writeProps({ [def.key]: next })}
                              />
                              {keys.length > 0 && (
                                <div
                                  style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 4,
                                    marginTop: -4,
                                  }}
                                >
                                  {keys.map((key) => (
                                    <button
                                      type="button"
                                      key={key}
                                      className="chip"
                                      data-selected={String(value) === key}
                                      style={{ height: 22, fontSize: 10 }}
                                      onClick={() => writeProps({ [def.key]: key })}
                                    >
                                      {key}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        }
                        return (
                          <TextField
                            key={def.key}
                            label={def.label}
                            hint={def.hint}
                            multiline={def.kind === 'longtext'}
                            value={String(value)}
                            onCommit={(next) => writeProps({ [def.key]: next })}
                          />
                        );
                      })}
                  </div>
                ),
            )}
            {(info?.props || []).length === 0 && (
              <p className="field-hint">
                {info?.container
                  ? `${info.label} has no content of its own — what it holds and how it spaces it lives in the Style tab.`
                  : 'This block has no content props. Its look lives in the Style tab.'}
              </p>
            )}

            <div className="insp-section">
              <div className="insp-section-head">
                <span className="eyebrow">Visibility rule</span>
              </div>
              <SelectField
                label="Visibility"
                value={
                  !node.visibleWhen
                    ? 'always'
                    : node.visibleWhen.equals === false
                      ? 'hide'
                      : 'show'
                }
                options={[
                  { value: 'always', label: 'Always visible' },
                  { value: 'show', label: 'Show when key is ON / matches' },
                  { value: 'hide', label: 'Hide when key is ON' },
                ]}
                onChange={(mode) => {
                  if (mode === 'always') writeProps({ visibleWhen: null });
                  else
                    writeProps({
                      visibleWhen: {
                        key: node.visibleWhen?.key || boundKeys(doc)[0] || 'on',
                        equals: mode === 'hide' ? false : undefined,
                      },
                    });
                }}
              />
              <datalist id="visibility-state-keys">
                {boundKeys(doc).map((key) => (
                  <option value={key} key={key} />
                ))}
              </datalist>
              <div className="insp-row">
                <TextField
                  list="visibility-state-keys"
                  label="Show when key"
                  mono
                  value={node.visibleWhen?.key || ''}
                  placeholder="empty = always shown"
                  onCommit={(key) => {
                    const next = key.trim();
                    writeProps({
                      visibleWhen: next
                        ? { key: next, equals: node.visibleWhen?.equals }
                        : null,
                    });
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {boundKeys(doc).map((key) => (
                  <button
                    type="button"
                    className="chip"
                    key={key}
                    onClick={() =>
                      writeProps({ visibleWhen: { key, equals: node.visibleWhen?.equals } })
                    }
                  >
                    {key}
                  </button>
                ))}
              </div>
              {node.visibleWhen && (
                <TextField
                  label="Equals"
                  value={
                    node.visibleWhen.equals === undefined
                      ? ''
                      : String(node.visibleWhen.equals)
                  }
                  hint="Blank means “is truthy”."
                  onCommit={(equals) => {
                    writeProps({
                      visibleWhen: {
                        key: node.visibleWhen?.key,
                        equals: equals === '' ? undefined : parseStateValue(equals),
                      },
                    });
                  }}
                />
              )}
            </div>
          </>
        )}

        {tab === 'style' && (
          <>
            <div className="bp-hint">
              Editing <strong>{BP_LABEL[breakpoint]}</strong>
              {atBreakpoint
                ? ' — changes write an override at this width; the base stays intact.'
                : ' — changes are the base all wider widths inherit.'}
            </div>
            {Object.keys(overrides).length > 0 && (
              <div className="insp-section-head" style={{ paddingBottom: 6 }}>
                <span className="faint" style={{ fontSize: 10 }}>
                  {Object.keys(overrides).length} override
                  {Object.keys(overrides).length === 1 ? '' : 's'} at this width
                </span>
                <ClearOverride
                  label="this width’s overrides"
                  onClear={() => {
                    for (const key of Object.keys(overrides)) clearStyle(key);
                  }}
                />
              </div>
            )}
            <StyleTab
              node={node}
              tokens={doc.tokens}
              isRoot={screen.root.id === node.id}
              breakpoint={breakpoint}
              valueOf={valueOf}
              writeStyle={writeStyle}
              clearStyle={clearStyle}
              isOverridden={isOverridden}
            />
          </>
        )}

        {tab === 'events' && (
          <>
            {eventsFor(node.type).length === 0 && (
              <div className="insp-section">
                <p className="field-hint">
                  This block has no events — buttons, inputs, cards and links do. A{' '}
                  {info?.label || node.type} is there to be seen, not tapped.
                </p>
              </div>
            )}
            {EVENT_COPY.filter((ev) => eventsFor(node.type).includes(ev.name)).map((ev) => (
              <div className="insp-section" key={ev.name}>
                <div className="insp-section-head">
                  <span className="eyebrow">
                    {ev.label}{' '}
                    {eventValue(ev.name).length ? `· ${eventValue(ev.name).length}` : ''}
                  </span>
                </div>
                <p className="field-hint">{ev.hint}</p>
                <ActionEditor
                  actions={eventValue(ev.name)}
                  screens={doc.screens}
                  onChange={(next) => writeEvents(ev.name, next)}
                />
              </div>
            ))}
          </>
        )}
      </div>

      <div className="inspector-foot">
        <input
          className="input"
          aria-label="Scoped design instruction"
          placeholder="Optional: describe the change"
          value={scopeInstruction}
          maxLength={1000}
          onChange={(event) => setScopeInstruction(event.target.value)}
        />
        {isContainerType(node.type) && (
          <button
            type="button"
            className="btn btn-sm btn-secondary btn-block"
            disabled={agentBusy}
            onClick={() =>
              void runScopedAction(
                node.id,
                scopeInstruction.trim() ||
                  'Redesign this section to be polished, coherent, and appropriate for its content.',
              )
            }
          >
            <Sparkles size={13} /> Redesign this section
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm btn-secondary btn-block"
          disabled={agentBusy}
          onClick={() =>
            void runScopedAction(
              node.id,
              scopeInstruction.trim() ||
                'Restyle this widget while preserving its content and structure.',
              true,
            )
          }
        >
          <Sparkles size={13} /> Restyle this widget
        </button>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ flex: 1 }}
            onClick={() => setSaving(true)}
          >
            <Save size={12} /> Save as component
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Duplicate node"
            title="Duplicate (one op)"
            onClick={() => {
              const batch = duplicateNodeBatch(doc, node.id);
              if ('error' in batch) {
                toast(batch.error, 'warn');
                return;
              }
              run(batch.ops, 'Duplicated');
            }}
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Delete node"
            title="Delete"
            onClick={() => {
              if (screen.root.id === node.id) return;
              if (run([{ op: 'remove', id: node.id }], 'Removed — ⌘Z undoes it'))
                select(null);
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost btn-block"
          onClick={() => select(null)}
        >
          <Zap size={12} /> Screen settings
        </button>
      </div>

      {saving && (
        <div
          className="scrim"
          onMouseDown={(e) => e.target === e.currentTarget && setSaving(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Save as component"
          >
            <div className="modal-head">
              <h2>Save “{node.id}” as a component</h2>
            </div>
            <div className="modal-body">
              <TextField
                label="Component name"
                mono
                value={compName}
                placeholder="habit_row"
                hint="lower_snake_case, 3–31 chars. Places as a copy."
                onCommit={setCompName}
              />
              <TextField
                label="Description"
                value={compNote}
                placeholder="What this block is for"
                onCommit={setCompNote}
              />
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setSaving(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => {
                  const name = (compName || node.name || '').trim();
                  if (!name) {
                    toast('Give it a name first.', 'warn');
                    return;
                  }
                  const ok = run(
                    [
                      {
                        op: 'saveComponent',
                        name,
                        description: compNote || `${info?.label || node.type} block`,
                        root: JSON.parse(JSON.stringify(node)),
                      },
                    ],
                    `${name} saved — it is in the palette now`,
                  );
                  if (ok) {
                    setSaving(false);
                    setCompName('');
                    setCompNote('');
                  }
                }}
              >
                <Paintbrush size={12} /> Save component
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

/** Nothing selected: the screen itself is the subject. */
function ScreenInspector({ screenId, open }: { screenId: string; open: boolean }) {
  const doc = useProject((s) => s.doc);
  const applyBatch = useProject((s) => s.applyBatch);
  const toast = useUi((s) => s.toast);
  const startPrompt = useUi((s) => s.startPrompt);
  const setActivePreset = useUi((s) => s.setActivePreset);
  const activePreset = useUi((s) => s.activePreset);
  const screen = doc.screens.find((s) => s.id === screenId);

  if (!screen) return null;

  const run = (ops: unknown[], ok?: string) => {
    const res = applyBatch(ops, { source: 'user' });
    if (res.errors.length) {
      toast(res.errors[0].message, 'warn');
      return false;
    }
    if (ok) toast(ok);
    return true;
  };

  const binds = new Set<string>();
  const walk = (n: ComponentNode) => {
    if (n.props.bindKey) binds.add(String(n.props.bindKey));
    if (n.visibleWhen?.key) binds.add(n.visibleWhen.key);
    for (const ev of Object.values(n.events || {})) {
      for (const a of ev || []) {
        if (a.type === 'setState' || a.type === 'toggle' || a.type === 'when')
          binds.add(a.key);
      }
    }
    n.children.forEach(walk);
  };
  walk(screen.root);

  return (
    <aside className="inspector" data-open={open}>
      <div className="inspector-head">
        <div className="node-title">
          <Icon name="grid" size={14} />
          <div>
            <strong>{screen.name}</strong>
            <span className="mono">{screen.id}</span>
          </div>
        </div>
        {screen.entry && <span className="chip chip-static">entry</span>}
        <PanelControls />
        <button
          type="button"
          className="icon-btn icon-btn-sm inspector-close"
          aria-label="Close inspector"
          onClick={() => useUi.getState().setPropertiesOpen(false)}
        >
          <X size={13} />
        </button>
      </div>
      <div className="inspector-body">
        <div className="insp-section">
          <div className="insp-section-head">
            <span className="eyebrow">Screen</span>
          </div>
          <TextField
            label="Name"
            value={screen.name}
            onCommit={(name) =>
              name.trim() && run([{ op: 'renameScreen', id: screen.id, name: name.trim() }])
            }
          />
          <SelectField
            label="Layout"
            value={String(screen.root.props.layout || 'flex-col')}
            options={[
              { value: 'flex-col', label: 'Vertical' },
              { value: 'flex-row', label: 'Horizontal' },
            ]}
            onChange={(layout) =>
              run([{ op: 'setProps', id: screen.root.id, props: { layout } }])
            }
          />
          <ToggleField
            label="Scrolls"
            hint="When enabled, the screen scrolls inside the frame."
            checked={screen.root.props.scroll !== false}
            onChange={(scroll) =>
              run([{ op: 'setProps', id: screen.root.id, props: { scroll } }])
            }
          />
          <TextField
            label="Inner space (padding)"
            value={String(screen.root.styles.padding ?? '')}
            onCommit={(padding) =>
              run([{ op: 'setStyles', id: screen.root.id, styles: { padding } }])
            }
          />
          <TextField
            label="Space between children (gap)"
            value={String(screen.root.styles.gap ?? '')}
            onCommit={(gap) =>
              run([{ op: 'setStyles', id: screen.root.id, styles: { gap } }])
            }
          />
          <button
            type="button"
            className="chip"
            onClick={() => useUi.getState().select(screen.root.id)}
          >
            Inspect screen styles
          </button>
          <ToggleField
            label="This is the entry screen"
            checked={Boolean(screen.entry)}
            onChange={(on) => {
              if (!on) {
                toast('The app always needs one entry screen.', 'warn');
                return;
              }
              run([{ op: 'setEntry', id: screen.id }], 'Entry screen updated');
            }}
          />
          <p className="field-hint">
            Run mode, the export router and a fresh reload all open this screen first.
          </p>
        </div>

        <div className="insp-section">
          <div className="insp-section-head">
            <span className="eyebrow">Bindings on this screen</span>
            <span className="faint" style={{ fontSize: 10 }}>
              {binds.size}
            </span>
          </div>
          {binds.size === 0 ? (
            <p className="field-hint">
              No state yet. Add a <span className="mono">bindKey</span> to an input to make
              the screen stateful.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {[...binds].map((key) => (
                <span className="chip chip-static mono" key={key} style={{ fontSize: 10 }}>
                  {key}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="insp-section">
          <div className="insp-section-head">
            <span className="eyebrow">Design system</span>
            <span className="faint" style={{ fontSize: 10 }}>
              {doc.tokens.title}
            </span>
          </div>
          <div className="swatch-grid">
            {PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.id}
                className="preset-card-mini"
                data-selected={activePreset === preset.id}
                title={preset.blurb}
                onClick={() => {
                  const ok = run(
                    [
                      {
                        op: 'setTokens',
                        patch: { ...preset.tokens.openuiTheme, title: preset.tokens.title },
                      },
                    ],
                    `${preset.name} applied — every screen follows`,
                  );
                  if (ok) setActivePreset(preset.id);
                }}
              >
                <span className="preset-swatches">
                  <i style={{ background: preset.tokens.openuiTheme.brand_color }} />
                  <i style={{ background: preset.tokens.openuiTheme.secondary_color }} />
                  <i
                    style={{ background: preset.tokens.openuiTheme.light_colors.openui_bg }}
                  />
                </span>
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
          <div className="token-row">
            <span className="field-label" style={{ flex: 1 }}>
              Accent
            </span>
            <input
              type="color"
              aria-label="Brand accent"
              value={doc.tokens.openuiTheme.brand_color}
              onChange={(e) =>
                run([{ op: 'setTokens', patch: { brand_color: e.target.value } }])
              }
              style={{
                width: 36,
                height: 'var(--mw-input-h)',
                border: '1px solid var(--mw-border)',
                borderRadius: 8,
                background: 'var(--mw-surface)',
                padding: 2,
              }}
            />
          </div>
          <p className="field-hint">
            Brand colours rewrite accent, pressed, text-on-brand and border-accent in both
            modes.
          </p>
        </div>

        <div className="insp-section">
          <div className="insp-section-head">
            <span className="eyebrow">Ask</span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary btn-block"
            onClick={() =>
              startPrompt(
                `Restyle the ${screen.name} screen — same content, better hierarchy.`,
              )
            }
          >
            <Sparkles size={13} /> Restyle this screen
          </button>
        </div>
      </div>
    </aside>
  );
}
