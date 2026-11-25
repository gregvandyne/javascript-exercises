// The Teacher plan trial emails in English (docs/decisions.md "Trial emails"). The owner approved this copy (November
// 2026); changes from it are marked "accuracy", "owner's request" or "update (Nov 2026)" here and in the decisions entry.
// Another language is a file like this one (server/emails/trial-<locale>.js) registered in
// server/services/email-templates.js; until a language has one, its teachers get English.
//
// Blocks: { p } a paragraph, { ol } / { ul } a list, { cta: { label, path } } a button to a page of the site (UTM
// parameters are added), { tour } the walkthrough-call offer. Inside text: **bold**, and {firstName} / {trialEndDate} / {trialDays}.
// An email address in the text becomes a mailto link in the HTML part.
// A block, or a list item written { li, when, unless }, may depend on what is true for this teacher today
// (email-templates.js FEATURES, filled in by services/nudges.js renderFor): `when` names features that must all be on,
// `unless` features that must all be off. hasClass: the teacher teaches a class; classroom: Google Classroom sync is on
// (GOOGLE_CLASSROOM with Sign in with Google); tools: the Teacher plan's teaching tools, the Manipulatives and Figures,
// are on for plan holders (paid plans public, MANIPULATIVES and FIGURES on); chat: the Oomba chat is on for them
// (COMPANION, paid plans public, their school hasn't turned it off). A feature not given is off, so a line about it is
// left out rather than promised.
//
// update (Nov 2026): the whole sequence was checked against the app as it is after "Focus: teaching tools first",
// "Classroom focus: the Builder without the kit", "Learn and Read" and "No public games" (docs/decisions.md). Homeroom is
// not mentioned anywhere: it is not launched (HOMEROOM plus HOMEROOM_USERS; privacy update and lawyer review first).

// Owner's request (November 2026): offer a walkthrough call in #1, #2 and #5, and a short line in #3.
const TOUR = "Want a quick tour? I'm happy to hop on a 15-minute call and walk you through the platform. Just reply with a couple of times that work.";
// update (Nov 2026): Google Classroom's connect is one consent from the class page (the class header's Connections),
// and only while Classroom sync is on in production.
const CLASSROOM = 'Using Google Classroom? Connect it from your class page to bring in your roster and send grades back.';

export default {
  locale: 'en',
  dateLocale: 'en-US',
  greeting: 'Hi {firstName},',
  greetingNoName: 'Hi there,',
  signFull: ['Greg', 'Founder, Oomba Academy'],
  signShort: ['Greg'],
  footerWhy: "You're getting this because you started a free trial on Oomba Academy",
  unsubscribe: 'Unsubscribe',
  steps: {
    welcome: {
      // update (Nov 2026): the owner's naming: for teachers a single game is now a "lesson" (multi-step Lessons are
      // "lesson plans"); students still see games. Was "Your first game" / "Paste a lesson, get a game ...".
      subject: "You're in! Your first lesson takes 2 minutes",
      preview: 'Paste what you already teach, get a lesson your class will beg to play.',
      sign: 'full',
      blocks: [
        // update (Nov 2026): the trial starts by itself at sign-up now (no "Start free trial" step), so "is on" names
        // the Teacher plan and says there is nothing to set up.
        { p: "Welcome to Oomba Academy! Your {trialDays}-day free trial of the Teacher plan is on, with nothing to set up. There's no card on file, so nothing happens unless you decide to stay." },
        { p: 'The fastest way to see what Oomba can do:' },
        { ol: [
          // update (Nov 2026): the sign-up's "Add your classes" step is required and comes before the trial starts, so
          // most trial teachers already have a class: they get "share the code" instead of "make a class". The class's
          // Students tab also makes school accounts with printable login cards from typed names.
          { li: "**Bring your students in:** your class is ready. Share its join code, or type your students' names to print login cards. No student emails needed.", when: 'hasClass' },
          { li: "**Make a class:** it takes a minute. Share its join code, or type your students' names to print login cards. No student emails needed.", unless: 'hasClass' },
          // update (Nov 2026): the Builder no longer turns a lesson into a game you can host live (its classroom games
          // are played on the board or on each device; "Classroom focus"). "Turn a lesson into a game" (/teach/make) is
          // the path that matches these words: paste or upload a lesson, Oomba drafts questions, you check them, then
          // "Host a live game now".
          // update (Nov 2026): "lesson" for a single game (the owner's naming); the step doesn't quote a button label.
          "**Build a lesson from what you teach:** paste your notes, or upload them as a PDF. Oomba drafts the questions, and you check every answer before students see them.",
          '**Host it live:** run it from your screen as a warm-up or exit ticket. Students join with a code on any device.',
        ] },
        { p: CLASSROOM, when: 'classroom' },
        // update (Nov 2026): was /build (the Builder's own page); the steps above are /teach/make's.
        { cta: { label: 'Build my first lesson →', path: '/teach/make' } },
        // update (Nov 2026): what the trial opens. The Manipulatives and Figures are Teacher plan only, under Teaching
        // tools in the teacher's top bar ("Figures and the Manipulatives: Teacher plan only").
        { p: 'Your trial also opens **Teaching tools** in your top bar: virtual math Manipulatives for the board or a live room with your class, and Figures for math and science worksheets.', when: 'tools' },
        { tour: TOUR },
        { p: 'Questions? Just reply, it comes straight to me. For anything time-sensitive, email Greg@oomba.ai.' },
      ],
    },
    // Sent on day 2 only to a teacher with no class yet (services/nudges.js skipReason 'has_class').
    class: {
      subject: 'Your class is one code away',
      preview: 'Students join in seconds, with no email addresses needed.',
      sign: 'short',
      blocks: [
        { p: "Quick nudge: you haven't set up a class yet, and that's where Oomba comes alive." },
        // update (Nov 2026): login cards from typed names are the other way in (the class's Students tab).
        { p: "Make a class, then share its join code or type your students' names to print login cards. It works on Chromebooks, iPads and phones, right in the browser." },
        { p: CLASSROOM, when: 'classroom' },
        // update (Nov 2026): every class has a Class dashboard (no plan needed); these are four of its widgets.
        { p: 'Every class also comes with a Class dashboard for your board, with a timer, your schedule, class jobs and points.' },
        // accuracy: the approved "It's the moment most teachers tell us the room lights up" is a claim we can't back yet.
        // update (Nov 2026): "host a lesson live" (the owner's naming) for "try a live game".
        { p: "Then host a lesson live tomorrow as a 5-minute warm-up. It's often the moment the room lights up." },
        { cta: { label: 'Set up my class →', path: '/teach' } },
        { tour: TOUR },
      ],
    },
    ideas: {
      // update (Nov 2026): was "3 ways teachers are using Oomba this week", a claim about what teachers do that we
      // have no numbers behind; and its preview named student-built games, which this email no longer leads with.
      subject: '3 easy wins for your week',
      preview: 'A live warm-up, a hands-on lesson and a story to share.',
      sign: 'short',
      blocks: [
        { p: 'Here are three easy wins for your week:' },
        { ul: [
          // update (Nov 2026): "Turn a lesson into a game" by name, the path that hosts live (see the welcome).
          "**Monday warm-up:** paste last week's notes into a new lesson and host it live. Retrieval practice that feels like play.",
          // update (Nov 2026): the teaching tools come first since "Focus: teaching tools first". Live rooms: each
          // student works on their own board while the teacher watches.
          { li: '**Hands-on math:** open the Manipulatives from Teaching tools. Put a board on the screen, or start a live room where every student works on their own board.', when: 'tools' },
          // update (Nov 2026): without the tools, the Builder's review game. "Paste your unit's key ideas" stays true
          // (the Builder's lesson step takes a file or a description); the games are plain classroom formats now.
          { li: "**Review day:** add your unit's notes in Build lessons and make a review lesson for the board, like a quiz, bingo or a memory match.", unless: 'tools' },
          // update (Nov 2026): replaces "Students as makers ... swap and play": the Story Library (Read) and its book
          // maker, open to every teacher, are what the app now offers here.
          '**Story time:** pick a picture book from the Story Library, read it together or assign it, or make your own book with Oomba.',
        ] },
        // update (Nov 2026): the courses paragraph is gone. COURSES is off in production ("Focus: teaching tools
        // first"): Number Quest, CS Quest and Cyber Defenders answer 404 and are not on /learn. In its place, the Oomba
        // chat (searchGames, searchBooks, startBuild, the book maker), for teachers who have it.
        { p: 'Planning the week? Ask Oomba, the chat on your teacher pages. It can suggest lessons and books for your topic and grade, and start a lesson or a book with you.', when: 'chat' },
        // update (Nov 2026): was "Explore courses →" to /learn (no courses there now).
        { cta: { label: 'Try the Manipulatives →', path: '/manipulatives' }, when: 'tools' },
        { cta: { label: "Make Monday's warm-up →", path: '/teach/make' }, unless: 'tools' },
        { tour: "Prefer a guided tour? Reply and we'll find 15 minutes." },
      ],
    },
    ending: {
      subject: 'Your trial ends in 3 days',
      // update (Nov 2026): classes, games and progress are kept with or without the plan (the trial ends by Stripe
      // cancelling it: only the plan's extras stop, nothing is deleted or locked). The preview said otherwise.
      preview: 'Keep the Teacher plan for one simple yearly price.',
      sign: 'short',
      blocks: [
        { p: 'Your free trial ends on **{trialEndDate}**.' },
        // update (Nov 2026): was "To keep everything (your classes, the games you've made, your students' progress) add
        // a card", which #5 contradicts ("your classes are saved"). Now: what the plan keeps, then what stays anyway.
        { p: "To keep the Teacher plan's extras (the Manipulatives, Figures, the Oomba chat and more Builder messages a day for you and your classes), add a card and stay on the plan.", when: ['tools', 'chat'] },
        { p: "To keep the Teacher plan's extras (the Manipulatives, Figures and more Builder messages a day for you and your classes), add a card and stay on the plan.", when: 'tools', unless: 'chat' },
        { p: "To keep the Teacher plan's extras, like more Builder messages a day for you and your classes, add a card and stay on the plan.", unless: 'tools' },
        { p: "It's one yearly price for unlimited students, with no per-student fees. Your classes, the lessons you've made and your students' progress stay either way." },
        { p: "If your school would rather pay by invoice or purchase order, just reply and I'll set it up." },
        // update (Nov 2026): was "Keep my classes →" (they are kept anyway).
        { cta: { label: 'Keep the Teacher plan →', path: '/me/settings#teacher-plan' } },
        { p: "Not the right fit? No problem. Nothing is charged, and I'd love to hear what was missing (just hit reply)." },
      ],
    },
    ended: {
      subject: 'Your trial has ended, but your classes are saved',
      preview: 'Pick up right where you left off, anytime.',
      sign: 'short',
      blocks: [
        { p: "Your Oomba trial has ended. Nothing was charged. Your classes and lessons are saved, so if you come back, everything's right where you left it." },
        // update (Nov 2026): what stops, and that students are never cut off ("Students never pay": an assigned Figure
        // step and a running Manipulatives room keep working when the plan lapses).
        { p: "The Teacher plan's extras, like the Manipulatives and Figures, are paused for now. Anything you already assigned keeps working for your students.", when: 'tools' },
        // update (Nov 2026): was "Reactivate my classes →": the classes never stopped. /trial offers a used trial
        // "Get the Teacher plan".
        { cta: { label: 'Get the Teacher plan →', path: '/trial' } },
        { tour: TOUR },
        { p: 'And if something got in the way, reply and tell me. I read every message.' },
      ],
    },
    // update (Nov 2026): "games" became "lessons" in #4, #5 and the thank-you (the owner's naming).
    // On conversion the sequence stops and this goes instead (the owner's brief: "a short thank-you"; new copy).
    thanks: {
      subject: "You're all set!",
      preview: 'Thanks for staying with Oomba Academy.',
      sign: 'short',
      blocks: [
        { p: "Thank you for staying with Oomba Academy! You're on the Teacher plan now, and your classes, lessons and students' progress carry on just as they are." },
        { p: "If there's anything you'd like to see in Oomba, or anything that gets in your way, just reply. It comes straight to me." },
        { cta: { label: 'Go to my classes →', path: '/teach' } },
      ],
    },
  },
};
