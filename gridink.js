// Grid ink: ink as colour on a grid, moved by a full fluid solve, after BiMocq2 (Qu et al. 2019,
// "Efficient and Conservative Fluids Using Bidirectional Mapping"; reference code MIT, ziyinq/Bimocq).
//
// An ordinary grid solver re-reads the ink from the last tick's grid every tick, and each read
// blurs a little. BiMocq2 instead remembers where every cell came from: a backward map from now to
// the last checkpoint and a forward map the other way. Ink is read once from the checkpoint through
// the whole accumulated map, so blur doesn't build up tick by tick. Sending the result back through
// the forward map measures what the round trip lost, and half of that is put back (BFECC). The maps
// themselves drift, so when forward and backward stop agreeing the current picture becomes a new
// checkpoint. Velocity is carried the same way, which is what keeps small vortices alive.
//
// Differences from the reference code:
// - The surface is a torus by default, with velocity at cell centres and an FFT projection. The
//   reference uses a staggered grid with walls and multigrid. With repeating off, the tank has solid
//   sides instead: every read reflects at the edge, and projection runs on the tank joined to its
//   mirror images, which is exactly no flow through the sides.
// - One level of checkpoint (their blend_coeff = 1, which every setup in their 2D code uses). The
//   paper's two levels reduce the slight blur just after a checkpoint, so they're worth trying next.
// - A checkpoint when the maps disagree by a cell. The paper uses that error over the distance
//   flow travels in a tick, q > 1 to 1.5; our ticks are short, so that would checkpoint too often.
// - Forces pin the water to each tine, as Ghassaei describes rakes acting on the flow, instead of
//   their buoyancy. Other tools add their motion to the flow for the tick they run.
// - Drops push only the film they belong to, as in Film: water carries no pressure, so films ignore
//   each other until they touch. BiMocq2 itself says nothing about this.
// - Ink changes (drops, stripes) rewrite the grid and start a new checkpoint, instead of going
//   through the delta buffers, because they change far too much of the picture to be small deltas.
// - Ink is only worked out when something reads it. The flow never depends on it, so ink can be on
//   a finer grid than the flow, read through the flow's maps. That is what keeps its edges sharp.
//
// Runs on the CPU for now, which makes it testable in node and a reference for a GPU version.
import { Marble } from './engine.js';
import { fftPlan } from './dst.js';

const CELL = 2; // mm, for the flow
const INK_DETAIL = 3; // ink cells across each flow cell. The flow is smooth, and ink is only read to be seen.
const DEPTH = 15; // mm of bath. Friction from the tank floor is about viscosity / depth^2, as in Wake.
const LEAST_FRICTION = 0.25; // per second
const CALM = 0.4; // mm/s. Below this the flow is too slow to see, and stops.
const LONGEST_COAST = 25; // seconds
const TOOL_GRIP = 0.6; // per second: how fast stir, vortex, jiggle, wriggle and air set the bath moving
const VELOCITY_MAP_TICKS = 30; // a velocity checkpoint at least this often
const INK_MAP_TICKS = 600; // and an ink one
const MAP_ERROR = 1; // cells: maps that disagree by this much are due a checkpoint
const CHECK_EVERY = 10; // ticks between measuring that
const LEAST_REACH = 1.5; // cells: the narrowest a tine's pin can be
export const FILM_ALPHA = 0.2; // ink thinner than this counts as water when finding films
export const SMALL_PUSH = 0.02; // cells: a drop's push stops being applied below this
const SIDE_FADE = 4; // cells beside a solid side over which a tool's motion fades out
const WEIGHTS = [0.125, 0.125, 0.125, 0.125, 0.5];
const OFFSETS = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25], [0, 0]];

// The nearest length with only small prime factors, which keeps the FFT fast.
const smoothLength = (n) => {
  for (let d = 0; ; d++) {
    for (const m of [n + d, n - d]) {
      let v = m;
      for (const p of [2, 3, 5]) while (v % p === 0) v /= p;
      if (v === 1 && m % 2 === 0) return m;
    }
  }
};

export const parseColor = (css) => {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(css ?? '')?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const v = (i) => parseInt(full.slice(i, i + 2), 16) / 255;
    return [v(0), v(2), v(4), full.length >= 8 ? v(6) : 1];
  }
  if (typeof document !== 'undefined') {
    const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r / 255, g / 255, b / 255, a / 255];
  }
  return [0, 0, 0, 1];
};

export class GridInk extends Marble {
  constructor(options = {}) {
    super(options);
    this.gridCell = options.gridCell ?? CELL;
    this.method = options.method ?? 'bimocq'; // or 'semilag', the plain solver, to compare against
    this.inkDetail = options.inkDetail ?? INK_DETAIL;
    this.tileOn = true;
    this.tileWanted = true;
  }

  get tileSupported() { return true; }
  get tileOffsetSupported() { return false; }
  get evenWalls() { return false; }

  // The sides are solid whenever the tank isn't repeating, so this changes nothing. It's accepted,
  // not refused, so that a script or session written for another simulator still runs here.
  walls() { return this; }

  // Which cell of a row an index means: wraps when repeating, and is -1 off the tank otherwise.
  _edge(i, n) {
    if (this.tileOn) return ((i % n) + n) % n;
    return i < 0 || i >= n ? -1 : i;
  }

  // The nearest cell: as _edge, but off the tank it's the cell at the side.
  _nearest(i, n) {
    if (this.tileOn) return ((i % n) + n) % n;
    return i < 0 ? 0 : i >= n ? n - 1 : i;
  }

  turn() { throw new Error('Grid ink can\'t be turned. Use shift, stir or air instead.'); }
  get freezeSupported() { return false; }
  get eraseSupported() { return false; }
  erase() { throw new Error('Grid ink can\'t erase yet. Try it on another simulator.'); }

  reset() {
    super.reset();
    this.tileOn = true;
    this.tileWanted = true;
    this.grid = null;
    this.flowing = false;
    this.flowAge = 0;
  }

  // The grid's size and state, made when first needed so that scripts can resize the tank first.
  // Everything in this.grid is saved with the tank; this._scratch can be rebuilt at any time.
  get _g() {
    if (this.grid) return this.grid;
    const nx = smoothLength(Math.round(this.width / this.gridCell));
    const ny = smoothLength(Math.round(this.height / this.gridCell));
    const size = nx * ny;
    const field = () => new Float32Array(size);
    const detail = this.inkDetail;
    const ix = nx * detail;
    const iy = ny * detail;
    const inkField = () => new Float32Array(ix * iy);
    this.grid = {
      nx, ny, hx: this.width / nx, hy: this.height / ny, detail, ix, iy, ihx: this.width / ix, ihy: this.height / iy,
      u: field(), v: field(), uNext: field(), vNext: field(), haveNext: false,
      u0: field(), v0: field(), du: field(), dv: field(),
      fx: field(), fy: field(), bx: field(), by: field(), velTicks: 0,
      ifx: field(), ify: field(), ibx: field(), iby: field(), inkTicks: 0,
      ink0: [inkField(), inkField(), inkField(), inkField()], ink: [inkField(), inkField(), inkField(), inkField()], inkStale: false,
    };
    return this.grid;
  }

  get _s() {
    const g = this._g;
    if (this._scratch?.size === g.nx * g.ny) return this._scratch;
    const size = g.nx * g.ny;
    const field = () => new Float32Array(size);
    const samples = () => new Float32Array(size * 5);
    const inkSize = g.ix * g.iy;
    const inkField = () => new Float32Array(inkSize);
    this._scratch = {
      size, nx: g.nx, ny: g.ny,
      a: field(), b: field(), c: field(), d: field(), e: field(), f: field(), g: field(), h: field(), i: field(), j: field(),
      px: samples(), py: samples(), qx: samples(), qy: samples(),
      kinX: field(), kinY: field(), advX: field(), advY: field(),
      pushX: inkField(), pushY: inkField(), touched: new Uint8Array(inkSize), cover: inkField(),
      ipx: inkField(), ipy: inkField(), iqx: inkField(), iqy: inkField(), ia: inkField(), ib: inkField(), ic: inkField(), id: inkField(),
      re: new Float64Array(size), im: new Float64Array(size),
      planX: fftPlan(g.nx), planY: fftPlan(g.ny), kx: Float64Array.from({ length: g.nx }, (_, k) => (2 * Math.PI * (k < g.nx / 2 ? k : k - g.nx)) / this.width),
      ky: Float64Array.from({ length: g.ny }, (_, l) => (2 * Math.PI * (l < g.ny / 2 ? l : l - g.ny)) / this.height),
      lineRe: [new Float64Array(Math.max(g.nx, g.ny)), new Float64Array(Math.max(g.nx, g.ny))],
      lineIm: [new Float64Array(Math.max(g.nx, g.ny)), new Float64Array(Math.max(g.nx, g.ny))],
      pins: [], haveKin: false,
    };
    return this._scratch;
  }

  get busy() { return super.busy || this.flowing === true; }

  _releaseGates() { if (!this.flowing) super._releaseGates(); }

  // ---- Sampling --------------------------------------------------------------------------------

  // Bilinear, wrapping at the seams or reflecting at solid sides. Positions are in cells, with cell
  // centres on the integers, so a side is half a cell past the last centre.
  _sampler(nx = this._g.nx, ny = this._g.ny) {
    if (!this.tileOn) {
      const reflect = (p, n) => {
        let q = (p + 0.5) % (2 * n);
        if (q < 0) q += 2 * n;
        return (q > n ? 2 * n - q : q) - 0.5;
      };
      return (a, px, py) => {
        const x = reflect(px, nx);
        const y = reflect(py, ny);
        const i = Math.floor(x);
        const j = Math.floor(y);
        const s = x - i;
        const t = y - j;
        const i0 = i < 0 ? 0 : i;
        const i1 = i + 1 >= nx ? nx - 1 : i + 1;
        const r0 = (j < 0 ? 0 : j) * nx;
        const r1 = (j + 1 >= ny ? ny - 1 : j + 1) * nx;
        return (a[r0 + i0] * (1 - s) + a[r0 + i1] * s) * (1 - t) + (a[r1 + i0] * (1 - s) + a[r1 + i1] * s) * t;
      };
    }
    return (a, x, y) => {
      let i = Math.floor(x);
      let j = Math.floor(y);
      const s = x - i;
      const t = y - j;
      i %= nx; if (i < 0) i += nx;
      j %= ny; if (j < 0) j += ny;
      const i1 = i + 1 === nx ? 0 : i + 1;
      const r0 = j * nx;
      const r1 = (j + 1 === ny ? 0 : j + 1) * nx;
      return (a[r0 + i] * (1 - s) + a[r0 + i1] * s) * (1 - t) + (a[r1 + i] * (1 - s) + a[r1 + i1] * s) * t;
    };
  }

  // Where a map sends the five samples of every cell.
  _positions(mapX, mapY, px, py) {
    const { nx, ny } = this._g;
    const at = this._sampler();
    let w = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        for (let k = 0; k < 5; k++) {
          const x = i + OFFSETS[k][0];
          const y = j + OFFSETS[k][1];
          px[w] = x + at(mapX, x, y);
          py[w] = y + at(mapY, x, y);
          w++;
        }
      }
    }
  }

  _resample(src, px, py, dst) {
    const at = this._sampler();
    for (let c = 0, w = 0; c < dst.length; c++, w += 5) {
      dst[c] = WEIGHTS[0] * at(src, px[w], py[w]) + WEIGHTS[1] * at(src, px[w + 1], py[w + 1]) + WEIGHTS[2] * at(src, px[w + 2], py[w + 2])
        + WEIGHTS[3] * at(src, px[w + 3], py[w + 3]) + WEIGHTS[4] * at(src, px[w + 4], py[w + 4]);
    }
  }

  // Keeps a corrected field within the range of each cell's neighbours, so correcting adds no halos.
  _limit(before, after, nx = this._g.nx, ny = this._g.ny) {
    const lastX = this.tileOn ? nx - 1 : 0;
    const lastY = this.tileOn ? ny - 1 : 0;
    for (let j = 0; j < ny; j++) {
      const down = (j === 0 ? lastY : j - 1) * nx;
      const row = j * nx;
      const up = (j === ny - 1 ? (this.tileOn ? 0 : j) : j + 1) * nx;
      for (let i = 0; i < nx; i++) {
        const l = i === 0 ? lastX : i - 1;
        const r = i === nx - 1 ? (this.tileOn ? 0 : i) : i + 1;
        let lo = Infinity;
        let hi = -Infinity;
        for (const base of [down, row, up]) {
          for (const c of [l, i, r]) {
            const v = before[base + c];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
        const k = row + i;
        const v = after[k];
        after[k] = v < lo ? lo : v > hi ? hi : v;
      }
    }
  }

  // ---- Maps ------------------------------------------------------------------------------------

  // Carries a forward and backward map along the flow. Maps hold displacements in cells.
  _advanceMaps(fx, fy, bx, by, dt) {
    const { nx, ny } = this._g;
    const s = this._s;
    const { advX, advY, a: tx, b: ty } = s;
    const at = this._sampler();
    let top = 0;
    for (let i = 0; i < advX.length; i++) top = Math.max(top, Math.abs(advX[i]), Math.abs(advY[i]));
    const steps = Math.max(1, Math.ceil(top * dt));
    const h = dt / steps;
    for (let step = 0; step < steps; step++) {
      for (let j = 0, c = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++, c++) {
          // Forward, third-order Runge-Kutta, as in the reference code.
          const x = i + fx[c];
          const y = j + fy[c];
          const u1 = at(advX, x, y);
          const v1 = at(advY, x, y);
          const u2 = at(advX, x + 0.5 * h * u1, y + 0.5 * h * v1);
          const v2 = at(advY, x + 0.5 * h * u1, y + 0.5 * h * v1);
          const u3 = at(advX, x + 0.75 * h * u2, y + 0.75 * h * v2);
          const v3 = at(advY, x + 0.75 * h * u2, y + 0.75 * h * v2);
          fx[c] += h * ((2 / 9) * u1 + (3 / 9) * u2 + (4 / 9) * u3);
          fy[c] += h * ((2 / 9) * v1 + (3 / 9) * v2 + (4 / 9) * v3);
          // Backward, dual mesh characteristics: the speed's local slope gives an exact trace back.
          const ux = advX[c];
          const uy = advY[c];
          const ox = ux > 0 ? -1 : 1;
          const oy = uy > 0 ? -1 : 1;
          const ax = (at(advX, i + ox, j + oy) - ux) / ox;
          const ay = (at(advY, i + ox, j + oy) - uy) / oy;
          const backX = Math.abs(ax) > 1e-4 ? ((1 - Math.exp(-ax * h)) * ux) / ax : h * ux;
          const backY = Math.abs(ay) > 1e-4 ? ((1 - Math.exp(-ay * h)) * uy) / ay : h * uy;
          tx[c] = at(bx, i - backX, j - backY) - backX;
          ty[c] = at(by, i - backX, j - backY) - backY;
        }
      }
      bx.set(tx);
      by.set(ty);
    }
  }

  // How badly the two maps disagree, in cells. Every fourth cell is plenty to see it.
  _mapError(fx, fy, bx, by) {
    const { nx, ny } = this._g;
    const at = this._sampler();
    let worst = 0;
    for (let j = 0; j < ny; j += 4) {
      for (let i = 0; i < nx; i += 4) {
        const c = j * nx + i;
        const x = i + fx[c];
        const y = j + fy[c];
        worst = Math.max(worst, Math.hypot(fx[c] + at(bx, x, y), fy[c] + at(by, x, y)));
        const x2 = i + bx[c];
        const y2 = j + by[c];
        worst = Math.max(worst, Math.hypot(bx[c] + at(fx, x2, y2), by[c] + at(fy, x2, y2)));
      }
    }
    return worst;
  }

  // ---- Velocity --------------------------------------------------------------------------------

  // Rows then columns of a 2D FFT of (re, im), in place. Inverse has no 1/n.
  _fft(re, im, inverse, plans = this._s) {
    const { nx, ny, planX, planY, lineRe: [aRe, bRe], lineIm: [aIm, bIm] } = plans;
    const sign = inverse ? -1 : 1;
    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      for (let i = 0; i < nx; i++) { aRe[i] = re[row + i]; aIm[i] = sign * im[row + i]; }
      const first = planX.run(aRe, aIm, bRe, bIm) === 0;
      const oRe = first ? aRe : bRe;
      const oIm = first ? aIm : bIm;
      for (let i = 0; i < nx; i++) { re[row + i] = oRe[i]; im[row + i] = sign * oIm[i]; }
    }
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) { aRe[j] = re[j * nx + i]; aIm[j] = sign * im[j * nx + i]; }
      const first = planY.run(aRe, aIm, bRe, bIm) === 0;
      const oRe = first ? aRe : bRe;
      const oIm = first ? aIm : bIm;
      for (let j = 0; j < ny; j++) { re[j * nx + i] = oRe[j]; im[j * nx + i] = sign * oIm[j]; }
    }
  }

  // Removes the part of the flow that would compress the surface, and any drift of the whole bath.
  // u and v go in together as one complex field, which saves a transform.
  _project(u, v) {
    if (this.tileOn) this._projectOn(u, v, this._s);
    else this._projectWalled(u, v);
  }

  // Solid sides: the tank joined to its mirror images is a torus twice the size, in which u is
  // reversed across a side in x and v across a side in y, so nothing crosses any side.
  _projectWalled(u, v) {
    const { nx, ny } = this._g;
    const s = this._s;
    const wide = s.wide ??= (() => {
      const w = 2 * nx;
      const h = 2 * ny;
      const line = () => new Float64Array(Math.max(w, h));
      return {
        nx: w, ny: h, re: new Float64Array(w * h), im: new Float64Array(w * h), u: new Float64Array(w * h), v: new Float64Array(w * h),
        planX: fftPlan(w), planY: fftPlan(h), lineRe: [line(), line()], lineIm: [line(), line()],
        kx: Float64Array.from({ length: w }, (_, k) => (2 * Math.PI * (k < w / 2 ? k : k - w)) / (2 * this.width)),
        ky: Float64Array.from({ length: h }, (_, l) => (2 * Math.PI * (l < h / 2 ? l : l - h)) / (2 * this.height)),
      };
    })();
    const w = 2 * nx;
    const h = 2 * ny;
    for (let j = 0; j < h; j++) {
      const flipY = j >= ny;
      const row = (flipY ? h - 1 - j : j) * nx;
      for (let i = 0; i < w; i++) {
        const flipX = i >= nx;
        const c = row + (flipX ? w - 1 - i : i);
        wide.u[j * w + i] = flipX ? -u[c] : u[c];
        wide.v[j * w + i] = flipY ? -v[c] : v[c];
      }
    }
    this._projectOn(wide.u, wide.v, wide);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        u[j * nx + i] = wide.u[j * w + i];
        v[j * nx + i] = wide.v[j * w + i];
      }
    }
  }

  _projectOn(u, v, plans) {
    const { nx, ny, re, im, kx, ky } = plans;
    const size = nx * ny;
    for (let i = 0; i < size; i++) { re[i] = u[i]; im[i] = v[i]; }
    this._fft(re, im, false, plans);
    const norm = 1 / size;
    for (let l = 0; l < ny; l++) {
      const lm = l === 0 ? 0 : ny - l;
      for (let k = 0; k < nx; k++) {
        const km = k === 0 ? 0 : nx - k;
        const a = l * nx + k;
        const b = lm * nx + km;
        if (b < a) continue;
        const k2 = kx[k] * kx[k] + ky[l] * ky[l];
        // A wave at the grid's limit reads as itself reversed, so it can't be projected. It goes.
        if (k2 === 0 || (nx % 2 === 0 && k === nx / 2) || (ny % 2 === 0 && l === ny / 2)) {
          re[a] = im[a] = re[b] = im[b] = 0;
          continue;
        }
        // Split Z into the spectra of u and v, using Z(-k) = conj(U) + i conj(V).
        const uRe = (re[a] + re[b]) / 2;
        const uIm = (im[a] - im[b]) / 2;
        const vRe = (im[a] + im[b]) / 2;
        const vIm = (re[b] - re[a]) / 2;
        const dRe = (kx[k] * uRe + ky[l] * vRe) / k2;
        const dIm = (kx[k] * uIm + ky[l] * vIm) / k2;
        const pRe = uRe - kx[k] * dRe;
        const pIm = uIm - kx[k] * dIm;
        const qRe = vRe - ky[l] * dRe;
        const qIm = vIm - ky[l] * dIm;
        re[a] = (pRe - qIm) * norm;
        im[a] = (pIm + qRe) * norm;
        re[b] = (pRe + qIm) * norm;
        im[b] = (qRe - pIm) * norm;
      }
    }
    this._fft(re, im, true, plans);
    for (let i = 0; i < size; i++) { u[i] = re[i]; v[i] = im[i]; }
  }

  // Viscosity by small explicit steps, at most eight a tick. Past that the bath is so thick that
  // friction has stopped the flow anyway.
  _diffuse(f, dt) {
    const { nx, ny, hx, hy } = this._g;
    const t = this._s.c;
    const r = (this.viscosity * dt) * (1 / (hx * hx) + 1 / (hy * hy));
    const steps = Math.min(8, Math.ceil(r / 0.2));
    const rx = (Math.min(r / steps, 0.2) * (1 / (hx * hx))) / (1 / (hx * hx) + 1 / (hy * hy));
    const ry = (Math.min(r / steps, 0.2) * (1 / (hy * hy))) / (1 / (hx * hx) + 1 / (hy * hy));
    for (let s = 0; s < steps; s++) {
      for (let j = 0; j < ny; j++) {
        const row = j * nx;
        const down = (j === 0 ? (this.tileOn ? ny - 1 : 0) : j - 1) * nx;
        const up = (j === ny - 1 ? (this.tileOn ? 0 : j) : j + 1) * nx;
        for (let i = 0; i < nx; i++) {
          const l = i === 0 ? (this.tileOn ? nx - 1 : 0) : i - 1;
          const e = i === nx - 1 ? (this.tileOn ? 0 : i) : i + 1;
          const v = f[row + i];
          t[row + i] = v + rx * (f[row + l] + f[row + e] - 2 * v) + ry * (f[down + i] + f[up + i] - 2 * v);
        }
      }
      f.set(t);
    }
  }

  // A tine holds the water around it to its own speed.
  _applyPins(u, v) {
    const { nx, ny, hx, hy } = this._g;
    const s = this._s;
    for (const { x, y, ux, uy, sigma } of s.pins) {
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
          const c = row + ii;
          u[c] += w * (ux - u[c]);
          v[c] += w * (uy - v[c]);
        }
      }
    }
    s.pins = [];
  }

  _stepFlow(dt) {
    const g = this._g;
    const s = this._s;
    const { nx, ny, hx, hy, u, v } = g;
    const size = nx * ny;
    const kept = this.flowing || s.pins.length || s.haveKin;
    if (!kept) return;
    if (g.haveNext) { u.set(g.uNext); v.set(g.vNext); }

    // The flow for this tick, in cells per second, including what tools are doing to the ink directly.
    for (let i = 0; i < size; i++) {
      s.advX[i] = (u[i] + s.kinX[i]) / hx;
      s.advY[i] = (v[i] + s.kinY[i]) / hy;
    }
    this._advanceMaps(g.ifx, g.ify, g.ibx, g.iby, dt);
    g.inkTicks++;
    g.inkStale = true;
    if (this.method === 'semilag') this._checkpointInk();
    else if (g.inkTicks >= INK_MAP_TICKS || (g.inkTicks % CHECK_EVERY === 0 && this._mapError(g.ifx, g.ify, g.ibx, g.iby) > MAP_ERROR)) this._checkpointInk();

    this._advanceMaps(g.fx, g.fy, g.bx, g.by, dt);
    g.velTicks++;

    const before = s.d; const beforeV = s.e;
    before.set(u); beforeV.set(v);
    this._carryVelocity(g, s);

    // Forces, and what they change.
    const { a: saveU, b: saveV } = s; // _carryVelocity is done with these
    saveU.set(u); saveV.set(v);
    const friction = Math.max(this.flowTuning?.friction ?? LEAST_FRICTION, (2.5 * this.viscosity) / DEPTH ** 2);
    const fade = Math.exp(-friction * dt);
    for (let i = 0; i < size; i++) { u[i] *= fade; v[i] *= fade; }
    if (this.viscosity > 0) { this._diffuse(u, dt); this._diffuse(v, dt); }
    this._applyPins(u, v);
    for (let i = 0; i < size; i++) { u[i] += TOOL_GRIP * s.kinX[i] * dt; v[i] += TOOL_GRIP * s.kinY[i] * dt; }
    const extU = s.f; const extV = s.g;
    for (let i = 0; i < size; i++) { extU[i] = u[i] - saveU[i]; extV[i] = v[i] - saveV[i]; }

    saveU.set(u); saveV.set(v);
    this._project(u, v);
    const projU = s.h; const projV = s.i;
    for (let i = 0; i < size; i++) { projU[i] = u[i] - saveU[i]; projV[i] = v[i] - saveV[i]; }

    const due = this.method === 'semilag' || g.velTicks >= VELOCITY_MAP_TICKS
      || (g.velTicks % CHECK_EVERY === 0 && this._mapError(g.fx, g.fy, g.bx, g.by) > MAP_ERROR);
    this._accumulate(extU, extV, 1);
    this._accumulate(projU, projV, due ? 1 : 2);
    if (due) {
      g.u0.set(u); g.v0.set(v);
      g.du.fill(0); g.dv.fill(0);
      g.fx.fill(0); g.fy.fill(0); g.bx.fill(0); g.by.fill(0);
      g.velTicks = 0;
      this._accumulate(projU, projV, 1);
    }

    // Next tick's flow is the midpoint of the last two, as in the reference code.
    g.uNext.set(u); g.vNext.set(v); g.haveNext = true;
    let top = 0;
    for (let i = 0; i < size; i++) {
      top = Math.max(top, Math.abs(u[i]), Math.abs(v[i]));
      u[i] = 0.5 * (before[i] + u[i]);
      v[i] = 0.5 * (beforeV[i] + v[i]);
    }
    if (s.haveKin) { s.kinX.fill(0); s.kinY.fill(0); s.haveKin = false; }

    this.flowAge = (this.flowAge ?? 0) + dt;
    this.lastFlowSpeed = top;
    const coast = this.flowTuning?.coast ?? LONGEST_COAST;
    if (!this.flowing) this.flowAge = 0;
    this.flowing = true;
    if ((top < CALM || this.flowAge > coast) && !this.active.length) this._stopFlow();
  }

  _stopFlow() {
    const g = this._g;
    for (const f of [g.u, g.v, g.uNext, g.vNext, g.u0, g.v0, g.du, g.dv, g.fx, g.fy, g.bx, g.by]) f.fill(0);
    g.haveNext = false;
    g.velTicks = 0;
    this.flowing = false;
    this.flowAge = 0;
  }

  // Velocity read from the checkpoint through the backward map, then the round trip's loss put back.
  _carryVelocity(g, s) {
    const { u, v, u0, v0, du, dv, fx, fy, bx, by } = g;
    const { a: sumU, b: sumV, px, py, qx, qy, c: lost, j: plain } = s;
    this._positions(bx, by, px, py);
    this._positions(fx, fy, qx, qy);
    for (const [out, start, extra] of [[u, u0, du], [v, v0, dv]]) {
      for (let i = 0; i < out.length; i++) sumU[i] = start[i] + extra[i];
      this._resample(sumU, px, py, out);
      if (this.method === 'semilag') continue;
      plain.set(out);
      this._resample(out, qx, qy, sumV);
      for (let i = 0; i < out.length; i++) lost[i] = 0.5 * (sumV[i] - extra[i] - start[i]);
      this._resample(lost, px, py, sumV);
      for (let i = 0; i < out.length; i++) out[i] -= sumV[i];
      this._limit(plain, out);
    }
  }

  // A change now, expressed at the checkpoint by the forward map.
  _accumulate(changeU, changeV, scale) {
    const g = this._g;
    const s = this._s;
    const { qx, qy, b: moved } = s;
    if (scale === 0) return;
    this._positions(g.fx, g.fy, qx, qy);
    for (const [change, into] of [[changeU, g.du], [changeV, g.dv]]) {
      this._resample(change, qx, qy, moved);
      for (let i = 0; i < moved.length; i++) into[i] += scale * moved[i];
    }
  }

  // ---- Ink -------------------------------------------------------------------------------------

  // Where a flow map sends each ink cell, in ink cells.
  _inkPositions(mapX, mapY, px, py) {
    const { ix, iy, detail } = this._g;
    const at = this._sampler();
    for (let j = 0, c = 0; j < iy; j++) {
      const y = (j + 0.5) / detail - 0.5;
      for (let i = 0; i < ix; i++, c++) {
        const x = (i + 0.5) / detail - 0.5;
        px[c] = i + at(mapX, x, y) * detail;
        py[c] = j + at(mapY, x, y) * detail;
      }
    }
  }

  // The picture now: read from the checkpoint through the backward map, then corrected.
  _refreshInk() {
    const g = this._g;
    if (!g.inkStale) return;
    const s = this._s;
    const { ipx: px, ipy: py, iqx: qx, iqy: qy, ia: back, ib: lost, id: plain } = s;
    const at = this._sampler(g.ix, g.iy);
    this._inkPositions(g.ibx, g.iby, px, py);
    const correct = this.method !== 'semilag';
    if (correct) this._inkPositions(g.ifx, g.ify, qx, qy);
    const size = g.ix * g.iy;
    for (let ch = 0; ch < 4; ch++) {
      const out = g.ink[ch];
      const start = g.ink0[ch];
      for (let c = 0; c < size; c++) out[c] = at(start, px[c], py[c]);
      if (!correct) continue;
      plain.set(out);
      for (let c = 0; c < size; c++) back[c] = at(out, qx[c], qy[c]);
      for (let c = 0; c < size; c++) lost[c] = 0.5 * (back[c] - start[c]);
      for (let c = 0; c < size; c++) out[c] -= at(lost, px[c], py[c]);
      this._limit(plain, out, g.ix, g.iy);
    }
    g.inkStale = false;
  }

  _checkpointInk() {
    const g = this._g;
    this._refreshInk();
    for (let ch = 0; ch < 4; ch++) g.ink0[ch].set(g.ink[ch]);
    g.ifx.fill(0); g.ify.fill(0); g.ibx.fill(0); g.iby.fill(0);
    g.inkTicks = 0;
  }

  // Catmull-Rom, kept within the four nearest cells, for one-off moves of the picture.
  _sharpSample(a, x, y) {
    const { ix: nx, iy: ny } = this._g;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const s = x - ix;
    const t = y - iy;
    const weights = (u) => [
      0.5 * (-u * u * u + 2 * u * u - u), 0.5 * (3 * u * u * u - 5 * u * u + 2),
      0.5 * (-3 * u * u * u + 4 * u * u + u), 0.5 * (u * u * u - u * u),
    ];
    const wx = weights(s);
    const wy = weights(t);
    let sum = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let b = 0; b < 4; b++) {
      const row = this._nearest(iy + b - 1, ny) * nx;
      for (let c = 0; c < 4; c++) {
        const v = a[row + this._nearest(ix + c - 1, nx)];
        sum += wx[c] * wy[b] * v;
        if ((b === 1 || b === 2) && (c === 1 || c === 2)) { if (v < lo) lo = v; if (v > hi) hi = v; }
      }
    }
    return sum < lo ? lo : sum > hi ? hi : sum;
  }

  // Lays a colour over the picture, weighted by a coverage field.
  _layOver(color, each) {
    const { ink } = this._g;
    const [r, g, b, a] = parseColor(color);
    const rgba = [r * a, g * a, b * a, a];
    each((c, cover) => {
      const w = cover * a;
      for (let ch = 0; ch < 4; ch++) ink[ch][c] = ink[ch][c] * (1 - w) + rgba[ch] * cover;
    });
  }

  // Filled outlines become ink on the grid, four scanlines to a row and exact across each.
  _absorbOutlines() {
    if (!this.polys.length) return;
    const g = this._g;
    const { ix: nx, iy: ny, ihx: hx, ihy: hy } = g;
    this._checkpointInk();
    const { cover } = this._s;
    const mod = (v, n) => ((v % n) + n) % n;
    const SUB = 4;
    for (let p = 0; p < this.polys.length; p++) {
      const first = this.polys[p];
      const loops = [first];
      while (first.group && this.polys[p + 1]?.group === first.group) loops.push(this.polys[++p]);
      cover.fill(0);
      const touched = new Set();
      for (const [sx, sy] of this.tileShifts(loops)) {
        const lines = new Map();
        for (const { xy, n } of loops) {
          for (let i = 0, k = n - 1; i < n; k = i++) {
            const ay = ((xy[k * 2 + 1] + sy + this.height / 2) / hy) * SUB - 0.5;
            const by = ((xy[i * 2 + 1] + sy + this.height / 2) / hy) * SUB - 0.5;
            const ax = (xy[k * 2] + sx + this.width / 2) / hx;
            const bx = (xy[i * 2] + sx + this.width / 2) / hx;
            const from = Math.max(0, Math.ceil(Math.min(ay, by)));
            const to = Math.min(ny * SUB - 1, Math.ceil(Math.max(ay, by)) - 1);
            for (let r = from; r <= to; r++) {
              let list = lines.get(r);
              if (!list) lines.set(r, list = []);
              list.push(ax + ((bx - ax) * (r - ay)) / (by - ay));
            }
          }
        }
        for (const [r, list] of lines) {
          list.sort((a, b) => a - b);
          const row = Math.floor(r / SUB) * nx;
          for (let q = 0; q + 1 < list.length; q += 2) {
            const a = Math.max(0, list[q]);
            const b = Math.min(nx, list[q + 1]);
            for (let i = Math.floor(a); i < b && i < nx; i++) {
              const c = row + mod(i, nx);
              if (!cover[c]) touched.add(c);
              cover[c] = Math.min(1, cover[c] + (Math.min(i + 1, b) - Math.max(i, a)) / SUB);
            }
          }
        }
      }
      this._layOver(first.color, (put) => { for (const c of touched) put(c, cover[c]); });
    }
    this.polys = [];
    for (let ch = 0; ch < 4; ch++) g.ink0[ch].set(g.ink[ch]);
  }

  _advanceDrop(op, dt) {
    op.elapsed += dt;
    const frac = op.dispersion === Infinity || op.elapsed >= op.growTime ? 1 : 1 - Math.exp(-op.dispersion * op.elapsed);
    const target = op.maxArea * frac;
    const da = target - op.grown;
    // Each change of the picture blurs it a little, so small growth waits until it can be seen.
    if (op.landed && frac < 1 && da < Math.sqrt(op.grown)) return false;
    op.grown = target;
    op.landed = true;
    if (da > 0) this.growth.push([op, da]);
    return frac >= 1;
  }

  // Which film each flow cell belongs to: ink, plus the growing drops, joined where cells touch.
  // Films a cell apart have touched. Label 0 is bare water.
  _labelFilms(growth, known = null) {
    const { nx, ny, ix, detail, hx, hy, ink } = this._g;
    // Where the ink is, per flow cell, unless the caller (the GPU path) already knows.
    const inked = known ?? new Uint8Array(nx * ny);
    if (!known) {
      const alpha = ink[3];
      for (let c = 0; c < alpha.length; c++) {
        if (alpha[c] < FILM_ALPHA) continue;
        const fine = c % ix;
        inked[Math.floor((c - fine) / ix / detail) * nx + Math.floor(fine / detail)] = 1;
      }
    }
    const seedOf = new Map();
    for (const [op] of growth) {
      const R = Math.sqrt(op.grown);
      const cx = (op.x + this.width / 2) / hx - 0.5;
      const cy = (op.y + this.height / 2) / hy - 0.5;
      seedOf.set(op, this._nearest(Math.round(cy), ny) * nx + this._nearest(Math.round(cx), nx));
      for (let j = Math.floor(cy - R / hy) - 1; j <= cy + R / hy + 1; j++) {
        const jj = this._edge(j, ny);
        if (jj < 0) continue;
        for (let i = Math.floor(cx - R / hx) - 1; i <= cx + R / hx + 1; i++) {
          const ii = this._edge(i, nx);
          if (ii >= 0 && Math.hypot((i - cx) * hx, (j - cy) * hy) <= R + hx) inked[jj * nx + ii] = 1;
        }
      }
    }
    const labels = new Int32Array(nx * ny);
    let next = 0;
    const stack = [];
    for (let start = 0; start < nx * ny; start++) {
      if (!inked[start] || labels[start]) continue;
      labels[start] = ++next;
      stack.push(start);
      while (stack.length) {
        const c = stack.pop();
        const i = c % nx;
        const j = (c - i) / nx;
        // Films only join across a side when the tank repeats.
        const e = this._edge(i + 1, nx);
        const w = this._edge(i - 1, nx);
        const up = this._edge(j + 1, ny);
        const down = this._edge(j - 1, ny);
        for (const n of [e < 0 ? -1 : j * nx + e, w < 0 ? -1 : j * nx + w, up < 0 ? -1 : up * nx + i, down < 0 ? -1 : down * nx + i]) {
          if (n >= 0 && inked[n] && !labels[n]) { labels[n] = next; stack.push(n); }
        }
      }
    }
    // Each film's extent in flow cells, so a drop only visits its own film. A film that touches
    // both sides of a repeating tank may wrap, so it counts as spanning the whole way across.
    const boxes = new Map();
    for (let c = 0; c < nx * ny; c++) {
      const l = labels[c];
      if (!l) continue;
      const i = c % nx;
      const j = (c - i) / nx;
      const b = boxes.get(l);
      if (!b) boxes.set(l, { i0: i, i1: i, j0: j, j1: j });
      else {
        if (i < b.i0) b.i0 = i;
        if (i > b.i1) b.i1 = i;
        if (j < b.j0) b.j0 = j;
        if (j > b.j1) b.j1 = j;
      }
    }
    if (this.tileOn) {
      for (const b of boxes.values()) {
        if (b.i0 === 0 && b.i1 === nx - 1) { b.i0 = -Infinity; b.i1 = Infinity; }
        if (b.j0 === 0 && b.j1 === ny - 1) { b.j0 = -Infinity; b.j1 = Infinity; }
      }
    }
    return { labels, seedOf, boxes };
  }

  // The stretches of [lo, hi] (cells, unwrapped) that land in [b0, b1] (cells of an n-cell side),
  // counting every repeat of the tile when it wraps.
  _spans(lo, hi, b0, b1, n) {
    if (b0 === -Infinity) return [[lo, hi]];
    if (!this.tileOn) return [[Math.max(lo, b0), Math.min(hi, b1)]].filter(([a, b]) => a <= b);
    const out = [];
    for (let k = Math.floor((lo - b1) / n); k <= Math.ceil((hi - b0) / n); k++) {
      const a = Math.max(lo, b0 + k * n);
      const b = Math.min(hi, b1 + k * n);
      if (a <= b) out.push([a, b]);
    }
    return out;
  }

  // Growing drops push their own film aside by Jaffer's formula, read backwards, then lay their
  // ink over the middle, so a drop's edge stays as sharp as the grid allows. Water carries no
  // pressure, so a film nothing has touched stays exactly where it is.
  _flushGrowth() {
    const growth = this.growth;
    this.growth = [];
    this.landing = [];
    if (!growth.length) return;
    const g = this._g;
    const { ix: nx, iy: ny, ihx: hx, ihy: hy, ink, ink0, nx: flowX, ny: flowY, detail } = g;
    const s = this._s;
    const { pushX, pushY, touched } = s;
    this._checkpointInk();
    const { labels, seedOf, boxes } = this._labelFilms(growth);
    const labelAt = (x, y) => labels[this._nearest(Math.floor(Math.round(y) / detail), flowY) * flowX + this._nearest(Math.floor(Math.round(x) / detail), flowX)];
    // A pixel reads from the four around its source, so it takes this film's ink if any of them can
    // hold some. Going by the nearest alone, a push of under half a pixel can't carry an edge over
    // into the next flow cell, and edges stick to the grid while the ink behind them is overrun.
    const reads = (x, y, film) => {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      return labelAt(x0, y0) === film || labelAt(x0 + 1, y0) === film || labelAt(x0, y0 + 1) === film || labelAt(x0 + 1, y0 + 1) === film;
    };
    const cells = [];
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    for (const [op, da] of growth) {
      const film = labels[seedOf.get(op)];
      const reach = Math.min(da / (2 * SMALL_PUSH * Math.min(hx, hy)), Math.min(halfW, halfH));
      const cx = (op.x + halfW) / hx - 0.5;
      const cy = (op.y + halfH) / hy - 0.5;
      // Ink only comes from this film, and is pushed at most sqrt(da) outward, so cells beyond the
      // film's extent by more than that can't change. Skipping them gives exactly the same result.
      const box = boxes.get(film);
      if (!box) continue;
      const pad = Math.sqrt(da) / Math.min(hx, hy) + detail + 2;
      const rowSpans = this._spans(Math.floor(cy - reach / hy), Math.floor(cy + reach / hy), box.j0 * detail - pad, (box.j1 + 1) * detail + pad, ny);
      const colSpans = this._spans(Math.floor(cx - reach / hx), Math.floor(cx + reach / hx), box.i0 * detail - pad, (box.i1 + 1) * detail + pad, nx);
      for (const [ja, jb] of rowSpans) for (let j = Math.ceil(ja); j <= jb; j++) {
        const dy = (j - cy) * hy;
        const jj = this._edge(j, ny);
        if (jj < 0) continue;
        const row = jj * nx;
        for (const [ia, ib] of colSpans) for (let i = Math.ceil(ia); i <= ib; i++) {
          const ii = this._edge(i, nx);
          if (ii < 0) continue;
          const dx = (i - cx) * hx;
          const d2 = dx * dx + dy * dy;
          if (d2 > reach * reach || d2 < 1e-9) continue;
          const c = row + ii;
          const shrink = d2 > da ? 1 - Math.sqrt(1 - da / d2) : 1;
          const backX = (dx * shrink) / hx;
          const backY = (dy * shrink) / hy;
          // Only this film's ink moves, and only into water or more of this film.
          if (!reads(i - backX, j - backY, film)) continue;
          const here = labelAt(i, j);
          if (here && here !== film) continue;
          if (!touched[c]) { touched[c] = 1; cells.push(c); }
          pushX[c] -= backX;
          pushY[c] -= backY;
        }
      }
    }
    for (const c of cells) {
      const x = (c % nx) + pushX[c];
      const y = Math.floor(c / nx) + pushY[c];
      for (let ch = 0; ch < 4; ch++) ink[ch][c] = this._sharpSample(ink0[ch], x, y);
    }
    for (const c of cells) { touched[c] = 0; pushX[c] = 0; pushY[c] = 0; }
    for (const [op] of growth) {
      const R = Math.sqrt(op.grown);
      const cx = (op.x + halfW) / hx - 0.5;
      const cy = (op.y + halfH) / hy - 0.5;
      const edge = (R + hx) / hx;
      this._layOver(op.color, (put) => {
        for (let j = Math.floor(cy - edge * hx / hy); j <= cy + edge * hx / hy; j++) {
          const jj = this._edge(j, ny);
          if (jj < 0) continue;
          const row = jj * nx;
          for (let i = Math.floor(cx - edge); i <= cx + edge; i++) {
            const ii = this._edge(i, nx);
            if (ii < 0) continue;
            const d = Math.hypot((i - cx) * hx, (j - cy) * hy);
            const cover = Math.max(0, Math.min(1, (R - d) / hx + 0.5));
            if (cover > 0) put(row + ii, cover);
          }
        }
      });
    }
    for (let ch = 0; ch < 4; ch++) ink0[ch].set(ink[ch]);
  }

  // Ink here is on the grid, not in outlines, so that's where to look for it.
  _markInk(marked, cols, rows, step) {
    let any = super._markInk(marked, cols, rows, step);
    const g = this._g;
    this._refreshInk();
    const alpha = g.ink[3];
    for (let row = 0; row < rows; row++) {
      const j = Math.min(g.iy - 1, Math.floor((row * step) / g.ihy));
      for (let col = 0; col < cols; col++) {
        const i = Math.min(g.ix - 1, Math.floor((col * step) / g.ihx));
        if (alpha[j * g.ix + i] > FILM_ALPHA) { marked[row * cols + col] = 1; any = true; }
      }
    }
    return any;
  }

  // ---- Tools -----------------------------------------------------------------------------------

  rake(options) {
    const op = super.rake(options);
    if (op) op.D = options.D ?? 10;
    return op;
  }

  _advanceRake(op, dt) {
    this._tineWidth = op.D ?? 10;
    this._tineDt = dt;
    return super._advanceRake(op, dt);
  }

  // Tines don't move ink themselves: they drive the flow, which does.
  _tine(bx, by, ex, ey) { this._pin(bx, by, ex, ey, this._tineWidth); }

  _tineBody(bx, by, ex, ey, a) { this._pin(bx, by, ex, ey, 2 * a); }

  _pin(bx, by, ex, ey, width) {
    const { hx, hy } = this._g;
    const sigma = Math.max(width / 2, LEAST_REACH * Math.max(hx, hy));
    const len = Math.hypot(ex - bx, ey - by);
    const steps = Math.max(1, Math.ceil(len / sigma));
    const dt = this._tineDt;
    for (let k = 1; k <= steps; k++) {
      this._s.pins.push({ x: bx + ((ex - bx) * k) / steps, y: by + ((ey - by) * k) / steps, ux: (ex - bx) / dt, uy: (ey - by) / dt, sigma });
    }
  }

  // Everything else moves the sheet by a function. Here that motion, read on the grid, joins the flow.
  _map(f) {
    const { nx, ny, hx, hy } = this._g;
    const s = this._s;
    const out = [0, 0];
    const dt = this.dt;
    for (let j = 0, c = 0; j < ny; j++) {
      const y = -this.height / 2 + (j + 0.5) * hy;
      for (let i = 0; i < nx; i++, c++) {
        const x = -this.width / 2 + (i + 0.5) * hx;
        f(x, y, out);
        // A tool's motion fades out into solid sides, since nothing can move through them.
        const intoX = this.tileOn ? 1 : Math.min(1, Math.min(i + 0.5, nx - i - 0.5) / SIDE_FADE);
        const intoY = this.tileOn ? 1 : Math.min(1, Math.min(j + 0.5, ny - j - 0.5) / SIDE_FADE);
        s.kinX[c] += (intoX * (out[0] - x)) / dt;
        s.kinY[c] += (intoY * (out[1] - y)) / dt;
      }
    }
    s.haveKin = true;
  }

  step() {
    super.step();
    this._absorbOutlines();
    this._stepFlow(this.dt);
  }

  // ---- Showing it ------------------------------------------------------------------------------

  // The picture as straight (not premultiplied) 8-bit RGBA, rows from the bottom of the tank up.
  toRGBA() {
    const g = this._g;
    this._refreshInk();
    const [r, gg, b, a] = g.ink;
    const out = new Uint8ClampedArray(g.ix * g.iy * 4);
    for (let c = 0; c < a.length; c++) {
      const w = a[c] > 1e-4 ? 255 / a[c] : 0;
      out[c * 4] = r[c] * w;
      out[c * 4 + 1] = gg[c] * w;
      out[c * 4 + 2] = b[c] * w;
      out[c * 4 + 3] = a[c] * 255;
    }
    return { data: out, width: g.ix, height: g.iy };
  }

  // A print is the grid read with a sharp filter at the print's size, laid over the paper.
  async printInk(width, height, options, onProgress = () => {}) {
    const g = this._g;
    this._refreshInk();
    const paper = parseColor(options.paper ?? this.bath);
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      const gy = (1 - (y + 0.5) / height) * g.iy - 0.5;
      for (let x = 0; x < width; x++) {
        const gx = ((x + 0.5) / width) * g.ix - 0.5;
        const a = this._sharpSample(g.ink[3], gx, gy);
        const q = (y * width + x) * 4;
        for (let ch = 0; ch < 3; ch++) data[q + ch] = (this._sharpSample(g.ink[ch], gx, gy) + paper[ch] * (1 - a)) * 255;
        data[q + 3] = 255;
      }
      if (y % 64 === 0) {
        onProgress(y / height);
        await new Promise((resolve) => setTimeout(resolve));
      }
    }
    onProgress(1);
    return { width, height, data };
  }

  _beforeInk(ctx) {
    const { data, width, height } = this.toRGBA();
    const canvas = this._canvas ??= Object.assign(document.createElement('canvas'), { width, height });
    canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, -this.width / 2, -this.height / 2, this.width, this.height);
  }

  _svgBeforeInk() {
    if (typeof document === 'undefined') return '';
    const { data, width, height } = this.toRGBA();
    const canvas = Object.assign(document.createElement('canvas'), { width, height });
    canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
    return `<image x="${-this.width / 2}" y="${-this.height / 2}" width="${this.width}" height="${this.height}" transform="scale(1,-1) translate(0,0)" href="${canvas.toDataURL()}"/>`;
  }
}
