// Keep cells separate: each outline is drawn pulled in by half a seam, so two drops whose fronts met
// show a hairline of whatever lies under them: bare bath between neighbours, the older colour round a
// drop that landed inside it. A drop of the same colour inside another shows nothing, so it reads as
// merged. The ink itself isn't moved; only its drawing. No DOM.

export const SEAM = 0.6; // mm, the default width of the seam between two cells
// Where cells face bare bath the channel is wider for bigger cells: this share of √area, at least
// SEAM (photo 26's channels are 5-15 mm between cells of 10-30 cm). 0 keeps every seam SEAM wide.
export const SEAM_SHARE = 0.03;

// The outline (flat x, y pairs, n points) moved d inward at every point, along the bisector of its two
// edges. inward false moves it outward instead (for a hole, whose ink lies outside it). Sharp corners
// move at most 2d, so a spike thins rather than shooting off.
// keep, if given, marks each point: 1, inside another drop of the same colour, which has merged with
// this one, so it stays where it is and no seam runs through the merged ink; 2, inside a drop of
// another colour, moved d (a hairline of that colour shows round it); 0, facing bare bath, moved
// bare (at least d), so channels between cells can be wider for bigger cells.
export function seamed(xy, n, d, inward = true, keep = null, bare = d) {
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
    const want = !keep ? bare : keep[i] === 1 ? 0 : keep[i] === 2 || keep[i] === 3 ? d : bare;
    let k = want;
    if (len > 1e-9) {
      nx /= len; ny /= len;
      // So that each edge moves its distance, the corner moves it / cos(half its turn), at most 2x.
      const cos = nx * -ey + ny * ex;
      k = want / Math.max(0.5, cos);
    } else { nx = -ey; ny = ex; }
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

// For outlines [{ xy, n, color, group }], where each point lies: 1 inside another outline of the same
// colour, 2 inside one of another colour, 3 outside every other outline but within reach (mm) of one
// (touching: fronts that met, which get a hairline, not a bare channel), 0 facing bare bath (see
// seamed). An array of Uint8Array marks per outline (null for a hole loop).
export function mergedPoints(outlines, reach = 0) {
  const boxes = outlines.map((o) => box(o.xy, o.n));
  // Every outline's edges bucketed on a grid as wide as reach, to find what's within reach.
  const G = Math.max(reach, 1e-6);
  const grid = reach > 0 ? new Map() : null;
  if (grid) {
    // Each edge in every square its bounding box (plus reach) touches: bucketed by its midpoint only,
    // a long edge was missed by points near its ends (8 of 31 touching points found in one probe).
    outlines.forEach((o, b) => {
      if (o.group) return;
      for (let i = 0, j = o.n - 1; i < o.n; j = i++) {
        const ax = o.xy[j * 2], ay = o.xy[j * 2 + 1], bx = o.xy[i * 2], by = o.xy[i * 2 + 1];
        for (let gx = Math.floor((Math.min(ax, bx) - reach) / G); gx <= Math.floor((Math.max(ax, bx) + reach) / G); gx++) {
          for (let gy = Math.floor((Math.min(ay, by) - reach) / G); gy <= Math.floor((Math.max(ay, by) + reach) / G); gy++) {
            const key = `${gx},${gy}`;
            (grid.get(key) ?? grid.set(key, []).get(key)).push(b, j, i);
          }
        }
      }
    });
  }
  const near = (a, x, y) => {
    const gx = Math.floor(x / G), gy = Math.floor(y / G);
    for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) {
      const list = grid.get(`${gx + u},${gy + v}`);
      if (!list) continue;
      for (let k = 0; k < list.length; k += 3) {
        const b = list[k];
        if (b === a) continue;
        const q = outlines[b].xy, j = list[k + 1], i = list[k + 2];
        const ax = q[j * 2], ay = q[j * 2 + 1], ex = q[i * 2] - ax, ey = q[i * 2 + 1] - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
        if ((ax + ex * t - x) ** 2 + (ay + ey * t - y) ** 2 < reach * reach) return true;
      }
    }
    return false;
  };
  return outlines.map((o, a) => {
    if (o.group) return null;
    const b = boxes[a];
    const marks = new Uint8Array(o.n);
    for (let c = 0; c < outlines.length; c++) {
      const q = outlines[c], e = boxes[c];
      if (c === a || q.group || e[0] > b[2] || e[2] < b[0] || e[1] > b[3] || e[3] < b[1]) continue;
      const same = q.color === o.color;
      for (let i = 0; i < o.n; i++) {
        if (marks[i] === 1 || (marks[i] === 2 && !same)) continue;
        const x = o.xy[i * 2], y = o.xy[i * 2 + 1];
        if (x < e[0] || x > e[2] || y < e[1] || y > e[3]) continue;
        if (inside(q.xy, q.n, x, y)) marks[i] = same ? 1 : 2;
      }
    }
    if (grid) for (let i = 0; i < o.n; i++) if (!marks[i] && near(a, o.xy[i * 2], o.xy[i * 2 + 1])) marks[i] = 3;
    return marks;
  });
}

// The seam where a cell faces bare bath: share of the square root of its area, at least seam.
export function bareSeam(xy, n, seam, share) {
  if (!(share > 0)) return seam;
  let twice = 0;
  for (let i = 0, k = n - 1; i < n; k = i++) twice += xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
  return Math.max(seam, share * Math.sqrt(Math.abs(twice) / 2));
}

// Plateau borders (#33): where a film presses against another (the simulator marks each point of
// its outline in poly.edgeFaces: 0 bare bath, 1 a film of its colour, 2 a film of another colour, and
// its local squeeze in poly.edgeTau), the outline isn't pulled in, so no white shows; instead a band
// inside the edge darkens with the squeeze, as a soap film's border thickens where films meet. Bare
// bath keeps its seam. Arrays whose length isn't n are stale (the outline was refined) and ignored.
export const BAND = 1; // mm of band per unit of τ above 1
export const BAND_MAX = 3; // mm, the widest band
export const bandWidth = (tau) => Math.min(BAND_MAX, BAND * (tau - 1));
const marks = (a, n) => (a && a.length === n ? a : null);

// keep (see seamed) with every contact point held where it is.
export function contactKeep(keep, faces, n) {
  const f = marks(faces, n);
  if (!f) return keep;
  const out = keep ? Uint8Array.from(keep) : new Uint8Array(n);
  for (let i = 0; i < n; i++) if (f[i]) out[i] = 1;
  return out;
}

// The band's edge segments, grouped by τ rounded to a quarter: [{ tau, seg: [x0, y0, x1, y1, ...] }],
// or null when there's nothing to draw.
export function contactRuns(xy, n, faces, tau) {
  const f = marks(faces, n), t = marks(tau, n);
  if (!f || !t) return null;
  const runs = new Map();
  for (let i = 0; i < n; i++) {
    const j = i === n - 1 ? 0 : i + 1;
    if (!f[i] || !f[j]) continue;
    const q = Math.round(((t[i] + t[j]) / 2) * 4) / 4;
    if (q < 1.25) continue;
    let seg = runs.get(q);
    if (!seg) runs.set(q, (seg = []));
    seg.push(xy[i * 2], xy[i * 2 + 1], xy[j * 2], xy[j * 2 + 1]);
  }
  return runs.size ? [...runs].map(([q, seg]) => ({ tau: q, seg })) : null;
}
