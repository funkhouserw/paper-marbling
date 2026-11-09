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
function comb(pitch, { arch, falloff, cut = true, speed = 30, D = 1.6 } = {}) {
  const m = ground(cut);
  let pick = null;
  for (const p of m.polys) {
    let x0 = Infinity;
    for (let i = 0; i < p.n; i++) x0 = Math.min(x0, p.xy[2 * i]);
    if (x0 > -5 && (!pick || x0 < pick.x0)) pick = { x0, p, xy: Float64Array.from(p.xy.subarray(0, p.n * 2)), n: p.n };
  }
  const before = ink(m);
  const teeth = Math.round(H / pitch);
  if (arch) m.combArch = { arch, falloff };
  m.fullRake({ angle: 0, teeth, speed, D });
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

test('the comb shear only applies to straight full rakes with point tines; replaying the log gives the same ink', () => {
  const m = new Marble({ width: 300, height: 200, seed: 4 });
  m.combArch = { arch: 5 };
  assert.ok(m.fullRake({ angle: 0, teeth: 20 }).shear);
  assert.equal(m.fullRake({ angle: 0, teeth: 20, waveAmp: 3 }).shear, null);
  assert.equal(m.fullRake({ angle: 0, teeth: 20, width: 2 }).shear, null);
  assert.equal(m.rake({ from: [-100, 0], to: [100, 0], teeth: 5, spacing: 10 }).shear, undefined);

  const run = (log) => {
    const t = new Marble({ width: 300, height: 200, seed: 4 });
    t.combArch = { arch: 7, falloff: 1 };
    if (log) t.replay(log);
    else {
      t.stripes({ angle: 90, count: 14, colors: ['#963a33', '#3b5e4c', '#c9a24f'] });
      t.settle();
      t.fullRake({ angle: 90, teeth: 40, speed: 60 });
    }
    t.runUntilIdle(120);
    return t;
  };
  const a = run(), b = run(a.log);
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
  m.combArch = { arch: alpha, falloff: lambda };
  m.fullRake({ angle: 0, teeth: 15, speed: 30, D: 1.6 });
  m.runUntilIdle(600);
  const shear = m.fullRake({ angle: 0, teeth: 15 }).shear;
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
  m.combArch = { arch: 20 };
  const op = m.fullRake({ angle: 0, teeth: 10, speed: 60 });
  assert.ok(op.shear.w / 2 + op.shear.most > 20);
  m.runUntilIdle(600);
  for (const [x, y, x0] of m.tracers) {
    const want = m._combShift(op.shear, y - op.segs[0].ay);
    assert.ok(Math.abs(x - x0 - want) < 1e-9, `x ${x0}, y ${y}: moved ${(x - x0).toFixed(4)}, want ${want.toFixed(4)}`);
  }
});

test('near the point limit the comb plans a coarser spacing for the whole stroke, and every arch keeps its tip', () => {
  const m = new Marble({ width: W, height: H, viscosity: 1000, seed: 1, maxVertices: 9000 });
  m.stripes({ angle: 90, count: 70, colors: ['#1f4e79', '#c9a227'], variation: 0, wobble: 0, slivers: 0 });
  for (let t = 0; m.busy && t < 5000; t++) m.step();
  m.combArch = { arch: 6, falloff: 0.6 };
  const op = m.fullRake({ angle: 0, teeth: 15, speed: 30, D: 1.6 });
  let peak = 0;
  for (let t = 0; m.busy && t < 5000; t++) { m.step(); peak = Math.max(peak, m.polys.reduce((a, p) => a + p.n, 0)); }
  // Planned, not run out of: coarser than pitch/8, the same everywhere, and under the limit.
  assert.ok(op.shear.lim > 0.5, `spacing ${op.shear.lim}`);
  assert.ok(peak < 9000, `peak ${peak}`);
  // Every stripe edge crossing a tine line inside the tank has a point on it, as with no limit
  // (119 here: two edges a stripe, less the ends); only edges off the tank's ends cross without one.
  for (let k = 3; k < 12; k++) {
    const y = -H / 2 + (k + 0.5) * 4;
    let on = 0, without = 0;
    for (const p of m.polys) {
      for (let i = 0; i < p.n; i++) {
        const j = (i + 1) % p.n, y0 = p.xy[2 * i + 1], y1 = p.xy[2 * j + 1];
        if (Math.abs(p.xy[2 * i]) > W / 2 - 30) continue;
        if (Math.abs(y0 - y) < 1e-9) on++;
        else if (Math.abs(y1 - y) >= 1e-9 && (y0 - y) * (y1 - y) < 0) without++;
      }
    }
    assert.equal(on, 119, `line y=${y}`);
    assert.equal(without, 0, `line y=${y}`);
  }
  assert.ok(op.shear);
});

test('a full-size Nonpareil of 200 stripes at the default point limit: under the limit, arches wall to wall', () => {
  // As the example: 1000 × 700 mm, 175 teeth at 4 mm, arch 6, falloff 0.6, the default 400k points.
  const m = new Marble({ width: 1000, height: 700, viscosity: 1000, seed: 1 });
  assert.equal(m.maxVertices, 400000);
  m.stripes({ angle: 90, count: 200, colors: ['#1f3a5f', '#c9a227', '#8c2f39', '#e8e1cf'], variation: 0.2, slivers: 0 });
  for (let t = 0; m.busy && t < 5000; t++) m.step();
  m.combArch = { arch: 6, falloff: 0.6 };
  m.fullRake({ angle: 0, teeth: 175, speed: 300, D: 1.6 });
  let peak = 0;
  for (let t = 0; m.busy && t < 5000; t++) { m.step(); peak = Math.max(peak, m.polys.reduce((a, p) => a + p.n, 0)); }
  assert.ok(peak < 400000 && !m.capped, `peak ${peak}`);
  // In each third of the tank, as many arch tips on three tine lines (a point on the line where an
  // edge crosses it), and no edge crossing a line without one.
  const lines = [40, 87, 130].map((k) => -350 + (k + 0.5) * 4);
  const tips = [[-450, -300], [-75, 75], [300, 450]].map(([x0, x1]) => {
    let on = 0, without = 0;
    for (const p of m.polys) {
      for (let i = 0; i < p.n; i++) {
        const j = (i + 1) % p.n, x = p.xy[2 * i], y0 = p.xy[2 * i + 1], y1 = p.xy[2 * j + 1];
        if (x < x0 || x > x1) continue;
        for (const y of lines) {
          if (Math.abs(y0 - y) < 1e-9) on++;
          else if (Math.abs(y1 - y) >= 1e-9 && (y0 - y) * (y1 - y) < 0) without++;
        }
      }
    }
    assert.ok(without <= 2, `x ${x0}..${x1}: ${without} crossings without a tip`);
    return on;
  });
  // 150 mm of 200 stripes on 3 lines: about 2 edges × 30 stripes × 3 lines.
  for (const n of tips) assert.ok(n > 150 && n < 190, `tips ${tips}`);
});

// The engine picks the comb shear itself (no setting): while the tines' drag L₀ = speed·D²/ν stays
// under reach × the gap they pull as styluses, as before; past it, Lu's kernel with an arch rising
// from the stylus comb's own arch at the switch.
test('a coarse comb, or a fine one whose drag stays under the gap, keeps the stylus tines', () => {
  const m = new Marble({ width: 1000, height: 700, viscosity: 1000, seed: 1 });
  // As the comb examples: 6 to 40 teeth.
  for (const [teeth, speed, D] of [[6, 220, 8], [30, 320, 4], [40, 300, 3], [8, 240, 7]]) assert.equal(m.fullRake({ angle: 0, teeth, speed, D }).shear, null, `${teeth} teeth`);
  // 4 mm teeth, 1.6 mm tines at 300 mm/s: L₀ 0.77 mm, under half the 4 mm gap.
  assert.equal(m.fullRake({ angle: 0, teeth: 175, speed: 300, D: 1.6 }).shear, null);
});

test('a fine comb whose drag reaches past the gap makes arches, rising from the stylus look at the switch', () => {
  // 4 mm teeth, 3 mm tines at 300 mm/s: L₀ = 2.7 mm against 0.5 × 4 mm, ρ 1.35.
  const pitch = 4;
  const { tips, backs, lines } = comb(pitch, { speed: 300, D: 3 });
  const rho = (300 * 9) / 1000 / (0.5 * pitch);
  const want = pitch * (0.57 + (1.5 - 0.57) * (1 - Math.exp(1 - rho)));
  assert.equal(lines, 13);
  assert.ok(tips.every((v) => Math.abs(v - tips[0]) < 1e-6));
  assert.ok(Math.abs(tips[0] - mean(backs) - want) < 0.07, `arch ${(tips[0] - mean(backs)).toFixed(3)} vs ${want.toFixed(3)}`);
  // Faster tines arch higher, towards the most (1.5 of the gap).
  const fast = comb(pitch, { speed: 1500, D: 3 });
  const higher = fast.tips[0] - mean(fast.backs);
  assert.ok(higher > tips[0] - mean(backs) && higher < 1.5 * pitch + 0.07, `faster arch ${higher}`);
});

// doubleComb (Woolnough's Antique zigzag): exactly the two full rakes it stands for.
test('doubleComb is two full rakes, half a pitch apart, the hind one gap / speed behind', async () => {
  const { Marble, runScript } = await import('./engine.js');
  const a = new Marble(), b = new Marble();
  runScript(a, "doubleComb({ angle: 0, teeth: 7, speed: 25, D: 0.5, waveShape: 'zigzag', waveAmp: 5, waveLength: 12, gap: 5, at: 0 });");
  runScript(b, "fullRake({ angle: 0, teeth: 7, offset: -2.5, speed: 25, D: 0.5, waveShape: 'zigzag', waveAmp: 5, waveLength: 12, at: 0 });\nfullRake({ angle: 0, teeth: 7, offset: 2.5, speed: 25, D: 0.5, waveShape: 'zigzag', waveAmp: 5, waveLength: 12, at: 0.2 });");
  assert.equal(a.log.length, 2);
  const strip = (log) => JSON.stringify(log, (k, v) => (typeof v === 'number' ? Number(v.toFixed(9)) : v));
  assert.equal(strip(a.log), strip(b.log));
});
