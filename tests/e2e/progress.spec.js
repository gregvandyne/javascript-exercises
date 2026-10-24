// Progress end to end, on the demo school (seeded with DEMO_TEACHER_PASSWORD, see playwright.config.js):
// a student marks a step done, answers a question and opens the game from the lesson; the teacher sees it on the
// Progress tab, reads the answer and writes feedback; the student sees the feedback.
import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

const DEMO = 'demo-pass-123';
test.describe.configure({ timeout: 120_000 });

test('student works through a lesson; teacher reads the answer and gives feedback', async ({ browser }) => {
  const s = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await login(s, 'DemoStudent', DEMO);
  await s.goto('/classes'); await s.click('a.classcard');
  await s.click('a.cl-main:has-text("Adding fractions")');
  await expect(s.locator('.lessonprogress')).toContainText('0 of');
  // a reading step: mark it done
  const first = s.locator('.stepcard').first();
  await first.locator('button:has-text("I\'ve done this")').click();
  await expect(s.locator('.stepcard').first()).toHaveClass(/is-done/);
  await expect(s.locator('.lessonprogress')).toContainText('1 of');
  // the game step's Play link carries the lesson, so play time and scores count
  await expect(s.locator('a.btn-big[href*="/play/"]').first()).toHaveAttribute('href', /\?lesson=[^&]+&step=/);
  // the question: answer it
  const q = s.locator('.stepcard:has(.answerform)');
  await q.locator('textarea').fill('Because the slices are the same size, you add the tops: 2 + 3 = 5 eighths.');
  await q.locator('button[type=submit]').click();
  await expect(s.locator('.stepcard:has(.answerform)')).toHaveClass(/is-done/);
  await expect(s.locator('.stepcard:has(.answerform) textarea')).toHaveValue(/2 \+ 3 = 5 eighths/);

  const t = await (await browser.newContext()).newPage();
  await login(t, 'DemoTeacher', DEMO);
  await t.goto('/teach'); await t.click('a.classcard');
  await expect(t.locator('.classtabs a[href$="/progress"] .tabbadge')).toBeVisible();
  await t.click('.classtabs a[href$="/progress"]');
  await expect(t.locator('.gradebook')).toContainText('Demo Student');
  await t.click('.gradebook thead a:has-text("Adding fractions")');
  const card = t.locator('.answercard:has-text("2 + 3 = 5 eighths")');
  await expect(card).toContainText('Demo Student');
  await card.locator('textarea').fill('Great explanation, Demo Student!');
  await card.locator('button[type=submit]').click();
  await expect(t.locator('.answercard:has-text("2 + 3 = 5 eighths")')).toHaveClass(/is-read/);

  await s.reload();
  await expect(s.locator('.feedback')).toContainText('Great explanation, Demo Student!');
});
