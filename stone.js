// The layout of a broom-straw throw, as partial semi-discrete optimal transport (Lévy 2022, "Partial
// optimal transport for a constant-volume Lagrangian mesh with free boundaries", J. Comput. Phys.;
// Kitagawa, Mérigot & Thibert 2019 for the Newton solver). Each drop i lands at a site xᵢ and will cover area Aᵢ.
// Once the films have settled, drop i holds the power (Laguerre) cell
//   Lagᵢ = { x : |x − xᵢ|² − ψᵢ ≤ |x − xⱼ|² − ψⱼ for all j },
// clipped by the disc of radius √ψᵢ: a lone drop is a disc, packed drops share straight walls,
// and what no cell reaches is bare size. The weights ψ are found so every cell has its area.
// This is McNair et al.'s Monge–Ampère equilibrium in the limit of point-like deposits. No DOM.

const DISC_SIDES = 72; // a whole disc's outline is drawn with this many points
const DAMPING = 0.8; // of the diagonal Newton step; neighbours move together, so a full step overshoots
// Arcs are sampled on a circle this much wider (as a share of r), so a DISC_SIDES-gon inscribed in
// it has exactly the disc's area.
const CHORD = Math.sqrt((2 * Math.PI / DISC_SIDES) / Math.sin(2 * Math.PI / DISC_SIDES));
const ARC_STEP = (2 * Math.PI) / DISC_SIDES;

// A convex polygon { pts, tags } (counter-clockwise) clipped by the disc of radius r about (cx, cy),
// exactly, in one walk round its edges: each edge keeps the part inside the circle, and where the
// outline leaves the circle an arc, sampled every ARC_STEP or finer, carries it round to where it
// comes back in. The arc's edges get `tag`. (It was 72 half-plane clips, one per side of a polygon
// standing in for the disc: 70–85 % of a layout's time, research/2026-11-08-maths-and-speed.md.)
function clipDisc({ pts, tags }, cx, cy, r, tag) {
  const m = pts.length / 2;
  const r2 = r * r;
  const pieces = [];
  for (let i = 0; i < m; i++) {
    const k = i + 1 === m ? 0 : i + 1;
    const px = pts[i * 2] - cx, py = pts[i * 2 + 1] - cy;
    const dx = pts[k * 2] - cx - px, dy = pts[k * 2 + 1] - cy - py;
    const a = dx * dx + dy * dy;
    if (a < 1e-24) continue;
    const b = px * dx + py * dy; // half the linear term
    const c = px * px + py * py - r2;
    const disc = b * b - a * c;
    if (disc <= 0) continue;
    const s = Math.sqrt(disc);
    const lo = Math.max(0, (-b - s) / a), hi = Math.min(1, (-b + s) / a);
    if (!(hi > lo)) continue;
    pieces.push({ x0: px + dx * lo, y0: py + dy * lo, x1: px + dx * hi, y1: py + dy * hi, exit: hi < 1, tag: tags[i] });
  }
  const out = [], outTags = [];
  const arc = (from, to) => {
    let span = to - from;
    while (span <= 1e-12) span += 2 * Math.PI;
    while (span > 2 * Math.PI) span -= 2 * Math.PI;
    const steps = Math.ceil(span / ARC_STEP - 1e-9);
    for (let s = 1; s < steps; s++) {
      const t = from + (span * s) / steps;
      out.push(cx + r * Math.cos(t), cy + r * Math.sin(t));
      outTags.push(tag);
    }
  };
  if (!pieces.length) {
    // No edge reaches inside the circle: the disc lies wholly inside the polygon, or outside it.
    let inside = m >= 3;
    for (let i = 0; i < m && inside; i++) {
      const k = i + 1 === m ? 0 : i + 1;
      if ((pts[k * 2] - pts[i * 2]) * (cy - pts[i * 2 + 1]) - (pts[k * 2 + 1] - pts[i * 2 + 1]) * (cx - pts[i * 2]) < 0) inside = false;
    }
    if (!inside) return { pts: [], tags: [] };
    out.push(cx + r, cy);
    outTags.push(tag);
    arc(0, 2 * Math.PI);
    return { pts: out, tags: outTags };
  }
  for (let p = 0; p < pieces.length; p++) {
    const piece = pieces[p];
    out.push(cx + piece.x0, cy + piece.y0);
    outTags.push(piece.tag);
    if (!piece.exit) continue; // it runs on to the next edge's start, a corner inside the circle
    const next = pieces[(p + 1) % pieces.length];
    out.push(cx + piece.x1, cy + piece.y1);
    outTags.push(tag);
    arc(Math.atan2(piece.y1, piece.x1), Math.atan2(next.y0, next.x0));
  }
  return { pts: out, tags: outTags };
}

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

// The same clip without edge tags, for erode.
function cut(pts, a, b, c) {
  const out = [];
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const px = pts[i * 2], py = pts[i * 2 + 1];
    const k = i + 1 === n ? 0 : i + 1;
    const qx = pts[k * 2], qy = pts[k * 2 + 1];
    const fp = a * px + b * py - c;
    const fq = a * qx + b * qy - c;
    if (fp <= 0) out.push(px, py);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push(px + (qx - px) * t, py + (qy - py) * t);
    }
  }
  return out;
}

// The point of a polygon's outline nearest (x, y), or null if (x, y) is inside it.
function nearestOnOutline(pts, x, y) {
  const m = pts.length / 2;
  let best = Infinity, bx = 0, by = 0, inside = false;
  for (let i = 0, k = m - 1; i < m; k = i++) {
    const ax = pts[k * 2], ay = pts[k * 2 + 1], cx = pts[i * 2], cy = pts[i * 2 + 1];
    if ((ay > y) !== (cy > y) && x < ax + ((y - ay) * (cx - ax)) / (cy - ay)) inside = !inside;
    const ex = cx - ax, ey = cy - ay;
    const len2 = ex * ex + ey * ey || 1e-12;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / len2));
    const px = ax + ex * t, py = ay + ey * t;
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < best) { best = d; bx = px; by = py; }
  }
  return inside || best < 1e-12 ? null : [bx, by];
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
// obstacles: convex polygons (settled cells left where they are) that no cell may cross. A cell near
// one is cut by the line touching the obstacle at its point nearest the cell's site, so it presses
// flat against it; those walls don't move with the weights, like the domain's.
// law, if given, replaces target areas with pressure balance (research/2026-11-07-broom-pressure-math.md
// sec. 3.1): { A0, tauMax, kappa, background, Pi, dPi }. Cell i's weight then satisfies
//   ψᵢ = R0ᵢ² + κ·(Π(A0ᵢ/|Cᵢ|) − background),  R0ᵢ² = A0ᵢ/π,
// so a lone cell is exactly its rest disc, packed cells press flat at equal pressure, and a squeezed
// cell can never pass its cap (Π diverges there). targets is then only used for scale.
export function partialTransport(sites, targets, domain, { iterations = 300, tolerance = 0.01, weights, obstacles = [], law = null } = {}) {
  const n = sites.length;
  const R0sq = law ? law.A0.map((a) => a / Math.PI) : null;
  const residual = (i, area) => psi[i] - R0sq[i] - law.kappa * (law.Pi(law.A0[i] / Math.max(area, 1e-9), law.tauMax[i]) - (law.background ?? 0));
  // For the line search: past the cap τ counts only by its logarithm, and each cell's misfit is in
  // units of its own stiffest pressure, so one empty cell (τ → ∞ at area 0) can't outweigh every
  // other cell's, while crushing any cell past its cap still costs.
  const bounded = (i, area) => {
    const tau = law.A0[i] / Math.max(area, 1e-9), cap = law.tauMax[i];
    const P = tau <= cap ? law.Pi(tau, cap) : law.Pi(cap, cap) * (1 + Math.log(tau / cap));
    return psi[i] - R0sq[i] - law.kappa * (P - (law.background ?? 0));
  };
  const scale = law ? law.A0.map((a, i) => R0sq[i] + law.kappa * law.Pi(law.tauMax[i], law.tauMax[i])) : null;
  const blocks = obstacles.filter((o) => o.length >= 6).map((pts) => {
    const c = centreOf(pts);
    let r = 0;
    for (let k = 0; k < pts.length; k += 2) r = Math.max(r, Math.hypot(pts[k] - c.x, pts[k + 1] - c.y));
    return { pts, x: c.x, y: c.y, r };
  });
  const psi = weights && weights.length === n ? weights.map((w, i) => (w > 0 ? w : targets[i] / Math.PI)) : targets.map((A) => A / Math.PI);
  // Discs bucketed on a grid about as wide as a typical disc, each disc in every square it covers,
  // so a cell is clipped only by sites whose discs could reach it (two overlapping discs share a
  // square). Rebuilt each round, since the discs change. One big disc no longer makes every site
  // a candidate for every other, as a grid sized by the biggest disc did.
  let grid = null, gridSize = 1;
  const big = [];
  const span = (v) => Math.floor(v / gridSize);
  const key = (gx, gy) => (gx + 1048576) * 2097152 + (gy + 1048576);
  const bucket = () => {
    const radii = psi.map((w) => Math.sqrt(Math.max(w, 0))).sort((a, b) => a - b);
    gridSize = 2 * Math.max(radii[radii.length >> 1], 1e-3);
    grid = new Map();
    big.length = 0;
    sites.forEach(([x, y], j) => {
      const r = Math.sqrt(Math.max(psi[j], 0));
      // A disc many squares wide is checked by every cell instead of filling the grid.
      if (r > 8 * gridSize) { big.push(j); return; }
      for (let gx = span(x - r); gx <= span(x + r); gx++) {
        for (let gy = span(y - r); gy <= span(y + r); gy++) {
          const k = key(gx, gy);
          const list = grid.get(k);
          if (list) list.push(j);
          else grid.set(k, [j]);
        }
      }
    });
  };
  const stamp = new Int32Array(n).fill(-1);
  const DOMAIN = -1, DISC = -2;
  let cells = [];
  let error = Infinity;
  const cellOf = (i) => {
    let cell = { pts: domain, tags: domain.map(() => DOMAIN).slice(0, domain.length / 2) };
    const [xi, yi] = sites[i];
    const ri = Math.sqrt(Math.max(psi[i], 1e-9));
    const near = [];
    stamp[i] = i;
    // A big disc of its own may meet any site: it checks them all.
    if (ri > 8 * gridSize) {
      for (let j = 0; j < n; j++) if (j !== i) { stamp[j] = i; near.push(j); }
    } else {
      for (let gx = span(xi - ri); gx <= span(xi + ri); gx++) {
        for (let gy = span(yi - ri); gy <= span(yi + ri); gy++) {
          for (const j of grid.get(key(gx, gy)) ?? []) if (stamp[j] !== i) { stamp[j] = i; near.push(j); }
        }
      }
    }
    for (const j of big) if (stamp[j] !== i) { stamp[j] = i; near.push(j); }
    // Nearest first: the cell shrinks fastest, so later clips have fewer points to cut.
    near.sort((a, b) => (sites[a][0] - xi) ** 2 + (sites[a][1] - yi) ** 2 - (sites[b][0] - xi) ** 2 - (sites[b][1] - yi) ** 2);
    for (const j of near) {
      if (j === i || cell.pts.length < 6) continue;
      const [xj, yj] = sites[j];
      // Discs that don't overlap can't share a wall inside either.
      if ((xj - xi) ** 2 + (yj - yi) ** 2 > (ri + Math.sqrt(Math.max(psi[j], 0))) ** 2) continue;
      // |x − xi|² − ψi ≤ |x − xj|² − ψj  ⇔  2(xj − xi)·x ≤ |xj|² − |xi|² − ψj + ψi
      cell = clip(cell, 2 * (xj - xi), 2 * (yj - yi), xj * xj + yj * yj - xi * xi - yi * yi - psi[j] + psi[i], j);
    }
    for (const o of blocks) {
      if (cell.pts.length < 6) break;
      if (Math.hypot(o.x - xi, o.y - yi) > ri + o.r) continue;
      const q = nearestOnOutline(o.pts, xi, yi);
      if (!q) continue;
      const nx = xi - q[0], ny = yi - q[1];
      // Keep n·(x − q) ≥ 0, the side of the touching line the site is on.
      cell = clip(cell, -nx, -ny, -(nx * q[0] + ny * q[1]), DOMAIN);
    }
    // A packed cell that lies wholly inside its disc needs no clipping by it.
    let far = 0;
    for (let k = 0; k < cell.pts.length; k += 2) far = Math.max(far, (cell.pts[k] - xi) ** 2 + (cell.pts[k + 1] - yi) ** 2);
    if (far <= (ri * CHORD) ** 2) return cell;
    return cell.pts.length >= 6 ? clipDisc(cell, xi, yi, ri * CHORD, DISC) : cell;
  };
  // Damped Newton (Kitagawa, Mérigot & Thibert 2019). ∂|Cᵢ|/∂ψⱼ = −|Γᵢⱼ| / (2|xᵢ − xⱼ|) for
  // neighbours sharing a wall Γᵢⱼ, and ∂|Cᵢ|/∂ψᵢ = Σⱼ |Γᵢⱼ| / (2|xᵢ − xⱼ|) + (arc length)/(2√ψᵢ).
  // That Jacobian is a graph Laplacian plus a diagonal, so the step solves L·Δψ = A − |C| by
  // conjugate gradients, and is halved until the misfit falls.
  const solve = () => {
    bucket();
    const all = sites.map((_, i) => cellOf(i));
    const area = all.map((c) => (c.pts.length >= 6 ? polygonArea(c.pts) : 0));
    let misfit = 0;
    if (law) for (let i = 0; i < n; i++) misfit += (bounded(i, area[i]) / scale[i]) ** 2;
    else for (let i = 0; i < n; i++) misfit += (area[i] - targets[i]) ** 2;
    return { all, area, misfit };
  };
  let now = solve();
  let stalled = 0;
  for (let it = 0; it < iterations; it++) {
    cells = now.all.map((c) => c.pts);
    error = 0;
    if (law) for (let i = 0; i < n; i++) error = Math.max(error, Math.abs(residual(i, now.area[i])) / R0sq[i]);
    else for (let i = 0; i < n; i++) error = Math.max(error, Math.abs(now.area[i] - targets[i]) / targets[i]);
    if (error < tolerance) break;
    // The Jacobian, as neighbour weights and a diagonal.
    const nbr = Array.from({ length: n }, () => new Map());
    const diag = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const { pts, tags } = now.all[i];
      const m = pts.length / 2;
      for (let k = 0; k < m; k++) {
        const tag = tags[k];
        if (tag === DOMAIN) continue;
        const len = Math.hypot(pts[((k + 1) % m) * 2] - pts[k * 2], pts[((k + 1) % m) * 2 + 1] - pts[k * 2 + 1]);
        if (tag === DISC) { diag[i] += len / (2 * Math.sqrt(Math.max(psi[i], 1e-9))); continue; }
        const w = len / (2 * Math.hypot(sites[tag][0] - sites[i][0], sites[tag][1] - sites[i][1]));
        diag[i] += w;
        nbr[i].set(tag, (nbr[i].get(tag) ?? 0) + w);
      }
    }
    const r = new Float64Array(n);
    // With a law, Newton's step d solves (I + D·H) d = −g, D = κ Π'(τ) A0/A², H the matrix above;
    // multiplied through by D⁻¹ it is (D⁻¹ + H) d = −D⁻¹ g, symmetric and positive definite.
    const inv = law ? new Float64Array(n) : null;
    if (law) {
      for (let i = 0; i < n; i++) {
        const A = Math.max(now.area[i], 1e-9);
        const D = law.kappa * law.dPi(law.A0[i] / A, law.tauMax[i]) * law.A0[i] / (A * A);
        inv[i] = 1 / Math.max(D, 1e-12);
        r[i] = -residual(i, now.area[i]) * inv[i];
      }
    } else for (let i = 0; i < n; i++) r[i] = targets[i] - now.area[i];
    // Empty cells have no slope: they're left out of the solve and grow on their own below.
    const live = (i) => diag[i] > 1e-12;
    const apply = (v, out) => {
      for (let i = 0; i < n; i++) {
        if (!live(i)) { out[i] = v[i]; continue; }
        let sum = (diag[i] * (1 + 1e-9) + 1e-12 + (inv ? inv[i] : 0)) * v[i];
        for (const [j, w] of nbr[i]) if (live(j)) sum -= w * v[j];
        out[i] = sum;
      }
    };
    const x = new Float64Array(n);
    const rr = Float64Array.from(r, (v, i) => (live(i) ? v : 0));
    const pp = Float64Array.from(rr);
    const Ap = new Float64Array(n);
    let rs = rr.reduce((a, v) => a + v * v, 0);
    const stop = rs * 1e-10;
    for (let k = 0; k < 200 && rs > stop; k++) {
      apply(pp, Ap);
      const pAp = pp.reduce((a, v, i) => a + v * Ap[i], 0);
      if (!(pAp > 0)) break;
      const alpha = rs / pAp;
      for (let i = 0; i < n; i++) { x[i] += alpha * pp[i]; rr[i] -= alpha * Ap[i]; }
      const next = rr.reduce((a, v) => a + v * v, 0);
      for (let i = 0; i < n; i++) pp[i] = rr[i] + (next / rs) * pp[i];
      rs = next;
    }
    // A cell hemmed in on every side by other cells, fixed walls and the domain has no disc edge, so
    // the Jacobian among such cells is a bare graph Laplacian: singular, since raising all their
    // weights together changes nothing. Asked for areas they can't have, conjugate gradients then
    // returns an enormous step (weights near 1e18 were seen, and the cells vanished). No step may move
    // a weight by more than a few times the largest target's own scale.
    let biggest = 0;
    for (let i = 0; i < n; i++) if (Math.abs(x[i]) > biggest) biggest = Math.abs(x[i]);
    const scale = law ? 4 * Math.max(...R0sq, ...psi) : 4 * Math.max(...targets) / Math.PI;
    if (biggest > scale) for (let i = 0; i < n; i++) x[i] *= scale / biggest;
    const before = psi.slice();
    let t = 1;
    let tried = null;
    for (let h = 0; h < 10; h++, t /= 2) {
      for (let i = 0; i < n; i++) {
        psi[i] = live(i) ? Math.max(1e-6, before[i] + t * x[i]) : before[i];
      }
      // An empty cell holds its own site again once ψᵢ > max over j of (ψⱼ − |xᵢ − xⱼ|²).
      for (let i = 0; i < n; i++) {
        if (live(i)) continue;
        let need = 0;
        for (let j = 0; j < n; j++) if (j !== i) need = Math.max(need, psi[j] - ((sites[j][0] - sites[i][0]) ** 2 + (sites[j][1] - sites[i][1]) ** 2));
        // Part of the step like the rest, so a short enough step always lowers the misfit.
        psi[i] = before[i] + t * Math.max(0, need + (law ? R0sq[i] : targets[i] / Math.PI) / 8 - before[i]);
      }
      tried = solve();
      if (tried.misfit < now.misfit) break;
      tried = null;
    }
    // No step along Newton's direction lowers the misfit: this is as close as the sites allow.
    // (Taking a worse step anyway, as before, kept crowded or overfull layouts thrashing every
    // round to the limit.) Likewise stop once a round gains less than a thousandth.
    if (!tried) { psi.splice(0, n, ...before); break; }
    const gain = (now.misfit - tried.misfit) / now.misfit;
    now = tried;
    stalled = gain < 1e-3 ? stalled + 1 : 0;
    if (stalled >= 3) break;
  }
  cells = now.all.map((c) => c.pts);
  error = 0;
  if (law) for (let i = 0; i < n; i++) error = Math.max(error, Math.abs(residual(i, now.area[i])) / R0sq[i]);
  else for (let i = 0; i < n; i++) error = Math.max(error, Math.abs(now.area[i] - targets[i]) / targets[i]);
  // tags[i][k] names what edge k of cell i lies on: a neighbour's index, DOMAIN (-1, the domain or an
  // obstacle) or DISC (-2, the cell's own disc: bare bath).
  return { cells, weights: psi, error, areas: now.area, tags: now.all.map((c) => c.tags) };
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
    out = cut(out, nx, ny, nx * poly[i * 2] + ny * poly[i * 2 + 1] - d);
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

// The centre and area of a polygon.
export function centreOf(poly) {
  let twice = 0, cx = 0, cy = 0;
  const n = poly.length / 2;
  for (let i = 0, k = n - 1; i < n; k = i++) {
    const cross = poly[k * 2] * poly[i * 2 + 1] - poly[i * 2] * poly[k * 2 + 1];
    twice += cross;
    cx += (poly[k * 2] + poly[i * 2]) * cross;
    cy += (poly[k * 2 + 1] + poly[i * 2 + 1]) * cross;
  }
  return { x: cx / (3 * twice), y: cy / (3 * twice), area: Math.abs(twice) / 2 };
}

// A point pulled into a convex polygon (counter-clockwise) along its ray from the centre, if it lies
// outside, so points in different directions stay apart.
export function keepInside(poly, [x, y]) {
  const n = poly.length / 2;
  const inside = (px, py) => {
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      if ((poly[k * 2] - poly[i * 2]) * (py - poly[i * 2 + 1]) - (poly[k * 2 + 1] - poly[i * 2 + 1]) * (px - poly[i * 2]) < 0) return false;
    }
    return true;
  };
  if (inside(x, y)) return [x, y];
  const { x: cx, y: cy } = centreOf(poly);
  let lo = 0, hi = 1;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if (inside(cx + (x - cx) * mid, cy + (y - cy) * mid)) lo = mid;
    else hi = mid;
  }
  const t = lo * 0.9;
  return [cx + (x - cx) * t, cy + (y - cy) * t];
}
