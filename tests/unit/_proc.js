// Real server processes for tests (deploy.test.js, builder-restart.test.js): node server/index.js with its own env.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';

export const ROOT = path.resolve(import.meta.dirname, '../..');
/** A port the OS says is free right now. */
export const freePort = () => new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
/** JSON log lines of a server's output. */
export const lines = text => text.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));

/**
 * Start node server/index.js with env; resolves { child, port, dataDir, out(), exited } once it listens (or exits).
 * opts: wait (for "listening"), tmp (where a new data folder is made), dataDir (reuse one, e.g. across a restart).
 */
export async function startServer(env = {}, { wait = true, tmp = os.tmpdir(), dataDir = null } = {}) {
  const port = await freePort();
  dataDir = dataDir || fs.mkdtempSync(path.join(tmp, 'srv-'));
  const childEnv = { PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(port), BRB_DATA_DIR: dataDir, BRB_SNAPSHOTS: '0', LOG_REQUESTS: '0', BRB_MOCK_DELAY_MS: '0', ...env };
  const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  const exited = new Promise(r => child.on('exit', code => r(code)));
  if (wait) {
    const t0 = Date.now();
    while (!/"listening"/.test(out)) {
      if (child.exitCode !== null || Date.now() - t0 > 15000) break;
      await new Promise(r => setTimeout(r, 50));
    }
  }
  return { child, port, dataDir, out: () => out, exited };
}
