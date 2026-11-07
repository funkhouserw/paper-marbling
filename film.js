// Film: ink as a film that carries pressure, on water that doesn't.
//
// Each tick with a growing drop solves one equation on a coarse grid and moves every outline
// point with the single velocity it gives:
//     -div grad p + k^2 p = s,   velocity = -grad p
// s is where drops are feeding ink in. k is large on water, so pressure dies within millimetres
// and films don't feel each other until they touch. On ink k is zero, so the push carries through
// and rings keep their area, as long as the film still reaches water. A film with no water left
// gets a small k, which lets old ink thicken rather than having nowhere to go.
//
// Pressure depends only on what's feeding right now, so when feeding stops all motion stops.
// Close to a drop, the exact radial map from pst-marble (see NOTICE) takes over, so rings stay round below
// grid size. Tools are unchanged. This is one-phase Hele-Shaw flow with a screened outer region.
import { Marble, isTranslucent } from './engine.js';
import { wrapX, wrapY, tileCell } from './tile.js';
import { underpaintWidth } from './thin.js';

const CELL = 5; // mm. Every setting here was tested together at this size.
const MARGIN = 250; // mm of surface beyond the tank, for when there are no walls
const WATER_REACH = 3.5; // mm; how far pressure carries past the ink's edge
const INK_GIVE = 500; // mm; how far a push reaches through ink that has no water left
const EDGE_COVERAGE = 0.2; // share of a cell covered by ink at which it counts as ink
const SOURCE_WIDTH = 6; // mm. Narrower sources make drops wander away from where they landed.
const EDGE_STEP = 2; // mm; the most a film's edge moves in one tick, so nothing folds
const STOPS_FACING = 0.02; // share of a film's edge facing water at which spreading stops
const FULL_FACING = 0.2; // above this much further, spreading is unaffected
const GIVE_BELOW = 0.05; // ink only gives when less than this much of its edge faces water
const GROWTH_DONE = 0.015; // a drop rests when this share of its plain area remains
const SPREAD_TIME_LIMIT = 3; // spreading ends after this many times a drop's growth time
const FEED_TIME_LIMIT = 6; // and every drop ends after this many, whatever else is happening
const SOLVER_CYCLES = 3;
const VELOCITY_BLUR = 1; // passes
const ROUND_WITHIN = 2; // cells; how far a film's edge can vary and still count as round
const SUB_ROWS = 4; // scanlines per grid row when measuring coverage
const NEARLY_ZERO = 1e-9; // keeps the solver well behaved where k would be exactly zero
// Painted under every drop, so a gap thinner than twice this shows ink instead of the bath.
// Gaps stop closing at about one cell. This also grows edges facing real water by this much.
const CLOSE_GAPS = 3.5; // mm

const polygonArea = ({ xy, n }) => {
  let sum = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) sum += xy[j * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[j * 2 + 1];
  return Math.abs(sum) / 2;
};

// Each cell's neighbours in the four directions, or -1 at an edge that isn't joined to anything.
const linksFor = (nx, ny, joined, offset = null) => {
  const size = nx * ny;
  const west = new Int32Array(size), east = new Int32Array(size), south = new Int32Array(size), north = new Int32Array(size);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const i = y * nx + x;
      west[i] = x > 0 ? i - 1 : joined ? tileCell(y, x - 1, nx, ny, offset) : -1;
      east[i] = x < nx - 1 ? i + 1 : joined ? tileCell(y, x + 1, nx, ny, offset) : -1;
      south[i] = y > 0 ? i - nx : joined ? tileCell(y - 1, x, nx, ny, offset) : -1;
      north[i] = y < ny - 1 ? i + nx : joined ? tileCell(y + 1, x, nx, ny, offset) : -1;
    }
  }
  return { west, east, south, north };
};
const mod = (i, n) => ((i % n) + n) % n;

export class Film extends Marble {
  // Keep cells separate isn't drawn here yet: this simulator ignores the setting for now.
  get seamSupported() { return false; }

  // The pressure grid joins up at the seams, so films meet and push across them.
  get tileSupported() { return true; }

  get spreadFactor() { return 4; }
  get evenWalls() { return true; }

  get closeGaps() { return CLOSE_GAPS; }

  // Rebuilt when the walls change, because without walls the grid extends past the tank.
  _getGrid() {
    const torus = this.tileOn;
    const pad = this.wallsOn || torus ? 0 : MARGIN;
    const offset = torus ? this.tileOffset : null;
    let nx = Math.round((this.width + 2 * pad) / CELL);
    let ny = Math.round((this.height + 2 * pad) / CELL);
    // A half-tile shift has to land on whole cells.
    if (offset === 'brick') nx = 2 * Math.round(nx / 2);
    if (offset === 'halfDrop') ny = 2 * Math.round(ny / 2);
    const key = `${nx}x${ny}${torus ? `torus${offset}` : ''}`;
    if (this._grid?.key === key) return this._grid;
    const levels = [];
    for (let a = nx, b = ny, h = CELL; ; a /= 2, b /= 2, h *= 2) {
      const size = a * b;
      levels.push({ nx: a, ny: b, h, p: new Float64Array(size), f: new Float64Array(size),
                    k: new Float64Array(size), r: new Float64Array(size), t: new Float64Array(size), ...linksFor(a, b, torus, offset) });
      if (a % 2 || b % 2 || Math.min(a, b) < 12) break;
    }
    const size = nx * ny;
    this._grid = {
      key, nx, ny, x0: -this.width / 2 - pad, y0: -this.height / 2 - pad, open: pad > 0, torus, offset, levels,
      coverage: new Float64Array(size), label: new Int32Array(size), ink: new Uint8Array(size), seam: new Uint8Array(size),
      ux: new Float64Array(size), uy: new Float64Array(size), ex: new Float64Array(size), ey: new Float64Array(size),
      crossings: Array.from({ length: ny * SUB_ROWS }, () => []), spans: Array.from({ length: ny * SUB_ROWS }, () => []),
    };
    return this._grid;
  }

  // How much of each cell holds ink. Overlapping outlines count once.
  _measureCoverage(g) {
    const { nx, ny, x0, y0, coverage, crossings, spans } = g;
    const rowHeight = CELL / SUB_ROWS;
    const rows = ny * SUB_ROWS;
    coverage.fill(0);
    for (const s of spans) s.length = 0;
    for (const poly of this.polys) {
      const { xy, n } = poly;
      // On a repeating tank an outline can run past the tile, so every copy that shows counts.
      for (const [sx, sy] of this.tileShifts([poly])) {
        let lo = rows;
        let hi = -1;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const a = (xy[j * 2 + 1] + sy - y0) / rowHeight - 0.5;
          const b = (xy[i * 2 + 1] + sy - y0) / rowHeight - 0.5;
          const from = Math.max(0, Math.ceil(Math.min(a, b)));
          const to = Math.min(rows - 1, Math.ceil(Math.max(a, b)) - 1);
          for (let r = from; r <= to; r++) {
            crossings[r].push((xy[j * 2] + sx + (xy[i * 2] - xy[j * 2]) * (r - a) / (b - a) - x0) / CELL);
          }
          if (from <= to) { lo = Math.min(lo, from); hi = Math.max(hi, to); }
        }
        for (let r = lo; r <= hi; r++) {
          const c = crossings[r].sort((p, q) => p - q);
          for (let k = 0; k + 1 < c.length; k += 2) spans[r].push([c[k], c[k + 1]]);
          c.length = 0;
        }
      }
    }
    const fill = (row, from, to) => {
      const a = Math.max(0, from);
      const b = Math.min(nx, to);
      for (let i = Math.floor(a), end = Math.min(nx - 1, Math.ceil(b) - 1); i <= end && b > a; i++) {
        coverage[row + i] += (Math.min(i + 1, b) - Math.max(i, a)) / SUB_ROWS;
      }
    };
    for (let r = 0; r < rows; r++) {
      if (!spans[r].length) continue;
      const row = Math.floor(r / SUB_ROWS) * nx;
      const list = spans[r].sort((p, q) => p[0] - q[0]);
      let [start, end] = list[0];
      for (let i = 1; i < list.length; i++) {
        if (list[i][0] <= end) end = Math.max(end, list[i][1]);
        else { fill(row, start, end); [start, end] = list[i]; }
      }
      fill(row, start, end);
    }
  }

  // Finds separate films and how much of each one's edge still faces water.
  _findFilms(g, feeding, sourceWidth) {
    const { nx, ny, x0, y0, coverage, label, ink, seam, open, torus } = g;
    const { west, east, south, north } = g.levels[0];
    label.fill(0);
    seam.fill(0);
    // A landing drop brings its own ink, even before its outline shows on the grid.
    for (const op of feeding) {
      const cx = (op.x - x0) / CELL - 0.5;
      const cy = (op.y - y0) / CELL - 0.5;
      const reach = (2.5 * sourceWidth) / CELL;
      const fromY = Math.floor(cy - reach - 1), toY = cy + reach + 1;
      const fromX = Math.floor(cx - reach - 1), toX = cx + reach + 1;
      for (let y = torus ? fromY : Math.max(0, fromY); y <= (torus ? toY : Math.min(ny - 1, toY)); y++) {
        for (let x = torus ? fromX : Math.max(0, fromX); x <= (torus ? toX : Math.min(nx - 1, toX)); x++) {
          // Fractional, because a stepped set of cells stamps its shape on the growing drop.
          const share = Math.max(0, Math.min(1, reach + 0.5 - Math.hypot(x - cx, y - cy)));
          const i = tileCell(y, x, nx, ny, g.offset);
          if (share > coverage[i]) coverage[i] = share;
        }
      }
    }
    for (let i = 0; i < nx * ny; i++) ink[i] = coverage[i] >= EDGE_COVERAGE ? 1 : 0;
    const parent = [0];
    const stack = [];
    for (let s = 0; s < nx * ny; s++) {
      if (!ink[s] || label[s]) continue;
      const id = parent.length;
      parent.push(id);
      label[s] = id;
      stack.push(s);
      while (stack.length) {
        const i = stack.pop();
        for (const j of [west[i], east[i], south[i], north[i]]) {
          if (j >= 0 && ink[j] && !label[j]) { label[j] = id; stack.push(j); }
        }
      }
    }
    const find = (a) => {
      while (parent[a] !== a) a = parent[a] = parent[parent[a]];
      return a;
    };
    // A water cell with ink on opposite sides is a closing seam: its films have touched.
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        if (ink[i]) continue;
        const left = west[i] >= 0 && ink[west[i]];
        const right = east[i] >= 0 && ink[east[i]];
        const down = south[i] >= 0 && ink[south[i]];
        const up = north[i] >= 0 && ink[north[i]];
        if (!((left && right) || (down && up))) continue;
        seam[i] = 1;
        const sides = [left && label[west[i]], right && label[east[i]], down && label[south[i]], up && label[north[i]]].filter(Boolean);
        for (const side of sides) parent[find(side)] = find(sides[0]);
      }
    }
    const area = new Float64Array(parent.length);
    const edge = new Float64Array(parent.length);
    const faces = (j) => !ink[j] && !seam[j];
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        if (!ink[i]) continue;
        const film = find(label[i]);
        area[film] += CELL * CELL;
        // Walls aren't water. The grid's far edge, with no walls, counts as open water.
        for (const j of [west[i], east[i], south[i], north[i]]) if (j >= 0 ? faces(j) : open) edge[film] += CELL;
      }
    }
    // Compared with a circle of the same area. A stepped outline measures 4/pi too long.
    const facing = area.map((a, film) => (a ? Math.min(1, (edge[film] * Math.PI) / 4 / (2 * Math.sqrt(Math.PI * a))) : 0));
    return { facingAt: (i) => (label[i] ? facing[find(label[i])] : 1), filmAt: (i) => (label[i] ? find(label[i]) : 0) };
  }

  // A round film with one drop feeding it needs no grid: the exact radial map from pst-marble is
  // right for it, and a grid would imprint its own shape. Returns those drops and how far they reach.
  _roundFilms(g, feeding, filmAt) {
    const { nx, ny, x0, y0, ink, open, torus } = g;
    const { west, east, south, north } = g.levels[0];
    const owners = new Map();
    const atCell = (op) => this._cellAt(g, op.x, op.y);
    for (const op of feeding) {
      if (!(op.feed > 0)) continue;
      const film = filmAt(atCell(op));
      owners.set(film, owners.has(film) ? null : op);
    }
    const ranges = new Map();
    for (const [film, op] of owners) if (op && film) ranges.set(film, { op, near: Infinity, far: 0, ok: true });
    if (!ranges.size) return new Map();
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        if (!ink[i]) continue;
        const range = ranges.get(filmAt(i));
        if (!range) continue;
        const onGridEdge = !torus && (x === 0 || y === 0 || x === nx - 1 || y === ny - 1);
        if (onGridEdge && !open) range.ok = false;
        if (!onGridEdge && ink[west[i]] && ink[east[i]] && ink[south[i]] && ink[north[i]]) continue;
        let dx = x0 + (x + 0.5) * CELL - range.op.x;
        let dy = y0 + (y + 0.5) * CELL - range.op.y;
        if (torus) { const ax = dx; dx = wrapX(ax, dy, this.width, this.height, g.offset); dy = wrapY(ax, dy, this.width, this.height, g.offset); }
        const d = Math.hypot(dx, dy);
        range.near = Math.min(range.near, d);
        range.far = Math.max(range.far, d);
      }
    }
    const exact = new Map();
    for (const { op, near, far, ok } of ranges.values()) {
      if (ok && far - near <= ROUND_WITHIN * CELL + 0.04 * far) exact.set(op, far + 2 * CELL);
    }
    return exact;
  }

  // The cell holding a point: clamped to the grid, or wrapped into it on a repeating tank.
  _cellAt(g, x, y) {
    const { nx, ny, x0, y0, torus } = g;
    const col = Math.round((x - x0) / CELL - 0.5);
    const row = Math.round((y - y0) / CELL - 0.5);
    if (torus) return tileCell(row, col, nx, ny, g.offset);
    return Math.max(0, Math.min(ny - 1, row)) * nx + Math.max(0, Math.min(nx - 1, col));
  }

  // The share of a drop's own outline with water just outside it.
  _ownEdgeFacing(op, g) {
    if (!op.poly) return 1;
    const { nx, ny, x0, y0, coverage, open, torus } = g;
    const { xy, n } = op.poly;
    const step = Math.max(1, Math.floor(n / 64));
    let water = 0;
    let samples = 0;
    for (let i = 0; i < n; i += step) {
      const dx = xy[i * 2] - op.x;
      const dy = xy[i * 2 + 1] - op.y;
      const d = Math.hypot(dx, dy) || 1;
      const col = Math.round((xy[i * 2] + (dx / d) * 1.5 * CELL - x0) / CELL - 0.5);
      const row = Math.round((xy[i * 2 + 1] + (dy / d) * 1.5 * CELL - y0) / CELL - 0.5);
      samples++;
      if (!torus && (col < 0 || col >= nx || row < 0 || row >= ny)) { if (open) water++; continue; }
      if (coverage[tileCell(row, col, nx, ny, g.offset)] < EDGE_COVERAGE) water++;
    }
    return water / samples;
  }

  // Damped Jacobi, which treats mirrored cells alike, so symmetric input gives symmetric output.
  _smooth(L, sweeps) {
    const { nx, ny, h, f, k, west, east, south, north } = L;
    const open = this._grid.open;
    const inv = 1 / (h * h);
    const weight = 0.8;
    let { p, t } = L;
    for (let s = 0; s < sweeps; s++) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const i = y * nx + x;
          let sum = 0;
          let d = 0;
          if (west[i] >= 0) { sum += p[west[i]]; d++; } else if (open) d++;
          if (east[i] >= 0) { sum += p[east[i]]; d++; } else if (open) d++;
          if (south[i] >= 0) { sum += p[south[i]]; d++; } else if (open) d++;
          if (north[i] >= 0) { sum += p[north[i]]; d++; } else if (open) d++;
          t[i] = (1 - weight) * p[i] + (weight * (f[i] + sum * inv)) / (d * inv + k[i]);
        }
      }
      [p, t] = [t, p];
    }
    L.p = p;
    L.t = t;
  }

  _residual(L) {
    const { nx, ny, h, p, f, k, r, west, east, south, north } = L;
    const open = this._grid.open;
    const inv = 1 / (h * h);
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        let sum = 0;
        let d = 0;
        if (west[i] >= 0) { sum += p[west[i]]; d++; } else if (open) d++;
        if (east[i] >= 0) { sum += p[east[i]]; d++; } else if (open) d++;
        if (south[i] >= 0) { sum += p[south[i]]; d++; } else if (open) d++;
        if (north[i] >= 0) { sum += p[north[i]]; d++; } else if (open) d++;
        r[i] = f[i] - ((d * p[i] - sum) * inv + k[i] * p[i]);
      }
    }
  }

  _vCycle(level) {
    const { levels } = this._grid;
    const L = levels[level];
    if (level === levels.length - 1) {
      L.p.fill(0);
      this._smooth(L, 80);
      return;
    }
    this._smooth(L, 3);
    this._residual(L);
    const C = levels[level + 1];
    C.f.fill(0);
    C.k.fill(0);
    for (let y = 0; y < L.ny; y++) {
      for (let x = 0; x < L.nx; x++) {
        const c = (y >> 1) * C.nx + (x >> 1);
        const i = y * L.nx + x;
        C.f[c] += L.r[i] / 4;
        C.k[c] += L.k[i] / 4;
      }
    }
    C.p.fill(0);
    this._vCycle(level + 1);
    for (let y = 0; y < L.ny; y++) {
      for (let x = 0; x < L.nx; x++) L.p[y * L.nx + x] += C.p[(y >> 1) * C.nx + (x >> 1)];
    }
    this._smooth(L, 3);
  }

  _advanceDrop(op, dt) {
    op.elapsed += dt;
    op.plain ??= op.maxArea * Math.PI;
    op.limit ??= op.dispersion === Infinity ? op.plain : op.plain * op.spreading;
    op.head ??= 1;
    op.area ??= 0;
    const rate = op.dispersion === Infinity ? 1 : 1 - Math.exp(-op.dispersion * dt);
    // A drop always reaches its plain size; with gall, the share of its spread its pressure beats
    // the ink under it by, so a stronger colour pushes the last into veins. Past that, only an
    // edge facing water draws it on.
    const floor = op.open > 0 ? Math.max(op.plain, op.limit * Math.min(1, op.open)) : op.plain;
    const toPlain = Math.max(0, floor - op.area) * rate;
    const toLimit = Math.max(0, op.limit - op.area) * rate * op.head;
    op.feed = Math.max(toPlain, toLimit) / dt;
    this.growth.push(op);
    const small = GROWTH_DONE * op.plain;
    const reachedPlain = floor - op.area < small;
    const spreadDone = toLimit < small * rate || op.elapsed > op.growTime * SPREAD_TIME_LIMIT;
    return (reachedPlain && spreadDone) || op.elapsed > op.growTime * FEED_TIME_LIMIT;
  }

  _flushGrowth() {
    const feeding = this.growth;
    this.growth = [];
    if (!feeding.length) return;
    const dt = this.dt;
    const g = this._getGrid();
    this._measureCoverage(g);
    const { nx, ny, x0, y0, coverage, ink, seam, ux, uy, ex, ey, levels, torus } = g;
    const L = levels[0];
    const { west, east, south, north } = L;
    const W = this.width, H = this.height;
    const sourceWidth = Math.max(SOURCE_WIDTH, CELL * 1.2);
    const { facingAt, filmAt } = this._findFilms(g, feeding, sourceWidth);
    const exact = this._roundFilms(g, feeding, filmAt);

    const onWater = 1 / WATER_REACH ** 2;
    const onInk = 1 / INK_GIVE ** 2;
    for (let i = 0; i < nx * ny; i++) {
      if (ink[i]) L.k[i] = NEARLY_ZERO + onInk * Math.max(0, 1 - facingAt(i) / GIVE_BELOW);
      else if (seam[i]) L.k[i] = NEARLY_ZERO;
      else L.k[i] = NEARLY_ZERO + onWater * (1 - coverage[i] / EDGE_COVERAGE) ** 2;
    }

    L.f.fill(0);
    const sourceCells = Math.ceil((4 * sourceWidth) / CELL);
    for (const op of feeding) {
      if (!(op.feed > 0) || exact.has(op)) continue;
      const cx = (op.x - x0) / CELL - 0.5;
      const cy = (op.y - y0) / CELL - 0.5;
      const fx = Math.round(cx);
      const fy = Math.round(cy);
      let total = 0;
      for (let pass = 0; pass < 2; pass++) {
        for (let y = torus ? fy - sourceCells : Math.max(0, fy - sourceCells); y <= (torus ? fy + sourceCells : Math.min(ny - 1, fy + sourceCells)); y++) {
          for (let x = torus ? fx - sourceCells : Math.max(0, fx - sourceCells); x <= (torus ? fx + sourceCells : Math.min(nx - 1, fx + sourceCells)); x++) {
            const w = Math.exp(-(((x - cx) ** 2 + (y - cy) ** 2) * CELL * CELL) / (2 * sourceWidth * sourceWidth));
            if (pass === 0) total += w;
            else L.f[tileCell(y, x, nx, ny, g.offset)] += (op.feed * w) / total / (CELL * CELL);
          }
        }
      }
    }
    // Starts from last tick's answer, which three cycles alone wouldn't reach. A restored tank
    // starts cold, so it lands a fraction of a millimetre from where the original would have.
    const gridded = feeding.some((op) => op.feed > 0 && !exact.has(op));
    if (gridded) for (let v = 0; v < SOLVER_CYCLES; v++) this._vCycle(0);
    else L.p.fill(0);

    // Pressure is linear in the sources, so a too-fast edge slows everything by the same factor.
    let squeeze = 0;
    for (let i = 0; i < nx * ny; i++) squeeze = Math.max(squeeze, L.k[i] * L.p[i] - L.f[i]);
    const slow = squeeze * CELL * dt > EDGE_STEP ? EDGE_STEP / (squeeze * CELL * dt) : 1;
    const p = L.p;
    if (slow < 1) {
      for (let i = 0; i < nx * ny; i++) p[i] *= slow;
      for (const op of feeding) if (!exact.has(op)) op.feed *= slow;
    }

    // Velocity. At a film's last cell a central difference straddles the water and reads half
    // the true flow, which crushes outer rings, so it reads across the water face instead.
    const open = g.open;
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        const here = p[i];
        const left = west[i] >= 0 ? p[west[i]] : open ? 0 : here;
        const right = east[i] >= 0 ? p[east[i]] : open ? 0 : here;
        const down = south[i] >= 0 ? p[south[i]] : open ? 0 : here;
        const up = north[i] >= 0 ? p[north[i]] : open ? 0 : here;
        let gx = (right - left) / (2 * CELL);
        let gy = (up - down) / (2 * CELL);
        if (ink[i]) {
          // Eased by how watery the neighbour is, so the reading doesn't jump as an edge crosses a cell.
          const wet = (j) => Math.max(0, 1 - coverage[j] / EDGE_COVERAGE);
          const waterLeft = west[i] >= 0 ? wet(west[i]) : 0;
          const waterRight = east[i] >= 0 ? wet(east[i]) : 0;
          const waterDown = south[i] >= 0 ? wet(south[i]) : 0;
          const waterUp = north[i] >= 0 ? wet(north[i]) : 0;
          gx += (waterRight * (right - here) - waterLeft * (left - here)) / (2 * CELL);
          gy += (waterUp * (up - here) - waterDown * (down - here)) / (2 * CELL);
        }
        ux[i] = -gx;
        uy[i] = -gy;
      }
    }
    // Water beside ink moves with that ink, so an outline on the edge doesn't lag behind.
    ex.set(ux);
    ey.set(uy);
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        if (ink[i]) continue;
        let sx = 0;
        let sy = 0;
        let c = 0;
        for (const j of [west[i], east[i], south[i], north[i]]) {
          if (j >= 0 && ink[j]) { sx += ux[j]; sy += uy[j]; c++; }
        }
        if (c) { ex[i] = sx / c; ey[i] = sy / c; }
      }
    }

    // A light blur: the ink map is in whole cells, and without this its steps print on film edges.
    for (let pass = 0; pass < VELOCITY_BLUR; pass++) {
      for (const f of [ex, ey]) {
        const t = g.blur ??= new Float64Array(nx * ny);
        for (let y = 0; y < ny; y++) {
          for (let x = 0; x < nx; x++) {
            const i = y * nx + x;
            t[i] = (2 * f[i] + (west[i] >= 0 ? f[west[i]] : f[i]) + (east[i] >= 0 ? f[east[i]] : f[i])) / 4;
          }
        }
        for (let y = 0; y < ny; y++) {
          for (let x = 0; x < nx; x++) {
            const i = y * nx + x;
            f[i] = (2 * t[i] + (south[i] >= 0 ? t[south[i]] : t[i]) + (north[i] >= 0 ? t[north[i]] : t[i])) / 4;
          }
        }
      }
    }

    const off = g.offset;
    const sample = off ? (x, y, out) => {
      const fx = (x - x0) / CELL - 0.5;
      const fy = (y - y0) / CELL - 0.5;
      const i0 = Math.floor(fx);
      const j0 = Math.floor(fy);
      const a = fx - i0;
      const b = fy - j0;
      const p = tileCell(j0, i0, nx, ny, off), q = tileCell(j0, i0 + 1, nx, ny, off);
      const r = tileCell(j0 + 1, i0, nx, ny, off), t = tileCell(j0 + 1, i0 + 1, nx, ny, off);
      out[0] = (ex[p] * (1 - a) + ex[q] * a) * (1 - b) + (ex[r] * (1 - a) + ex[t] * a) * b;
      out[1] = (ey[p] * (1 - a) + ey[q] * a) * (1 - b) + (ey[r] * (1 - a) + ey[t] * a) * b;
    } : torus ? (x, y, out) => {
      const fx = (x - x0) / CELL - 0.5;
      const fy = (y - y0) / CELL - 0.5;
      const i0 = Math.floor(fx);
      const j0 = Math.floor(fy);
      const a = fx - i0;
      const b = fy - j0;
      const i = mod(i0, nx);
      const j = mod(j0, ny);
      const i1 = (i + 1) % nx;
      const j1 = (j + 1) % ny;
      out[0] = (ex[j * nx + i] * (1 - a) + ex[j * nx + i1] * a) * (1 - b) + (ex[j1 * nx + i] * (1 - a) + ex[j1 * nx + i1] * a) * b;
      out[1] = (ey[j * nx + i] * (1 - a) + ey[j * nx + i1] * a) * (1 - b) + (ey[j1 * nx + i] * (1 - a) + ey[j1 * nx + i1] * a) * b;
    } : (x, y, out) => {
      const fx = Math.max(0, Math.min(nx - 1.000001, (x - x0) / CELL - 0.5));
      const fy = Math.max(0, Math.min(ny - 1.000001, (y - y0) / CELL - 0.5));
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const a = fx - i;
      const b = fy - j;
      const c = j * nx + i;
      out[0] = (ex[c] * (1 - a) + ex[c + 1] * a) * (1 - b) + (ex[c + nx] * (1 - a) + ex[c + nx + 1] * a) * b;
      out[1] = (ey[c] * (1 - a) + ey[c + 1] * a) * (1 - b) + (ey[c + nx] * (1 - a) + ey[c + nx + 1] * a) * b;
    };

    // How far each drop's film is from having no water left decides whether it keeps spreading.
    const u = [0, 0];
    const live = [];
    for (const op of feeding) {
      // Its film has to reach water, and so does the drop itself: one landing on ink only gets its
      // plain size, however much water the film around it can still reach further off.
      const facing = Math.min(facingAt(this._cellAt(g, op.x, op.y)), this._ownEdgeFacing(op, g));
      const wanted = Math.max(0, Math.min(1, (facing - STOPS_FACING) / FULL_FACING));
      op.head += (wanted - op.head) * 0.25;
      if (op.feed > 0 && !exact.has(op)) {
        // On a grid a source reads a little velocity at its own centre and would push itself along.
        sample(op.x, op.y, u);
        op.driftX = u[0];
        op.driftY = u[1];
        live.push(op);
      }
    }
    const nearReach = (5 * sourceWidth) ** 2;
    const pinWidth = 2 * sourceWidth;
    const pinReach = (3 * pinWidth) ** 2;
    const exactOps = [...exact.entries()];
    this._map((x, y, out) => {
      for (const [op, reach] of exactOps) {
        const dx = torus ? wrapX(x - op.x, y - op.y, W, H, off) : x - op.x;
        const dy = torus ? wrapY(x - op.x, y - op.y, W, H, off) : y - op.y;
        const r2 = dx * dx + dy * dy;
        if (r2 > reach * reach || r2 < 1e-12) continue;
        const a = Math.sqrt(1 + (op.feed * dt) / Math.PI / r2);
        out[0] = (torus ? x - dx : op.x) + dx * a;
        out[1] = (torus ? y - dy : op.y) + dy * a;
        return;
      }
      if (!gridded) { out[0] = x; out[1] = y; return; }
      sample(x, y, u);
      sample(x + (u[0] * dt) / 2, y + (u[1] * dt) / 2, u);
      let nx2 = x + u[0] * dt;
      let ny2 = y + u[1] * dt;
      for (const op of live) {
        const dx = torus ? wrapX(x - op.x, y - op.y, W, H, off) : x - op.x;
        const dy = torus ? wrapY(x - op.x, y - op.y, W, H, off) : y - op.y;
        const r2 = dx * dx + dy * dy;
        if (r2 < pinReach) {
          const w = Math.exp(-r2 / (2 * pinWidth * pinWidth)) * dt;
          nx2 -= op.driftX * w;
          ny2 -= op.driftY * w;
        }
        if (r2 > nearReach || r2 < 1e-12) continue;
        const a = Math.sqrt(1 + ((op.feed * dt) / Math.PI) * Math.exp(-r2 / (2 * sourceWidth * sourceWidth)) / r2) - 1;
        nx2 += dx * a;
        ny2 += dy * a;
      }
      out[0] = nx2;
      out[1] = ny2;
    }, { slowNearWalls: false });

    for (const op of feeding) {
      if (!op.poly && op.feed > 0) {
        const r = Math.max(1, Math.sqrt((op.feed * dt) / Math.PI));
        const n = 48;
        const xy = new Float64Array(n * 4);
        for (let i = 0; i < n; i++) {
          xy[i * 2] = op.x + r * Math.cos((i / n) * 2 * Math.PI);
          xy[i * 2 + 1] = op.y + r * Math.sin((i / n) * 2 * Math.PI);
        }
        op.poly = { xy, n, color: op.color, shimmer: op.shimmer };
        if (op.pressure !== undefined) op.poly.gall = op.pressure;
        this.polys.push(op.poly);
        if (op.cut) this._joinCut(op);
      }
      if (op.poly) op.area = polygonArea(op.poly);
    }
  }

  // Under everything, so it only ever shows over bare bath.
  _beforeInk(ctx) {
    ctx.lineJoin = 'round';
    for (const poly of this.polys) {
      const { xy, n, color, group, cell } = poly;
      if (group || cell || isTranslucent(color)) continue; // a broom cell keeps its seam of bare bath
      ctx.lineWidth = underpaintWidth(xy, 0, n, CLOSE_GAPS * 2);
      ctx.beginPath();
      for (const [sx, sy] of this.tileShifts([poly])) {
        ctx.moveTo(xy[0] + sx, xy[1] + sy);
        for (let i = 1; i < n; i++) ctx.lineTo(xy[i * 2] + sx, xy[i * 2 + 1] + sy);
        ctx.closePath();
      }
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  }

  _svgBeforeInk() {
    return this.polys.filter(({ group, color, cell }) => !group && !cell && !isTranslucent(color)).map((poly) => {
      const { xy, n, color } = poly;
      let d = '';
      for (const [sx, sy] of this.tileShifts([poly])) {
        const pts = [];
        for (let i = 0; i < n; i++) pts.push(`${(xy[i * 2] + sx).toFixed(2)} ${(-(xy[i * 2 + 1] + sy)).toFixed(2)}`);
        d += `M${pts.join('L')}Z`;
      }
      return `<path fill="none" stroke="${color}" stroke-width="${underpaintWidth(xy, 0, n, CLOSE_GAPS * 2).toFixed(3)}" stroke-linejoin="round" d="${d}"/>`;
    }).join('');
  }
}
