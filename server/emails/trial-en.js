// The Teacher plan trial emails in English (docs/decisions.md "Trial emails"). The owner approved this copy (November
// 2026); changes from it are marked "accuracy" or "owner's request" here and in the decisions entry. Another language is
// a file like this one (server/emails/trial-<locale>.js) registered in server/services/email-templates.js; until a
// language has one, its teachers get English.
//
// Blocks: { p } a paragraph, { ol } / { ul } a list, { cta: { label, path } } a button to a page of the site (UTM
// parameters are added), { tour } the walkthrough-call offer. Inside text: **bold**, and {firstName} / {trialEndDate} / {trialDays}.
// An email address in the text becomes a mailto link in the HTML part.

// Owner's request (November 2026): offer a walkthrough call in #1, #2 and #5, and a short line in #3.
const TOUR = "Want a quick tour? I'm happy to hop on a 15-minute call and walk you through the platform. Just reply with a couple of times that work.";

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
      subject: "You're in! Your first game takes 2 minutes",
      preview: 'Paste a lesson, get a game your class will beg to play.',
      sign: 'full',
      blocks: [
        { p: "Welcome to Oomba Academy! Your {trialDays}-day free trial is on. There's no card on file, so nothing happens unless you decide to stay." },
        { p: 'The fastest way to see what Oomba can do:' },
        { ol: [
          '**Make a class:** it takes a minute, and students join with a code. No student emails needed.',
          "**Turn a lesson into a game:** open the Builder, paste a lesson or describe what you're teaching, and it builds a playable game.",
          '**Play it live:** host it from your screen as a warm-up or exit ticket.',
        ] },
        { cta: { label: 'Make my first game →', path: '/build' } },
        { tour: TOUR },
        { p: 'Questions? Just reply, it comes straight to me. For anything time-sensitive, email Greg@oomba.ai.' },
      ],
    },
    class: {
      subject: 'Your class is one code away',
      preview: 'Students join in seconds, with no email addresses needed.',
      sign: 'short',
      blocks: [
        { p: "Quick nudge: you haven't set up a class yet, and that's where Oomba comes alive." },
        { p: 'Make a class, share the join code, and your students are in. It works on Chromebooks, iPads and phones, right in the browser.' },
        // accuracy: the approved "It's the moment most teachers tell us the room lights up" is a claim we can't back yet.
        { p: "Then try a live game tomorrow as a 5-minute warm-up. It's often the moment the room lights up." },
        { cta: { label: 'Set up my class →', path: '/teach' } },
        { tour: TOUR },
      ],
    },
    ideas: {
      subject: '3 ways teachers are using Oomba this week',
      preview: 'Warm-ups, review days and student-built games.',
      sign: 'short',
      blocks: [
        { p: 'Here are three easy wins for your week:' },
        { ul: [
          '**Monday warm-up:** host a live game on what you taught last week. Retrieval practice that feels like play.',
          "**Review day:** paste your unit's key ideas into the Builder and let students play the game before the test.",
          '**Students as makers:** have each student build a game that teaches a topic, then swap and play. They learn it twice.',
        ] },
        // accuracy: the approved "each with lesson plans" is true of CS Quest only (23 lessons of 45 minutes); Number
        // Quest and Cyber Defenders come with teacher notes.
        { p: 'There are ready-made courses too: Number Quest (math), CS Quest (computer science) and Cyber Defenders (online safety). CS Quest comes with full 45-minute lesson plans, and the other two with teacher notes.' },
        { cta: { label: 'Explore courses →', path: '/teach/lessons' } },
        { tour: "Prefer a guided tour? Reply and we'll find 15 minutes." },
      ],
    },
    ending: {
      subject: 'Your trial ends in 3 days',
      preview: 'Keep your classes, games and progress for one simple yearly price.',
      sign: 'short',
      blocks: [
        { p: 'Your free trial ends on **{trialEndDate}**.' },
        { p: "To keep everything (your classes, the games you've made, your students' progress) add a card and stay on the Teacher plan. It's one yearly price for unlimited students, with no per-student fees." },
        { p: "If your school would rather pay by invoice or purchase order, just reply and I'll set it up." },
        { cta: { label: 'Keep my classes →', path: '/teach#teacher-plan' } },
        { p: "Not the right fit? No problem. Nothing is charged, and I'd love to hear what was missing (just hit reply)." },
      ],
    },
    ended: {
      subject: 'Your trial has ended, but your classes are saved',
      preview: 'Pick up right where you left off, anytime.',
      sign: 'short',
      blocks: [
        { p: "Your Oomba trial has ended. Nothing was charged. Your classes and games are saved, so if you come back, everything's right where you left it." },
        { cta: { label: 'Reactivate my classes →', path: '/trial' } },
        { tour: TOUR },
        { p: 'And if something got in the way, reply and tell me. I read every message.' },
      ],
    },
    // On conversion the sequence stops and this goes instead (the owner's brief: "a short thank-you"; new copy).
    thanks: {
      subject: "You're all set!",
      preview: 'Thanks for staying with Oomba Academy.',
      sign: 'short',
      blocks: [
        { p: "Thank you for staying with Oomba Academy! You're on the Teacher plan now, and your classes, games and students' progress carry on just as they are." },
        { p: "If there's anything you'd like to see in Oomba, or anything that gets in your way, just reply. It comes straight to me." },
        { cta: { label: 'Go to my classes →', path: '/teach' } },
      ],
    },
  },
};
