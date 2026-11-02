// Thins one closed outline to what a given tolerance can show, by Douglas-Peucker: no dropped point
// is further than tol from the outline that's left. Reads n points of xy from offset off (in points).
export function thin(xy, off, n, tol) {
  if (n < 16) return xy.slice(off * 2, (off + n) * 2);
  const keep = new Uint8Array(n);
  const half = n >> 1;
  keep[0] = keep[half] = 1;
  const stack = [0, half, half, n];
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
