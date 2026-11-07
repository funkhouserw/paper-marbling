// The heart outline Heart drop places and Heart strike bends round loops towards: Ilse's pick, "B"
// from the 2026-11-07 candidates. A softer V between round lobes, shoulders sloping into a long,
// fine point, about 1.6 times as tall as it is wide. No DOM, so the engine and tests can use it.
//
// The outline is built from cubic Béziers on a heart 1 wide, with its notch at the top. It comes
// back as an engine outline: counter-clockwise, y up, centred on the middle of its height, point
// down at angle 0.

export const HEART_B = { notch: 0.14, lobe: 0.25, shoulder: 0.28, height: 1.6, tip: 0.6 };

// The right half's segments, from the notch round to the point, in a frame with y down.
function rightHalf({ notch, lobe, shoulder, height, tip }) {
  const ny = height - (0.30 + 0.25 * tip); // where the sides meet the tapering point
  const neck = 0.10 - 0.05 * tip;          // half-width there
  return [
    [[0, notch], [0.06, notch - 0.10], [lobe - 0.12, -0.02], [lobe, 0]],
    [[lobe, 0], [lobe + 0.14, 0.02], [0.5, shoulder - 0.16], [0.5, shoulder]],
    [[0.5, shoulder], [0.5, shoulder + 0.40], [neck * 1.9, ny - (height - ny) * 0.9], [neck, ny]],
    [[neck, ny], [neck * 0.55, ny + (height - ny) * 0.45], [0.003, height - 0.04], [0, height]],
  ];
}

const bez = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
};

// Points round a unit-width heart (y down, notch at the top), clockwise as seen on screen.
function unitPoints(shape, perSegment) {
  const right = rightHalf(shape);
  const pts = [];
  // Left half first, from the point up to the notch (mirrored), then the right half back down.
  for (let s = right.length - 1; s >= 0; s--) {
    const [p0, p1, p2, p3] = right[s].map(([x, y]) => [-x, y]);
    for (let i = perSegment; i > 0; i--) pts.push(bez(p0, p1, p2, p3, i / perSegment));
  }
  for (const [p0, p1, p2, p3] of right) {
    for (let i = 0; i < perSegment; i++) pts.push(bez(p0, p1, p2, p3, i / perSegment));
  }
  return pts;
}

const signedArea = (pts) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
};

// Each feature can vary by up to this fraction, times `variation`, so no two hearts match.
const SPREAD = { notch: 0.35, lobe: 0.10, shoulder: 0.12, height: 0.08, tip: 0.25 };

// The heart's outline in tank units. Give `area` (mm²) or `width` (mm); `angle` turns it in degrees,
// counter-clockwise, with 0 pointing down. `variation` (0 to 1) nudges its proportions using
// `random`, so a script with a seed repeats exactly. Returns { xy, n, area }, with xy sized for the
// engine (room for twice the points).
export function heartOutline({
  x = 0, y = 0, area, width, angle = 0, variation = 0, random = Math.random, shape = HEART_B, points = 120,
} = {}) {
  const s = { ...shape };
  if (variation > 0) {
    for (const [k, spread] of Object.entries(SPREAD)) s[k] = shape[k] * (1 + (random() * 2 - 1) * spread * variation);
  }
  // Reversed: round the screen clockwise is clockwise with y up too, and the engine wants counter.
  const unit = unitPoints(s, Math.max(4, Math.round(points / 8))).reverse();
  const unitArea = Math.abs(signedArea(unit));
  const scale = area !== undefined ? Math.sqrt(area / unitArea) : (width ?? 100);
  // Centre on the middle of its height, flip y up so the point is down, then turn.
  const midY = s.height / 2;
  const a = (angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const n = unit.length;
  const xy = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) {
    const ux = unit[i][0] * scale;
    const uy = (midY - unit[i][1]) * scale;
    xy[i * 2] = x + ux * cos - uy * sin;
    xy[i * 2 + 1] = y + ux * sin + uy * cos;
  }
  return { xy, n, area: unitArea * scale * scale };
}
