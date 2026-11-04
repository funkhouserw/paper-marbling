const SMALL_SPAN = 8; // tolerances; below this, a circle's outline would thin to a square or an octagon
const SMALL_ANCHORS = 12;

function spanOf(xy, off, n) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = off * 2, end = (off + n) * 2; i < end; i += 2) {
    if (xy[i] < x0) x0 = xy[i];
    if (xy[i] > x1) x1 = xy[i];
    if (xy[i + 1] < y0) y0 = xy[i + 1];
    if (xy[i + 1] > y1) y1 = xy[i + 1];
  }
  return Math.max(x1 - x0, y1 - y0);
}

// How wide an outline's gap-closing underpaint should be. Most outlines get all of it. But a spray dot
// dragged into a hair would print as a bar, so a small amount of ink narrows towards its own width as it
// gets long and thin: twice area over perimeter is a ribbon's width. A big raked film is long and thin
// too, but that is what underpaint is for: its ribbons have cracks between them to close.
const LANKY = 0.1; // roundness (1 for a circle) at and below which small ink gets only its own width
const ROUND = 0.5; // roundness at and above which it gets the full width
const SMALL = 150; // mm²; up to about the largest spray dot, a radius of 7 mm
const LARGE = 600; // mm²; from here on, outlines always get the full width

const smooth = (u) => {
  const v = Math.max(0, Math.min(1, u));
  return v * v * (3 - 2 * v);
};

export function underpaintWidth(xy, off, n, full) {
  let area = 0, length = 0;
  let px = xy[(off + n - 1) * 2], py = xy[(off + n - 1) * 2 + 1];
  for (let i = off * 2, end = (off + n) * 2; i < end; i += 2) {
    const x = xy[i], y = xy[i + 1];
    area += px * y - x * py;
    length += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  if (length <= 0) return 0;
  area = Math.abs(area) / 2;
  const own = Math.min(full, (2 * area) / length);
  const round = smooth(((4 * Math.PI * area) / (length * length) - LANKY) / (ROUND - LANKY));
  const big = smooth((area - SMALL) / (LARGE - SMALL));
  return own + (full - own) * Math.max(round, big);
}

// Thins one closed outline to what a given tolerance can show, by Douglas-Peucker: no dropped point
// is further than tol from the outline that's left. Reads n points of xy from offset off (in points).
export function thin(xy, off, n, tol) {
  if (n < 16) return xy.slice(off * 2, (off + n) * 2);
  const keep = new Uint8Array(n);
  const stack = [];
  // A dot that's only a few tolerances across would otherwise come out as a square, since all of it
  // lies close to the chords between four of its points. So small shapes start from a ring of anchors.
  const anchors = spanOf(xy, off, n) < SMALL_SPAN * tol ? SMALL_ANCHORS : 2;
  for (let a = 0; a < anchors; a++) {
    const from = Math.floor((a * n) / anchors);
    keep[from] = 1;
    stack.push(from, Math.floor(((a + 1) * n) / anchors));
  }
  const tol2 = tol * tol;
  while (stack.length) {
    const to = stack.pop();
    const from = stack.pop();
    if (to - from < 2) continue;
    const ax = xy[(off + from) * 2];
    const ay = xy[(off + from) * 2 + 1];
    const end = off + (to % n);
    const dx = xy[end * 2] - ax;
    const dy = xy[end * 2 + 1] - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let at = -1;
    for (let i = from + 1; i < to; i++) {
      const px = xy[(off + i) * 2] - ax;
      const py = xy[(off + i) * 2 + 1] - ay;
      // Distance to the segment, not its line: outlines fold back on themselves.
      const u = len2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
      const ex = px - dx * u;
      const ey = py - dy * u;
      const d = ex * ex + ey * ey;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol2) {
      keep[at] = 1;
      stack.push(from, at, at, to);
    }
  }
  let count = 0;
  for (let i = 0; i < n; i++) count += keep[i];
  const out = new Float64Array(count * 2);
  for (let i = 0, w = 0; i < n; i++) {
    if (!keep[i]) continue;
    out[w++] = xy[(off + i) * 2];
    out[w++] = xy[(off + i) * 2 + 1];
  }
  return out;
}
