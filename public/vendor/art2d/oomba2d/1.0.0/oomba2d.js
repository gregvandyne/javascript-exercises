// Oomba2D 1.0.0: the 2D art of the Kit 2 worlds, heroes and animals, for games on the Oomba Kit.
// A game loads this file and the art packs it uses (pinned tags, after the kit's own tag); each pack file hands its
// manifest to Oomba2D.pack(). Oomba2D.use({ world, hero }) then loads the pictures and gives the game an `art` object:
//   art.level(level)   swaps a level's coins, flag and hazards for the world's coin, goal and obstacles
//   art.dress(w)       in setup(w): the world's sky, far and mid scenery, ground, props and the animated hero
//   art.sprite(name)   a legend / w.spawn entry for one of the world's props; art.coin(), art.goal(), art.obstacle(i)
// The Oomba Kit stays the engine (physics, HUD, screens, sound, languages): the pictures are registered as kit sprites
// (Oomba.art.define), so they sort, flash and squash like everything else. use() resolves to null when the kit, a pack
// or a picture is missing: the game then plays with the kit's own look. No network of its own: only <img> loads of the
// pack's own files, from the folder the pack file came from.
(function () {
  'use strict';
  if (window.Oomba2D) return;
  var VERSION = '1.0.0', packs = {}, INK = '#141414', PX = 96;
  // The kit's layer just above its own sky and hills and below the ground, the cast and their shadows: the world's
  // backdrop covers the kit's.
  var BACK = 4;
  var calls = { define: 0, draws: 0, images: 0 };          // for tests: how much art was really drawn
  function pack(m) {
    if (!m || typeof m.id !== 'string') return;
    var s = document.currentScript; m._base = s && s.src ? s.src.replace(/[^/]*$/, '') : '';
    packs[m.id] = m;
  }
  function loadImage(m, file) {
    return new Promise(function (res) {
      if (!m._base || !m.files || !m.files[file]) return res(null);
      // crossOrigin: the game frame has an origin of its own, and a picture loaded without it would taint the kit's
      // canvases (WebGL then refuses them). /vendor answers with Access-Control-Allow-Origin: *.
      var i = new Image(); i.crossOrigin = 'anonymous'; i.onload = function () { calls.images++; res(i); }; i.onerror = function () { res(null); }; i.src = m._base + file;
    });
  }
  function character(id) {
    for (var k of ['heroes', 'animals']) if (packs[k] && packs[k].sprites[id]) return { pack: packs[k], sprite: packs[k].sprites[id] };
    return null;
  }
  var names = function (kind) { var out = []; for (var k in packs) if (packs[k].kind === kind) out.push(k); return out; };

  /** use({ world, hero }) -> Promise<art | null>. world: a world pack's id; hero: a hero or animal id (either may be left out). */
  function use(o) {
    o = o || {};
    var O = window.Oomba, W = o.world ? packs[o.world] : null, H = o.hero ? character(o.hero) : null;
    if (!O || !O.art || typeof O.art.define !== 'function' || (!W && !H) || (o.world && (!W || W.kind !== 'world'))) return Promise.resolve(null);
    var jobs = [];
    if (W) jobs.push(loadImage(W, W.props.image), loadImage(W, W.ground.image), W.layers.far ? loadImage(W, W.layers.far.image) : null, W.layers.mid ? loadImage(W, W.layers.mid.image) : null);
    else jobs.push(null, null, null, null);
    jobs.push(H ? loadImage(H.pack, H.sprite.image) : null);
    return Promise.all(jobs).then(function (im) {
      if (W && (!im[0] || !im[1] || (W.layers.far && !im[2]) || (W.layers.mid && !im[3]))) return null;
      if (H && !im[4]) H = null;
      if (!W && !H) return null;
      return makeArt(O, W, H, { props: im[0], ground: im[1], far: im[2], mid: im[3], hero: im[4] }, o);
    }).catch(function () { return null; });
  }

  function makeArt(O, W, H, im, o) {
    var def = function (name, d) { calls.define++; var draw = d.draw; d.draw = function (ctx, k) { calls.draws++; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; draw(ctx, k); }; O.art.define(name, d); };
    var N = function (n) { return 'a2d:' + (W ? W.id : 'x') + ':' + n; };
    var heroName = H ? 'a2d:hero:' + o.hero : '';
    // A strip that repeats, with EDGE more pixels of itself at each end (copied 1:1): a slice is then drawn in one
    // piece with a little of its neighbours, so scaling never leaves a soft, see-through line where two slices meet.
    var EDGE = 8, wide = {}, widen = function (img) {
      var c = document.createElement('canvas'), w = img.width, h = img.height; c.width = w + 2 * EDGE; c.height = h;
      var g = c.getContext('2d'); g.drawImage(img, EDGE, 0); g.drawImage(img, w - EDGE, 0, EDGE, h, 0, 0, EDGE, h); g.drawImage(img, 0, 0, EDGE, h, w + EDGE, 0, EDGE, h);
      return c;
    };
    if (W) {
      wide.ground = widen(im.ground); if (im.far) wide.far = widen(im.far); if (im.mid) wide.mid = widen(im.mid);
      Object.keys(W.sprites).forEach(function (n) {
        var s = W.sprites[n], r = s.rect;
        def(N(n), { w: r[2], h: r[3], ax: s.ax, ay: s.ay, draw: function (ctx) { ctx.drawImage(im.props, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]); } });
      });
      var G = W.ground, GH = G.over + PX;
      // variant "col.deep.mask": which slice of the strip, whether ground lies above it, and its neighbours
      def(N('ground'), { w: PX, h: GH, ax: 0.5, ay: (G.over + PX / 2) / GH, draw: function (ctx, k) {
        var v = String(k.v || '0.0.15').split('.'), col = (+v[0] || 0) % G.cells, deep = v[1] === '1', mask = +v[2] || 0;
        // one continuous piece of the widened strip, a little past each side that has a neighbour: no soft, see-through edge
        if (!deep) { var l = mask & 8 ? EDGE : 0, r = mask & 2 ? EDGE : 0; ctx.drawImage(wide.ground, col * PX + EDGE - l, 0, PX + l + r, GH, -l, 0, PX + l + r, GH); }
        else if (G.fill) { ctx.fillStyle = G.fill; ctx.fillRect(-2, G.over, PX + 4, PX + 2); }
        if (G.open) return;                                   // a pier over water: no earth to outline
        ctx.fillStyle = INK;
        if (!(mask & 8)) ctx.fillRect(0, G.over, 3, PX); if (!(mask & 2)) ctx.fillRect(PX - 3, G.over, 3, PX); if (!(mask & 4)) ctx.fillRect(0, GH - 3, PX, 3);
      } });
      ['far', 'mid'].forEach(function (n) {
        var L = W.layers[n]; if (!L) return; var cw = L.w / 4;
        def(N(n), { w: cw, h: L.h, ax: 0, ay: 1, draw: function (ctx, k) { var i = (+k.v || 0) % 4; ctx.drawImage(wide[n], i * cw, 0, cw + 2 * EDGE, L.h, -EDGE, 0, cw + 2 * EDGE, L.h); } });
      });
      def(N('sky'), { w: 8, h: 64, ax: 0.5, ay: 0.5, draw: function (ctx) { var g = ctx.createLinearGradient(0, 11, 0, 53); g.addColorStop(0, W.sky[0]); g.addColorStop(0.62, W.sky[1]); g.addColorStop(1, W.sky[2]); ctx.fillStyle = g; ctx.fillRect(-1, -1, 10, 66); } });
      if (W.under) def(N('under'), { w: 8, h: 64, ax: 0.5, ay: 0, draw: function (ctx) { ctx.fillStyle = W.under; ctx.fillRect(-1, 0, 10, 66); } });
    }
    if (H) {
      var S = H.sprite;
      def(heroName, { w: S.fw, h: S.fh, ax: S.ax, ay: S.ay, draw: function (ctx, k) { var f = +k.v || 0; ctx.drawImage(im.hero, (f % S.cols) * S.fw, Math.floor(f / S.cols) * S.fh, S.fw, S.fh, 0, 0, S.fw, S.fh); } });
    }
    // The kit shows the game's hero as a picture on the title, results and try-again cards: with a sprite hero those
    // pictures show the sprite (its first standing frame), the same height.
    if (H && window.MutationObserver) {
      var swap = function () {
        var list = document.querySelectorAll('.ok-title-hero canvas.ok-portrait, .ok-card canvas.ok-portrait');
        for (var i = 0; i < list.length; i++) {
          var el = list[i], S2 = H.sprite, c = document.createElement('canvas'), px = parseFloat(el.style.height) || 160;
          c.width = S2.fw; c.height = S2.fh; c.getContext('2d').drawImage(im.hero, 0, 0, S2.fw, S2.fh, 0, 0, S2.fw, S2.fh); calls.draws++;
          c.className = 'a2d-portrait'; c.setAttribute('aria-hidden', 'true'); c.style.height = px + 'px'; c.style.width = Math.round(px * S2.fw / S2.fh) + 'px'; c.style.maxWidth = '60vw';
          if (el.parentNode) el.parentNode.replaceChild(c, el);
        }
      };
      try { new MutationObserver(swap).observe(document.documentElement, { childList: true, subtree: true }); swap(); } catch (e) { /* the kit's own pictures stay */ }
    }
    var spec = function (n, extra) { var s = W && W.sprites[n]; if (!s) return null; return Object.assign({ kind: N(n), size: s.size, place: 'floor' }, extra || {}); };
    var obstacles = W ? Object.keys(W.sprites).filter(function (n) { return W.sprites[n].kind === 'obstacle'; }) : [];
    var propNames = W ? Object.keys(W.sprites).filter(function (n) { return W.sprites[n].kind === 'prop'; }) : [];
    var state = null, hooked = null;

    var art = {
      world: W ? W.id : '', hero: H ? o.hero : '', props: propNames,
      /** A legend or w.spawn entry for one of the world's sprites (null for a name the world does not have). */
      sprite: function (n, extra) { return spec(n, extra); },
      coin: function () { return spec('coin', { place: 'center', z: 2, parts: [{ collectible: { value: 5 } }, { bob: { amp: 4 } }] }); },
      goal: function () { return spec('goal', { z: 1, parts: ['goal'] }); },
      /** The i-th obstacle of the world (a barrel, a crate, a rock: never an animal), as a hazard on the floor. */
      obstacle: function (i) { return obstacles.length ? spec(obstacles[(i | 0) % obstacles.length], { z: 2, parts: ['hazard'], shadow: false }) : null; },
      /** Swap a level's built-in coins, flag and hazards for the world's (flying hazards are taken out). -> the level. */
      level: function (level) {
        if (!W || !level || !level.items) return level;
        var n = 0, out = [];
        level.items.forEach(function (it) {
          var k = typeof it.spec === 'string' ? it.spec : '';
          if (k === 'bee') return;
          if (k === 'coin') it.spec = art.coin(); else if (k === 'goal') it.spec = art.goal();
          else if (k === 'spikes' || k === 'roller') it.spec = art.obstacle(n++);
          out.push(it);
        });
        level.items = out; return level;
      },
      /** In setup(w): dress this round of the level. opts.scenery: false for no props along the way; opts.hero: false to keep the kit hero. */
      dress: function (w, opts) {
        opts = opts || {};
        var stage = w && w.stage; if (!stage || !stage.entities || !stage.view || !stage.camera) return false;
        var cell = w.cell || 48, mine = [], add = function (name, a) { var e = stage.add(name, a); e.a2d = true; mine.push(e); if (w.ents) w.ents.push(e); return e; };
        state = { w: w, cell: cell, cap: stage.gov && stage.gov.tier === 'low' ? 384 : 640, layers: [], sky: null, under: null, hero: null, t: 0, groundY: (w.level ? w.level.h : 540) - 2 * cell };
        if (W) {
          // the ground: every kit ground tile becomes a slice of the world's strip
          var G = W.ground, GH = G.over + PX, tops = [], top = Infinity;
          stage.entities.forEach(function (e) {
            if (typeof e.sprite !== 'string' || e.sprite.indexOf('ground:') !== 0) return;
            var mask = +String(e.variant || '0').split('.')[0] || 0, c = Math.floor(e.x / cell), r = Math.floor(e.y / cell);
            e.sprite = N('ground'); e.variant = (((c % G.cells) + G.cells) % G.cells) + '.' + (mask & 1 ? 1 : 0) + '.' + mask; e.size = (cell + 1) * GH / PX; e.a2dGround = true;
            if (!(mask & 1)) { tops.push([c, r]); }
          });
          // the floor line the scenery stands behind: where the hero starts, else the lowest ground top
          var start = w.hero ? w.hero.y : null;
          tops.forEach(function (t) { if (t[1] * cell < top && (start == null || t[1] * cell >= start - 2)) top = t[1] * cell; });
          if (top !== Infinity) state.groundY = top; else if (start != null) state.groundY = start;
          state.sky = add(N('sky'), { layer: BACK, z: -100, par: 0, shadow: false });
          ['far', 'mid'].forEach(function (n, li) {
            var L = W.layers[n]; if (!L) return;
            var ents = []; for (var i = 0; i < 12; i++) ents.push(add(N(n), { layer: BACK, z: -90 + li * 10 + i * 0.01, par: 0, shadow: false, variant: String(i % 4) }));
            state.layers.push({ L: L, ents: ents, lift: n === 'far' ? 0.22 + L.base / PX : 0.25 });   // the far strip's foot sits just behind the nearer strip's base band
          });
          if (W.under) state.under = add(N('under'), { layer: BACK, z: -85, par: 0, shadow: false });
          // props along the way, behind the ground's edge, never where the level has something
          if (opts.scenery !== false && propNames.length && w.level) {
            var taken = {}; (w.level.items || []).forEach(function (it) { taken[it.c] = 1; taken[it.c - 1] = 1; taken[it.c + 1] = 1; });
            var every = opts.every || 5, i2 = 0, cols = {};
            tops.forEach(function (t) { if (t[1] * cell === state.groundY) cols[t[0]] = 1; });
            for (var c2 = 2; c2 < (w.level.cols || 0) - 1; c2++) {
              if (!cols[c2] || !cols[c2 - 1] || !cols[c2 + 1] || taken[c2] || (c2 * 7 + 3) % every) continue;
              var pn = propNames[(c2 * 13 + i2++) % propNames.length], ps = W.sprites[pn];
              add(N(pn), { x: (c2 + 0.5) * cell, y: state.groundY - G.over * cell / PX * 0.6, size: ps.size * cell, layer: 5, z: -5 - (c2 % 3), shadow: false, flip: !!(c2 % 2) && ps.size < 2 });
            }
          }
        }
        if (H && opts.hero !== false) attach(w.hero);
        if (hooked !== stage) { hooked = stage; stage.update(step); }
        step(0);
        return true;
      },
    };

    function attach(h) {
      if (!h || !state) return;
      h.rig = null; h.slots = null; h.sprite = heroName; h.variant = '0'; h.size = H.sprite.fh * state.cell / PX; h.a2dHero = true;
      state.hero = h; state.lastX = h.x;
    }
    function place(e, x, y, wantH, srcH, V, zoom, sxWide) {   // a screen-space sprite wantH design units tall, baked no finer than its picture (smaller on slow devices)
      var bake = Math.max(8, Math.min(wantH * V.scale, srcH, state.cap));
      e.size = bake / (V.scale * zoom); e.sy = wantH / e.size; e.sx = sxWide || e.sy;
      if (Math.abs(e.x - x) > 40) e.px = x; if (Math.abs(e.y - y) > 40) e.py = y;
      e.x = x; e.y = y;
    }
    function step(dt) {
      var s = state; if (!s || !s.w || !s.w.stage) return;
      var stage = s.w.stage, V = stage.view, C = stage.camera, zoom = C.effZoom || C.zoom || 1, vw = V.vw, vh = V.vh;
      if (W && s.sky && V.scale > 0) {
        var cs = s.cell * zoom, gy = vh / 2 + (s.groundY - C.y) * zoom;
        place(s.sky, vw / 2, vh / 2, vh * 1.5, 64, V, zoom); s.sky.sx = vw * 3 / (s.sky.size / 8);   // far bigger than the view: a tiny sprite stretched this far has wide soft edges
        var bottom = gy;
        s.layers.forEach(function (ly) {
          var L = ly.L, h = L.h / PX * cs, cw = h * (L.w / 4) / L.h, y = gy - ly.lift * cs + L.base / PX * cs;
          var off = ((C.x * zoom * L.speed) % (cw * 4) + cw * 4) % (cw * 4), i0 = Math.floor(off / cw), need = Math.ceil(vw / cw) + 1;
          ly.ents.forEach(function (e, j) {
            e.visible = j < need; if (!e.visible) return;
            var v = String((i0 + j) % 4); if (e.variant !== v) { e.variant = v; e.px = -1e6; }
            place(e, (i0 + j) * cw - off, y, h, L.h, V, zoom); e.sx = e.sy * 1.006;   // a hair wider: neighbours overlap, no seam
          });
          bottom = y - L.base / PX * cs * 0.6;
        });
        // what shows through a gap in the ground: from behind the nearer strip's base band down, far past the view
        if (s.under) { var uh = Math.max(8, vh - bottom) * 2 + 80; place(s.under, vw / 2, bottom, uh, 64, V, zoom); s.under.sx = vw * 3 / (s.under.size / 8); s.under.visible = bottom < vh + 4; }
      }
      var h = s.w.hero;
      if (H && h && state.hero) {
        if (h !== s.hero || h.sprite !== heroName) attach(h);
        var S = H.sprite, body = s.w.body, air = body ? !body.grounded : !h.grounded, moved = dt > 0 ? Math.abs(h.x - s.lastX) / dt : 0, f;
        s.lastX = h.x; s.t += dt;
        var reduced = !!(window.Oomba && window.Oomba.settings && window.Oomba.settings.reduced);
        if (air) f = S.anims.jump[(body && body.vy > 0) || (!body && h.vy > 0) ? 1 : 0];
        else if (moved > 20) f = S.anims.run[Math.floor(s.t * (S.fps.run || 12)) % S.anims.run.length];
        else f = reduced ? S.anims.idle[0] : S.anims.idle[Math.floor(s.t * (S.fps.idle || 5)) % S.anims.idle.length];
        h.variant = String(f);
      }
    }
    return art;
  }

  window.Oomba2D = { version: VERSION, pack: pack, use: use, packs: packs,
    get worlds() { return names('world'); },
    /** Every hero and animal a loaded pack has. */
    get characters() { var out = []; for (var k of ['heroes', 'animals']) if (packs[k]) out = out.concat(Object.keys(packs[k].sprites)); return out; },
    /** Test hook: how many sprites were defined, drawn from the packs' pictures, and how many pictures loaded. */
    get stats() { return { define: calls.define, draws: calls.draws, images: calls.images }; } };
})();
