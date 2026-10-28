import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, GripVertical, Layers as LayersIcon, Trash2 } from 'lucide-react';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import type { ComponentNode } from '../types/tree';
import { findNode, findParent, isDescendant } from '../ops/treeUtils';
import { spec } from '../types/library';
import { duplicateNodeBatch } from '../ops/screenOps';
import { Icon } from '../canvas/Icon';

interface Row {
  node: ComponentNode;
  depth: number;
  hasOverride: boolean;
  hidden: boolean;
}

export function Layers() {
  const doc = useProject((s) => s.doc);
  const applyBatch = useProject((s) => s.applyBatch);
  const selectedId = useUi((s) => s.selectedId);
  const select = useUi((s) => s.select);
  const screenId = useUi((s) => s.activeScreenId);
  const toast = useUi((s) => s.toast);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const screen = doc.screens.find((s) => s.id === screenId) || doc.screens[0];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const rows = useMemo<Row[]>(() => {
    if (!screen) return [];
    const out: Row[] = [];
    const walk = (node: ComponentNode, depth: number) => {
      out.push({
        node,
        depth,
        hasOverride: Boolean(
          node.styles.responsive?.medium || node.styles.responsive?.expanded,
        ),
        hidden: Boolean(node.visibleWhen),
      });
      node.children.forEach((child) => walk(child, depth + 1));
    };
    walk(screen.root, 0);
    return out;
  }, [screen]);

  if (!screen) {
    return (
      <div className="panel-body">
        <p className="field-hint">
          No screens yet. Add one from the topbar, or ask muse for a blueprint.
        </p>
      </div>
    );
  }

  const onDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;
    if (screen.root.id === activeId) return;
    if (isDescendant(screen.root, activeId, overId)) {
      toast('A node cannot go inside itself.', 'warn');
      return;
    }
    const overNode = findNode(screen.root, overId);
    if (!overNode) return;
    let parentId: string;
    let index: number;
    if (overNode.id === screen.root.id) {
      parentId = overNode.id;
      index = overNode.children.length;
    } else {
      const parent = findParent(screen.root, overNode.id);
      if (!parent) return;
      parentId = parent.parent.id;
      index = parent.index;
    }
    const res = applyBatch([{ op: 'move', id: activeId, parentId, index }], {
      source: 'user',
    });
    if (res.errors.length) toast(res.errors[0].message, 'warn');
  };

  const commitRename = (node: ComponentNode) => {
    const name = renameValue.trim();
    setRenaming(null);
    if (!name || name === (node.name || '')) return;
    const res = applyBatch([{ op: 'rename', id: node.id, name }], { source: 'user' });
    if (res.errors.length) toast(res.errors[0].message, 'warn');
  };

  return (
    <div className="panel-body">
      <div className="palette-group-head">
        <span className="eyebrow">Layers · {screen.name}</span>
        <span className="faint mono" style={{ fontSize: 9 }}>
          {rows.length}
        </span>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={rows.map((r) => r.node.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="layers-list">
            {rows.map((row) => (
              <LayerRow
                key={row.node.id}
                row={row}
                selected={selectedId === row.node.id}
                renaming={renaming === row.node.id}
                renameValue={renameValue}
                onRenameChange={setRenameValue}
                onRenameCommit={() => commitRename(row.node)}
                onRenameCancel={() => setRenaming(null)}
                onSelect={() => {
                  select(row.node.id);
                  // The drawer did its job; get out of the canvas's way.
                  useUi.getState().setLeftFlyout(false);
                }}
                onStartRename={() => {
                  setRenaming(row.node.id);
                  setRenameValue(
                    row.node.name || spec(row.node.type)?.label || row.node.type,
                  );
                }}
                onDuplicate={() => {
                  const result = duplicateNodeBatch(doc, row.node.id);
                  if ('error' in result) {
                    toast(result.error, 'warn');
                    return;
                  }
                  const res = applyBatch(result.ops, { source: 'user' });
                  if (res.errors.length) toast(res.errors[0].message, 'warn');
                  else toast('Duplicated', 'ok');
                }}
                onDelete={() => {
                  if (row.node.id === screen.root.id) return;
                  const res = applyBatch([{ op: 'remove', id: row.node.id }], {
                    source: 'user',
                  });
                  if (res.errors.length) toast(res.errors[0].message, 'warn');
                  else {
                    select(null);
                    toast('Removed — ⌘Z undoes it');
                  }
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <p className="field-hint" style={{ marginTop: 10 }}>
        <LayersIcon size={11} style={{ verticalAlign: -1 }} /> Drag to reorder. Drop on a
        container row to nest. Layers and canvas share one tree.
      </p>
    </div>
  );
}

function LayerRow({
  row,
  selected,
  renaming,
  renameValue,
  onSelect,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onStartRename,
  onDuplicate,
  onDelete,
}: {
  row: Row;
  selected: boolean;
  renaming: boolean;
  renameValue: string;
  onSelect: () => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onStartRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: row.node.id,
    });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    paddingLeft: 6 + row.depth * 12,
  };
  const label = row.node.name || spec(row.node.type)?.label || row.node.type;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="layer-row"
      data-selected={selected}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartRename();
      }}
    >
      <button
        type="button"
        className="icon-btn icon-btn-sm"
        style={{ width: 16, height: 16, cursor: 'grab', color: 'var(--mw-ink-3)' }}
        aria-label="Drag layer"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={11} />
      </button>
      <Icon name={spec(row.node.type)?.icon || 'grid'} size={12} />
      {renaming ? (
        <input
          className="input"
          style={{ height: 22, fontSize: 11, padding: '0 6px', flex: 1 }}
          value={renameValue}
          autoFocus
          onChange={(e) => onRenameChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={onRenameCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit();
            if (e.key === 'Escape') onRenameCancel();
          }}
        />
      ) : (
        <span className="layer-name">{label}</span>
      )}
      {row.hasOverride && (
        <span className="override-dot" title="Has breakpoint overrides" />
      )}
      {row.hidden && (
        <span
          className="mono"
          style={{ fontSize: 9, color: 'var(--mw-warn)' }}
          title="Has a visibility rule"
        >
          if
        </span>
      )}
      <span className="layer-type">{row.node.id}</span>
      <span className="layer-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="icon-btn icon-btn-sm"
          aria-label="Duplicate"
          onClick={onDuplicate}
        >
          <Copy size={11} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn-sm"
          aria-label="Delete"
          onClick={onDelete}
        >
          <Trash2 size={11} />
        </button>
      </span>
    </div>
  );
}
