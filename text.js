// Turns a string into closed contours in tank mm, ready for marble.print().
// Browser only: it rasterises with a canvas, then traces with marching squares.

export const FONTS = {
  serif: ['Serif', 'Georgia, "Times New Roman", serif'],
  sans: ['Sans', '"Helvetica Neue", Arial, sans-serif'],
  mono: ['Mono', 'Menlo, "Courier New", monospace'],
  script: ['Script', '"Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive'],
  display: ['Display', 'Impact, "Arial Black", sans-serif'],
};

const RASTER_PX = 160; // font size used for tracing
const MAX_CANVAS = 8000;
const THRESHOLD = 128;

// Segments per marching-squares case, as [from, to] edges with the ink on the left.
// Corners: a top-left = 8, b top-right = 4, c bottom-right = 2, d bottom-left = 1.
const T = 0, R = 1, B = 2, L = 3;
const CASES = {
  8: [[L, T]], 4: [[T, R]], 2: [[R, B]], 1: [[B, L]],
  12: [[L, R]], 6: [[T, B]], 3: [[R, L]], 9: [[B, T]],
  7: [[T, L]], 11: [[R, T]], 13: [[B, R]], 14: [[L, B]],
};
// Saddles depend on whether the cell centre is inked.
const SADDLES = {
  10: { in: [[R, T], [L, B]], out: [[L, T], [R, B]] },
  5: { in: [[T, L], [B, R]], out: [[T, R], [B, L]] },
};

// Traces an alpha field (width w, height h) into closed loops of [x, y] pixels.
export function trace(alpha, w, h, threshold = THRESHOLD) {
  const at = (x, y) => alpha[y * w + x];
  const edgeId = (x, y, edge) => {
    if (edge === T) return (y * w + x) * 2;
    if (edge === B) return ((y + 1) * w + x) * 2;
    if (edge === L) return (y * w + x) * 2 + 1;
    return (y * w + x + 1) * 2 + 1;
  };
  const crossing = (p, q) => (threshold - p) / (q - p);
  const point = (x, y, edge) => {
    if (edge === T) return [x + crossing(at(x, y), at(x + 1, y)), y];
    if (edge === B) return [x + crossing(at(x, y + 1), at(x + 1, y + 1)), y + 1];
    if (edge === L) return [x, y + crossing(at(x, y), at(x, y + 1))];
    return [x + 1, y + crossing(at(x + 1, y), at(x + 1, y + 1))];
  };

  const next = new Map();
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = at(x, y), b = at(x + 1, y), c = at(x + 1, y + 1), d = at(x, y + 1);
      const code = (a >= threshold ? 8 : 0) | (b >= threshold ? 4 : 0)
        | (c >= threshold ? 2 : 0) | (d >= threshold ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const saddle = SADDLES[code];
      const segments = saddle ? ((a + b + c + d) / 4 >= threshold ? saddle.in : saddle.out) : CASES[code];
      for (const [from, to] of segments) {
        next.set(edgeId(x, y, from), { id: edgeId(x, y, to), p: point(x, y, to) });
      }
    }
  }

  const loops = [];
  while (next.size) {
    const [start] = next.keys();
    const loop = [];
    let id = start;
    while (next.has(id)) {
      const step = next.get(id);
      next.delete(id);
      loop.push(step.p);
      id = step.id;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

// Douglas-Peucker for a closed loop of [x, y] points.
export function simplify(loop, tolerance) {
  if (loop.length < 8) return loop;
  // Split at the point furthest from the first, so both halves are open polylines.
  let far = 0, farD = -1;
  for (let i = 1; i < loop.length; i++) {
    const d = (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2;
    if (d > farD) { farD = d; far = i; }
  }
  const keep = new Uint8Array(loop.length + 1);
  const pts = [...loop, loop[0]];
  keep[0] = keep[far] = keep[loop.length] = 1;
  const stack = [[0, far], [far, loop.length]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [i, j] = stack.pop();
    const [ax, ay] = pts[i], [bx, by] = pts[j];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
    let worst = -1, worstD = tol2;
    for (let k = i + 1; k < j; k++) {
      const cross = (pts[k][0] - ax) * dy - (pts[k][1] - ay) * dx;
      const d = (cross * cross) / len2;
      if (d > worstD) { worstD = d; worst = k; }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([i, worst], [worst, j]);
    }
  }
  return loop.filter((_, i) => keep[i]);
}

// Contours for `text`, centred on (x, y). `size` is the font size in mm, and \n starts a new line.
export function textContours({ text = '', font = 'serif', size = 80, x = 0, y = 0 } = {}) {
  const lines = String(text).split('\n');
  const family = FONTS[font]?.[1] ?? font;
  const css = (px) => `${font === 'display' ? '' : 'bold '}${px}px ${family}`;

  const probe = document.createElement('canvas').getContext('2d');
  probe.font = css(RASTER_PX);
  const widest = Math.max(1, ...lines.map((l) => probe.measureText(l).width));
  const lineHeight = RASTER_PX * 1.2;
  const pad = RASTER_PX; // script faces overhang their measured width
  const naturalW = widest + pad * 2;
  const naturalH = lineHeight * lines.length + pad * 2;
  const fit = Math.min(1, MAX_CANVAS / naturalW, MAX_CANVAS / naturalH);
  const w = Math.ceil(naturalW * fit), h = Math.ceil(naturalH * fit);
  const px = RASTER_PX * fit;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.font = css(px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, h / 2 + (i - (lines.length - 1) / 2) * lineHeight * fit);
  });

  const { data } = ctx.getImageData(0, 0, w, h);
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];

  const mmPerPx = size / px;
  return trace(alpha, w, h).map((loop) => simplify(loop, 0.3).flatMap(([px_, py]) => [
    x + (px_ - w / 2) * mmPerPx,
    y - (py - h / 2) * mmPerPx,
  ]));
}

// A copy of flat contours moved by (dx, dy).
export function moveContours(contours, dx, dy) {
  return contours.map((c) => c.map((v, i) => v + (i % 2 ? dy : dx)));
}
