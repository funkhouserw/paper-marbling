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
export function makeTileField(W, H) {
  const nx = W >= H ? CELLS : Math.round((CELLS * W) / H);
  const ny = W >= H ? Math.round((CELLS * H) / W) : CELLS;
  const hx = W / nx;
  const hy = H / ny;
  const sigma = 2 * Math.max(hx, hy);
  const A = W * H;
  const re = new Float64Array(nx * ny), im = new Float64Array(nx * ny);
  const parts = [];
  for (const axis of [0, 1]) {
    for (let l = 0; l < ny; l++) {
      const ky = l < ny / 2 ? l : l - ny;
      const ky2 = (2 * Math.PI * ky) / H;
      for (let k = 0; k < nx; k++) {
        const kx = k < nx / 2 ? k : k - nx;
        const kx2 = (2 * Math.PI * kx) / W;
        const k2 = kx2 * kx2 + ky2 * ky2;
        const i = l * nx + k;
        if (k2 === 0) { re[i] = 0; im[i] = 0; continue; }
        // c_k = -e^{-sigma^2 k^2 / 2} / (A k^2), times i kappa for the gradient, times (-1)^(kx+ky)
        // because the grid starts at the cell's corner rather than its centre.
        const c = (-Math.exp((-sigma * sigma * k2) / 2) / (A * k2)) * ((kx + ky) % 2 ? -1 : 1);
        const kappa = axis === 0 ? kx2 : ky2;
        re[i] = 0;
        im[i] = c * kappa;
      }
    }
    fft2(re, im, nx, ny, true);
    parts.push(Float64Array.from(re));
  }
  // Both edges, so the table is (nx + 1) x (ny + 1).
  const cx = new Float64Array((nx + 1) * (ny + 1));
  const cy = new Float64Array((nx + 1) * (ny + 1));
  for (let l = 0; l <= ny; l++) {
    const y = -H / 2 + l * hy;
    for (let k = 0; k <= nx; k++) {
      const x = -W / 2 + k * hx;
      const r2 = x * x + y * y;
      const plane = r2 > 0 ? (1 - Math.exp(-r2 / (2 * sigma * sigma))) / (2 * Math.PI * r2) : 0;
      const g = (l % ny) * nx + (k % nx);
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
  return { W, H, nx, ny, correction };
}

// An offset wrapped to the nearest image, into [-W/2, W/2) x [-H/2, H/2).
export const wrap = (d, L) => d - L * Math.floor(d / L + 0.5);

// Drop growth on the torus: each source [cx, cy, s] pushes as in the plane from its nearest
// image, plus the torus correction, which also contracts everything by the area that grew.
export function pushApartTiled(marble, sources) {
  const { width: W, height: H } = marble;
  const field = marble._tileField ??= makeTileField(W, H);
  const c = [0, 0];
  marble._map((x0, y0, out) => {
    let x = x0;
    let y = y0;
    for (const [sx, sy, s] of sources) {
      const dx = wrap(x0 - sx, W);
      const dy = wrap(y0 - sy, H);
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
  if (marble._swirlGrid?.W === W && marble._swirlGrid.H === H) return marble._swirlGrid;
  const nx = W >= H ? SWIRL_CELLS : Math.round((SWIRL_CELLS * W) / H);
  const ny = W >= H ? Math.round((SWIRL_CELLS * H) / W) : SWIRL_CELLS;
  const size = nx * ny;
  const kx = new Float64Array(nx), ky = new Float64Array(ny);
  for (let k = 0; k < nx; k++) kx[k] = (2 * Math.PI * (k < nx / 2 ? k : k - nx)) / W;
  for (let l = 0; l < ny; l++) ky[l] = (2 * Math.PI * (l < ny / 2 ? l : l - ny)) / H;
  marble._swirlGrid = { W, H, nx, ny, hx: W / nx, hy: H / ny, kx, ky,
    re: new Float64Array(size), im: new Float64Array(size), ux: new Float64Array(size), uy: new Float64Array(size) };
  return marble._swirlGrid;
}

// theta(rho) returns [angle over this tick, its slope d angle / d rho] for a distance rho in mm.
export function swirlTiled(marble, cx, cy, theta) {
  const g = swirlGrid(marble);
  const { W, H, nx, ny, hx, hy, kx, ky, re, im, ux, uy } = g;
  const out = [0, 0];
  // Vorticity of the swirl about the nearest image of its centre, as a displacement over the tick.
  let mean = 0;
  for (let l = 0; l < ny; l++) {
    const dy = wrap(-H / 2 + (l + 0.5) * hy - cy, H);
    for (let k = 0; k < nx; k++) {
      const dx = wrap(-W / 2 + (k + 0.5) * hx - cx, W);
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
