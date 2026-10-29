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
import { spec } from '../types/library';
import { duplicateNodeBatch } from '../ops/screenOps';
import { layerMoveTarget } from './move';
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
    if (!overId) return;
    /*
     * Indent is the nesting gesture: the dragged row's left edge measured
     * against the row it is over. Dragging right nests, dragging level
     * reorders — the way every tree list behaves, and the only reading that
     * makes "drop on a container to nest" true.
     */
    const draggedRect = event.active.rect.current.translated;
    const overRect = event.over?.rect;
    const indent = draggedRect && overRect ? draggedRect.left - overRect.left : 0;
    const decision = layerMoveTarget(screen, activeId, overId, indent);
    if (decision.error) {
      toast(decision.error, 'warn');
      return;
    }
    if (!decision.target) return;
    const res = applyBatch(
      [
        {
          op: 'move',
          id: activeId,
          parentId: decision.target.parentId,
          index: decision.target.index,
        },
      ],
      { source: 'user' },
    );
    if (res.errors.length) toast(res.errors[0].message, 'warn');
    else toast('Moved — ⌘Z undoes it', 'ok');
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
        <LayersIcon size={11} style={{ verticalAlign: -1 }} /> Drag a row to reorder it;
        drag it right, over a container, to nest it inside. Layers and canvas share one
        tree.
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
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
      data-over={isOver || undefined}
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
