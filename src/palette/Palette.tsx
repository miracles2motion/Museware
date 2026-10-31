import { useMemo, useRef, useState } from 'react';
import { Component, Search, Sparkles } from 'lucide-react';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { COMPONENT_SPECS, PALETTE_GROUPS, isContainerType, spec } from '../types/library';
import type { ComponentType } from '../types/tree';
import { useDrag } from '../canvas/drag';
import { insertNodeBatch } from '../ops/screenOps';
import { Icon } from '../canvas/Icon';

export function Palette() {
  const doc = useProject((s) => s.doc);
  const applyBatch = useProject((s) => s.applyBatch);
  const selectedId = useUi((s) => s.selectedId);
  const activeScreenId = useUi((s) => s.activeScreenId);
  const select = useUi((s) => s.select);
  const toast = useUi((s) => s.toast);
  const startPrompt = useUi((s) => s.startPrompt);
  const setModal = useUi((s) => s.setModal);
  const [query, setQuery] = useState('');
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  const screen =
    doc.screens.find((s) => s.id === activeScreenId) ||
    doc.screens.find((s) => s.entry) ||
    doc.screens[0];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMPONENT_SPECS;
    return COMPONENT_SPECS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.type.includes(q) ||
        item.group.toLowerCase().includes(q) ||
        item.hint.toLowerCase().includes(q),
    );
  }, [query]);

  const insert = (type: ComponentType) => {
    if (!screen) {
      startPrompt(`Design me a screen with a ${spec(type)?.label.toLowerCase() || type}.`);
      toast('No screen yet — ask muse and it starts with a blueprint.', 'warn');
      return;
    }
    const batch = insertNodeBatch(doc, type, selectedId);
    if ('error' in batch) {
      toast(batch.error, 'warn');
      return;
    }
    const res = applyBatch(batch.ops, { source: 'user' });
    if (res.errors.length) {
      toast(res.errors[0].message, 'warn');
      return;
    }
    const added = batch.ops[0] as { node?: { id: string } };
    if (added.node) select(added.node.id);
    // On a phone the panel is a drawer: dropping the block should reveal it,
    // not leave the visitor staring at the drawer that "did nothing".
    useUi.getState().setLeftFlyout(false);
    toast(`${spec(type)?.label || type} added to ${batch.parentId}`, 'ok');
  };

  const beginDrag = (type: ComponentType, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragged.current = false;
    useDrag.getState().begin({
      kind: 'insert',
      type,
      label: spec(type)?.label || type,
      x: e.clientX,
      y: e.clientY,
    });
  };

  return (
    <div className="panel-body">
      <div className="input palette-search mw-shell-util-6">
        <Search size={13} className="mw-shell-util-7" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the 30 blocks"
          aria-label="Search components"
          className="mw-shell-util-8"
        />
        {query && (
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            aria-label="Clear search"
            onClick={() => setQuery('')}
          >
            ×
          </button>
        )}
      </div>

      {doc.customComponents.length > 0 && (
        <div className="palette-group">
          <div className="palette-group-head">
            <span className="eyebrow">My components</span>
            <span className="faint mono mw-shell-util-3">
              {doc.customComponents.length}
            </span>
          </div>
          <div className="palette-grid">
            {doc.customComponents.map((comp) => (
              <button
                type="button"
                key={comp.name}
                className="palette-item"
                title={`${comp.description} — placed as a copy`}
                onClick={() => {
                  if (!screen) {
                    toast('Create a screen first.', 'warn');
                    return;
                  }
                  const res = applyBatch(
                    [
                      {
                        op: 'placeComponent',
                        name: comp.name,
                        parentId: selectedId || screen.root.id,
                      },
                    ],
                    { source: 'user' },
                  );
                  if (res.errors.length) toast(res.errors[0].message, 'warn');
                  else toast(`${comp.name} placed`, 'ok');
                }}
              >
                <Component size={13} />
                <span>{comp.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {PALETTE_GROUPS.map((group) => {
        const items = filtered.filter((item) => item.group === group);
        if (!items.length) return null;
        return (
          <div className="palette-group" key={group}>
            <div className="palette-group-head">
              <span className="eyebrow">{group}</span>
              <span className="faint mono mw-shell-util-3">{items.length}</span>
            </div>
            <div className="palette-grid">
              {items.map((item) => (
                <button
                  type="button"
                  key={item.type}
                  className="palette-item"
                  data-tip={`${item.hint}${isContainerType(item.type) ? ' Accepts drops.' : ''}`}
                  onPointerDown={(e) => beginDrag(item.type, e)}
                  onPointerUp={(e) => {
                    const start = dragStart.current;
                    dragStart.current = null;
                    // A click is a click; a drag that moves ends with a drop op.
                    dragged.current = Boolean(
                      start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6,
                    );
                  }}
                  onClick={() => {
                    if (dragged.current) {
                      dragged.current = false;
                      return;
                    }
                    insert(item.type);
                  }}
                >
                  <Icon name={item.icon} size={13} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <p className="field-hint">
          No block matches “{query}”. Ask muse for it in words — it builds with the same 30
          components.
        </p>
      )}

      <p className="field-hint mw-shell-util-9">
        Drag into the canvas, or click to add inside the selection. Containers accept drops.
      </p>
      <button
        type="button"
        className="btn btn-sm btn-ghost left-ask mw-shell-util-10"
        onClick={() => {
          if (!doc.screens.length) {
            startPrompt('Design me a small app — pick the screens that make sense.');
            return;
          }
          startPrompt(
            selectedId
              ? `Add a new block near ${selectedId} that earns its place.`
              : 'Add one more section to this screen with real content.',
          );
          toast('Ask queued in the rail', 'ok');
        }}
      >
        <Sparkles size={12} /> Ask muse for a block
      </button>
      <button
        type="button"
        className="btn btn-sm btn-ghost left-ask mw-shell-util-9"
        onClick={() => setModal('settingsOpen', true)}
      >
        Import a design preset
      </button>
    </div>
  );
}
