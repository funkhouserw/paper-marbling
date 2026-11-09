// F1 + F2 (research/2026-11-08-fine-comb-analysis.md): a straight full rake with arch set moves ink by
// Lu et al. 2012's comb shear (Eq. 1, every tine's stroke composed) instead of stylus tines, with
// points refined where the comb is and put on every tine line, so a fine comb makes nonpareil arches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble } from './engine.js';

const W = 1000, H = 60;

// Vertical stripes across a full-width strip, so points are spaced as on a real 1000 mm tank.
function ground(cut) {
  const m = new Marble({ width: W, height: H, viscosity: 1000, seed: 1, maxVertices: 2e6 });
  m.ribbonCut({ on: cut, at: 0 });
  m.stripes({ angle: 90, count: 70, colors: ['#1f4e79', '#c9a227'], variation: 0, wobble: 0, slivers: 0 });
  for (let t = 0; m.busy && t < 5000; t++) m.step();
  return m;
}

const area = (p) => {
  let s = 0;
  for (let i = 0; i < p.n; i++) { const j = (i + 1) % p.n; s += p.xy[2 * i] * p.xy[2 * j + 1] - p.xy[2 * j] * p.xy[2 * i + 1]; }
  return Math.abs(s / 2);
};
const ink = (m) => m.polys.reduce((a, p) => a + area(p), 0);

// Where an outline's left side crosses the line at height y (the leftmost crossing below lim).
function crossing(xy, n, y, lim) {
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const k = (i + 1) % n;
    const ay = xy[2 * i + 1], by = xy[2 * k + 1];
    if ((ay - y) * (by - y) > 0 || ay === by) continue;
    const x = xy[2 * i] + ((xy[2 * k] - xy[2 * i]) * (y - ay)) / (by - ay);
    if (x < lim) best = Math.min(best, x);
  }
  return best;
}

// The comb's shift written out separately from the engine: each tine moves a point at distance d by
// α·λ/(d + λ); summed over the endless comb, each pair of tines counted from its value halfway.
function expectedShift(pitch, alpha, lambda, near) {
  const f = (x) => (alpha * lambda) / (x + lambda);
  let g = 0;
  for (let k = 0; k <= 4000; k++) g += f(near + k * pitch) + f(pitch - near + k * pitch) - 2 * f(pitch / 2 + k * pitch);
  return g;
}

// Combs one stripe ground and measures one stripe's left edge on each tine line (the arch tips) and
// on each line halfway between (the arch backs), as moves from where that edge was before.
function comb(pitch, { arch, falloff, cut = true } = {}) {
  const m = ground(cut);
  let pick = null;
  for (const p of m.polys) {
    let x0 = Infinity;
    for (let i = 0; i < p.n; i++) x0 = Math.min(x0, p.xy[2 * i]);
    if (x0 > -5 && (!pick || x0 < pick.x0)) pick = { x0, p, xy: Float64Array.from(p.xy.subarray(0, p.n * 2)), n: p.n };
  }
  const before = ink(m);
  const teeth = Math.round(H / pitch);
  m.fullRake({ angle: 0, teeth, speed: 30, D: 1.6, ...(arch ? { arch } : {}), ...(falloff ? { falloff } : {}) });
  m.runUntilIdle(600);
  const lim = pick.x0 + 13;
  const tips = [], backs = [];
  for (let k = 0; k < teeth; k++) {
    const y = -H / 2 + (k + 0.5) * pitch;
    if (Math.abs(y) > H / 2 - 6) continue;
    tips.push(crossing(pick.p.xy, pick.p.n, y, lim) - crossing(pick.xy, pick.n, y, lim));
    const yb = y + pitch / 2;
    if (Math.abs(yb) < H / 2 - 6) backs.push(crossing(pick.p.xy, pick.p.n, yb, lim) - crossing(pick.xy, pick.n, yb, lim));
  }
  return { m, tips, backs, kept: ink(m) / before, lines: tips.length };
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

for (const cut of [true, false]) {
  test(`a 4 mm comb with arch makes one arch per tine, as tall as the comb shear says (thin-ink cut ${cut ? 'on' : 'off'})`, () => {
    const pitch = 4, alpha = 6, lambda = 0.6;
    const { tips, backs, kept, lines } = comb(pitch, { arch: alpha, falloff: lambda, cut });
    const height = expectedShift(pitch, alpha, lambda, 0) - expectedShift(pitch, alpha, lambda, pitch / 2);
    // Every tine line inside the window has its tip, each moved the same (a point on the line is
    // mapped exactly, and simplifying, the cut and the refinement all keep it).
    assert.equal(lines, 13);
    assert.ok(tips.every((v) => Math.abs(v - tips[0]) < 1e-6), `tips moved ${tips.map((v) => v.toFixed(3))}`);
    assert.equal(backs.length, 12);
    // Backs are smooth, so simplifying may cut them by up to its tolerance (0.024 of 2.5 mm).
    for (const b of backs) assert.ok(Math.abs(tips[0] - b - height) < 0.07, `arch ${(tips[0] - b).toFixed(3)} vs ${height.toFixed(3)}`);
    // A little under Lu's nearest-tine height α(s/2)/(s/2 + λ) = 4.62 mm; more than a pitch tall.
    assert.ok(height > 4 && height < 4.62, `height ${height}`);
    // No net drift: the mean shift over a pitch is taken away.
    assert.ok(Math.abs(mean([...tips, ...backs]) - (tips[0] - height / 2)) < 1.5);
    // The ink is kept as without the comb (the cut and culling at the tank's ends take the same).
    assert.ok(kept > 0.985 && kept < 1.001, `kept ${kept}`);
  });
}

test('without arch the same fine comb only roughens the edge (the stylus tines, as before)', () => {
  const { tips, backs } = comb(4, {});
  const spread = Math.max(...tips, ...backs) - Math.min(...tips, ...backs);
  assert.ok(spread < 1.2, `spread ${spread}`);
});

test('a 2.5 mm comb arches too, with the default falloff (0.15 of the pitch)', () => {
  const pitch = 2.5, alpha = 3;
  const { tips, backs, lines } = comb(pitch, { arch: alpha });
  const lambda = 0.15 * pitch;
  const height = expectedShift(pitch, alpha, lambda, 0) - expectedShift(pitch, alpha, lambda, pitch / 2);
  assert.equal(lines, Math.round(H / pitch) - 4);
  assert.ok(tips.every((v) => Math.abs(v - tips[0]) < 1e-6));
  assert.ok(Math.abs(tips[0] - mean(backs) - height) < 0.07, `arch ${(tips[0] - mean(backs)).toFixed(3)} vs ${height.toFixed(3)}`);
});

test('the arch only applies to straight full rakes with point tines; replaying the log gives the same ink', () => {
  const m = new Marble({ width: 300, height: 200, seed: 4 });
  assert.ok(m.fullRake({ angle: 0, teeth: 20, arch: 5 }).shear);
  assert.equal(m.fullRake({ angle: 0, teeth: 20, arch: 5, waveAmp: 3 }).shear, null);
  assert.equal(m.fullRake({ angle: 0, teeth: 20, arch: 5, width: 2 }).shear, null);
  assert.equal(m.rake({ from: [-100, 0], to: [100, 0], teeth: 5, spacing: 10, arch: 5 }).shear, undefined);

  const a = new Marble({ width: 300, height: 200, seed: 4 });
  a.stripes({ angle: 90, count: 14, colors: ['#963a33', '#3b5e4c', '#c9a24f'] });
  a.settle();
  a.fullRake({ angle: 90, teeth: 40, speed: 60, arch: 7, falloff: 1 });
  a.runUntilIdle(120);
  const b = new Marble({ width: 300, height: 200, seed: 4 });
  b.replay(a.log);
  b.runUntilIdle(120);
  const pa = a.polys.flatMap((p) => Array.from(p.xy.subarray(0, p.n * 2)));
  const pb = b.polys.flatMap((p) => Array.from(p.xy.subarray(0, p.n * 2)));
  assert.equal(pa.length, pb.length);
  for (let i = 0; i < pa.length; i++) assert.equal(pa[i], pb[i]);
});

test("Lu's nearest-tine shortcut (kept for comparison) gives his height α(s/2)/(s/2 + λ), with a pointed back", () => {
  const before = Marble.prototype.combNearestTine;
  Marble.prototype.combNearestTine = true;
  try {
    const pitch = 4, alpha = 6, lambda = 0.6;
    const { tips, backs } = comb(pitch, { arch: alpha, falloff: lambda });
    const lu = (alpha * (pitch / 2)) / (pitch / 2 + lambda);
    // The back is a kink, and a point is put on it, so it is exact too.
    for (const b of backs) assert.ok(Math.abs(tips[0] - b - lu) < 1e-6, `arch ${(tips[0] - b).toFixed(4)} vs ${lu.toFixed(4)}`);
  } finally {
    Marble.prototype.combNearestTine = before;
  }
});

// Tracers moved by every _map call alongside the ink, so they show the comb's exact result.
class Traced extends Marble {
  _map(f, o) {
    super._map(f, o);
    if (!this.tracers) return;
    const out = [0, 0];
    for (const t of this.tracers) { f(t[0], t[1], out); t[0] = out[0]; t[1] = out[1]; }
  }
}

test('on a repeating tank the comb moves points at the seams as in the middle, and a wrapped copy as its tile', () => {
  const pitch = 4, alpha = 6, lambda = 0.6;
  const m = new Traced({ width: 300, height: 60, viscosity: 1000, seed: 1 });
  m.tile({ on: true, at: 0 });
  m.stripes({ angle: 90, count: 20, colors: ['#1f4e79', '#c9a227'], variation: 0, wobble: 0, slivers: 0 });
  for (let t = 0; m.busy && t < 5000; t++) m.step();
  // On a tine line (y = 2 + 4k) and halfway between, at the seams, the middle, and one tile over.
  const xs = [-149.5, -147.5, -100, 0, 146.5, 148.5, 149.5 - 300, 0 + 300, -170, 170];
  m.tracers = [];
  for (const x of xs) for (const y of [2, 4]) m.tracers.push([x, y, x]);
  m.fullRake({ angle: 0, teeth: 15, speed: 30, D: 1.6, arch: alpha, falloff: lambda });
  m.runUntilIdle(600);
  const shear = m.fullRake({ angle: 0, teeth: 15, arch: alpha, falloff: lambda }).shear;
  for (const [x, y, x0] of m.tracers) {
    assert.ok(Math.abs(y - (y === 2 ? 2 : 4)) < 1e-12);
    const want = m._combShift(shear, y);
    assert.ok(Math.abs(x - x0 - want) < 1e-9, `x ${x0}, y ${y}: moved ${(x - x0).toFixed(4)}, want ${want.toFixed(4)}`);
  }
});

test('a big arch on a plain tank moves points near the ends of the stroke all the way (the line runs past the teeth)', () => {
  // Pitch 20, arch 20: the ramp is wider than the 20 mm overhang.
  const m = new Traced({ width: 300, height: 200, viscosity: 1000, seed: 1 });
  m.stripes({ angle: 90, count: 14, colors: ['#1f4e79', '#c9a227'], variation: 0, wobble: 0, slivers: 0 });
  for (let t = 0; m.busy && t < 5000; t++) m.step();
  m.tracers = [];
  for (const x of [-148, -140, 0, 140, 148]) for (const y of [10, 20]) m.tracers.push([x, y, x]);
  const op = m.fullRake({ angle: 0, teeth: 10, speed: 60, arch: 20 });
  assert.ok(op.shear.w / 2 + op.shear.most > 20);
  m.runUntilIdle(600);
  for (const [x, y, x0] of m.tracers) {
    const want = m._combShift(op.shear, y - op.segs[0].ay);
    assert.ok(Math.abs(x - x0 - want) < 1e-9, `x ${x0}, y ${y}: moved ${(x - x0).toFixed(4)}, want ${want.toFixed(4)}`);
  }
});
