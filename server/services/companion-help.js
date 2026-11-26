// Oomba companion: how to do things on the site, step by step, with links (docs/decisions.md "Oomba companion: how-to
// answers with links, Create class and Copy"). The one source of truth for the companion's how-to answers: every page
// a step links to is a real route (tests/unit/companion-help.test.js opens each one as a teacher and expects 200) and
// every button a step names is a real label (a locale key the page's own code uses, in all 13 languages). The AI gets
// the steps from the howTo tool with the teacher's own links filled in, and may only show links a tool gave it.
import * as S from './schools.js';
import * as D from './dash.js';
import { enabled as gcOn } from './gclassroom.js';
import { liveOn } from './classlive-sessions.js';
import { canHost } from './classlive-access.js';
import { tFor, teacherT } from '../i18n/index.js';

/** The pages a step can link to. A path's :class is one of the teacher's classes, :school one of their schools. */
export const PAGES = Object.freeze({
  classes: '/teach?all=1',
  class: '/class/:class',
  classStudents: '/class/:class?tab=students',
  classSettings: '/class/:class?tab=settings',
  classLessons: '/class/:class?tab=lessons&view=oomba',
  classAssigned: '/class/:class?view=assigned',
  dashboard: '/class/:class/dashboard',
  progress: '/class/:class/progress',
  gclassroom: '/class/:class/google-classroom',
  live: '/live',
  school: '/school/:school',
  schoolPeople: '/school/:school?tab=people',
  schoolSettings: '/school/:school?tab=settings',
  inviteTeacher: '/school/:school/invite',
  figures: '/figures',
  library: '/read',
  makeSchool: '/signup/teacher/school',
});

// Steps. In text: {link} is the step's page (its words in link), {b:<locale key>} a button or tab's label in bold.
// need: 'class' or 'school' (the task is about one of theirs); when: the feature is on for this teacher.
const step = (text, page = null, link = '') => ({ text, page, link });
export const HELP = Object.freeze({
  'create-class': { title: 'Make a new class', need: 'school', action: 'createClass', steps: [
    step('Open {link}.', 'classes', 'your classes'),
    step('Tap {b:school.class.new}.'),
    step('Type a class name and, if you like, a grade.'),
    step('Tap {b:school.class.create}. The class opens on its {b:school.classTabs.students} tab.'),
  ] },
  'open-dashboard': { title: 'Open a class dashboard', need: 'class', go: 'dashboard', steps: [
    step('Open {link}.', 'class', 'your class'),
    step('Tap {b:dash.entry.teacher}.'),
  ] },
  'add-students': { title: 'Add students and make their login cards', need: 'class', go: 'class', steps: [
    step('Open {link}.', 'classStudents', 'your class\'s Students tab'),
    step('Type the students\' names, one on each line, under {b:school.class.newAccounts}.'),
    step('Tap {b:school.class.createCards}, then print the cards.'),
  ] },
  'print-cards': { title: 'Print login cards again', need: 'class', go: 'class', steps: [
    step('Open {link}.', 'classStudents', 'your class\'s Students tab'),
    step('Tap {b:school.class.reprint} (each student gets a new password).'),
    step('Print the cards.'),
  ] },
  'invite-coteacher': { title: 'Add a co-teacher to a class', need: 'class', go: 'class', steps: [
    step('Open {link}.', 'classSettings', 'your class\'s Settings tab'),
    step('Under {b:school.class.teachers}, pick a teacher from your school and tap {b:school.class.addTeacher}.'),
    step('Not at your school yet? Open {link} and send them an invite first.', 'inviteTeacher', 'Invite a teacher'),
  ] },
  'assign-game': { title: 'Assign a lesson', need: 'class', steps: [
    step('Open {link}.', 'classLessons', 'your class\'s Lessons tab'),
    step('Tap {b:folders.findOomba} and pick a lesson.'),
    step('Tap {b:lessons.assign.button}. You can set {b:lessons.assign.due}.'),
  ] },
  'due-dates': { title: 'Set or change a due date', need: 'class', steps: [
    step('Open {link}.', 'classAssigned', 'the lessons you assigned'),
    step('Open the lesson and set {b:lessons.assign.due}, then tap {b:lessons.assign.button}.'),
  ] },
  'host-live': { title: 'Host a live lesson', when: 'live', steps: [
    step('Open {link}.', 'live', 'Host a live lesson'),
    step('Pick a lesson and your class, then start it.'),
    step('Students join with the code on the big screen.'),
  ] },
  progress: { title: 'See progress and the gradebook', need: 'class', go: 'progress', steps: [
    step('Open {link}.', 'progress', 'your class\'s Progress tab'),
    step('Each student\'s progress, scores and answers are there; you can download them as a spreadsheet (CSV).'),
  ] },
  'share-worksheet': { title: 'Give students a Figures worksheet', steps: [
    step('Open {link} and open your worksheet.', 'figures', 'Figures'),
    step('Tap {b:js.figures-sheet.assign}, pick the class and, if you like, {b:js.figures-sheet.assignDue}.'),
    step('Tap {b:js.figures-sheet.assignGo}.'),
  ] },
  'school-settings': { title: 'Change your school\'s settings', need: 'school', admin: true, steps: [
    step('Open {link}.', 'schoolSettings', 'your school\'s Settings tab'),
    step('Change what you need and save. Only school admins can do this.'),
  ] },
  'google-classroom': { title: 'Connect Google Classroom', need: 'class', when: 'gc', steps: [
    step('Open {link}.', 'gclassroom', 'Google Classroom for your class'),
    step('Tap {b:gclassroom.connect.button} and sign in with your school Google account.'),
    step('Pick the Classroom class to link to this class.'),
  ] },
  'find-books': { title: 'Find a book for the class', steps: [
    step('Open {link}.', 'library', 'the Story Library'),
    step('Pick a grade, then open a book: {b:js.companion.card.read} or {b:js.companion.card.assign}.'),
  ] },
});
export const TASKS = Object.freeze(Object.keys(HELP));

// A class step once the class is open (no link to it): its tab or button.
const PICKED_TAB = Object.freeze({ classStudents: 'school.classTabs.students', classSettings: 'school.classTabs.settings', classLessons: 'school.classTabs.games', classAssigned: 'school.classTabs.games', dashboard: 'dash.entry.teacher', progress: 'school.classTabs.progress' });
const EXTRA_LABELS = ['school.class.new'];

/** The teacher's schools (staff only) and classes (as their teacher). */
const schoolsOfU = u => S.schoolsOf(u.id).filter(s => s.role && s.role !== 'student');
const classesOfU = u => S.classesOf(u.id, 'teacher').filter(c => !c.archived_at);
const on = (when, u) => (when === 'live' ? liveOn() && canHost(u) : when === 'gc' ? gcOn() : true);

/** The class and school a how-to is about: the page's own, else the teacher's only one. */
export function placeOf(u, page = {}) {
  const classes = classesOfU(u), schools = schoolsOfU(u);
  const cls = (page.classId && classes.find(c => c.id === page.classId)) || (classes.length === 1 ? classes[0] : null);
  const school = (cls && schools.find(s => s.id === cls.school_id)) || (schools.length === 1 ? schools[0] : null) || schools[0] || null;
  return { cls, school, classes, schools };
}
export const pathOf = (key, { cls, school } = {}) => {
  const p = PAGES[key];
  if (!p) return null;
  if (p.includes(':class') && !cls) return null;
  if (p.includes(':school') && !school) return null;
  return p.replace(':class', encodeURIComponent(cls ? cls.id : '')).replace(':school', encodeURIComponent(school ? school.slug : ''));
};

/** One task's steps for this teacher, in their language for the labels: { title, steps: [markdown], links: [path],
 *  go?: { pageType, id } } | { error }. Links are only the teacher's own pages. */
export function howTo(u, task, { page = {}, lang = 'en', name = s => s } = {}) {
  const h = HELP[task];
  if (!h) return { error: `Unknown task. Tasks: ${TASKS.join(', ')}.` };
  if (h.when && !on(h.when, u)) return { error: 'That is not turned on for this account.' };
  // The button names as the teacher sees them (docs/decisions.md "Teachers say lessons").
  const t = teacherT(tFor(lang));
  const place = placeOf(u, page);
  const links = new Set();
  const out = [];
  const label = s => s.replace(/\{b:([A-Za-z0-9_.-]+)\}/g, (m, k) => `**${t(k)}**`);
  // No school yet: a school comes first (a teacher makes theirs, an admin approves a join).
  if ((h.need === 'school' || h.need === 'class') && !place.school) {
    const p = PAGES.makeSchool; links.add(p);
    return { title: h.title, steps: [`Open [your school setup](${p}) and make your school, or join your school there.`, 'Then ask me again, and I can take it from there.'], links: [...links], noSchool: true };
  }
  if (h.admin && place.school && place.school.role !== 'admin') {
    const p = pathOf('school', place); links.add(p);
    return { title: h.title, steps: [`Open [your school's page](${p}).`, 'Only your school admin can change this: ask them, and say what you need changed.'], links: [...links], adminOnly: true };
  }
  // Making a class where only admins may (the same rule as My classes' New class): ask an admin.
  if (h.action === 'createClass' && !place.schools.some(x => S.canCreateClass(u, x.id))) {
    const p = pathOf('classes', place); links.add(p);
    return { title: h.title, steps: [`Open [your classes](${p}).`, 'At your school only a school admin can make classes: ask them to make the class and add you as its teacher.', `Then open it from your classes and tap **${t('dash.entry.teacher')}**.`], links: [...links], denied: true };
  }
  // A class task without one class in mind: open the list first; the class's own links then become plain words.
  const needsPick = h.need === 'class' && !place.cls;
  if (needsPick) {
    if (!place.classes.length) {
      const p = pathOf('classes', place); links.add(p);
      out.push(`Open [your classes](${p}) and make a class first: tap **${t('school.class.new')}**.`);
    } else {
      const p = pathOf('classes', place); links.add(p);
      out.push(`Open [your classes](${p}) and open the class.`);
    }
  }
  for (const s of h.steps) {
    let text = label(s.text);
    if (s.page && needsPick && PAGES[s.page].includes(':class')) {
      // The class is open already (the step above): say which tab or button instead of a link.
      const tab = PICKED_TAB[s.page];
      if (!tab) continue;
      text = `Tap **${t(tab)}**.`;
    } else if (s.page) {
      const p = pathOf(s.page, place);
      if (!p) continue;
      links.add(p); text = text.replace('{link}', `[${name(s.link)}](${p})`);
    }
    out.push(text);
  }
  const go = h.go && place.cls && (h.go !== 'dashboard' || D.isTeacher(u, S.getClass(place.cls.id))) ? { pageType: h.go === 'progress' ? 'class' : h.go, id: place.cls.id } : null;
  return { title: h.title, steps: out, links: [...links], ...(go ? { go } : {}), ...(h.action ? { action: h.action } : {}) };
}

/** Every link and label in the map, for the tests: [{ task, page, path }] and [locale key]. */
export const allPages = () => [...new Set(Object.values(HELP).flatMap(h => h.steps.map(s => s.page).filter(Boolean)))];
export const allLabels = () => [...new Set([...Object.values(HELP).flatMap(h => h.steps.flatMap(s => [...s.text.matchAll(/\{b:([A-Za-z0-9_.-]+)\}/g)].map(m => m[1]))), ...Object.values(PICKED_TAB), ...EXTRA_LABELS])];
