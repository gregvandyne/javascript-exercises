#!/usr/bin/env node
// The Story Builder worker on its own (docs/story-builder.md). Usually not needed: with STORY_BUILDER=1 the site runs
// the same loop in its own process (server/index.js; STORY_WORKER=inline, the default). Run this instead, with
// STORY_WORKER=external on the site, when the worker should be a separate process on the same machine (same
// BRB_DATA_DIR: SQLite in WAL mode handles a second process on one disk, never over a network file system).
//   node scripts/story-worker.js            run until stopped (SIGTERM / SIGINT: the story in hand goes back in the queue)
//   node scripts/story-worker.js --once     run the next queued story (if any) and exit
import { log } from '../server/services/log.js';
import { startStoryLoop } from '../server/stories/loop.js';

const loop = startStoryLoop({ once: process.argv.includes('--once') });
let stopping = false;
const stop = sig => { if (stopping) return; stopping = true; log('info', 'story worker stopping', { sig }); loop.stop(); };
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
await loop.done;
process.exit(0);
