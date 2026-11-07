// Story Builder: the worker loop (docs/story-builder.md). One story at a time: claim the oldest queued story, run it
// (worker.js), repeat; poll when the queue is empty. Runs either inside the site's process (server/index.js, when
// STORY_BUILDER=1 and STORY_WORKER is 'inline', the default) or on its own (scripts/story-worker.js). With the remote
// renderer the heavy part runs on the renderer service; what is left here is light (the Claude call, voice clips,
// composing the music, and one ffmpeg assembly, run with nice and two threads).
import os from 'node:os';
import { log } from '../services/log.js';
import * as J from '../services/story-jobs.js';
import { runStory } from './worker.js';
import { createRenderer } from './renderer.js';

/** -> { stop(): Promise (the story in hand goes back in the queue), done: Promise, renderer } */
export function startStoryLoop({ renderer = createRenderer(), name = `${os.hostname()}:${process.pid}`, pollMs = Math.max(500, +process.env.STORY_POLL_MS || 3000), once = false } = {}) {
  let stopping = false, current = null, wake = null;
  const sleep = ms => new Promise(r => { const t = setTimeout(r, ms); wake = () => { clearTimeout(t); r(); }; });
  const done = (async () => {
    // One worker per site: whatever was running when it last stopped goes back in the queue.
    const rec = J.recover({ all: true });
    const engine = await renderer.probe().catch(e => ({ engine: null, error: String(e.message || e).slice(0, 200) }));
    log('info', 'story worker started', { name, renderer: renderer.name, ...engine, ...rec });
    while (!stopping) {
      let s = null;
      try { s = J.claimNext(name); } catch (e) { log('error', 'story worker: claim failed', { error: e.message }); }
      if (!s) { if (once) break; await sleep(pollMs); continue; }
      current = new AbortController();
      const result = await runStory(s, { renderer, worker: name, signal: current.signal }).catch(e => { log('error', 'story worker: run failed', { id: s.id, error: e.message }); return 'failed'; });
      current = null;
      log('info', 'story worker finished a story', { id: s.id, result });
      if (once) break;
    }
  })();
  return {
    renderer,
    done,
    stop: () => { stopping = true; if (current) current.abort(); if (wake) wake(); return done; },
  };
}
