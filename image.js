// Turns a picture into cells of flat ink, ready for marble.print(): one print per connected patch
// of one colour. Pure, so node can test it; decoding the file and scaling it down happen in the
// browser (see imageFromFile), and the pixels never leave the page.
//
// The steps: an edge-preserving blur, k-means in OKLab to at most `colours` inks, a 3×3 majority
// filter, connected patches (4-connected), small patches merged into the neighbour they share most
// border with, then the borders between patches traced along pixel edges. Each border between two
// patches is simplified once and shared by both, so the cells meet exactly: no gaps, no overlaps.

// Detail 1–7: working size, smallest patch, simplify tolerance, and the caps. 6 and 7 were set from
// runs on photos (row 79): past 640 px tracing takes seconds and Classic's 60k budget is crossed
// after one rake.
const DETAIL = {
  1: { side: 128, minArea: 28, tol: 0.9, cells: 80, points: 3000 },
  2: { side: 192, minArea: 22, tol: 0.75, cells: 140, points: 5500 },
  3: { side: 256, minArea: 16, tol: 0.6, cells: 200, points: 8000 },
  4: { side: 320, minArea: 12, tol: 0.55, cells: 350, points: 11000 },
  5: { side: 384, minArea: 8, tol: 0.5, cells: 500, points: 14000 },
  6: { side: 512, minArea: 6, tol: 0.5, cells: 900, points: 24000 },
  7: { side: 640, minArea: 5, tol: 0.45, cells: 1400, points: 32000 },
};
export const MOST_DETAIL = 7;
export const MOST_COLOURS = 16;
export const MAX_TOL = 1.5;
const OUTLIER = 0.08; // OKLab distance from every ink past which a group of pixels is offered its own
const JOIN = 0.05; // OKLab distance under which two clusters are the same ink (about 2× a just-noticeable difference)

export function detailSettings(detail = 3) {
  return DETAIL[Math.max(1, Math.min(MOST_DETAIL, Math.round(detail)))];
}

// Working size for a w×h picture at this detail: the long side becomes `side` (never enlarged).
export function workingSize(w, h, detail = 3) {
  const { side } = detailSettings(detail);
  const k = Math.min(1, side / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

// ---- Colour -------------------------------------------------------------------

const toLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLinear = (c) => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));

function oklab(r, g, b) {
  r = toLinear(r); g = toLinear(g); b = toLinear(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

export function oklabToHex([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return `#${rgb.map((c) => fromLinear(c).toString(16).padStart(2, '0')).join('')}`;
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// OKLab per pixel (3 floats) and which pixels count as ink (alpha ≥ 128).
function toLab({ data, w, h }) {
  const lab = new Float32Array(w * h * 3);
  const opaque = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const [L, A, B] = oklab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    lab[i * 3] = L; lab[i * 3 + 1] = A; lab[i * 3 + 2] = B;
    opaque[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
  }
  return { lab, opaque };
}

// A 5×5 bilateral blur in OKLab: smooths photo noise but keeps edges, so noise doesn't become cells.
function smooth(lab, opaque, w, h, passes = 2) {
  const SS = 2 * 1.5 * 1.5, SR = 2 * 0.06 * 0.06;
  let src = lab;
  for (let pass = 0; pass < passes; pass++) {
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!opaque[i]) continue;
        const L0 = src[i * 3], A0 = src[i * 3 + 1], B0 = src[i * 3 + 2];
        let sw = 0, sL = 0, sA = 0, sB = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            if (!opaque[j]) continue;
            const dL = src[j * 3] - L0, dA = src[j * 3 + 1] - A0, dB = src[j * 3 + 2] - B0;
            const wt = Math.exp(-(dx * dx + dy * dy) / SS - (dL * dL + dA * dA + dB * dB) / SR);
            sw += wt; sL += wt * src[j * 3]; sA += wt * src[j * 3 + 1]; sB += wt * src[j * 3 + 2];
          }
        }
        out[i * 3] = sL / sw; out[i * 3 + 1] = sA / sw; out[i * 3 + 2] = sB / sw;
      }
    }
    src = out;
  }
  return src;
}

const dist2 = (lab, i, c) => (lab[i * 3] - c[0]) ** 2 + (lab[i * 3 + 1] - c[1]) ** 2 + (lab[i * 3 + 2] - c[2]) ** 2;

function nearest(lab, i, centres) {
  let best = 0, bestD = Infinity;
  for (let k = 0; k < centres.length; k++) {
    const d = dist2(lab, i, centres[k]);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

// k-means (k-means++ seeds, fixed seed) on up to 20k opaque pixels, then every pixel to its nearest
// centre. Clusters under 0.2% of the ink merge into the nearest other one. Returns the labels
// (−1 for no ink) and the centres in OKLab.
export function quantise(lab, opaque, n, k, seed = 1) {
  const random = mulberry32(seed);
  const ink = [];
  for (let i = 0; i < n; i++) if (opaque[i]) ink.push(i);
  const labels = new Int32Array(n).fill(-1);
  if (!ink.length) return { labels, centres: [] };
  const stride = Math.max(1, Math.floor(ink.length / 20000));
  const sample = ink.filter((_, j) => j % stride === 0);
  const centre = (i) => [lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]];
  let centres = [centre(sample[Math.floor(random() * sample.length)])];
  const d = new Float64Array(sample.length).fill(Infinity);
  while (centres.length < k) {
    let sum = 0;
    const last = centres[centres.length - 1];
    for (let j = 0; j < sample.length; j++) { d[j] = Math.min(d[j], dist2(lab, sample[j], last)); sum += d[j]; }
    if (sum <= 1e-12) break; // fewer distinct colours than k
    let r = random() * sum, j = 0;
    while (j < sample.length - 1 && (r -= d[j]) > 0) j++;
    centres.push(centre(sample[j]));
  }
  const assign = new Int32Array(sample.length);

  for (let iter = 0; iter < 20; iter++) {
    const acc = centres.map(() => [0, 0, 0, 0]);
    let moved = 0;
    for (let j = 0; j < sample.length; j++) {
      const c = nearest(lab, sample[j], centres);
      if (c !== assign[j]) moved++;
      assign[j] = c;
      const a = acc[c], i = sample[j];
      a[0] += lab[i * 3]; a[1] += lab[i * 3 + 1]; a[2] += lab[i * 3 + 2]; a[3]++;
    }
    centres = centres.map((c, q) => (acc[q][3] ? [acc[q][0] / acc[q][3], acc[q][1] / acc[q][3], acc[q][2] / acc[q][3]] : c));
    if (iter && !moved) break;
  }
  // k-means weights by area, so a small but striking colour (yellow eyes in a brown owl) gets no ink
  // of its own. When enough pixels sit far from every centre, the two closest centres merge and those
  // pixels get one, then k-means settles again. Up to three times.
  // Promoted centres stay put: settling again would pull them back towards the big colours nearby.
  // A promotion is kept only if it leaves fewer pixels far from every ink and costs k-means' own error
  // (summed squared distance) under 15%: a small striking colour is worth a little smoothness.
  const pinned = new Set();
  const farOf = (cs) => sample.filter((i) => dist2(lab, i, cs[nearest(lab, i, cs)]) > OUTLIER * OUTLIER);
  const errorOf = (cs) => sample.reduce((sum, i) => sum + dist2(lab, i, cs[nearest(lab, i, cs)]), 0);
  let far = farOf(centres), error = errorOf(centres);
  for (let round = 0; round < 3 && far.length; round++) {
    // Seed from the far pixel with the most far neighbours (a colour, not one odd pixel).
    const probe = far.filter((_, j) => j % Math.max(1, Math.floor(far.length / 1500)) === 0);
    let seedAt = probe[0], most = -1;
    for (const i of probe) {
      let c = 0;
      for (const q of probe) if (dist2(lab, q, centre(i)) < OUTLIER * OUTLIER) c++;
      if (c > most) { most = c; seedAt = i; }
    }
    const group = far.filter((i) => dist2(lab, i, centre(seedAt)) < OUTLIER * OUTLIER);
    if (group.length < Math.max(12, sample.length * 0.003)) break;
    const mean = [0, 1, 2].map((t) => group.reduce((a, i) => a + lab[i * 3 + t], 0) / group.length);
    let trial = centres.slice();
    if (trial.length >= k) {
      let bi = 0, bj = 1, bd = Infinity;
      for (let i = 0; i < trial.length; i++) for (let j = i + 1; j < trial.length; j++) {
        if (pinned.has(trial[i]) || pinned.has(trial[j])) continue;
        const dd = (trial[i][0] - trial[j][0]) ** 2 + (trial[i][1] - trial[j][1]) ** 2 + (trial[i][2] - trial[j][2]) ** 2;
        if (dd < bd) { bd = dd; bi = i; bj = j; }
      }
      if (bd === Infinity) break;
      trial[bi] = trial[bi].map((v, t) => (v + trial[bj][t]) / 2);
      trial.splice(bj, 1);
    }
    trial.push(mean);
    const pins = new Set([...pinned, mean]);
    for (let iter = 0; iter < 10; iter++) {
      const acc = trial.map(() => [0, 0, 0, 0]);
      for (const i of sample) { const c = nearest(lab, i, trial), a = acc[c]; a[0] += lab[i * 3]; a[1] += lab[i * 3 + 1]; a[2] += lab[i * 3 + 2]; a[3]++; }
      trial = trial.map((c, q) => (pins.has(c) || !acc[q][3] ? c : [acc[q][0] / acc[q][3], acc[q][1] / acc[q][3], acc[q][2] / acc[q][3]]));
    }
    const trialError = errorOf(trial), trialFar = farOf(trial);
    if (trialFar.length >= far.length || trialError > error * 1.15) break;
    centres = trial;
    pinned.add(mean);
    error = trialError;
    far = trialFar;
  }
  // Clusters closer than JOIN in OKLab are one ink split by noise: join them (weighted by size).
  {
    const count = new Float64Array(centres.length);
    for (const i of sample) count[nearest(lab, i, centres)]++;
    let cs = centres.map((c, q) => ({ c, n: count[q] }));
    for (;;) {
      let bi = -1, bj = -1, bd = JOIN * JOIN;
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
        const d = (cs[i].c[0] - cs[j].c[0]) ** 2 + (cs[i].c[1] - cs[j].c[1]) ** 2 + (cs[i].c[2] - cs[j].c[2]) ** 2;
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
      if (bi < 0) break;
      const a = cs[bi], b = cs[bj], n = a.n + b.n || 1;
      cs[bi] = { c: a.c.map((v, t) => (v * a.n + b.c[t] * b.n) / n), n };
      cs.splice(bj, 1);
    }
    centres = cs.map((e) => e.c);
  }
  for (const i of ink) labels[i] = nearest(lab, i, centres);
  // Tiny clusters merge into their nearest neighbour, so ten colours on a three-colour logo stay three.
  for (;;) {
    const count = new Int32Array(centres.length);
    for (const i of ink) count[labels[i]]++;
    let small = -1;
    for (let q = 0; q < centres.length; q++) if (count[q] < ink.length * 0.002 && (small < 0 || count[q] < count[small])) small = q;
    if (small < 0 || centres.length < 2) break;
    const rest = centres.filter((_, q) => q !== small);
    for (const i of ink) labels[i] = nearest(lab, i, rest);
    centres = rest;
  }
  return { labels, centres };
}

// 3×3 majority filter on colour labels (ink pixels only; ties keep the pixel's own label).
function majority(labels, w, h, k, passes = 2) {
  let src = labels;
  const count = new Int32Array(k);
  for (let pass = 0; pass < passes; pass++) {
    const out = Int32Array.from(src);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (src[i] < 0) continue;
        count.fill(0);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const l = src[yy * w + xx];
          if (l >= 0) count[l]++;
        }
        let best = src[i];
        for (let q = 0; q < k; q++) if (count[q] > count[best]) best = q;
        out[i] = best;
      }
    }
    src = out;
  }
  return src;
}

// ---- Cells --------------------------------------------------------------------

// 4-connected patches of one label. Returns the patch id per pixel (−1 for no ink) and each patch's pixels.
export function components(labels, w, h) {
  const comp = new Int32Array(w * h).fill(-1);
  const patches = [];
  for (let s = 0; s < w * h; s++) {
    if (comp[s] >= 0 || labels[s] < 0) continue;
    const id = patches.length, colour = labels[s], stack = [s], px = [];
    comp[s] = id;
    while (stack.length) {
      const p = stack.pop();
      px.push(p);
      const x = p % w;
      if (x > 0 && comp[p - 1] < 0 && labels[p - 1] === colour) { comp[p - 1] = id; stack.push(p - 1); }
      if (x < w - 1 && comp[p + 1] < 0 && labels[p + 1] === colour) { comp[p + 1] = id; stack.push(p + 1); }
      if (p >= w && comp[p - w] < 0 && labels[p - w] === colour) { comp[p - w] = id; stack.push(p - w); }
      if (p < w * (h - 1) && comp[p + w] < 0 && labels[p + w] === colour) { comp[p + w] = id; stack.push(p + w); }
    }
    patches.push({ colour, px });
  }
  return { comp, patches };
}

// Patches under minArea take the colour of the neighbour they share the longest border with (one
// with no ink neighbour is dropped). Repeats until none is left. Changes labels in place.
export function mergeSpecks(labels, w, h, minArea) {
  for (let round = 0; round < 50; round++) {
    const { comp, patches } = components(labels, w, h);
    const small = patches.map((p, id) => id).filter((id) => patches[id].px.length < minArea)
      .sort((a, b) => patches[a].px.length - patches[b].px.length);
    if (!small.length) return labels;
    for (const id of small) {
      const own = labels[patches[id].px[0]];
      const border = new Map();
      for (const p of patches[id].px) {
        const x = p % w;
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < w * (h - 1) ? p + w : -1]) {
          if (q < 0 || labels[q] < 0 || labels[q] === own) continue;
          border.set(labels[q], (border.get(labels[q]) ?? 0) + 1);
        }
      }
      let to = -1, most = 0;
      for (const [l, c] of border) if (c > most || (c === most && l < to)) { most = c; to = l; }
      for (const p of patches[id].px) labels[p] = to; // −1 (dropped) when it only touches no-ink
      void comp;
    }
  }
  return labels;
}

// ---- Tracing ------------------------------------------------------------------
// Corners are (x, y) with 0 ≤ x ≤ w, 0 ≤ y ≤ h, id y·(w+1)+x. A crack is a pixel edge between two
// different patches (outside the picture and no-ink count as −1). A node is a corner where three or
// more patches meet, or two meet only diagonally (a pinch). A run is the chain of cracks between two
// nodes, or a ring with none (an island).

function crackGraph(comp, w, h) {
  const W1 = w + 1;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : comp[y * w + x]);
  const isNode = new Uint8Array(W1 * (h + 1));
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      const a = at(x - 1, y - 1), b = at(x, y - 1), c = at(x, y), d = at(x - 1, y); // TL TR BR BL
      const distinct = new Set([a, b, c, d]).size;
      const corner = (x === 0 || x === w) && (y === 0 || y === h); // the picture keeps its corners
      // A border between two patches (or ink and no ink) that meets the picture's edge ends there.
      const edge = x === 0 || x === w || y === 0 || y === h;
      const inside = edge && new Set([[x - 1, y - 1], [x, y - 1], [x, y], [x - 1, y]]
        .filter(([px, py]) => px >= 0 && py >= 0 && px < w && py < h).map(([px, py]) => comp[py * w + px])).size > 1;
      if (distinct >= 3 || (distinct === 2 && a === c && b === d) || (corner && distinct === 2) || inside) isNode[y * W1 + x] = 1;
    }
  }
  // Undirected cracks by corner: for each corner up to four neighbours along a crack.
  const hasH = (x, y) => at(x, y - 1) !== at(x, y); // edge (x,y)-(x+1,y)
  const hasV = (x, y) => at(x - 1, y) !== at(x, y); // edge (x,y)-(x,y+1)
  return { W1, at, isNode, hasH, hasV };
}

// Every run as a list of corner [x, y], walking from node to node (or round a ring).
function traceRuns(comp, w, h) {
  const { W1, at, isNode, hasH, hasV } = crackGraph(comp, w, h);
  const usedH = new Uint8Array(W1 * (h + 1)), usedV = new Uint8Array(W1 * (h + 1));
  const runs = [];
  // Cracks out of corner (x, y): [nx, ny, kind, key] for the edge to a neighbouring corner.
  const out = (x, y) => {
    const list = [];
    if (x < w && hasH(x, y)) list.push([x + 1, y, 'h', y * W1 + x]);
    if (x > 0 && hasH(x - 1, y)) list.push([x - 1, y, 'h', y * W1 + x - 1]);
    if (y < h && hasV(x, y)) list.push([x, y + 1, 'v', y * W1 + x]);
    if (y > 0 && hasV(x, y - 1)) list.push([x, y - 1, 'v', (y - 1) * W1 + x]);
    return list;
  };
  const used = (e) => (e[2] === 'h' ? usedH : usedV)[e[3]];
  const use = (e) => { (e[2] === 'h' ? usedH : usedV)[e[3]] = 1; };
  const walk = (sx, sy, first) => {
    const pts = [[sx, sy]];
    let e = first;
    for (;;) {
      use(e);
      const [x, y] = e;
      pts.push([x, y]);
      if (isNode[y * W1 + x] || (x === sx && y === sy)) return pts;
      const nextE = out(x, y).find((f) => !used(f));
      if (!nextE) return pts;
      e = nextE;
    }
  };
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      if (!isNode[y * W1 + x]) continue;
      for (const e of out(x, y)) if (!used(e)) runs.push(walk(x, y, e));
    }
  }
  // Rings: borders with no node on them.
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      for (const e of out(x, y)) if (!used(e)) runs.push(walk(x, y, e));
    }
  }
  void at;
  return runs;
}

// Douglas–Peucker keep flags for an open polyline with fixed ends (a ring is split at its middle).
function dpKeep(pts, tol, keep, from, to) {
  const tol2 = tol * tol;
  const stack = [[from, to]];
  while (stack.length) {
    const [i, j] = stack.pop();
    if (j - i < 2) continue;
    const [ax, ay] = pts[i], [bx, by] = pts[j];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let worst = -1, worstD = tol2;
    for (let k = i + 1; k < j; k++) {
      const px = pts[k][0] - ax, py = pts[k][1] - ay;
      const dd = len2 ? (px * dy - py * dx) ** 2 / len2 : px * px + py * py;
      if (dd > worstD) { worstD = dd; worst = k; }
    }
    if (worst >= 0) { keep[worst] = 1; stack.push([i, worst], [worst, j]); }
  }
}

// A run's points interleaved: corner, midpoint of the next crack, corner, … The midpoints of a pixel
// staircase lie on its diagonal, so simplifying through them (and not the corners) gives clean
// slopes; the corners come back only where the guard below needs them.
function interleave(run) {
  const out = [run[0]];
  for (let k = 1; k < run.length; k++) {
    out.push([(run[k - 1][0] + run[k][0]) / 2, (run[k - 1][1] + run[k][1]) / 2], run[k]);
  }
  return out;
}

function simplifyRun(pts, tol, keep) {
  // Douglas–Peucker over the ends and the midpoints (odd indices) only.
  const idx = [0];
  for (let k = 1; k < pts.length - 1; k += 2) idx.push(k);
  idx.push(pts.length - 1);
  const sub = idx.map((k) => pts[k]);
  const subKeep = new Uint8Array(sub.length);
  const n = sub.length;
  subKeep[0] = subKeep[n - 1] = 1;
  const ring = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
  if (ring && n > 3) {
    const mid = n >> 1;
    subKeep[mid] = 1;
    dpKeep(sub, tol, subKeep, 0, mid);
    dpKeep(sub, tol, subKeep, mid, n - 1);
  } else dpKeep(sub, tol, subKeep, 0, n - 1);
  idx.forEach((k, i) => { if (subKeep[i]) keep[k] = 1; });
}

// Exact segment tests: every coordinate is a whole pixel corner, so integer arithmetic is exact.
const orient = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
const onSeg = (a, b, c) => Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
const same = (p, q) => p[0] === q[0] && p[1] === q[1];

// Whether two segments touch anywhere other than one shared endpoint.
export function segmentsClash(a, b, c, d) {
  const shared = (same(a, c) || same(a, d) || same(b, c) || same(b, d));
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  if (shared) {
    // Sharing one end: they clash only if they lie along each other.
    if (o1 !== 0 || o2 !== 0) return false;
    const [p, q, r] = same(a, c) ? [a, b, d] : same(a, d) ? [a, b, c] : same(b, c) ? [b, a, d] : [b, a, c];
    // p is shared; q and r the far ends: overlapping when they point the same way from p.
    return (q[0] - p[0]) * (r[0] - p[0]) + (q[1] - p[1]) * (r[1] - p[1]) > 0;
  }
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(a, b, c)) return true;
  if (o2 === 0 && onSeg(a, b, d)) return true;
  if (o3 === 0 && onSeg(c, d, a)) return true;
  if (o4 === 0 && onSeg(c, d, b)) return true;
  return false;
}

// Simplifies every run at tol, then puts back the original points wherever a simplified segment
// would touch another one, until nothing clashes (the pixel cracks themselves never do).
function simplifyRuns(runs, tol, w, h) {
  const keeps = runs.map((r) => new Uint8Array(r.length));
  // A short run (one or two cracks) keeps its corners: there is nothing to straighten.
  runs.forEach((r, i) => { if (r.length <= 5) for (let k = 0; k < r.length; k += 2) keeps[i][k] = 1; });
  runs.forEach((r, i) => simplifyRun(r, tol, keeps[i]));
  const CELL = 8;
  const cols = Math.ceil((w + 1) / CELL) + 1, rows = Math.ceil((h + 1) / CELL) + 1;
  for (let round = 0; round < 30; round++) {
    // Segments as [run, from index, to index].
    const segs = [];
    runs.forEach((r, ri) => {
      let prev = 0;
      for (let k = 1; k < r.length; k++) if (keeps[ri][k]) { segs.push([ri, prev, k]); prev = k; }
    });
    const grid = new Map();
    const P = (s) => [runs[s[0]][s[1]], runs[s[0]][s[2]]];
    segs.forEach((s, si) => {
      const [a, b] = P(s);
      const x0 = Math.floor(Math.min(a[0], b[0]) / CELL), x1 = Math.floor(Math.max(a[0], b[0]) / CELL);
      const y0 = Math.floor(Math.min(a[1], b[1]) / CELL), y1 = Math.floor(Math.max(a[1], b[1]) / CELL);
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        const key = gy * cols + gx;
        let list = grid.get(key);
        if (!list) grid.set(key, list = []);
        list.push(si);
      }
    });
    void rows;
    const bad = new Set();
    for (const list of grid.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const si = list[i], sj = list[j];
          if (bad.has(si) && bad.has(sj)) continue;
          const [a, b] = P(segs[si]), [c, d] = P(segs[sj]);
          if (segmentsClash(a, b, c, d)) { bad.add(si); bad.add(sj); }
        }
      }
    }
    if (!bad.size) return keeps;
    for (const si of bad) {
      const [ri, from, to] = segs[si];
      // Back to the pixel corners over that span (they never cross), joined to the kept ends.
      for (let k = from; k <= to; k++) if (k % 2 === 0) keeps[ri][k] = 1;
      keeps[ri][from] = keeps[ri][to] = 1;
    }
  }
  // Unreachable in practice; fall back to every pixel corner.
  return runs.map((r) => Uint8Array.from(r, (_, k) => (k % 2 === 0 ? 1 : 0)));
}

// Each patch's loops from the runs: walk the cracks with the patch on the left, turning left at a
// pinch so 4-connected patches stay apart, and swap each stretch between nodes for its simplified run.
function assemble(comp, patches, w, h, runs, keeps) {
  const W1 = w + 1;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : comp[y * w + x]);
  // Simplified runs, looked up by their first crack (both directions).
  const byCrack = new Map();
  const ckey = (p, q) => `${p[1] * W1 + p[0]}>${q[1] * W1 + q[0]}`;
  runs.forEach((r, ri) => {
    const pts = r.filter((_, k) => keeps[ri][k]);
    // Interleaved runs: corners at even indices, so the first crack is r[0]→r[2].
    const len = (r.length + 1) / 2; // corners in the run
    byCrack.set(ckey(r[0], r[2]), { pts, len });
    const rev = [...r].reverse();
    byCrack.set(ckey(rev[0], rev[2]), { pts: [...pts].reverse(), len });
  });
  const { isNode } = crackGraph(comp, w, h);

  // Directed cracks with the patch on the left (y down: left of (dx, dy) is (dy, −dx)).
  const cells = patches.map(() => []);
  const outOf = patches.map(() => new Map());
  const add = (id, x0, y0, x1, y1) => {
    if (id < 0) return;
    const k = y0 * W1 + x0;
    let list = outOf[id].get(k);
    if (!list) outOf[id].set(k, list = []);
    list.push([x1, y1]);
  };
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      if (x < w) { const up = at(x, y - 1), down = at(x, y); if (up !== down) { add(up, x, y, x + 1, y); add(down, x + 1, y, x, y); } }
      if (y < h) { const left = at(x - 1, y), right = at(x, y); if (left !== right) { add(right, x, y, x, y + 1); add(left, x, y + 1, x, y); } }
    }
  }
  patches.forEach((_, id) => {
    const outs = outOf[id];
    const take = (k, prefer) => {
      const list = outs.get(k);
      if (!list?.length) return null;
      let pick = 0;
      if (prefer && list.length > 1) {
        // Most left turn first: left of (dx, dy) is (dy, −dx).
        const [dx, dy] = prefer;
        const rank = ([nx, ny], [x, y]) => {
          const ex = nx - x, ey = ny - y;
          if (ex === dy && ey === -dx) return 0;
          if (ex === dx && ey === dy) return 1;
          return 2;
        };
        const here = [k % W1, Math.floor(k / W1)];
        pick = list.map((p, i) => [rank(p, here), i]).sort((a, b) => a[0] - b[0])[0][1];
      }
      const [p] = list.splice(pick, 1);
      if (!list.length) outs.delete(k);
      return p;
    };
    while (outs.size) {
      const [startK] = outs.keys();
      const start = [startK % W1, Math.floor(startK / W1)];
      const loop = [start];
      let cur = start, dir = null;
      for (;;) {
        const next = take(cur[1] * W1 + cur[0], dir);
        if (!next) break;
        dir = [next[0] - cur[0], next[1] - cur[1]];
        cur = next;
        if (same(cur, start)) break;
        loop.push(cur);
      }
      cells[id].push(replaceRuns(loop, isNode, W1, byCrack));
    }
  });
  return cells;
}

// A loop of pixel corners → its simplified points, run by run.
function replaceRuns(loop, isNode, W1, byCrack) {
  const n = loop.length;
  const node = (p) => isNode[p[1] * W1 + p[0]];
  let s = loop.findIndex(node);
  const out = [];
  if (s < 0) {
    // A ring: find it by any of its cracks; start where the run starts.
    for (let i = 0; i < n; i++) {
      const r = byCrack.get(`${loop[i][1] * W1 + loop[i][0]}>${loop[(i + 1) % n][1] * W1 + loop[(i + 1) % n][0]}`);
      if (r && r.len === n + 1) return r.pts.slice(0, -1);
    }
    return loop; // not expected
  }
  let i = s;
  do {
    const p = loop[i], q = loop[(i + 1) % n];
    const r = byCrack.get(`${p[1] * W1 + p[0]}>${q[1] * W1 + q[0]}`);
    out.push(...r.pts.slice(0, -1));
    i = (i + r.len - 1) % n;
  } while (i !== s);
  return out;
}

const loopArea = (pts) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
};

// ---- The whole pipeline ---------------------------------------------------------

// image: { data (RGBA), w, h } already at working size. Returns the cells in pixel corners:
// [{ color: '#rrggbb', loops: [[[x, y], ...], ...] }], outer loop first, plus the counts.
export function imageCells(image, { colours = 6, detail = 3, seed = 1, palette = null, limits = {}, tune = {} } = {}) {
  const { w, h } = image;
  // More colours make more, smaller patches of the same picture. Cells cost little (points are what
  // slow a tank), so the cell cap grows with the colours; the point cap stays.
  const base = detailSettings(detail);
  const set = { ...base, cells: Math.round(base.cells * Math.max(1, colours / 8)), ...limits }; // limits: tests force the caps
  const { lab: raw, opaque } = toLab(image);
  const lab = smooth(raw, opaque, w, h, tune.smoothPasses ?? 1);
  const { labels: first, centres } = quantise(lab, opaque, w * h, Math.max(1, Math.min(MOST_COLOURS, Math.round(colours))), seed);
  let labels = majority(first, w, h, centres.length, tune.majorityPasses ?? 1);
  let colourOf = centres.map(oklabToHex);
  if (palette?.length) {
    // Each colour becomes its nearest palette ink. Colours that land on the same ink are one colour
    // from here on, so their patches join instead of meeting at a seam.
    const inks = centres.map((c) => nearestInk(c, palette));
    colourOf = [...new Set(inks)];
    const to = inks.map((ink) => colourOf.indexOf(ink));
    labels = labels.map((l) => (l < 0 ? l : to[l]));
  }

  let minArea = set.minArea;
  let result = null;
  for (let round = 0; round < 12; round++) {
    labels = mergeSpecks(labels, w, h, minArea);
    const { comp, patches } = components(labels, w, h);
    const runs = traceRuns(comp, w, h).map(interleave);
    // Points first (tolerance up to MAX_TOL), then fewer cells.
    let tol = set.tol, keeps, points;
    for (;;) {
      keeps = simplifyRuns(runs, tol, w, h);
      points = keeps.reduce((sum, k) => sum + k.reduce((a, b) => a + b, 0) - 1, 0) * 2; // each run is in two cells (or one at an edge)
      if (points <= set.points || tol >= MAX_TOL) break;
      tol = Math.min(MAX_TOL, tol * 1.25);
    }
    const loops = assemble(comp, patches, w, h, runs, keeps);
    const cells = patches.map((p, id) => {
      const ls = loops[id].filter((l) => l.length >= 3).sort((a, b) => Math.abs(loopArea(b)) - Math.abs(loopArea(a)));
      return { color: colourOf[p.colour], loops: ls };
    }).filter((c) => c.loops.length);
    const count = cells.reduce((s, c) => s + c.loops.reduce((a, l) => a + l.length, 0), 0);
    result = { cells, points: count, tolerance: tol, minArea, colours: colourOf.length };
    if ((count <= set.points && cells.length <= set.cells) || round === 11) break;
    minArea = Math.ceil(minArea * 1.5);
  }
  return result;
}

function nearestInk(c, palette) {
  let best = palette[0], bestD = Infinity;
  for (const ink of palette) {
    const hex = typeof ink === 'object' ? ink.color : ink;
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
    if (!m) continue;
    const q = oklab(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16));
    const d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2;
    if (d < bestD) { bestD = d; best = ink; }
  }
  return typeof best === 'object' ? best.color : best;
}

// Cells → print() arguments in tank mm, the picture `size` mm wide and centred on (x, y). Outer
// loops go anticlockwise and holes clockwise (y up). Every corner goes through one function, so the
// two sides of a shared border carry identical numbers.
export function cellsToPrints({ cells }, { w, h }, { size = 100, x = 0, y = 0 } = {}) {
  const k = size / w;
  const mm = ([px, py]) => [x + (px - w / 2) * k, y - (py - h / 2) * k];
  return cells.map(({ color, loops }) => ({
    color,
    contours: loops.map((loop, i) => {
      const pts = loop.map(mm);
      const area = loopArea(pts);
      if ((i === 0) !== (area > 0)) pts.reverse();
      return pts.flat();
    }),
  }));
}

// Scales a picture down to w×h by averaging the pixels each new pixel covers (ink weighted by alpha).
export function downsample({ data, w: sw, h: sh }, w, h) {
  if (w === sw && h === sh) return { data, w, h };
  const out = new Uint8ClampedArray(w * h * 4);
  const fx = sw / w, fy = sh / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < sh; yy++) for (let xx = x0; xx < x1 && xx < sw; xx++) {
        const i = (yy * sw + xx) * 4, al = data[i + 3];
        r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al; n++;
      }
      const o = (y * w + x) * 4;
      if (a) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
      out[o + 3] = n ? a / n : 0;
    }
  }
  return { data: out, w, h };
}

// Browser only: a jpg or png file as pixels with the long side `side` px, upright (EXIF), never at
// full size on a canvas. Nothing is sent anywhere or stored.
export async function pictureFromFile(file, side = DETAIL[MOST_DETAIL].side) {
  const opts = { imageOrientation: 'from-image', resizeQuality: 'high' };
  let bitmap = await createImageBitmap(file, { ...opts, resizeWidth: side });
  if (bitmap.height > bitmap.width) {
    bitmap.close();
    bitmap = await createImageBitmap(file, { ...opts, resizeHeight: side });
  }
  const { width: w, height: h } = bitmap;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}
