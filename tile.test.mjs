import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble, runScript } from './engine.js';
import { wrap } from './tile.js';

const W = 1000, H = 700, TANK = { width: W, height: H };
const area = ({ xy, n }) => {
  let a = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += xy[i * 2] * xy[j * 2 + 1] - xy[j * 2] * xy[i * 2 + 1];
  }
  return Math.abs(a) / 2;
};
// An outline's points relative to a centre, wrapped to the nearest image, sorted for comparison.
const shapeAbout = ({ xy, n }, cx, cy) => {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([wrap(xy[i * 2] - cx, W), wrap(xy[i * 2 + 1] - cy, H)]);
  return pts;
};
const centroid = ({ xy, n }) => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = xy[i * 2] * xy[j * 2 + 1] - xy[j * 2] * xy[i * 2 + 1];
    a += cross;
    cx += (xy[i * 2] + xy[j * 2]) * cross;
    cy += (xy[i * 2 + 1] + xy[j * 2 + 1]) * cross;
  }
  return [cx / (3 * a), cy / (3 * a)];
};
// How far a point is from a closed polyline.
const toOutline = ([x, y], pts) => {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const dx = bx - ax, dy = by - ay;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + dx * u - x, ay + dy * u - y));
  }
  return best;
};
// The largest distance from either curve to the other. Tidying may move or drop points, so curves
// are compared as curves, not point by point.
const curveGap = (a, b) => Math.max(...a.map((p) => toOutline(p, b)), ...b.map((p) => toOutline(p, a)));
// The curve re-read at equal steps of length, then the biggest bend between steps, in degrees.
const sharpestBend = (pts, steps = 180) => {
  const closed = [...pts, pts[0]];
  const cum = [0];
  for (let i = 1; i < closed.length; i++) cum.push(cum[i - 1] + Math.hypot(closed[i][0] - closed[i - 1][0], closed[i][1] - closed[i - 1][1]));
  const total = cum.at(-1);
  const at = (s) => {
    let i = 1;
    while (cum[i] < s) i++;
    const u = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    return [closed[i - 1][0] + (closed[i][0] - closed[i - 1][0]) * u, closed[i - 1][1] + (closed[i][1] - closed[i - 1][1]) * u];
  };
  const even = Array.from({ length: steps }, (_, i) => at((i / steps) * total));
  let worst = 0;
  for (let i = 0; i < steps; i++) {
    const [ax, ay] = even[i], [bx, by] = even[(i + 1) % steps], [cx, cy] = even[(i + 2) % steps];
    const t1 = Math.atan2(by - ay, bx - ax), t2 = Math.atan2(cy - by, cx - bx);
    let d = Math.abs(t2 - t1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    worst = Math.max(worst, (d * 180) / Math.PI);
  }
  return worst;
};
// Tidying drops points within about 0.06 mm, which would hide whether the maths repeats exactly, so
// these tanks keep every point.
const tiled = () => { const m = new Marble(TANK); m._simplify = () => {}; m.tile({ on: true }); m.step(); return m; };
// A small drop that lands at once, as a probe of how the surface moves. Its points come from its
// centre, so the same probe anywhere is the same shape, unlike a printed loop.
const probe = (m, x, y, quantity = 0.3) => {
  m.drop({ x, y, quantity, dispersion: Infinity, color: '#000' });
  m.step();
  return m.polys.at(-1);
};
const radiusOf = (p, cx, cy) => Math.hypot(p.xy[0] - cx, p.xy[1] - cy);

test('Classic repeats, Spreading does not yet, and a repeating tank refuses to turn', () => {
  assert.equal(new Marble(TANK).tileSupported, true);
  const spreading = new Marble(TANK);
  spreading.openWater({ on: true });
  spreading.step();
  assert.equal(spreading.tileSupported, false);
  const m = tiled();
  assert.throws(() => m.turn({ degrees: 30 }), /repeating tank/);
  assert.throws(() => runScript(m, 'turn({ degrees: 30 });'), /repeating tank/);
});

test('a drop on the seam pushes ink exactly as one mid-tile does', () => {
  // Scene A: the drop grows mid-tile and a probe straddles the seam. Scene B is A shifted by half
  // a tile, so the drop sits on the seam and the probe is mid-tile. Both probes must end up the
  // same shape, which means nothing happens at the seam.
  let r0 = 0;
  const scene = (dx) => {
    const m = tiled();
    const p = probe(m, wrap(W / 2 + dx, W), 40, 1);
    r0 = radiusOf(p, wrap(W / 2 + dx, W), 40);
    m.drop({ x: wrap(0 + dx, W), y: 0, quantity: 3, dispersion: Infinity, color: '#a00' });
    m.runUntilIdle();
    return shapeAbout(p, wrap(W / 2 + dx, W), 40);
  };
  const a = scene(0), b = scene(W / 2);
  const gap = curveGap(a, b);
  // Refinement may add a point on a chord in one scene and not the other; a field error would be millimetres.
  assert.ok(gap < 1e-3, `probes differ by ${gap} mm`);
  // And the probe did move: it was pushed away from the drop and squashed.
  let moved = 0;
  for (const [x, y] of a) moved = Math.max(moved, Math.abs(Math.hypot(x, y) - r0));
  assert.ok(moved > 1, `probe barely changed: ${moved} mm`);
});

test('ink across the seam from a growing drop moves smoothly, with no kink at the seam', () => {
  const m = tiled();
  const p = probe(m, W / 2, 0, 1); // centred on the seam itself
  m.drop({ x: 0, y: 0, quantity: 4, dispersion: Infinity, color: '#a00' });
  m.runUntilIdle();
  const pts = shapeAbout(p, W / 2, 0);
  // A circle read at 180 steps bends 2 degrees a step; a kink at the seam would show as far more.
  const bend = sharpestBend(pts);
  assert.ok(bend < 8, `sharpest bend ${bend} degrees`);
});

test('on a torus a drop\'s growth contracts the rest of the sheet by the area it took', () => {
  const m = tiled();
  const p = probe(m, 400, 250, 1);
  const before = area(p);
  m.drop({ x: -200, y: -150, quantity: 3, dispersion: Infinity, color: '#a00' });
  m.runUntilIdle();
  const drop = area(m.polys[1]);
  const expected = before * (1 - drop / (W * H));
  assert.ok(Math.abs(area(p) - expected) < before * 0.01, `probe area ${area(p)} vs ${expected} (drop ${drop})`);
});

test('a tine on the seam drags ink on both sides alike, and its reach fits the tile', () => {
  // One probe each side of the seam, in tanks of their own so that landing one doesn't nudge the other.
  const scene = (x) => {
    const m = tiled();
    const p = probe(m, x, 0, 0.1);
    m.stylus({ path: [[W / 2, -300], [W / 2, 300]], speed: 300, D: 20 });
    m.runUntilIdle();
    return [m, centroid(p)];
  };
  const [m, [lx, ly]] = scene(W / 2 - 25);
  const [, [rx, ry]] = scene(-W / 2 + 25);
  // Tidying may move an outline by its tolerance, about 0.06 mm, so the two sides agree to 0.1 mm.
  assert.ok(Math.abs(ly - ry) < 0.1 && Math.abs(ly) > 5, `dragged ${ly} and ${ry}`);
  assert.ok(Math.abs(wrap(lx - (W / 2 - 25), W) + wrap(rx - (-W / 2 + 25), W)) < 0.1, 'pulled in by the same amount');
  assert.ok(m.log.length && m.pending.length === 0);
  const op = m.rake({ from: [0, 0], to: [100, 0], speed: 300, D: 20 });
  assert.ok(op.L <= Math.min(W, H) / 14);
});

test('a jiggle on a tile takes a whole number of waves, so the sheet repeats exactly', () => {
  // The same probe a whole tile away, in a tank of its own, must come out the same shape.
  const scene = (x, y) => {
    const m = tiled();
    const p = probe(m, x, y, 0.3);
    m.jiggle({ angle: 30, period: 230, amplitude: 20, duration: 1 });
    const op = m.pending[0];
    assert.ok(Math.abs((op.nx * W) / op.period - Math.round((op.nx * W) / op.period)) < 1e-9, 'whole waves across');
    assert.ok(Math.abs((op.ny * H) / op.period - Math.round((op.ny * H) / op.period)) < 1e-9, 'whole waves down');
    assert.ok(Math.abs(op.period - 230) < 60, `period ${op.period}`);
    m.runUntilIdle();
    return shapeAbout(p, x, y);
  };
  const a = scene(100, 50), b = scene(100 + W, 50 - H);
  const gap = curveGap(a, b);
  assert.ok(gap < 1e-6, `the copies differ by ${gap} mm`);
  let moved = 0;
  for (const [x, y] of a) moved = Math.max(moved, Math.abs(Math.hypot(x, y) - Math.hypot(a[0][0], a[0][1])));
  assert.ok(moved > 0.5 || Math.abs(a[0][1]) > 1, 'the jiggle did nothing');
});

test('air on a tile repeats exactly across the seams', () => {
  let r0 = 0;
  const scene = (x, y) => {
    const m = tiled();
    const p = probe(m, x, y, 0.3);
    r0 = radiusOf(p, x, y);
    m.air({ scale: 180, speed: 80, duration: 1, seed: 4 });
    m.runUntilIdle();
    return shapeAbout(p, x, y);
  };
  const a = scene(100, 50), b = scene(100 + W, 50 - H);
  const gap = curveGap(a, b);
  assert.ok(gap < 1e-3, `the copies differ by ${gap} mm`);
  let moved = 0;
  for (const [x, y] of a) moved = Math.max(moved, Math.abs(Math.hypot(x, y) - r0));
  assert.ok(moved > 2, `air barely moved the probe: ${moved}`);
});

for (const [name, use] of [
  ['stir', (m) => m.stir({ x: 120, y: -40, radii: [100, -200], degrees: 90, rate: 90 })],
  ['vortex', (m) => m.vortex({ x: 120, y: -40, circulation: 200000, duration: 1 })],
  ['wriggle', (m) => m.wriggle({ x: 120, y: -40, period: 150, degrees: 20, duration: 1 })],
]) {
  test(`${name} on a tile repeats across the seams, keeps area, and leaves no kink at the seam`, () => {
    const scene = (x, y) => {
      const m = tiled();
      const p = probe(m, x, y, 0.3);
      const before = area(p);
      use(m);
      m.runUntilIdle();
      return { pts: shapeAbout(p, x, y), before, after: area(p) };
    };
    // A probe straddling the seam, and the same probe a tile away.
    const a = scene(W / 2, 100), b = scene(-W / 2, 100 - H);
    const gap = curveGap(a.pts, b.pts);
    assert.ok(gap < 5e-3, `the copies differ by ${gap} mm`);
    assert.ok(Math.abs(a.after - a.before) < a.before * 0.01, `area ${a.before} became ${a.after}`);
    // A strong swirl stretches any probe, so the seam probe is judged against one the same
    // distance from the centre on the other side, where there is no seam.
    const off = scene(120 - (W / 2 - 120), 100);
    const bend = sharpestBend(a.pts), bendOff = sharpestBend(off.pts);
    assert.ok(bend < 1.5 * bendOff + 2, `sharpest bend ${bend} degrees at the seam, ${bendOff} away from it`);
    // And the swirl moved the ink near its centre.
    const near = scene(180, -40);
    let moved = 0;
    for (const [x, y] of near.pts) moved = Math.max(moved, Math.abs(Math.hypot(x, y) - Math.hypot(near.pts[0][0], near.pts[0][1])));
    assert.ok(moved > 0.5, `${name} barely moved ink near it: ${moved} mm`);
  });
}

// #47: a stripe runs 1.5 tiles, so it overlaps its own copies. Once a clear drop cut it, its group was
// filled even-odd with every copy in one path, the overlap cancelled, and the stripe beneath showed in
// the outer quarters, as if the middle had slid. Each repeat is now filled on its own.
test('a holed shape longer than the tile fills each repeat on its own, on canvas and in SVG', () => {
  const m = new Marble({ ...TANK, seed: 5 });
  m.tile({ on: true, offset: 'brick' });
  m.stripes({ count: 4, colors: ['#963a33', '#3b5e4c'] });
  m.settle();
  m.drop({ x: 0, y: 0, quantity: 1, spreading: 1, color: 'clear' });
  m.runUntilIdle();
  const hole = m.polys.findIndex((p, k) => k && p.group && m.polys[k - 1].group === p.group);
  assert.ok(hole > 0, 'the drop cut a stripe');
  const group = m.polys[hole].group;
  const loops = m.polys.filter((p) => p.group === group).length;
  const copies = m.tileShifts(m.polys.filter((p) => p.group === group)).length;
  assert.ok(copies > 1);
  const svg = m.toSVG();
  const fill = m.polys[hole - 1].color;
  const paths = [...svg.matchAll(/<path fill="([^"]+)" fill-rule="evenodd" d="([^"]+)"/g)].filter(([, c]) => c !== undefined);
  assert.ok(paths.length >= copies, `${paths.length} even-odd paths for ${copies} repeats`);
  for (const [, , d] of paths) assert.equal(d.split('M').length - 1, loops, `${fill}: one repeat per path`);
  // Canvas: every even-odd fill holds one repeat's loops.
  let moves = 0;
  const fills = [];
  const noop = () => {};
  const ctx = new Proxy({}, { get: (_, k) => (k === 'beginPath' ? () => { moves = 0; } : k === 'moveTo' ? () => { moves++; } : k === 'fill' ? (rule) => fills.push([rule, moves]) : k === 'createPattern' || k === 'createLinearGradient' ? () => ({ addColorStop: noop, setTransform: noop }) : noop), set: () => true });
  m.draw(ctx, 1);
  const odd = fills.filter(([rule]) => rule === 'evenodd');
  assert.ok(odd.length >= copies);
  for (const [, n] of odd) assert.equal(n, loops);
});
