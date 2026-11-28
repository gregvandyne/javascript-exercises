// Page layout. Contract for every route:
//   res.send(layout(req, { title, active, body, scripts, head, back, bodyClass, description, bare, mid, i18n }))
//   mid: true = a medium-width page (reading pages like lessons)
//   active: 'home'|'play'|'search'|'learn'|'read'|'build'|'friends'|'me'|'plans'|'family'|'account'|'classes'|'school'|'live'|null
//           (the tab it makes current: shellFor/currentTab)   back: href for the Back link on inner pages
//   scripts: ['/js/foo.js'] (ES modules)   bare: true = no nav/footer (play page); themedBar: a bare page whose bar follows the theme
//   i18n: extra key prefixes to embed for the browser. Every page gets 'js.app' plus 'js.<name>' for each /js/<name>.js.
//   seo: { index: true, path, langs, image, imageAlt, type, jsonld } to let search engines index the page (server/seo.js).
//        Without it a page is noindex: new pages stay out of search results until they opt in.
import { html, raw, esc, jsonData } from './html.js';
import { ico } from './icon.js';
import { toolAccess } from '../services/teacher-tools.js';
import { companionFor } from '../services/companion-settings.js';
import { avatar, BRAND, wordmark, appMark } from './components.js';
import { accountKind, STAFF_PASSWORD_MIN, isGrownup, longPasswordKind } from '../auth.js';
import { config } from '../config.js';
import { ICONS_V } from './brand.js';
import { navBadges } from '../services/badges.js';
import { inAnySchool, isSchoolStaff, noFriendsAccount, isPlatformAdmin, adminSchools, soloSchoolAdmin, staffName, schoolsOf } from '../services/schools.js';
import { availableLocales, localeInfo, tReq, tHtml, clientStrings, DEFAULT_LOCALE, localPath } from '../i18n/index.js';
import { THEMES, THEME_ICONS, BAR_COLORS } from '../theme.js';
import { notices, markNotified } from '../builder/turns.js';
import { familiesOn } from '../services/family.js';
import { madeCard, pwResetNote } from './family-made.js';
import { seoHead, localeUrl, localizable, clip } from '../seo.js';
import { liveOn } from '../services/classlive-sessions.js';

const NAV = [
  ['home', '/', '🏠'],
  ['search', '/search', '🔎'],
  ['build', '/build', '🛠️'],
  ['friends', '/friends', '👫'],
];
/** School staff's "Teaching tools": the Figures menu (/figures), which also links to the other tools a teacher may open. */
const TOOLS = Object.freeze(['tools', '/figures', '🧰']);
export const VERSION = Date.now().toString(36); // cache-buster per boot

/** Grown-up accounts, school staff and the platform admin: the readers of /terms, /refunds and the billing parts of
 *  /privacy. Kids, students, guests and the signed-out see neither a Terms link nor plan names (docs/decisions.md
 *  "Paid plans" §4.1, §9): their footer's Privacy link opens /privacy without the billing sections. */
/** The key for a "Parents" label: until a language has its own (nav.parents, home.intro.parents), the footer's
 *  already-translated "For parents" stands in, so a translated page never shows that link in English. */
export const parentsKey = (t, key = 'nav.parents') => (t.own(key) || !t.own('layout.footer.parents') ? key : 'layout.footer.parents');
export const parentsLabel = (t, key) => t(parentsKey(t, key));
/** Signed out, for menus, the home intro and the footer: no account, or a guest (one tap on Play makes a guest). */
export const signedOut = u => !u || !!u.is_guest;
/** Labels with a translated stand-in until a language has their own: Grown-ups -> Parents (the tab opens the parent
 *  page), Games -> Home (both open /), Account -> Me, School -> Schools. A translated page never shows them in English. */
const STAND_IN = { grownups: ['parents'], games: ['home'], account: ['me'], school: ['schools'], classroom: ['classes'], class: ['classes'] };
/** A menu item's label key (tab bar and top bar). */
export function tabKey(t, k) {
  if (k === 'parents') return parentsKey(t);
  if (k === 'signin') return 'layout.signIn';
  const own = `nav.${k}`;
  if (t.own(own)) return own;
  const alt = (STAND_IN[k] || []).map(x => `nav.${x}`).find(x => t.own(x));
  return alt || own;
}
/** Pages the signed-out "Grown-ups" tab stands for (it is current on them). */
const GROWNUP_PAGES = ['parents', 'teachers', 'grownups'];
export const legalReader = u => !!u && !u.is_guest && (isGrownup(u) || isPlatformAdmin(u) || isSchoolStaff(u));

/** Where '/' takes a signed-in person whose first tab is not Learn (docs/decisions.md "Play and Learn", "Learn and
 *  Read"): a student to their Class tab, a teacher to their Classroom, a school admin to their School, a grown-up to
 *  Family; null for everyone who lands on Learn (signed out, guests, kids, the platform admin). auth.js homeFor uses it
 *  too, so sign-in and '/' agree. */
export function landingFor(u) {
  if (signedOut(u)) return null;
  if (isGrownup(u)) return '/family';
  // A school admin lands on their School, unless they are its only staff member (a solo teacher: the Classroom home).
  if (isSchoolStaff(u)) return adminSchools(u).length && !soloSchoolAdmin(u) ? '/school' : '/teach';
  if (isPlatformAdmin(u)) return null;
  if (inAnySchool(u)) return '/classes';
  return null;
}

/**
 * The menus for one person (docs/decisions.md "Navigation shells", "A quieter top bar" and "Learn and Read": one Learn
 * page with every game, by topic and by filter, and the Story Library as its own Read tab) -> { role, tabs, top, meHref }.
 * tabs is the phone tab bar, last item the Me / Account / Sign in tab; top is the desktop top bar's links (the avatar
 * button, which opens the account menu signed in, stands for Me or Account there). Each item is [key, href, emoji].
 * Search is the top bar's field (or round 🔎 button) for everyone, not a tab. Learn is always /learn ('/' shows the same
 * page to those who land on it: landingFor null); Read is /read (the Story Library). Neither bar has Plans or School:
 * Plans is in the account menu for grown-ups and staff (accountMenu) and in the footer signed out; School is in a school
 * admin's account menu. The first matching row wins:
 *   signed out or a guest   Learn · Read · Build · Grown-ups · Sign in   (top: Learn · Read · Build · Parents · Teachers)
 *   grown-up                Family · Learn · Read · Build · Account      (top: the same without Account)
 *   school staff            Classroom · Build · (Tools) · (Live) · Me    (top: the same without Me; a school admin's
 *                                                                          School is in the account menu)
 *   platform admin          Learn · Read · Build · Schools · Me
 *   student                 Class · Learn · Read · Build · Me            (top: the same with Friends, without Me)
 *   kid                     Learn · Read · Build · Friends · Me          (top: the same without Me)
 * Live (📡 /live, hosting) is there only while Oomba Live is on (liveOn). With STORY_BUILDER=1 every signed-in shell also
 * has Stories (🌙, /stories) after Build in the top bar; the phone's tab bar keeps five tabs at most, so where Stories
 * would make six it is in the account menu on phones instead (storiesInMenu), as staff's Teaching tools are.
 */
export function shellFor(u) {
  const [, , build, friends] = NAV;
  const learn = ['learn', '/learn', '💡'];
  const read = ['read', '/read', '📚'];
  const classroom = ['classroom', '/teach', '🍎'];
  const live = liveOn() ? [['live', '/live', '📡']] : [];
  const me = ['me', '/me', '🙂'];
  // The Story Builder (routes/stories.js) for everyone signed in, only while STORY_BUILDER is on.
  const stories = config.storyBuilder ? [['stories', '/stories', '🌙']] : [];
  // The phone's tab bar: five tabs at most. Where Stories would make a sixth, it is in the account menu on phones.
  const phone = (top, last, extra = []) => {
    const all = [...top, ...extra, last];
    return all.length <= 5 ? { tabs: all, storiesInMenu: false } : { tabs: all.filter(x => x[0] !== 'stories'), storiesInMenu: stories.length > 0 };
  };
  if (signedOut(u)) {
    return { role: 'out', tabs: [learn, read, build, ['grownups', '/parents', '👪'], ['signin', '/login', '🙂']],
      top: [learn, read, build, ['parents', '/parents', '👪'], ['teachers', '/teachers', '🍎']], meHref: '/login' };
  }
  if (isGrownup(u)) {
    // Read: grown-ups read the Story Library too (nothing is stored for them: routes/library.js readerOf).
    const top = [['family', '/family', '👪'], learn, read, build, ...stories];
    return { role: 'grownup', ...phone(top, ['account', '/family/account', '⚙️']), top, meHref: '/family/account' };
  }
  if (isSchoolStaff(u)) {
    // Classroom · Build · Teaching tools · Live: no Learn or Play for staff (docs/decisions.md "Teachers' top bar:
    // Classroom, Build, Live" and "Figures opens to all teachers"). Teaching tools (/figures) is there while FIGURES is
    // on (see tools below). The phone's tab bar takes it while it has room (five tabs at most, as for every other role); with the Story
    // Builder on as well it is in the account menu instead (toolsInMenu).
    // Teaching tools (services/teacher-tools.js): for staff who may use Figures, and as the door to the plan page for
    // staff without the Teacher plan while paid plans are on; not while FIGURES=0, nor (plans off) for non-testers.
    const tools = toolAccess(u, config.figures) ? [TOOLS] : [];
    const head = [classroom, build, ...tools, ...stories];
    const top = [...head, ...live];
    const roomy = [...top, me].length <= 5;
    const tabs = roomy ? [...top, me] : [...top.filter(x => x !== TOOLS), me];
    // A school admin: School is in the account menu (accountMenu); otherwise the teacher's bars.
    return { role: adminSchools(u).length > 0 ? 'schoolAdmin' : 'teacher', tabs, top, meHref: '/me', toolsInMenu: tools.length > 0 && !roomy };
  }
  if (isPlatformAdmin(u)) {
    // No Friends tab: the platform admin is staff, and staff have no friends (services/schools.js noFriendsAccount).
    const top = [learn, read, build, ...stories, ['schools', '/admin/schools', '🏫']];
    return { role: 'admin', ...phone(top, me), top, meHref: '/me' };
  }
  // A teacher who left their school is an ordinary account again, but still has no friends (noFriendsAccount).
  const fr = noFriendsAccount(u) ? [] : [friends];
  if (inAnySchool(u)) {
    const head = [['class', '/classes', '🏫'], learn, read, build, ...stories];
    return { role: 'student', ...phone(head, me), top: [...head, ...fr], meHref: '/me' };
  }
  const top = [learn, read, build, ...stories, ...fr];
  return { role: 'kid', ...phone(top, me), top, meHref: '/me' };
}
/** Where a signed-out visitor's games are: /learn where '/' is the teacher landing page (routes/landing.js, on unless
 *  LANDING_AT_ROOT=0), else '/' (which shows the Learn page). */
export const gamesHome = u => (!u && process.env.LANDING_AT_ROOT !== '0' ? '/learn' : '/');
/** The tab a page's `active` makes current in this shell: the game pages (home, play, search) are Learn; the class pages
 *  are Classroom for staff, Class for students and Schools for the platform admin; hosting (live) is Live where there is
 *  a Live link, else Classroom; the school pages are Me (School is in the account menu); the parent and teacher pages are
 *  Grown-ups. */
export function currentTab(shell, active) {
  const has = k => shell.tabs.some(([x]) => x === k) || shell.top.some(([x]) => x === k);
  if (active === 'home' || active === 'search' || active === 'play') return has('learn') ? 'learn' : active;
  if (active === 'classes') return ['classroom', 'class', 'schools'].find(has) || active;
  if (active === 'live') return has('live') ? 'live' : has('classroom') ? 'classroom' : active;
  // A school admin's School is in the account menu behind the avatar: on the school pages, Me is current.
  if (active === 'school') return has('school') ? 'school' : has('me') ? 'me' : active;
  return active;
}

/** URL of the current page with ?lang=<code> or ?theme=<theme> (the server stores the choice and redirects back without it). */
function choiceHref(req, name, value) {
  const u = new URL(req.originalUrl || '/', 'http://x');
  u.searchParams.set(name, value);
  return localPath(u) + '?' + u.searchParams;
}
/** On a page at a language address (/es/teachers), the other language's address keeps the choice: /fr/teachers?lang=fr. */
function langHref(req, code) {
  if (!req.pathLocale) return choiceHref(req, 'lang', code);
  const u = new URL(req.url || '/', 'http://x');
  u.searchParams.set('lang', code);
  return localeUrl(localPath(u), code) + '?' + u.searchParams;
}
/** The 🌐 language picker: a <details> menu of plain links, so it works with no JavaScript (app.js adds keys and outside-click). */
export function langPicker(req) {
  const t = tReq(req); const cur = req.locale || DEFAULT_LOCALE; const info = localeInfo(cur);
  const langs = availableLocales();
  if (langs.length < 2) return '';   // nothing to choose yet
  return html`<details class="langpick" data-langpick>
    <summary class="lang-btn" aria-label="${t('layout.lang.button', { language: info.name })}" title="${t('layout.lang.title')}"><span class="globe" aria-hidden="true">${ico('🌐', { size: 20 })}</span><span class="lang-code" aria-hidden="true">${cur.split('-')[0].toUpperCase()}</span></summary>
    <div class="lang-menu">
      <p class="lang-head" id="lang-head">${t('layout.lang.title')}</p>
      <ul class="lang-list" aria-labelledby="lang-head">${langs.map(l => html`<li><a href="${langHref(req, l.code)}" hreflang="${l.code}" rel="nofollow" ${l.code === cur ? raw('aria-current="true"') : ''}><span class="lang-check" aria-hidden="true">${l.code === cur ? '✓' : ''}</span><span class="lang-name" lang="${l.code}" dir="${l.dir}">${l.name}</span></a></li>`)}</ul>
    </div>
  </details>`;
}

/** The theme choice (☀️ Light, 🌙 Dark, 🌓 Same as my device) as plain links that work with no JavaScript (?theme=, which
 *  the server saves before redirecting back); app.js switches at once instead, using data-theme-choice. In the account
 *  menu (accountMenu) signed in and in the footer signed out (docs/decisions.md "A quieter top bar"). */
export function themeLinks(req, { cls = 'theme-list', labelledby = '' } = {}) {
  const t = tReq(req); const cur = THEMES.includes(req.theme) ? req.theme : 'system';
  const label = th => t('layout.theme.button', { theme: t(`layout.theme.${th}`) });
  return html`<ul class="${cls}"${labelledby ? raw(` aria-labelledby="${labelledby}"`) : ''}>${THEMES.map(th => html`<li><a href="${choiceHref(req, 'theme', th)}" rel="nofollow" data-theme-choice="${th}" data-label="${label(th)}" ${th === cur ? raw('aria-current="true"') : ''}><span class="lang-check" aria-hidden="true">${th === cur ? ico('✓', { size: 16 }) : ''}</span><span class="theme-ico" aria-hidden="true">${ico(THEME_ICONS[th], { size: 20 })}</span><span>${t(`layout.theme.${th}`)}</span></a></li>`)}</ul>`;
}

/** Who sees Plans in the account menu and on the settings page: grown-ups, school staff and the platform admin (the
 *  adults, legalReader), only while paid-plan pages are on (familiesOn). Never a kid or a student: kids are never sold
 *  to (they can still open /plans, which tells them a grown-up buys plans). */
export const plansInMenu = (u, req) => legalReader(u) && familiesOn(req);

/**
 * The account menu behind the avatar (signed in only; signed out the avatar is the Sign in link), a <details> of plain
 * links like the language picker, so it works with no JavaScript (app.js adds Escape, outside-click and arrow keys):
 *   Me (or Account, a grown-up's settings page) · My school (a school admin: /school) ·
 *   Settings: Theme (Light, Dark, Same as my device), Plans (adults, plansInMenu), All settings (/me/settings or
 *   /family/account).
 */
export function accountMenu(req, { shell, name, badge, active, unread = 0 }) {
  const t = tReq(req); const u = req.user;
  if (shell.role === 'teacher' || shell.role === 'schoolAdmin') return staffMenu(req, { name, badge, active, unread, tools: !!shell.toolsInMenu });
  const storiesKey = tabKey(t, 'stories');
  const grownup = shell.role === 'grownup';
  const settingsHref = grownup ? '/family/account' : '/me/settings';
  const en = key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
  const plansKey = tabKey(t, 'plans');
  const school = !grownup && adminSchools(u).length > 0;
  // on: the page being shown is this item's (aria-current, as in the bars).
  // emo: an icon's emoji (drawn as the icon); avatar: the person's own avatar, kept as it is.
  const item = (href, emo, label, { on = req.path === href, attr = '', extra = '', avatar: own = false } = {}) => html`<li><a href="${href}" ${on ? raw('aria-current="page"') : ''}${attr}><span class="theme-ico" aria-hidden="true">${own ? emo : ico(emo, { size: 20 })}</span><span>${label}</span>${extra}</a></li>`;
  return html`<details class="acctpick" data-acctpick>
    <summary class="me-btn${active ? ' is-current' : ''}" aria-label="${t('layout.meLabel', { name })}">${avatar(u, 38)}<span class="name">${name}</span>${badge('me')}</summary>
    <div class="acct-menu">
      ${grownup ? '' : html`<ul class="acct-list">
        ${item('/me', u.photo_at ? '🙂' : u.avatar, t('nav.me'), { extra: badge('me'), avatar: !u.photo_at })}
        ${school ? item('/school', '🏛️', t('me.tiles.school'), { on: req.path === '/school' || req.path.startsWith('/school/') }) : ''}
      </ul>`}
      ${shell.storiesInMenu ? html`<ul class="acct-list acct-phone">${item('/stories', '🌙', t(storiesKey), { on: req.path === '/stories' || req.path.startsWith('/stories/'), attr: en(storiesKey) })}</ul>` : ''}
      <p class="lang-head" id="acct-set-head">${t('me.settings.title')}</p>
      <p class="acct-sub" id="acct-theme-head">${t('layout.theme.title')}</p>
      ${themeLinks(req, { cls: 'acct-list acct-themes', labelledby: 'acct-theme-head' })}
      <ul class="acct-list" aria-labelledby="acct-set-head">
        ${plansInMenu(u, req) ? item('/plans', '⭐', t(plansKey), { attr: en(plansKey) }) : ''}
        ${item(settingsHref, '⚙️', t('layout.acct.allSettings'))}
      </ul>
    </div>
  </details>`;
}

/**
 * School staff's account menu (docs/decisions.md "Teachers' account menu"): a card that opens Me (the avatar, the name,
 * the school, and how many messages are new), Learn and Read as two tiles (a teacher's bars have neither), My school
 * (a school admin), Plans (plansInMenu), Settings and Sign out, and the theme as one Auto / Light / Dark switch at the
 * bottom (plain links, as in themeLinks, so it works with no JavaScript; app.js switches at once).
 */
function staffMenu(req, { name, badge, active, unread, tools = false }) {
  const t = tReq(req); const u = req.user;
  const en = key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
  const school = (schoolsOf(u.id)[0] || {}).name || '';
  const admin = adminSchools(u).length > 0;
  const plansKey = tabKey(t, 'plans'), learnKey = tabKey(t, 'learn'), readKey = tabKey(t, 'read');
  const here = href => req.path === href || req.path.startsWith(`${href}/`);
  const item = (href, emo, label, { on = here(href), attr = '', cls = '' } = {}) => html`<li${cls ? html` class="${cls}"` : ''}><a href="${href}" ${on ? raw('aria-current="page"') : ''}${attr}><span class="theme-ico" aria-hidden="true">${ico(emo, { size: 20 })}</span><span>${label}</span></a></li>`;
  const cur = THEMES.includes(req.theme) ? req.theme : 'system';
  const short = th => t(th === 'system' ? 'layout.acct.themeAuto' : `layout.theme.${th}`);
  return html`<details class="acctpick" data-acctpick>
    <summary class="me-btn${active ? ' is-current' : ''}" aria-label="${t('layout.meLabel', { name })}">${avatar(u, 38)}<span class="name">${name}</span>${badge('me')}</summary>
    <div class="acct-menu acct-staff">
      <a class="acct-card" href="/me" ${req.path === '/me' ? raw('aria-current="page"') : ''}>${avatar(u, 48)}<span class="acct-card-t"><b dir="auto">${name}</b>${school ? html`<small dir="auto">${school}</small>` : ''}${unread ? html`<span class="acct-card-msg" aria-hidden="true">${ico('💬', { size: 16 })} ${t('layout.acct.newMessages', { count: unread })} ›</span>` : ''}</span></a>
      <div class="acct-tiles">
        <a href="/learn" ${here('/learn') ? raw('aria-current="page"') : ''}${en(learnKey)}><span class="acct-tile-e" aria-hidden="true">${ico('💡', { size: 32 })}</span>${t(learnKey)}</a>
        <a href="/read" ${here('/read') ? raw('aria-current="page"') : ''}${en(readKey)}><span class="acct-tile-e" aria-hidden="true">${ico('📚', { size: 32 })}</span>${t(readKey)}</a>
      </div>
      <ul class="acct-list acct-links">
        ${tools ? item('/figures', '🧰', t(tabKey(t, 'tools')), { attr: en(tabKey(t, 'tools')), cls: 'acct-phone' }) : ''}
        ${admin ? item('/school', '🏛️', t('me.tiles.school')) : ''}
        ${plansInMenu(u, req) ? item('/plans', '⭐', t(plansKey), { attr: en(plansKey) }) : ''}
        ${item('/me/settings', '⚙️', t('me.settings.title'))}
        <li><form data-api="/api/auth/logout" data-next="/"><button type="submit" class="acct-out"><span class="theme-ico" aria-hidden="true">${ico('🚪', { size: 20 })}</span><span>${t('me.signOut.button')}</span></button></form></li>
      </ul>
      <ul class="acct-themeseg" aria-label="${t('layout.theme.title')}">${THEMES.map(th => html`<li><a href="${choiceHref(req, 'theme', th)}" rel="nofollow" data-theme-choice="${th}" data-label="${t('layout.theme.button', { theme: t(`layout.theme.${th}`) })}" title="${t(`layout.theme.${th}`)}" ${th === cur ? raw('aria-current="true"') : ''}>${ico(THEME_ICONS[th], { size: 16 })} ${short(th)}</a></li>`)}</ul>
    </div>
  </details>`;
}

/** A feature's script on every full page for the people it is for: fn(req) -> '/js/x.js' or null. Registered by the
 *  feature's routes (routes/homeroom.js), so this module imports none of them. */
const everyPage = [];
export const onEveryPage = fn => { if (!everyPage.includes(fn)) everyPage.push(fn); };
export function layout(req, { title = '', active = null, body = '', scripts = [], head = '', back = null, backLabel = null, bodyClass = '', description = null, bare = false, themedBar = false, mid = false, i18n = [], seo = null, keyboard = false, signinPage = false, companion = null } = {}) {
  const t = tReq(req);
  const locale = req.locale || DEFAULT_LOCALE; const info = localeInfo(locale);
  const u = req.user;
  // A live page Homeroom frames (?in=hr: routes/homeroom-liveembed.js): the same page without the site's chrome (its
  // menu, footer, banners, a Back link and the Oomba chat), as a bare page has none.
  const inHr = !!req.hrEmbed && !bare, chromeless = bare || inHr;
  if (inHr) { back = null; bodyClass = `${bodyClass} lv-inhr`.trim(); }
  // The menus for this person's role (shellFor). Signed out means signed out or a guest: a parent who plays one game
  // becomes a guest (routes/games.js) and must keep every grown-up door.
  const shell = shellFor(u, req);
  const out = shell.role === 'out', grownup = shell.role === 'grownup';
  const staff = shell.role === 'schoolAdmin' || shell.role === 'teacher';
  const meHref = shell.meHref;
  // School staff see the real name their school gave them (their own header only), not a made-up sign-in name.
  const myName = u ? (staff && staffName(u)) || u.display_name : '';
  const badges = u ? { ...navBadges(u) } : { friends: 0 };
  // Staff have no Friends tab and no friends: unread Oomba team messages count on Me (/me links to that inbox).
  // Students have Friends in the top bar but not in their tab bar: theirs count on Me too.
  if (staff || shell.role === 'admin' || shell.role === 'student') badges.me = (badges.me || 0) + (badges.friends || 0);
  // Grown-ups have no Friends tab (and no chat): connection requests count on Family (/family links to them).
  // Their only chat is the Oomba team thread (/chat/OombaAcademy, linked from /family): its unread messages count there too.
  // A child's "Ask my grown-up" (services/sparks.js) counts there too until the grown-up sees it on /family.
  if (grownup) badges.family = (badges.requests || 0) + (badges.unread || 0) + (badges.asks || 0);
  // The platform admin: games waiting for the team's review count on Me (the way to /admin).
  if (u && u.role === 'admin' && badges.review) badges.me = (badges.me || 0) + badges.review;
  const badge = k => (badges[k] ? html`<span class="badge" aria-label="${t('layout.badgeNew', { count: badges[k] })}">${badges[k] > 9 ? '9+' : badges[k]}</span>` : '');
  const playKey = t.own('nav.playNow') ? 'nav.playNow' : 'home.hero.play';
  // Straight to the games: where '/' is the landing (signed out), that is the Learn page, so the landing never flashes
  // on the way; else the home page's game rows.
  const playTab = gamesHome(u);
  const playHref = (req.pathLocale && localizable(playTab) ? localeUrl(playTab, req.pathLocale) : playTab) + '#play';
  // The game pages (Learn and search), signed out, where the games have their own page (the landing is at '/'): no Play
  // now (they are on the games). Learn is also the indexed hub grown-ups find, so the bar keeps Parents and Teachers.
  const playPage = out && playTab !== '/' && currentTab(shell, active) === 'learn';
  const playNow = out && !playPage ? html`<a class="btn btn-hot playnow" href="${playHref}" data-count="/go/play"${t.own(playKey) ? '' : raw(' lang="en"')}><span aria-hidden="true">▶</span> <span class="playnow-t">${t(playKey)}</span></a>` : '';
  // Oomba Live: "Join a game" on every page for anyone who might be given a code (not school staff or the platform admin,
  // who host). Signed in
  // it is a round 🎟️ button on narrow bars and grows its words on wide ones; signed out (the bar also has "Play now") it
  // shows on wide screens only, and phones get the big door on the home page.
  const joinNow = !staff && shell.role !== 'admin' && liveOn() ? html`<a class="btn joinnow${out ? ' joinnow-out' : ''}" href="/join" aria-label="${t('live.entry.join')}">${ico('🎟️', { size: 22 })}<span class="joinnow-t" aria-hidden="true">${t('live.entry.join')}</span></a>` : '';
  const act = currentTab(shell, active);
  // The sign-in page, signed out: no Learn, Read, Build, Parents, Teachers or Sign in in the top bar (it is the page
  // they would lead away from); the logo, search, language and Play now stay.
  const quiet = signinPage && out;
  const signIn = t('layout.signIn');
  const cur = k => (k === act || (k === 'grownups' && GROWNUP_PAGES.includes(act)) ? raw('aria-current="page"') : '');
  const label = k => { const key = tabKey(t, k); return { key, attr: t.own(key) ? '' : raw(' lang="en"') }; };
  const tab = ([k, href, emo]) => {
    // The signed-out "Sign in" tab is current on the sign-in and sign-up pages, never on a guest's own Me page.
    if (k === 'signin') return html`<a class="tab" href="${href}" ${req.path === '/me' ? '' : cur('me')}><span class="emo" aria-hidden="true">${ico(emo, { size: 30 })}</span><span class="tab-t">${signIn}</span></a>`;
    if (k === 'me') return html`<a class="tab" href="${href}" ${cur('me')}>${u.photo_at ? html`<span class="emo">${avatar(u, 28)}</span>` : html`<span class="emo" aria-hidden="true">${u.avatar}</span>`}<span class="tab-t">${t('nav.me')}</span>${badge('me')}</a>`;
    const l = k === 'tools' && t.own('nav.toolsTab') ? { key: 'nav.toolsTab', attr: '' } : label(k);
    return html`<a class="tab" href="${href}" ${cur(k)}${l.attr}><span class="emo" aria-hidden="true">${ico(emo, { size: 30 })}</span><span class="tab-t">${t(l.key)}</span>${badge(k)}</a>`;
  };
  const nav = chromeless ? '' : html`
  <a class="skip" href="#main">${t('layout.skip')}</a>
  <header class="topbar">
    <a class="logo" href="/" aria-label="${BRAND}">${appMark()}<span class="logo-lockup" dir="ltr" aria-hidden="true">${wordmark()}<span class="logo-sub">Academy</span></span></a>
    <form class="topsearch" role="search" action="/search" method="get">
      <span class="ico" aria-hidden="true">${ico('🔎', { size: 18 })}</span>
      <label class="sr-only" for="topq">${t('layout.search.label')}</label>
      <input id="topq" name="q" type="search" placeholder="${t('layout.search.placeholder')}" data-short="${t('nav.search')}" autocomplete="off" value="${active === 'search' ? (req.query.q || '') : ''}">
    </form>
    <a class="topsearch-btn" href="/search" aria-label="${t('layout.search.label')}">${ico('🔎', { size: 22 })}</a>
    ${quiet ? '' : html`<nav class="topnav" aria-label="${t('layout.mainNav')}">
      ${shell.top.map(([k, href, emo]) => { const l = label(k); return html`<a class="navlink" href="${href}" ${cur(k)}${l.attr}><span class="emo" aria-hidden="true">${ico(emo, { size: 28 })}</span>${t(l.key)}${badge(k)}</a>`; })}
    </nav>`}
    ${langPicker(req)}
    ${quiet ? '' : u && !out ? accountMenu(req, { shell, name: myName, badge, active: !!cur(grownup ? 'account' : 'me'), unread: badges.me || 0 }) : html`<a class="me-btn" href="${meHref}" ${cur('me')} aria-label="${u ? t('layout.meLabel', { name: myName }) : signIn}">${u ? avatar(u, 38) : html`<span class="avatar" style="--s:38px;--c:var(--hover)" aria-hidden="true">🙂</span>`}<span class="name">${u ? myName : signIn}</span>${badge('me')}</a>`}
    ${joinNow}${playNow}
  </header>
  <nav class="tabbar" aria-label="${t('layout.mainNav')}">
    ${shell.tabs.slice(0, -1).map(tab)}
    ${tab(shell.tabs.at(-1))}
  </nav>`;
  // A footer word still in English on this language's page reads left to right.
  const fb = key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
  const foot = chromeless ? '' : html`<footer class="foot"><span>${t('layout.footer.tagline')}</span><a href="/safety">${t('layout.footer.safety')}</a><a href="/parents"${fb('layout.footer.parents')}>${t('layout.footer.parents')}</a>${out || staff ? html`<a href="/teachers"${fb('layout.footer.teachers')}>${t('layout.footer.teachers')}</a>` : ''}${out ? html`<a href="/teachers#start"${fb('layout.footer.schools')}>${t('layout.footer.schools')}</a>` : ''}${out || staff ? html`<a href="/research"${fb('research.footer')}>${t('research.footer')}</a><a href="/compliance"${fb('compliance.footer')}>${t('compliance.footer')}</a>` : ''}${config.contactEmail ? html`<a href="/parents#contact">${t('layout.footer.contact')}</a>` : ''}${grownup ? '' : html`<a href="/sdk/">${t('layout.footer.builders')}</a>`}${legalReader(u) ? html`<a href="/terms"${fb('layout.footer.terms')}>${t('layout.footer.terms')}</a>` : ''}<a href="/privacy"${fb('layout.footer.privacy')}>${t('layout.footer.privacy')}</a>${out && familiesOn(req) ? html`<a href="/plans"${fb(tabKey(t, 'plans'))}>${t(tabKey(t, 'plans'))}</a>` : ''}<a href="${grownup ? '/family/account#language' : '/me/settings#language'}" class="foot-lang">${ico('🌐', { size: 16 })} ${info.name}</a>${out ? html`<div class="foot-theme"><span id="foot-theme-head">${t('layout.theme.title')}:</span>${themeLinks(req, { cls: 'foot-themes', labelledby: 'foot-theme-head' })}</div>` : ''}</footer>`;
  const backHtml = back ? html`<a class="backlink" href="${back}"><span class="flip" aria-hidden="true">←</span> ${backLabel || t('layout.back')}</a>` : '';
  // A sign-in that just ended (timed out, or ended on another device) is mentioned once, on whatever page comes next; the
  // sign-in page says it itself.
  const ended = !chromeless && req.sessionEnded && req.path !== '/login' ? html`<p class="notice warn pagenote" role="status">${tHtml(t, 'layout.signedOut', { href: `/login?next=${encodeURIComponent(req.originalUrl)}` })}</p>` : '';
  // A build that ended while the builder was away (the page was closed, or they signed out) is mentioned once, on the next
  // page they open. Only for builds they sent themselves; opening that game's Studio first counts as seeing it.
  const news = !chromeless && u && !u.is_guest ? buildNews(t, u) : '';
  // A parent-made account: the first-sign-in card until the child answers it, and the one-time "new password" note.
  const made = !chromeless && u && !u.is_guest ? html`${pwResetNote(req, t)}${madeCard(req, t)}` : '';
  // Staff (and the platform admin) who signed in with a short password are asked for a longer one on every page.
  const shortPw = !chromeless && u && u.password_short && longPasswordKind(u) ? html`<p class="notice warn pagenote">${tHtml(t, accountKind(u) === 'grownup' ? 'layout.shortPasswordGrownup' : 'layout.shortPassword', { min: STAFF_PASSWORD_MIN, href: grownup ? '/family/account#password' : '/me/settings#password' })}</p>` : '';
  const oc = u && !u.is_guest ? companionPage(req, { bare: chromeless, companion, scripts }) : null;
  // The companion's microphone (tap to speak) needs this page, and only this page, to allow it ('self', never '*'):
  // only for Teacher plan staff on a page with the bubble; every other page keeps the site's microphone=().
  if (oc && req.res && !req.res.headersSent) { const pp = String(req.res.get('Permissions-Policy') || ''); if (pp.includes('microphone=()')) req.res.set('Permissions-Policy', pp.replace('microphone=()', 'microphone=(self)')); }
  // The greeting uses the name the site already shows this teacher (their own, from the header): the first word.
  if (oc) oc.name = String(myName || '').trim().split(/\s+/)[0].slice(0, 40);
  if (oc) { scripts = [...scripts, '/js/companion.js']; i18n = [...i18n, 'js.oomba-chat', 'js.companion-greet', 'js.companion-build']; head = `${head}<link rel="stylesheet" href="/css/oomba-chat.css?v=${VERSION}"><link rel="stylesheet" href="/css/companion.css?v=${VERSION}"><link rel="stylesheet" href="/css/companion-build.css?v=${VERSION}">`; }
  // Scripts a feature adds to every page for some people (onEveryPage: Homeroom's "Your class is in Homeroom" prompt).
  if (u && !u.is_guest && !chromeless) for (const fn of everyPage) { const s = fn(req); if (s && !scripts.includes(s)) scripts = [...scripts, s]; }
  const prefixes = ['js.app', ...scripts.map(s => (s.match(/^\/js\/([\w-]+)\.js$/) || [])[1]).filter(Boolean).map(n => `js.${n}`), ...i18n];
  // An explicit Light or Dark choice is on <html> before any CSS loads, so the first paint is right (no flash, no JS).
  const theme = req.theme === 'light' || req.theme === 'dark' ? req.theme : null;
  // The browser's toolbar takes the top bar's colour: one value for a chosen theme, one per device scheme otherwise. The
  // play page's bar is Ink in both themes.
  // (themedBar: a bare page whose bar follows the theme, a Grammar Lab room)
  const inkBar = bare && !themedBar;
  const themeColor = inkBar || theme ? `<meta name="theme-color" content="${BAR_COLORS[inkBar ? 'dark' : theme]}">`
    : `<meta name="theme-color" content="${BAR_COLORS.light}" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="${BAR_COLORS.dark}" media="(prefers-color-scheme: dark)">`;
  const fullTitle = title ? t('layout.titleWith', { title }) : t('layout.titleHome');
  const desc = clip(description || t('layout.description'), 160);
  const strings = jsonData('i18n', { lang: locale, dir: info.dir, intl: info.intl, strings: clientStrings(locale, [...new Set(prefixes)], { teacher: !!req.teacherWords }) });
  return `<!doctype html>
<html lang="${esc(locale)}" dir="${esc(info.dir)}"${theme ? ` data-theme="${theme}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover${keyboard ? ', interactive-widget=resizes-content' : ''}">
<meta name="color-scheme" content="${theme || 'light dark'}">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
${seoHead(req, seo, { title: fullTitle, description: desc })}
${themeColor}
<link rel="icon" href="/favicon.ico?v=${ICONS_V}" sizes="32x32">
<link rel="icon" href="/icons/icon.svg?v=${ICONS_V}" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=${ICONS_V}">
<link rel="manifest" href="/manifest.webmanifest?v=${ICONS_V}">
<link rel="preload" href="/fonts/bricolage-grotesque-latin-opsz-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/app.css?v=${VERSION}">
${head}
</head>
<body class="${esc(bodyClass)}" data-user="${u ? esc(u.id) : ''}" data-guest="${u && u.is_guest ? '1' : ''}"${oc ? ` data-oc="${esc(JSON.stringify(oc))}"` : ''}>
${nav}
<main id="main"${bare ? '' : mid ? ' class="wrap mid"' : ' class="wrap"'}>${ended}${news}${made}${shortPw}${backHtml}${body}</main>
${foot}
<div class="toasts" role="status" aria-live="polite" id="toasts"></div>
${strings}
<script type="module" src="/js/app.js?v=${VERSION}"></script>
${scripts.map(s => `<script type="module" src="${esc(s)}?v=${VERSION}"></script>`).join('\n')}
</body>
</html>`;
}
// Oomba, the teaching companion (services/companion.js; docs/decisions.md "Oomba teaching companion"): its bubble on
// every teacher page for Teacher plan staff, on every device. Never on a bare page (a game playing, a live player, a quest
// player) unless the page asks for it (the class dashboard's teacher screen: companion 'dash', at the end of its layout
// bar), never on a print page or a student view of a lesson. One chat everywhere: a Figures worksheet and the
// math boards have no panel of their own, the companion offers their workflow there (their page scripts register it:
// public/js/oomba-bus.js). The dashboard hides it again in Projector and Eyes up (public/js/companion.js).
// The live host room (/live/host/<id>) has it too (the owner's live audit, 27 Nov 2026: "missing in the live host
// room"): its page asks for it (companion 'live'), the bubble sits at the bottom left there, clear of the room's
// controls and the join code, and hides in full screen (public/js/companion.js). Its sub-pages (the teacher's phone
// view) do not. Studio (/studio/<id>) has its own "Chat with the Builder" beside the game, so no Oomba bubble there:
// two chats on one page confused (docs/decisions.md "Oomba makes it, then reports what it checked"). The one exception
// (docs/decisions.md "Builder in the chat (phase 3): Oomba in Studio"): a teacher who builds in the chat, on a game
// they own, gets the Oomba chat docked in place of Studio's Builder column; the Studio route checks that and asks for
// it (companion 'studio'). Everyone else, and every other studio page, keeps no bubble there.
const NO_COMPANION = /(^|\/)print(\/|$)|^\/class\/[^/]+\/lessons\/|^\/play\/|^\/live\/(play|frame|cohost)\/|^\/live\/host\/[^/]+\/|^\/number-quest\/|^\/cs-quest\/play/;
const STUDIO = /^\/studio(\/|$)/;
const OWN_CHAT = [];
/** The page as the companion's first message describes it (checked again on the server: services/companion.js pageOf). */
export function companionPage(req, { bare = false, companion = null, scripts = [] } = {}) {
  if (companion === false || (bare && companion !== 'dash' && companion !== 'live')) return null;
  const p = req.path || '';
  if (NO_COMPANION.test(p) || scripts.some(x => OWN_CHAT.includes(x))) return null;
  if (!companionFor(req.user)) return null;
  if (STUDIO.test(p)) {
    const st = companion === 'studio' ? /^\/studio\/([A-Za-z0-9_-]{1,64})$/.exec(p) : null;
    return st ? { type: 'game', gameId: st[1] } : null;
  }
  const fs = /^\/figures\/worksheets\/([A-Za-z0-9_-]{1,64})$/.exec(p);
  if (fs && fs[1] !== 'new') return { type: 'figures-sheet', sheetId: fs[1] };
  if (/^\/manip/.test(p)) return { type: 'tools' };
  const bk = /^\/library\/make\/([A-Za-z0-9_-]{6,40})$/.exec(p);
  if (bk) return { type: 'book', bookId: bk[1] };
  // a class's Homeroom: the day plan's tools there (checked again on the server: services/companion.js pageOf)
  const hr = /^\/class\/([A-Za-z0-9_-]{1,64})\/hub\/?$/.exec(p);
  if (hr) return { type: 'homeroom', classId: hr[1] };
  const m = /^\/class\/([A-Za-z0-9_-]{1,64})(\/dashboard)?/.exec(p);
  if (m) return { type: m[2] ? 'dashboard' : 'class', classId: m[1] };
  const cls = typeof (req.query || {}).class === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(req.query.class) ? req.query.class : undefined;
  const type = /^\/library|^\/read$/.test(p) ? 'library' : /^\/teach/.test(p) ? 'teach' : /^\/build/.test(p) ? 'build' : /^\/figures/.test(p) ? 'figures' : /^\/school/.test(p) ? 'school' : /^\/live/.test(p) ? 'live' : 'other';
  return { type, ...(cls ? { classId: cls } : {}) };
}
/** The one-time "✨ Your game “X” is ready!" note (builder/turns.js notices), marked as told once drawn. */
function buildNews(t, u) {
  let list = [];
  try { list = notices(u.id); } catch { return ''; }   // never break a page over a note
  if (!list.length) return '';
  markNotified(list.map(n => n.id));
  const one = list.length === 1 ? list[0] : null;
  const msg = one ? tHtml(t, `layout.build.${one.kind}`, { title: `\u2068${one.title}\u2069`, href: `/studio/${one.gameId}` }) : tHtml(t, 'layout.build.many', { href: '/build' });
  const emo = { ready: '✨', question: '💬', stopped: '⚠️' }[one ? one.kind : 'ready'] || '✨';
  return html`<p class="notice ${one && one.kind === 'stopped' ? 'warn' : 'good'} pagenote" role="status">${ico(emo, { size: 20 })} ${msg}</p>`;
}
// One page with views (docs/decisions.md "Homeroom: one page, three views"): a route marks its page as one view of a
// class (req.classView = { c, view }); the feature that owns the views registers how such a page is wrapped (the shared
// bar and the view area) and whether this request asks only for the view (the X-View header). The layout imports none
// of it, as with onEveryPage.
let viewShell = null;
export const setViewShell = fn => { viewShell = fn; };
/** Only what a view needs when it is swapped into a page that is already open: its content, its stylesheets, its
 *  scripts (the same ?v= addresses the page itself would load), the strings those scripts use, the title and the
 *  body's classes. No site bar, no Oomba chat (the page already has them). */
export function viewFragment(req, { title = '', body = '', scripts = [], head = '', bodyClass = '', i18n = [] } = {}) {
  const t = tReq(req), locale = req.locale || DEFAULT_LOCALE;
  const prefixes = [...scripts.map(s => (s.match(/^\/js\/([\w-]+)\.js$/) || [])[1]).filter(Boolean).map(n => `js.${n}`), ...i18n];
  return { title: title ? t('layout.titleWith', { title }) : t('layout.titleHome'), body: String(body), head: String(head || ''), bodyClass,
    scripts: scripts.map(s => `${s}?v=${VERSION}`), strings: clientStrings(locale, [...new Set(prefixes)], { teacher: !!req.teacherWords }) };
}
export const page = (req, res, opts, status = 200) => {
  const v = viewShell && req.classView && status === 200 ? viewShell(req, res, opts) : null;
  if (v) res.vary('X-View');
  if (v && v.fragment) return res.set('Cache-Control', 'no-store').json({ ...viewFragment(req, v.opts), ...v.extra });
  return res.status(status).type('html').send(layout(req, v ? v.opts : opts));
};
export function notFound(req, res, msg = null) {
  const t = tReq(req);
  return page(req, res, { title: t('errors.notFound.title'), body: html`<div class="empty"><div class="emo">${ico('🧭', { size: 64 })}</div><h1>${t('errors.notFound.heading')}</h1><p>${msg || t('errors.notFound.text')}</p><a class="btn btn-primary" href="/">${t('errors.goHome')}</a></div>` }, 404);
}
