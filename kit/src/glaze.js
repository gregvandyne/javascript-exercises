// Glaze: the WebGL2 backend. Same display list, same atlas canvases (mirrored as textures), same placement maths as
// Paper, plus: a procedural OKLab sky, lit sprites (ambient from time of day + up to 4 point lights on each sprite's
// lit side; ink and sticker rim stay unlit), emissive glow, half-res dual-Kawase bloom keyed on emissive (high tier),
// and one post pass: 16³ LUT grade + vignette + screen flash + the spark iris wipe. WebGL2 only; Paper covers the rest.
import { BLEND_ADD } from './list.js';
import { rgbToOklab, oklabToRgb } from './color.js';

const HEAD = '#version 300 es\nprecision highp float;\nprecision mediump sampler3D;\n';
const FULL_VS = '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}';
const SPRITE_VS = `#version 300 es
layout(location=0) in vec2 aQ;
layout(location=1) in vec4 iM;
layout(location=2) in vec4 iT;
layout(location=3) in vec4 iR;
layout(location=4) in vec4 iUV;
layout(location=5) in vec4 iC;
layout(location=6) in vec4 iF;
uniform vec2 uRes; uniform float uTime;
out vec2 vUV; out vec4 vC; out vec4 vF; out vec2 vCen; out float vR;
void main(){
  vec2 l = iR.xy + aQ * iR.zw;
  if (iT.z != 0.0) l.x += sin(uTime * 1.7 + iT.w * 0.013) * iT.z * 0.08 * l.y;
  vec2 p = vec2(iM.x * l.x + iM.z * l.y + iT.x, iM.y * l.x + iM.w * l.y + iT.y);
  vec2 lc = iR.xy + 0.5 * iR.zw;
  vCen = vec2(iM.x * lc.x + iM.z * lc.y + iT.x, iM.y * lc.x + iM.w * lc.y + iT.y);
  vR = 0.5 * length(iM.xy) * max(abs(iR.z), abs(iR.w));
  vUV = mix(iUV.xy, iUV.zw, aQ); vC = iC; vF = iF;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
}`;
const SPRITE_FS = HEAD + `
uniform sampler2D uTex; uniform sampler2D uMask;
uniform vec3 uAmb; uniform int uNL; uniform vec4 uL[4]; uniform vec3 uLC[4];
uniform float uEmOut; uniform vec2 uRes; uniform float uScale; uniform vec2 uRimOff; uniform vec3 uRim;
in vec2 vUV; in vec4 vC; in vec4 vF; in vec2 vCen; in float vR;
layout(location=0) out vec4 oC; layout(location=1) out vec4 oE;
void main(){
  vec4 a = texture(uTex, vUV);
  if (a.a < 0.003) discard;
  vec3 mk = texture(uMask, vUV).rgb;
  float unlit = max(mk.g, step(vF.z, 0.0));   // lit > 0: takes the ambient; lit scales how much point light it takes
  vec2 fp = vec2(gl_FragCoord.x, uRes.y * uScale - gl_FragCoord.y) / uScale;
  vec3 light = mix(vec3(1.0), uAmb, vF.w);    // grade: scenery takes the whole night ambient, the cast about a quarter
  for (int i = 0; i < 4; i++) {
    if (i >= uNL) break;
    vec2 d = uL[i].xy - fp;
    float att = clamp(1.0 - length(d) / uL[i].z, 0.0, 1.0); att *= att;
    vec2 toL = normalize(uL[i].xy - vCen + vec2(0.001));
    float side = clamp(0.75 + 0.6 * dot((fp - vCen) / max(vR, 1.0), toL), 0.35, 1.4);
    light += uLC[i] * uL[i].w * att * side * vF.z;
  }
  float e = clamp(mk.r + vF.y, 0.0, 1.0);
  vec3 rgb = a.rgb * mix(min(light, vec3(1.3)), vec3(1.0), max(unlit, e));
  // a soft cool moonlight rim on the cast (grade < 1) at night: the edge facing the moon, inside the ink line
  float rimK = (1.0 - vF.w) * (1.0 - unlit);
  if (uRim.b > 0.001) { float nb = texture(uTex, vUV + uRimOff).a; rgb += uRim * rimK * a.a * clamp(a.a - nb, 0.0, 1.0); }
  rgb = mix(rgb, vec3(a.a), vF.x);
  rgb *= vC.rgb;
  oC = vec4(rgb, a.a) * vC.a;
  oE = vec4(a.rgb * vC.rgb * e * uEmOut, a.a) * vC.a;
}`;
const SKY_FS = HEAD + `
uniform vec3 uTop; uniform vec3 uBot; uniform vec2 uRes; uniform float uScale; uniform float uTime; uniform float uWisp; uniform float uFlat;
layout(location=0) out vec4 oC; layout(location=1) out vec4 oE;
vec3 lab2srgb(vec3 c){
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z, m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z, s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  vec3 lin = max(vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s), 0.0);
  return mix(12.92 * lin, 1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, lin));
}
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main(){
  float v = 1.0 - gl_FragCoord.y / (uRes.y * uScale);
  float t = uFlat > 0.5 ? 0.5 : pow(clamp(v, 0.0, 1.0), 1.15);
  vec3 c = lab2srgb(mix(uTop, uBot, t));
  vec2 q = gl_FragCoord.xy / (uRes * uScale);
  float n = vn(vec2(q.x * 5.0 + uTime * 0.012, q.y * 22.0)) * 0.6 + vn(vec2(q.x * 11.0 - uTime * 0.02, q.y * 40.0)) * 0.4;
  c = mix(c, vec3(1.0), uWisp * smoothstep(0.62, 0.9, n) * (1.0 - v) * 0.22);
  c += (h21(gl_FragCoord.xy) - 0.5) / 255.0;
  oC = vec4(c, 1.0); oE = vec4(0.0);
}`;
const POST_FS = HEAD + `
uniform sampler2D uScene; uniform sampler2D uBloom; uniform sampler3D uLut;
uniform float uBloomK; uniform float uVig; uniform float uFlash; uniform vec3 uFlashC; uniform vec4 uIris; uniform vec2 uOut;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uOut;
  // bloom is tone-mapped (b / (1 + b)) so a bright lantern glows instead of blowing out to white
  vec3 b = texture(uBloom, uv).rgb * uBloomK;
  vec3 c = texture(uScene, uv).rgb + b / (1.0 + b) * 0.85;
  c = texture(uLut, clamp(c, 0.0, 1.0) * (15.0 / 16.0) + 0.5 / 16.0).rgb;
  vec2 q = uv - 0.5; q.x *= uOut.x / uOut.y;
  c *= 1.0 - uVig * 0.28 * smoothstep(0.32, 0.95, length(q));
  c = mix(c, uFlashC, uFlash);
  if (uIris.w < 1.5) {
    vec2 p = vec2(gl_FragCoord.x, uOut.y - gl_FragCoord.y) - uIris.xy;
    float R = max(uIris.z, 0.001);
    float f = pow(abs(p.x) / R, 0.6667) + pow(abs(p.y) / R, 0.6667);
    float e = fwidth(f) * 1.5;
    float inside = uIris.z < 0.5 ? 0.0 : 1.0 - smoothstep(1.0 - e, 1.0 + e, f);
    c = mix(vec3(0.0784), c, inside);
  }
  o = vec4(c, 1.0);
}`;
const DOWN_FS = HEAD + `uniform sampler2D uSrc; uniform vec2 uHalf; uniform vec2 uDst; out vec4 o;
void main(){ vec2 uv = gl_FragCoord.xy / uDst;
  o = (texture(uSrc, uv) * 4.0 + texture(uSrc, uv - uHalf) + texture(uSrc, uv + uHalf) + texture(uSrc, uv + vec2(uHalf.x, -uHalf.y)) + texture(uSrc, uv - vec2(uHalf.x, -uHalf.y))) / 8.0; }`;
const UP_FS = HEAD + `uniform sampler2D uSrc; uniform vec2 uHalf; uniform vec2 uDst; out vec4 o;
void main(){ vec2 uv = gl_FragCoord.xy / uDst; vec2 h = uHalf;
  vec4 s = texture(uSrc, uv + vec2(-h.x * 2.0, 0.0)) + texture(uSrc, uv + vec2(-h.x, h.y)) * 2.0 + texture(uSrc, uv + vec2(0.0, h.y * 2.0)) + texture(uSrc, uv + vec2(h.x, h.y)) * 2.0
    + texture(uSrc, uv + vec2(h.x * 2.0, 0.0)) + texture(uSrc, uv + vec2(h.x, -h.y)) * 2.0 + texture(uSrc, uv + vec2(0.0, -h.y * 2.0)) + texture(uSrc, uv + vec2(-h.x, -h.y)) * 2.0;
  o = s / 12.0; }`;

const STRIDE = 24;   // floats per instance (6 x vec4)

/** The 16³ colour grade: day = a touch warmer and richer; night = cooler, calmer, teal shadows. Blended by tod. */
export function makeLut(tod, size = 16) {
  const out = new Uint8Array(size * size * size * 4);
  let i = 0;
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const R = (r / (size - 1)) * 255, G = (g / (size - 1)) * 255, B = (b / (size - 1)) * 255;
    let [L, A, Bb] = rgbToOklab(R, G, B);
    const d = [0.62 + (L - 0.6) * 1.04, A * 1.14 + 0.003, Bb * 1.14 + 0.006];   // day: +8% chroma over the base grade, midtones up 3%
    const n = [L * 0.98, A * 0.86 - 0.012 * (1 - L), Bb * 0.86 - 0.008 * (1 - L)];
    L = d[0] + (n[0] - d[0]) * tod; A = d[1] + (n[1] - d[1]) * tod; Bb = d[2] + (n[2] - d[2]) * tod;
    const c = oklabToRgb(L, A, Bb);
    out[i++] = Math.max(0, Math.min(255, Math.round(c[0]))); out[i++] = Math.max(0, Math.min(255, Math.round(c[1]))); out[i++] = Math.max(0, Math.min(255, Math.round(c[2]))); out[i++] = 255;
  }
  return out;
}

export class Glaze {
  constructor(canvas, atlas, { force = false } = {}) {
    this.canvas = canvas; this.atlas = atlas; this.name = 'glaze';
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, depth: false, stencil: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: !force });
    if (!gl) throw new Error('no webgl2');
    this.gl = gl;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.pSprite = this._prog(SPRITE_VS, SPRITE_FS); this.pSky = this._prog(FULL_VS, SKY_FS); this.pPost = this._prog(FULL_VS, POST_FS);
    this.pDown = this._prog(FULL_VS, DOWN_FS); this.pUp = this._prog(FULL_VS, UP_FS);
    this.u = new Map();
    this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.cap = 4096; this.data = new Float32Array(this.cap * STRIDE);
    this.inst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.inst); gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    for (let k = 1; k <= 6; k++) { gl.enableVertexAttribArray(k); gl.vertexAttribDivisor(k, 1); }
    this._pointers(0);
    this.emptyVao = gl.createVertexArray();
    gl.bindVertexArray(null);
    this.zero = this._tex(1, 1, new Uint8Array(4));
    this.texs = []; this.runs = new Int32Array(4 * 512); this.m = new Float32Array(6);
    this.fb = null; this.fbW = 0; this.fbH = 0; this.mrt = false;
    this.lut = gl.createTexture(); this.lutKey = -1;
    this.bufs1 = [gl.COLOR_ATTACHMENT0]; this.bufs2 = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1];
    this.draws = 0; this.lightU = new Float32Array(16); this.lightC = new Float32Array(12);
    this.uploads = { full: 0, sub: 0, px: 0 }; this.freedSeen = -1; this.up = null;
  }
  _shader(type, src) {
    const gl = this.gl, s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('shader: ' + gl.getShaderInfoLog(s));
    return s;
  }
  _prog(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    gl.attachShader(p, this._shader(gl.VERTEX_SHADER, vs)); gl.attachShader(p, this._shader(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('link: ' + gl.getProgramInfoLog(p));
    return p;
  }
  _loc(p, name) { let m = this.u.get(p); if (!m) { m = {}; this.u.set(p, m); } if (!(name in m)) m[name] = this.gl.getUniformLocation(p, name); return m[name]; }
  _pointers(start) {
    const gl = this.gl, B = STRIDE * 4, base = start * B;
    for (let k = 0; k < 6; k++) gl.vertexAttribPointer(k + 1, 4, gl.FLOAT, false, B, base + k * 16);
  }
  _tex(w, h, data, filter) {
    const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter || gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter || gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null);
    return t;
  }
  /** Mirror atlas page canvases into textures. Storage is allocated once per page (texStorage2D); after that only the
   *  rectangle baked since the last frame is copied (via a small scratch canvas, texSubImage2D). */
  _upload(t, key, canvas, rect, full) {
    const gl = this.gl, W = canvas.width, H = canvas.height;
    if (!t[key] || t[key + 'W'] !== W || t[key + 'H'] !== H) {
      if (t[key]) gl.deleteTexture(t[key]);
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, Math.max(1, W), Math.max(1, H));
      t[key] = tex; t[key + 'W'] = W; t[key + 'H'] = H; full = true;
    } else gl.bindTexture(gl.TEXTURE_2D, t[key]);
    if (!full && rect) {
      const x0 = Math.max(0, Math.floor(rect[0])), y0 = Math.max(0, Math.floor(rect[1])), x1 = Math.min(W, Math.ceil(rect[2])), y1 = Math.min(H, Math.ceil(rect[3]));
      const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return;
      if (w * h < W * H * 0.4) {
        let up = this.up; if (!up) up = this.up = this.canvas.ownerDocument.createElement('canvas');
        if (up.width !== w || up.height !== h) { up.width = w; up.height = h; } else up.getContext('2d').clearRect(0, 0, w, h);
        up.getContext('2d').drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, gl.RGBA, gl.UNSIGNED_BYTE, up);
        this.uploads.sub++; this.uploads.px += w * h; return;
      }
    }
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    this.uploads.full++; this.uploads.px += W * H;
  }
  _sync(pageId) {
    const gl = this.gl, p = this.atlas.pages[pageId];
    let t = this.texs[pageId];
    if (t && t.uid !== p.uid) { this._freeTex(t); t = null; }
    if (!t) t = this.texs[pageId] = { uid: p.uid, ver: -1, mver: -1 };
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    if (t.ver !== p.version) { this._upload(t, 'tex', p.canvas, p.dr, p.full || t.ver < 0); p.dr = null; p.full = false; t.ver = p.version; }
    if (p.mask && t.mver !== p.maskVersion) { this._upload(t, 'mask', p.mask, p.mdr, p.mfull || t.mver < 0); p.mdr = null; p.mfull = false; t.mver = p.maskVersion; }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    return t;
  }
  _freeTex(t) { const gl = this.gl; if (t.tex) gl.deleteTexture(t.tex); if (t.mask) gl.deleteTexture(t.mask); t.tex = t.mask = null; }
  /** Pages the atlas freed (or recycled into a new page) lose their textures at once. */
  _gc() {
    if (this.freedSeen === this.atlas.freed) return;
    this.freedSeen = this.atlas.freed;
    this.texs.forEach((t, i) => { const p = this.atlas.pages[i]; if (t && (!p || p.dead || p.uid !== t.uid)) { this._freeTex(t); this.texs[i] = null; } });
  }
  resize(pw, ph) { if (this.canvas.width !== pw || this.canvas.height !== ph) { this.canvas.width = pw; this.canvas.height = ph; } }
  _targets(w, h, bloom) {
    const gl = this.gl;
    if (this.fb && this.fbW === w && this.fbH === h && this.mrt === bloom) return;
    this._freeTargets();
    this.fbW = w; this.fbH = h; this.mrt = bloom;
    this.sceneTex = this._tex(w, h); this.fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0);
    if (bloom) {
      this.emTex = this._tex(w, h); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.emTex, 0);
      const mk = (tw, th) => { const t = this._tex(Math.max(1, tw), Math.max(1, th)); const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, f, w: Math.max(1, tw), h: Math.max(1, th) }; };
      this.half = mk(w >> 1, h >> 1); this.quarter = mk(w >> 2, h >> 2); this.halfUp = mk(w >> 1, h >> 1);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  _freeTargets() {
    const gl = this.gl;
    for (const t of [this.sceneTex, this.emTex]) if (t) gl.deleteTexture(t);
    if (this.fb) gl.deleteFramebuffer(this.fb);
    for (const x of [this.half, this.quarter, this.halfUp]) if (x) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); }
    this.fb = this.sceneTex = this.emTex = this.half = this.quarter = this.halfUp = null;
  }
  _lut(tod) {
    const key = Math.round(tod * 15);
    if (key === this.lutKey) return;
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_3D, this.lut);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 16, 16, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, makeLut(key / 15));
    this.lutKey = key;
  }
  _full(prog, w, h, fb) { const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, w, h); gl.useProgram(prog); gl.bindVertexArray(this.emptyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); this.draws++; }
  draw(L, F) {
    const gl = this.gl; if (!gl || gl.isContextLost()) return;
    const A = this.atlas, V = F.view, pw = this.canvas.width, ph = this.canvas.height, r = F.renderScale || 1;
    const W = Math.max(1, Math.round(pw * r)), H = Math.max(1, Math.round(ph * r));
    const bloom = !!F.bloom;
    this._targets(W, H, bloom); this._gc();
    this.draws = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb); gl.viewport(0, 0, W, H);
    gl.drawBuffers(bloom ? this.bufs2 : this.bufs1);   // the sky pass writes every pixel of both targets: no clear needed
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    // 1. sky
    const sp = this.pSky; gl.useProgram(sp);
    gl.uniform3fv(this._loc(sp, 'uTop'), F.sky.top); gl.uniform3fv(this._loc(sp, 'uBot'), F.sky.bottom);
    gl.uniform2f(this._loc(sp, 'uRes'), pw, ph); gl.uniform1f(this._loc(sp, 'uScale'), r); gl.uniform1f(this._loc(sp, 'uTime'), F.time);
    gl.uniform1f(this._loc(sp, 'uWisp'), F.contrast ? 0 : 1 - F.tod * 0.7); gl.uniform1f(this._loc(sp, 'uFlat'), F.contrast ? 1 : 0);
    gl.bindVertexArray(this.emptyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); this.draws++;
    // 2. sprites: fill instances in list order, cut into runs by (page, blend)
    const idx = L.order(), n = L.n, m = this.m;
    if (n > this.cap) { while (this.cap < n) this.cap *= 2; this.data = new Float32Array(this.cap * STRIDE); gl.bindBuffer(gl.ARRAY_BUFFER, this.inst); gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW); }
    const D = this.data; let c = 0, runs = 0, rp = -1, rb = -1;
    for (let o = 0; o < n; o++) {
      const i = idx[o]; const e = A.entries[L.e[i]];
      if (!e || !e.alive || L.alpha[i] <= 0.003) continue;
      V.matrix(L, i, m);
      let w = L.w[i]; const h = L.h[i];
      if (w < 0) { w = -w; m[0] = -m[0]; m[1] = -m[1]; }
      const pg = A.pages[e.page], P = pg.canvas;
      const b = L.blend[i];
      if (e.page !== rp || b !== rb) {
        if (runs * 4 + 4 > this.runs.length) { const nr = new Int32Array(this.runs.length * 2); nr.set(this.runs); this.runs = nr; }
        this.runs[runs * 4] = c; this.runs[runs * 4 + 1] = 0; this.runs[runs * 4 + 2] = e.page; this.runs[runs * 4 + 3] = b; runs++; rp = e.page; rb = b;
      }
      this.runs[(runs - 1) * 4 + 1]++;
      const k = c * STRIDE;
      D[k] = m[0]; D[k + 1] = m[1]; D[k + 2] = m[2]; D[k + 3] = m[3];
      D[k + 4] = m[4]; D[k + 5] = m[5]; D[k + 6] = L.wind[i]; D[k + 7] = L.x[i];
      D[k + 8] = -L.ax[i] * w; D[k + 9] = -L.ay[i] * h; D[k + 10] = w; D[k + 11] = h;
      D[k + 12] = e.x / P.width; D[k + 13] = e.y / P.height; D[k + 14] = (e.x + e.w) / P.width; D[k + 15] = (e.y + e.h) / P.height;
      D[k + 16] = L.tr[i]; D[k + 17] = L.tg[i]; D[k + 18] = L.tb[i]; D[k + 19] = L.alpha[i];
      D[k + 20] = L.flash[i]; D[k + 21] = L.emis[i]; D[k + 22] = L.lit[i]; D[k + 23] = L.grade[i];
      c++;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst); gl.bufferSubData(gl.ARRAY_BUFFER, 0, D, 0, c * STRIDE);
    const p = this.pSprite; gl.useProgram(p);
    gl.uniform2f(this._loc(p, 'uRes'), pw, ph); gl.uniform1f(this._loc(p, 'uScale'), r); gl.uniform1f(this._loc(p, 'uTime'), F.time);
    gl.uniform3fv(this._loc(p, 'uAmb'), F.ambient); gl.uniform1f(this._loc(p, 'uEmOut'), 0.35 + 0.65 * F.tod);
    const rk = 0.42 * Math.max(0, Math.min(1, (F.tod - 0.55) / 0.35)); gl.uniform3f(this._loc(p, 'uRim'), 0.62 * rk, 0.78 * rk, 1.0 * rk);
    // point lights -> device px
    let nl = 0;
    for (const l of F.lights) {
      if (nl >= F.maxLights || !l.on || l.intensity <= 0.01) continue;
      const s = V.scale, z = V.zoom, lx = V.offX + (V.vw / 2 + (l.x - V.camX) * z + V.shakeX) * s, ly = V.offY + (V.vh / 2 + (l.y - V.camY) * z + V.shakeY) * s, lr = l.radius * s * z;
      if (lx < -lr || ly < -lr || lx > pw + lr || ly > ph + lr) continue;   // off screen: the slots go to lights in view
      this.lightU[nl * 4] = lx; this.lightU[nl * 4 + 1] = ly; this.lightU[nl * 4 + 2] = lr; this.lightU[nl * 4 + 3] = l.intensity * F.lightK;
      this.lightC[nl * 3] = l.r; this.lightC[nl * 3 + 1] = l.g; this.lightC[nl * 3 + 2] = l.b; nl++;
    }
    gl.uniform1i(this._loc(p, 'uNL'), nl); gl.uniform4fv(this._loc(p, 'uL'), this.lightU); gl.uniform3fv(this._loc(p, 'uLC'), this.lightC);
    gl.uniform1i(this._loc(p, 'uTex'), 0); gl.uniform1i(this._loc(p, 'uMask'), 1);
    gl.enable(gl.BLEND); gl.bindVertexArray(this.vao);
    for (let ri = 0; ri < runs; ri++) {
      const start = this.runs[ri * 4], count = this.runs[ri * 4 + 1], page = this.runs[ri * 4 + 2], blend = this.runs[ri * 4 + 3];
      const t = this._sync(page);
      const P = A.pages[page].canvas; gl.uniform2f(this._loc(p, 'uRimOff'), -9 / P.width, -9 / P.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t.mask || this.zero);
      gl.useProgram(p); gl.bindVertexArray(this.vao);
      if (blend === BLEND_ADD) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.inst); this._pointers(start);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count); this.draws++;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.disable(gl.BLEND); gl.bindVertexArray(null);
    // 3. bloom (high tier): emissive -> 1/2 -> 1/4 -> 1/2, dual Kawase
    if (bloom) {
      const pass = (prog, src, sw, sh, dst) => {
        gl.useProgram(prog); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src);
        gl.uniform1i(this._loc(prog, 'uSrc'), 0); gl.uniform2f(this._loc(prog, 'uHalf'), 0.5 / sw, 0.5 / sh); gl.uniform2f(this._loc(prog, 'uDst'), dst.w, dst.h);
        this._full(prog, dst.w, dst.h, dst.f);
      };
      pass(this.pDown, this.emTex, W, H, this.half); pass(this.pDown, this.half.t, this.half.w, this.half.h, this.quarter); pass(this.pUp, this.quarter.t, this.quarter.w, this.quarter.h, this.halfUp);
    }
    // 4. post: LUT + vignette + flash + iris, to the canvas
    this._lut(F.tod);
    const q = this.pPost; gl.useProgram(q);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex); gl.uniform1i(this._loc(q, 'uScene'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloom ? this.halfUp.t : this.zero); gl.uniform1i(this._loc(q, 'uBloom'), 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_3D, this.lut); gl.uniform1i(this._loc(q, 'uLut'), 2);
    gl.uniform1f(this._loc(q, 'uBloomK'), bloom ? 1.6 : 0); gl.uniform1f(this._loc(q, 'uVig'), F.vignette);
    gl.uniform1f(this._loc(q, 'uFlash'), F.flash); const fc = F.flashRgb; gl.uniform3f(this._loc(q, 'uFlashC'), fc[0], fc[1], fc[2]);
    gl.uniform4f(this._loc(q, 'uIris'), F.irisX * pw, F.irisY * ph, Math.hypot(pw, ph) * 1.25 * F.iris, F.iris);
    gl.uniform2f(this._loc(q, 'uOut'), pw, ph);
    this._full(q, pw, ph, null);
    gl.activeTexture(gl.TEXTURE0);
  }
  /** Free every GPU resource and release the context itself (browsers cap live WebGL contexts per page). */
  dispose() {
    const gl = this.gl; if (!gl) return;
    if (!gl.isContextLost()) {
      this._freeTargets();
      for (const t of this.texs) if (t) this._freeTex(t);
      for (const pr of [this.pSprite, this.pSky, this.pPost, this.pDown, this.pUp]) if (pr) gl.deleteProgram(pr);
      for (const b of [this.quad, this.inst]) if (b) gl.deleteBuffer(b);
      for (const v of [this.vao, this.emptyVao]) if (v) gl.deleteVertexArray(v);
      for (const t of [this.zero, this.lut]) if (t) gl.deleteTexture(t);
    }
    this.texs = []; this.disposed = true;
    try { const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) { /* ignore */ }
    this.gl = null;
    try { this.canvas.width = this.canvas.height = 1; } catch (e) { /* ignore */ }
  }
}
