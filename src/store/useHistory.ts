import { useProject } from './useProject';

/** Undo/redo is one history for the agent AND the human (§3.4). */
export function useHistory() {
  const canUndo = useProject((s) => s.undoStack.length > 0);
  const canRedo = useProject((s) => s.redoStack.length > 0);
  const depth = useProject((s) => s.undoStack.length);
  const opLog = useProject((s) => s.doc.opLog);
  const undo = useProject((s) => s.undo);
  const redo = useProject((s) => s.redo);
  return {
    canUndo,
    canRedo,
    depth,
    opLog,
    undo,
    redo,
    lastEntry: opLog.length ? opLog[opLog.length - 1] : null,
  };
}
