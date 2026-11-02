// Ink laid along a line instead of dropped: a ribbon with a brush-like edge. Ribbons are ordinary
// outlines from the start, so every simulator moves them like any other ink.

// A small seeded generator, so a stroke redraws identically on undo and from a script.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Slow, smooth wandering between about -1 and 1, along a distance in mm.
// With a period, it repeats exactly over that distance, because each wave fits a whole number of times.
function wander(random, shortest, longest, period) {
  const waves = [];
  for (let i = 0; i < 4; i++) {
    let length = shortest * (longest / shortest) ** ((i + random()) / 4);
    if (period) length = period / Math.max(1, Math.round(period / length));
    waves.push([(2 * Math.PI) / length, random() * 2 * Math.PI, 1 / (4 - i)]);
  }
  const total = waves.reduce((sum, w) => sum + w[2], 0);
  return (s) => waves.reduce((sum, [k, phase, a]) => sum + a * Math.sin(k * s + phase), 0) / total * 1.5;
}

// Rounds off the corners of a hand-drawn path, keeping its ends.
function smooth(path, rounds = 2) {
  let pts = path;
  for (let r = 0; r < rounds && pts.length > 2; r++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      if (i > 0) out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
      if (i < pts.length - 2) out.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

function resample(path, step) {
  const segments = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const len = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    if (len > 0) { segments.push([path[i], path[i + 1], len, total]); total += len; }
  }
  if (!segments.length) return { points: [], total: 0 };
  const count = Math.max(2, Math.ceil(total / step) + 1);
  const points = [];
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const s = (total * i) / (count - 1);
    while (seg < segments.length - 1 && s > segments[seg][3] + segments[seg][2]) seg++;
    const [a, b, len, from] = segments[seg];
    const t = (s - from) / len;
    points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, s]);
  }
  return { points, total };
}

// The outline of a stroke along path, as a flat [x0, y0, ...] array, counter-clockwise.
// width: mm. taper: 0 keeps the width, 1 narrows to points at both ends. wobble: mm the line
// wanders by. swell: how much the width varies along it, 0 to 1. period: mm over which the
// wandering repeats, for tiling.
export function ribbon({ path, width = 30, taper = 0, wobble = 0, swell = 0, period = 0, seed = 1 }) {
  const step = Math.max(1.5, Math.min(5, width / 4));
  const { points, total } = resample(smooth(path), step);
  if (points.length < 2) return null;
  const random = seeded(seed);
  const reach = Math.max(width * 4, 60);
  const drift = wander(random, reach, reach * 8, period);
  const edgeA = wander(random, reach / 2, reach * 3, period);
  const edgeB = wander(random, reach / 2, reach * 3, period);
  const fat = wander(random, reach, reach * 6, period);
  const left = [];
  const right = [];
  for (let i = 0; i < points.length; i++) {
    const [x, y, s] = points[i];
    const [px, py] = points[Math.max(0, i - 1)];
    const [qx, qy] = points[Math.min(points.length - 1, i + 1)];
    const len = Math.hypot(qx - px, qy - py) || 1;
    const nx = -(qy - py) / len;
    const ny = (qx - px) / len;
    // Round ends, narrowed by the taper across the whole length.
    const u = s / total;
    const end = Math.min(s, total - s);
    const cap = end < width / 2 ? Math.sqrt(Math.max(0, 1 - (1 - end / (width / 2)) ** 2)) : 1;
    const half = (width / 2) * cap * ((1 - taper) + taper * Math.sin(Math.PI * u)) * Math.max(0.05, 1 + swell * fat(s));
    const mid = wobble * drift(s);
    const a = mid + half + wobble * 0.3 * edgeA(s);
    const b = mid - half + wobble * 0.3 * edgeB(s);
    left.push(x + nx * a, y + ny * a);
    right.push(x + nx * b, y + ny * b);
  }
  // Right side forwards, then left side back, runs counter-clockwise around the stroke.
  const xy = [...right];
  for (let i = left.length - 2; i >= 0; i -= 2) xy.push(left[i], left[i + 1]);
  return xy;
}

// Bands across the whole tank, running along angle (degrees), for simulators to rake.
// Each one overlaps the last, so no water shows between them. Returns strokes to paint in order.
// On a tiled tank, bands run along an edge and repeat exactly. Each is longer than the tile, so
// its ends are hidden under its own repeat and there's no seam to see.
export function planStripes({ width, height, angle = 0, count = 16, variation = 0.6, wobble = 0, slivers = 0.5, colors, tiled = false, random }) {
  const a = ((tiled ? Math.round(angle / 90) * 90 : angle) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const along = Math.abs(c) * width + Math.abs(s) * height;
  const across = Math.abs(s) * width + Math.abs(c) * height;
  const half = along * 0.75;
  const period = tiled ? along : 0;
  const shares = [];
  for (let i = 0; i < count; i++) shares.push(Math.max(0.15, 1 + variation * (random() * 2 - 1) * 1.2));
  const sum = shares.reduce((x, y) => x + y, 0);
  const strokes = [];
  const line = (offset, from, to) => [
    [c * from - s * offset, s * from + c * offset],
    [c * to - s * offset, s * to + c * offset],
  ];
  const seed = () => Math.floor(random() * 2 ** 31);
  const pick = (not) => {
    const choices = colors.length > 1 ? colors.filter((x) => x !== not) : colors;
    return choices[Math.floor(random() * choices.length)];
  };
  const reach = tiled ? across : across * 1.1;
  let position = -reach / 2;
  let last = null;
  for (let i = 0; i < count; i++) {
    const pitch = (shares[i] / sum) * reach;
    const color = colors.length > 1 ? (variation > 0 ? pick(last) : colors[i % colors.length]) : colors[0];
    last = color;
    const middle = position + pitch / 2;
    const wander = wobble || pitch * 0.12;
    const overlap = Math.max(pitch * 1.5, pitch + wander * 2.5);
    strokes.push({ path: line(middle, -half, half), width: overlap, wobble: wander, swell: variation * 0.15, period, color, seed: seed() });
    let extras = slivers;
    while (extras > 0) {
      if (random() < Math.min(1, extras)) {
        const length = along * (0.2 + random() * 0.6);
        const at = (random() - 0.5) * along;
        strokes.push({
          path: line(middle + (random() - 0.5) * pitch * 0.8, at - length / 2, at + length / 2),
          width: pitch * (0.12 + random() * 0.4),
          taper: 1,
          wobble: wander * 0.5,
          color: pick(color),
          seed: seed(),
        });
      }
      extras -= 1;
    }
    position += pitch;
  }
  return strokes;
}
