// Fast sine transforms for the flow solver. A plan for length n gives the two transforms Wake
// needs, each computed with an n-point complex FFT (Makhoul 1980) instead of an n x n table:
//   forward:  X[k] = sum_j x[j] sin(pi (k+1) (j+1/2) / n)              (DST-II)
//   inverse:  x[j] = (1/n) sum_k c[k] X[k] sin(pi (k+1) (j+1/2) / n),  c = 2 except c[n-1] = 1
// which are inverses of each other. The FFT is a mixed-radix Stockham, so n can be any length,
// at a cost of about n times the sum of n's prime factors.

const factorsOf = (n) => {
  const out = [];
  for (let p = 2; p * p <= n; p++) while (n % p === 0) { out.push(p); n /= p; }
  if (n > 1) out.push(n);
  return out;
};

// An n-point FFT, e^{-2 pi i jk / n}, from (re, im) into (outRe, outIm). Both pairs are scratch
// after the call: the result is in whichever pair the last stage wrote, which it returns.
export function fftPlan(n) {
  const cos = new Float64Array(n);
  const sin = new Float64Array(n);
  for (let i = 0; i < n; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = -Math.sin((2 * Math.PI * i) / n); }
  // Stages run from the last factor up, which keeps each stage's inputs contiguous.
  const stages = factorsOf(n).reverse();
  const tr = new Float64Array(16);
  const ti = new Float64Array(16);
  const run = (aRe, aIm, bRe, bIm) => {
    let inRe = aRe, inIm = aIm, outRe = bRe, outIm = bIm;
    let L = 1;
    for (const p of stages) {
      const C = n / L;
      const Cp = C / p;
      const step = n / (p * L); // twiddle index per unit of q * k
      const pstep = n / p;
      const tRe = p > tr.length ? new Float64Array(p) : tr;
      const tIm = p > ti.length ? new Float64Array(p) : ti;
      for (let g = 0; g < Cp; g++) {
        const outBase = g * p * L;
        for (let k = 0; k < L; k++) {
          if (p === 2) {
            const i0 = g * L + k;
            const i1 = (g + Cp) * L + k;
            const wi = k * step;
            const c = cos[wi], s = sin[wi];
            const yr = inRe[i1] * c - inIm[i1] * s;
            const yi = inRe[i1] * s + inIm[i1] * c;
            outRe[outBase + k] = inRe[i0] + yr;
            outIm[outBase + k] = inIm[i0] + yi;
            outRe[outBase + k + L] = inRe[i0] - yr;
            outIm[outBase + k + L] = inIm[i0] - yi;
            continue;
          }
          for (let q = 0; q < p; q++) {
            const i = (g + Cp * q) * L + k;
            const wi = (q * k * step) % n;
            const c = cos[wi], s = sin[wi];
            tRe[q] = inRe[i] * c - inIm[i] * s;
            tIm[q] = inRe[i] * s + inIm[i] * c;
          }
          for (let r = 0; r < p; r++) {
            let sr = 0, si = 0;
            for (let q = 0; q < p; q++) {
              const wi = (q * r * pstep) % n;
              const c = cos[wi], s = sin[wi];
              sr += tRe[q] * c - tIm[q] * s;
              si += tRe[q] * s + tIm[q] * c;
            }
            outRe[outBase + k + r * L] = sr;
            outIm[outBase + k + r * L] = si;
          }
        }
      }
      L *= p;
      [inRe, inIm, outRe, outIm] = [outRe, outIm, inRe, inIm];
    }
    return inRe === aRe ? 0 : 1;
  };
  return { run, stages: stages.length };
}

export function sinePlan(n) {
  const fft = fftPlan(n);
  const aRe = new Float64Array(n), aIm = new Float64Array(n), bRe = new Float64Array(n), bIm = new Float64Array(n);
  const half = Math.ceil(n / 2);
  // e^{-i pi k / (2n)}, the twiddle that turns an n-point FFT into a cosine transform.
  const twRe = new Float64Array(n), twIm = new Float64Array(n);
  for (let k = 0; k < n; k++) { twRe[k] = Math.cos((Math.PI * k) / (2 * n)); twIm[k] = -Math.sin((Math.PI * k) / (2 * n)); }
  const result = (which) => (which === 0 ? [aRe, aIm] : [bRe, bIm]);

  // The sine transform of x is the cosine transform of (-1)^j x[j], read backwards.
  const forward = (src, srcOff, srcStride, dst, dstOff, dstStride) => {
    for (let m = 0; m < half; m++) {
      aRe[m] = src[srcOff + 2 * m * srcStride];
      aIm[m] = 0;
    }
    for (let m = 0; 2 * m + 1 < n; m++) {
      aRe[n - 1 - m] = -src[srcOff + (2 * m + 1) * srcStride];
      aIm[n - 1 - m] = 0;
    }
    const [re, im] = result(fft.run(aRe, aIm, bRe, bIm));
    for (let k = 0; k < n; k++) dst[dstOff + (n - 1 - k) * dstStride] = re[k] * twRe[k] - im[k] * twIm[k];
  };

  const inverse = (src, srcOff, srcStride, dst, dstOff, dstStride) => {
    // c[0] = X[n-1] / 2 and c[k] = X[n-1-k], then a cosine transform of the third kind.
    const c0 = src[srcOff + (n - 1) * srcStride] / 2;
    aRe[0] = c0;
    aIm[0] = 0;
    for (let k = 1; k < n; k++) {
      const ck = src[srcOff + (n - 1 - k) * srcStride];
      aRe[k] = ck * twRe[k];
      aIm[k] = ck * twIm[k];
    }
    const [re] = result(fft.run(aRe, aIm, bRe, bIm));
    const scale = 2 / n;
    for (let m = 0; m < half; m++) dst[dstOff + 2 * m * dstStride] = scale * re[m];
    for (let m = 0; 2 * m + 1 < n; m++) dst[dstOff + (2 * m + 1) * dstStride] = -scale * re[n - 1 - m];
  };

  return { n, forward, inverse };
}

// A 2D FFT of (re, im) laid out row by row, in place, forward (e^{-2 pi i jk/n}) or inverse
// (e^{+2 pi i jk/n}, without the 1/n). Plans are cached by length.
const plans = new Map();
const planFor = (n) => { let p = plans.get(n); if (!p) { p = fftPlan(n); plans.set(n, p); } return p; };
export function fft2(re, im, nx, ny, inverse = false) {
  const aRe = new Float64Array(Math.max(nx, ny)), aIm = new Float64Array(Math.max(nx, ny));
  const bRe = new Float64Array(Math.max(nx, ny)), bIm = new Float64Array(Math.max(nx, ny));
  const sign = inverse ? -1 : 1;
  const line = (plan, n, get, set) => {
    for (let i = 0; i < n; i++) { aRe[i] = get(i, 0); aIm[i] = sign * get(i, 1); }
    const which = plan.run(aRe, aIm, bRe, bIm);
    const [oRe, oIm] = which === 0 ? [aRe, aIm] : [bRe, bIm];
    for (let i = 0; i < n; i++) set(i, oRe[i], sign * oIm[i]);
  };
  const px = planFor(nx), py = planFor(ny);
  for (let y = 0; y < ny; y++) line(px, nx, (i, c) => (c ? im : re)[y * nx + i], (i, r, m) => { re[y * nx + i] = r; im[y * nx + i] = m; });
  for (let x = 0; x < nx; x++) line(py, ny, (i, c) => (c ? im : re)[i * nx + x], (i, r, m) => { re[i * nx + x] = r; im[i * nx + x] = m; });
}
