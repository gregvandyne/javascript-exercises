// Classroom dashboards, stage 1 (docs/decisions.md "Classroom dashboards, stage 1"). A teacher's screen per class (the
// projector) and a student's screen per class, built from widgets on a 12-column grid, plus what the teacher sends to
// every student screen (pushes, the "From your teacher" tray, Eyes up) and the class's approved links.
//
// - The widget registry (WIDGETS) is the one list of widget types: id, group, who may add it (teacher, student or both),
//   default and smallest size, and the settings schema. Names and labels are i18n keys (dash.w.<id>.*); the browser's
//   renderers live in public/js/dash-widgets.js, keyed by the same id. A later stage adds a type here and a renderer
//   there; everything else (library, grid, settings form, saving, validation) already works from the schema.
// - Every layout the browser sends is rebuilt here from the schema (cleanWidgets): unknown types, settings and ids are
//   dropped, sizes clamped, text clipped. Nothing a browser sends is stored as it came.
// - Teacher text (agenda, objective) reaches students only through pinned widgets. A student's own widgets and settings
//   are stored for that student alone: never shown to another student, never sent anywhere else.
// - No AI anywhere in this module: background pictures pass the profile photo's file checks (photos.cleanJpeg: JPEG
//   only, size limits, metadata removed) and nothing else, and only the owner and the class's teachers can fetch them.
// - Pushes are kept per class per school day; the tray shows today's until the teacher ends one or the day ends.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { q, tx, now, uid, audit } from '../db.js';
import { config } from '../config.js';
import * as S from './schools.js';
import * as games from './games.js';
import * as L from './lessons.js';
import { cleanJpeg, PhotoError } from './photos.js';
import { liveOn, openForClass } from './classlive-sessions.js';
import { isOfficial } from './classlive-access.js';
import { TOOL_IDS, cleanToolState } from './dash-tools.js';
import { cleanVideo } from './dash-media.js';
import { lookup } from '../i18n/index.js';

// ---------------------------------------------------------------- the widget registry
/** Library groups, in order. Groups without a widget yet (stage 2 and later) are not shown. */
export const GROUPS = ['join', 'time', 'class', 'show', 'teach', 'words', 'tools', 'check', 'oomba'];
/**
 * Widget types. who: 'teacher' | 'student' | 'both' (who may add it to their own screen; a teacher can pin any of
 * theirs to student screens unless pin is false). pinDef: pinned when added. size/min: [columns, rows]. words: other
 * strings its renderer shows (dash.w.<id>.<word>).
 * settings: [{ key, type, def, ... }]: 'text'|'textarea' (max), 'select' (options), 'bool', 'number' (min, max),
 * 'zone' (a time zone or ''), 'periods' (the day's schedule), 'place' (a geocoded place, weather), 'target' (what a QR
 * code opens), 'tiles' (Oomba games and lessons), 'date' (YYYY-MM-DD), 'hhmm', 'marks' (calendar days with a label),
 * 'scores' and 'stamps' (hidden: changed by the widget itself), 'tool' (stage 3: a teaching tool's state, hidden,
 * rebuilt by services/dash-tools.js) and 'pic' (stage 3: one of the teacher's own pictures for this class). Every type is
 * rebuilt on the server (cleanSettings). send: the teacher can send it to students, each of whom gets their own copy.
 */
/** The words each teaching tool shows (dash.w.<id>.<word>); the words they share are dash.tools.<word> (TOOL_COMMON). */
const TOOL_WORDS = {
  fractions: ['bar', 'circle', 'same', 'hide', 'add', 'remove', 'parts', 'more', 'fewer', 'shadedOf', 'sameText', 'tooSmall', 'samePrompt', 'which', 'order'],
  numline: ['from', 'to', 'steps', 'mode', 'whole', 'fraction', 'decimal', 'point', 'jump', 'clear', 'cursor', 'placed', 'removed', 'jumpFrom', 'jumped', 'hint', 'range'],
  coord: ['slope', 'start', 'quads', 'four', 'one', 'size', 'line', 'table', 'plot', 'plotted', 'unplotted', 'clear', 'rise', 'run', 'hint', 'noLine'],
  graph: ['kind', 'bar', 'line', 'picture', 'dot', 'title', 'data', 'label', 'value', 'addRow', 'removeRow', 'fromCheck', 'noChecks', 'counts', 'per', 'key', 'icon', 'empty'],
  base10: ['hundreds', 'tens', 'ones', 'add', 'take', 'tradeUp', 'tradeDown', 'tradeUpT', 'tradeDownH', 'traded', 'hint', 'drop', 'clear'],
  placeval: ['discs', 'decimals', 'times10', 'div10', 'more', 'less', 'expanded', 'clear', 'thousands', 'hundreds', 'tens', 'ones', 'tenths', 'hundredths', 'thousandths'],
  tenframe: ['frames', 'red', 'yellow', 'take', 'clear', 'fill', 'bond', 'cell', 'empty', 'counts', 'flip', 'makeTen'],
  hundreds: ['start', 'skip', 'skipBy', 'hide', 'none', 'shaded', 'all', 'clear', 'shadedN', 'hidden', 'noSkip'],
  area: ['rows', 'cols', 'array', 'area', 'splitRows', 'splitCols', 'place', 'noSplit', 'hint'],
  times: ['size', 'fact', 'row', 'col', 'squares', 'turn', 'hide', 'pick', 'squaresAre', 'clear'],
  tclock: ['digital', 'h24', 'elapsed', 'start', 'endTime', 'elapsedIs', 'onlyH', 'onlyM', 'hint', 'minutes', 'hours', 'time'],
  fdp: ['fraction', 'decimal', 'percent', 'grid', 'hint', 'top', 'bottom', 'outOf'],
  // stage 4
  geoboard: ['pegs', 'newBand', 'undo', 'close', 'clear', 'band', 'area', 'perimeter', 'pickIs', 'squares', 'open', 'crosses', 'peg', 'added', 'closed', 'hint', 'cursor', 'show'],
  pattern: ['hex', 'trap', 'rhom', 'tri', 'sq', 'thin', 'turn', 'remove', 'clear', 'of', 'notHex', 'board', 'block', 'moved', 'hint', 'empty'],
  angle: ['acute', 'right', 'obtuse', 'straight', 'reflex', 'zero', 'full', 'proto', 'arc', 'step', 'ray', 'hint'],
  solids: ['cube', 'cuboid', 'triprism', 'hexprism', 'sqpyramid', 'tripyramid', 'cylinder', 'cone', 'fold', 'unfold', 'faces', 'edges', 'vertices', 'flatCurved', 'euler', 'turn', 'mark', 'none', 'folded', 'shape', 'view'],
  transform: ['shape', 'tri', 'flag', 'ell', 'arrow', 'translate', 'reflect', 'rotate', 'axis', 'axisX', 'axisY', 'axisYX', 'axisYNX', 'turn', 'deg', 'ghost', 'table', 'original', 'image', 'offGrid', 'hint', 'moved', 'rule', 'move'],
  balance: ['both', 'left', 'right', 'addx', 'subx', 'add1', 'sub1', 'div', 'new', 'undo', 'show', 'solved', 'tipsL', 'tipsR', 'level', 'cant', 'steps', 'where', 'secret', 'scale', 'start'],
  algebra: ['x2', 'x', 'one', 'pos', 'neg', 'flip', 'zero', 'clear', 'raw', 'simple', 'pairs', 'mat', 'tile', 'added', 'removed', 'hint', 'empty', 'full'],
  coins: ['count', 'change', 'total', 'cost', 'paid', 'changeIs', 'countUp', 'fewest', 'clear', 'cur', 'auto', 'usd', 'eur', 'gbp', 'gen', 'notEnough', 'tray', 'mat', 'added', 'removed', 'empty', 'mode', 'units'],
  chance: ['coin', 'dice', 'spinner', 'one', 'two', 'parts', 'run', 'trials', 'reset', 'heads', 'tails', 'got', 'expected', 'chart', 'hint', 'sum', 'part', 'runs', 'kind', 'none'],
  letters: ['bank', 'word', 'fam', 'none', 'caps', 'clear', 'back', 'vowel', 'consonant', 'real', 'made', 'counts', 'tile', 'added', 'removed', 'moved', 'hint', 'onset', 'full'],
  organizer: ['kind', 'venn', 'tchart', 'kwl', 'story', 'main', 'seq', 'title', 'edit', 'heading', 'text', 'boxes', 'empty', 'a', 'b', 'both', 'left', 'right', 'know', 'want', 'learned',
    'characters', 'setting', 'problem', 'events', 'solution', 'idea', 'detail', 'step', 'editHint', 'note', 'save'],
  map: ['world', 'grid', 'names', 'pin', 'label', 'clear', 'remove', 'cursor', 'placed', 'removed', 'hint', 'compass', 'n', 'e', 's', 'w', 'square', 'sea', 'pins', 'none',
    'northAmerica', 'southAmerica', 'europe', 'asia', 'africa', 'australia', 'antarctica', 'pacific', 'atlantic', 'indian', 'arctic', 'southern'],
};
/** Words every teaching tool shares (dash.tools.<word>). */
export const TOOL_COMMON = ['send', 'options', 'optionsFor', 'pin', 'pinned', 'copyNote', 'yourCopy', 'done',
  // stage 4: "Make a question from it" and "Practice it"
  'ask', 'askTitle', 'askNote', 'askRight', 'askSend', 'askQ', 'askOpt', 'practice', 'practiceName'];
/** Stage 4: the question each tool can make from what it shows (dash.ask.<key>; public/js/dash-ask.js). */
export const ASK_KEYS = ['fractions', 'numline', 'numlinePt', 'coord', 'graph', 'base10', 'placeval', 'tenframe', 'hundreds', 'hundredsShade', 'times', 'tclock', 'fdp',
  'geoboard', 'pattern', 'angle', 'solidsF', 'solidsE', 'transform', 'balance', 'algebra', 'coins', 'coinsChange', 'chance', 'letters', 'map', 'mapGrid'];
/** Stage 4, "Practice it": a teaching tool and the official Oomba games that practise the same thing (picked by hand
 *  from the games' own topics, seed-games/<slug>.json). A game is offered only while it is the official game and every
 *  student of the class can open it; a tool without a clean match offers nothing. */
export const PRACTICE = {
  fractions: ['fraction-factory'], numline: ['lily-hop', 'sub-zero'], coord: ['sky-lines'], graph: ['data-detective'], base10: ['rocket-supply'],
  placeval: ['rocket-supply', 'crate-stacker'], tenframe: ['garden-count'], hundreds: ['crate-stacker'], times: ['sum-racer'], tclock: ['kitchen-rush'],
  geoboard: ['keep-builder'], pattern: ['shape-hunt'], angle: ['keep-builder'], solids: ['shape-hunt', 'keep-builder'], transform: ['keep-builder'],
  balance: ['balance-bridge', 'machine-line'], algebra: ['machine-line'], coins: ['kitchen-rush'], chance: ['launch-lab'], letters: ['word-trail', 'word-hunt'], map: ['atlas-quest'],
};
// ---- stage 5 (docs/decisions.md "Classroom dashboards, stage 5")
/** Hall pass places a teacher may offer (fixed: students never type where they are going). */
export const PASS_PLACES = ['bathroom', 'water', 'nurse', 'office', 'library'];
/** Reasons for a student's point: positive behaviours only. There is no reason to take a point away. */
export const POINT_REASONS = ['kind', 'helpful', 'teamwork', 'effort', 'listening', 'responsible', 'brave', 'creative'];
/** The mood check-in's faces, in order (an index is stored, never text). */
export const MOODS = ['great', 'good', 'okay', 'meh', 'sad'];
/** Widgets that show something from outside Oomba (or the camera): the teacher's screen and projector only. Never
 *  pinned, never pushed, never on a student's screen. */
export const TEACHER_ONLY = ['video', 'site', 'camera'];
export const WIDGETS = [
  { id: 'clock', icon: '🕒', group: 'time', who: 'both', size: [3, 2], min: [3, 2], words: [], settings: [
    { key: 'face', type: 'select', options: ['digital', 'analog'], def: 'digital' },
    { key: 'hour12', type: 'bool', def: true },
    { key: 'seconds', type: 'bool', def: false },
    { key: 'date', type: 'bool', def: true },
    { key: 'zone2', type: 'zone', def: '' }] },
  { id: 'text', icon: '📝', group: 'show', who: 'teacher', size: [4, 3], min: [3, 2], words: ['empty'], settings: [
    { key: 'title', type: 'text', max: 40, def: '' },
    { key: 'body', type: 'textarea', max: 800, def: '' },
    { key: 'style', type: 'select', options: ['list', 'text'], def: 'list' }] },
  { id: 'ican', icon: '🎯', group: 'show', who: 'both', size: [4, 2], min: [3, 2], words: ['lead', 'empty'], settings: [
    { key: 'goal', type: 'textarea', max: 200, def: '' }] },
  // ---- stage 2: everyday widgets
  { id: 'timer', icon: '⏳', group: 'time', who: 'both', size: [4, 3], min: [3, 3], words: ['start', 'pause', 'resume', 'reset', 'custom', 'min', 'sec', 'set', 'done', 'left', 'presets', 'mins'], settings: [
    { key: 'minutes', type: 'number', min: 1, max: 180, def: 5 },
    { key: 'view', type: 'select', options: ['digits', 'ring'], def: 'digits' },
    { key: 'chime', type: 'bool', def: false },
    { key: 'bar', type: 'bool', def: true }] },
  { id: 'stopwatch', icon: '⏱️', group: 'time', who: 'both', size: [3, 3], min: [3, 3], words: ['start', 'pause', 'resume', 'reset'], settings: [] },
  { id: 'schedule', icon: '🗓️', group: 'time', who: 'teacher', size: [4, 4], min: [3, 2], words: ['empty', 'now', 'next', 'left', 'after', 'before', 'addPeriod', 'period', 'from', 'to', 'remove', 'nothingNext', 'starts'], settings: [
    { key: 'periods', type: 'periods', def: [] },
    { key: 'view', type: 'select', options: ['list', 'nownext'], def: 'list' }] },
  { id: 'weather', icon: '⛅', group: 'show', who: 'teacher', size: [4, 3], min: [3, 2], words: ['empty', 'resting', 'loading', 'hiLo', 'find', 'search', 'searchHint', 'none', 'place',
    'clear', 'clearNight', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'snow', 'storm'], settings: [
    { key: 'place', type: 'place', def: null },
    { key: 'unit', type: 'select', options: ['auto', 'f', 'c'], def: 'auto' }] },
  { id: 'qr', icon: '🔳', group: 'join', who: 'teacher', pin: false, size: [4, 4], min: [3, 3], words: ['empty', 'gone', 'scan', 'nothing'], settings: [
    { key: 'target', type: 'target', def: null }] },
  { id: 'picker', icon: '🙋', group: 'class', who: 'teacher', pin: false, size: [6, 5], min: [4, 4], words: ['pick', 'again', 'left', 'away', 'awayTitle', 'awayNote', 'reset', 'none', 'spin', 'noItems'], settings: [
    { key: 'mode', type: 'select', options: ['names', 'wheel'], def: 'names' },
    { key: 'source', type: 'select', options: ['class', 'items'], def: 'class' },
    { key: 'items', type: 'textarea', max: 600, def: '' },
    { key: 'norepeat', type: 'bool', def: true }] },
  { id: 'noise', icon: '🎤', group: 'tools', who: 'teacher', pin: false, size: [4, 3], min: [4, 3], words: ['start', 'stop', 'on', 'off', 'note', 'denied', 'quiet', 'ok', 'loud'], settings: [
    { key: 'zone', type: 'select', options: ['silent', 'whisper', 'talk', 'busy'], def: 'talk' }] },
  { id: 'help', icon: '✋', group: 'class', who: 'teacher', pinDef: true, size: [4, 3], min: [4, 3], words: ['need', 'done', 'cancel', 'place', 'doneMine', 'empty', 'next', 'clear', 'waiting', 'finished', 'remove', 'hidden'], settings: [] },
  { id: 'check', icon: '✅', group: 'check', who: 'teacher', pin: false, size: [5, 4], min: [4, 4], words: ['empty', 'new', 'end', 'ended', 'names', 'save', 'saved', 'savedList', 'answered', 'send', 'kind', 'question', 'questionHint',
    'options', 'option', 'addOption', 'needOptions', 'nobody', 'notYet', 'savedNone', 'thumbs', 'fist', 'choice', 'scale', 'up', 'side', 'down'], settings: [] },
  // ---- stage 2, second part: more everyday widgets
  { id: 'countdown', icon: '⏰', group: 'time', who: 'teacher', size: [4, 3], min: [3, 3], words: ['empty', 'days', 'hours', 'mins', 'today', 'past'], settings: [
    { key: 'label', type: 'text', max: 60, def: '' },
    { key: 'date', type: 'date', def: '' },
    { key: 'time', type: 'hhmm', def: '08:00' }] },
  { id: 'calendar', icon: '📆', group: 'time', who: 'teacher', size: [4, 4], min: [3, 3], words: ['today', 'coming', 'none', 'addMark', 'day', 'label', 'remove'], settings: [
    { key: 'marks', type: 'marks', def: [] }] },
  { id: 'symbols', icon: '🤫', group: 'class', who: 'teacher', size: [3, 3], min: [3, 3], words: ['change'], settings: [
    { key: 'mode', type: 'select', options: ['silent', 'whisper', 'partner', 'together', 'hand'], def: 'whisper' }] },
  { id: 'light', icon: '🚦', group: 'class', who: 'teacher', size: [3, 3], min: [3, 3], words: ['set'], settings: [
    { key: 'color', type: 'select', options: ['red', 'yellow', 'green'], def: 'green' },
    { key: 'red', type: 'text', max: 40, def: '' },
    { key: 'yellow', type: 'text', max: 40, def: '' },
    { key: 'green', type: 'text', max: 40, def: '' }] },
  { id: 'dice', icon: '🎲', group: 'tools', who: 'both', pin: false, size: [3, 3], min: [3, 3], words: ['roll', 'total', 'die'], settings: [
    { key: 'count', type: 'number', min: 1, max: 6, def: 2 }] },
  { id: 'random', icon: '🔢', group: 'tools', who: 'both', pin: false, size: [3, 3], min: [3, 3], words: ['go', 'between'], settings: [
    { key: 'min', type: 'number', min: -9999, max: 9999, def: 1 },
    { key: 'max', type: 'number', min: -9999, max: 9999, def: 100 }] },
  { id: 'groups', icon: '👥', group: 'class', who: 'teacher', pin: false, size: [6, 4], min: [4, 3], words: ['make', 'again', 'group', 'none', 'note'], settings: [
    { key: 'by', type: 'select', options: ['size', 'count'], def: 'size' },
    { key: 'n', type: 'number', min: 2, max: 12, def: 4 }] },
  { id: 'score', icon: '🏆', group: 'class', who: 'teacher', size: [5, 3], min: [4, 3], words: ['team', 'plus', 'minus', 'reset',
    // stage 5: points for each student (positive only), from a fixed list of reasons
    'reason', 'award', 'awardAll', 'everyone', 'undo', 'undone', 'classTotal', 'mine', 'given', 'resetAll', 'resetConfirm', 'hidden', 'nobody', 'pick',
    ...POINT_REASONS.map(r => `r_${r}`)], settings: [
    { key: 'mode', type: 'select', options: ['teams', 'students'], def: 'teams' },
    { key: 'teams', type: 'textarea', max: 240, def: '' },
    { key: 'scores', type: 'scores', hidden: true, def: [] }] },
  { id: 'stickers', icon: '⭐', group: 'show', who: 'teacher', size: [4, 3], min: [3, 3], words: ['add', 'remove', 'clear', 'empty'], settings: [
    { key: 'stamps', type: 'stamps', hidden: true, def: [] }] },
  { id: 'tiles', icon: '🧩', group: 'oomba', who: 'teacher', size: [6, 3], min: [3, 2], words: ['empty', 'add', 'games', 'lessons', 'remove', 'gone'], settings: [
    { key: 'tiles', type: 'tiles', def: [] }] },
  // ---- stage 3: teaching tools (group teach). Each student gets their own copy when the teacher sends one; never
  // pinned (a pinned copy would follow every move the teacher makes). Students may add them to their own screen.
  ...[['fractions', '🍕', [6, 6], [5, 6]], ['numline', '📏', [8, 4], [6, 4]], ['coord', '📈', [6, 6], [5, 6]], ['graph', '📊', [5, 5], [5, 5]],
    ['base10', '🧱', [7, 6], [6, 5]], ['placeval', '🔟', [7, 5], [6, 5]], ['tenframe', '🔴', [5, 5], [4, 5]], ['hundreds', '💯', [5, 7], [4, 6]],
    ['area', '🔲', [6, 6], [5, 5]], ['times', '✖️', [6, 8], [5, 7]], ['tclock', '🕰️', [4, 6], [4, 5]], ['fdp', '➗', [6, 5], [5, 4]]]
    .map(([id, icon, size, min]) => ({ id, icon, group: 'teach', who: 'both', pin: false, send: true, size, min, words: TOOL_WORDS[id], settings: [{ key: 'state', type: 'tool', hidden: true, def: cleanToolState(id, {}) }] })),
  // ---- stage 4: teaching tools part 2 (docs/decisions.md "Classroom dashboards, stage 4"), the same rules. Maths tools in
  // Teach; letter tiles, graphic organizers and maps in a new group, Words and maps.
  ...[['geoboard', '📌', [6, 6], [5, 6], 'teach'], ['pattern', '🔷', [7, 6], [6, 6], 'teach'], ['angle', '📐', [6, 6], [5, 5], 'teach'], ['solids', '🧊', [6, 6], [5, 6], 'teach'],
    ['transform', '🔄', [7, 6], [6, 6], 'teach'], ['balance', '⚖️', [7, 6], [6, 6], 'teach'], ['algebra', '🟪', [6, 6], [5, 6], 'teach'], ['coins', '🪙', [7, 6], [6, 6], 'teach'],
    ['chance', '🎯', [7, 6], [6, 6], 'teach'], ['letters', '🔤', [7, 6], [6, 6], 'words'], ['organizer', '🗂️', [7, 6], [6, 5], 'words'], ['map', '🗺️', [7, 6], [6, 5], 'words']]
    .map(([id, icon, size, min, group]) => ({ id, icon, group, who: 'both', pin: false, send: true, size, min, words: TOOL_WORDS[id], settings: [{ key: 'state', type: 'tool', hidden: true, def: cleanToolState(id, {}) }] })),
  { id: 'board', icon: '🖍️', group: 'teach', who: 'teacher', pin: false, size: [6, 5], min: [4, 4], words: ['pen', 'marker', 'eraser', 'color', 'ink', 'red', 'blue', 'green', 'orange', 'purple', 'undo', 'clear', 'note', 'canvas', 'down', 'up', 'keys', 'cleared'], settings: [
    { key: 'bg', type: 'select', options: ['plain', 'grid', 'lined'], def: 'grid' }] },
  { id: 'picture', icon: '🖼️', group: 'show', who: 'teacher', size: [4, 4], min: [3, 3], words: ['empty', 'needAlt', 'gone', 'upload', 'uploading', 'replace', 'note', 'bad'], settings: [
    { key: 'pic', type: 'pic', def: '' },
    { key: 'alt', type: 'textarea', max: 200, def: '' },
    { key: 'fit', type: 'select', options: ['contain', 'cover'], def: 'contain' }] },
  // ---- stage 5: video, a site window and a document camera (the teacher's screen and projector only); a hall pass, class
  // jobs, a mood check-in (students see only their own); and calm, note and checklist widgets.
  { id: 'video', icon: '🎬', group: 'show', who: 'teacher', pin: false, size: [6, 5], min: [4, 4], words: ['empty', 'paste', 'pasteHint', 'bad', 'ok', 'endNote', 'note', 'secsHint', 'secsBad', 'title'], settings: [
    { key: 'video', type: 'video', def: null },
    { key: 'start', type: 'secs', def: 0 },
    { key: 'end', type: 'secs', def: 0 },
    { key: 'mute', type: 'bool', def: false },
    { key: 'loop', type: 'bool', def: false }] },
  { id: 'site', icon: '🌐', group: 'show', who: 'teacher', pin: false, size: [6, 5], min: [4, 4], words: ['empty', 'checking', 'blocked', 'blockedText', 'open', 'bad', 'note', 'frameTitle'], settings: [
    { key: 'url', type: 'site', def: '' }] },
  { id: 'camera', icon: '📷', group: 'show', who: 'teacher', pin: false, size: [6, 5], min: [4, 4], words: ['start', 'stop', 'which', 'mirror', 'rotate', 'zoomIn', 'zoomOut', 'zoom', 'freeze', 'unfreeze', 'frozen', 'live', 'note',
    'denied', 'deniedText', 'none', 'noneText', 'failed', 'off', 'camera', 'again'], settings: [] },
  { id: 'hallpass', icon: '🚪', group: 'class', who: 'teacher', pinDef: true, size: [5, 5], min: [4, 4], words: ['ask', 'askFor', 'waiting', 'cancel', 'out', 'back', 'declined', 'ok', 'asking', 'outNow', 'nobody', 'approve', 'decline',
    'oneOut', 'over', 'outPublic', 'mine', 'hiddenNames', 'none', 'backSay', 'markBack', ...PASS_PLACES.map(p => `p_${p}`)], settings: [
    { key: 'places', type: 'places', def: PASS_PLACES },
    { key: 'oneOut', type: 'bool', def: true },
    { key: 'mins', type: 'number', min: 1, max: 30, def: 5 }] },
  { id: 'jobs', icon: '🧹', group: 'class', who: 'teacher', size: [5, 5], min: [4, 4], words: ['rotate', 'shuffle', 'rotated', 'shuffled', 'nobody', 'open', 'defaults'], settings: [
    { key: 'jobs', type: 'textarea', max: 400, def: '' },
    { key: 'crew', type: 'crew', hidden: true, def: { order: [], shift: 0 } }] },
  { id: 'mood', icon: '😊', group: 'check', who: 'teacher', pinDef: true, size: [4, 4], min: [4, 4], words: ['ask', 'mine', 'counts', 'names', 'nobody', 'notYet', 'saved', ...MOODS.map(m => `m_${m}`)], settings: [] },
  { id: 'breathe', icon: '🫧', group: 'tools', who: 'both', size: [3, 4], min: [3, 4], words: ['start', 'pause', 'in', 'hold', 'out', 'ready'], settings: [
    { key: 'pace', type: 'select', options: ['calm', 'box', 'long'], def: 'calm' }] },
  { id: 'note', icon: '🗒️', group: 'show', who: 'teacher', pin: false, size: [3, 3], min: [3, 2], words: ['empty'], settings: [
    { key: 'body', type: 'textarea', max: 300, def: '' },
    { key: 'color', type: 'select', options: ['yellow', 'pink', 'blue', 'green'], def: 'yellow' }] },
  { id: 'checklist', icon: '☑️', group: 'show', who: 'teacher', size: [4, 4], min: [3, 3], words: ['empty', 'done', 'clear', 'ticked', 'unticked'], settings: [
    { key: 'title', type: 'text', max: 40, def: '' },
    { key: 'items', type: 'textarea', max: 600, def: '' },
    { key: 'ticks', type: 'ticks', hidden: true, def: [] }] },
];
const BY_ID = new Map(WIDGETS.map(w => [w.id, w]));
export const widgetType = id => BY_ID.get(String(id)) || null;
export const COLS = 12, MAX_ROWS = 24, MAX_H = 8, MAX_WIDGETS = 24, MAX_LAYOUTS = 12;
export const canAdd = (type, role) => !!type && (type.who === 'both' || type.who === role);
/** Whether a teacher may pin this type on student screens (the picker, the noise meter, QR and checks never are). */
export const canPin = type => !!type && type.pin !== false && !TEACHER_ONLY.includes(type.id);

/** A widget's word for the browser. Stage 4: a word that counts ("{n, plural, one {# vowel} other {# vowels}}") goes as
 *  the message itself, for the browser to fill in with public/js/i18n-format.js; every other word as t() gives it. */
const word = (t, key) => { const raw = t.locale ? lookup(t.locale, key) : undefined; return raw && /\{\w+,\s*plural,/.test(raw) ? raw : t(key); };
/** The registry as the browser gets it: labels in the reader's language. role: 'teacher' | 'student'. */
export function registryFor(t, role) {
  const types = WIDGETS.map(w => ({
    id: w.id, icon: w.icon, group: w.group, who: w.who, size: w.size, min: w.min, add: canAdd(w, role), pin: canPin(w), pinDef: !!w.pinDef, send: !!w.send,
    name: t(`dash.w.${w.id}.name`), desc: t(`dash.w.${w.id}.desc`),
    words: Object.fromEntries(w.words.map(k => [k, word(t, `dash.w.${w.id}.${k}`)])),
    settings: w.settings.map(s => ({ ...s, label: s.type === 'tool' ? '' : t(`dash.w.${w.id}.s.${s.key}`),
      ...(s.options ? { labels: Object.fromEntries(s.options.map(o => [o, t(`dash.w.${w.id}.o.${s.key}.${o}`)])) } : {}) })),
  }));
  const used = new Set(WIDGETS.map(w => w.group));
  return { types, groups: GROUPS.filter(g => used.has(g)).map(g => ({ id: g, name: t(`dash.groups.${g}`) })), common: Object.fromEntries(TOOL_COMMON.map(k => [k, t(`dash.tools.${k}`)])),
    ask: { q: Object.fromEntries(ASK_KEYS.map(k => [k, t(`dash.ask.${k}`)])) } };
}

// ---------------------------------------------------------------- cleaning what browsers send
const ID = /^[A-Za-z0-9_-]{1,24}$/;
const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
/** Text a person typed: no control characters except new lines (textarea), trimmed, at most max characters. */
export const cleanText = (v, max, multi = false) => {
  let s = String(v ?? '').replace(multi ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '').replace(/[‪-‮⁦-⁩]/g, '');
  if (multi) s = s.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n');
  return [...s.trim()].slice(0, max).join('');
};
export const MAX_PERIODS = 16, MAX_TILES = 12, MAX_MARKS = 40, MAX_TEAMS = 8, MAX_STAMPS = 30, MAX_SCORE = 9999;
/** How many stickers the fixed Oomba set has (public/js/dash-widgets.js STAMPS; no uploads). */
export const STAMP_COUNT = 20;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A real calendar day as YYYY-MM-DD, or ''. */
export const cleanDate = v => { const m = YMD.exec(String(v ?? '')); if (!m) return ''; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 2000 && +m[1] <= 2100 ? m[0] : ''; };
/** Teacher-marked calendar days: a day and a short label, one per day, in order. */
export function cleanMarks(v) {
  const out = new Map();
  for (const x of Array.isArray(v) ? v : []) {
    if (out.size >= MAX_MARKS) break;
    const date = cleanDate(x && x.date), label = cleanText(x && x.label, 40);
    if (date && label) out.set(date, { date, label });
  }
  return [...out.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
/** Scoreboard points: whole numbers, one per team. */
export const cleanScores = v => (Array.isArray(v) ? v : []).slice(0, MAX_TEAMS).map(n => { const x = Math.round(Number(n)); return Number.isFinite(x) ? Math.max(-MAX_SCORE, Math.min(MAX_SCORE, x)) : 0; });
/** Stickers: which one of the fixed set and where (percent of the widget). */
export const cleanStamps = v => (Array.isArray(v) ? v : []).filter(x => x && typeof x === 'object').slice(0, MAX_STAMPS)
  .map(x => ({ e: Number(x.e), x: Math.round(Number(x.x)), y: Math.round(Number(x.y)) }))
  .filter(x => Number.isInteger(x.e) && x.e >= 0 && x.e < STAMP_COUNT && x.x >= 0 && x.x <= 100 && x.y >= 0 && x.y <= 100);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ZONES = new Set(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []);
export const isZone = z => { if (ZONES.has(z)) return true; try { new Intl.DateTimeFormat('en', { timeZone: String(z) }); return /^[A-Za-z_]+\/[A-Za-z_/+-]+$/.test(String(z)); } catch { return false; } };
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
/** The day's periods: a name and a start and end time (HH:MM, end after start), in order, at most MAX_PERIODS. */
export function cleanPeriods(v) {
  const out = [];
  for (const p of Array.isArray(v) ? v : []) {
    if (out.length >= MAX_PERIODS) break;
    if (!p || typeof p !== 'object' || !HHMM.test(p.start) || !HHMM.test(p.end) || p.end <= p.start) continue;
    out.push({ name: cleanText(p.name, 40), start: p.start, end: p.end });
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}
/** A weather place the teacher picked: a name and coordinates (two decimals: about a kilometre, the cache key). */
export function cleanPlace(v) {
  if (!v || typeof v !== 'object') return null;
  const lat = num(v.lat, -90, 90), lon = num(v.lon, -180, 180), name = cleanText(v.name, 80);
  if (lat === null || lon === null || !name) return null;
  return { name, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
}
export const QR_KINDS = ['link', 'live', 'lesson', 'game'];
/** What a QR code opens: one of the class's approved links, its live game's join, an open lesson, a game. Whether it
 *  is still allowed is checked each time the code is made (qrFor). */
export function cleanTarget(v) {
  if (!v || typeof v !== 'object' || !QR_KINDS.includes(v.kind)) return null;
  const ref = String(v.ref ?? '');
  if (v.kind === 'live') return { kind: 'live', ref: '' };
  return ID.test(ref) ? { kind: v.kind, ref } : null;
}
/** Oomba tiles: games and lessons, no repeats, at most MAX_TILES. Who may open them is checked when they are shown. */
export function cleanTiles(v) {
  const out = [], seen = new Set();
  for (const x of Array.isArray(v) ? v : []) {
    if (out.length >= MAX_TILES) break;
    if (!x || !['game', 'lesson'].includes(x.kind) || !ID.test(String(x.ref || '')) || seen.has(`${x.kind}:${x.ref}`)) continue;
    seen.add(`${x.kind}:${x.ref}`); out.push({ kind: x.kind, ref: String(x.ref) });
  }
  return out;
}
// stage 5 setting types
/** Seconds into a video: a number, or "m:ss" / "h:mm:ss" as typed. 0..24 hours. */
export function cleanSecs(v) {
  const s = String(v ?? '').trim();
  let n = 0;
  if (/^\d{1,5}$/.test(s)) n = +s;
  else { const m = /^(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)$/.exec(s); if (m) n = (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3]; }
  return Math.min(86400, Math.max(0, Math.round(n) || 0));
}
/** The hall pass places offered: a subset of PASS_PLACES in their order, at least one. */
export const cleanPlaces = (v, def = PASS_PLACES) => { const set = new Set(Array.isArray(v) ? v : []); const out = PASS_PLACES.filter(p => set.has(p)); return out.length ? out : [...def]; };
/** Class jobs: who comes in what order (student ids, checked against the class when shown) and how far it has turned. */
export function cleanCrew(v) {
  const src = v && typeof v === 'object' ? v : {};
  const order = [...new Set((Array.isArray(src.order) ? src.order : []).map(String).filter(x => ID.test(x)))].slice(0, 80);
  return { order, shift: int(src.shift, 0, 9999, 0) };
}
export const MAX_ITEMS = 20;
/** A checklist's ticks: one true/false per item. */
export const cleanTicks = v => (Array.isArray(v) ? v : []).slice(0, MAX_ITEMS).map(x => x === true || x === 1);
/** One widget's settings, rebuilt from its schema. */
export function cleanSettings(type, s = {}) {
  const out = {}; const src = s && typeof s === 'object' ? s : {};
  for (const f of type.settings) {
    const v = src[f.key];
    if (f.type === 'bool') out[f.key] = v === undefined ? f.def : v === true || v === 1 || v === '1' || v === 'true';
    else if (f.type === 'select') out[f.key] = f.options.includes(v) ? v : f.def;
    else if (f.type === 'number') { const n = Math.round(Number(v)); out[f.key] = v !== undefined && v !== '' && Number.isFinite(n) ? Math.min(f.max, Math.max(f.min, n)) : f.def; }
    else if (f.type === 'zone') out[f.key] = v && isZone(v) ? String(v) : '';
    else if (f.type === 'periods') out[f.key] = cleanPeriods(v);
    else if (f.type === 'place') out[f.key] = cleanPlace(v);
    else if (f.type === 'target') out[f.key] = cleanTarget(v);
    else if (f.type === 'tiles') out[f.key] = cleanTiles(v);
    else if (f.type === 'date') out[f.key] = cleanDate(v);
    else if (f.type === 'hhmm') out[f.key] = HHMM.test(String(v ?? '')) ? String(v) : f.def;
    else if (f.type === 'marks') out[f.key] = cleanMarks(v);
    else if (f.type === 'scores') out[f.key] = cleanScores(v);
    else if (f.type === 'stamps') out[f.key] = cleanStamps(v);
    else if (f.type === 'tool') out[f.key] = cleanToolState(type.id, v);
    else if (f.type === 'pic') out[f.key] = ID.test(String(v ?? '')) ? String(v) : '';
    // stage 5
    else if (f.type === 'video') out[f.key] = cleanVideo(v);
    else if (f.type === 'secs') out[f.key] = cleanSecs(v);
    else if (f.type === 'site') out[f.key] = (v && cleanUrl(v)) || '';
    else if (f.type === 'places') out[f.key] = cleanPlaces(v, f.def);
    else if (f.type === 'crew') out[f.key] = cleanCrew(v);
    else if (f.type === 'ticks') out[f.key] = cleanTicks(v);
    else out[f.key] = v === undefined ? f.def : cleanText(v, f.max, f.type === 'textarea');
  }
  return out;
}
/** One widget's place on the grid, clamped to the grid and its type's smallest size. */
export function cleanBox(type, b = {}) {
  const w = int(b.w, type.min[0], COLS, type.size[0]), h = int(b.h, type.min[1], MAX_H, type.size[1]);
  return { x: int(b.x, 0, COLS - w, 0), y: int(b.y, 0, MAX_ROWS - 1, 0), w, h };
}
/** A layout's widgets as a browser sent them -> what may be stored. role: whose screen ('teacher' may pin). */
export function cleanWidgets(list, role) {
  const out = [], seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    if (out.length >= MAX_WIDGETS) break;
    if (!raw || typeof raw !== 'object') continue;
    const type = widgetType(raw.type);
    if (!canAdd(type, role) || !ID.test(String(raw.id || '')) || seen.has(raw.id)) continue;
    seen.add(raw.id);
    out.push({ id: String(raw.id), type: type.id, ...cleanBox(type, raw), s: cleanSettings(type, raw.s), ...(role === 'teacher' && raw.pin && canPin(type) ? { pin: true } : {}) });
  }
  return out;
}

// ---------------------------------------------------------------- backgrounds
/** Colour and Oomba art presets (public/css/dash.css draws them with the theme's tokens, so they follow light/dark). */
export const BG_COLORS = ['cream', 'mint', 'spark', 'sky', 'leaf', 'ink'];
export const BG_ART = ['sparks', 'eyes', 'hills', 'night'];
export const DEFAULT_BG = { kind: 'color', id: 'cream' };
/** A background as sent -> stored. A picture must be one of this person's pictures for this class. */
export function cleanBg(bg, user, classId) {
  if (!bg || typeof bg !== 'object') return DEFAULT_BG;
  if (bg.kind === 'color' && BG_COLORS.includes(bg.id)) return { kind: 'color', id: bg.id };
  if (bg.kind === 'art' && BG_ART.includes(bg.id)) return { kind: 'art', id: bg.id };
  if (bg.kind === 'pic' && ID.test(String(bg.id || '')) && q.get("SELECT 1 FROM dash_pictures WHERE id=? AND owner_id=? AND class_id=? AND use='bg'", bg.id, user.id, classId)) return { kind: 'pic', id: bg.id };
  return DEFAULT_BG;
}
const json = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };

// ---------------------------------------------------------------- who may do what
/** The class's own teacher (still staff at its school), on a class that isn't archived: the only one who changes the
 *  class dashboard, pushes, approves links or starts Eyes up. A school admin who doesn't teach the class may not. */
export function isTeacher(u, c) {
  if (!u || !c || c.archived_at || u.is_guest) return false;
  return S.teaches(u, c.id) && ['teacher', 'admin'].includes(S.roleIn(u, c.school_id));
}
/** An active student of the class (and of its school), on a class that isn't archived. */
export function isStudent(u, c) {
  if (!u || !c || c.archived_at || u.is_guest) return false;
  const m = S.classMember(c.id, u.id);
  return !!m && m.role === 'student' && !!S.membership(c.school_id, u.id);
}
/** 'teacher' | 'student' | null */
export const roleOf = (u, c) => (isTeacher(u, c) ? 'teacher' : isStudent(u, c) ? 'student' : null);

// ---------------------------------------------------------------- teacher layouts
const LAYOUT_COLS = 'id, class_id, owner_id, name, widgets, bg, position, used_at, created_at, updated_at';
const readLayout = r => (r ? { ...r, widgets: json(r.widgets, []), bg: json(r.bg, DEFAULT_BG) } : null);
export const getLayout = id => readLayout(q.get(`SELECT ${LAYOUT_COLS} FROM dash_layouts WHERE id=?`, String(id || '')));
export const layoutsOf = (classId, ownerId) => q.all(`SELECT ${LAYOUT_COLS} FROM dash_layouts WHERE class_id=? AND owner_id=? ORDER BY position, created_at`, classId, ownerId).map(readLayout);
export const classState = classId => q.get('SELECT * FROM dash_class WHERE class_id=?', classId) || { class_id: classId, layout_id: null, pins: '[]', pins_at: 0, eyes_until: 0, eyes_by: null, eyes_at: 0 };
const ensureClassRow = classId => q.run('INSERT OR IGNORE INTO dash_class(class_id) VALUES (?)', classId);

/** A first layout: a clock, today's goal and the agenda (both pinned on student screens). */
export function starterWidgets() {
  return [
    { id: 'clock1', type: 'clock', x: 0, y: 0, w: 4, h: 2, s: cleanSettings(widgetType('clock')) },
    { id: 'ican1', type: 'ican', x: 0, y: 2, w: 4, h: 2, s: cleanSettings(widgetType('ican')), pin: true },
    { id: 'text1', type: 'text', x: 4, y: 0, w: 8, h: 4, s: cleanSettings(widgetType('text')), pin: true },
  ];
}
/** The teacher's layouts for this class, making the first one if there are none. */
export function ensureLayouts(u, c, name) {
  let list = layoutsOf(c.id, u.id);
  if (!list.length) { createLayout(u, c, { name, widgets: starterWidgets() }); list = layoutsOf(c.id, u.id); }
  return list;
}
/** The layout the teacher sees now: the class's current one if it is theirs, else their last used. */
export function currentLayout(u, c, list = layoutsOf(c.id, u.id)) {
  const st = classState(c.id);
  return list.find(l => l.id === st.layout_id) || [...list].sort((a, b) => b.used_at - a.used_at)[0] || null;
}
export function createLayout(u, c, { name, widgets = [], bg = DEFAULT_BG } = {}) {
  const n = cleanText(name, 40); if (!n) return { error: 'name' };
  const count = q.get('SELECT COUNT(*) n FROM dash_layouts WHERE class_id=? AND owner_id=?', c.id, u.id).n;
  if (count >= MAX_LAYOUTS) return { error: 'tooMany' };
  const id = uid(12), t = now();
  q.run(`INSERT INTO dash_layouts(${LAYOUT_COLS}) VALUES (?,?,?,?,?,?,?,?,?,?)`, id, c.id, u.id, n, JSON.stringify(ownPictures(cleanWidgets(widgets, 'teacher'), u, c)), JSON.stringify(cleanBg(bg, u, c.id)), count, t, t, t);
  // The first layout anyone makes for a class is the one students follow.
  ensureClassRow(c.id);
  if (!classState(c.id).layout_id) useLayout(u, c, id);
  return { layout: getLayout(id) };
}
const ownLayout = (u, c, id) => { const l = getLayout(id); return l && l.class_id === c.id && l.owner_id === u.id ? l : null; };
export function updateLayout(u, c, id, { name, widgets, bg } = {}) {
  const l = ownLayout(u, c, id); if (!l) return { error: 'notFound' };
  const n = name === undefined ? l.name : cleanText(name, 40); if (!n) return { error: 'name' };
  const w = widgets === undefined ? l.widgets : ownPictures(cleanWidgets(widgets, 'teacher'), u, c);
  const b = bg === undefined ? l.bg : cleanBg(bg, u, c.id);
  q.run('UPDATE dash_layouts SET name=?, widgets=?, bg=?, updated_at=? WHERE id=?', n, JSON.stringify(w), JSON.stringify(b), now(), id);
  if (classState(c.id).layout_id === id) publishPins(c.id, w);
  return { layout: getLayout(id) };
}
/** One tap: this layout is now the teacher's screen and the one students follow (its pinned widgets). */
export function useLayout(u, c, id) {
  const l = ownLayout(u, c, id); if (!l) return { error: 'notFound' };
  tx(() => {
    q.run('UPDATE dash_layouts SET used_at=? WHERE id=?', now(), id);
    ensureClassRow(c.id);
    q.run('UPDATE dash_class SET layout_id=? WHERE class_id=?', id, c.id);
    publishPins(c.id, l.widgets);
  });
  return { layout: getLayout(id) };
}
export function deleteLayout(u, c, id) {
  const l = ownLayout(u, c, id); if (!l) return { error: 'notFound' };
  const list = layoutsOf(c.id, u.id);
  if (list.length <= 1) return { error: 'last' };
  tx(() => {
    q.run('DELETE FROM dash_layouts WHERE id=?', id);
    if (classState(c.id).layout_id === id) { const next = list.find(x => x.id !== id); useLayout(u, c, next.id); }
  });
  return { ok: true };
}
/** A picture widget shows only one of this teacher's own pictures for this class (stage 3); any other id is dropped. */
function ownPictures(widgets, u, c) {
  for (const w of widgets) if (w.type === 'picture' && w.s.pic && !q.get("SELECT 1 FROM dash_pictures WHERE id=? AND owner_id=? AND class_id=? AND use='show'", w.s.pic, u.id, c.id)) w.s.pic = '';
  return widgets;
}
/** What students get from the teacher's layout: the pinned widgets only (a picture only once it has its description).
 *  pins_at moves only when the pins really changed, so students' screens redraw only then (stage 3: a teacher working a
 *  tool saves the layout often). */
function publishPins(classId, widgets) {
  const pins = JSON.stringify(widgets.filter(w => w.pin && !TEACHER_ONLY.includes(w.type) && !(w.type === 'picture' && !(w.s.pic && w.s.alt))).map(({ pin, ...w }) => w));
  ensureClassRow(classId);
  if (classState(classId).pins === pins) return;
  q.run('UPDATE dash_class SET pins=?, pins_at=? WHERE class_id=?', pins, Math.max(now(), (classState(classId).pins_at || 0) + 1), classId);
}
export const pinsOf = classId => json(classState(classId).pins, []);

// ---------------------------------------------------------------- student screens
export function studentState(classId, userId) {
  const r = q.get('SELECT widgets, pins, bg FROM dash_students WHERE class_id=? AND user_id=?', classId, userId);
  if (!r) return { widgets: [{ id: 'clock1', type: 'clock', x: 0, y: 0, w: 4, h: 2, s: cleanSettings(widgetType('clock')) }], pins: {}, bg: { kind: 'color', id: 'sky' }, fresh: true };
  return { widgets: json(r.widgets, []), pins: json(r.pins, {}), bg: json(r.bg, DEFAULT_BG) };
}
/** A student saves their screen: their own widgets (types students may add), where they put the pinned ones (a place
 *  only: pinned widgets can't be removed or changed), and their background. */
export function saveStudent(u, c, { widgets, pins, bg } = {}) {
  const old = studentState(c.id, u.id);
  const w = widgets === undefined ? old.widgets : cleanWidgets(widgets, 'student');
  let p = old.pins;
  if (pins !== undefined) {
    p = {};
    const current = new Map(pinsOf(c.id).map(x => [x.id, x]));
    for (const [id, box] of Object.entries(pins && typeof pins === 'object' ? pins : {}).slice(0, MAX_WIDGETS)) {
      const pin = current.get(id); if (!pin || !box || typeof box !== 'object') continue;
      p[id] = cleanBox(widgetType(pin.type), box);
    }
  }
  const b = bg === undefined ? old.bg : cleanBg(bg, u, c.id);
  q.run(`INSERT INTO dash_students(class_id, user_id, widgets, pins, bg, updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(class_id, user_id) DO UPDATE SET widgets=excluded.widgets, pins=excluded.pins, bg=excluded.bg, updated_at=excluded.updated_at`,
  c.id, u.id, JSON.stringify(w), JSON.stringify(p), JSON.stringify(b), now());
  return { state: studentState(c.id, u.id) };
}

// ---------------------------------------------------------------- the school day
export const FALLBACK_TZ = 'America/New_York';
/** Today's date (YYYY-MM-DD) where the class's school is. */
export function dayOf(c, t = now()) {
  const tz = S.zoneOf(S.getSchool(c.school_id)) || FALLBACK_TZ;
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}

// ---------------------------------------------------------------- approved links
export const MAX_LINKS = 50;
/** An approved link: https only, a real host name, no user name or password in it, at most 500 characters. Anything
 *  else (javascript:, data:, http:, file:...) is refused. -> the normalised URL or null. */
export function cleanUrl(v) {
  const s = String(v ?? '').trim();
  if (!s || s.length > 500 || /[\u0000- \u007F-\u009F‪-‮⁦-⁩]/.test(s)) return null;
  let u; try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port && u.port !== '443') return null;
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host) || !host.includes('.') || host.startsWith('.') || host.endsWith('.') || /^[\d.]+$/.test(host)) return null;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
  return u.href;
}
export const linksOf = classId => q.all('SELECT id, url, title, created_at FROM dash_links WHERE class_id=? AND removed_at IS NULL ORDER BY created_at', classId);
export const getLink = (classId, id) => q.get('SELECT * FROM dash_links WHERE id=? AND class_id=? AND removed_at IS NULL', String(id || ''), classId) || null;
export function addLink(u, c, { url, title } = {}) {
  const href = cleanUrl(url); if (!href) return { error: 'url' };
  const name = cleanText(title, 60) || new URL(href).hostname;
  if (linksOf(c.id).length >= MAX_LINKS) return { error: 'tooManyLinks' };
  const dup = linksOf(c.id).find(l => l.url === href); if (dup) return { link: dup };
  const id = uid(12);
  q.run('INSERT INTO dash_links(id, class_id, url, title, added_by, created_at) VALUES (?,?,?,?,?,?)', id, c.id, href, name, u.id, now());
  audit(u.id, 'dash.link_add', c.id, { link: id, host: new URL(href).hostname });
  return { link: getLink(c.id, id) };
}
export function removeLink(u, c, id) {
  const l = getLink(c.id, id); if (!l) return { error: 'notFound' };
  q.run('UPDATE dash_links SET removed_at=? WHERE id=?', now(), l.id);
  // A pushed link that is no longer approved leaves the tray at once.
  q.run("UPDATE dash_pushes SET ended_at=? WHERE class_id=? AND kind='link' AND ref=? AND ended_at IS NULL", now(), c.id, l.id);
  audit(u.id, 'dash.link_remove', c.id, { link: l.id });
  return { ok: true };
}

// ---------------------------------------------------------------- pushes and the tray
export const PUSH_KINDS = ['game', 'live', 'lesson', 'link', 'tool'];
export const MAX_PUSHES_A_DAY = 40;
/** A game students of the class can open: live, and public, shared with the school, or shared with this class. */
export function pushableGame(c, g) {
  if (!g || g.status !== 'published' || !g.published_version_id || g.hidden_reason) return false;
  if (g.visibility === 'public') return true;
  if (g.visibility === 'school') return !!S.membership(c.school_id, g.owner_id);
  if (g.visibility === 'class') return games.gameLiveInClass(g.id, c.id);
  return false;
}
/** The class's open live room (hosted by its teacher): students only ever join, never host. */
export const liveRoom = c => { const s = liveOn() ? openForClass(c.id) : null; return s && s.phase !== 'ended' ? { title: s.title, code: s.code } : null; };
/** Lessons of the class open today. */
export const openLessons = c => L.classLessons(c.id).filter(cl => L.isOpen(cl)).map(cl => ({ id: cl.id, title: cl.title }));

/** What the teacher can send right now: games (search), the open live room, open lessons, approved links. */
export function pushOptions(u, c, text = '') {
  const found = String(text || '').trim()
    ? games.search(u, { text, limit: 30 })
    : [...games.classGames(c.id, { limit: 12 }), ...games.listVisible(u, { official: true, limit: 24 })];
  const seen = new Set(), list = [];
  for (const g of found) { if (seen.has(g.id) || !pushableGame(c, g)) continue; seen.add(g.id); list.push({ id: g.id, title: g.title, icon: g.icon }); if (list.length >= 12) break; }
  return { games: list, live: liveRoom(c), lessons: openLessons(c), links: linksOf(c.id) };
}
export function push(u, c, { kind, ref, state } = {}) {
  if (!PUSH_KINDS.includes(kind)) return { error: 'kind' };
  const day = dayOf(c);
  if (q.get('SELECT COUNT(*) n FROM dash_pushes WHERE class_id=? AND day=?', c.id, day).n >= MAX_PUSHES_A_DAY) return { error: 'tooManyPushes' };
  let title, data = {}, r = String(ref || '');
  if (kind === 'game') { const g = games.getGame(r); if (!pushableGame(c, g)) return { error: 'game' }; title = g.title; }
  else if (kind === 'live') { const room = liveRoom(c); if (!room) return { error: 'noLive' }; title = room.title; r = room.code; }
  else if (kind === 'lesson') { const cl = openLessons(c).find(x => x.id === r); if (!cl) return { error: 'lesson' }; title = cl.title; }
  else if (kind === 'tool') {
    // Stage 3: one of this teacher's teaching tools, as it is on their screen now (state as sent, rebuilt from the tool's
    // spec). Each student opens their own copy; nothing a student does with it comes back.
    const w = teacherWidget(u, c, r, TOOL_IDS); if (!w) return { error: 'tool' };
    data = { type: w.type, state: cleanToolState(w.type, state === undefined ? w.s.state : state) };
    title = w.type;
  } else { const l = getLink(c.id, r); if (!l) return { error: 'link' }; title = l.title; }
  const id = uid(12);
  tx(() => {
    // Older days' pushes are only history nobody reads: keep two weeks.
    q.run('DELETE FROM dash_push_hidden WHERE push_id IN (SELECT id FROM dash_pushes WHERE class_id=? AND created_at<?)', c.id, now() - 14 * 86400e3);
    q.run('DELETE FROM dash_pushes WHERE class_id=? AND created_at<?', c.id, now() - 14 * 86400e3);
    q.run('INSERT INTO dash_pushes(id, class_id, day, kind, ref, title, by_id, created_at, data) VALUES (?,?,?,?,?,?,?,?,?)', id, c.id, day, kind, r, cleanText(title, 80) || '…', u.id, now(), JSON.stringify(data));
  });
  audit(u.id, 'dash.push', c.id, { push: id, kind });
  return { push: id };
}
export function endPush(u, c, id) {
  const r = q.run('UPDATE dash_pushes SET ended_at=? WHERE id=? AND class_id=? AND ended_at IS NULL', now(), String(id || ''), c.id);
  return r.changes ? { ok: true } : { error: 'notFound' };
}
/** Where a push opens, for a student of the class. A live push whose room has closed (or changed) has nowhere to go. */
export function pushHref(c, p) {
  if (p.kind === 'game') { const g = games.getGame(p.ref); return pushableGame(c, g) ? `/play/${g.slug}` : null; }
  if (p.kind === 'live') { const room = liveRoom(c); return room && room.code === p.ref ? `/join#${p.ref}` : null; }
  if (p.kind === 'lesson') return openLessons(c).some(x => x.id === p.ref) ? `/class/${c.id}/lessons/${p.ref}` : null;
  if (p.kind === 'link') return getLink(c.id, p.ref) ? `/class/${c.id}/dashboard/link/${p.ref}` : null;
  // A teaching tool opens on the dashboard itself, as the student's own copy.
  if (p.kind === 'tool') return `#tool-${p.id}`;
  // A quick check opens on the dashboard itself while it is open.
  if (p.kind === 'check') return q.get('SELECT 1 FROM dash_checks WHERE id=? AND class_id=? AND ended_at IS NULL', p.ref, c.id) ? `#check-${p.ref}` : null;
  return null;
}
/** Today's pushes still on (the tray), newest first, each with where it opens. Ones with nowhere to go are left out. */
export function todaysPushes(c, userId = null) {
  const hidden = userId ? new Set(q.all('SELECT h.push_id FROM dash_push_hidden h JOIN dash_pushes p ON p.id=h.push_id WHERE p.class_id=? AND h.user_id=?', c.id, userId).map(r => r.push_id)) : new Set();
  return q.all('SELECT id, kind, ref, title, created_at, data FROM dash_pushes WHERE class_id=? AND day=? AND ended_at IS NULL ORDER BY created_at DESC, rowid DESC', c.id, dayOf(c))
    .map(p => ({ id: p.id, kind: p.kind, title: p.kind === 'tool' ? '' : p.title, at: p.created_at, href: pushHref(c, p), hidden: hidden.has(p.id), ...(p.kind === 'tool' ? { tool: json(p.data, {}) } : {}) }))
    .filter(p => p.href);
}
/** A student hides a push from their banner (or brings it back). It stays in their tray either way. */
export function hidePush(u, c, id, hidden = true) {
  const p = q.get('SELECT id FROM dash_pushes WHERE id=? AND class_id=?', String(id || ''), c.id); if (!p) return { error: 'notFound' };
  if (hidden) q.run('INSERT OR IGNORE INTO dash_push_hidden(push_id, user_id, at) VALUES (?,?,?)', p.id, u.id, now());
  else q.run('DELETE FROM dash_push_hidden WHERE push_id=? AND user_id=?', p.id, u.id);
  return { ok: true };
}

// ---------------------------------------------------------------- Eyes up
/** How long Eyes up stays on if nobody ends it. */
export const EYES_MS = 3 * 60e3;
export function setEyes(u, c, on) {
  ensureClassRow(c.id);
  const t = now();
  q.run('UPDATE dash_class SET eyes_until=?, eyes_by=?, eyes_at=? WHERE class_id=?', on ? t + EYES_MS : 0, u.id, t, c.id);
  if (on) audit(u.id, 'dash.eyes', c.id, {});
  return { eyes: eyesOf(c.id, t) };
}
export const eyesOf = (classId, t = now()) => { const st = classState(classId); return st.eyes_until > t ? { until: st.eyes_until } : null; };

/** What a dashboard checks every few seconds: Eyes up, today's pushes, when the pinned widgets last changed, and (stage
 *  2) the server's clock, the teacher's timers, the help queue, quick checks and the weather. A student gets only what
 *  is theirs: their own place in the help queue and their own answers, never anyone else's. */
export function liveState(c, u, role) {
  const st = classState(c.id), t = now();
  const teacher = role === 'teacher';
  const pins = json(st.pins, []);
  const shown = teacher ? [...((currentLayout(u, c) || {}).widgets || []), ...pins] : pins;
  const timers = json(st.timers, {});
  const pinnedTimers = new Set(pins.filter(w => TIMER_TYPES.includes(w.type)).map(w => w.id));
  const weather = {};
  for (const w of shown) if (w.type === 'weather' && w.s && w.s.place) weather[placeKey(w.s.place)] = weatherFor(w.s.place, t);
  return {
    eyes: eyesOf(c.id, t), pushes: todaysPushes(c, teacher ? null : u.id), pinsAt: st.pins_at, day: dayOf(c), now: t,
    timers: teacher ? timers : Object.fromEntries(Object.entries(timers).filter(([id]) => pinnedTimers.has(id))),
    help: teacher ? { queue: helpQueue(c) } : { mine: helpMine(c, u.id) },
    checks: checksFor(c, u, role),
    weather,
    ...(teacher ? { size: studentsOf(c).length } : {}),
    ...stage5Live(c, u, role, shown),
  };
}

// ================================================================ stage 2: everyday widgets
/** The class's active students as everyone in class sees them: their Oomba name (display name), never the roster
 *  (real) name. Used by the picker, the help queue and who answered a check. */
export const studentsOf = c => S.roster(c.id).filter(r => r.role === 'student').map(r => ({ id: r.id, name: r.display_name }));
/** One of this teacher's widgets (any of their layouts for the class) of one of these types. */
function teacherWidget(u, c, wid, types) {
  for (const l of layoutsOf(c.id, u.id)) { const w = l.widgets.find(x => x.id === String(wid || '')); if (w && types.includes(w.type)) return w; }
  return null;
}

// ---------------------------------------------------------------- timers and stopwatches
// A teacher's timer is stored as a start time and a duration ({ mode, dur, base, start, on }), never a ticking value:
// every screen works out what is left from the server's clock (liveState.now), so they all agree.
export const TIMER_TYPES = ['timer', 'stopwatch'];
export const MAX_TIMER_MS = 3 * 3600e3;
/** What a timer shows at server time t: { elapsed, left (countdowns), done }. */
export function timerView(st, t = now()) {
  const elapsed = Math.max(0, (st.base || 0) + (st.on ? t - st.start : 0));
  if (st.mode !== 'down') return { elapsed, left: null, done: false };
  const left = Math.max(0, st.dur - elapsed);
  return { elapsed: Math.min(elapsed, st.dur), left, done: left === 0 };
}
export function timerAction(u, c, wid, { action, ms } = {}, t = now()) {
  const w = teacherWidget(u, c, wid, TIMER_TYPES); if (!w) return { error: 'notFound' };
  const all = json(classState(c.id).timers, {});
  const down = w.type === 'timer';
  const cur = all[w.id] && all[w.id].mode === (down ? 'down' : 'up') ? all[w.id] : { mode: down ? 'down' : 'up', dur: down ? (w.s.minutes || 5) * 60e3 : 0, base: 0, start: 0, on: false };
  const v = timerView(cur, t);
  if (action === 'start') { if (!cur.on) { if (down && v.done) cur.base = 0; cur.start = t; cur.on = true; } }
  else if (action === 'pause') { if (cur.on) { cur.base = v.elapsed; cur.on = false; cur.start = 0; } }
  else if (action === 'reset') Object.assign(cur, { base: 0, on: false, start: 0 });
  else if (action === 'set' && down) {
    const n = Math.round(Number(ms));
    if (!Number.isFinite(n) || n < 1000 || n > MAX_TIMER_MS) return { error: 'timer' };
    Object.assign(cur, { dur: n, base: 0, on: false, start: 0 });
  } else return { error: 'timer' };
  // Keep only timers whose widget is still on one of the class's layouts.
  const ids = new Set(q.all('SELECT widgets FROM dash_layouts WHERE class_id=?', c.id).flatMap(r => json(r.widgets, []).map(x => x.id)));
  const next = Object.fromEntries(Object.entries(all).filter(([id]) => ids.has(id) && id !== w.id));
  next[w.id] = cur;
  ensureClassRow(c.id);
  q.run('UPDATE dash_class SET timers=? WHERE class_id=?', JSON.stringify(next), c.id);
  return { timer: cur, now: t };
}

// ---------------------------------------------------------------- the random student picker (teacher only)
function pickerState(c) {
  const p = json(classState(c.id).picker, {});
  return p && p.day === dayOf(c) ? { picked: [], away: [], last: null, ...p } : { day: dayOf(c), picked: [], away: [], last: null };
}
/** The class's students (their Oomba names), who was picked this round and who is away today. */
export function pickerView(c) {
  const p = pickerState(c), kids = studentsOf(c), here = new Set(kids.map(k => k.id));
  return { students: kids, picked: p.picked.filter(id => here.has(id)), away: p.away.filter(id => here.has(id)) };
}
export function pickerAction(u, c, { action, user, on = true, norepeat = true } = {}) {
  const p = pickerState(c), kids = studentsOf(c);
  let pick = null;
  if (action === 'pick') {
    const away = new Set(p.away);
    let pool = kids.filter(k => !away.has(k.id));
    if (!pool.length) return { error: 'nobody' };
    if (norepeat) {
      const fresh = pool.filter(k => !p.picked.includes(k.id));
      if (!fresh.length) p.picked = [];   // everyone has had a turn: a new round
      else pool = fresh;
    }
    // Not the same student twice in a row when anyone else is left.
    if (pool.length > 1 && p.last) pool = pool.filter(k => k.id !== p.last);
    pick = pool[crypto.randomInt(pool.length)];
    if (!p.picked.includes(pick.id)) p.picked.push(pick.id);
    p.last = pick.id;
  } else if (action === 'away') {
    const k = kids.find(x => x.id === String(user || '')); if (!k) return { error: 'notFound' };
    p.away = p.away.filter(id => id !== k.id); if (on) p.away.push(k.id);
  } else if (action === 'reset') { p.picked = []; p.last = null; }
  else return { error: 'kind' };
  ensureClassRow(c.id);
  q.run('UPDATE dash_class SET picker=? WHERE class_id=?', JSON.stringify(p), c.id);
  return { ...pickerView(c), ...(pick ? { pick } : {}) };
}

// ---------------------------------------------------------------- the help queue
// Students tap "I need help" or "I'm done" (fixed buttons, no text). The teacher sees the queue in order; a student
// sees only their own place. Today only.
export const HELP_KINDS = ['help', 'done'];
export function helpQueue(c) {
  return q.all(`SELECT h.user_id id, u.display_name name, h.kind, h.at FROM dash_help h JOIN users u ON u.id=h.user_id
    JOIN class_members m ON m.class_id=h.class_id AND m.user_id=h.user_id AND m.status='active' AND m.role='student'
    WHERE h.class_id=? AND h.day=? ORDER BY h.at, h.rowid`, c.id, dayOf(c));
}
export function helpMine(c, userId) {
  const list = helpQueue(c), me = list.find(x => x.id === userId);
  if (!me) return null;
  return { kind: me.kind, ...(me.kind === 'help' ? { place: list.filter(x => x.kind === 'help').findIndex(x => x.id === userId) + 1 } : {}) };
}
export function helpAsk(u, c, kind) {
  if (kind === 'cancel') { q.run('DELETE FROM dash_help WHERE class_id=? AND user_id=?', c.id, u.id); return { mine: null }; }
  if (!HELP_KINDS.includes(kind)) return { error: 'kind' };
  const day = dayOf(c), old = q.get('SELECT kind, day FROM dash_help WHERE class_id=? AND user_id=?', c.id, u.id);
  if (!(old && old.kind === kind && old.day === day)) {
    q.run(`INSERT INTO dash_help(class_id, user_id, kind, day, at) VALUES (?,?,?,?,?) ON CONFLICT(class_id, user_id) DO UPDATE SET kind=excluded.kind, day=excluded.day, at=excluded.at`, c.id, u.id, kind, day, now());
  }
  return { mine: helpMine(c, u.id) };
}
/** The teacher: next (the first who needs help leaves the queue), remove one, or clear (help, done or both). */
export function helpTeacher(u, c, { action, user, kind } = {}) {
  const day = dayOf(c);
  if (action === 'next') {
    const first = helpQueue(c).find(x => x.kind === 'help');
    if (first) q.run('DELETE FROM dash_help WHERE class_id=? AND user_id=?', c.id, first.id);
    return { served: first ? { id: first.id, name: first.name } : null, queue: helpQueue(c) };
  }
  if (action === 'remove') q.run('DELETE FROM dash_help WHERE class_id=? AND user_id=?', c.id, String(user || ''));
  else if (action === 'clear') {
    if (HELP_KINDS.includes(kind)) q.run('DELETE FROM dash_help WHERE class_id=? AND kind=?', c.id, kind);
    else q.run('DELETE FROM dash_help WHERE class_id=?', c.id);
  } else return { error: 'kind' };
  q.run('DELETE FROM dash_help WHERE class_id=? AND day<>?', c.id, day);
  return { queue: helpQueue(c) };
}

// ---------------------------------------------------------------- quick checks (broadcast)
// The teacher sends a quick check; it reaches student screens as a push (banner and tray). Students answer with a tap:
// thumbs (up, sideways, down), fist to five (0-5), multiple choice (the teacher's options) or a 1-5 scale. No free
// text. The teacher sees totals live and, on their own tap, who answered what; students never see anyone else's
// answer; the projector shows totals only. Kept for the school day unless the teacher saves them. Never sent to an AI.
export const CHECK_KINDS = ['thumbs', 'fist', 'choice', 'scale'];
export const MAX_OPTIONS = 6;
const choicesOf = ch => (ch.kind === 'thumbs' ? 3 : ch.kind === 'fist' ? 6 : ch.kind === 'scale' ? 5 : ch.options.length);
const readCheck = r => (r ? { ...r, options: json(r.options, []) } : null);
const getCheck = (c, id) => readCheck(q.get('SELECT * FROM dash_checks WHERE id=? AND class_id=?', String(id || ''), c.id));
/** Unsaved checks from earlier days (and their answers) are gone. */
function dropOldChecks(c) {
  const day = dayOf(c);
  q.run('DELETE FROM dash_answers WHERE check_id IN (SELECT id FROM dash_checks WHERE class_id=? AND day<>? AND saved_at IS NULL)', c.id, day);
  q.run('DELETE FROM dash_checks WHERE class_id=? AND day<>? AND saved_at IS NULL', c.id, day);
}
export function createCheck(u, c, { kind, question, options } = {}) {
  if (!CHECK_KINDS.includes(kind)) return { error: 'checkKind' };
  const opts = kind === 'choice' ? (Array.isArray(options) ? options : []).map(o => cleanText(o, 60)).filter(Boolean).slice(0, MAX_OPTIONS) : [];
  if (kind === 'choice' && opts.length < 2) return { error: 'checkOptions' };
  const day = dayOf(c);
  if (q.get('SELECT COUNT(*) n FROM dash_pushes WHERE class_id=? AND day=?', c.id, day).n >= MAX_PUSHES_A_DAY) return { error: 'tooManyPushes' };
  const id = uid(12), t = now(), text = cleanText(question, 120);
  tx(() => {
    dropOldChecks(c);
    // One open check at a time: a new one ends the last.
    for (const old of q.all('SELECT id FROM dash_checks WHERE class_id=? AND ended_at IS NULL', c.id)) endCheckRow(c, old.id, t);
    q.run('INSERT INTO dash_checks(id, class_id, day, kind, question, options, by_id, created_at) VALUES (?,?,?,?,?,?,?,?)', id, c.id, day, kind, text, JSON.stringify(opts), u.id, t);
    q.run("INSERT INTO dash_pushes(id, class_id, day, kind, ref, title, by_id, created_at) VALUES (?,?,?,'check',?,?,?,?)", uid(12), c.id, day, id, text, u.id, t);
  });
  audit(u.id, 'dash.check', c.id, { check: id, kind });
  return { check: id };
}
function endCheckRow(c, id, t = now()) {
  q.run('UPDATE dash_checks SET ended_at=? WHERE id=? AND class_id=? AND ended_at IS NULL', t, id, c.id);
  q.run("UPDATE dash_pushes SET ended_at=? WHERE class_id=? AND kind='check' AND ref=? AND ended_at IS NULL", t, c.id, id);
}
export function endCheck(u, c, id) { const ch = getCheck(c, id); if (!ch) return { error: 'notFound' }; endCheckRow(c, ch.id); return { ok: true }; }
export function saveCheck(u, c, id, saved = true) {
  const ch = getCheck(c, id); if (!ch) return { error: 'notFound' };
  q.run('UPDATE dash_checks SET saved_at=? WHERE id=?', saved ? now() : null, ch.id);
  return { ok: true };
}
/** A student's tap. Only on an open check of today, only a value the check has. */
export function answerCheck(u, c, id, value) {
  const ch = getCheck(c, id);
  if (!ch || ch.ended_at || ch.day !== dayOf(c)) return { error: 'checkClosed' };
  const v = Number(value);
  if (!Number.isInteger(v) || v < 0 || v >= choicesOf(ch)) return { error: 'checkValue' };
  q.run('INSERT INTO dash_answers(check_id, user_id, value, at) VALUES (?,?,?,?) ON CONFLICT(check_id, user_id) DO UPDATE SET value=excluded.value, at=excluded.at', ch.id, u.id, v, now());
  return { mine: v };
}
/** Answers of current students only (one who left the class no longer counts). */
const answersOf = (c, id) => q.all(`SELECT a.user_id, a.value FROM dash_answers a JOIN class_members m ON m.class_id=? AND m.user_id=a.user_id AND m.status='active' AND m.role='student' WHERE a.check_id=?`, c.id, id);
const tallyOf = (c, ch) => { const n = new Array(choicesOf(ch)).fill(0); const a = answersOf(c, ch.id); for (const x of a) if (x.value < n.length) n[x.value]++; return { tally: n, n: a.length }; };
/** Teacher: today's checks (newest first) with totals, no names. Student: today's open checks with their own answer. */
export function checksFor(c, u, role) {
  if (role === 'teacher') dropOldChecks(c);
  const list = q.all('SELECT * FROM dash_checks WHERE class_id=? AND day=? ORDER BY created_at DESC, rowid DESC LIMIT 12', c.id, dayOf(c)).map(readCheck);
  if (role === 'teacher') return list.map(ch => ({ id: ch.id, kind: ch.kind, q: ch.question, options: ch.options, ...tallyOf(c, ch), open: !ch.ended_at, saved: !!ch.saved_at, at: ch.created_at }));
  return list.filter(ch => !ch.ended_at).map(ch => {
    const mine = q.get('SELECT value FROM dash_answers WHERE check_id=? AND user_id=?', ch.id, u.id);
    return { id: ch.id, kind: ch.kind, q: ch.question, options: ch.options, mine: mine ? mine.value : null, at: ch.created_at };
  });
}
/** The teacher only: who answered what (Oomba names), and who hasn't answered yet. */
export function checkNames(c, id) {
  const ch = getCheck(c, id); if (!ch) return { error: 'notFound' };
  const kids = studentsOf(c), byId = new Map(kids.map(k => [k.id, k.name]));
  const groups = Array.from({ length: choicesOf(ch) }, () => []);
  const answered = new Set();
  for (const a of answersOf(c, ch.id)) if (groups[a.value] && byId.has(a.user_id)) { groups[a.value].push(byId.get(a.user_id)); answered.add(a.user_id); }
  return { groups, missing: kids.filter(k => !answered.has(k.id)).map(k => k.name) };
}
/** Checks the teacher saved (any day), newest first, totals only. */
export const savedChecks = c => q.all('SELECT * FROM dash_checks WHERE class_id=? AND saved_at IS NOT NULL ORDER BY created_at DESC LIMIT 40', c.id).map(readCheck)
  .map(ch => ({ id: ch.id, kind: ch.kind, q: ch.question, options: ch.options, day: ch.day, ...tallyOf(c, ch) }));

// ---------------------------------------------------------------- weather (Open-Meteo, no key)
// The teacher types a city; the server looks it up (geocoding-api.open-meteo.com) and the widget keeps the place's name
// and coordinates. Never the browser's or a student's location. The server fetches the forecast (api.open-meteo.com),
// keeps it per place for WEATHER_MS, and a screen gets it with its live state. A failure or a slow answer is "resting".
export const WEATHER_MS = 20 * 60e3, RESTING_MS = 5 * 60e3, WEATHER_STALE_MS = 2 * 3600e3, MAX_PLACES_CACHED = 500;
let weatherTimeout = 6000;
let fetchFn = (...a) => fetch(...a);
/** Tests swap the network out (and back with no argument). */
export function _setWeatherFetch(f, timeoutMs = 6000) { fetchFn = f || ((...a) => fetch(...a)); weatherTimeout = timeoutMs; weatherCache.clear(); }
export const weatherCache = new Map();
export const placeKey = p => `${Number(p.lat).toFixed(2)},${Number(p.lon).toFixed(2)}`;
/** A WMO weather code -> the word group the widget shows (dash.w.weather.<group>). */
export function weatherGroup(code, day = true) {
  const n = Number(code);
  if (n === 0 || n === 1) return day ? 'clear' : 'clearNight';
  if (n === 2) return 'partly';
  if (n === 3) return 'cloudy';
  if (n === 45 || n === 48) return 'fog';
  if (n >= 51 && n <= 57) return 'drizzle';
  if ((n >= 61 && n <= 67) || (n >= 80 && n <= 82)) return 'rain';
  if ((n >= 71 && n <= 77) || n === 85 || n === 86) return 'snow';
  if (n >= 95) return 'storm';
  return 'cloudy';
}
async function getJson(url) {
  const res = await fetchFn(url, { signal: AbortSignal.timeout(weatherTimeout), headers: { accept: 'application/json' } });
  if (!res || !res.ok) throw new Error(`weather ${res ? res.status : 'no answer'}`);
  return res.json();
}
/** Fetch one place's weather now (temperatures in °C; the browser converts). Never throws. */
export async function refreshWeather(place, t = now()) {
  const p = cleanPlace(place); if (!p) return null;
  const key = placeKey(p), old = weatherCache.get(key);
  weatherCache.set(key, { ...(old || {}), pending: true, until: t + RESTING_MS });
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
    const j = await Promise.race([getJson(url), new Promise((_, bad) => setTimeout(() => bad(new Error('weather timeout')), weatherTimeout + 50).unref?.())]);
    const cur = j && j.current, d = j && j.daily;
    const temp = Number(cur && cur.temperature_2m);
    if (!Number.isFinite(temp)) throw new Error('weather: no temperature');
    const day = cur.is_day !== 0;
    const data = { t: temp, hi: Number(d && d.temperature_2m_max && d.temperature_2m_max[0]), lo: Number(d && d.temperature_2m_min && d.temperature_2m_min[0]), code: Number(cur.weather_code), day, group: weatherGroup(cur.weather_code, day), at: t };
    if (!Number.isFinite(data.hi)) data.hi = null; if (!Number.isFinite(data.lo)) data.lo = null;
    weatherCache.set(key, { data, until: t + WEATHER_MS, pending: false });
  } catch {
    // Keep a recent forecast through a short outage; otherwise the widget says "Weather is resting".
    const keep = old && old.data && t - old.data.at < WEATHER_STALE_MS ? old.data : null;
    weatherCache.set(key, { data: keep, resting: !keep, until: t + RESTING_MS, pending: false });
  }
  if (weatherCache.size > MAX_PLACES_CACHED) weatherCache.delete(weatherCache.keys().next().value);
  return weatherCache.get(key);
}
/** What a screen shows for a place right now: the cached forecast, { resting }, or { loading } while the first fetch
 *  runs. A stale entry is refreshed in the background (the live answer never waits for the network). */
export function weatherFor(place, t = now()) {
  const p = cleanPlace(place); if (!p) return { resting: true };
  const e = weatherCache.get(placeKey(p));
  if ((!e || e.until <= t) && !(e && e.pending)) refreshWeather(p, t).catch(() => {});
  const cur = weatherCache.get(placeKey(p));
  if (cur && cur.data) return cur.data;
  return cur && cur.resting ? { resting: true } : { loading: true };
}
/** The teacher types a city: up to 6 places (name, region, country and coordinates), or { error: 'resting' }. */
export async function findPlaces(text, lang = 'en') {
  const name = cleanText(text, 60);
  if (name.length < 2) return { places: [] };
  try {
    const j = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=6&language=${encodeURIComponent(String(lang).slice(0, 2))}&format=json`);
    const places = (j && Array.isArray(j.results) ? j.results : []).map(r => cleanPlace({ name: [r.name, r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude })).filter(Boolean);
    return { places };
  } catch { return { error: 'resting' }; }
}

// ---------------------------------------------------------------- QR codes
/** Where a QR widget's target goes, if it is still allowed: one of the class's approved links (through the class's own
 *  link address, so a removed link stops working), the class's live game join, an open class lesson, or a game every
 *  student can open. -> { url, text (short, shown under the code), title } or null. */
export function qrTarget(c, target, origin) {
  const tg = cleanTarget(target); if (!tg) return null;
  const short = s => { const x = String(s).replace(/^https?:\/\//, '').replace(/\/$/, ''); return x.length > 48 ? `${x.slice(0, 47)}…` : x; };
  if (tg.kind === 'link') { const l = getLink(c.id, tg.ref); if (!l || !cleanUrl(l.url)) return null; return { url: `${origin}/class/${c.id}/dashboard/link/${l.id}`, text: short(l.url), title: l.title }; }
  if (tg.kind === 'live') { const room = liveRoom(c); if (!room) return null; const url = `${origin}/join#${room.code}`; return { url, text: short(url), title: room.title }; }
  if (tg.kind === 'lesson') { const cl = openLessons(c).find(x => x.id === tg.ref); if (!cl) return null; const url = `${origin}/class/${c.id}/lessons/${cl.id}`; return { url, text: short(url), title: cl.title }; }
  if (tg.kind === 'game') { const g = games.getGame(tg.ref); if (!pushableGame(c, g)) return null; const url = `${origin}/play/${g.slug}`; return { url, text: short(url), title: g.title }; }
  return null;
}

// ---------------------------------------------------------------- Oomba tiles
/** Tiles as a reader of the class sees them: only games every student can open and the class's open lessons. Titles
 *  and icons only: no prices, plans or upgrade words exist here. */
export function resolveTiles(c, tiles) {
  const out = [];
  for (const x of cleanTiles(tiles)) {
    if (x.kind === 'game') { const g = games.getGame(x.ref); if (pushableGame(c, g)) out.push({ kind: 'game', ref: g.id, title: g.title, icon: g.icon || '🎮', href: `/play/${g.slug}` }); }
    else { const cl = openLessons(c).find(l => l.id === x.ref); if (cl) out.push({ kind: 'lesson', ref: cl.id, title: cl.title, icon: '📚', href: `/class/${c.id}/lessons/${cl.id}` }); }
  }
  return out;
}

/** Stage 4, "Practice it": for each teaching tool, the official games that practise it and that every student of the
 *  class can open (PRACTICE), at most two: { tool: [{ title, icon, href }] }. Tools without one are left out. */
export function practiceFor(c) {
  const out = {}, seen = new Map();
  for (const [tool, slugs] of Object.entries(PRACTICE)) {
    const list = [];
    for (const slug of slugs) {
      if (!seen.has(slug)) { const g = games.getGameBySlug(slug); seen.set(slug, g && isOfficial(g) && pushableGame(c, g) ? { title: g.title, icon: g.icon || '🎮', href: `/play/${g.slug}` } : null); }
      if (seen.get(slug)) list.push(seen.get(slug));
    }
    if (list.length) out[tool] = list.slice(0, 2);
  }
  return out;
}

// ---------------------------------------------------------------- background pictures
export const PIC_DIR = () => path.join(config.dataDir, 'dash-pictures');
export const picFile = id => path.join(PIC_DIR(), `${String(id).replace(/[^A-Za-z0-9_-]/g, '')}.jpg`);
/** A background is shown big, so it may be larger than a profile photo; the browser makes it at most 1600 wide. */
export const PIC_LIMITS = { maxBytes: 900 * 1024, maxSide: 2000 };
export const PICS_KEPT = 4;
/** Stage 3: pictures a teacher shows in a Picture widget (use 'show'), kept apart from backgrounds (use 'bg'). */
export const SHOW_PICS_KEPT = 12;
/** Store a picture: the profile photo's file checks (JPEG only, size, metadata removed). Never sent to an AI or anywhere
 *  else. use: 'bg' (a background, anyone on the screen) or 'show' (a Picture widget, the class's teacher only: the route
 *  checks). Keeps the newest PICS_KEPT backgrounds / SHOW_PICS_KEPT shown pictures per person per class. -> { id } */
export function savePicture(u, c, bytes, { use = 'bg' } = {}) {
  const clean = cleanJpeg(bytes, PIC_LIMITS);
  const id = uid(16), kind = use === 'show' ? 'show' : 'bg';
  fs.mkdirSync(PIC_DIR(), { recursive: true });
  fs.writeFileSync(picFile(id), clean);
  q.run('INSERT INTO dash_pictures(id, owner_id, class_id, bytes, created_at, use) VALUES (?,?,?,?,?,?)', id, u.id, c.id, clean.length, now(), kind);
  const old = q.all('SELECT id FROM dash_pictures WHERE owner_id=? AND class_id=? AND use=? ORDER BY created_at DESC, rowid DESC', u.id, c.id, kind).slice(kind === 'show' ? SHOW_PICS_KEPT : PICS_KEPT);
  for (const p of old) dropPicture(p.id);
  audit(u.id, 'dash.picture', c.id, { picture: id, bytes: clean.length, use: kind });
  return { id };
}
function dropPicture(id) {
  try { fs.unlinkSync(picFile(id)); } catch { /* already gone */ }
  q.run('DELETE FROM dash_pictures WHERE id=?', id);
  // A screen that used it goes back to the plain background.
  const plain = JSON.stringify(DEFAULT_BG), mine = JSON.stringify({ kind: 'pic', id });
  q.run('UPDATE dash_layouts SET bg=? WHERE bg=?', plain, mine);
  q.run('UPDATE dash_students SET bg=? WHERE bg=?', plain, mine);
}
/** Who can fetch a picture: its owner, and the teachers of the class it was added for while the owner is still in that
 *  class. Stage 3: also the class's students, for a picture its teacher shows in a Picture widget pinned on student
 *  screens right now (with its description). Nobody else: not another class's students or teacher, not a school admin,
 *  not a visitor; never a background picture to a student. */
export function canSeePicture(viewer, pic) {
  if (!viewer || !pic || viewer.is_guest) return false;
  if (viewer.id === pic.owner_id) return true;
  const c = S.getClass(pic.class_id);
  if (!c) return false;
  if (S.teaches(viewer, c.id) && ['teacher', 'admin'].includes(S.roleIn(viewer, c.school_id)) && !!S.classMember(c.id, pic.owner_id)) return true;
  return pic.use === 'show' && isStudent(viewer, c) && isTeacher(getUserLite(pic.owner_id), c) && pinsOf(c.id).some(w => w.type === 'picture' && w.s && w.s.pic === pic.id && w.s.alt);
}
const getUserLite = id => q.get('SELECT * FROM users WHERE id=?', id) || null;
export const getPicture = id => q.get('SELECT * FROM dash_pictures WHERE id=?', String(id || '')) || null;
/** The class's students' background pictures in use, for its teacher to see and take down. */
export const studentPictures = c => q.all(`SELECT p.id, p.owner_id, p.created_at, u.display_name, sm.roster_name FROM dash_students d
    JOIN dash_pictures p ON p.id=json_extract(d.bg, '$.id') AND json_extract(d.bg, '$.kind')='pic' AND p.owner_id=d.user_id AND p.class_id=d.class_id
    JOIN users u ON u.id=d.user_id JOIN class_members m ON m.class_id=d.class_id AND m.user_id=d.user_id AND m.status='active' AND m.role='student'
    LEFT JOIN school_members sm ON sm.school_id=? AND sm.user_id=d.user_id
    WHERE d.class_id=? ORDER BY p.created_at DESC`, c.school_id, c.id);
/** The owner, or a teacher of the class for a student's picture, takes a picture down. */
export function removePicture(u, c, id) {
  const p = getPicture(id);
  if (!p || p.class_id !== c.id || !(p.owner_id === u.id || (isTeacher(u, c) && canSeePicture(u, p)))) return { error: 'notFound' };
  dropPicture(p.id);
  audit(u.id, 'dash.picture_removed', c.id, { picture: p.id, owner: p.owner_id });
  return { ok: true };
}
export { PhotoError };

// ================================================================ stage 5 (docs/decisions.md "Classroom dashboards, stage 5")
/** What stage 5's widgets on this screen need from the server, and nothing more: the hall pass (the teacher: today's
 *  requests and who is out; a student: only their own pass), class jobs (the names in order, in the class only), points
 *  for each student (the teacher: everyone's; a student: their own and the class's total, never a ranking) and the mood
 *  check-in (the teacher: the counts; a student: their own). */
function stage5Live(c, u, role, shown) {
  const teacher = role === 'teacher', has = type => shown.some(w => w.type === type), out = {};
  if (has('hallpass')) out.pass = teacher ? { list: passList(c) } : { mine: passMine(c, u.id) };
  const jobs = shown.filter(w => w.type === 'jobs');
  if (jobs.length) {
    const kids = studentsOf(c);
    out.crew = Object.fromEntries(jobs.map(w => [w.id, crewPeople(kids, w.s && w.s.crew).map(k => (teacher ? k : { name: k.name }))]));
  }
  if (shown.some(w => w.type === 'score' && w.s && w.s.mode === 'students')) out.points = teacher ? pointsAll(c) : pointsMine(c, u.id);
  if (has('mood')) out.mood = teacher ? moodCounts(c) : { mine: moodMine(c, u.id) };
  return out;
}

// ---------------------------------------------------------------- hall pass
// A student asks for a pass to one of the places the teacher offers (fixed buttons, no text). The teacher approves or
// declines; an approved pass shows who is out and since when. One out at a time, if the teacher wants. A student sees
// only their own pass. Rows are for today only: yesterday's go whenever the class's passes are read, and a pass ends
// (its row goes) when the student is back.
export const PASS_STATES = ['asked', 'out', 'declined'];
/** The hall pass widget students see (the first one pinned), or null: no pinned pass, no asking. */
const pinnedPass = c => pinsOf(c.id).find(w => w.type === 'hallpass') || null;
/** The pass settings the teacher works with: the pinned one, else the one on their screen, else the defaults. */
function passSettings(u, c) {
  const w = pinnedPass(c) || ((currentLayout(u, c) || {}).widgets || []).find(x => x.type === 'hallpass');
  return w ? cleanSettings(widgetType('hallpass'), w.s) : cleanSettings(widgetType('hallpass'), {});
}
/** Today only: older passes are gone (any class, after 36 hours, too: a class nobody opens keeps nothing). */
function dropOldPasses(c) {
  q.run('DELETE FROM dash_passes WHERE class_id=? AND day<>?', c.id, dayOf(c));
  q.run('DELETE FROM dash_passes WHERE asked_at<?', now() - 36 * 3600e3);
}
export function passList(c) {
  dropOldPasses(c);
  return q.all(`SELECT p.id, p.user_id uid, u.display_name name, p.place, p.state, p.asked_at, p.out_at FROM dash_passes p JOIN users u ON u.id=p.user_id
    JOIN class_members m ON m.class_id=p.class_id AND m.user_id=p.user_id AND m.status='active' AND m.role='student'
    WHERE p.class_id=? AND p.state IN ('asked','out') ORDER BY p.asked_at, p.rowid`, c.id)
    .map(r => ({ id: r.id, name: r.name, place: r.place, state: r.state, at: r.state === 'out' ? r.out_at : r.asked_at }));
}
export function passMine(c, userId) {
  dropOldPasses(c);
  const r = q.get('SELECT id, place, state, asked_at, out_at FROM dash_passes WHERE class_id=? AND user_id=?', c.id, userId);
  return r ? { place: r.place, state: r.state, at: r.state === 'out' ? r.out_at : r.asked_at } : null;
}
/** A student: ask (place), cancel a request, say they're back, or dismiss "not right now". */
export function passStudent(u, c, { action, place } = {}) {
  dropOldPasses(c);
  const mine = q.get('SELECT * FROM dash_passes WHERE class_id=? AND user_id=?', c.id, u.id);
  if (action === 'ask') {
    const w = pinnedPass(c); if (!w) return { error: 'noPass' };
    const s = cleanSettings(widgetType('hallpass'), w.s);
    if (!s.places.includes(place)) return { error: 'passPlace' };
    if (mine && mine.state === 'out') return { error: 'passOut' };
    q.run(`INSERT INTO dash_passes(id, class_id, user_id, place, day, state, asked_at, out_at) VALUES (?,?,?,?,?,'asked',?,NULL)
      ON CONFLICT(class_id, user_id) DO UPDATE SET id=excluded.id, place=excluded.place, day=excluded.day, state='asked', asked_at=excluded.asked_at, out_at=NULL`, uid(12), c.id, u.id, place, dayOf(c), now());
  } else if (action === 'cancel' || action === 'back' || action === 'ok') {
    if (mine) q.run('DELETE FROM dash_passes WHERE class_id=? AND user_id=?', c.id, u.id);
  } else return { error: 'kind' };
  return { mine: passMine(c, u.id) };
}
/** The teacher: approve or decline a request, mark someone back, or clear today's passes. */
export function passTeacher(u, c, { action, pass } = {}) {
  dropOldPasses(c);
  const p = q.get('SELECT * FROM dash_passes WHERE id=? AND class_id=?', String(pass || ''), c.id);
  if (action === 'clear') q.run('DELETE FROM dash_passes WHERE class_id=?', c.id);
  else if (!p) return { error: 'notFound' };
  else if (action === 'approve') {
    if (p.state !== 'asked') return { error: 'notFound' };
    if (passSettings(u, c).oneOut && q.get("SELECT 1 FROM dash_passes WHERE class_id=? AND state='out'", c.id)) return { error: 'oneOut' };
    q.run("UPDATE dash_passes SET state='out', out_at=? WHERE id=?", now(), p.id);
  } else if (action === 'decline') {
    if (p.state !== 'asked') return { error: 'notFound' };
    q.run("UPDATE dash_passes SET state='declined' WHERE id=?", p.id);
  } else if (action === 'back') q.run('DELETE FROM dash_passes WHERE id=?', p.id);
  else return { error: 'kind' };
  return { list: passList(c) };
}

// ---------------------------------------------------------------- class jobs
/** The class's students in job order: the saved order (ids still in the class), then anyone new, by Oomba name. */
export function crewPeople(kids, crew) {
  const order = cleanCrew(crew).order, byId = new Map(kids.map(k => [k.id, k]));
  const first = order.filter(id => byId.has(id)).map(id => byId.get(id));
  const seen = new Set(first.map(k => k.id));
  const rest = kids.filter(k => !seen.has(k.id)).sort((a, b) => String(a.name).localeCompare(String(b.name)) || (a.id < b.id ? -1 : 1));
  return [...first, ...rest];
}
/** Who does job i this week: people in order, turned by shift. More jobs than people: the rest are open; more people
 *  than jobs: the rest get a turn as the chart turns. -> one person (or null) per job. */
export function jobAssign(jobCount, people, shift = 0) {
  const n = people.length;
  return Array.from({ length: jobCount }, (_, i) => (i < n ? people[((i + shift) % n + n) % n] : null));
}

// ---------------------------------------------------------------- points for each student (positive only)
// The teacher gives a point with a reason from a fixed list. There is no minus: a point given by mistake can be taken
// back once (Undo), never below zero. A student sees only their own total and the class's; nobody sees a ranking.
const pointRows = c => q.all(`SELECT p.user_id, p.reason, p.n FROM dash_points p JOIN class_members m ON m.class_id=p.class_id AND m.user_id=p.user_id AND m.status='active' AND m.role='student'
  WHERE p.class_id=? AND p.n>0`, c.id);
export function pointsAll(c) {
  const rows = pointRows(c), by = new Map();
  for (const r of rows) { const x = by.get(r.user_id) || { n: 0, r: {} }; x.n += r.n; x.r[r.reason] = r.n; by.set(r.user_id, x); }
  const list = studentsOf(c).map(k => ({ id: k.id, name: k.name, n: (by.get(k.id) || {}).n || 0, r: (by.get(k.id) || {}).r || {} }));
  return { list, total: list.reduce((a, b) => a + b.n, 0) };
}
export function pointsMine(c, userId) {
  const rows = pointRows(c), mine = rows.filter(r => r.user_id === userId);
  return { mine: mine.reduce((a, b) => a + b.n, 0), r: Object.fromEntries(mine.map(r => [r.reason, r.n])), total: rows.reduce((a, b) => a + b.n, 0) };
}
export const MAX_POINTS = 9999;
/** award: one point for one student (user) or every student (user 'all') for a reason; undo: take one such point
 *  back (never below zero); reset: everyone back to zero. */
export function pointsAction(u, c, { action, user, reason } = {}) {
  if (action === 'reset') { q.run('DELETE FROM dash_points WHERE class_id=?', c.id); return pointsAll(c); }
  if (!['award', 'undo'].includes(action)) return { error: 'kind' };
  if (!POINT_REASONS.includes(reason)) return { error: 'reason' };
  const kids = studentsOf(c), who = user === 'all' ? kids : kids.filter(k => k.id === String(user || ''));
  if (!who.length) return { error: user === 'all' ? 'nobody' : 'notFound' };
  tx(() => {
    for (const k of who) {
      if (action === 'award') q.run(`INSERT INTO dash_points(class_id, user_id, reason, n, at) VALUES (?,?,?,1,?)
        ON CONFLICT(class_id, user_id, reason) DO UPDATE SET n=MIN(?, n+1), at=excluded.at`, c.id, k.id, reason, now(), MAX_POINTS);
      else if (action === 'undo') q.run('UPDATE dash_points SET n=MAX(0, n-1) WHERE class_id=? AND user_id=? AND reason=?', c.id, k.id, reason);
    }
  });
  q.run('DELETE FROM dash_points WHERE class_id=? AND n<=0', c.id);
  return pointsAll(c);
}

// ---------------------------------------------------------------- mood check-in (faces only)
// A student taps one of five faces (an index; no words of their own). Today only. The teacher sees the counts on the
// widget (and so the projector) and, on their own tap, who chose which, for their own class; a student sees only their
// own face. Nobody else ever sees anyone's.
const dropOldMoods = c => q.run('DELETE FROM dash_moods WHERE class_id=? AND day<>?', c.id, dayOf(c));
const moodRows = c => { dropOldMoods(c); return q.all(`SELECT d.user_id, d.mood FROM dash_moods d JOIN class_members m ON m.class_id=d.class_id AND m.user_id=d.user_id AND m.status='active' AND m.role='student' WHERE d.class_id=?`, c.id); };
export function moodCounts(c) {
  const counts = MOODS.map(() => 0), rows = moodRows(c);
  for (const r of rows) if (counts[r.mood] !== undefined) counts[r.mood]++;
  return { counts, n: rows.length, size: studentsOf(c).length };
}
export const moodMine = (c, userId) => { dropOldMoods(c); const r = q.get('SELECT mood FROM dash_moods WHERE class_id=? AND user_id=?', c.id, userId); return r ? r.mood : null; };
export function setMood(u, c, mood) {
  if (!pinsOf(c.id).some(w => w.type === 'mood')) return { error: 'noMood' };
  if (mood === null) { q.run('DELETE FROM dash_moods WHERE class_id=? AND user_id=?', c.id, u.id); return { mine: null }; }
  const v = Number(mood);
  if (!Number.isInteger(v) || v < 0 || v >= MOODS.length) return { error: 'kind' };
  q.run('INSERT INTO dash_moods(class_id, user_id, day, mood, at) VALUES (?,?,?,?,?) ON CONFLICT(class_id, user_id) DO UPDATE SET day=excluded.day, mood=excluded.mood, at=excluded.at', c.id, u.id, dayOf(c), v, now());
  return { mine: v };
}
/** The class's teacher only: who chose each face today (Oomba names), and who hasn't yet. */
export function moodNames(c) {
  const kids = studentsOf(c), byId = new Map(kids.map(k => [k.id, k.name]));
  const groups = MOODS.map(() => []), done = new Set();
  for (const r of moodRows(c)) if (groups[r.mood] && byId.has(r.user_id)) { groups[r.mood].push(byId.get(r.user_id)); done.add(r.user_id); }
  return { groups, missing: kids.filter(k => !done.has(k.id)).map(k => k.name) };
}

// ---------------------------------------------------------------- the site window
/** One of this teacher's site windows (any of their layouts for the class) and its address, or null. */
export function siteWidget(u, c, wid) { const w = teacherWidget(u, c, wid, ['site']); return w && w.s && w.s.url && cleanUrl(w.s.url) ? { id: w.id, url: cleanUrl(w.s.url) } : null; }

/** Account deletion (services/account-delete.js): this person's screens and pictures go. */
export function forgetUser(userId) {
  for (const p of q.all('SELECT id FROM dash_pictures WHERE owner_id=?', userId)) dropPicture(p.id);
  q.run('DELETE FROM dash_students WHERE user_id=?', userId);
  q.run('DELETE FROM dash_push_hidden WHERE user_id=?', userId);
  // Stage 2: their place in help queues, their check answers, and any picker list they are on.
  q.run('DELETE FROM dash_help WHERE user_id=?', userId);
  q.run('DELETE FROM dash_answers WHERE user_id=?', userId);
  // Stage 5: their hall pass, points and mood.
  for (const t of ['dash_passes', 'dash_points', 'dash_moods']) q.run(`DELETE FROM ${t} WHERE user_id=?`, userId);
  for (const r of q.all("SELECT class_id, picker FROM dash_class WHERE picker LIKE ?", `%${userId}%`)) {
    const p = json(r.picker, {});
    for (const k of ['picked', 'away']) if (Array.isArray(p[k])) p[k] = p[k].filter(id => id !== userId);
    if (p.last === userId) p.last = null;
    q.run('UPDATE dash_class SET picker=? WHERE class_id=?', JSON.stringify(p), r.class_id);
  }
}
