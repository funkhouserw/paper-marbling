// What an example's marbling is like, as numbers taken from its outlines (request #50), so a change
// that makes an example into something else can be flagged for a person to look at.
//
// Pixel measures don't work for this: a marbled sheet is a texture, and the same recipe on another
// seed reshuffles every pixel while looking the same (SSIM scores it about 0.2). What changes when a
// pattern breaks is the direction and amount of its lines, and how its ink is shared out, and the
// outlines in m.polys give those exactly. research/2026-11-08-image-metrics.md has the measurements:
// on the Feather plumes regression (#49) the orientation histogram moved 12–17× as far as between
// two seeds of the same look, and the outline length fell to a third.
//
// Features, overall and on a 4×3 grid of tiles (so a report can say where):
//   orient    length-weighted histogram of outline directions, 12 bins over 180°
//   length    outline length per mm² of tank
//   shapes    how many outlines of at least a square millimetre (smaller ones are specks)
//   colours   share of the tank's area by colour (overlapping ink counts twice, consistently)
//   sizes     log10 of the area of the shape holding the 10th, 50th and 90th percentile of the ink
//             area, in mm² (weighted by area, so the specks that cut ribbons leave don't set it)

const BINS = 12;
const COLS = 4, ROWS = 3;
const SPECK = 1; // mm²: outlines smaller than this don't count as shapes

const area = (xy, n) => {
  let a = 0;
  for (let i = 0, k = n - 1; i < n; k = i++) a += xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
  return Math.abs(a) / 2;
};

// polys: [{ xy, n, color }] in tank millimetres, the tank centred on 0 (as Marble keeps them).
export function features(polys, width, height) {
  const tiles = Array.from({ length: COLS * ROWS }, () => ({ orient: new Array(BINS).fill(0), length: 0 }));
  const orient = new Array(BINS).fill(0);
  let length = 0;
  const colours = {};
  const areas = [];
  for (const p of polys) {
    const { xy, n } = p;
    if (!n) continue;
    const a = area(xy, n);
    areas.push(a);
    colours[p.color] = (colours[p.color] ?? 0) + a / (width * height);
    for (let i = 0, k = n - 1; i < n; k = i++) {
      const dx = xy[i * 2] - xy[k * 2], dy = xy[i * 2 + 1] - xy[k * 2 + 1];
      const l = Math.hypot(dx, dy);
      if (!l) continue;
      const mx = (xy[i * 2] + xy[k * 2]) / 2 + width / 2, my = height / 2 - (xy[i * 2 + 1] + xy[k * 2 + 1]) / 2;
      if (mx < 0 || mx >= width || my < 0 || my >= height) continue; // off the tank
      let t = Math.atan2(dy, dx);
      if (t < 0) t += Math.PI;
      const bin = Math.min(BINS - 1, Math.floor((t / Math.PI) * BINS));
      orient[bin] += l;
      length += l;
      const tile = tiles[Math.min(ROWS - 1, Math.floor((my / height) * ROWS)) * COLS + Math.min(COLS - 1, Math.floor((mx / width) * COLS))];
      tile.orient[bin] += l;
      tile.length += l;
    }
  }
  const norm = (h, total) => h.map((v) => (total ? v / total : 0));
  const big = areas.filter((a) => a >= SPECK).sort((x, y) => x - y);
  const ink = big.reduce((u, v) => u + v, 0);
  const holding = (q) => { let acc = 0; for (const v of big) { acc += v; if (acc >= q * ink) return v; } return big.at(-1) ?? SPECK; };
  const tileArea = (width * height) / (COLS * ROWS);
  return {
    orient: norm(orient, length),
    length: length / (width * height),
    shapes: big.length,
    colours,
    sizes: [0.1, 0.5, 0.9].map((q) => Math.log10(holding(q))),
    tiles: tiles.map((t) => ({ orient: norm(t.orient, t.length), length: t.length / tileArea })),
  };
}

const tv = (a, b) => a.reduce((s, v, k) => s + Math.abs(v - b[k]), 0) / 2;
const logRatio = (a, b) => (a === b ? 0 : Math.abs(Math.log((b + 1e-9) / (a + 1e-9))));
const shareTV = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const sa = Object.values(a).reduce((s, v) => s + v, 0) || 1, sb = Object.values(b).reduce((s, v) => s + v, 0) || 1;
  let d = 0;
  for (const k of keys) d += Math.abs((a[k] ?? 0) / sa - (b[k] ?? 0) / sb);
  return d / 2;
};
export const TILE_NAMES = ['top left', 'top middle-left', 'top middle-right', 'top right', 'middle left', 'centre left', 'centre right', 'middle right', 'bottom left', 'bottom middle-left', 'bottom middle-right', 'bottom right'];

// How far apart two feature sets are, measure by measure (0 = the same).
export function distances(a, b) {
  // A tile with almost no lines in either has nothing to say about direction.
  const busy = (k) => Math.max(a.tiles[k].length, b.tiles[k].length) > 0.1 * Math.max(a.length, b.length, 1e-9);
  let tileOrient = 0, tileLength = 0, tileOrientAt = null, tileLengthAt = null;
  a.tiles.forEach((t, k) => {
    if (!busy(k)) return;
    const o = tv(t.orient, b.tiles[k].orient);
    const l = logRatio(t.length, b.tiles[k].length);
    if (o > tileOrient) { tileOrient = o; tileOrientAt = k; }
    if (l > tileLength) { tileLength = l; tileLengthAt = k; }
  });
  return {
    orient: tv(a.orient, b.orient),
    length: logRatio(a.length, b.length),
    shapes: logRatio(a.shapes, b.shapes),
    colours: shareTV(a.colours, b.colours),
    sizes: Math.max(...a.sizes.map((v, k) => Math.abs(v - b.sizes[k]))),
    tileOrient, tileLength, tileOrientAt, tileLengthAt,
  };
}

// The smallest spread each measure is allowed, so an example whose two seeds happen to agree closely
// isn't flagged for noise: 0.02 of a histogram, 5% of a length or count, a tenth of a decade of size.
export const FLOOR = { orient: 0.02, length: Math.log(1.05), shapes: Math.log(1.15), colours: 0.02, sizes: 0.1, tileOrient: 0.04, tileLength: Math.log(1.1) };
// The most change each measure may allow, however noisy the example's two seeds were: past these an
// example has become something else whatever its spread (research/2026-11-08-golden-tolerances.md).
// An example whose spread hits a cap is marked as having a noisy reference.
export const CAP = { orient: 0.3, length: Math.log(3), shapes: Math.log(3), colours: 0.45, sizes: 0.5, tileOrient: 0.6, tileLength: Math.log(4) };
export const FACTOR = 3;

const WHAT = {
  orient: (d, a, b) => `the lines run in other directions (${d.toFixed(2)} of the direction histogram moved)`,
  length: (d, a, b) => `${b.length < a.length ? `${Math.round((1 - b.length / a.length) * 100)}% fewer` : `${(b.length / a.length).toFixed(1)}× the`} lines`,
  shapes: (d, a, b) => `${a.shapes} shapes then, ${b.shapes} now`,
  colours: (d) => `${Math.round(d * 100)}% of the ink area changed colour`,
  sizes: () => 'the shapes are a different size',
  tileOrient: (d, a, b, dist) => `lines turned in the ${TILE_NAMES[dist.tileOrientAt]}`,
  tileLength: (d, a, b, dist) => `line length changed in the ${TILE_NAMES[dist.tileLengthAt]}`,
};

// Flags a change past FACTOR × that example's own seed-to-seed spread, and says why in words.
export function judge(ref, now, spread) {
  const d = distances(ref, now);
  const why = [];
  const scores = {};
  const noisy = [];
  for (const k of Object.keys(FLOOR)) {
    const wide = FACTOR * Math.max(spread?.[k] ?? 0, FLOOR[k]);
    if (wide > CAP[k]) noisy.push(k);
    const allowed = Math.min(wide, CAP[k]);
    scores[k] = d[k] / allowed * FACTOR; // multiples of the allowed spread; over 3 flags
    if (d[k] > allowed) why.push(WHAT[k](d[k], ref, now, d));
  }
  const worst = Object.entries(scores).sort((x, y) => y[1] - x[1])[0];
  return { distances: d, scores, worst: worst ? { measure: worst[0], times: +worst[1].toFixed(1) } : null, noisy, flagged: why.length > 0, why };
}
