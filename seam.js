// Keep cells separate: each outline is drawn pulled in by half a seam, so two drops whose fronts met
// show a hairline of whatever lies under them: bare bath between neighbours, the older colour round a
// drop that landed inside it. A drop of the same colour inside another shows nothing, so it reads as
// merged. The ink itself isn't moved; only its drawing. No DOM.

export const SEAM = 0.6; // mm, the default width of the seam between two cells

// The outline (flat x, y pairs, n points) moved d inward at every point, along the bisector of its two
// edges. inward false moves it outward instead (for a hole, whose ink lies outside it). Sharp corners
// move at most 2d, so a spike thins rather than shooting off.
// keep, if given, marks points that stay where they are (1): those inside another drop of the same
// colour, which has merged with this one, so no seam runs through the merged ink.
export function seamed(xy, n, d, inward = true, keep = null) {
  const out = new Float64Array(n * 2);
  if (n < 3 || !(d > 0)) { out.set(xy.subarray(0, n * 2)); return out; }
  let twice = 0;
  for (let i = 0, k = n - 1; i < n; k = i++) twice += xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
  // Counter-clockwise outlines have their inside to the left of each edge.
  const side = (twice > 0 ? 1 : -1) * (inward ? 1 : -1);
  for (let i = 0; i < n; i++) {
    const a = i === 0 ? n - 1 : i - 1, b = i === n - 1 ? 0 : i + 1;
    let ex = xy[i * 2] - xy[a * 2], ey = xy[i * 2 + 1] - xy[a * 2 + 1];
    let fx = xy[b * 2] - xy[i * 2], fy = xy[b * 2 + 1] - xy[i * 2 + 1];
    const le = Math.hypot(ex, ey) || 1, lf = Math.hypot(fx, fy) || 1;
    ex /= le; ey /= le; fx /= lf; fy /= lf;
    // Left normals of the two edges, averaged: the bisector.
    let nx = -ey - fy, ny = ex + fx;
    const len = Math.hypot(nx, ny);
    let k = d;
    if (len > 1e-9) {
      nx /= len; ny /= len;
      // So that each edge moves d, the corner moves d / cos(half its turn), at most 2d.
      const cos = nx * -ey + ny * ex;
      k = d / Math.max(0.5, cos);
    } else { nx = -ey; ny = ex; }
    if (keep && keep[i]) k = 0;
    out[i * 2] = xy[i * 2] + side * nx * k;
    out[i * 2 + 1] = xy[i * 2 + 1] + side * ny * k;
  }
  return out;
}

const box = (xy, n) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = xy[i * 2], y = xy[i * 2 + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
};

const inside = (xy, n, x, y) => {
  let w = false;
  for (let i = 0, k = n - 1; i < n; k = i++) {
    const ay = xy[k * 2 + 1], by = xy[i * 2 + 1];
    if ((ay > y) !== (by > y) && x < xy[k * 2] + ((y - ay) * (xy[i * 2] - xy[k * 2])) / (by - ay)) w = !w;
  }
  return w;
};

// For outlines [{ xy, n, color, group }], which points of each lie inside another outline of the same
// colour (not a hole loop): an array of Uint8Array marks, or null where none do.
export function mergedPoints(outlines) {
  const boxes = outlines.map((o) => box(o.xy, o.n));
  return outlines.map((o, a) => {
    if (o.group) return null;
    const b = boxes[a];
    let marks = null;
    for (let c = 0; c < outlines.length; c++) {
      const q = outlines[c], e = boxes[c];
      if (c === a || q.group || q.color !== o.color || e[0] > b[2] || e[2] < b[0] || e[1] > b[3] || e[3] < b[1]) continue;
      for (let i = 0; i < o.n; i++) {
        if (marks?.[i]) continue;
        const x = o.xy[i * 2], y = o.xy[i * 2 + 1];
        if (x < e[0] || x > e[2] || y < e[1] || y > e[3]) continue;
        if (inside(q.xy, q.n, x, y)) (marks ??= new Uint8Array(o.n))[i] = 1;
      }
    }
    return marks;
  });
}
