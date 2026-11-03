// Grid ink on the GPU, in WebGL2: the same method as gridink.js, which stays as its reference and
// its fallback where float textures aren't available. Tools, drops and saving still run on the
// CPU. Only what's done to every cell every tick moves here: carrying the maps, carrying velocity,
// projecting, and working out the picture. The fields live on the GPU while the flow runs and are
// copied back into this.grid only when something on the CPU needs them.
//
// With repeating off, textures mirror at their edges instead of wrapping, which gives solid sides.
//
// One difference: projection is Jacobi iteration, warm-started from the last tick, not an FFT. It's
// less exact over long distances, so large-scale flow may compress the surface very slightly.
import { GridInk, FILM_ALPHA as FILM_ALPHA_GL, SMALL_PUSH as SMALL_PUSH_GL, parseColor as parseColorGL } from './gridink.js';

const JACOBI = 40;
const TOOL_GRIP = 0.6;
const DEPTH = 15;
const LEAST_FRICTION = 0.25;
const CALM = 0.4;
const LONGEST_COAST = 25;
const VELOCITY_MAP_TICKS = 30;
const INK_MAP_TICKS = 600;
const MAP_ERROR = 1;
const CHECK_EVERY = 10;
const REDUCE = 8; // cells to a pixel when measuring speeds and map errors

const VERT = `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0, 1); }`;
const HEAD = `#version 300 es
precision highp float; precision highp sampler2D;
uniform vec2 size; out vec4 o;
#define CELL (gl_FragCoord.xy - 0.5)
vec4 S(sampler2D t, vec2 p) { return texture(t, (p + 0.5) / size); }
const vec2 OFF[5] = vec2[5](vec2(-.25,-.25), vec2(.25,-.25), vec2(-.25,.25), vec2(.25,.25), vec2(0));
const float W[5] = float[5](.125,.125,.125,.125,.5);
`;
const SHADERS = {
  // Speed in cells per second, including what tools are doing directly.
  adv: `uniform sampler2D u, kin; uniform vec2 h;
    void main() { o = vec4((texelFetch(u, ivec2(CELL), 0).xy + texelFetch(kin, ivec2(CELL), 0).xy) / h, 0, 1); }`,
  // Third-order Runge-Kutta from where the cell's parcel has got to.
  forward: `uniform sampler2D F, adv; uniform float dt;
    void main() {
      vec2 f = texelFetch(F, ivec2(CELL), 0).xy, x = CELL + f;
      vec2 a = S(adv, x).xy, b = S(adv, x + .5 * dt * a).xy, c = S(adv, x + .75 * dt * b).xy;
      o = vec4(f + dt * (2. / 9. * a + 3. / 9. * b + 4. / 9. * c), 0, 1);
    }`,
  // Dual mesh characteristics: the speed's local slope gives an exact trace back.
  backward: `uniform sampler2D B, adv; uniform float dt;
    void main() {
      vec2 v = texelFetch(adv, ivec2(CELL), 0).xy;
      vec2 off = vec2(v.x > 0. ? -1. : 1., v.y > 0. ? -1. : 1.);
      vec2 a = (S(adv, CELL + off).xy - v) / off, back;
      back.x = abs(a.x) > 1e-4 ? (1. - exp(-a.x * dt)) * v.x / a.x : dt * v.x;
      back.y = abs(a.y) > 1e-4 ? (1. - exp(-a.y * dt)) * v.y / a.y : dt * v.y;
      o = vec4(S(B, CELL - back).xy - back, 0, 1);
    }`,
  carry: `uniform sampler2D B, U0, DU;
    void main() { vec4 s = vec4(0);
      for (int k = 0; k < 5; k++) { vec2 p = CELL + OFF[k], q = p + S(B, p).xy; s += W[k] * (S(U0, q) + S(DU, q)); }
      o = vec4(s.xy, 0, 1); }`,
  lost: `uniform sampler2D F, U, U0, DU;
    void main() { vec4 s = vec4(0);
      for (int k = 0; k < 5; k++) { vec2 p = CELL + OFF[k]; s += W[k] * S(U, p + S(F, p).xy); }
      ivec2 c = ivec2(CELL);
      o = vec4(.5 * (s.xy - texelFetch(DU, c, 0).xy - texelFetch(U0, c, 0).xy), 0, 1); }`,
  correct: `uniform sampler2D B, U, L;
    void main() { vec4 s = vec4(0);
      for (int k = 0; k < 5; k++) { vec2 p = CELL + OFF[k]; s += W[k] * S(L, p + S(B, p).xy); }
      vec2 lo = vec2(1e20), hi = vec2(-1e20);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 n = S(U, CELL + vec2(i, j)).xy; lo = min(lo, n); hi = max(hi, n); }
      o = vec4(clamp(texelFetch(U, ivec2(CELL), 0).xy - s.xy, lo, hi), 0, 1); }`,
  // Floor friction and one step of viscosity.
  fade: `uniform sampler2D U; uniform float keep; uniform vec2 r;
    void main() { vec2 v = S(U, CELL).xy;
      vec2 lap = r.x * (S(U, CELL + vec2(1,0)).xy + S(U, CELL - vec2(1,0)).xy - 2. * v) + r.y * (S(U, CELL + vec2(0,1)).xy + S(U, CELL - vec2(0,1)).xy - 2. * v);
      o = vec4((v + lap) * keep, 0, 1); }`,
  force: `uniform sampler2D U, pin, kin; uniform float grip;
    void main() { ivec2 c = ivec2(CELL); vec2 v = texelFetch(U, c, 0).xy; vec4 p = texelFetch(pin, c, 0);
      o = vec4(v + p.z * (p.xy - v) + grip * texelFetch(kin, c, 0).xy, 0, 1); }`,
  minus: `uniform sampler2D a, b;
    void main() { ivec2 c = ivec2(CELL); o = vec4(texelFetch(a, c, 0).xy - texelFetch(b, c, 0).xy, 0, 1); }`,
  // With solid sides, the flow reversed past a side stands for no flow through it.
  div: `uniform sampler2D U; uniform vec2 h; uniform float solid;
    void main() { vec2 c = S(U, CELL).xy;
      float e = S(U, CELL + vec2(1,0)).x, w = S(U, CELL - vec2(1,0)).x, n = S(U, CELL + vec2(0,1)).y, s = S(U, CELL - vec2(0,1)).y;
      if (solid > .5) {
        if (CELL.x < .5) w = -c.x;
        if (CELL.x > size.x - 1.5) e = -c.x;
        if (CELL.y < .5) s = -c.y;
        if (CELL.y > size.y - 1.5) n = -c.y;
      }
      o = vec4((e - w) / (2. * h.x) + (n - s) / (2. * h.y), 0, 0, 1); }`,
  jacobi: `uniform sampler2D P, D; uniform vec2 h;
    void main() { vec2 i = 1. / (h * h);
      float s = (S(P, CELL + vec2(1,0)).x + S(P, CELL - vec2(1,0)).x) * i.x + (S(P, CELL + vec2(0,1)).x + S(P, CELL - vec2(0,1)).x) * i.y;
      o = vec4((s - texelFetch(D, ivec2(CELL), 0).x) / (2. * (i.x + i.y)), 0, 0, 1); }`,
  project: `uniform sampler2D U, P; uniform vec2 h, drift; uniform float solid;
    void main() { vec2 g = vec2(S(P, CELL + vec2(1,0)).x - S(P, CELL - vec2(1,0)).x, S(P, CELL + vec2(0,1)).x - S(P, CELL - vec2(0,1)).x) / (2. * h);
      vec2 v = texelFetch(U, ivec2(CELL), 0).xy - g - drift;
      if (solid > .5) {
        if (CELL.x < .5 || CELL.x > size.x - 1.5) v.x = 0.;
        if (CELL.y < .5 || CELL.y > size.y - 1.5) v.y = 0.;
      }
      o = vec4(v, 0, 1); }`,
  accumulate: `uniform sampler2D into, change, F; uniform float scale;
    void main() { vec4 s = vec4(0);
      for (int k = 0; k < 5; k++) { vec2 p = CELL + OFF[k]; s += W[k] * S(change, p + S(F, p).xy); }
      o = vec4(texelFetch(into, ivec2(CELL), 0).xy + scale * s.xy, 0, 1); }`,
  mix: `uniform sampler2D a, b;
    void main() { ivec2 c = ivec2(CELL); o = vec4(.5 * (texelFetch(a, c, 0).xy + texelFetch(b, c, 0).xy), 0, 1); }`,
  copy: `uniform sampler2D a; void main() { o = texelFetch(a, ivec2(CELL), 0); }`,
  // Largest speeds and the mean of each block, to read back cheaply.
  reduce: `uniform sampler2D a; uniform int block;
    void main() { vec2 hi = vec2(0), sum = vec2(0);
      for (int j = 0; j < block; j++) for (int i = 0; i < block; i++) { vec2 v = texelFetch(a, ivec2(gl_FragCoord.xy - .5) * block + ivec2(i, j), 0).xy; hi = max(hi, abs(v)); sum += v; }
      o = vec4(hi, sum / float(block * block)); }`,
  // How far a block's first cell ends up from itself after going through both maps.
  mapError: `uniform sampler2D F, B; uniform int block;
    void main() { vec2 p = vec2(ivec2(gl_FragCoord.xy - .5) * block);
      vec2 f = S(F, p).xy, b = S(B, p).xy;
      o = vec4(max(length(f + S(B, p + f).xy), length(b + S(F, p + b).xy)), 0, 0, 1); }`,
  // Ink: a finer grid read through the flow's maps. "flow" is the size of the maps.
  inkRead: `uniform sampler2D B, I; uniform vec2 flow; uniform float detail;
    vec2 map(sampler2D m) { vec2 x = gl_FragCoord.xy / detail; return texture(m, x / flow).xy * detail; }
    void main() { o = S(I, CELL + map(B)); }`,
  inkLost: `uniform sampler2D F, I, I0; uniform vec2 flow; uniform float detail;
    vec2 map(sampler2D m) { vec2 x = gl_FragCoord.xy / detail; return texture(m, x / flow).xy * detail; }
    void main() { o = .5 * (S(I, CELL + map(F)) - texelFetch(I0, ivec2(CELL), 0)); }`,
  inkFix: `uniform sampler2D B, I, L; uniform vec2 flow; uniform float detail;
    vec2 map(sampler2D m) { vec2 x = gl_FragCoord.xy / detail; return texture(m, x / flow).xy * detail; }
    void main() { vec4 v = texelFetch(I, ivec2(CELL), 0) - S(L, CELL + map(B)), lo = vec4(1e20), hi = vec4(-1e20);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec4 n = S(I, CELL + vec2(i, j)); lo = min(lo, n); hi = max(hi, n); }
      o = clamp(v, lo, hi); }`,
  // Growing drops, as splats. "cover": the most ink in each flow cell's block, for labelling films.
  cover: `uniform sampler2D I; uniform float detail;
    void main() { float m = 0.; ivec2 base = ivec2(CELL) * int(detail);
      for (int j = 0; j < 8; j++) for (int i = 0; i < 8; i++) { if (i >= int(detail) || j >= int(detail)) continue; m = max(m, texelFetch(I, base + ivec2(i, j), 0).a); }
      o = vec4(m, 0, 0, 1); }`,
  // Each growing drop pushes its own film outward by Jaffer's formula read backwards; pushes from
  // all drops add up, then the picture is read once at the pushed position (clamped Catmull-Rom).
  dropPush: `uniform sampler2D I, labels, drops; uniform int n; uniform vec2 h, flow; uniform float detail, tiled;
    ivec2 wrapI(ivec2 c) { ivec2 s = ivec2(size); return tiled > .5 ? (c % s + s) % s : clamp(c, ivec2(0), s - 1); }
    float labelAt(vec2 p) {
      ivec2 f = ivec2(floor(floor(p + .5) / detail)), fs = ivec2(flow);
      f = tiled > .5 ? (f % fs + fs) % fs : clamp(f, ivec2(0), fs - 1);
      return texelFetch(labels, f, 0).r;
    }
    vec4 cr(float u) { return .5 * vec4(-u*u*u + 2.*u*u - u, 3.*u*u*u - 5.*u*u + 2., -3.*u*u*u + 4.*u*u + u, u*u*u - u*u); }
    vec4 sharp(vec2 p) {
      vec2 b = floor(p), f = p - b; vec4 wx = cr(f.x), wy = cr(f.y), sum = vec4(0), lo = vec4(1e20), hi = vec4(-1e20);
      for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
        vec4 v = texelFetch(I, wrapI(ivec2(b) + ivec2(i - 1, j - 1)), 0);
        sum += wx[i] * wy[j] * v;
        if ((i == 1 || i == 2) && (j == 1 || j == 2)) { lo = min(lo, v); hi = max(hi, v); }
      }
      return clamp(sum, lo, hi);
    }
    void main() {
      vec2 c = CELL; vec2 push = vec2(0); bool touched = false; float here = labelAt(c);
      for (int k = 0; k < 256; k++) {
        if (k >= n) break;
        vec4 d = texelFetch(drops, ivec2(k, 0), 0); vec4 e = texelFetch(drops, ivec2(k, 2), 0);
        vec2 dc = c - d.xy;
        if (tiled > .5) dc -= size * floor(dc / size + .5);
        vec2 dm = dc * h; float d2 = dot(dm, dm);
        if (d2 > e.y * e.y || d2 < 1e-9) continue;
        float shrink = d2 > d.z ? 1. - sqrt(1. - d.z / d2) : 1.;
        vec2 back = dc * shrink;
        if (labelAt(c - back) != d.w) continue;
        if (here != 0. && here != d.w) continue;
        push -= back; touched = true;
      }
      o = touched ? sharp(c + push) : texelFetch(I, ivec2(c), 0);
    }`,
  // Then each drop lays its colour over its middle, in the order they grew.
  dropLay: `uniform sampler2D I, drops; uniform int n; uniform vec2 h; uniform float tiled;
    void main() {
      vec2 c = CELL; vec4 v = texelFetch(I, ivec2(c), 0);
      for (int k = 0; k < 256; k++) {
        if (k >= n) break;
        vec4 d = texelFetch(drops, ivec2(k, 0), 0); vec4 col = texelFetch(drops, ivec2(k, 1), 0); vec4 e = texelFetch(drops, ivec2(k, 2), 0);
        vec2 dc = c - d.xy;
        if (tiled > .5) dc -= size * floor(dc / size + .5);
        float cover = clamp((e.x - length(dc * h)) / h.x + .5, 0., 1.);
        if (cover > 0.) v = v * (1. - cover * col.a) + col * cover;
      }
      o = v;
    }`,
  // To the visible canvas. The first row of the grid is the image's top row, as with putImageData.
  show: `uniform sampler2D I; void main() { o = texelFetch(I, ivec2(gl_FragCoord.x - .5, size.y - gl_FragCoord.y - .5 + 0.), 0); }`,
};

// One context for the page, and its textures reused for each size of tank.
let shared;
function context() {
  if (shared !== undefined) return shared;
  shared = null;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
  if (!gl || !gl.getExtension('EXT_color_buffer_float') || !gl.getExtension('OES_texture_float_linear')) return null;
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`${gl.getShaderInfoLog(sh)}\n${src.slice(0, 300)}`);
    return sh;
  };
  const vert = compile(gl.VERTEX_SHADER, VERT);
  const programs = {};
  for (const [name, src] of Object.entries(SHADERS)) {
    const p = gl.createProgram();
    gl.attachShader(p, vert);
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, HEAD + src));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const uniforms = {};
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
      const u = gl.getActiveUniform(p, i);
      uniforms[u.name] = { at: gl.getUniformLocation(p, u.name), type: u.type };
    }
    programs[name] = { p, uniforms };
  }
  gl.bindVertexArray(gl.createVertexArray());
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  shared = { gl, canvas, programs, sets: new Map() };
  return shared;
}

export class GridInkGL extends GridInk {
  // noGpu forces the CPU path, for comparing the two.
  get gpu() { return this.method === 'bimocq' && !this.noGpu ? context() : null; }

  // The textures, and whether the CPU's copy of each group is newer.
  get _t() {
    const ctx = this.gpu;
    if (this._gl) return this._gl;
    const g = this._g;
    const key = `${g.nx}x${g.ny}/${g.ix}x${g.iy}`;
    let t = ctx.sets.get(key);
    if (!t) {
      const { gl } = ctx;
      const make = (w, h, inner = gl.RGBA32F) => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texStorage2D(gl.TEXTURE_2D, 1, inner, w, h);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { tex, fbo, w, h };
      };
      const flow = () => make(g.nx, g.ny);
      const ink = () => make(g.ix, g.iy, gl.RGBA16F);
      const rw = Math.ceil(g.nx / REDUCE);
      const rh = Math.ceil(g.ny / REDUCE);
      t = {
        u: flow(), uNext: flow(), u0: flow(), du: flow(), F: flow(), B: flow(), iF: flow(), iB: flow(), adv: flow(),
        pin: flow(), kin: flow(), P: flow(), P2: flow(), D: flow(), before: flow(), a: flow(), b: flow(), c: flow(), d: flow(),
        ink0: ink(), ink: ink(), lost: ink(), plain: ink(), small: make(rw, rh), rw, rh,
      };
      ctx.sets.set(key, t);
    }
    // Reused textures still hold the last tank's tools and pressure.
    for (const f of [t.pin, t.kin, t.P, t.P2]) {
      ctx.gl.bindFramebuffer(ctx.gl.FRAMEBUFFER, f.fbo);
      ctx.gl.clearColor(0, 0, 0, 1);
      ctx.gl.clear(ctx.gl.COLOR_BUFFER_BIT);
    }
    this._gl = { t, cpuFlow: true, cpuInk: true, cpuInkMaps: true, cpuKin: false, pinField: null, buffer: new Float32Array(g.nx * g.ny * 4), inkBuffer: null };
    return this._gl;
  }

  _pass(name, target, uniforms = {}) {
    const { gl, programs } = this.gpu;
    const { p, uniforms: found } = programs[name];
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.fbo ?? null);
    const w = target?.w ?? gl.canvas.width;
    const h = target?.h ?? gl.canvas.height;
    gl.viewport(0, 0, w, h);
    if (found.size) gl.uniform2f(found.size.at, w, h);
    let unit = 0;
    for (const [key, value] of Object.entries(uniforms)) {
      const u = found[key];
      if (!u) continue;
      if (value?.tex) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, value.tex);
        gl.uniform1i(u.at, unit++);
      } else if (u.type === gl.INT) gl.uniform1i(u.at, value);
      else if (Array.isArray(value)) gl.uniform2f(u.at, value[0], value[1]);
      else gl.uniform1f(u.at, value);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  _upload(target, x, y, packed) {
    const { gl } = this.gpu;
    const size = target.w * target.h;
    const data = packed ?? this._gl.buffer;
    if (!packed) for (let i = 0; i < size; i++) { data[i * 4] = x[i]; data[i * 4 + 1] = y ? y[i] : 0; data[i * 4 + 2] = 0; data[i * 4 + 3] = 1; }
    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, target.w, target.h, gl.RGBA, gl.FLOAT, data);
  }

  _read(target, data) {
    const { gl } = this.gpu;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.readPixels(0, 0, target.w, target.h, gl.RGBA, gl.FLOAT, data);
    return data;
  }

  _download(target, x, y) {
    const data = this._read(target, this._gl.buffer);
    for (let i = 0; i < x.length; i++) { x[i] = data[i * 4]; y[i] = data[i * 4 + 1]; }
  }

  // Anything the CPU changed goes to the GPU before the next tick.
  _uploadChanges() {
    const s = this._t;
    const { t } = s;
    const g = this._g;
    // Textures are shared between tanks, so they take this tank's edges whenever that differs.
    if (t.tiled !== this.tileOn) {
      const { gl } = this.gpu;
      const wrap = this.tileOn ? gl.REPEAT : gl.MIRRORED_REPEAT;
      for (const f of Object.values(t)) {
        if (!f?.tex) continue;
        gl.bindTexture(gl.TEXTURE_2D, f.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      }
      t.tiled = this.tileOn;
    }
    if (s.cpuFlow) {
      this._upload(t.u, g.u, g.v);
      this._upload(t.uNext, g.uNext, g.vNext);
      this._upload(t.u0, g.u0, g.v0);
      this._upload(t.du, g.du, g.dv);
      this._upload(t.F, g.fx, g.fy);
      this._upload(t.B, g.bx, g.by);
      s.cpuFlow = false;
    }
    if (s.cpuInkMaps) {
      this._upload(t.iF, g.ifx, g.ify);
      this._upload(t.iB, g.ibx, g.iby);
      s.cpuInkMaps = false;
    }
    if (s.cpuInk) {
      const size = g.ix * g.iy;
      const data = s.inkBuffer ??= new Float32Array(size * 4);
      const [r, gg, b, a] = g.ink0;
      for (let i = 0; i < size; i++) { data[i * 4] = r[i]; data[i * 4 + 1] = gg[i]; data[i * 4 + 2] = b[i]; data[i * 4 + 3] = a[i]; }
      this._upload(t.ink0, null, null, data);
      s.cpuInk = false;
    }
  }

  // Copies everything on the GPU back, for saving a tank.
  _downloadAll() {
    const s = this._gl;
    if (!s || !this.gpu) return;
    const { t } = s;
    const g = this._g;
    if (!s.cpuFlow) {
      this._download(t.u, g.u, g.v);
      this._download(t.uNext, g.uNext, g.vNext);
      this._download(t.u0, g.u0, g.v0);
      this._download(t.du, g.du, g.dv);
      this._download(t.F, g.fx, g.fy);
      this._download(t.B, g.bx, g.by);
    }
    if (!s.cpuInkMaps) {
      this._download(t.iF, g.ifx, g.ify);
      this._download(t.iB, g.ibx, g.iby);
    }
    if (!s.cpuInk) this._downloadInk(t.ink0, g.ink0);
  }

  _downloadInk(target, into) {
    const s = this._gl;
    const size = this._g.ix * this._g.iy;
    const data = this._read(target, s.inkBuffer ??= new Float32Array(size * 4));
    for (let ch = 0; ch < 4; ch++) {
      const f = into[ch];
      for (let i = 0; i < size; i++) f[i] = data[i * 4 + ch];
    }
  }

  saveState() {
    if (this.gpu && this._gl) {
      this._downloadAll();
      if (this._g.inkStale) this._refreshInk();
    }
    return super.saveState();
  }

  // ---- A tick ----------------------------------------------------------------------------------

  _measure(source) {
    const s = this._gl;
    const { t } = s;
    const { rw, rh } = t;
    this._pass('reduce', t.small, { a: source, block: REDUCE });
    const data = this._read(t.small, s.smallData ??= new Float32Array(rw * rh * 4));
    let topX = 0, topY = 0, meanX = 0, meanY = 0;
    for (let i = 0; i < rw * rh; i++) {
      topX = Math.max(topX, data[i * 4]);
      topY = Math.max(topY, data[i * 4 + 1]);
      meanX += data[i * 4 + 2];
      meanY += data[i * 4 + 3];
    }
    return { topX, topY, meanX: meanX / (rw * rh), meanY: meanY / (rw * rh) };
  }

  _mapsDisagree(F, B) {
    const s = this._gl;
    const { t } = s;
    const { rw, rh } = t;
    this._pass('mapError', t.small, { F, B, block: REDUCE });
    const data = this._read(t.small, s.smallData ??= new Float32Array(rw * rh * 4));
    let worst = 0;
    for (let i = 0; i < rw * rh; i++) worst = Math.max(worst, data[i * 4]);
    return worst > MAP_ERROR;
  }

  _advanceMapsGL(F, B, a, dt, steps) {
    const h = dt / steps;
    const { adv } = this._gl.t;
    for (let k = 0; k < steps; k++) {
      this._pass('forward', a, { F, adv, dt: h });
      this._pass('copy', F, { a });
      this._pass('backward', a, { B, adv, dt: h });
      this._pass('copy', B, { a });
    }
  }

  // Pins are few and small, so they're worked out here and sent as a field.
  _pinField() {
    const s = this._gl;
    const g = this._g;
    const { nx, ny, hx, hy } = g;
    const pins = this._s.pins;
    if (!pins.length && !s.pinUsed) return;
    const field = s.pinField ??= new Float32Array(nx * ny * 4);
    if (s.pinUsed) field.fill(0);
    for (const { x, y, ux, uy, sigma } of pins) {
      const reach = 3 * sigma;
      const cx = (x + this.width / 2) / hx - 0.5;
      const cy = (y + this.height / 2) / hy - 0.5;
      for (let j = Math.floor(cy - reach / hy); j <= cy + reach / hy; j++) {
        const dy = (j - cy) * hy;
        const jj = this._edge(j, ny);
        if (jj < 0) continue;
        const row = jj * nx;
        for (let i = Math.floor(cx - reach / hx); i <= cx + reach / hx; i++) {
          const ii = this._edge(i, nx);
          if (ii < 0) continue;
          const dx = (i - cx) * hx;
          const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
          const c = (row + ii) * 4;
          const had = field[c + 2];
          const both = had + w - had * w;
          if (both > 0) {
            field[c] = (field[c] * had * (1 - w) + ux * w) / both;
            field[c + 1] = (field[c + 1] * had * (1 - w) + uy * w) / both;
          }
          field[c + 2] = both;
          field[c + 3] = 1;
        }
      }
    }
    this._upload(s.t.pin, null, null, field);
    s.pinUsed = pins.length > 0;
    this._s.pins = [];
  }

  _stepFlow(dt) {
    if (!this.gpu) return super._stepFlow(dt);
    const s = this._s;
    if (!(this.flowing || s.pins.length || s.haveKin)) return;
    const g = this._g;
    const state = this._t;
    const { t } = state;
    const { nx, ny, hx, hy } = g;
    this._uploadChanges();

    if (g.haveNext) this._pass('copy', t.u, { a: t.uNext });
    if (s.haveKin || state.kinUsed) {
      const data = state.buffer;
      for (let i = 0; i < nx * ny; i++) { data[i * 4] = s.kinX[i]; data[i * 4 + 1] = s.kinY[i]; data[i * 4 + 2] = 0; data[i * 4 + 3] = 1; }
      this._upload(t.kin, null, null, data);
      state.kinUsed = s.haveKin;
    }
    this._pass('adv', t.adv, { u: t.u, kin: t.kin, h: [hx, hy] });
    const speed = this._measure(t.adv);
    const steps = Math.max(1, Math.ceil(Math.max(speed.topX, speed.topY) * dt));

    this._advanceMapsGL(t.iF, t.iB, t.a, dt, steps);
    g.inkTicks++;
    g.inkStale = true;
    state.inkShown = false;
    if (g.inkTicks >= INK_MAP_TICKS || (g.inkTicks % CHECK_EVERY === 0 && this._mapsDisagree(t.iF, t.iB))) this._checkpointInkGL();

    this._advanceMapsGL(t.F, t.B, t.a, dt, steps);
    g.velTicks++;

    // Carry velocity, measure what the round trip lost, and put half of it back.
    this._pass('copy', t.before, { a: t.u });
    this._pass('carry', t.a, { B: t.B, U0: t.u0, DU: t.du });
    this._pass('lost', t.b, { F: t.F, U: t.a, U0: t.u0, DU: t.du });
    this._pass('correct', t.u, { B: t.B, U: t.a, L: t.b });

    // Forces. "a" holds velocity before them, "c" what they changed.
    this._pass('copy', t.a, { a: t.u });
    const friction = Math.max(this.flowTuning?.friction ?? LEAST_FRICTION, (2.5 * this.viscosity) / DEPTH ** 2);
    const total = (this.viscosity * dt) * (1 / (hx * hx) + 1 / (hy * hy));
    const rounds = Math.max(1, Math.min(8, Math.ceil(total / 0.2)));
    const each = Math.min(total / rounds, 0.2) / (1 / (hx * hx) + 1 / (hy * hy));
    for (let k = 0; k < rounds; k++) {
      this._pass('fade', t.b, { U: t.u, keep: Math.exp((-friction * dt) / rounds), r: [each / (hx * hx), each / (hy * hy)] });
      this._pass('copy', t.u, { a: t.b });
    }
    this._pinField();
    this._pass('force', t.b, { U: t.u, pin: t.pin, kin: t.kin, grip: TOOL_GRIP * dt });
    this._pass('copy', t.u, { a: t.b });
    this._pass('minus', t.c, { a: t.u, b: t.a });

    // Projection. "d" is what it changed.
    this._pass('copy', t.a, { a: t.u });
    const solid = this.tileOn ? 0 : 1;
    this._pass('div', t.D, { U: t.u, h: [hx, hy], solid });
    let P = t.P;
    let Q = t.P2;
    for (let k = 0; k < JACOBI; k++) {
      this._pass('jacobi', Q, { P, D: t.D, h: [hx, hy] });
      [P, Q] = [Q, P];
    }
    t.P = P;
    t.P2 = Q;
    // A repeating bath can slide as a whole, which isn't compressing anything, so that's taken out.
    // A bath with sides has nowhere to slide, and what's left of a mean is real flow near a tool.
    const drift = this.tileOn ? this._measure(t.u) : { meanX: 0, meanY: 0 };
    this._pass('project', t.b, { U: t.u, P, h: [hx, hy], drift: [drift.meanX, drift.meanY], solid });
    this._pass('copy', t.u, { a: t.b });
    this._pass('minus', t.d, { a: t.u, b: t.a });

    const due = g.velTicks >= VELOCITY_MAP_TICKS || (g.velTicks % CHECK_EVERY === 0 && this._mapsDisagree(t.F, t.B));
    const add = (change, scale) => {
      this._pass('accumulate', t.b, { into: t.du, change, F: t.F, scale });
      this._pass('copy', t.du, { a: t.b });
    };
    add(t.c, 1);
    add(t.d, due ? 1 : 2);
    if (due) {
      const { gl } = this.gpu;
      this._pass('copy', t.u0, { a: t.u });
      for (const f of [t.du, t.F, t.B]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      g.velTicks = 0;
      add(t.d, 1);
    }

    // Next tick's flow is the midpoint of the last two.
    this._pass('copy', t.uNext, { a: t.u });
    this._pass('mix', t.b, { a: t.before, b: t.u });
    this._pass('copy', t.u, { a: t.b });
    g.haveNext = true;
    const after = this._measure(t.uNext);
    const top = Math.max(after.topX, after.topY);
    if (s.haveKin) { s.kinX.fill(0); s.kinY.fill(0); s.haveKin = false; }

    this.flowAge = (this.flowAge ?? 0) + dt;
    this.lastFlowSpeed = top;
    const coast = this.flowTuning?.coast ?? LONGEST_COAST;
    if (!this.flowing) this.flowAge = 0;
    this.flowing = true;
    if ((top < CALM || this.flowAge > coast) && !this.active.length) this._stopFlow();
  }

  _stopFlow() {
    super._stopFlow();
    if (this._gl) this._gl.cpuFlow = true;
  }

  // ---- Ink -------------------------------------------------------------------------------------

  _renderInk() {
    const state = this._gl;
    const { t } = state;
    const g = this._g;
    const flow = [g.nx, g.ny];
    this._pass('inkRead', t.plain, { B: t.iB, I: t.ink0, flow, detail: g.detail });
    this._pass('inkLost', t.lost, { F: t.iF, I: t.plain, I0: t.ink0, flow, detail: g.detail });
    this._pass('inkFix', t.ink, { B: t.iB, I: t.plain, L: t.lost, flow, detail: g.detail });
    state.inkShown = true;
  }

  // A new checkpoint on the GPU, with nothing copied back.
  _checkpointInkGL() {
    const state = this._gl;
    const { t } = state;
    const g = this._g;
    const { gl } = this.gpu;
    if (!state.inkShown) this._renderInk();
    this._pass('copy', t.ink0, { a: t.ink });
    for (const f of [t.iF, t.iB]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    g.inkTicks = 0;
    state.inkShown = false;
    state.inkFresh = true;
  }

  // The picture, copied back for the CPU to read or edit.
  _refreshInk() {
    if (!this.gpu || !this._gl || this._gl.cpuInk) return super._refreshInk();
    const g = this._g;
    if (!g.inkStale && !this._gl.inkFresh) return undefined;
    this._uploadChanges();
    if (!this._gl.inkShown) this._renderInk();
    this._downloadInk(this._gl.t.ink, g.ink);
    g.inkStale = false;
    this._gl.inkFresh = false;
    return undefined;
  }

  // The CPU has just rewritten the picture: edits are a new checkpoint.
  _checkpointInk() {
    super._checkpointInk();
    if (this._gl) { this._gl.cpuInk = true; this._gl.cpuInkMaps = true; this._gl.inkShown = false; }
  }

  // Growing drops on the GPU: the same push and colour as gridink.js, as one pass over the picture
  // for all drops at once instead of a pass per drop on the CPU. Films are still labelled on the
  // CPU, from a small read-back of where the ink is.
  _flushGrowth() {
    if (!this.gpu || !this.growth.length) {
      const had = this.growth.length;
      super._flushGrowth();
      if (had && this._gl) this._gl.cpuInk = true;
      return;
    }
    const growth = this.growth;
    this.growth = [];
    this.landing = [];
    const state = this._t;
    const { t } = state;
    const g = this._g;
    const { gl } = this.gpu;
    this._uploadChanges();
    this._checkpointInkGL(); // the current picture becomes ink0, with fresh maps
    // Where the ink is, per flow cell.
    this._pass('cover', t.c, { I: t.ink0, detail: g.detail });
    const data = this._read(t.c, state.buffer);
    const inked = new Uint8Array(g.nx * g.ny);
    for (let i = 0; i < inked.length; i++) inked[i] = data[i * 4] >= FILM_ALPHA_GL ? 1 : 0;
    const { labels, seedOf } = this._labelFilms(growth, inked);
    const lab = state.labelData ??= new Float32Array(g.nx * g.ny * 4);
    for (let i = 0; i < labels.length; i++) { lab[i * 4] = labels[i]; lab[i * 4 + 1] = 0; lab[i * 4 + 2] = 0; lab[i * 4 + 3] = 1; }
    this._upload(t.d, null, null, lab);
    // The drops, 256 at a time: (centre in ink cells, area grown, film), colour, (radius, reach).
    const drops = state.drops ??= this._makeTexture(256, 3);
    const packed = state.dropData ??= new Float32Array(256 * 3 * 4);
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    for (let start = 0; start < growth.length; start += 256) {
      const batch = growth.slice(start, start + 256);
      packed.fill(0);
      batch.forEach(([op, da], k) => {
        const [r, gg, b, a] = parseColorGL(op.color);
        const at = (row) => (row * 256 + k) * 4;
        packed.set([(op.x + halfW) / g.ihx - 0.5, (op.y + halfH) / g.ihy - 0.5, da, labels[seedOf.get(op)]], at(0));
        packed.set([r * a, gg * a, b * a, a], at(1));
        packed.set([Math.sqrt(op.grown), Math.min(da / (2 * SMALL_PUSH_GL * Math.min(g.ihx, g.ihy)), Math.min(halfW, halfH)), 0, 0], at(2));
      });
      this._upload(drops, null, null, packed);
      const common = { drops, n: batch.length, h: [g.ihx, g.ihy], tiled: this.tileOn ? 1 : 0 };
      this._pass('dropPush', t.plain, { ...common, I: t.ink0, labels: t.d, flow: [g.nx, g.ny], detail: g.detail });
      this._pass('dropLay', t.ink0, { ...common, I: t.plain });
    }
    void gl;
    state.inkShown = false;
    state.inkFresh = true;
    state.cpuInk = false;
    g.inkStale = true;
  }

  _makeTexture(w, h) {
    const { gl } = this.gpu;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }

  _absorbOutlines() {
    const had = this.polys.length;
    super._absorbOutlines();
    if (had && this._gl) this._gl.cpuInk = true;
  }

  _beforeInk(ctx) {
    if (!this.gpu) return super._beforeInk(ctx);
    const g = this._g;
    const shared2 = this.gpu;
    const state = this._t;
    this._uploadChanges();
    const { canvas } = shared2;
    if (canvas.width !== g.ix || canvas.height !== g.iy) { canvas.width = g.ix; canvas.height = g.iy; }
    if (!state.inkShown) this._renderInk();
    this._pass('show', null, { I: state.t.ink });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, -this.width / 2, -this.height / 2, this.width, this.height);
    return undefined;
  }
}
