// How Figures worksheets deal and show generator questions (services/figures.js, services/figures-steps.js,
// views/figures-step.js): a currency answer reads "$125" (the answer key, the student's reveal, the teacher's results
// and the blank's unit before it), answers saved as "125 $" show the new way, a student may type "$125"; a re-deal
// gives a different question each time; and questions saved before a generator changed (PAST_GENS) keep their answer.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser } = await import('../../server/auth.js');
const F = await import('../../server/services/figures.js');
const FS = await import('../../server/services/figures-steps.js');
const CAT = await import('../../public/js/figures-catalog.js');
const { figuresStepHtml } = await import('../../server/views/figures-step.js');
const { tEn } = await import('../../server/i18n/index.js');

const boss = createUser({ username: 'FigDealBoss', password: 'secret123', role: 'admin' });
const sheet = items => { const r = F.createWorksheet(boss, { title: 'Dealing', grade: '9', items }); assert.ok(r.id, JSON.stringify(r)); return r.id; };
const itemsOfSheet = id => F.itemsOf(id);
const t = (k, o) => tEn(k, o);

test('a currency unit goes before the number; every other unit after it', () => {
  assert.equal(F.unitText('125', '$'), '$125');
  assert.equal(F.unitText('-3.5', '$'), '-$3.5');
  assert.equal(F.unitText('12', '€'), '€12');
  assert.equal(F.unitText('12', 'N'), '12 N');
  assert.equal(F.unitText('45', '°'), '45°');
  assert.equal(F.unitText('50', '%'), '50%');
  assert.equal(F.unitText('7', ''), '7');
  assert.equal(F.shownAnswer('125 $'), '$125');
  assert.equal(F.shownAnswer('-2.5 $'), '-$2.5');
  assert.equal(F.shownAnswer('12 N'), '12 N');
  assert.equal(F.shownAnswer('B) rises'), 'B) rises');
});

test('dollar generators: the key, the reveal and the results say $125, the blank shows $ before it, "$125" is marked right', () => {
  const dollars = CAT.KINDS.flatMap(K => K.gens).filter(g => g.unit === '$').map(g => g.id).sort();
  assert.deepEqual(dollars, ['costCurves', 'supplyDemand']);
  for (const gid of dollars) {
    const r = F.generate(gid, 4242);
    assert.match(r.answer, /^\$\d/, `${gid}: ${r.answer}`);
    const id = sheet([{ kind: r.kind, gen: gid, seed: 4242 }]), [it] = itemsOfSheet(id);
    assert.equal(it.answer, r.answer);
    const key = F.printHtml({ title: 'Dealing' }, [it], { key: true, sheet: false });
    assert.ok(key.includes(`<p class="fgp-kans" dir="auto">${r.answer}</p>`), key.slice(0, 300));
    assert.doesNotMatch(key, /\d \$/);
    // The lesson step made from it (Assign to class keeps a snapshot): the student's reveal and the teacher's view.
    const snap = FS.snapshot(boss, id); assert.ok(snap.ok);
    const step = { id: `st-${gid}`, items: JSON.stringify(snap.items), of_version: null };
    const v = FS.viewFor(step, {}, null, { teacher: true });
    assert.equal(v.items[0].answer, r.answer);
    const page = String(figuresStepHtml(t, v, { student: { api: '/x' }, stepId: 's' }));
    assert.match(page, /<div class="fs-blank"><span class="fs-unit" dir="ltr">\$<\/span><label/, 'the $ is before the blank');
    assert.equal((page.match(/class="fs-unit"/g) || []).length, 1);
    for (const typed of [String(r.value), `$${r.value}`, `$ ${r.value}`]) assert.ok(FS.isRight(typed, snap.items[0]), typed);
    assert.ok(!FS.isRight(`$${r.value + 1}`, snap.items[0]));
  }
  // Every other unit stays after the blank.
  const cm = { n: 1, question: 'q', unit: 'cm', svg: '', typed: '', type: 'number' };
  assert.match(String(figuresStepHtml(t, { items: [cm], handedIn: false, revealed: false, right: 0, total: 1 }, { student: { api: '/x' }, stepId: 's' })), /<\/label>[\s\S]*<span class="fs-unit" dir="ltr">cm<\/span>/);
});

test('answers saved as "125 $" before the change show as "$125" (worksheets and assigned steps)', () => {
  const id = sheet([{ kind: 'supplyDemand', gen: 'supplyDemand', seed: 4242 }]), [it] = itemsOfSheet(id);
  const old = it.answer.replace(/^\$(.*)$/, '$1 $');
  q.run('UPDATE question_set_items SET answer=? WHERE id=?', old, it.id);
  const [again] = itemsOfSheet(id);
  assert.equal(again.answer, it.answer);
  assert.ok(F.printHtml({ title: 'D' }, [again], { key: true, sheet: false }).includes(`>${it.answer}<`));
  const step = { id: 'st-old', items: JSON.stringify([{ ...FS.snapshot(boss, id).items[0], answer: old }]), of_version: null };
  assert.equal(FS.itemsOf(step)[0].answer, it.answer);
  assert.equal(FS.viewFor(step, {}, null, { teacher: true }).items[0].answer, it.answer);
});

test('20 re-deals in a row of a supplyDemand question give at least 10 different questions, each new', () => {
  const id = sheet([{ kind: 'supplyDemand', gen: 'supplyDemand', seed: 4242 }]);
  const seen = new Set();
  let [prev] = itemsOfSheet(id);
  for (let i = 0; i < 20; i++) {
    assert.ok(F.regenItem(boss, id, prev.id).ok);
    const [cur] = itemsOfSheet(id);
    const deal = JSON.stringify([cur.question, cur.data]);
    assert.notEqual(deal, JSON.stringify([prev.question, prev.data]), `re-deal ${i + 1} changed the question`);
    assert.equal(F.answerOf(cur).value, F.solved('supplyDemand', cur.data).cs);
    seen.add(deal); prev = cur;
  }
  assert.ok(seen.size >= 10, `${seen.size} different questions`);
  // A seed given (the tests' and the API's own) still deals exactly that seed.
  assert.ok(F.regenItem(boss, id, prev.id, 4242).ok);
  assert.equal(JSON.stringify(itemsOfSheet(id)[0].data), JSON.stringify(F.generate('supplyDemand', 4242).data));
});

test('questions saved before a generator changed keep their answer, worked lines and link (PAST_GENS)', () => {
  const pick = (gid, test) => {
    const past = CAT.PAST_GENS[gid][0];
    for (let seed = 1; seed < 200000; seed += 7) {
      const was = F.generate(gid, seed, undefined, past), now = F.generate(gid, seed);
      if (was && now && JSON.stringify(was.data) !== JSON.stringify(now.data) && test(was)) return { seed, was };
    }
    throw new Error(`${gid}: no seed`);
  };
  const cases = [
    ['supplyDemand', w => w.data.supply.at < 0],
    ['freeBody', w => w.question.includes('at 1 m/s²')],
    ['angles', w => w.value === 45],
  ];
  for (const [gid, which] of cases) {
    const { seed, was } = pick(gid, which);
    // As it was saved then: its figure, hide, question, answer and worked lines.
    const id = sheet([{ kind: was.kind, gen: gid, seed, data: was.data, hide: was.hide, question: was.question }]), [it] = itemsOfSheet(id);
    assert.equal(it.gen, gid, `${gid}: still linked to its generator`); assert.equal(it.seed, seed);
    assert.equal(it.answer, was.answer); assert.deepEqual(it.work, was.work);
    const a = F.answerOf(it); assert.ok(a, `${gid}: marked`); assert.equal(a.value, was.value);
    // A teacher's edit of the question text keeps all of it.
    assert.ok(F.updateItem(boss, id, it.id, { question: `${was.question} Show your work.` }).ok);
    const [edited] = itemsOfSheet(id); assert.equal(edited.gen, gid); assert.equal(edited.answer, was.answer);
    // A new deal with the same seed is the current definition.
    assert.ok(F.regenItem(boss, id, it.id, seed).ok);
    assert.equal(JSON.stringify(itemsOfSheet(id)[0].data), JSON.stringify(F.generate(gid, seed).data));
  }
});
