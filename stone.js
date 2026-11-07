// The layout of a broom-straw throw, as partial semi-discrete optimal transport (Lévy 2022; see
// research/2026-11-07-stone-layout-ot-gpu.md). Each drop i lands at a site xᵢ and will cover area Aᵢ.
// Once the films have settled, drop i holds the power (Laguerre) cell
//   Lagᵢ = { x : |x − xᵢ|² − ψᵢ ≤ |x − xⱼ|² − ψⱼ for all j },
// clipped by the disc of radius √ψᵢ: a lone drop is a disc, packed drops share straight walls,
// and what no cell reaches is bare size. The weights ψ are found so every cell has its area.
// This is McNair et al.'s Monge–Ampère equilibrium in the limit of point-like deposits. No DOM.

const DISC_SIDES = 72;
const DAMPING = 0.8; // of the diagonal Newton step; neighbours move together, so a full step overshoots
// Tangent lines this far out (as a share of r) make a DISC_SIDES-gon with exactly the disc's area.
const APOTHEM = Math.sqrt(Math.PI / (DISC_SIDES * Math.tan(Math.PI / DISC_SIDES)));

// Sutherland–Hodgman on a convex polygon { pts: [x, y, ...], tags: [...] }, where tags[k] names the
// line edge k (from point k to k + 1) lies on. Keeps the part where a·x + b·y ≤ c; the new edge
// along that line gets `tag`.
function clip({ pts, tags }, a, b, c, tag) {
  const out = [];
  const outTags = [];
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const px = pts[i * 2], py = pts[i * 2 + 1];
    const k = (i + 1) % n;
    const qx = pts[k * 2], qy = pts[k * 2 + 1];
    const fp = a * px + b * py - c;
    const fq = a * qx + b * qy - c;
    if (fp <= 0) {
      out.push(px, py);
      outTags.push(fq <= 0 ? tags[i] : tags[i]);
    }
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push(px + (qx - px) * t, py + (qy - py) * t);
      // Leaving the half-plane, the edge from here runs along the cut; entering, it carries on.
      outTags.push(fp < 0 ? tag : tags[i]);
    }
  }
  return { pts: out, tags: outTags };
}

export function polygonArea(poly) {
  let s = 0;
  const n = poly.length / 2;
  for (let i = 0, k = n - 1; i < n; k = i++) s += poly[k * 2] * poly[i * 2 + 1] - poly[i * 2] * poly[k * 2 + 1];
  return Math.abs(s) / 2;
}

// The cells for sites [x, y] with target areas, inside the convex domain (flat polygon,
// counter-clockwise). Returns { cells: [flat polygon], weights, error }.
//
// Damped Newton on the diagonal (after Kitagawa, Mérigot & Thibert 2019): ∂|Cᵢ|/∂ψᵢ is
// Σ (wall length)/(2|xᵢ − xⱼ|) over shared walls plus (arc length)/(2√ψᵢ) where the disc bounds it,
// so each weight moves by (Aᵢ − |Cᵢ|) over that.
// weights, if given, warm-start the solve, as when re-solving a throw tick by tick.
export function partialTransport(sites, targets, domain, { iterations = 300, tolerance = 0.01, weights } = {}) {
  const n = sites.length;
  const psi = weights && weights.length === n ? weights.map((w, i) => (w > 0 ? w : targets[i] / Math.PI)) : targets.map((A) => A / Math.PI);
  // Sites bucketed on a grid as wide as the biggest disc, so each cell is clipped only by those
  // whose discs could reach it. Rebuilt each round, since the discs change.
  let grid = null, gridSize = 1;
  const bucket = () => {
    gridSize = 2 * Math.sqrt(Math.max(...psi, 1e-9)) + 1e-6;
    grid = new Map();
    sites.forEach(([x, y], j) => {
      const key = `${Math.floor(x / gridSize)},${Math.floor(y / gridSize)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(j);
    });
  };
  const DOMAIN = -1, DISC = -2;
  let cells = [];
  let error = Infinity;
  const cellOf = (i) => {
    let cell = { pts: domain, tags: domain.map(() => DOMAIN).slice(0, domain.length / 2) };
    const [xi, yi] = sites[i];
    const ri = Math.sqrt(Math.max(psi[i], 1e-9));
    const gx = Math.floor(xi / gridSize), gy = Math.floor(yi / gridSize);
    const near = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of grid.get(`${gx + a},${gy + b}`) ?? []) near.push(j);
    for (const j of near) {
      if (j === i || cell.pts.length < 6) continue;
      const [xj, yj] = sites[j];
      // Discs that don't overlap can't share a wall inside either.
      if ((xj - xi) ** 2 + (yj - yi) ** 2 > (ri + Math.sqrt(Math.max(psi[j], 0))) ** 2) continue;
      // |x − xi|² − ψi ≤ |x − xj|² − ψj  ⇔  2(xj − xi)·x ≤ |xj|² − |xi|² − ψj + ψi
      cell = clip(cell, 2 * (xj - xi), 2 * (yj - yi), xj * xj + yj * yj - xi * xi - yi * yi - psi[j] + psi[i], j);
    }
    // A packed cell that lies wholly inside its disc needs no clipping by it.
    let far = 0;
    for (let k = 0; k < cell.pts.length; k += 2) far = Math.max(far, (cell.pts[k] - xi) ** 2 + (cell.pts[k + 1] - yi) ** 2);
    if (far <= (ri * APOTHEM) ** 2) return cell;
    for (let s = 0; s < DISC_SIDES && cell.pts.length >= 6; s++) {
      const t = ((s + 0.5) * 2 * Math.PI) / DISC_SIDES;
      const a = Math.cos(t), b = Math.sin(t);
      cell = clip(cell, a, b, a * xi + b * yi + ri * APOTHEM, DISC);
    }
    return cell;
  };
  // The step adapts: a round that leaves the total misfit worse is undone and the step halved.
  let damping = DAMPING;
  let lastMisfit = Infinity;
  let lastPsi = psi.slice();
  let lastStep = null;
  for (let it = 0; it < iterations; it++) {
    bucket();
    const all = sites.map((_, i) => cellOf(i));
    let misfit = 0;
    for (let i = 0; i < n; i++) {
      const a = all[i].pts.length >= 6 ? polygonArea(all[i].pts) : 0;
      misfit += (a - targets[i]) ** 2;
    }
    if (misfit > lastMisfit && lastStep) {
      damping = Math.max(0.02, damping / 2);
      for (let i = 0; i < n; i++) psi[i] = Math.max(1e-6, lastPsi[i] + damping * lastStep[i]);
      continue;
    }
    damping = Math.min(0.9, damping * 1.15);
    lastMisfit = misfit;
    lastPsi = psi.slice();
    cells = all.map((c) => c.pts);
    error = 0;
    const step = [];
    for (let i = 0; i < n; i++) {
      const { pts, tags } = all[i];
      const a = pts.length >= 6 ? polygonArea(pts) : 0;
      error = Math.max(error, Math.abs(a - targets[i]) / targets[i]);
      let h = 0;
      const m = pts.length / 2;
      for (let k = 0; k < m; k++) {
        const tag = tags[k];
        if (tag === DOMAIN) continue;
        const len = Math.hypot(pts[((k + 1) % m) * 2] - pts[k * 2], pts[((k + 1) % m) * 2 + 1] - pts[k * 2 + 1]);
        if (tag === DISC) h += len / (2 * Math.sqrt(Math.max(psi[i], 1e-9)));
        else h += len / (2 * Math.hypot(sites[tag][0] - sites[i][0], sites[tag][1] - sites[i][1]));
      }
      step.push(h > 0 ? (targets[i] - a) / h : 0);
    }
    if (error < tolerance) break;
    lastStep = step;
    for (let i = 0; i < n; i++) psi[i] = Math.max(1e-6, psi[i] + damping * step[i]);
    // An empty cell has no slope to go by: it grows gently every round, as if a lone disc, and
    // that growth is kept even when the rest of a round is undone, so it can't stall.
    for (let i = 0; i < n; i++) {
      if (all[i].pts.length >= 6 && polygonArea(all[i].pts) > 0) continue;
      psi[i] += targets[i] / (2 * Math.PI);
      lastPsi[i] = psi[i];
    }
  }
  return { cells, weights: psi, error };
}

// Pulls a convex polygon in by d along its edges' normals (an inner parallel polygon).
export function erode(poly, d) {
  let out = poly;
  const n = poly.length / 2;
  // Counter-clockwise: the inside is to the left of each edge.
  let twice = 0;
  for (let i = 0, k = n - 1; i < n; k = i++) twice += poly[k * 2] * poly[i * 2 + 1] - poly[i * 2] * poly[k * 2 + 1];
  const ccw = twice > 0;
  for (let i = 0; i < n && out.length >= 6; i++) {
    const k = (i + 1) % n;
    const ex = poly[k * 2] - poly[i * 2], ey = poly[k * 2 + 1] - poly[i * 2 + 1];
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;
    // Outward normal, then keep points at least d inside the edge.
    const nx = ccw ? ey / len : -ey / len;
    const ny = ccw ? -ex / len : ex / len;
    out = clip({ pts: out, tags: out.map(() => 0) }, nx, ny, nx * poly[i * 2] + ny * poly[i * 2 + 1] - d, 0).pts;
  }
  return out;
}

export const ccw = (poly) => {
  let twice = 0;
  const n = poly.length / 2;
  for (let i = 0, k = n - 1; i < n; k = i++) twice += poly[k * 2] * poly[i * 2 + 1] - poly[i * 2] * poly[k * 2 + 1];
  if (twice >= 0) return poly;
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(poly[i * 2], poly[i * 2 + 1]);
  return out;
};

// A convex polygon (counter-clockwise) grown outward by r with round corners: its Minkowski sum
// with a disc. Eroding by d + r and then growing by r rounds every corner to radius r, as fronts
// that meet still curve where three cells come together (McNair et al.'s δ^½ corners).
export function grow(poly, r, perCorner = 6) {
  const n = poly.length / 2;
  if (n < 3 || r <= 0) return poly;
  const out = [];
  const normal = (i) => {
    const k = (i + 1) % n;
    const ex = poly[k * 2] - poly[i * 2], ey = poly[k * 2 + 1] - poly[i * 2 + 1];
    const len = Math.hypot(ex, ey) || 1;
    return [ey / len, -ex / len];
  };
  for (let i = 0; i < n; i++) {
    const [ax, ay] = normal((i + n - 1) % n);
    const [bx, by] = normal(i);
    let a0 = Math.atan2(ay, ax);
    let a1 = Math.atan2(by, bx);
    while (a1 < a0) a1 += 2 * Math.PI;
    if (a1 - a0 > Math.PI) a1 = a0; // a reflex turn from rounding error: no arc
    for (let s = 0; s <= perCorner; s++) {
      const t = a0 + ((a1 - a0) * s) / perCorner;
      out.push(poly[i * 2] + r * Math.cos(t), poly[i * 2 + 1] + r * Math.sin(t));
    }
  }
  return out;
}
