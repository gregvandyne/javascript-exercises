// Every paid-plan word (server/i18n/billing-keys.js: /plans, the family and grown-up pages, the school Billing tab,
// Spark Packs, the Builder's limit card, the paid wording of /parents and /safety, the footer and the legal pages) is in
// all 12 other languages before BILLING_PUBLIC (docs/billing-go-live.md). en-GB inherits the English.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { billingKeys, billingKeyGaps, BILLING_KEY_PREFIXES } = await import('../../server/i18n/billing-keys.js');
const { dictionary, CODES } = await import('../../server/i18n/index.js');
const { withoutKeys } = await import('../support/i18n-gaps.js');

test('no paid-plan key is missing from any locale', () => {
  const gaps = billingKeyGaps();
  assert.deepEqual(gaps, {}, `translate these before BILLING_PUBLIC:\n${Object.entries(gaps).map(([c, k]) => `${c}: ${k.join(', ')}`).join('\n')}`);
});

test('the list covers every paid-plan area (a renamed prefix would silently shrink it)', () => {
  const keys = billingKeys();
  assert.ok(keys.length > 700, `${keys.length} keys`);
  for (const p of BILLING_KEY_PREFIXES) assert.ok(keys.some(k => k === p || k.startsWith(p.endsWith('.') ? p : `${p}.`)), `no English key under ${p}`);
  for (const k of ['plans.basic.name', 'family.sparks.terms.refund', 'school.billing.tab', 'info.refunds.sparks.li1', 'js.studio.limitCard.askButton', 'info.parents.never.paid1'].filter(k => k in dictionary('en'))) assert.ok(keys.includes(k), k);
  assert.ok(keys.includes('info.refunds.sparks.li1') && keys.includes('info.parents.never.paid1'));
  assert.ok(!keys.some(k => k.startsWith('js.play.') || k.startsWith('teachers.')), 'only paid-plan words');
});

test('the check fails when a language lacks one', async () => {
  await withoutKeys('ja', ['family.sparks.terms.refund'], () => {
    assert.deepEqual(billingKeyGaps(), { ja: ['family.sparks.terms.refund'] });
  });
});

test('/refunds\' Spark Packs section is translated, keeps its markup, and names no price', () => {
  const en = dictionary('en'); const ks = Object.keys(en).filter(k => k.startsWith('info.refunds.sparks.')).concat('info.refunds.intro.p3');
  assert.deepEqual(ks.sort(), ['info.refunds.intro.p3', 'info.refunds.sparks.h', 'info.refunds.sparks.li1', 'info.refunds.sparks.li2', 'info.refunds.sparks.li3', 'info.refunds.sparks.li4', 'info.refunds.sparks.li5', 'info.refunds.sparks.p1']);
  for (const code of CODES.filter(c => c !== 'en-GB')) {
    const d = dictionary(code);
    for (const k of ks) {
      assert.ok(d[k], `${code} ${k}`);
      assert.equal((d[k].match(/<b>/g) || []).length, (en[k].match(/<b>/g) || []).length, `${code} ${k}: same bold parts`);
      assert.doesNotMatch(d[k], /[$€£¥]|\d+[.,]\d\d/, `${code} ${k}: no price`);
      if (code !== 'en') assert.notEqual(d[k], en[k], `${code} ${k} is translated`);
    }
  }
});
