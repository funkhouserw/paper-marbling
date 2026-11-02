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
        const a = Math.sqrt(1 + s / d2) - 1;
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
