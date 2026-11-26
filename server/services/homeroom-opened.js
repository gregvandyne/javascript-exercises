// Which Manipulatives practice sets each student has opened in the desk's player (QA round 2: Today says "Started" for
// a set opened with no answer checked yet, never "Not started"). The desk's pulse says what is open; this keeps only
// "opened", in memory, per class, until the class's live class ends (forget) or the server restarts.
import { onLive } from './homeroom.js';

const opened = new Map();   // classId -> Set of `${studentId}:${class lesson id}`
export function mark(classId, userId, clid) { if (!clid) return; let s = opened.get(classId); if (!s) { s = new Set(); opened.set(classId, s); } s.add(`${userId}:${clid}`); }
export const has = (classId, userId, clid) => !!opened.get(classId)?.has(`${userId}:${clid}`);
export function forget(classId) { opened.delete(classId); }
onLive(({ c, action }) => { if (action === 'end' || action === 'start') forget(c.id); });
