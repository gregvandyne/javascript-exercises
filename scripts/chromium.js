// The Chromium the capture scripts launch (how-shots, teach-loop-shots, covers, og-images): BRB_CHROMIUM when it is set
// and exists, else the newest Chromium pre-installed under /opt/pw-browsers (our cloud sandboxes), else undefined so
// Playwright uses its own download. No pinned version: the pre-installed build changes with the sandbox image.
import fs from 'node:fs';
import path from 'node:path';

const PW = '/opt/pw-browsers';
const ver = name => +(/-(\d+)$/.exec(name) || [0, 0])[1];

/** -> an executable path, or undefined. headless: prefer the lighter headless shell (fine for screenshots). */
export function chromiumPath({ headless = false } = {}) {
  const env = process.env.BRB_CHROMIUM;
  if (env && fs.existsSync(env)) return env;
  let dirs = [];
  try { dirs = fs.readdirSync(PW); } catch { return undefined; }
  const kinds = headless ? ['chromium_headless_shell', 'chromium'] : ['chromium', 'chromium_headless_shell'];
  for (const kind of kinds) {
    const found = dirs.filter(d => d.startsWith(`${kind}-`) && ver(d)).sort((a, b) => ver(b) - ver(a));
    for (const d of found) {
      for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell']) {
        const p = path.join(PW, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

/** Options for chromium.launch(): { executablePath } when one was found, merged with extra options. */
export const launchOptions = (extra = {}, opts) => { const exe = chromiumPath(opts); return exe ? { ...extra, executablePath: exe } : { ...extra }; };
