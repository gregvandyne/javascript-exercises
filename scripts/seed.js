// Seed: admin account (ADMIN_USERNAME / ADMIN_PASSWORD), a demo teacher (DEMO_TEACHER_PASSWORD, see seedDemoTeacher), the official "Oomba Academy" builder, and the launch games.
// Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { q, audit } from '../server/db.js';
import { config } from '../server/config.js';
import { createUser, getUserByName, setPassword, OFFICIAL, OFFICIAL_OLD_NAMES } from '../server/auth.js';
import { BRAND } from '../server/views/brand.js';
import { importGame } from './import-game.js';
import * as schools from '../server/services/schools.js';
import * as lessons from '../server/services/lessons.js';
import { getGameBySlug } from '../server/services/games.js';
import * as progress from '../server/services/progress.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The demo school's address, from its first name (Magic Cups Demo School).
const DEMO_SLUG = 'magic-cups-demo-school';
// The launch games, imported in this order (the first featured one becomes the home-page hero).
export const SEED_GAMES = ['shark-plank', 'ring-rumble', 'footy-tycoon', 'connect-four', 'happy-putt', 'castle-clash', 'brick-drop', 'word-hunt', 'sum-racer', 'munch-maze', 'word-peek', 'swish-flick', 'loop-lab', 'beat-lanes'];
export function seed({ quiet = false } = {}) {
  const say = (...a) => { if (!quiet) console.log(...a); };
  let admin = getUserByName(config.adminUsername);
  if (!admin) {
    const pw = config.adminPassword || crypto.randomBytes(9).toString('base64url');
    admin = createUser({ username: config.adminUsername, password: pw, displayName: 'Admin', role: 'admin', avatar: '🛡️', color: '#141414' });
    say(`Created admin "${config.adminUsername}"${config.adminPassword ? '' : ` with password: ${pw}  (set ADMIN_PASSWORD to choose one)`}`);
  } else {
    if (admin.role !== 'admin') q.run("UPDATE users SET role='admin' WHERE id=?", admin.id);
    if (config.adminPassword) setPassword(admin.id, config.adminPassword);
  }
  const official = seedOfficial(say);
  const dir = path.join(ROOT, 'seed-games');
  for (const f of SEED_GAMES) {
    const g = importGame(path.join(dir, `${f}.html`), path.join(dir, `${f}.json`), official.id);
    say(`  ✓ ${g.title}  /g/${g.slug}`);
  }
  const demo = seedDemoTeacher(admin, say);
  return { admin, official, demo };
}

/** The official builder account (owner of the launch games). It was called BRBGaming, then MagicCup, then MagicCups,
 *  before the site became Oomba Academy: an old one is renamed in place so its games keep their owner (/u/<old name>
 *  redirects, see OFFICIAL_OLD_NAMES in server/auth.js). Safe to re-run. */
export function seedOfficial(say = () => {}) {
  // The official account is the one that owns the launch games: a player who took a free name (the new one before launch,
  // or an old one after a rename) is never mistaken for it.
  const ownsLaunchGames = u => !!(u && q.get("SELECT 1 FROM games WHERE owner_id=? AND source='seed' LIMIT 1", u.id));
  const holder = getUserByName(OFFICIAL);
  if (!ownsLaunchGames(holder)) {
    const legacy = OFFICIAL_OLD_NAMES.map(getUserByName).find(ownsLaunchGames);
    if (legacy) {
      if (holder) {
        let spare = ''; for (let i = 1; !spare; i++) if (!getUserByName(`${OFFICIAL}_${i}`)) spare = `${OFFICIAL}_${i}`;
        q.run('UPDATE users SET username=? WHERE id=?', spare, holder.id); audit(null, 'user.rename', holder.id, { from: holder.username, to: spare });
        say(`Moved the player @${holder.username} to @${spare}: the name belongs to the official account`);
      }
      q.run('UPDATE users SET username=? WHERE id=?', OFFICIAL, legacy.id); say(`Renamed the official account @${legacy.username} to @${OFFICIAL}`);
    }
  }
  let official = getUserByName(OFFICIAL);
  if (!official) { official = createUser({ username: OFFICIAL, password: crypto.randomBytes(24).toString('hex'), displayName: BRAND, avatar: '🎮', color: '#66C792' }); say(`Created the official ${BRAND} builder account`); }
  q.run('UPDATE users SET display_name=?, bio=?, color=? WHERE id=?', BRAND, 'Games made by the Oomba Academy team. Play them, then build your own!', '#66C792', official.id);
  return getUserByName(OFFICIAL);
}

/** With DEMO_TEACHER_PASSWORD set: an "Oomba Academy Demo School" with the teacher DemoTeacher (that password, reset on
 *  every boot like the admin's) and a starter class. Without it, nothing happens. Safe to re-run. */
export function seedDemoTeacher(admin, say = () => {}) {
  const pw = process.env.DEMO_TEACHER_PASSWORD;
  if (!pw) return null;
  const name = `${BRAND} Demo School`;
  // Found by its address, which keeps the first name so links to it still work; an older name is updated in place. An
  // archived school is left alone (a new one is made, at that address only while it is free).
  const atSlug = schools.getSchoolBySlug(DEMO_SLUG);
  let school = (atSlug && !atSlug.archived_at ? atSlug : null)
    || q.get('SELECT * FROM schools WHERE name IN (?,?) AND archived_at IS NULL ORDER BY created_at LIMIT 1', name, 'Magic Cups Demo School');
  if (school && school.name !== name) { q.run('UPDATE schools SET name=? WHERE id=?', name, school.id); school = schools.getSchool(school.id); say(`Renamed the demo school to "${name}"`); }
  if (!school) {
    school = schools.createSchool(admin, { name }).school;
    if (!atSlug) { q.run('UPDATE schools SET slug=? WHERE id=?', DEMO_SLUG, school.id); school = schools.getSchool(school.id); }
    say(`Created "${name}"`);
  }
  let teacher = getUserByName('DemoTeacher');
  if (!teacher) { teacher = createUser({ username: 'DemoTeacher', password: pw, displayName: 'Demo Teacher', avatar: '🍎', color: '#2f6bff' }); say('Created the demo teacher DemoTeacher'); }
  else setPassword(teacher.id, pw);
  if (schools.roleIn(teacher, school.id) !== 'teacher') schools.addMember(admin, school.id, teacher.id, 'teacher', { rosterName: 'Demo Teacher' });
  if (!schools.classesOf(teacher.id, 'teacher').some(c => c.school_id === school.id)) schools.createClass(teacher, school.id, { name: 'Demo Class', grade: '4' });
  const cls = schools.classesOf(teacher.id, 'teacher').find(c => c.school_id === school.id);
  // A student to sign in as (DemoStudent, same password) and four classmates, so the class looks lived in.
  let student = getUserByName('DemoStudent');
  if (!student) {
    student = createUser({ username: 'DemoStudent', password: pw, displayName: 'DemoStudent', avatar: '🐙', color: '#e0457b' });
    q.run('UPDATE users SET managed_school=? WHERE id=?', school.id, student.id);
    schools.addMember(teacher, school.id, student.id, 'student', { rosterName: 'Demo Student', grade: '4' });
    if (cls) schools.addToClass(teacher, cls.id, student.id);
    for (const n of ['Ava Lopez', 'Noah Kim', 'Mia Patel', 'Leo Chen']) {
      const r = schools.createSchoolAccount(teacher, school.id, { rosterName: n, grade: '4' });
      if (r.ok && cls) schools.addToClass(teacher, cls.id, r.user.id);
    }
    say('Created the demo student DemoStudent and four classmates');
  } else setPassword(student.id, pw);
  // Sample lessons, only while the teacher's library is empty (so demo edits are kept).
  if (cls && !lessons.allLessonsOf(teacher.id, school.id).length) seedDemoLessons(teacher, school, cls);
  if (cls) seedDemoQuestions(teacher, school);
  if (cls) seedDemoProgress(teacher, cls);
  return { school, teacher, student };
}

function seedDemoLessons(teacher, school, cls) {
  const game = slug => { const g = getGameBySlug(slug); return g && g.status === 'published' ? g.id : null; };
  const make = (folderId, l, steps) => {
    const r = lessons.createLesson(teacher, school.id, { folderId, ...l }); if (!r.ok) return null;
    for (const st of steps) if (st.kind !== 'game' || st.gameId) lessons.addStep(teacher, r.lesson.id, st);
    return r.lesson;
  };
  const term = lessons.createFolder(teacher, school.id, { name: 'Term 1' }).folder;
  const math = lessons.createFolder(teacher, school.id, { name: 'Math', parentId: term && term.id }).folder;
  const fractions = make(math && math.id, {
    title: 'Adding fractions with the same denominator', subject: 'Math', grade: '4',
    summary: 'Students add fractions that share a denominator using pizza drawings, warm up with a quick math game, then build their own fraction quiz.',
    objectives: 'Explain what the numerator and denominator mean\nAdd two fractions with the same denominator\nCheck an answer with a drawing',
  }, [
    { kind: 'text', title: 'Warm-up: slices of pizza', minutes: 5, body: 'A pizza is cut into 8 equal slices. You eat 3 slices and your friend eats 2.\n\nWhat fraction did you eat? What fraction did your friend eat? How much did you eat together? Draw the pizza and shade the slices.' },
    { kind: 'text', title: 'Keep the bottom, add the top', minutes: 10, body: 'The bottom number (the denominator) tells how many equal parts make a whole. The top number (the numerator) tells how many parts we have.\n\nWhen the bottom numbers match, the parts are the same size, so we just add the tops: 3/8 + 2/8 = 5/8.\n\nTry these: 1/4 + 2/4, 2/6 + 3/6, 3/10 + 4/10.' },
    { kind: 'game', title: 'Quick-math warm-up', minutes: 8, gameId: game('sum-racer'), body: 'Play Sum Racer for a few rounds. Tell a partner one trick that helps you add fast.' },
    { kind: 'build', title: 'Build your fraction quiz', minutes: 15, body: 'a quiz with 8 questions about adding fractions with the same denominator, like 2/5 + 1/5, with a happy message for each right answer' },
    { kind: 'text', title: 'Wrap-up: swap and play', minutes: 4, body: 'Swap with a partner and play each other\'s quizzes. Finish this sentence in your notebook: When I add fractions with the same denominator, I add the ___ and keep the ___ the same.' },
  ]);
  const ela = lessons.createFolder(teacher, school.id, { name: 'Reading and writing', parentId: term && term.id }).folder;
  const words = make(ela && ela.id, {
    title: 'Word detectives: spelling patterns', subject: 'English', grade: '4',
    summary: 'Students spot common spelling patterns, hunt for words in a game and make their own word puzzle.',
    objectives: 'Spot words that share a spelling pattern\nSpell new words using a pattern',
  }, [
    { kind: 'text', title: 'Pattern hunt', minutes: 8, body: 'Look at these words: light, night, bright, might.\n\nWhat do they share? Write three more words with the same pattern.' },
    { kind: 'game', title: 'Find the words', minutes: 10, gameId: game('word-hunt'), body: 'Play Word Hunt. Write down two words you found that follow a pattern.' },
    { kind: 'build', title: 'Make a word puzzle', minutes: 15, body: 'a word game where you unscramble words that end in -ight, with 6 levels that get harder' },
  ]);
  make(null, {
    title: 'Coding with loops (draft)', subject: 'Computer science', grade: '4',
    summary: 'A first look at loops: doing something again and again.', objectives: 'Say what a loop does\nSpot a loop in a game',
  }, [
    { kind: 'text', title: 'Again and again', minutes: 5, body: 'Think of something you do again and again, like brushing your teeth or skipping rope. In code, a loop repeats steps for us.' },
    { kind: 'game', title: 'Loop Lab', minutes: 12, gameId: game('loop-lab'), body: 'Play Loop Lab. Which level needed the biggest loop?' },
  ]);
  const day = 86400000, iso = t => new Date(t).toISOString().slice(0, 10);
  const u1 = lessons.createUnit(teacher, cls.id, 'Fractions').unit;
  const u2 = lessons.createUnit(teacher, cls.id, 'Words').unit;
  if (fractions) lessons.assign(teacher, cls.id, fractions.id, { unitId: u1 && u1.id, dueAt: iso(Date.now() + 7 * day) });
  if (words) lessons.assign(teacher, cls.id, words.id, { unitId: u2 && u2.id, dueAt: iso(Date.now() + 14 * day) });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { seed(); console.log('Seed done.'); }

/** Written questions in the sample lessons (added once; demos made before questions existed get them too). */
function seedDemoQuestions(teacher, school) {
  const add = (title, step) => {
    const l = lessons.allLessonsOf(teacher.id, school.id).find(x => x.title === title);
    if (!l || lessons.steps(l.id).some(s => s.kind === 'question')) return;
    const r = lessons.addStep(teacher, l.id, step);
    // before the last step (the wrap-up)
    if (r.ok) lessons.reorderStep(teacher, r.step.id, -1);
  };
  add('Adding fractions with the same denominator', { kind: 'question', title: 'Exit ticket', minutes: 4, body: 'Explain in your own words why 2/8 + 3/8 = 5/8. Draw a picture if it helps.' });
  add('Word detectives: spelling patterns', { kind: 'question', title: 'Use the pattern', minutes: 5, body: 'Write one sentence that uses at least two words ending in -ight.' });
}

/** Sample progress for the demo classmates (once), so the gradebook has something to show. DemoStudent starts fresh. */
function seedDemoProgress(teacher, cls) {
  const plan = lessons.classPlan(cls.id).flatMap(g => g.lessons);
  if (!plan.length) return;
  const kids = schools.roster(cls.id).filter(p => p.role === 'student' && p.username !== 'DemoStudent');
  if (!kids.length || plan.some(cl => Object.keys(progress.forStudent(cl.id, kids[0].id)).length)) return;
  const answers = {
    'Adding fractions with the same denominator': ['Because the eighths are the same size, so you just count them: 2 eighths and 3 more eighths make 5 eighths.', 'The bottom number stays 8 because the pizza is still cut into 8 slices. You add the top: 2 + 3 = 5.', 'I drew a bar with 8 parts and coloured 2 then 3. That is 5 out of 8.', '2 slices and 3 slices is 5 slices of the same pizza.'],
    'Word detectives: spelling patterns': ['The night was so bright that it gave me a fright!', 'I might fly my kite tonight if the light is right.', 'My flashlight is bright.', 'Turn right at the light.'],
  };
  kids.forEach((k, ki) => plan.forEach((cl, li) => {
    const st = lessons.steps(cl.lesson_id);
    const howFar = li === 0 ? [st.length, st.length - 1, 3, 2][ki % 4] : [2, 1, 0, st.length][ki % 4];
    st.slice(0, howFar).forEach((s, si) => {
      if (s.kind === 'game') { progress.gameStarted(k, cl.id, s.id); progress.gameScore(k, cl.id, s.id, [42, 35, 51, 28][ki % 4] + si); }
      else if (s.kind === 'question') { const list = answers[cl.title] || answers['Word detectives: spelling patterns']; progress.answer(k, cl.id, s.id, list[ki % list.length]); if (ki === 0) progress.review(teacher, cl.id, s.id, k.id, 'Lovely explanation, and great use of a drawing!'); }
      else if (s.kind === 'build') { /* a hand-in needs a real game: left for the demo */ }
      else progress.markDone(k, cl.id, s.id);
    });
  }));
}
