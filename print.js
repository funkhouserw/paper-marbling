// Print: a slow, high-resolution picture of a finished tank, for any simulator with outlines.
// It doesn't move any ink. It works out how thick each region of ink is and colours it the way
// a layer of that thickness tints the paper under it (Beer-Lambert: thicker is deeper).
//
// Thickness only varies from region to region, because ink in these simulators doesn't change
// its area when moved. A drop that spread to 4 times its plain area is a quarter as thick.
// Rims and mottling are artistic touches, not physics, and each one can be turned off.

import { thickness as squeezed, tintOf } from './engine.js';
import { seamed, mergedPoints, bareSeam } from './seam.js';

export const PRINT_DEFAULTS = {
  width: 3000, // pixels
  smooth: 2, // samples per pixel across
  paper: '#f6f1e4',
  paleness: 0.35, // 0: every ink keeps its colour. 1: full Beer-Lambert.
  rim: 0.15, // how much deeper ink looks right at its edge
  rimWidth: 1.5, // mm
  soft: 0, // mm that inks bleed into each other, in patches. 0 keeps every edge crisp.
  mottle: 0.04, // uneven pigment
  grain: 0.012, // paper texture
};

const PIXELS_BETWEEN_YIELDS = 2e6;

function parseColor(color) {
  let m = /^#([0-9a-f]{3,8})$/i.exec(color);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    return [0, 2, 4, 6].map((i) => (i < h.length ? parseInt(h.slice(i, i + 2), 16) : 255));
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(color);
  if (m) {
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return [r, g, b, a * 255];
  }
  if (typeof document === 'undefined') return [40, 40, 40, 255];
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  return [...ctx.getImageData(0, 0, 1, 1).data];
}

// Smooth noise in 0..1, made of a few sizes of soft blobs.
function makeNoise(seed) {
  const size = 256;
  const table = new Float32Array(size * size);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < table.length; i++) {
    s = Math.imul(s ^ (s >>> 15), 2246822519) >>> 0;
    s = (s ^ (s >>> 13)) >>> 0;
    table[i] = s / 4294967296;
  }
  const at = (x, y) => {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const a = x - fx;
    const b = y - fy;
    const u = a * a * (3 - 2 * a);
    const v = b * b * (3 - 2 * b);
    const c = (i, j) => table[((j & 255) << 8) | (i & 255)];
    return (c(fx, fy) * (1 - u) + c(fx + 1, fy) * u) * (1 - v) + (c(fx, fy + 1) * (1 - u) + c(fx + 1, fy + 1) * u) * v;
  };
  return (x, y) => (at(x / 90, y / 90) * 0.5 + at(x / 31 + 40, y / 31) * 0.3 + at(x / 11, y / 11 + 90) * 0.2);
}

// The outline as a smooth curve through its points. Straight edges cut corners, and on a ribbon
// of ink thinner than that shortcut, neighbouring outlines cross and draw as stripes.
function smoothOutline({ xy, n }, step) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n;
    const c = (i + 1) % n;
    const d = (i + 2) % n;
    const x0 = xy[a * 2], y0 = xy[a * 2 + 1];
    const x1 = xy[i * 2], y1 = xy[i * 2 + 1];
    const x2 = xy[c * 2], y2 = xy[c * 2 + 1];
    const x3 = xy[d * 2], y3 = xy[d * 2 + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const parts = Math.max(1, Math.min(32, Math.ceil(len / step)));
    // Sharp corners stay sharp: a curve through one would overshoot.
    const turn = (x2 - x1) * (x3 - x2) + (y2 - y1) * (y3 - y2);
    const back = (x1 - x0) * (x2 - x1) + (y1 - y0) * (y2 - y1);
    const curved = parts > 1 && turn > 0 && back > 0;
    for (let k = 0; k < parts; k++) {
      const t = k / parts;
      if (!curved) {
        out.push(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
        continue;
      }
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(
        0.5 * (2 * x1 + (x2 - x0) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (3 * x1 - x0 - 3 * x2 + x3) * t3),
        0.5 * (2 * y1 + (y2 - y0) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (3 * y1 - y0 - 3 * y2 + y3) * t3),
      );
    }
  }
  return { xy: out, n: out.length / 2 };
}

// Which outline is on top at every sample.
function paintLabels(marble, w, h, scale, labels) {
  const crossings = Array.from({ length: h }, () => []);
  const toX = (v) => (v + marble.width / 2) * scale;
  const toY = (v) => (marble.height / 2 - v) * scale;
  const { polys } = marble;
  const half = marble.seamsDrawn ? marble.seam / 2 : 0;
  // Smoothed once, so that points inside another drop of the same colour (merged with it) can be
  // left where they are, as on screen.
  const smooth = polys.map((poly) => (poly.group ? poly : { ...smoothOutline(poly, 4 / scale), color: poly.color }));
  const merged = half ? mergedPoints(smooth, marble.touchReach ?? 2 * marble.seam) : null;
  for (let p = 0; p < polys.length; p++) {
    const { group } = polys[p];
    const first = p;
    const loops = [];
    do {
      const loop = smooth[p];
      // Keep cells separate: each loop printed half a seam into its ink, as on screen.
      // Holes (later loops of a group) are gall water: never seamed, as on screen.
      loops.push(half && p === first ? { xy: seamed(loop.xy, loop.n, half, true, merged[p], polys[p].group ? half : bareSeam(loop.xy, loop.n, marble.seam, marble.seamShare ?? 0) / 2), n: loop.n } : loop);
    } while (group && polys[p + 1]?.group === group && ++p);
    // Each repeat is filled on its own, because repeats can overlap and this fill is even-odd.
    for (const [sx, sy] of marble.tileShifts?.(loops) ?? [[0, 0]]) {
      let lo = h;
      let hi = -1;
      for (const { xy, n } of loops) {
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const y0 = toY(xy[j * 2 + 1] + sy) - 0.5;
          const y1 = toY(xy[i * 2 + 1] + sy) - 0.5;
          const from = Math.max(0, Math.ceil(Math.min(y0, y1)));
          const to = Math.min(h - 1, Math.ceil(Math.max(y0, y1)) - 1);
          const x0 = toX(xy[j * 2] + sx);
          const x1 = toX(xy[i * 2] + sx);
          for (let r = from; r <= to; r++) crossings[r].push(x0 + (x1 - x0) * (r - y0) / (y1 - y0));
          if (from <= to) { lo = Math.min(lo, from); hi = Math.max(hi, to); }
        }
      }
      for (let r = lo; r <= hi; r++) {
        const c = crossings[r].sort((a, b) => a - b);
        for (let k = 0; k + 1 < c.length; k += 2) {
          const end = Math.min(w - 1, Math.floor(c[k + 1] - 0.5));
          for (let x = Math.max(0, Math.ceil(c[k] - 0.5)); x <= end; x++) labels[r * w + x] = first + 1;
        }
        c.length = 0;
      }
    }
  }
}

// Distance to the nearest different region, and with it the nearest ink for samples on bare
// water. Two sweeps with diagonal steps: close enough at the short distances that matter here.
function nearestEdge(labels, inkOf, w, h, fillWithin, dist, nearest) {
  const big = 1e9;
  for (let i = 0; i < w * h; i++) {
    const here = labels[i];
    const x = i % w;
    // Two regions of one colour read as one ink, so a rim between them would draw a false seam.
    const ink = inkOf[here];
    const edge = (x > 0 && inkOf[labels[i - 1]] !== ink) || (x < w - 1 && inkOf[labels[i + 1]] !== ink)
      || (i >= w && inkOf[labels[i - w]] !== ink) || (i < w * (h - 1) && inkOf[labels[i + w]] !== ink);
    dist[i] = edge ? 0.5 : big;
    nearest[i] = here;
  }
  // Water takes the label of whichever ink reaches it first, so thin gaps close.
  const step = (i, j, d) => {
    if (dist[j] + d < dist[i]) dist[i] = dist[j] + d;
    if (!labels[i] && nearest[j] && (!nearest[i] || waterDist[j] + d < waterDist[i])) {
      nearest[i] = nearest[j];
      waterDist[i] = waterDist[j] + d;
    }
  };
  const waterDist = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) waterDist[i] = labels[i] ? 0 : big;
  const D = Math.SQRT2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) step(i, i - 1, 1);
      if (y > 0) {
        step(i, i - w, 1);
        if (x > 0) step(i, i - w - 1, D);
        if (x < w - 1) step(i, i - w + 1, D);
      }
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) step(i, i + 1, 1);
      if (y < h - 1) {
        step(i, i + w, 1);
        if (x < w - 1) step(i, i + w + 1, D);
        if (x > 0) step(i, i + w - 1, D);
      }
    }
  }
  for (let i = 0; i < w * h; i++) if (!labels[i] && waterDist[i] > fillWithin) nearest[i] = 0;
}

// Returns { width, height, data } with RGBA bytes. Reports progress from 0 to 1, and gives the
// page a chance to draw between stages.
// Three box blurs in a row, which is close to a Gaussian. Works on rows of RGBA, ignoring alpha.
function blurred(data, width, height, radius) {
  const out = Float32Array.from(data);
  const line = new Float32Array(Math.max(width, height));
  const pass = (count, lines, at) => {
    const window = radius * 2 + 1;
    for (let l = 0; l < lines; l++) {
      for (let c = 0; c < 3; c++) {
        for (let i = 0; i < count; i++) line[i] = out[at(l, i) + c];
        let sum = line[0] * (radius + 1);
        for (let i = 1; i <= radius; i++) sum += line[Math.min(i, count - 1)];
        for (let i = 0; i < count; i++) {
          out[at(l, i) + c] = sum / window;
          sum += line[Math.min(i + radius + 1, count - 1)] - line[Math.max(i - radius, 0)];
        }
      }
    }
  };
  for (let round = 0; round < 3; round++) {
    pass(width, height, (l, i) => (l * width + i) * 4);
    pass(height, width, (l, i) => (i * width + l) * 4);
  }
  return out;
}

// Lets inks bleed into each other, in soft patches, so some edges stay crisp and others go hazy.
// Not simulated: it stands in for the blending real ink, and grid-based simulators, have.
export function softenEdges(data, width, height, radiusPx, noise) {
  const radius = Math.max(1, Math.round(radiusPx / 2));
  const soft = blurred(data, width, height, radius);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const q = (y * width + x) * 4;
      const m = Math.min(1, Math.max(0, (noise(x * 0.012, y * 0.012) - 0.3) / 0.35));
      for (let c = 0; c < 3; c++) data[q + c] += (soft[q + c] - data[q + c]) * m;
    }
  }
}

export async function renderPrint(marble, options = {}, onProgress = () => {}) {
  const o = { ...PRINT_DEFAULTS, ...options };
  const width = Math.round(o.width);
  const height = Math.round((width * marble.height) / marble.width);
  const w = width * o.smooth;
  const h = height * o.smooth;
  const scale = w / marble.width; // samples per mm
  if (marble.printInk) return marble.printInk(width, height, o, onProgress);
  const breathe = async (share) => {
    onProgress(share);
    await new Promise((resolve) => setTimeout(resolve));
  };

  const labels = new Int32Array(w * h);
  paintLabels(marble, w, h, scale, labels);
  await breathe(0.2);

  const dist = new Float32Array(w * h);
  const nearest = new Int32Array(w * h);
  const inkIds = new Map();
  const inkOf = Int32Array.from([0, ...marble.polys.map(({ color }) => {
    if (!inkIds.has(color)) inkIds.set(color, inkIds.size + 1);
    return inkIds.get(color);
  })]);
  nearestEdge(labels, inkOf, w, h, (marble.seamsDrawn ? 0 : marble.closeGaps ?? 0) * scale, dist, nearest);
  // Again with the gaps filled, so a closed gap between two regions of one colour has no edge.
  labels.set(nearest);
  nearestEdge(labels, inkOf, w, h, 0, dist, nearest);
  await breathe(0.45);

  // Each ink's thickness compared with the plain size of its drop.
  const visible = new Float64Array(marble.polys.length + 1);
  for (let i = 0; i < w * h; i++) visible[nearest[i]]++;
  const plainOf = new Map();
  for (const op of marble.sources ?? []) if (op.poly && op.maxArea) plainOf.set(op.poly, op.maxArea * Math.PI);
  const seenOf = new Map();
  marble.polys.forEach((poly, p) => {
    const root = poly.from ?? poly;
    seenOf.set(root, (seenOf.get(root) ?? 0) + visible[p + 1]);
  });
  const paper = parseColor(o.paper).slice(0, 3).map((v) => v / 255);
  const looks = [null];
  for (let p = 0; p < marble.polys.length; p++) {
    const poly = marble.polys[p];
    const [r, g, b, a] = parseColor(poly.color);
    // An outline cut in two is still one drop of ink, at one thickness.
    const root = poly.from ?? poly;
    const seen = (seenOf.get(root) ?? 0) / (scale * scale);
    const plain = plainOf.get(root);
    // And how squeezed its film is (τ, set when later ink pushed it back), as the screen shows it.
    // Squeeze darkens prints as on screen: softened, by √τ (tintOf).
    const thickness = (plain && seen > 0 ? Math.min(4, plain / seen) : 1) * tintOf(squeezed(poly));
    // Strength 1 is the colour as chosen, which is how it looks at plain thickness.
    const strength = (1 - o.paleness) + o.paleness * Math.sqrt(thickness);
    // How much each channel absorbs, from what a layer at plain thickness does to the paper.
    const absorb = [r, g, b].map((v, i) => {
      const seenThrough = Math.max(0.004, (v / 255) * (a / 255) + paper[i] * (1 - a / 255));
      return -Math.log(Math.min(1, seenThrough / Math.max(paper[i], 0.004)));
    });
    // Inks lighter than the paper can't be a tint of it. These just mix with it instead.
    const tint = [r, g, b].map((v) => v / 255);
    looks.push({ absorb, tint, strength, lighter: tint.some((v, i) => v > paper[i]) });
  }

  const noise = makeNoise(marble.seed ?? 1);
  const data = new Uint8ClampedArray(width * height * 4);
  const rimReach = o.rimWidth * scale;
  const samples = o.smooth * o.smooth;
  let done = 0;
  const shade = (i, sx, sy, out) => {
    const id = nearest[i];
    const fx = sx / scale;
    const fy = sy / scale;
    const fibre = 1 + (noise(fx * 7, fy * 7) - 0.5) * o.grain * 2;
    if (!id) {
      out[0] += paper[0] * fibre;
      out[1] += paper[1] * fibre;
      out[2] += paper[2] * fibre;
      return;
    }
    const look = looks[id];
    let s = look.strength * (1 + (noise(fx, fy) - 0.5) * o.mottle * 2);
    if (o.rim && labels[i]) s *= 1 + o.rim * Math.exp(-dist[i] / rimReach);
    for (let c = 0; c < 3; c++) {
      const v = look.lighter ? paper[c] + (look.tint[c] - paper[c]) * Math.min(1, s) : paper[c] * Math.exp(-look.absorb[c] * s);
      out[c] += v * fibre;
    }
  };
  const out = [0, 0, 0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[0] = out[1] = out[2] = 0;
      for (let j = 0; j < o.smooth; j++) {
        for (let k = 0; k < o.smooth; k++) {
          const sx = x * o.smooth + k;
          const sy = y * o.smooth + j;
          shade(sy * w + sx, sx, sy, out);
        }
      }
      const q = (y * width + x) * 4;
      data[q] = (out[0] / samples) * 255;
      data[q + 1] = (out[1] / samples) * 255;
      data[q + 2] = (out[2] / samples) * 255;
      data[q + 3] = 255;
    }
    done += width * samples;
    if (done > PIXELS_BETWEEN_YIELDS) {
      done = 0;
      await breathe(0.45 + (0.55 * y) / height);
    }
  }
  if (o.soft > 0) {
    await breathe(0.98);
    softenEdges(data, width, height, (o.soft * width) / marble.width, noise);
  }
  onProgress(1);
  return { width, height, data };
}
