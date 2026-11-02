// Wake: Film, plus a bath that keeps moving. Tools push momentum into a 2D flow on a coarse grid:
//     w_t + u.grad w = nu lap w - friction w + curl(force),   u from w by a streamfunction
// Viscosity sets how long the flow lasts, so a thick bath loses it almost at once and a thin one
// coasts on after the tool stops. Past a Reynolds number of about 40, each tine also pushes from
// side to side at the rate a cylinder sheds vortices, which leaves a wobbling wake.
import { Film } from './film.js';
import { sinePlan } from './dst.js';

const CELL = 7; // mm
const DEPTH = 15; // mm of bath. Friction from the tank floor is about viscosity / depth^2.
const LEAST_FRICTION = 0.25; // per second, so that even a very thin bath calms down
const CALM = 0.4; // mm/s. Below this the flow is too slow to see, and stops.
const LONGEST_COAST = 25; // seconds
const DRAG = 1; // how much of a tine's drag goes into the bath
const SHED_AT = 40; // Reynolds number where a wake starts to wobble
const SHED_FULL = 240; // and where the wobble reaches full strength
const STROUHAL = 0.2;
const MOST_SIDEWAYS = 0.6;
const TOOL_GRIP = 0.6; // per second: how fast stir, vortex, jiggle, wriggle and air set the bath moving
const FEEDS_FLOW = new Set(['stir', 'vortex', 'jiggle', 'wriggle', 'air']);
const THINNEST = 0.5; // mm. Ribbons of ink narrower than this are cut, which is what keeps points bounded.
const CUT_EVERY = 15; // ticks
const MIN_CUT = 8; // points
const MIN_PIECE = 24; // points
const WIDEST_DRAG = 40; // mm. The closed-form tine drag is for thick baths, where it stays local.

export class Wake extends Film {
  // Long, stretched outlines are the normal state here, so detail starts to reduce sooner.
  get detailBudget() { return this.pointBudget ?? 25000; }

  get flowCell() { return this.flowTuning?.cell ?? CELL; }

  // Changing the grid keeps the flow by resampling it. The other settings apply from the next tick.
  setFlow(options) {
    const was = this.flowCell;
    const old = this.vorticity ? this._flowGrid : null;
    super.setFlow(options);
    if (old && this.flowCell !== was) this.vorticity = this._resampled(this.vorticity, old);
    this._fg = null;
    return this;
  }

  // The vorticity of one grid read at the cell centres of another, so a change of grid keeps the flow.
  _resampled(w, old) {
    const g = this._gridFor(this.flowCell);
    const out = new Float64Array(g.nx * g.ny);
    const x0 = -this.width / 2;
    const y0 = -this.height / 2;
    for (let y = 0; y < g.ny; y++) {
      const fy = Math.max(0, Math.min(old.ny - 1.000001, (y + 0.5) * g.hy / old.hy - 0.5));
      const j = Math.floor(fy);
      const c = fy - j;
      for (let x = 0; x < g.nx; x++) {
        const fx = Math.max(0, Math.min(old.nx - 1.000001, (x + 0.5) * g.hx / old.hx - 0.5));
        const i = Math.floor(fx);
        const a = fx - i;
        const k = j * old.nx + i;
        out[y * g.nx + x] = (w[k] * (1 - a) + w[k + 1] * a) * (1 - c) + (w[k + old.nx] * (1 - a) + w[k + old.nx + 1] * a) * c;
      }
    }
    return out;
  }

  _gridFor(cell) {
    const nx = Math.max(2, Math.round(this.width / cell));
    const ny = Math.max(2, Math.round(this.height / cell));
    return { nx, ny, hx: this.width / nx, hy: this.height / ny };
  }

  get _flowGrid() {
    if (this._fg) return this._fg;
    const { nx, ny } = this._gridFor(this.flowCell);
    const hx = this.width / nx;
    const hy = this.height / ny;
    const lambda = new Float64Array(nx * ny);
    for (let l = 0; l < ny; l++) {
      for (let k = 0; k < nx; k++) lambda[l * nx + k] = (Math.PI * (k + 1) / this.width) ** 2 + (Math.PI * (l + 1) / this.height) ** 2;
    }
    const size = nx * ny;
    this._fg = { nx, ny, hx, hy, lambda, px: sinePlan(nx), py: sinePlan(ny), a: new Float64Array(size), b: new Float64Array(size),
                 psi: new Float64Array(size), ux: new Float64Array(size), uy: new Float64Array(size), next: new Float64Array(size) };
    return this._fg;
  }

  // Sine transforms along x then y, which make the vorticity zero at the walls.
  _forward(g, from, to) {
    const { nx, ny, px, py, a } = g;
    for (let y = 0; y < ny; y++) px.forward(from, y * nx, 1, a, y * nx, 1);
    for (let k = 0; k < nx; k++) py.forward(a, k, nx, to, k, nx);
  }

  _inverse(g, from, to) {
    const { nx, ny, px, py, a } = g;
    for (let k = 0; k < nx; k++) py.inverse(from, k, nx, a, k, nx);
    for (let y = 0; y < ny; y++) px.inverse(a, y * nx, 1, to, y * nx, 1);
  }

  // Thin baths drag less widely. The rest of what a tine does there goes into the flow.
  rake(options) {
    const op = super.rake(options);
    if (op) {
      op.D = options.D ?? 10;
      op.L = Math.min(op.L, WIDEST_DRAG);
      op.shedPhases = op.offs.map(() => this.random() * 2 * Math.PI);
    }
    return op;
  }

  _advanceRake(op, dt) {
    const from = op.dist;
    const done = super._advanceRake(op, dt);
    const moved = op.dist - from;
    if (moved > 0) {
      const U = moved / dt;
      const Re = (U * op.D) / this.viscosity;
      const drag = (this.flowTuning?.push ?? DRAG) * (1 + 10 / Math.max(Re, 0.1) ** (2 / 3));
      const sideways = MOST_SIDEWAYS * Math.max(0, Math.min(1, (Re - SHED_AT) / (SHED_FULL - SHED_AT)));
      const size = 0.5 * U * U * op.D;
      op.offs.forEach((off, i) => {
        const [ax, ay] = this._rakePoint(op, from, off);
        const [bx, by] = this._rakePoint(op, op.dist, off);
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const tx = (bx - ax) / len;
        const ty = (by - ay) / len;
        const push = size * drag;
        op.shedPhases[i] += 2 * Math.PI * STROUHAL * (moved / op.D);
        const side = size * sideways * Math.sin(op.shedPhases[i]);
        (this._push ??= []).push([bx, by, tx * push - ty * side, ty * push + tx * side, op.D]);
      });
    }
    return done;
  }

  // A tool's own motion, read at every point of the flow grid, sets the bath turning with it.
  _map(f, options) {
    if (this._feeding) {
      const g = this._flowGrid;
      const { nx, ny, hx, hy } = g;
      const moveX = g.moveX ??= new Float64Array(nx * ny);
      const moveY = g.moveY ??= new Float64Array(nx * ny);
      const out = [0, 0];
      for (let y = 0; y < ny; y++) {
        const py = -this.height / 2 + (y + 0.5) * hy;
        for (let x = 0; x < nx; x++) {
          const px = -this.width / 2 + (x + 0.5) * hx;
          f(px, py, out);
          moveX[y * nx + x] += out[0] - px;
          moveY[y * nx + x] += out[1] - py;
        }
      }
      this._fed = true;
    }
    return super._map(f, options);
  }

  _advanceTimed(op, dt) {
    this._feeding = FEEDS_FLOW.has(op.kind);
    const done = super._advanceTimed(op, dt);
    this._feeding = false;
    return done;
  }

  _feedFlow(w, g, dt) {
    const { nx, ny, hx, hy, moveX, moveY } = g;
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        const dVy = ((x < nx - 1 ? moveY[i + 1] : moveY[i]) - (x > 0 ? moveY[i - 1] : moveY[i])) / (2 * hx);
        const dVx = ((y < ny - 1 ? moveX[i + nx] : moveX[i]) - (y > 0 ? moveX[i - nx] : moveX[i])) / (2 * hy);
        // Displacement over the tick is velocity x dt, so the grip's dt cancels it.
        w[i] += TOOL_GRIP * (dVy - dVx);
      }
    }
    moveX.fill(0);
    moveY.fill(0);
    this._fed = false;
  }

  // Contour surgery: stretching makes ribbons of ink ever longer and thinner, and each needs more
  // points to draw, though past a certain width it can't be seen. So where an outline comes within
  // THINNEST of itself, its thin end is cut off, or if both sides are large it becomes two outlines.
  _cutFilaments() {
    // At least as big as the longest edge, so that a nearby edge is always found from either end.
    const cell = Math.max(4, this.maxEdge * this.detail * 1.5);
    const key = (x, y) => (Math.floor(x / cell) + 2048) * 4096 + Math.floor(y / cell) + 2048;
    const out = [];
    for (const poly of this.polys) {
      if (poly.group || poly.n < 64) { out.push(poly); continue; }
      const pieces = this._cutOutline(poly, cell, key);
      for (const piece of pieces) out.push(piece);
    }
    if (out.length !== this.polys.length || out.some((p, i) => p !== this.polys[i])) this.polys = out;
  }

  _cutOutline(poly, cell, key) {
    const { xy, n } = poly;
    const buckets = new Map();
    for (let i = 0; i < n; i++) {
      const k = key(xy[i * 2], xy[i * 2 + 1]);
      const list = buckets.get(k);
      if (list) list.push(i);
      else buckets.set(k, [i]);
    }
    const near2 = THINNEST * THINNEST;
    const closest = (i) => {
      const x = xy[i * 2];
      const y = xy[i * 2 + 1];
      let best = -1;
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const list = buckets.get(key(x + a * cell, y + b * cell));
          if (!list) continue;
          for (const j of list) {
            // Points just along the outline from here are close because they're neighbours.
            if (j <= i + MIN_CUT || n - (j - i) <= MIN_CUT || j + 1 >= n) continue;
            const ax = xy[j * 2];
            const ay = xy[j * 2 + 1];
            const dx = xy[j * 2 + 2] - ax;
            const dy = xy[j * 2 + 3] - ay;
            const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
            const ex = ax + dx * t - x;
            const ey = ay + dy * t - y;
            if (ex * ex + ey * ey < near2 && j > best) best = j;
          }
        }
      }
      return best;
    };
    const piece = (from, to) => {
      const count = to - from + 1;
      const copy = new Float64Array(count * 4);
      copy.set(xy.subarray(from * 2, (to + 1) * 2));
      return { ...poly, xy: copy, n: count, from: poly.from ?? poly };
    };
    const areaLength = (from, to) => {
      let area = 0;
      let length = 0;
      for (let i = from; i < to; i++) {
        area += xy[i * 2] * xy[i * 2 + 3] - xy[i * 2 + 2] * xy[i * 2 + 1];
        length += Math.hypot(xy[i * 2 + 2] - xy[i * 2], xy[i * 2 + 3] - xy[i * 2 + 1]);
      }
      area += xy[to * 2] * xy[from * 2 + 1] - xy[from * 2] * xy[to * 2 + 1];
      return [Math.abs(area) / 2, length];
    };
    const kept = [];
    const extra = [];
    let i = 0;
    while (i < n) {
      kept.push(i);
      const j = closest(i);
      if (j < 0) { i++; continue; }
      const [area, length] = areaLength(i, j);
      if (area / length >= THINNEST) {
        // A big piece behind a thin neck stands alone, unless it would take almost the whole outline.
        if (j - i < n - MIN_PIECE && j - i >= MIN_PIECE) extra.push(piece(i + 1, j));
        else { i++; continue; }
      }
      i = j + 1;
    }
    if (kept.length === n) return [poly];
    if (kept.length < 16) return [poly];
    const cleaned = new Float64Array(kept.length * 4);
    kept.forEach((v, w) => {
      cleaned[w * 2] = xy[v * 2];
      cleaned[w * 2 + 1] = xy[v * 2 + 1];
    });
    poly.xy = cleaned;
    poly.n = kept.length;
    return [poly, ...extra];
  }

  get busy() { return super.busy || this.flowing === true; }

  _releaseGates() { if (!this.flowing) super._releaseGates(); }

  step() {
    super.step();
    if (this.tick % CUT_EVERY === 0 && (this.flowing || this.active.length) && !this.active.some((op) => op.kind === 'drop')) this._cutFilaments();
    // A stretching bath needs ever more points. Once the limit is reached, outlines can't follow
    // the flow any more and would tear into long chords, so the bath stops instead.
    if (this.capped && this.flowing) {
      this._stopFlow();
      this.stoppedAtLimit = true;
    } else if (!this.capped && (this._push?.length || this._fed)) this.stoppedAtLimit = false;
    if (this.stoppedAtLimit) this._dropPushes();
    else if (this._push?.length || this._fed || this.flowing) this._stepFlow(this.dt);
  }

  _stopFlow() {
    this.vorticity?.fill(0);
    this._dropPushes();
    this.flowing = false;
    this.flowAge = 0;
  }

  _dropPushes() {
    this._push = [];
    if (this._fed) {
      this._fg?.moveX?.fill(0);
      this._fg?.moveY?.fill(0);
      this._fed = false;
    }
  }

  _stepFlow(dt) {
    const g = this._flowGrid;
    const { nx, ny, hx, hy, lambda, psi, ux, uy, next, b } = g;
    this.vorticity ??= new Float64Array(nx * ny);
    let w = this.vorticity;
    const x0 = -this.width / 2;
    const y0 = -this.height / 2;
    // Tools push.
    for (const [px, py, fx, fy, D] of this._push ?? []) {
      const sigma = Math.max(D, 1.3 * Math.max(hx, hy));
      const reach = 4 * sigma;
      const c = dt / (2 * Math.PI * sigma ** 4);
      for (let y = Math.max(0, Math.floor((py - reach - y0) / hy)); y <= Math.min(ny - 1, (py + reach - y0) / hy); y++) {
        const dy = y0 + (y + 0.5) * hy - py;
        for (let x = Math.max(0, Math.floor((px - reach - x0) / hx)); x <= Math.min(nx - 1, (px + reach - x0) / hx); x++) {
          const dx = x0 + (x + 0.5) * hx - px;
          w[y * nx + x] += c * (fx * dy - fy * dx) * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        }
      }
    }
    this._push = [];
    if (this._fed) this._feedFlow(w, g, dt);
    // Viscosity, friction, and the flow they leave.
    const friction = Math.max(this.flowTuning?.friction ?? LEAST_FRICTION, (2.5 * this.viscosity) / DEPTH ** 2);
    this._forward(g, w, b);
    for (let i = 0; i < nx * ny; i++) {
      b[i] *= Math.exp(-(this.viscosity * lambda[i] + friction) * dt);
      psi[i] = b[i] / lambda[i];
    }
    this._inverse(g, b, w);
    this._inverse(g, psi, psi);
    let top = 0;
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        // Psi is zero at the walls, so flow runs along them and never through.
        const left = x > 0 ? psi[i - 1] : -psi[i];
        const right = x < nx - 1 ? psi[i + 1] : -psi[i];
        const down = y > 0 ? psi[i - nx] : -psi[i];
        const up = y < ny - 1 ? psi[i + nx] : -psi[i];
        ux[i] = (up - down) / (2 * hy);
        uy[i] = -(right - left) / (2 * hx);
        top = Math.max(top, Math.hypot(ux[i], uy[i]));
      }
    }
    this.flowAge = (this.flowAge ?? 0) + dt;
    if (top < CALM || this.flowAge > (this.flowTuning?.coast ?? LONGEST_COAST)) {
      this._stopFlow();
      return;
    }
    if (!this.flowing) this.flowAge = 0;
    this.flowing = true;
    const sample = (arr, x, y) => {
      const fx = Math.max(0, Math.min(nx - 1.000001, (x - x0) / hx - 0.5));
      const fy = Math.max(0, Math.min(ny - 1.000001, (y - y0) / hy - 0.5));
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const a = fx - i;
      const c = fy - j;
      const k = j * nx + i;
      return (arr[k] * (1 - a) + arr[k + 1] * a) * (1 - c) + (arr[k + nx] * (1 - a) + arr[k + nx + 1] * a) * c;
    };
    // The flow carries its own vorticity, tracing back along a smooth interpolation so swirls stay sharp.
    const cubic = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    const clampI = (v, n) => Math.max(0, Math.min(n - 1, v));
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        const px = x0 + (x + 0.5) * hx - ux[i] * dt;
        const py = y0 + (y + 0.5) * hy - uy[i] * dt;
        const fx = Math.max(0, Math.min(nx - 1.000001, (px - x0) / hx - 0.5));
        const fy = Math.max(0, Math.min(ny - 1.000001, (py - y0) / hy - 0.5));
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        let lo = Infinity;
        let hi = -Infinity;
        const rows = [];
        for (let r = -1; r <= 2; r++) {
          const row = clampI(iy + r, ny) * nx;
          const a = w[row + clampI(ix - 1, nx)];
          const c = w[row + ix];
          const d = w[row + clampI(ix + 1, nx)];
          const e = w[row + clampI(ix + 2, nx)];
          if (r === 0 || r === 1) { lo = Math.min(lo, c, d); hi = Math.max(hi, c, d); }
          rows.push(cubic(a, c, d, e, fx - ix));
        }
        next[i] = Math.max(lo, Math.min(hi, cubic(rows[0], rows[1], rows[2], rows[3], fy - iy)));
      }
    }
    w.set(next);
    this._map((x, y, out) => {
      const mx = x + (sample(ux, x, y) * dt) / 2;
      const my = y + (sample(uy, x, y) * dt) / 2;
      out[0] = x + sample(ux, mx, my) * dt;
      out[1] = y + sample(uy, mx, my) * dt;
    }, { slowNearWalls: false });
    this.lastFlowSpeed = top;
  }
}
