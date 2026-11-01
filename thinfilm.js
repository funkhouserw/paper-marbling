// Thin film: ink as a thin layer on the water.
//   c_t = div(c K grad P),  P = ln(c) where c > 1, otherwise 0
// c is how many times over the ink here could cover this bit of surface at its thinnest, so
// `spreading` is how much surface an ink can claim. Crowded ink flows towards less crowded ink,
// and a film stops once c falls to 1. Bare water has c = 0 and no pressure: separate films can't
// feel each other until they touch, and then they share a pressure and push as one. Outlines
// stay vector: they ride on the same flow that moves c.
import { Marble } from './engine.js';

const CELL = 5; // mm
const MARGIN = 300; // mm of surface beyond the tank, for when there are no walls
const FLOW = 1500; // how readily ink flows, mm^2/s
const DROP_THICKNESS = 0.5; // mm; a new drop lands this thick
const CALM = 0.25; // mm/s; below this the film counts as settled
const MAX_SUBSTEPS = 30;
const LONGEST_SPREAD = 10; // seconds; the last of a film's thinning is too slow to watch

export class ThinFilm extends Marble {
  get spreadFactor() { return 4; }

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
    // The surface this ink can claim, shared over the cells it lands on.
    const each = ((volume / this.film) * op.spreading) / (weight * CELL * CELL);
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
    if (!this.active.some((op) => op.kind === 'drop')) { this.flowSpeed = 0; return; }
    const { cols, rows, h, moveX, moveY } = this;
    // Only the part of the surface with ink on it does any work.
    let cMin = cols;
    let cMax = -1;
    let rMin = rows;
    let rMax = -1;
    for (let row = 0, q = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++, q++) {
        if (h[q] > 0) {
          if (col < cMin) cMin = col;
          if (col > cMax) cMax = col;
          if (row < rMin) rMin = row;
          if (row > rMax) rMax = row;
        }
      }
    }
    moveX.fill(0);
    moveY.fill(0);
    if (cMax < 0) { this.flowSpeed = 0; return; }
    const p = this._p ??= new Float64Array(h.length);
    const fx = this._fx ??= new Float64Array(h.length);
    const fy = this._fy ??= new Float64Array(h.length);
    const open = this._openMask();
    let left = dt;
    let fastest = 0;
    let furthest = 0;
    // Ink and outlines must move together, so a fast film stops for the tick once the outlines
    // have gone as far as is safe. It just takes a few more ticks to spread.
    for (let sub = 0; sub < MAX_SUBSTEPS && left > 1e-9 && furthest < CELL * CELL * 0.6; sub++) {
      // Ink can reach one cell further each substep.
      cMin = Math.max(0, cMin - 1);
      cMax = Math.min(cols - 1, cMax + 1);
      rMin = Math.max(0, rMin - 1);
      rMax = Math.min(rows - 1, rMax + 1);
      let highest = 0;
      for (let row = rMin; row <= rMax; row++) {
        for (let q = row * cols + cMin, end = row * cols + cMax; q <= end; q++) {
          p[q] = h[q] > 1 ? Math.log(h[q]) : 0;
          if (p[q] > highest) highest = p[q];
        }
      }
      // Beside bare water, the drop in pressure can be several times the local value.
      const step = Math.min(left, (0.2 * CELL * CELL) / (FLOW * (1 + highest)));
      left -= step;
      for (let row = rMin; row <= rMax; row++) {
        for (let col = cMin, q = row * cols + cMin; col <= cMax; col++, q++) {
          fx[q] = 0;
          fy[q] = 0;
          if (!open[q]) continue;
          if (col < cMax && open[q + 1]) {
            const dp = p[q] - p[q + 1];
            if (dp) fx[q] = (FLOW * (dp > 0 ? h[q] : h[q + 1]) * dp) / CELL; // ink comes from the higher side
          }
          if (row < rMax && open[q + cols]) {
            const dp = p[q] - p[q + cols];
            if (dp) fy[q] = (FLOW * (dp > 0 ? h[q] : h[q + cols]) * dp) / CELL;
          }
        }
      }
      for (let row = rMin; row <= rMax; row++) {
        for (let col = cMin, q = row * cols + cMin; col <= cMax; col++, q++) {
          let net = -fx[q] - fy[q];
          if (col > cMin) net += fx[q - 1];
          if (row > rMin) net += fy[q - cols];
          h[q] += (net * step) / CELL;
          // How fast the surface here moves: the ink flowing through it per unit of ink. At the
          // front only one side has any flow, and that sets how fast the edge advances.
          const west = col > cMin ? fx[q - 1] : 0;
          const south = row > rMin ? fy[q - cols] : 0;
          const thick = Math.max(h[q], 1);
          const ux = (west && fx[q] ? (west + fx[q]) / 2 : west + fx[q]) / thick;
          const uy = (south && fy[q] ? (south + fy[q]) / 2 : south + fy[q]) / thick;
          moveX[q] += ux * step;
          moveY[q] += uy * step;
          const s = ux * ux + uy * uy;
          if (s > fastest) fastest = s;
          const moved = moveX[q] * moveX[q] + moveY[q] * moveY[q];
          if (moved > furthest) furthest = moved;
        }
      }
    }
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
