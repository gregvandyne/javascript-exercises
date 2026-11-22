// Figures: undo and redo for a figure's edits (the editor, public/js/figures-editor.js, wherever it is opened: /figures,
// or from a worksheet, test or lesson set's question). A bounded history of snapshots (text, so a snapshot can never be
// changed after it is taken): typing is gathered into one step (commit() waits a moment; commit(true) records at
// once), a new change after an undo drops what could be redone, and the oldest step goes once there are more than
// `limit`. Pure: the page says how to take a snapshot and how to put one back.
//   const h = createHistory({ snap, restore, limit, wait, onChange })
//   h.commit(now?)  h.undo()  h.redo()  h.canUndo()  h.canRedo()  h.reset()  h.sizes()
/** Ctrl/Cmd+Z is undo; Shift+Ctrl/Cmd+Z and Ctrl/Cmd+Y are redo. null for any other key. */
export function historyKey(e) {
  if (!e || !(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = String(e.key || '').toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y' && !e.shiftKey) return 'redo';
  return null;
}
export function createHistory({ snap, restore, limit = 100, wait = 350, onChange = () => {} } = {}) {
  const undo = [], redo = [];
  let last = snap(), timer = 0;
  /** Record the state now if it changed since the last step. */
  const flush = () => {
    clearTimeout(timer); timer = 0;
    const s = snap();
    if (s === last) return false;
    undo.push(last); if (undo.length > limit) undo.splice(0, undo.length - limit);
    redo.length = 0; last = s;
    return true;
  };
  const h = {
    commit(now = false) {
      clearTimeout(timer);
      if (now) { flush(); onChange(); } else timer = setTimeout(() => { flush(); onChange(); }, wait);
    },
    /** Back one step (a change still being typed counts as a step). */
    undo() {
      flush();
      if (!undo.length) { onChange(); return false; }
      redo.push(last); last = undo.pop(); restore(last); onChange();
      return true;
    },
    redo() {
      flush();
      if (!redo.length) { onChange(); return false; }
      undo.push(last); last = redo.pop(); restore(last); onChange();
      return true;
    },
    canUndo: () => undo.length > 0 || (timer !== 0 && snap() !== last),
    canRedo: () => redo.length > 0,
    /** The state as it is now is the start: nothing to undo or redo (a page that loads more after it starts). */
    reset() { clearTimeout(timer); timer = 0; undo.length = 0; redo.length = 0; last = snap(); onChange(); },
    /** The state as it is now replaces the last step, without a new step (something the page worked out by itself). */
    settle() { if (!timer) last = snap(); },
    sizes: () => ({ undo: undo.length, redo: redo.length }),
  };
  return h;
}
