// AI spending cap: costs from usage, daily/monthly limits, and what happens when the cap is reached.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
const budget = await import('../../server/services/ai-budget.js');
const { anthropic, resting } = await import('../../server/builder/anthropic.js');
const { providerName } = await import('../../server/builder/agent.js');
const { q } = await import('../../server/db.js');

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const reset = () => q.run('DELETE FROM ai_spend');

test('cost follows each model\'s prices, including cache reads and writes', () => {
  near(budget.costOf('claude-sonnet-5-5', { input_tokens: 1e6, output_tokens: 1e6 }), 12);
  near(budget.costOf('claude-opus-5-5', { input_tokens: 1e6, output_tokens: 1e6 }), 24);
  near(budget.costOf('claude-haiku-5-5', { input_tokens: 1e6, output_tokens: 1e6 }), 0.6);
  near(budget.costOf('claude-sonnet-5-5', { cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6 }), 0.2 + 2.5);
  assert.ok(budget.costOf('some-new-model', { output_tokens: 1e6 }) >= 50, 'unknown models are priced high, never free');
  near(budget.costOf('claude-sonnet-5-5', undefined), 0);
});

test('spend adds up per day and per month, and the cap flips at the limit', () => {
  reset();
  const saved = { d: config.aiDailyBudgetUsd, m: config.aiMonthlyBudgetUsd };
  try {
    config.aiDailyBudgetUsd = 1; config.aiMonthlyBudgetUsd = 3;
    budget.recordUsage('claude-sonnet-5-5', { output_tokens: 50000 }, '2026-01-10');   // $0.50
    assert.equal(budget.status('2026-01-10').ok, true);
    budget.recordUsage('claude-sonnet-5-5', { output_tokens: 50000 }, '2026-01-10');   // $1.00 today
    let s = budget.status('2026-01-10');
    assert.equal(s.ok, false); assert.equal(s.reason, 'daily'); near(s.today, 1); assert.equal(s.todayCalls, 2);
    assert.equal(budget.status('2026-01-11').ok, true, 'a new day starts fresh');
    budget.recordUsage('claude-sonnet-5-5', { output_tokens: 200000 }, '2026-01-11');  // $2.00 -> month $3.00
    s = budget.status('2026-01-12');
    assert.equal(s.ok, false); assert.equal(s.reason, 'monthly'); near(s.month, 3);
    assert.equal(budget.status('2026-02-01').ok, true, 'a new month starts fresh');
  } finally { config.aiDailyBudgetUsd = saved.d; config.aiMonthlyBudgetUsd = saved.m; reset(); }
});

test('once the cap is reached no Claude client is handed out and the Builder goes offline', () => {
  reset();
  const saved = { key: config.anthropicKey, d: config.aiDailyBudgetUsd };
  try {
    config.anthropicKey = 'sk-test-not-real';
    config.aiDailyBudgetUsd = 0.10;
    assert.ok(anthropic(), 'under the cap: a client');
    assert.equal(resting(), false);
    assert.equal(providerName(), 'claude');
    budget.recordUsage('claude-opus-5-5', { output_tokens: 10000 });   // $0.20 today
    assert.equal(anthropic(), null, 'over the cap: no client, so every caller takes its fallback path');
    assert.equal(resting(), true);
    assert.equal(providerName(), 'mock');
    config.aiDailyBudgetUsd = 0;
    reset();
    assert.equal(anthropic(), null, 'a $0 budget turns the AI off');
  } finally { config.anthropicKey = saved.key; config.aiDailyBudgetUsd = saved.d; reset(); }
});
