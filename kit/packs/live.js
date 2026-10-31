// Pack "live" (public/vendor/oomba-kit/<version>/packs/live.js): Oomba.live, the multiplayer API for Oomba Live class
// games (docs/kit-api.md "Live class games"; the wire protocol is docs/live-protocol.md). Any kit game, hand-written or
// made in the Builder, can be hosted live by a teacher or grown-up: it learns it is in a session, sees the players
// (seat, nickname or class name, avatar spec, team), reports scores and answers, shares small game events, reads the
// shared state the host owns, and shows the other players in its own world (crowd() in 3D on the bridge-3d pack, flat()
// in 2D) with interpolation and nameplates. Outside a session (solo play) every call is safe: role 'solo', start fires
// once the game says ready(), players() is just the player, and send / score / item / move do nothing.
// The pack is deliberately thin and forward compatible: the transport (the frame's MessagePort, the data shape checks,
// text entry off) is the SDK's (BRB.live, unlocked), limits are the server's, and unknown messages or fields are ignored.
// It never touches the DOM when it loads, never opens a socket and never shows text a player sent (there is none).
export const PACK = { name: 'live' };
export function define(K) {
  const kit = K.kit, win = kit.win, TAU = Math.PI * 2;
  const ANIM = ['idle', 'walk', 'run', 'jump', 'cheer', 'hurt', 'wave', 'dance'], EMOTES = ['wave', 'cheer', 'jump', 'dance', 'clap', 'heart'];
  const perf = () => (win.performance && win.performance.now ? win.performance.now() : 0);
  const raf = fn => (win.requestAnimationFrame ? win.requestAnimationFrame(fn) : 0);
  const BRB = win.BRB || null, T = BRB && BRB.live && BRB.live.v === 1 ? BRB.live : null;
  const init = (T && T.init) || {};
  const subs = {};
  const emit = (ev, v) => { for (const fn of (subs[ev] || []).slice()) { try { fn(v); } catch (e) { kit.warn(`Oomba.live.on('${ev}'): ${e && e.message}`); } } };
  const nicks = Array.isArray(init.nicks) ? init.nicks : [];
  const nameOf = n => (typeof n === 'number' ? nicks[n] || '' : String(n == null ? '' : n).slice(0, 40));
  const O = () => win.Oomba || win.OK || null;
  const solo = !T || !T.active;
  const S = {
    role: solo ? 'solo' : init.role === 'host' ? 'host' : 'player', phase: solo ? 'lobby' : 'lobby', round: 0, seq: 0, at: 0, seat: solo ? 0 : +init.seat || 0,
    mode: init.mode || 'game', nameMode: init.nameMode || 'nicknames', started: false, readyOpts: null, off: 0, state: {}, quiz: null, answered: false,
    race: new Map(), board: [], view: '3d',
  };
  const players = new Map();   // seat -> {seat, name, avatar, team, score, connected, ready, late}
  const tracks = new Map();    // seat -> [{t, x, y, z, h, a}] (the last 6 snapshots, server time)
  const meSpec = () => { const o = O(); try { return o && o.me ? o.me() : null; } catch (e) { return null; } };
  if (solo) players.set(0, { seat: 0, name: BRB && BRB.user ? BRB.user.displayName : '', avatar: null, team: 0, score: 0, connected: true, ready: true, late: false });
  else if (init.me) players.set(S.seat, { seat: S.seat, name: init.me.name, avatar: init.me.avatar, team: init.me.team || 0, score: 0, connected: true, ready: false, late: false });
  // A device that can't draw 3D (no WebGL 2 or no import maps: the SDK's BRB.device) or a player who chose Simple view.
  { const d = BRB && BRB.device; S.view = init.view === '2d' || (d && (d.webgl2 === false || d.importmap === false)) ? '2d' : '3d'; }
  const fromTuple = P => ({ seat: P[0], name: P[1], avatar: P[2] || null, team: P[3] || 0, score: P[4] || 0, connected: !!P[5], ready: !!P[6], late: !!P[7] });
  const pub = p => p && { seat: p.seat, name: S.role === 'solo' && p.seat === 0 ? p.name : nameOf(p.name), avatar: p.avatar || (p.seat === S.seat ? meSpec() : null), team: p.team, score: p.score, connected: p.connected, ready: p.ready, late: p.late, me: p.seat === S.seat && S.role !== 'host' };
  const now = () => perf() + S.off;
  const out = (t, m) => { if (!solo) T.send(t, m || {}); };

  function setPhase(ph, m) {
    const was = S.phase; S.phase = ph; if (m.round != null) S.round = m.round; if (m.seq != null) S.seq = m.seq; if (m.at != null) S.at = m.at;
    emit('phase', { phase: ph, was, round: S.round, at: S.at });
    if (ph === 'countdown') emit('countdown', { at: S.at });
    else if (ph === 'loading') emit('loading', {});
    else if (ph === 'playing') {
      if (!S.started) { S.started = true; emit('start', { round: S.round }); }
      else if (was === 'paused') emit('resume', {});
      else if (was !== 'playing') emit('round', { round: S.round });
    } else if (ph === 'paused') emit('pause', {});
    else if (ph === 'between') emit('between', { round: S.round });
    else if (ph === 'ended') emit('end', { top: (m.top || []).map(r => ({ seat: r[0], score: r[1], name: live.nameOf(r[0]) })) });
  }
  function track(seat, t, x, y, z, h, a) {
    let b = tracks.get(seat); if (!b) tracks.set(seat, b = []);
    b.push({ t, x, y, z, h, a }); if (b.length > 6) b.shift();
  }
  function onMsg(m) {
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'clk': if (typeof m.s === 'number') S.off = m.s - perf(); break;
      case 'wel': {
        S.role = m.role === 'host' ? 'host' : 'player'; S.seat = +m.seat || 0; S.mode = m.mode || S.mode; S.nameMode = m.nameMode || S.nameMode;
        S.seq = m.seq; S.round = m.round; S.at = m.at; S.state = m.state && typeof m.state === 'object' ? m.state : {};
        players.clear(); for (const P of m.players || []) players.set(P[0], fromTuple(P));
        if (m.me && !players.has(m.me.seat)) players.set(m.me.seat, { seat: m.me.seat, name: m.me.name, avatar: m.me.avatar, team: m.me.team || 0, score: m.me.score || 0, connected: true, ready: false, late: !!m.me.late });
        for (const r of m.race || []) S.race.set(r[0], { prog: r[1], gems: r[2] });
        if (m.quiz && m.quiz.q) { S.quiz = m.quiz.q; S.answered = m.quiz.answered === true; }
        emit('welcome', {});
        if (m.phase !== S.phase || m.phase === 'playing') setPhase(m.phase, m);
        if (m.quiz && m.quiz.q) emit('question', quizPub());
        break;
      }
      case 'pj': case 'pu': { if (!Array.isArray(m.p)) break; const had = players.has(m.p[0]); players.set(m.p[0], fromTuple(m.p)); emit(had ? 'update' : 'join', pub(players.get(m.p[0]))); break; }
      case 'pl': { const p = players.get(m.n); players.delete(m.n); tracks.delete(m.n); if (p) emit('leave', pub(p)); break; }
      case 's': for (const r of m.p || []) if (r[0] !== S.seat || S.role === 'host') track(r[0], m.ts || now(), r[1] / 100, r[2] / 100, r[3] / 100, r[4] / 256 * TAU, r[5]); break;
      case 'fix': if (Array.isArray(m.p)) emit('fix', { x: m.p[0] / 100, y: m.p[1] / 100, z: m.p[2] / 100 }); break;
      case 'ph': setPhase(m.phase, m); break;
      case 'q': { const same = S.quiz && S.quiz.i === m.i; S.quiz = { i: m.i, n: m.n, q: m.q, choices: m.choices, secs: m.secs, at: m.at }; if (!same) S.answered = false; emit('question', quizPub()); break; }
      case 'ack': S.answered = true; emit('answered', { i: m.i }); break;
      case 'ac': emit('answers', { i: m.i, n: m.n }); break;
      case 'rv': emit('reveal', { i: m.i, answer: m.answer, counts: m.counts || [], skipped: !!m.skipped, top: (m.top || []).map(r => ({ seat: r[0], score: r[1], name: live.nameOf(r[0]) })) }); break;
      case 'you': { const me = players.get(S.seat); if (me && typeof m.score === 'number') me.score = m.score; emit('result', { i: m.i, ok: !!m.ok, points: m.points || 0, rank: m.rank, score: m.score, of: m.of, none: !!m.none }); break; }
      case 'race': for (const r of m.p || []) S.race.set(r[0], { prog: r[1], gems: r[2] }); emit('race', live.race()); break;
      case 'lb': S.board = (m.top || []).map(r => ({ seat: r[0], score: r[1], name: live.nameOf(r[0]) })); for (const r of m.top || []) { const p = players.get(r[0]); if (p) p.score = r[1]; } emit('leaderboard', { top: S.board, you: m.you ? { rank: m.you[0], score: m.you[1] } : null }); break;
      case 'ev': emit('event', { from: m.f, kind: m.k, data: m.d }); break;
      case 'em': { const e = EMOTES[m.e]; if (e) { emit('emote', { from: m.f, name: e }); for (const c of crowds) c.emote(m.f, e); } break; }
      case 'st': S.state = merge(S.state, m.d); emit('state', S.state); break;
      default: break;   // unknown messages: a newer platform than this pack
    }
  }
  const merge = (a, p) => { if (!p || typeof p !== 'object' || Array.isArray(p)) return p; const o = a && typeof a === 'object' && !Array.isArray(a) ? a : {}; for (const k of Object.keys(p)) { if (p[k] === null) delete o[k]; else o[k] = p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) ? merge(o[k], p[k]) : p[k]; } return o; };
  const quizPub = () => S.quiz && { i: S.quiz.i, n: S.quiz.n, q: S.quiz.q, choices: (S.quiz.choices || []).slice(), secs: S.quiz.secs, at: S.quiz.at, answered: S.answered };
  if (!solo) T.on(onMsg);

  // ---- moving: whole centimetres, a heading byte, an animation index; at most 10 a second and only on a change ----
  let lastMv = -1e9, lastKey = '';
  function move(x, y, z, heading, anim) {
    if (solo || S.role !== 'player') return false;
    const t = perf(); if (t - lastMv < 100) return false;
    const h = Math.round(((((+heading || 0) % TAU) + TAU) % TAU) / TAU * 256) & 255;
    const a = typeof anim === 'number' ? anim | 0 : Math.max(0, ANIM.indexOf(anim));
    const p = [Math.round((+x || 0) * 100), Math.round((+y || 0) * 100), Math.round((+z || 0) * 100), h, Math.min(7, Math.max(0, a))];
    const key = p.join(','); if (key === lastKey) return false;
    lastKey = key; lastMv = t; out('mv', { p }); return true;
  }

  // ---- interpolation: drawn 120 ms behind the newest snapshot, at most 200 ms of extrapolation, a 5 m jump snaps ----
  const DELAY = 120;
  function sample(seat, at) {
    const b = tracks.get(seat); if (!b || !b.length) return null;
    const t = at == null ? now() - DELAY : at;
    let i = b.length - 1; while (i > 0 && b[i - 1].t > t) i--;
    const n = b[i], p = b[i - 1];
    if (!p || t >= n.t) {
      const q = b[b.length - 2], last = b[b.length - 1];
      if (!q || last.t === q.t) return { x: last.x, y: last.y, z: last.z, h: last.h, a: last.a, v: 0 };
      const k = Math.min(200, Math.max(0, t - last.t)) / (last.t - q.t), d = Math.hypot(last.x - q.x, last.z - q.z);
      if (d > 5) return { x: last.x, y: last.y, z: last.z, h: last.h, a: last.a, v: 0 };
      return { x: last.x + (last.x - q.x) * k, y: last.y + (last.y - q.y) * k, z: last.z + (last.z - q.z) * k, h: last.h, a: last.a, v: d / Math.max(0.05, (last.t - q.t) / 1000) };
    }
    if (Math.hypot(n.x - p.x, n.z - p.z) > 5) return { x: n.x, y: n.y, z: n.z, h: n.h, a: n.a, v: 0 };
    const k = (t - p.t) / Math.max(1, n.t - p.t);
    let dh = n.h - p.h; dh = ((dh + Math.PI) % TAU + TAU) % TAU - Math.PI;   // the short way round
    return { x: p.x + (n.x - p.x) * k, y: p.y + (n.y - p.y) * k, z: p.z + (n.z - p.z) * k, h: ((p.h + dh * k) % TAU + TAU) % TAU, a: k < 0.5 ? p.a : n.a, v: Math.hypot(n.x - p.x, n.z - p.z) / Math.max(0.05, (n.t - p.t) / 1000) };
  }

  // ---- crowd(B, opts): the other players in a bridge-3d world ----
  const crowds = [];
  const TIER = { low: [4, 6], mid: [8, 10], high: [12, 16] };
  function crowd(B, opt = {}) {
    if (!B || !B.THREE || !B.scene) { kit.warn('Oomba.live.crowd(B): pass the 3D bridge from Oomba.three(THREE, {...}) (pack bridge-3d)'); return null; }
    const T3 = B.THREE, scene = B.scene, tier = TIER[B.tier] || TIER.low;
    const maxRigs = Math.min(opt.maxRigs || tier[0], tier[0]), maxSprites = opt.maxSprites == null ? tier[1] : opt.maxSprites, size = opt.size || 1.6;
    const plates = opt.nameplates !== false, platesMax = 8, plateFar = 18;
    const ents = new Map(), manual = new Map();
    let built = 0, spin = 0, cut = 0, leader = null;
    // the far band: one instanced capsule for every seat beyond the sprites
    const capG = new T3.CapsuleGeometry(0.3, 0.7, 2, 8), capM = B.toon('stone');
    const far = new T3.InstancedMesh(capG, capM, opt.max || 100); far.count = 0; far.frustumCulled = false; far.userData.noInk = true; scene.add(far);
    const M4 = new T3.Matrix4(), Q = new T3.Quaternion(), V = new T3.Vector3(), V1 = new T3.Vector3(1, 1, 1), C = new T3.Color(), cam = new T3.Vector3();
    const tint = spec => B.color((spec && spec.colors && spec.colors.base) || 'mint');
    function ent(seat) {
      let e = ents.get(seat); if (e) return e;
      e = { seat, rig: null, spr: null, plate: null, x: 0, y: 0, z: 0, h: 0, sp: 0, a: 0, d: 0, on: false };
      ents.set(seat, e); return e;
    }
    function plate(e) {
      if (e.plate) return e.plate;
      const p = players.get(e.seat), text = p ? nameOf(p.name) : '';
      const c = kit.doc.createElement('canvas'), x = c.getContext('2d'); c.width = 256; c.height = 64;
      if (x) {
        x.font = '700 30px system-ui, sans-serif'; try { x.direction = (O() && O().dir) || 'ltr'; } catch (er) { /* old canvas */ }
        x.textAlign = 'center'; x.textBaseline = 'middle';
        const w = Math.min(248, x.measureText(text).width + 28);
        x.fillStyle = 'rgba(29,35,64,.82)'; if (x.roundRect) { x.beginPath(); x.roundRect(128 - w / 2, 8, w, 48, 24); x.fill(); } else x.fillRect(128 - w / 2, 8, w, 48);
        x.fillStyle = '#ffffff'; x.fillText(text, 128, 33, 230);
      }
      const tex = new T3.CanvasTexture(c), sp = new T3.Sprite(new T3.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sp.scale.set(1.6, 0.4, 1); sp.renderOrder = 10; sp.userData.noInk = true; sp.visible = false; scene.add(sp);
      e.plate = sp; return sp;
    }
    const avatarOf = seat => { const p = players.get(seat); return (p && p.avatar) || { species: 'oomba', colors: { base: 'mint' } }; };
    function update(dt) {
      dt = Math.min(0.1, Math.max(0, +dt || 0));
      if (B.camera) B.camera.getWorldPosition(cam);
      const list = [];
      for (const p of players.values()) {
        if (p.seat === S.seat && S.role !== 'host' && !opt.me) continue;
        const e = ent(p.seat), m = manual.get(p.seat), s = m || sample(p.seat);
        if (!s) { e.on = false; continue; }
        const dx = s.x - e.x, dz = s.z - e.z;
        e.sp = m ? m.sp : Math.min(1, (s.v || Math.hypot(dx, dz) / Math.max(dt, 0.016)) / 6);
        e.x = s.x; e.y = opt.groundY ? opt.groundY(s.x, s.z) : s.y; e.z = s.z; e.h = s.h; e.a = s.a || 0; e.on = p.connected !== false || !!m;
        e.d = Math.hypot(e.x - cam.x, e.z - cam.z); list.push(e);
      }
      for (const e of ents.values()) if (!players.has(e.seat)) { if (e.rig) e.rig.visible = false; if (e.spr) e.spr.visible = false; if (e.plate) e.plate.visible = false; e.on = false; }
      list.sort((a, b) => a.d - b.d);
      let r = 0, s = 0, f = 0, pl = 0, made = false;
      for (const e of list) {
        const want = !e.on ? 0 : r < maxRigs ? 1 : s < maxSprites ? 2 : 3;
        // at most one new rig a frame (building one costs a few ms on a Chromebook)
        if (want === 1 && !e.rig && !made && built < maxRigs * 2) { e.rig = opt.make ? opt.make(avatarOf(e.seat), e.seat) : B.rig(avatarOf(e.seat), { size }); if (e.rig) { scene.add(e.rig); built++; made = true; } }
        const useRig = want === 1 && e.rig, useSpr = !useRig && want && want <= 2 && (e.spr || (e.spr = B.sprite(avatarOf(e.seat), { size }), scene.add(e.spr), e.spr));
        if (useRig) r++; else if (useSpr) s++;
        for (const o of [e.rig, e.spr]) { if (!o) continue; const on = o === (useRig ? e.rig : useSpr ? e.spr : null); o.visible = on; if (on) { o.position.set(e.x, e.y, e.z); o.heading = e.h; if (!o.userData.okActor) o.rotation.y = e.h; o.speed = e.a === 3 ? 0.5 : e.sp; o.air = e.a === 3; } }
        if (!useRig && !useSpr && e.on && f < far.count + 1000) { V.set(e.x, e.y + 0.65, e.z); M4.compose(V, Q, V1); far.setMatrixAt(f, M4); far.setColorAt(f, C.copy(tint(avatarOf(e.seat)))); f++; }
        if (plates) { const show = e.on && pl < platesMax && e.d < plateFar; if (show || e.plate) { const p = plate(e); p.visible = show; if (show) { p.position.set(e.x, e.y + size + 0.35, e.z); pl++; } } }
      }
      far.count = f; far.instanceMatrix.needsUpdate = true; if (far.instanceColor) far.instanceColor.needsUpdate = true;
      if (opt.auto === false && B.update && opt.drive) B.update(dt);
    }
    let stopped = false, lt = 0;
    if (opt.auto !== false) { const loop = ts => { if (stopped) return; update(lt ? (ts - lt) / 1000 : 1 / 60); lt = ts; raf(loop); }; raf(loop); }
    const C3 = {
      update,
      /** place(seat, x, y, z, heading, speed): a game-driven position (a race track), no interpolation. */
      place(seat, x, y, z, h, sp) { manual.set(seat, { x, y, z, h: h || 0, sp: sp || 0, a: 0, v: 0 }); },
      free(seat) { manual.delete(seat); },
      get(seat) { const e = ents.get(seat); return e ? e.rig || e.spr : null; },
      emote(seat, name) { const e = ents.get(seat), o = e && (e.rig && e.rig.visible ? e.rig : e.spr); if (o && o.play) o.play(name === 'wave' ? 'wave' : name === 'jump' ? 'land' : 'cheer', 1200); },
      positions: () => [...ents.values()].filter(e => e.on).map(e => ({ seat: e.seat, x: e.x, y: e.y, z: e.z, h: e.h })),
      get leader() { return leader; },
      /** spectate(camera, dt, {height, radius}): a slow orbit round the players that cuts to the leader every 8 s (still with
       *  reduced motion). */
      spectate(camera, dt, o2 = {}) {
        const pos = C3.positions(); if (!pos.length || !camera) return;
        let cx = 0, cz = 0; for (const p of pos) { cx += p.x; cz += p.z; } cx /= pos.length; cz /= pos.length;
        cut += dt; if (cut > 8 || !leader) { cut = 0; let best = -1; for (const p of players.values()) { if (p.score > best && ents.get(p.seat) && ents.get(p.seat).on) { best = p.score; leader = p.seat; } } }
        const L = ents.get(leader), fx = L && L.on && Math.floor(cut / 4) % 2 ? L.x : cx, fz = L && L.on && Math.floor(cut / 4) % 2 ? L.z : cz;
        if (!kit.settings.reduced) spin += dt * 0.12;
        const R = o2.radius || 14, H = o2.height || 8;
        camera.position.set(fx + Math.sin(spin) * R, H, fz + Math.cos(spin) * R); camera.lookAt(fx, 1, fz);
      },
      dispose() { stopped = true; scene.remove(far); for (const e of ents.values()) for (const o of [e.rig, e.spr, e.plate]) if (o) scene.remove(o); ents.clear(); },
      get drawCalls() { let n = far.count ? 1 : 0; for (const e of ents.values()) { if (e.rig && e.rig.visible) n += 17; if (e.spr && e.spr.visible) n += 2; if (e.plate && e.plate.visible) n++; } return n; },
    };
    crowds.push(C3); return C3;
  }

  // ---- flat(opts): the same players in 2D (top-down), for the Simple view and devices without 3D ----
  function flat(opt = {}) {
    const pics = new Map(), manual = new Map();
    const pic = seat => { let c = pics.get(seat); if (!c) { const p = players.get(seat), spec = (p && p.avatar) || { species: 'oomba' }; try { c = kit.portraitCanvas(spec, opt.px || 64); } catch (e) { c = null; } pics.set(seat, c); } return c; };
    const list = () => { const out2 = []; for (const p of players.values()) { if (p.seat === S.seat && S.role !== 'host' && !opt.me) continue; const s = manual.get(p.seat) || sample(p.seat); if (s) out2.push({ seat: p.seat, x: s.x, z: s.z, h: s.h, name: nameOf(p.name) }); } return out2; };
    return {
      place(seat, x, z, h) { manual.set(seat, { x, z, h: h || 0 }); },
      free(seat) { manual.delete(seat); },
      positions: list,
      /** draw(ctx, {cx, cz, scale, ox, oy, r}): portraits and names at (ox + (x - cx) * scale, oy + (z - cz) * scale). */
      draw(ctx, v = {}) {
        const sc = v.scale || 10, ox = v.ox || 0, oy = v.oy || 0, cx = v.cx || 0, cz = v.cz || 0, r = v.r || 18;
        try { ctx.direction = (O() && O().dir) || 'ltr'; } catch (e) { /* old canvas */ }
        ctx.textAlign = 'center'; ctx.font = '700 12px system-ui, sans-serif';
        for (const p of list()) {
          const x = ox + (p.x - cx) * sc, y = oy + (p.z - cz) * sc, c = pic(p.seat);
          if (c) ctx.drawImage(c, x - r, y - r * 1.6, r * 2, r * 2); else { ctx.fillStyle = '#8fd3b0'; ctx.beginPath(); ctx.arc(x, y - r * 0.6, r * 0.7, 0, TAU); ctx.fill(); }
          if (opt.names !== false && p.name) { ctx.fillStyle = 'rgba(29,35,64,.8)'; const w = Math.min(120, ctx.measureText(p.name).width + 10); ctx.fillRect(x - w / 2, y + r * 0.5, w, 16); ctx.fillStyle = '#fff'; ctx.fillText(p.name, x, y + r * 0.5 + 12, 112); }
        }
      },
      portrait: pic,
    };
  }

  // ---- the public API ----
  const live = {
    get active() { return !solo; }, get role() { return S.role; }, get phase() { return S.phase; }, get round() { return S.round; }, get seq() { return S.seq; },
    get mode() { return S.mode; }, get view() { return S.view; }, get state() { return S.state; }, get started() { return S.started; },
    get me() { return S.role === 'host' ? null : pub(players.get(S.seat)) || pub({ seat: S.seat, name: '', avatar: meSpec(), team: 0, score: 0, connected: true }); },
    players() { return [...players.values()].sort((a, b) => a.seat - b.seat).map(pub); },
    player(seat) { return pub(players.get(seat)); },
    nameOf(seat) { const p = players.get(seat); return p ? (S.role === 'solo' ? p.name : nameOf(p.name)) : ''; },
    avatarOf(seat) { const p = players.get(seat); return p ? p.avatar || (seat === S.seat ? meSpec() : null) : null; },
    /** now(): the server's clock (ms), so every device counts down to the same moment. since(at): ms since then. */
    now, since: at => now() - (+at || 0),
    /** ready({presence: {bounds, maxSpeed}, lobby, quiz, hostView, maxScorePerSec, view}): once, when the game can play. */
    ready(o = {}) {
      if (S.readyOpts) return live;
      S.readyOpts = o; if (o.view === '2d') S.view = '2d';
      const cfg = {};
      if (o.presence) cfg.presence = { bounds: Math.max(1, Math.min(1000, +o.presence.bounds || 50)), maxSpeed: Math.max(0.5, Math.min(60, +o.presence.maxSpeed || 8)) };
      for (const k of ['lobby', 'quiz', 'hostView']) if (o[k] !== undefined) cfg[k] = !!o[k];
      if (o.maxScorePerSec) cfg.maxScorePerSec = Math.max(1, Math.min(100000, +o.maxScorePerSec || 1000));
      if (solo) raf(() => { if (!S.started) { S.started = true; S.phase = 'playing'; emit('start', { round: 1, solo: true }); } });
      else out('rdy', { view: S.view, cfg });
      return live;
    },
    on(ev, fn) {
      if (typeof fn !== 'function') return () => {};
      (subs[ev] = subs[ev] || []).push(fn);
      if (ev === 'start' && S.started) raf(() => fn({ round: S.round, late: true }));
      return () => { subs[ev] = (subs[ev] || []).filter(f => f !== fn); };
    },
    /** send(kind, data, {toHost, to}): a small game event to everyone else (or the host; the host: to one seat). */
    send(kind, data, o = {}) { const m = { k: String(kind), d: data === undefined ? null : data }; if (o.toHost) m.to = 'host'; else if (S.role === 'host' && o.to) m.to = +o.to; out('ev', m); },
    score(n) { n = Math.floor(+n); if (!isFinite(n) || n < 0) return; const me = players.get(S.seat); if (me) me.score = Math.min(1e6, n); out('sc', { n: Math.min(1e6, n) }); },
    item(i, ok) { i = Math.floor(+i); if (!(i >= 0 && i < 200)) return; out('it', { i, ok: !!ok }); },
    setState(patch) { if (S.role !== 'host' || !patch || typeof patch !== 'object') return false; S.state = merge(S.state, JSON.parse(JSON.stringify(patch))); out('st', { d: patch }); emit('state', S.state); return true; },
    move, emote(name) { const e = EMOTES.indexOf(name); if (e >= 0) out('em', { e }); },
    quiz: {
      get current() { return quizPub(); }, get answered() { return S.answered; },
      left() { return S.quiz ? Math.max(0, S.quiz.at + S.quiz.secs * 1000 - now()) : 0; },
      answer(c) { if (!S.quiz || S.answered || S.role !== 'player') return false; c = c | 0; if (c < 0 || c >= (S.quiz.choices || []).length) return false; out('an', { i: S.quiz.i, c, e: Math.max(0, Math.round(now() - S.quiz.at)) }); return true; },
    },
    race() { return [...S.race].map(([seat, r]) => ({ seat, prog: r.prog, gems: r.gems, name: live.nameOf(seat) })); },
    leaderboard() { return S.board.slice(); },
    position: sample,
    crowd, flat,
    anims: ANIM.slice(), emotes: EMOTES.slice(),
  };
  const Ok = O();
  if (Ok && !Ok.live) Object.defineProperty(Ok, 'live', { value: live, enumerable: true });
  kit.live = live;
}
