#!/usr/bin/env node
// The Story Builder worker (docs/story-builder.md): its own process, beside the site, on the same data directory.
//   node scripts/story-worker.js            run until stopped (SIGTERM / SIGINT: the story in hand goes back in the queue)
//   node scripts/story-worker.js --once     run the next queued story (if any) and exit
// One story at a time (rendering already uses every core). It talks to the site only through the database (SQLite in
// WAL mode handles a second process on the same machine); the render step is behind server/stories/renderer.js, so
// moving rendering to its own machine later means a remote renderer there, not a different worker.
import os from 'node:os';
import { log } from '../server/services/log.js';
import * as J from '../server/services/story-jobs.js';
import { runStory } from '../server/stories/worker.js';
import { createRenderer } from '../server/stories/renderer.js';

const once = process.argv.includes('--once');
const POLL_MS = Math.max(500, +process.env.STORY_POLL_MS || 3000);
const name = `${os.hostname()}:${process.pid}`;
const renderer = createRenderer();
let stopping = false, current = null;

const stop = sig => {
  if (stopping) return;
  stopping = true;
  log('info', 'story worker stopping', { sig });
  if (current) current.abort();
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
// There is one worker: whatever was running when it last stopped is put back in the queue.
const rec = J.recover({ all: true });
const engine = await renderer.probe().catch(e => ({ engine: null, error: e.message }));
log('info', 'story worker started', { name, renderer: renderer.name, ...engine, ...rec });
while (!stopping) {
  const s = J.claimNext(name);
  if (!s) { if (once) break; await sleep(POLL_MS); continue; }
  current = new AbortController();
  const result = await runStory(s, { renderer, worker: name, signal: current.signal });
  current = null;
  log('info', 'story worker finished a story', { id: s.id, result });
  if (once) break;
}
process.exit(0);
