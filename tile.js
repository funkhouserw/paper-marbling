// Field maths for a repeating tank: the surface is a torus, so every push, drag and swirl must
// repeat across the seams, and a drop that grows at one spot has to be balanced by a contraction
// everywhere else, since a torus has only so much surface.
//
// A drop's push in the open plane moves a point at distance r to sqrt(r^2 + s), which is the
// flow of pi s grad G with G = ln r / 2 pi, the Green's function of the plane. On the torus the
// Green's function solves lap G = delta - 1/A instead, and the difference between the two is a
// smooth field, tabulated once per tank by FFT and added to the plane's exact push.
import { fft2 } from './dst.js';

const CELLS = 128; // grid points across the wider side of the correction table

// The smooth part of the torus's Green's function: grad G_torus - grad G_plane, with both delta
// functions blurred by the same Gaussian so neither side is singular. Sampled on the cell
// [-W/2, W/2] x [-H/2, H/2] including both edges, since the plane's part jumps across the seam.
export function makeTileField(W, H, offset = null) {
  const halves = offset ? 2 : 1;
  let nx = W >= H ? CELLS : Math.round((CELLS * W) / H);
  let ny = W >= H ? Math.round((CELLS * H) / W) : CELLS;
  if (offset) { nx = 2 * Math.round(nx / 2); ny = 2 * Math.round(ny / 2); }
  const [wide, tall] = doubled(offset);
  const fx = nx * wide; // the grid of the rectangle that repeats normally
  const fy = ny * tall;
  const hx = W / nx;
  const hy = H / ny;
  const sigma = 2 * Math.max(hx, hy);
  const A = W * H;
  const re = new Float64Array(fx * fy), im = new Float64Array(fx * fy);
  const parts = [];
  for (const axis of [0, 1]) {
    for (let l = 0; l < fy; l++) {
      const ky = l < fy / 2 ? l : l - fy;
      const ky2 = (2 * Math.PI * ky) / (H * tall);
      for (let k = 0; k < fx; k++) {
        const kx = k < fx / 2 ? k : k - fx;
        const kx2 = (2 * Math.PI * kx) / (W * wide);
        const k2 = kx2 * kx2 + ky2 * ky2;
        const i = l * fx + k;
        // An offset's half shift leaves only the waves with an even kx + ky.
        if (k2 === 0 || (halves === 2 && (kx + ky) % 2)) { re[i] = 0; im[i] = 0; continue; }
        // c_k = -e^{-sigma^2 k^2 / 2} / (A k^2), times i kappa for the gradient, times (-1)^(kx+ky)
        // because the grid starts at the cell's corner rather than its centre.
        const c = (-Math.exp((-sigma * sigma * k2) / 2) / (A * k2)) * ((kx + ky) % 2 ? -1 : 1);
        const kappa = axis === 0 ? kx2 : ky2;
        re[i] = 0;
        im[i] = c * kappa;
      }
    }
    fft2(re, im, fx, fy, true);
    parts.push(Float64Array.from(re));
  }
  // Both edges, so the table is (nx + 1) x (ny + 1). It covers one tile, centred in the big rectangle.
  const cx = new Float64Array((nx + 1) * (ny + 1));
  const cy = new Float64Array((nx + 1) * (ny + 1));
  const skipX = ((wide - 1) * nx) / 2;
  const skipY = ((tall - 1) * ny) / 2;
  for (let l = 0; l <= ny; l++) {
    const y = -H / 2 + l * hy;
    for (let k = 0; k <= nx; k++) {
      const x = -W / 2 + k * hx;
      const r2 = x * x + y * y;
      const plane = r2 > 0 ? (1 - Math.exp(-r2 / (2 * sigma * sigma))) / (2 * Math.PI * r2) : 0;
      const g = ((l + skipY) % fy) * fx + ((k + skipX) % fx);
      cx[l * (nx + 1) + k] = parts[0][g] - x * plane;
      cy[l * (nx + 1) + k] = parts[1][g] - y * plane;
    }
  }
  // The correction at an offset already wrapped into the cell, by bilinear interpolation.
  const correction = (dx, dy, out) => {
    const fx = Math.max(0, Math.min(nx - 1e-9, (dx + W / 2) / hx));
    const fy = Math.max(0, Math.min(ny - 1e-9, (dy + H / 2) / hy));
    const i = Math.floor(fx), j = Math.floor(fy);
    const a = fx - i, b = fy - j;
    const k = j * (nx + 1) + i;
    out[0] = (cx[k] * (1 - a) + cx[k + 1] * a) * (1 - b) + (cx[k + nx + 1] * (1 - a) + cx[k + nx + 2] * a) * b;
    out[1] = (cy[k] * (1 - a) + cy[k + 1] * a) * (1 - b) + (cy[k + nx + 1] * (1 - a) + cy[k + nx + 2] * a) * b;
    return out;
  };
  return { W, H, offset, nx, ny, correction };
}

// An offset wrapped to the nearest image, into [-W/2, W/2) x [-H/2, H/2).
export const wrap = (d, L) => d - L * Math.floor(d / L + 0.5);

// An offset repeat joins the edges with a half-tile shift. Brick: going up one tile also moves half a
// tile across, so (x, y + H) is (x + W/2, y). Half-drop: going across one tile also moves half a tile
// up. That's still a torus, and two tiles together make an ordinary rectangle that repeats normally,
// which is what the FFT solvers run on. Without an offset all of this is plain wrapping.
export const wrapX = (dx, dy, W, H, offset) => (offset === 'brick' ? wrap(dx - Math.floor(dy / H + 0.5) * (W / 2), W) : wrap(dx, W));
export const wrapY = (dx, dy, W, H, offset) => (offset === 'halfDrop' ? wrap(dy - Math.floor(dx / W + 0.5) * (H / 2), H) : wrap(dy, H));

// The direction nearest to an angle in which a straight line on this tank comes back onto itself,
// and how far it goes before it does. Other directions never close, so tines running that way come
// back in on new rows and pile up. Short laps are preferred, since a long one wanders over the tank.
// gap is how far apart the line's own passes lie. Angles are in degrees.
export function closedDirection(angle, W, H, offset = null) {
  const a = offset === 'halfDrop' ? [0, H] : [W, 0];
  const b = offset === 'brick' ? [W / 2, H] : offset === 'halfDrop' ? [W, H / 2] : [0, H];
  const gcd = (p, q) => (q ? gcd(q, p % q) : p);
  const wanted = ((angle % 360) + 360) % 360;
  let best = null;
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      if (gcd(Math.abs(i), Math.abs(j)) !== 1) continue;
      const x = i * a[0] + j * b[0];
      const y = i * a[1] + j * b[1];
      const at = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
      const off = Math.min(Math.abs(at - wanted), 360 - Math.abs(at - wanted));
      const score = off + 1.5 * (Math.abs(i) + Math.abs(j) - 1);
      if (!best || score < best.score) best = { score, angle: at, x, y, length: Math.hypot(x, y) };
    }
  }
  return { angle: best.angle, x: best.x, y: best.y, length: best.length, gap: (W * H) / best.length };
}

// The rectangle that repeats normally, as multiples of the tile.
export const doubled = (offset) => (offset === 'brick' ? [1, 2] : offset === 'halfDrop' ? [2, 1] : [1, 1]);

// A cell of an nx by ny grid over the tile, from a row and column that may be outside it.
export function tileCell(row, col, nx, ny, offset) {
  if (offset === 'brick') col += Math.floor(row / ny) * (nx >> 1);
  else if (offset === 'halfDrop') row += Math.floor(col / nx) * (ny >> 1);
  return (((row % ny) + ny) % ny) * nx + ((col % nx) + nx) % nx;
}

// Every shift between copies of the tile that lands in the box.
export function latticeShifts(x0, x1, y0, y1, W, H, offset) {
  const out = [];
  if (offset === 'brick') {
    for (let j = Math.ceil(y0 / H); j <= Math.floor(y1 / H); j++) {
      const o = (j * W) / 2;
      for (let i = Math.ceil((x0 - o) / W); i <= Math.floor((x1 - o) / W); i++) out.push([i * W + o, j * H]);
    }
  } else if (offset === 'halfDrop') {
    for (let i = Math.ceil(x0 / W); i <= Math.floor(x1 / W); i++) {
      const o = (i * H) / 2;
      for (let j = Math.ceil((y0 - o) / H); j <= Math.floor((y1 - o) / H); j++) out.push([i * W, j * H + o]);
    }
  } else {
    for (let i = Math.ceil(x0 / W); i <= Math.floor(x1 / W); i++) {
      for (let j = Math.ceil(y0 / H); j <= Math.floor(y1 / H); j++) out.push([i * W, j * H]);
    }
  }
  return out;
}

// Drop growth on the torus: each source [cx, cy, s] pushes as in the plane from its nearest
// image, plus the torus correction, which also contracts everything by the area that grew.
export function pushApartTiled(marble, sources) {
  const { width: W, height: H } = marble;
  const offset = marble.tileOffset ?? null;
  if (marble._tileField?.offset !== offset) marble._tileField = null;
  const field = marble._tileField ??= makeTileField(W, H, offset);
  const c = [0, 0];
  marble._map((x0, y0, out) => {
    let x = x0;
    let y = y0;
    for (const [sx, sy, s] of sources) {
      const dx = wrapX(x0 - sx, y0 - sy, W, H, offset);
      const dy = wrapY(x0 - sx, y0 - sy, W, H, offset);
      const d2 = dx * dx + dy * dy;
      if (d2 >= 1e-12) {
        // An eraser's s is negative, and takes whatever is inside it down to its centre.
        const a = d2 + s > 0 ? Math.sqrt(1 + s / d2) - 1 : -1;
        x += dx * a;
        y += dy * a;
      }
      field.correction(dx, dy, c);
      x += Math.PI * s * c[0];
      y += Math.PI * s * c[1];
    }
    out[0] = x;
    out[1] = y;
  }, { slowNearWalls: false, clamp: false });
}

// Swirls on the torus. Stir, vortex and wriggle each turn the sheet about a centre by an angle
// that depends on the distance, theta(rho), which in the plane is applied as an exact rotation.
// A torus has no room for a rotation that reaches its seams, so instead the swirl's vorticity,
// 2 theta + rho theta', is laid on a grid from the nearest image of the centre, its mean removed
// (a torus can hold no net vorticity), and a periodic stream function solved by FFT. The ink then
// moves along that flow, which repeats across the seams and preserves area.
const SWIRL_CELLS = 192;

function swirlGrid(marble) {
  const { width: W, height: H } = marble;
  const offset = marble.tileOffset ?? null;
  if (marble._swirlGrid?.W === W && marble._swirlGrid.H === H && marble._swirlGrid.offset === offset) return marble._swirlGrid;
  const [wide, tall] = doubled(offset);
  const nx = (W >= H ? SWIRL_CELLS : Math.round((SWIRL_CELLS * W) / H)) * wide;
  const ny = (W >= H ? Math.round((SWIRL_CELLS * H) / W) : SWIRL_CELLS) * tall;
  const size = nx * ny;
  const kx = new Float64Array(nx), ky = new Float64Array(ny);
  for (let k = 0; k < nx; k++) kx[k] = (2 * Math.PI * (k < nx / 2 ? k : k - nx)) / (W * wide);
  for (let l = 0; l < ny; l++) ky[l] = (2 * Math.PI * (l < ny / 2 ? l : l - ny)) / (H * tall);
  marble._swirlGrid = { W, H, offset, nx, ny, hx: (W * wide) / nx, hy: (H * tall) / ny, kx, ky,
    re: new Float64Array(size), im: new Float64Array(size), ux: new Float64Array(size), uy: new Float64Array(size) };
  return marble._swirlGrid;
}

// theta(rho) returns [angle over this tick, its slope d angle / d rho] for a distance rho in mm.
export function swirlTiled(marble, cx, cy, theta) {
  const g = swirlGrid(marble);
  const { W, H, offset, nx, ny, hx, hy, kx, ky, re, im, ux, uy } = g;
  const out = [0, 0];
  // Vorticity of the swirl about the nearest image of its centre, as a displacement over the tick.
  let mean = 0;
  for (let l = 0; l < ny; l++) {
    const py = -H / 2 + (l + 0.5) * hy - cy;
    for (let k = 0; k < nx; k++) {
      const px = -W / 2 + (k + 0.5) * hx - cx;
      const dx = wrapX(px, py, W, H, offset);
      const dy = wrapY(px, py, W, H, offset);
      const rho = Math.hypot(dx, dy);
      const [t, slope] = theta(rho, out);
      const w = 2 * t + rho * slope;
      re[l * nx + k] = w;
      mean += w;
    }
  }
  mean /= nx * ny;
  for (let i = 0; i < nx * ny; i++) { re[i] -= mean; im[i] = 0; }
  fft2(re, im, nx, ny);
  // psi = -w / k^2, and u = (d psi / dy, -d psi / dx), with the 1 / (nx ny) of the round trip.
  const norm = 1 / (nx * ny);
  const uRe = ux, uIm = uy; // scratch for the x velocity's spectrum
  const vRe = new Float64Array(nx * ny), vIm = new Float64Array(nx * ny);
  for (let l = 0; l < ny; l++) {
    for (let k = 0; k < nx; k++) {
      const i = l * nx + k;
      const k2 = kx[k] * kx[k] + ky[l] * ky[l];
      if (k2 === 0) { uRe[i] = uIm[i] = vRe[i] = vIm[i] = 0; continue; }
      const pr = (-re[i] / k2) * norm;
      const pi = (-im[i] / k2) * norm;
      // u = i ky psi, v = -i kx psi
      uRe[i] = -ky[l] * pi; uIm[i] = ky[l] * pr;
      vRe[i] = kx[k] * pi; vIm[i] = -kx[k] * pr;
    }
  }
  fft2(uRe, uIm, nx, ny, true);
  fft2(vRe, vIm, nx, ny, true);
  // uRe now holds the x displacement grid and vRe the y, both periodic.
  ux.set(uRe);
  uy.set(vRe);
  const sample = (arr, x, y) => {
    const fx = (x + W / 2) / hx - 0.5;
    const fy = (y + H / 2) / hy - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy);
    const a = fx - i0, b = fy - j0;
    const i = ((i0 % nx) + nx) % nx, j = ((j0 % ny) + ny) % ny;
    const i1 = (i + 1) % nx, j1 = (j + 1) % ny;
    return (arr[j * nx + i] * (1 - a) + arr[j * nx + i1] * a) * (1 - b) + (arr[j1 * nx + i] * (1 - a) + arr[j1 * nx + i1] * a) * b;
  };
  marble._map((x, y, o) => {
    const mx = x + sample(ux, x, y) / 2;
    const my = y + sample(uy, x, y) / 2;
    o[0] = x + sample(ux, mx, my);
    o[1] = y + sample(uy, mx, my);
  }, { slowNearWalls: false, clamp: false });
}
