// Kit patch releases (server/services/kit.js KIT_PATCHES): a saved game pinned to an older kit is served on its patch
// release with the settings fixes. Through the real frame document code: the settings switches keep their knob inside
// the track (frame-fit's knob rule), on and off, light and dark, LTR and RTL, and the settings button is a cog.
import { test, expect } from '@playwright/test';
import { frameDocument } from '../../server/services/frame.js';
import { KIT_PATCHES, kitTag } from '../../server/services/kit.js';
import { switchProblems } from './frame-fit.js';

const GAME = v => `${kitTag(v)}\n<script>Oomba.game({ api: 1, title: 'Old game', controls: 'none' });</script>`;

for (const [from, to] of Object.entries(KIT_PATCHES)) {
  test(`a game saved on kit ${from} is served on ${to}: switches stay in their track, settings is a cog`, async ({ browser }) => {
    for (const colorScheme of ['dark', 'light']) for (const lang of ['en', 'ar']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme });
      const page = await ctx.newPage();
      const doc = frameDocument(GAME(from), { user: { displayName: 'Kid', isGuest: true, lang }, game: { id: 'x', title: 'Old game' }, save: {}, canSave: false, preview: true });
      await page.route('**/__kit-patch', r => r.fulfill({ contentType: 'text/html', body: doc }));
      await page.goto('/__kit-patch');
      await expect.poll(() => page.evaluate(() => window.Oomba && window.Oomba.version)).toBe(to);
      const d = await page.locator('.ok-corner button path').evaluateAll(ps => ps.map(p => p.getAttribute('d')).join(' '));
      expect(d).toContain('z');                       // the cog (a closed outline)
      expect(d).not.toContain('M12 2.8v2.8');         // not the old ringed dot with rays (read as light/dark)
      await page.locator('.ok-corner button').first().click();   // the title screen's settings button
      await page.locator('.ok-switch').first().waitFor();
      await page.locator('.ok-switch').nth(1).click();   // one on, the rest as they were
      await page.waitForTimeout(250);
      expect(await switchProblems(page.mainFrame()), `${colorScheme} ${lang}`).toEqual([]);
      await ctx.close();
    }
  });
}
