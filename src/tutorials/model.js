export const STORAGE_KEY = 'toah-nipi-tutorial-completed-v1';
export const initialSession = { tutorialId: null, index: 0, paused: false, status: 'idle', skipped: [], revision: 0 };

export function sessionReducer(session, action) {
  switch (action.type) {
    case 'start': return { ...initialSession, tutorialId: action.id, status: 'running', revision: session.revision + 1 };
    case 'pause': return { ...session, paused: !session.paused };
    case 'restart': return { ...initialSession, tutorialId: session.tutorialId, status: 'running', revision: session.revision + 1 };
    case 'previous': return { ...session, index: Math.max(0, session.index - 1), status: 'running', revision: session.revision + 1 };
    case 'advance': {
      if (session.paused || session.status !== 'running' || !action.allowed || action.index !== session.index || action.revision !== session.revision) return session;
      const skipped = action.skip ? [...new Set([...session.skipped, session.index])] : session.skipped;
      return { ...session, skipped, index: Math.min(session.index + 1, action.total - 1), status: session.index + 1 >= action.total ? 'finished' : 'running', revision: session.revision + 1 };
    }
    case 'exit': return { ...initialSession, revision: session.revision + 1 };
    default: return session;
  }
}

export function expectedMatches(expected, read, baseline) {
  if (!expected) return false;
  const current = read(expected.target, expected.attribute);
  if (current === null || current === undefined) return false;
  return expected.changed ? baseline !== null && baseline !== undefined && current !== baseline : current === expected.value;
}

export function practiceValid(kind, values) {
  if (kind === 'group') return Boolean(values.group?.trim() && values.contact?.trim() && values.type);
  if (kind === 'dates') return Boolean(values.arrival && values.departure && values.departure >= values.arrival && Number.isInteger(Number(values.guests)) && Number(values.guests) > 0);
  return false;
}

export function readCompleted(storage, ids) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id) => ids.includes(id)))] : [];
  } catch { return []; }
}

export function saveCompleted(storage, completed) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(completed)); } catch { /* Private/blocked storage is optional. */ }
}

export function dialoguePosition(rect, width, height, panelHeight = 320) {
  const panelWidth = Math.min(370, width - 24);
  if (!rect) return { left: Math.max(12, width - panelWidth - 16), top: Math.max(12, height - panelHeight - 96), width: panelWidth };
  const right = rect.right + 22;
  const left = rect.left - panelWidth - 22;
  const top = rect.bottom + 22;
  const fitsBelow = top + panelHeight < height - 12;
  return {
    left: Math.max(12, Math.min(width - panelWidth - 12, right + panelWidth < width - 12 ? right : left > 12 ? left : rect.left)),
    top: Math.max(12, Math.min(height - panelHeight - 12, right + panelWidth < width - 12 || left > 12 ? rect.top : fitsBelow ? top : rect.top - panelHeight - 22)),
    width: panelWidth,
  };
}
