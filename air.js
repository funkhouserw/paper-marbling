// A breath of air over the bath: a smooth, random, area-preserving flow. Its stream function is
// gradient noise (Perlin 2002, with the quintic fade so the flow is smooth too), and the flow is
// the stream function's curl, which can't compress or stretch the ink overall (Bridson 2007).
// The same seed always gives the same breath, so scripts and undo replay exactly.

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

// Gradient noise in -1 to 1 with a permutation shuffled by the seed.
function gradientNoise(seed) {
  const perm = new Uint8Array(512);
  const base = Array.from({ length: 256 }, (_, i) => i);
  let s = (seed >>> 0) || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
  const gx = new Float64Array(256);
  const gy = new Float64Array(256);
  for (let i = 0; i < 256; i++) { const a = (i / 256) * 2 * Math.PI; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const dot = (h, x, y) => gx[h] * x + gy[h] * y;
  // With a period [px, py] in lattice cells, the noise repeats every px cells across and py down.
  return (x, y, period = null) => {
    let X = Math.floor(x);
    let Y = Math.floor(y);
    const fx = x - X;
    const fy = y - Y;
    const u = fade(fx);
    const v = fade(fy);
    let X1 = X + 1;
    let Y1 = Y + 1;
    if (period) {
      // Lattice points wrap, so the noise repeats every period cells.
      const [px, py] = period;
      X = ((X % px) + px) % px;
      Y = ((Y % py) + py) % py;
      X1 = (X + 1) % px;
      Y1 = (Y + 1) % py;
    }
    const a = perm[X & 255];
    const b = perm[X1 & 255];
    const h00 = perm[a + (Y & 255)];
    const h10 = perm[b + (Y & 255)];
    const h01 = perm[a + (Y1 & 255)];
    const h11 = perm[b + (Y1 & 255)];
    return lerp(lerp(dot(h00, fx, fy), dot(h10, fx - 1, fy), u), lerp(dot(h01, fx, fy - 1), dot(h11, fx - 1, fy - 1), u), v);
  };
}

// The peak slope of one octave of this noise, measured over many seeds and points, so that
// `speed` is the breath's typical top speed rather than an abstract factor.
const PEAK_SLOPE = 2.0;

// A velocity field in mm/s: velocity(x, y, out) for x, y in mm. `scale` is the size of its
// eddies in mm, `speed` its typical top speed, and each extra octave adds eddies half the size.
// `scale` may be [sx, sy] for eddies stretched to fit a tile, with `period` the number of
// lattice cells each way after which the noise repeats; each octave then repeats twice as often.
export function makeAir({ seed = 1, scale = 200, speed = 50, octaves = 2, period = null } = {}) {
  const [sx, sy] = Array.isArray(scale) ? scale : [scale, scale];
  const noise = gradientNoise(seed);
  const periods = period && Array.from({ length: octaves }, (_, o) => [period[0] << o, period[1] << o]);
  const amp = (speed * Math.sqrt(sx * sy)) / PEAK_SLOPE;
  const eps = 0.25; // mm. The slope of the stream function, taken across a short step.
  const psi = (x, y) => {
    let sum = 0;
    let a = amp;
    let kx = 1 / sx;
    let ky = 1 / sy;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += a * noise(x * kx + o * 37.1, y * ky + o * 91.7, periods && periods[o]);
      norm += o === 0 ? 1 : 0.5 ** o;
      a *= 0.5;
      kx *= 2;
      ky *= 2;
    }
    return sum / norm;
  };
  const velocity = (x, y, out) => {
    out[0] = (psi(x, y + eps) - psi(x, y - eps)) / (2 * eps);
    out[1] = -(psi(x + eps, y) - psi(x - eps, y)) / (2 * eps);
    return out;
  };
  return { velocity, psi };
}
