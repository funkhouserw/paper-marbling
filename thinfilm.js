// Thin film: ink as a thin layer on the water, tracked by its thickness.
//   h_t = div(h K grad P),  P = max(h - h_min, 0)
// Thick ink flows towards thin ink, and a film stops once it has thinned to h_min. Bare water
// has no thickness and so no pressure: separate films can't feel each other until they touch,
// and then they share a pressure and push as one. Outlines stay vector: they ride on the same
// flow that moves the thickness.
import { Marble } from './engine.js';

const CELL = 5; // mm
const MARGIN = 300; // mm of surface beyond the tank, for when there are no walls
const FLOW = 12000; // how readily ink flows, mm^2/s per mm of thickness
const DROP_THICKNESS = 0.5; // mm; a new drop lands this thick
const THINNEST = 0.025; // mm; a film stops spreading at this thickness
const CALM = 0.25; // mm/s; below this the film counts as settled
const MAX_SUBSTEPS = 40;
const LONGEST_SPREAD = 10; // seconds; the last of a film's thinning is too slow to watch

export class ThinFilm extends Marble {
  constructor(options) {
    super(options);
    this.cols = Math.ceil((this.width + 2 * MARGIN) / CELL);
    this.rows = Math.ceil((this.height + 2 * MARGIN) / CELL);
    this.h = new Float64Array(this.cols * this.rows);
    this.moveX = new Float64Array(this.cols * this.rows);
    this.moveY = new Float64Array(this.cols * this.rows);
    this.flowSpeed = 0;
    this.toolMoved = false;
  }

  _cellX(x) { return (x + this.width / 2 + MARGIN) / CELL - 0.5; }

  _cellY(y) { return (y + this.height / 2 + MARGIN) / CELL - 0.5; }

  // Walls close off everything outside the tank.
  _open(col, row) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return false;
    if (!this.wallsOn) return true;
    const x = (col + 0.5) * CELL - MARGIN - this.width / 2;
    const y = (row + 0.5) * CELL - MARGIN - this.height / 2;
    return Math.abs(x) <= this.width / 2 && Math.abs(y) <= this.height / 2;
  }

  _deposit(op) {
    const volume = op.quantity * 1000;
    const r = Math.sqrt(volume / (Math.PI * DROP_THICKNESS));
    const reach = r + CELL;
    let weight = 0;
    const cells = [];
    const c0 = this._cellX(op.x);
    const r0 = this._cellY(op.y);
    const span = Math.ceil(reach / CELL);
    for (let row = Math.floor(r0) - span; row <= Math.ceil(r0) + span; row++) {
      for (let col = Math.floor(c0) - span; col <= Math.ceil(c0) + span; col++) {
        if (!this._open(col, row)) continue;
        const d = Math.hypot(col - c0, row - r0) * CELL;
        // A soft edge a cell wide, so a small drop still lands round.
        const w = Math.max(0, Math.min(1, (r + CELL / 2 - d) / CELL));
        if (w > 0) { cells.push([row * this.cols + col, w]); weight += w; }
      }
    }
    if (!weight) return r;
    const each = volume / (weight * CELL * CELL);
    for (const [q, w] of cells) this.h[q] += each * w;
    return r;
  }

  _advanceDrop(op) {
    if (!op.placed) {
      op.placed = true;
      op.age = 0;
      this.landing.push([op, this._deposit(op)]);
      this.flowSpeed = Infinity;
    }
    op.age += this.dt;
    return op.age > 0.3 && (this.flowSpeed < CALM || op.age > LONGEST_SPREAD);
  }

  // Tools move the outlines directly, so the thickness catches up once they finish.
  _advanceRake(op, dt) { this.toolMoved = true; return super._advanceRake(op, dt); }

  _advanceTimed(op, dt) { this.toolMoved = true; return super._advanceTimed(op, dt); }

  _flushGrowth() {
    this.growth = [];
    super._flushGrowth();
    const toolRunning = this.active.some((op) => op.kind !== 'drop');
    if (toolRunning) return;
    if (this.toolMoved) {
      this.toolMoved = false;
      this._rebuildThickness();
    }
    this._flow(this.dt);
  }

  // Keeps the total ink, evened out over wherever the outlines now are.
  _rebuildThickness() {
    const { cols, rows, h } = this;
    let total = 0;
    for (let q = 0; q < h.length; q++) total += h[q];
    const inked = new Uint8Array(h.length);
    const crossings = Array.from({ length: rows }, () => []);
    for (const { xy, n } of this.polys) {
      let lo = rows;
      let hi = -1;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const y0 = this._cellY(xy[j * 2 + 1]);
        const y1 = this._cellY(xy[i * 2 + 1]);
        const from = Math.max(0, Math.ceil(Math.min(y0, y1)));
        const to = Math.min(rows - 1, Math.ceil(Math.max(y0, y1)) - 1);
        for (let r = from; r <= to; r++) {
          crossings[r].push(this._cellX(xy[j * 2] + (xy[i * 2] - xy[j * 2]) * ((r - y0) / (y1 - y0))));
        }
        if (from <= to) { lo = Math.min(lo, from); hi = Math.max(hi, to); }
      }
      for (let r = lo; r <= hi; r++) {
        const c = crossings[r].sort((a, b) => a - b);
        for (let k = 0; k + 1 < c.length; k += 2) {
          for (let col = Math.max(0, Math.ceil(c[k])); col <= Math.min(cols - 1, Math.floor(c[k + 1])); col++) inked[r * cols + col] = 1;
        }
        c.length = 0;
      }
    }
    let count = 0;
    for (let q = 0; q < h.length; q++) count += inked[q];
    const even = count ? total / count : 0;
    for (let q = 0; q < h.length; q++) h[q] = inked[q] ? even : 0;
  }

  _flow(dt) {
    const { cols, rows, h, moveX, moveY } = this;
    moveX.fill(0);
    moveY.fill(0);
    let left = dt;
    let fastest = 0;
    const p = new Float64Array(h.length);
    const fx = new Float64Array(h.length);
    const fy = new Float64Array(h.length);
    const open = this._openMask();
    for (let sub = 0; sub < MAX_SUBSTEPS && left > 1e-9; sub++) {
      let tallest = 0;
      for (let q = 0; q < h.length; q++) {
        p[q] = h[q] > THINNEST ? h[q] - THINNEST : 0;
        if (h[q] > tallest) tallest = h[q];
      }
      const step = Math.min(left, (0.2 * CELL * CELL) / (FLOW * Math.max(tallest, 1e-6)));
      left -= step;
      fx.fill(0);
      fy.fill(0);
      for (let row = 0, q = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++, q++) {
          if (!open[q]) continue;
          if (col + 1 < cols && open[q + 1]) {
            const dp = p[q] - p[q + 1];
            if (dp) fx[q] = FLOW * (dp > 0 ? h[q] : h[q + 1]) * dp / CELL; // ink comes from the higher side
          }
          if (row + 1 < rows && open[q + cols]) {
            const dp = p[q] - p[q + cols];
            if (dp) fy[q] = FLOW * (dp > 0 ? h[q] : h[q + cols]) * dp / CELL;
          }
        }
      }
      for (let row = 0, q = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++, q++) {
          let net = -fx[q] - fy[q];
          if (col > 0) net += fx[q - 1];
          if (row > 0) net += fy[q - cols];
          h[q] += (net * step) / CELL;
          // How far the surface here moves: the pressure's downhill slope.
          const gx = (col > 0 ? p[q - 1] : p[q]) - (col + 1 < cols ? p[q + 1] : p[q]);
          const gy = (row > 0 ? p[q - cols] : p[q]) - (row + 1 < rows ? p[q + cols] : p[q]);
          const ux = (FLOW * gx) / (2 * CELL);
          const uy = (FLOW * gy) / (2 * CELL);
          moveX[q] += ux * step;
          moveY[q] += uy * step;
          const s = ux * ux + uy * uy;
          if (s > fastest) fastest = s;
        }
      }
    }
    // Ran out of substeps with time left: the film just runs slower for a moment.
    this.flowSpeed = Math.sqrt(fastest);
    if (this.polys.length) this._carryOutlines();
  }

  _openMask() {
    if (this._openFor === this.wallsOn) return this._opens;
    const open = new Uint8Array(this.h.length);
    for (let row = 0, q = 0; row < this.rows; row++) for (let col = 0; col < this.cols; col++, q++) open[q] = this._open(col, row) ? 1 : 0;
    this._opens = open;
    this._openFor = this.wallsOn;
    return open;
  }

  _carryOutlines() {
    const { cols, rows, moveX, moveY } = this;
    const sample = (field, fc, fr) => {
      const c = Math.max(0, Math.min(cols - 1.001, fc));
      const r = Math.max(0, Math.min(rows - 1.001, fr));
      const i = Math.floor(c);
      const j = Math.floor(r);
      const tx = c - i;
      const ty = r - j;
      const q = j * cols + i;
      return (field[q] * (1 - tx) + field[q + 1] * tx) * (1 - ty) + (field[q + cols] * (1 - tx) + field[q + cols + 1] * tx) * ty;
    };
    this._map((x, y, out) => {
      const fc = this._cellX(x);
      const fr = this._cellY(y);
      out[0] = x + sample(moveX, fc, fr);
      out[1] = y + sample(moveY, fc, fr);
    }, { slowNearWalls: false });
  }
}
