// Wake: Film, plus a bath that keeps moving. Tools push momentum into a 2D flow on a coarse grid:
//     w_t + u.grad w = nu lap w - friction w + curl(force),   u from w by a streamfunction
// Viscosity sets how long the flow lasts, so a thick bath loses it almost at once and a thin one
// coasts on after the tool stops. Past a Reynolds number of about 40, each tine also pushes from
// side to side at the rate a cylinder sheds vortices, which leaves a wobbling wake.
import { Film } from './film.js';

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
const WIDEST_DRAG = 40; // mm. The closed-form tine drag is for thick baths, where it stays local.

const sineTable = (n) => {
  const t = new Float64Array(n * n);
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) t[k * n + j] = Math.sin((Math.PI * (k + 1) * (j + 0.5)) / n);
  return t;
};

export class Wake extends Film {
  get _flowGrid() {
    if (this._fg) return this._fg;
    const nx = Math.round(this.width / CELL);
    const ny = Math.round(this.height / CELL);
    const hx = this.width / nx;
    const hy = this.height / ny;
    const lambda = new Float64Array(nx * ny);
    for (let l = 0; l < ny; l++) {
      for (let k = 0; k < nx; k++) lambda[l * nx + k] = (Math.PI * (k + 1) / this.width) ** 2 + (Math.PI * (l + 1) / this.height) ** 2;
    }
    const size = nx * ny;
    this._fg = { nx, ny, hx, hy, lambda, sx: sineTable(nx), sy: sineTable(ny), a: new Float64Array(size), b: new Float64Array(size),
                 psi: new Float64Array(size), ux: new Float64Array(size), uy: new Float64Array(size), next: new Float64Array(size) };
    return this._fg;
  }

  _forward(g, from, to) {
    const { nx, ny, sx, sy, a } = g;
    for (let y = 0; y < ny; y++) {
      for (let k = 0; k < nx; k++) {
        let s = 0;
        for (let j = 0; j < nx; j++) s += from[y * nx + j] * sx[k * nx + j];
        a[y * nx + k] = s;
      }
    }
    for (let k = 0; k < nx; k++) {
      for (let l = 0; l < ny; l++) {
        let s = 0;
        for (let j = 0; j < ny; j++) s += a[j * nx + k] * sy[l * ny + j];
        to[l * nx + k] = s;
      }
    }
  }

  _inverse(g, from, to) {
    const { nx, ny, sx, sy, a } = g;
    for (let k = 0; k < nx; k++) {
      for (let y = 0; y < ny; y++) {
        let s = 0;
        for (let l = 0; l < ny; l++) s += from[l * nx + k] * sy[l * ny + y] * (l === ny - 1 ? 1 : 2);
        a[y * nx + k] = s / ny;
      }
    }
    for (let y = 0; y < ny; y++) {
      for (let j = 0; j < nx; j++) {
        let s = 0;
        for (let k = 0; k < nx; k++) s += a[y * nx + k] * sx[k * nx + j] * (k === nx - 1 ? 1 : 2);
        to[y * nx + j] = s / nx;
      }
    }
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
      const drag = DRAG * (1 + 10 / Math.max(Re, 0.1) ** (2 / 3));
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

  get busy() { return super.busy || this.flowing === true; }

  _releaseGates() { if (!this.flowing) super._releaseGates(); }

  step() {
    super.step();
    if (this._push?.length || this.flowing) this._stepFlow(this.dt);
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
    // Viscosity, friction, and the flow they leave.
    const friction = Math.max(LEAST_FRICTION, (2.5 * this.viscosity) / DEPTH ** 2);
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
    if (top < CALM || this.flowAge > LONGEST_COAST) {
      w.fill(0);
      this.flowing = false;
      this.flowAge = 0;
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
