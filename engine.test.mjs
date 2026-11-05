// Run with: node --test engine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Marble, maxRadius, scriptApi, runScript, WEAVE_SHAPES } from './engine.js';
import { COMMANDS, VALUES, toMm, fromMm, dialToValue, valueToDial } from './api.js';
import { PALETTES, palette } from './palettes.js';

const area = ({ xy, n }) => {
  let a = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += xy[i * 2] * xy[j * 2 + 1] - xy[j * 2] * xy[i * 2 + 1];
  }
  return Math.abs(a) / 2;
};
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('a drop grows slowly and stops at the area set by its quantity', () => {
  const m = new Marble();
  m.drop({ quantity: 2, dispersion: 0.5 });
  const target = Math.PI * maxRadius(2, m.film) ** 2;
  const samples = [];
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < 30; i++) m.step();
    samples.push(area(m.polys[0]));
  }
  for (let i = 1; i < samples.length; i++) assert.ok(samples[i] > samples[i - 1], 'keeps growing');
  assert.ok(samples[0] < target * 0.5, 'not full size after 1 s');
  m.runUntilIdle();
  near(area(m.polys[0]), target, target * 0.01, 'final area');
  assert.equal(m.busy, false);
});

test('larger quantity makes a larger drop; dispersion changes speed, not size', () => {
  const finalArea = (o) => {
    const m = new Marble();
    m.drop(o);
    m.runUntilIdle();
    return area(m.polys[0]);
  };
  const small = finalArea({ quantity: 1 });
  near(finalArea({ quantity: 4 }) / small, 4, 0.03, 'area scales with quantity');
  near(finalArea({ quantity: 1, dispersion: 3 }) / small, 1, 0.01, 'same final size');
});

test('two drops growing at once keep their ink and push each other apart', () => {
  const m = new Marble();
  m.drop({ x: -60, quantity: 1, color: '#a00' });
  m.drop({ x: 60, quantity: 3, color: '#00a' });
  m.runUntilIdle();
  const [a, b] = m.polys;
  const each = Math.PI * maxRadius(1, m.film) ** 2;
  near(area(a), each, each * 0.02, 'small drop area');
  near(area(b), each * 3, each * 0.06, 'big drop area');
  const maxAx = Math.max(...Array.from({ length: a.n }, (_, i) => a.xy[i * 2]));
  const minBx = Math.min(...Array.from({ length: b.n }, (_, i) => b.xy[i * 2]));
  assert.ok(maxAx <= minBx + 1, `outlines must not overlap: ${maxAx} vs ${minBx}`);
});

test('a tine drags nearby ink with it and leaves distant ink alone', () => {
  const moved = (x, y) => {
    const out = new Marble();
    out.polys.push({ xy: Float64Array.of(x, y), n: 1, color: '#000' });
    out._tine(-100, 0, 100, 0, 10);
    return [out.polys[0].xy[0] - x, out.polys[0].xy[1] - y];
  };
  assert.ok(moved(0, 1)[0] > 20, 'point beside the tine is dragged forward');
  assert.ok(moved(0, 1)[0] > moved(0, 5)[0], 'drag falls off with distance');
  assert.ok(moved(0, 5)[0] > moved(0, 10)[0], 'drag falls off with distance');
  near(moved(0, 200)[0], 0, 1e-9, 'distant point stays put');
});

test('drops can be placed at many independent centres', () => {
  const m = new Marble();
  const spots = [[-300, 200], [250, -150], [0, 0], [400, 250]];
  for (const [x, y] of spots) m.drop({ x, y, quantity: 0.2 });
  m.runUntilIdle();
  assert.equal(m.polys.length, spots.length);
  m.polys.forEach((p, i) => {
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < p.n; k++) { cx += p.xy[k * 2]; cy += p.xy[k * 2 + 1]; }
    assert.ok(Math.hypot(cx / p.n - spots[i][0], cy / p.n - spots[i][1]) < 40, `drop ${i} stays near its spot`);
  });
});

test('raking preserves ink area and keeps outlines refined', () => {
  const m = new Marble();
  m.drop({ quantity: 10, dispersion: Infinity });
  m.step();
  const before = area(m.polys[0]);
  m.rake({ from: [-400, 0], to: [400, 0], teeth: 5, spacing: 60 });
  m.runUntilIdle();
  near(area(m.polys[0]) / before, 1, 0.05, 'area ratio');
  assert.ok(m.polys[0].n > 48, 'vertices added');
});

test('a growing drop keeps growing from where a rake moved it', () => {
  const m = new Marble();
  const op = m.drop({ x: 0, y: 0, quantity: 2, dispersion: 0.3 });
  m.rake({ from: [-200, 0], to: [200, 0], teeth: 1 });
  m.runUntilIdle();
  assert.ok(op.x > 50, `centre advected, x=${op.x}`);
});

test('same script gives identical results; toScript replays exactly', () => {
  const build = (m) => {
    m.drops({ n: 10, colors: ['#111', '#555'], stagger: 2 });
    m.wait(1);
    m.rake({ from: [-300, 0], to: [300, 0], teeth: 4 });
    m.jiggle({ angle: 30 });
    m.wriggle({ x: 10 });
    m.stir({ radii: [100, -200] });
    m.vortex({});
    m.runUntilIdle();
  };
  const a = new Marble();
  build(a);
  const b = new Marble();
  build(b);
  assert.deepEqual(a.polys.map((p) => p.n), b.polys.map((p) => p.n));
  const c = new Marble();
  for (const { fn, args } of a.log) c[fn](args);
  c.runUntilIdle();
  assert.deepEqual(
    Array.from(c.polys[0].xy.slice(0, c.polys[0].n * 2)),
    Array.from(a.polys[0].xy.slice(0, a.polys[0].n * 2)),
  );
});

test('every rigid or shear tool preserves area', () => {
  for (const tool of ['jiggle', 'stir', 'vortex', 'turn', 'shift', 'wriggle']) {
    const m = new Marble();
    m.drop({ x: 50, y: 20, quantity: 5, dispersion: Infinity });
    m.step();
    const before = area(m.polys[0]);
    m[tool]({});
    m.runUntilIdle();
    near(area(m.polys[0]) / before, 1, 0.05, tool);
  }
});

// Fraction of a grid of points in the tank that no ink covers.
const bareFraction = (m, nx = 80, ny = 56) => {
  let bare = 0;
  for (let a = 0; a < nx; a++) {
    for (let b = 0; b < ny; b++) {
      const x = ((a + 0.5) / nx - 0.5) * m.width;
      const y = ((b + 0.5) / ny - 0.5) * m.height;
      const inside = m.polys.some(({ xy, n }) => {
        let hit = false;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const yi = xy[i * 2 + 1];
          const yj = xy[j * 2 + 1];
          if ((yi > y) !== (yj > y) && x < ((xy[j * 2] - xy[i * 2]) * (y - yi)) / (yj - yi) + xy[i * 2]) hit = !hit;
        }
        return hit;
      });
      if (!inside) bare++;
    }
  }
  return bare / (nx * ny);
};

test('a drop scheduled for later lands exactly where it was asked to', () => {
  const m = new Marble();
  m.drop({ x: 0, y: 0, quantity: 5, dispersion: 2 });
  const late = m.drop({ x: 100, y: 0, quantity: 1, at: 2 });
  m.rake({ from: [-300, 0], to: [300, 0], teeth: 1, at: 0 });
  while (m.time < 1.9) m.step();
  assert.equal(late.x, 100);
  assert.equal(late.y, 0);
});

test('printed ink never grows but a tool moves it, and it replays from the log', () => {
  const square = (s) => [-s, -s, s, -s, s, s, -s, s];
  const m = new Marble();
  m.print({ contours: [square(40), square(15)], color: '#000' });
  m.step();
  m.wait(0.1);
  assert.equal(m.polys.length, 2);
  assert.equal(m.polys[0].group, m.polys[1].group);
  const before = area(m.polys[0]);
  for (let i = 0; i < 90; i++) m.step();
  assert.equal(area(m.polys[0]), before, 'no growth by itself');
  m.rake({ from: [-200, 0], to: [200, 0], teeth: 1 });
  m.runUntilIdle();
  assert.ok(m.polys[0].n > 4, 'stretched and refined');
  near(area(m.polys[0]) / before, 1, 0.1, 'area roughly kept under the rake');

  const again = new Marble();
  for (const { fn, args } of m.log) again[fn](args);
  again.runUntilIdle();
  assert.equal(again.polys.length, 2);
  assert.ok(m.toSVG().includes('fill-rule="evenodd"'));
  assert.ok(JSON.stringify(m.log).includes('contours'));
});

test('palette inks carry shimmer through drops, prints and replay', () => {
  const ink = palette('emerald & gold').inks[0];
  const m = new Marble();
  m.drop({ color: ink, quantity: 1 });
  m.drops({ n: 3, colors: palette('Shimmering Gold').inks });
  m.step();
  assert.equal(m.polys[0].color, ink.color);
  assert.equal(m.polys[0].shimmer, ink.shimmer);
  assert.ok(m.polys.slice(1).every((p) => p.shimmer > 0));
  assert.equal(m.log[0].args.color, ink.color, 'log holds plain values');
  assert.equal(m.log[0].args.shimmer, ink.shimmer);
});

test('every palette is well formed, and unknown names are an error', () => {
  for (const p of PALETTES) {
    assert.match(p.bath, /^#[0-9a-f]{6}$/);
    assert.ok(p.inks.length >= 4, p.name);
    for (const { color, shimmer } of p.inks) {
      assert.match(color, /^#[0-9a-f]{6}$/);
      assert.ok(shimmer >= 0 && shimmer <= 1);
    }
  }
  assert.throws(() => palette('nope'), /Unknown palette/);
});

const bounds = (m) => {
  let x = 0;
  let y = 0;
  for (const { xy, n } of m.polys) {
    for (let i = 0; i < n; i++) {
      x = Math.max(x, Math.abs(xy[i * 2]));
      y = Math.max(y, Math.abs(xy[i * 2 + 1]));
    }
  }
  return [x, y];
};

test('hard edges keep growing ink inside the tank without cutting it off', () => {
  const m = new Marble();
  m.walls();
  m.drop({ x: 460, y: 320, quantity: 8, dispersion: 3 });
  m.drop({ x: -300, y: 0, quantity: 2, dispersion: 3 });
  m.runUntilIdle();
  const [bx, by] = bounds(m);
  assert.ok(bx <= 500 && by <= 350, `stays in tank: ${bx}, ${by}`);
  const full = Math.PI * maxRadius(8, m.film) ** 2;
  assert.ok(area(m.polys[0]) > 0.7 * full, `corner drop kept ${area(m.polys[0]) / full} of its area`);
  assert.ok(bareFraction(m) > 0.3, 'finite quantities still leave bare bath');
});

test('hard edges compress ink pushed by tools instead of slicing it flat', () => {
  const run = (hard) => {
    const m = new Marble();
    if (hard) m.walls();
    m.drop({ x: 380, y: 0, quantity: 2, dispersion: Infinity });
    m.step();
    for (let i = 0; i < 5; i++) m.rake({ from: [-200, -60 + i * 30], to: [700, -60 + i * 30], teeth: 1, D: 25 });
    m.runUntilIdle();
    return m;
  };
  const hard = run(true);
  const [bx] = bounds(hard);
  assert.ok(bx <= 500, `stays in tank: ${bx}`);
  assert.ok(bounds(run(false))[0] > 500, 'without hard edges the same ink leaves the tank');
  const { xy, n } = hard.polys[0];
  let onWall = 0;
  for (let i = 0; i < n; i++) if (xy[i * 2] >= 499.999) onWall++;
  assert.ok(onWall / n < 0.1, `${onWall} of ${n} points flattened on the wall`);
  // Known limit: ink dragged hard into a wall compresses a lot, to about a tenth here.
  const before = Math.PI * maxRadius(2, hard.film) ** 2;
  assert.ok(area(hard.polys[0]) > 0.05 * before, `kept ${area(hard.polys[0]) / before} of its area`);

  const gentle = new Marble();
  gentle.walls();
  gentle.drop({ x: 380, y: 0, quantity: 2, dispersion: Infinity });
  gentle.step();
  gentle.shift({ dx: 50 });
  gentle.runUntilIdle();
  assert.ok(area(gentle.polys[0]) > 0.8 * before, 'a gentle push keeps most of the ink');
});

test('switching hard edges on eases ink already past the walls back inside', () => {
  const m = new Marble();
  m.drop({ x: 470, y: 0, quantity: 10, dispersion: 3 });
  m.drop({ x: -100, y: 0, quantity: 1, dispersion: 3 });
  m.runUntilIdle();
  assert.ok(bounds(m)[0] > 500, 'starts over the edge');
  const before = m.polys[0].n;
  m.walls({ at: m.time });
  assert.equal(m.busy, true);
  m.runUntilIdle();
  assert.ok(bounds(m)[0] <= 500.01, `pulled in: ${bounds(m)[0]}`);
  assert.ok(m.polys[0].n >= before * 0.5, 'not collapsed');
  assert.ok(m.polys.length === 2);
});

test('switching hard edges on leaves ink away from the walls where it is', () => {
  const m = new Marble();
  const middle = m.drop({ x: -100, y: 0, quantity: 1, dispersion: 3 });
  m.drop({ x: 480, y: 0, quantity: 4, dispersion: 3 });
  m.runUntilIdle();
  const left = reach(middle.poly, -1);
  const right = reach(middle.poly, 1);
  const x = middle.x;
  m.walls({ at: m.time });
  m.runUntilIdle();
  assert.equal(reach(middle.poly, -1), left, 'its far edge stays put');
  assert.equal(reach(middle.poly, 1), right, 'its near edge stays put');
  assert.equal(middle.x, x);
  assert.ok(bounds(m)[0] <= 500.01, `the rest is inside: ${bounds(m)[0]}`);
  assert.ok(bounds(m)[0] > 495, `and reaches the wall: ${bounds(m)[0]}`);
});

test('stir and vortex direction follows the sign', () => {
  const ang = (o, tool) => {
    const m = new Marble();
    m.polys.push({ xy: Float64Array.of(100, 0), n: 1, color: '#000' });
    m[tool](o);
    m.runUntilIdle();
    return Math.atan2(m.polys[0].xy[1], m.polys[0].xy[0]);
  };
  assert.ok(ang({ radii: [100], degrees: 40 }, 'stir') > 0, 'positive stir is counter-clockwise');
  assert.ok(ang({ radii: [100], degrees: -40 }, 'stir') < 0, 'negative stir is clockwise');
  assert.ok(ang({ circulation: 100000 }, 'vortex') !== 0);
  assert.ok(ang({ circulation: 100000 }, 'vortex') * ang({ circulation: -100000 }, 'vortex') < 0, 'vortex sign flips');
});

test('heavy sessions stay within the point budget, and far-off ink is discarded', () => {
  const m = new Marble({ seed: 3 });
  for (let i = 0; i < 30; i++) {
    m.drop({ x: (m.random() - 0.5) * 900, y: (m.random() - 0.5) * 620, quantity: 1.5, dispersion: 2 });
  }
  m.settle();
  m.jiggle({ period: 160, amplitude: 40 });
  m.stir({ radii: [120, -220, 320], degrees: 150 });
  m.runUntilIdle();
  assert.ok(m.vertexCount < 120000, `points ${m.vertexCount}`);

  const far = new Marble();
  far.drop({ x: 0, y: 0, quantity: 0.2, dispersion: Infinity });
  far.step();
  far.shift({ dx: 3000, duration: 0.2 });
  far.runUntilIdle();
  for (let i = 0; i < 15; i++) far.step();
  assert.equal(far.polys.length, 0);
});

test('the coarse field matches the exact push closely in a single step', () => {
  const push = (fieldAbove, da) => {
    const m = new Marble({ seed: 5 });
    m.fieldAbove = fieldAbove;
    m.wallsOn = true;
    const sources = Array.from({ length: 40 }, () => [(m.random() - 0.5) * 900, (m.random() - 0.5) * 600, da]);
    const xy = Array.from({ length: 2000 }, (_, i) => (m.random() - 0.5) * (i % 2 ? 700 : 1000));
    m.polys.push({ xy: Float64Array.from(xy), n: 1000, color: '#000' });
    m._pushApart(sources);
    return m.polys[0].xy;
  };
  const still = push(Infinity, 1e-9);
  const exact = push(Infinity, 175);
  const field = push(0, 175);
  let err = 0;
  let move = 0;
  for (let i = 0; i < 1000; i++) {
    err += Math.hypot(exact[i * 2] - field[i * 2], exact[i * 2 + 1] - field[i * 2 + 1]);
    move += Math.hypot(exact[i * 2] - still[i * 2], exact[i * 2 + 1] - still[i * 2 + 1]);
  }
  assert.ok(err / move < 0.03, `error is ${(100 * err / move).toFixed(1)}% of the movement`);
});

test('the engine rests at steady state: no work once growth is invisible', () => {
  const m = new Marble();
  m.drop({ quantity: 1, dispersion: 1 });
  m.runUntilIdle();
  assert.equal(m.busy, false);
  assert.ok(m.time < 5, `rested after ${m.time} s`);
});

test('fullRake spans the tank in each direction with even teeth and offset', () => {
  const m = new Marble();
  m.fullRake({ angle: 0, teeth: 7 });
  const right = m.pending.at(-1);
  assert.equal(right.offs.length, 7);
  assert.ok(right.total > 1000);
  assert.ok(Math.abs(right.offs[1] - right.offs[0] - 100) < 1e-9, 'evenly spaced over the height');
  m.fullRake({ angle: 270, teeth: 5, offset: 30 });
  const down = m.pending.at(-1);
  assert.ok(Math.abs(down.offs[0] - (-400 + 30)) < 1e-9, 'offset slides the teeth');
  assert.ok(down.segs[0].by < down.segs[0].ay, 'travels downward');
  assert.equal(m.log.at(-1).fn, 'rake', 'replays as an ordinary rake');
});

test('fullRake offset wraps, so the same teeth always span the whole page', () => {
  const offsets = (offset) => {
    const m = new Marble();
    return m.fullRake({ angle: 0, teeth: 6, offset }).offs.slice().sort((a, b) => a - b);
  };
  for (const offset of [0, 40, 350, -90, 1234]) {
    const offs = offsets(offset);
    assert.equal(offs.length, 6);
    assert.ok(offs[0] >= -350 && offs[5] < 350, `offset ${offset} stays on the page`);
    for (let i = 1; i < 6; i++) near(offs[i] - offs[i - 1], 700 / 6, 1e-9, 'evenly spaced');
  }
  near(offsets(700 / 6)[0], offsets(0)[0], 1e-9, 'one full spacing repeats the pattern');
});

const reach = (poly, sign) => {
  let best = -Infinity;
  for (let i = 0; i < poly.n; i++) best = Math.max(best, sign * poly.xy[i * 2]);
  return best;
};

test('open water: a lone drop spreads further, and crowded ink holds back', () => {
  const lone = new Marble();
  lone.openWater();
  const free = lone.drop({ quantity: 1, dispersion: 2 });
  lone.runUntilIdle();
  const normal = Math.PI * maxRadius(1, lone.film) ** 2;
  assert.ok(area(free.poly) / normal > 2.2, `lone drop spread ${area(free.poly) / normal}x`);

  // A packed grid of drops: those in the middle meet ink on every side.
  const crowd = new Marble();
  crowd.openWater();
  const grid = [];
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      grid.push(crowd.drop({ x: -400 + c * 160, y: -250 + r * 100, quantity: 1, dispersion: 1.5 }));
    }
  }
  crowd.runUntilIdle();
  const mean = (list) => list.reduce((sum, d) => sum + area(d.poly), 0) / list.length;
  const middle = [14, 15, 20, 21].map((i) => grid[i]);
  assert.ok(mean(middle) < area(free.poly) * 0.7, `middle ${mean(middle)} vs lone ${area(free.poly)}`);

  const twin = new Marble();
  twin.openWater();
  const left = twin.drop({ x: -70, quantity: 1, dispersion: 2 });
  const right = twin.drop({ x: 70, quantity: 1, dispersion: 2 });
  twin.runUntilIdle();
  near(area(left.poly) / area(right.poly), 1, 0.25, 'identical neighbours end up similar');

  const off = new Marble();
  off.drop({ quantity: 1, dispersion: 2 });
  off.runUntilIdle();
  near(area(off.polys[0]) / normal, 1, 0.01, 'off keeps the plain size');
});

const covered = (m) => {
  const { inked } = m._inkGrid();
  return inked.reduce((a, b) => a + b, 0) / inked.length;
};

test('spreading: enough ink covers the surface, and the water never holds it back', () => {
  const m = new Marble();
  m.openWater();
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    m.drop({ x: -400 + c * 160, y: -255 + r * 170, quantity: 1, dispersion: 1.5 });
  }
  m.settle();
  m.runUntilIdle();
  assert.ok(covered(m) > 0.85, `covered ${covered(m)}`);
});

test('spreading: a drop with water on one side keeps spreading that way', () => {
  const m = new Marble();
  m.openWater();
  const left = m.drop({ x: -60, quantity: 1, dispersion: 2 });
  const right = m.drop({ x: 60, quantity: 1, dispersion: 2 });
  m.runUntilIdle();
  const lone = new Marble();
  lone.openWater();
  const free = lone.drop({ quantity: 1, dispersion: 2 });
  lone.runUntilIdle();
  assert.ok(reach(left.poly, -1) + left.x > reach(left.poly, 1) - left.x, 'grows further away from its neighbour');
  assert.ok(area(left.poly) + area(right.poly) > area(free.poly) * 1.2, 'two drops cover more than one');
});

test('spreading: a stronger ink covers more and squeezes its neighbour', () => {
  const run = (spreading) => {
    const m = new Marble();
    m.openWater();
    const a = m.drop({ x: -70, quantity: 1, dispersion: 2, spreading });
    const b = m.drop({ x: 70, quantity: 1, dispersion: 2 });
    m.runUntilIdle();
    return area(a.poly) / area(b.poly);
  };
  assert.ok(run(12) > run(4) * 1.3, `${run(12)} vs ${run(4)}`);
});

test('spreading: a full walled tank still settles, layer after layer', () => {
  const m = new Marble();
  m.walls();
  m.openWater();
  const placed = [];
  for (let layer = 0; layer < 4; layer++) {
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      placed.push(m.drop({ x: (c - 2) * 143 + (r % 2) * 71, y: (2 - r) * 117, quantity: 1.5 }));
    }
    m.settle();
  }
  const t = m.step && Date.now();
  while (m.busy && m.time < 120) m.step();
  assert.equal(m.busy, false, `still busy at ${m.time}s, ${m.polys.length} landed, ${Date.now() - t} ms`);
  assert.equal(m.polys.length, placed.length, 'every layer landed');
});

test('spreading: water does not hold ink back from the walls', () => {
  const m = new Marble();
  m.walls();
  m.openWater();
  const d = m.drop({ x: 400, quantity: 2, dispersion: 2 });
  m.runUntilIdle();
  assert.ok(500 - reach(d.poly, 1) < 3, `gap to the wall is ${500 - reach(d.poly, 1)} mm`);
  assert.ok(Math.abs(d.x - 400) < 15, `drop was pushed to ${d.x}`);
});

test('spreading: no film of water is left between drops that meet', () => {
  const m = new Marble();
  m.openWater();
  const a = m.drop({ x: -90, quantity: 1, dispersion: 2 });
  const b = m.drop({ x: 90, quantity: 1, dispersion: 2 });
  m.runUntilIdle();
  const gap = -reach(b.poly, -1) - reach(a.poly, 1);
  assert.ok(gap < 2, `gap between the drops is ${gap} mm`);
});

test('spreading: packed drops come to rest in reasonable time', () => {
  const m = new Marble();
  m.openWater();
  for (let i = 0; i < 25; i++) m.drop({ x: -300 + (i % 5) * 150, y: -240 + Math.floor(i / 5) * 120, quantity: 1 });
  m.settle();
  m.runUntilIdle();
  assert.ok(m.time < 60, `settled at ${m.time}s`);
});

test('open water: drops added to the middle push the ink around them outward', () => {
  const m = new Marble();
  m.openWater();
  const first = m.drop({ quantity: 0.15, color: '#f00' });
  m.settle();
  m.runUntilIdle();
  const before = area(first.poly);
  const added = 7;
  for (let i = 0; i < added; i++) {
    m.drop({ quantity: 0.15, color: '#000' });
    m.settle();
    m.runUntilIdle();
  }
  // Ink doesn't compress, so the outline should gain about the area that was added.
  const normal = Math.PI * maxRadius(0.15, m.film) ** 2;
  const gained = area(first.poly) - before;
  assert.ok(gained > added * normal * 0.8, `outline gained ${gained}, added ${added * normal}`);
  assert.ok(gained < added * normal * 1.2, `outline gained ${gained}, added ${added * normal}`);
});

test('open water: drops close up to neighbours without flinging distant ink', () => {
  const m = new Marble();
  m.openWater();
  const a = m.drop({ x: -70, y: 0, quantity: 1, dispersion: 2 });
  const b = m.drop({ x: 70, y: 0, quantity: 1, dispersion: 2 });
  const far = m.drop({ x: 450, y: 300, quantity: 0.05, dispersion: 2 });
  m.runUntilIdle();
  const gap = -reach(b.poly, -1) - reach(a.poly, 1);
  assert.ok(gap < 8, `gap between neighbours is ${gap} mm`);
  assert.ok(Math.hypot(far.x - 450, far.y - 300) < 10, `distant drop moved to ${far.x}, ${far.y}`);

  const plain = new Marble();
  plain.drop({ x: -70, y: 0, quantity: 1, dispersion: 2 });
  plain.drop({ x: 70, y: 0, quantity: 1, dispersion: 2 });
  plain.runUntilIdle();
  assert.ok(-reach(plain.polys[1], -1) - reach(plain.polys[0], 1) > 30, 'off leaves a clear gap');
});

test('settle holds a rake until every drop has truly finished, however slow', () => {
  const m = new Marble();
  const slow = m.drop({ quantity: 2, dispersion: 0.3 });
  m.settle();
  const r = m.rake({ from: [-300, 0], to: [300, 0], teeth: 2 });
  let startedWhileGrowing = false;
  while (m.busy) {
    m.step();
    if (m.active.includes(r) && m.active.includes(slow)) startedWhileGrowing = true;
  }
  assert.equal(startedWhileGrowing, false);
  assert.ok(r.at >= slow.growTime - 0.1, `rake at ${r.at}, growth ${slow.growTime}`);
});

test('settle works with open water, chains, and counts wait from the settle point', () => {
  const m = new Marble();
  m.openWater();
  const a = m.drop({ quantity: 1, dispersion: 1 });
  m.settle();
  m.wait(1);
  const r1 = m.rake({ from: [-200, 0], to: [200, 0], teeth: 1, speed: 200 });
  m.settle();
  const b = m.drop({ x: 200, quantity: 0.5, dispersion: 2 });
  m.runUntilIdle();
  assert.ok(a.poly && b.poly);
  assert.ok(r1.at > 1, `rake at ${r1.at}`);
  assert.ok(b.at >= r1.at + 2 - 0.1, `second drop at ${b.at} after rake at ${r1.at}`);
  assert.equal(m.busy, false);
  assert.ok(m.toScript().includes('settle'));
});

test('inOrder spaces actions; allAtOnce starts them together; both replay', () => {
  const build = () => {
    const m = new Marble();
    m.inOrder({ gap: 1 });
    const a = m.drop({ quantity: 0.5 });
    const b = m.drop({ quantity: 0.5 });
    const r = m.rake({ from: [-100, 0], to: [100, 0], teeth: 1, speed: 100 });
    const c = m.drop({ quantity: 0.5 });
    m.allAtOnce();
    const d = m.drop({ x: 50, quantity: 0.5 });
    const e = m.drop({ x: -50, quantity: 0.5 });
    return { m, a, b, r, c, d, e };
  };
  const { m, a, b, r, c, d, e } = build();
  near(b.at - a.at, 1, 1e-9, 'gap between drops');
  near(r.at - b.at, 1, 1e-9, 'gap before the tool');
  near(c.at - r.at, 3, 1e-9, 'tool duration plus gap');
  near(d.at, e.at, 1e-9, 'together again');
  const again = new Marble().replay(m.log);
  assert.deepEqual(again.pending.map((o) => o.at), m.pending.map((o) => o.at));
});

test('many drops on one spot in order nest, last on top', () => {
  const m = new Marble();
  m.inOrder({ gap: 0.5 });
  for (let i = 0; i < 4; i++) m.drop({ x: 40, y: 20, quantity: 1, dispersion: 3, color: `#00000${i}` });
  m.runUntilIdle();
  assert.deepEqual(m.polys.map((p) => p.color), ['#000000', '#000001', '#000002', '#000003']);
  assert.ok(area(m.polys[0]) > area(m.polys[3]) * 0.8);
  let right = -Infinity;
  for (let i = 0; i < m.polys[0].n; i++) right = Math.max(right, m.polys[0].xy[i * 2]);
  let inner = -Infinity;
  for (let i = 0; i < m.polys[3].n; i++) inner = Math.max(inner, m.polys[3].xy[i * 2]);
  assert.ok(right > inner, 'earlier ink is pushed outside later ink');
});

test('live actions start now even while a settle is waiting, and replay the same', () => {
  const m = new Marble();
  m.drop({ quantity: 1, dispersion: 0.5 });
  m.settle();
  const later = m.rake({ from: [-100, 0], to: [100, 0], teeth: 1 });
  for (let i = 0; i < 30; i++) m.step();
  const now = m.live(() => m.drop({ x: 200, quantity: 0.2, at: m.time }));
  m.step();
  assert.ok(m.sources.includes(now), 'drop landed while the rake is still held');
  assert.equal(later.at, undefined);
  const again = new Marble().replay(m.log);
  assert.equal(again.log.at(-1).live, true);
});

// ---- The catalogue the assistant reads must match what scripts can really call.

// Splits "a = 1, b = [1, 2], c" on its top-level commas.
function splitParams(src) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of src) {
    if ('[{('.includes(ch)) depth++;
    if (']})'.includes(ch)) depth--;
    if (ch === ',' && !depth) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim());
}

test('api.js lists exactly what scripts have in scope', () => {
  const inScope = Object.keys(scriptApi(new Marble(), { text() {} })).sort();
  assert.deepEqual([...COMMANDS, ...VALUES].map((c) => c.name).sort(), inScope);
});

test('api.js options match the engine', () => {
  for (const c of COMMANDS.filter((x) => x.params && x.name !== 'text')) {
    const src = Marble.prototype[c.engine ?? c.name].toString();
    const options = src.slice(src.indexOf('{') + 1, src.indexOf('} = {})'));
    const actual = splitParams(options).map((p) => p.split('=')[0].trim());
    assert.deepEqual(actual, c.params.map(([name]) => name), c.name);
  }
});

test('api.js text options match the wrapper in ui.js', async () => {
  const ui = await readFile(new URL('./ui.js', import.meta.url), 'utf8');
  const options = ui.match(/const \{ (.*?) \} = toMm\('text'/)[1];
  const names = splitParams(options).map((p) => p.split(/[=:]/)[0].trim()).sort();
  assert.deepEqual(COMMANDS.find((c) => c.name === 'text').params.map((p) => p[0]).sort(), names);
});

// ---- The 0-100 page.

const op = (m) => m.log.at(-1).args;

test('page units: corners, centre and sizes land in the right place on any tank', () => {
  for (const [width, height] of [[1000, 700], [400, 900]]) {
    const m = new Marble({ width, height });
    const api = scriptApi(m);
    assert.equal(api.ASPECT, height / width);
    api.drop({ x: 50, y: 50 });
    assert.deepEqual([op(m).x, op(m).y], [0, 0]);
    api.drop({ x: 0, y: 0 });
    assert.deepEqual([op(m).x, op(m).y], [-width / 2, height / 2], 'top left');
    api.drop({ x: 100, y: 100 });
    assert.deepEqual([op(m).x, op(m).y], [width / 2, -height / 2], 'bottom right');
    api.drop({ quantity: 10 });
    const area = (op(m).quantity * 1000) / m.film;
    near(area / (width * height), 0.1, 1e-9, 'quantity is a share of the tank');
    api.stir({ radii: [10, -20], D: 3 });
    assert.deepEqual(op(m).radii, [width / 10, -width / 5]);
    near(op(m).D, width * 0.03, 1e-9, 'sizes are a share of the width');
  }
});

test('page units: defaults scale with the tank and centre on it', () => {
  const small = new Marble({ width: 500, height: 350 });
  scriptApi(small).stir();
  assert.deepEqual(op(small).radii, [50, 100, 150]);
  assert.deepEqual([op(small).x, op(small).y], [0, 0]);
});

test('page units: a shift of positive dy moves down the page', () => {
  const m = new Marble();
  scriptApi(m).shift({ dy: 10 });
  assert.equal(op(m).dy, -70);
});

test('a session written out as a script reproduces itself', () => {
  const source = `drop({ x: 30, y: 20, quantity: 2 });
  settle();
  inOrder({ gap: 0.1 });
  stir({ x: 40, y: 60, radii: [10], degrees: 90 });
  wait(1);
  allAtOnce();
  rake({ from: [10, 10], to: [90, 90], teeth: 3, waveAmp: 1, waveLength: 8 });
  shift({ dx: 2, dy: 3 });`;
  const first = new Marble();
  runScript(first, source);
  const written = first.toScript();
  const second = new Marble();
  runScript(second, written);
  assert.equal(second.toScript(), written);
  first.runUntilIdle();
  second.runUntilIdle();
  near(first.polys[0].xy[0], second.polys[0].xy[0], 0.05, 'same ink');
});

test('bath sets and removes the background, and survives being written out', () => {
  const m = new Marble();
  runScript(m, "bath({ color: '#102030' });");
  assert.equal(m.bath, '#102030');
  assert.equal(m.toScript(), 'bath({"color":"#102030"});');
  const again = new Marble();
  runScript(again, m.toScript());
  assert.equal(again.bath, '#102030');
  runScript(again, 'bath({ color: null });');
  assert.equal(again.bath, 'rgba(0,0,0,0)');
  runScript(again, "bath({ color: palette('Old Dutch').inks[0] });");
  assert.equal(again.bath, palette('Old Dutch').inks[0].color);
});

test('every option in the catalogue converts there and back', () => {
  const tank = new Marble({ width: 800, height: 600 });
  for (const c of COMMANDS.filter((x) => x.params)) {
    const page = Object.fromEntries(c.params.filter((p) => p[4]).map(([k, , , , unit]) => [k,
      { point: [20, 30], points: [[20, 30], [40, 60]], sizes: [5, -7], contours: [[20, 30, 40, 60]] }[unit] ?? 12]));
    assert.deepEqual(fromMm(c.name, toMm(c.name, page, tank), tank), { ...fromMm(c.name, toMm(c.name, {}, tank), tank), ...page }, c.name);
  }
});

// ---- Weaves.

test('a weaving rake is cut in short pieces however fast it goes', () => {
  for (const speed of [100, 1000, 5000]) {
    const m = new Marble();
    const longest = [];
    const tine = m._tine.bind(m);
    m._tine = (ax, ay, bx, by, L) => { longest.push(Math.hypot(bx - ax, by - ay)); tine(ax, ay, bx, by, L); };
    m.rake({ from: [-400, 0], to: [400, 0], teeth: 1, speed, waveAmp: 20, waveLength: 40, at: 0 });
    m.runUntilIdle();
    // A piece is a sixteenth of a weave along the rake, plus its sideways movement.
    assert.ok(Math.max(...longest) < 40 / 16 + (20 * 2 * Math.PI) / 16, `speed ${speed}: ${Math.max(...longest)}`);
  }
});

test('weave shapes join up from one weave to the next and stay in height', () => {
  for (const [name, shape] of Object.entries(WEAVE_SHAPES)) {
    const start = shape(0);
    const end = shape(0.99999);
    assert.ok(Math.abs(start[0] - end[0]) < 0.01 && Math.abs(start[1] - end[1]) < 0.01, `${name} jumps between weaves`);
    for (let t = 0; t < 1; t += 0.01) assert.ok(Math.abs(shape(t)[1]) <= 1.0001, `${name} is too tall at ${t}`);
  }
});

test('a curl really does travel backwards along the rake', () => {
  const m = new Marble();
  const r = m.rake({ from: [-200, 0], to: [200, 0], teeth: 1, waveAmp: 20, waveLength: 40, waveShape: 'curl', at: 0 });
  let back = false;
  let last = -Infinity;
  for (let d = 0; d < 80; d += 1) {
    const [x] = m._rakePoint(r, d, 0);
    if (x < last) back = true;
    last = x;
  }
  assert.ok(back);
});

test('a saved state comes back exactly, mid-growth, and carries on the same', () => {
  const run = (m) => { while (m.busy) m.step(); return m.polys.map((p) => Array.from(p.xy.subarray(0, p.n * 2))); };
  const m = new Marble();
  m.openWater();
  m.drop({ x: -100, quantity: 2, dispersion: 1 });
  m.drops({ n: 5, quantity: 0.2 });
  for (let i = 0; i < 10; i++) m.step();
  const state = m.saveState();
  const first = run(m);
  m.drop({ x: 200, quantity: 1 });
  run(m);
  const back = new Marble();
  back.loadState(state);
  assert.ok(back.busy, 'still growing');
  assert.deepEqual(run(back), first);
  assert.equal(back.active.every((op) => !op.poly || back.polys.includes(op.poly)), true);
});

test('a saved state keeps drops attached to their outlines', () => {
  const m = new Marble();
  const d = m.drop({ quantity: 1 });
  for (let i = 0; i < 5; i++) m.step();
  const back = new Marble().loadState(m.saveState());
  assert.ok(back.active.length && back.polys.includes(back.active[0].poly));
  assert.notEqual(back.polys[0], d.poly);
});

test('fillDots fills holes largest first, without overlaps, inside the tank', () => {
  const m = new Marble({ seed: 3 });
  scriptApi(m).fillDots({ count: 80, min: 1, max: 8, gap: 0.5, colors: ['#111', '#222', '#333'] });
  const placed = m.log.filter((e) => e.fn === 'drop').map((e) => ({ ...e.args, r: maxRadius(e.args.quantity, m.film) }));
  assert.ok(placed.length > 20 && placed.length <= 80, `${placed.length} dots`);
  assert.ok(placed[0].r > placed.at(-1).r * 2, 'sizes should fall as it goes');
  for (const [i, a] of placed.entries()) {
    assert.ok(Math.abs(a.x) + a.r <= 500.01 && Math.abs(a.y) + a.r <= 350.01, `dot ${i} leaves the tank`);
    for (const b of placed.slice(i + 1)) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r, 'dots overlap');
  }
  assert.ok(new Set(placed.map((d) => d.color)).size === 3, 'uses every colour');
});

test('spray lays many dots in range, mostly tiny, thickest in the middle', () => {
  const m = new Marble({ seed: 5 });
  scriptApi(m).spray({ x: 50, y: 50, radius: 20, n: 400, min: 0.1, max: 1, colors: ['#111', '#222'] });
  const dots = m.log.filter((e) => e.fn === 'drop').map((e) => ({ ...e.args, r: maxRadius(e.args.quantity, m.film) }));
  assert.equal(dots.length, 400);
  assert.ok(dots.every((d) => d.r >= 0.99 && d.r <= 10.01), 'sizes stay in range');
  assert.ok(dots.filter((d) => d.r < 3).length > 240, 'most are tiny');
  const near = dots.filter((d) => Math.hypot(d.x, d.y) < 100).length;
  assert.ok(near > 200 && Math.max(...dots.map((d) => Math.hypot(d.x, d.y))) <= 200, 'thickest in the middle');
  assert.equal(new Set(dots.map((d) => d.color)).size, 2);
});

test('settling drops points without moving the outline, and tools still work after', () => {
  const area = ({ xy, n }) => {
    let t = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      t += xy[i * 2] * xy[j * 2 + 1] - xy[j * 2] * xy[i * 2 + 1];
    }
    return Math.abs(t) / 2;
  };
  const m = new Marble();
  const d = m.drop({ quantity: 2 });
  m.fullRake({ angle: 0, teeth: 6, at: 3 });
  while (m.pending.length || m.active.length > 0) {
    const before = d.poly ? d.poly.n : 0;
    const was = d.poly ? area(d.poly) : 0;
    const last = m.active.length === 1 && m.active[0].kind === 'rake' && m.active[0].dist + m.active[0].speed * m.dt >= m.active[0].total;
    m.step();
    if (last) {
      assert.ok(d.poly.n < before, `kept ${d.poly.n} of ${before}`);
      assert.ok(Math.abs(area(d.poly) - was) / was < 0.05);
    }
  }
  m.fullRake({ angle: 90, teeth: 4 });
  m.runUntilIdle();
  assert.ok(d.poly.n > 16);
});

test('a wide tine parts ink instead of carrying it, and closes up behind', () => {
  const run = (width) => {
    const m = new Marble();
    const xy = Float64Array.from([...Array(401).keys()].flatMap((i) => [0, -200 + i]));
    m.polys.push({ xy, n: 401, color: '#000' });
    m.rake({ from: [-300, 0], to: [300, 0], teeth: 1, speed: 100, D: 0.1, width, at: 0 });
    let furthest = 0;
    while (m.busy) {
      m.step();
      const p = m.polys[0];
      for (let i = 0; i < p.n; i++) furthest = Math.max(furthest, Math.abs(p.xy[i * 2]));
    }
    return furthest;
  };
  assert.ok(run(0) < 2);
  const moved = run(30);
  // A carried point would travel the whole 600 mm; a parted one is dropped along the way.
  assert.ok(moved > 2 && moved < 300, `ink moved at most ${moved}`);
});

test('a rake without a weave takes one straight piece per tick', () => {
  const m = new Marble();
  let pieces = 0;
  const tine = m._tine.bind(m);
  m._tine = (...a) => { pieces++; tine(...a); };
  const r = m.rake({ from: [-100, 0], to: [100, 0], teeth: 1, speed: 100, at: 0 });
  m.runUntilIdle();
  near(pieces, r.total / (r.speed * m.dt), 2, 'one per tick');
});

test('sidebar dials run 0 to 100 and every position gives its own value', () => {
  for (const [min, max] of [[0.1, 4], [0, 10], [0.05, 30], [100, 20000], [0.2, 10]]) {
    assert.equal(dialToValue(0, min, max), min);
    assert.equal(dialToValue(100, min, max), max);
    for (let d = 0; d <= 100; d++) {
      const v = dialToValue(d, min, max);
      if (d) assert.ok(v > dialToValue(d - 1, min, max), `${min}-${max}: ${d} isn't above ${d - 1}`);
      assert.equal(valueToDial(v, min, max), d, 'a value reads back to its own position');
    }
  }
});

test('a wide tine leaves a clean outline, with few sharp turns', () => {
  const m = new Marble({ width: 1000, height: 700 });
  const band = [...Array(400).keys()].flatMap((i) => (i < 200 ? [-50, -340 + i * 3.4] : [-10, 340 - (i - 200) * 3.4]));
  m.polys.push({ xy: Float64Array.from(band), n: 400, color: '#112233' });
  m.rake({ from: [-300, 0], to: [300, 0], teeth: 1, speed: 100, D: 1, width: 40, at: 0 });
  m.runUntilIdle();
  const { xy, n } = m.polys[0];
  let sharp = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const k = (i + 2) % n;
    const ax = xy[j * 2] - xy[i * 2];
    const ay = xy[j * 2 + 1] - xy[i * 2 + 1];
    const bx = xy[k * 2] - xy[j * 2];
    const by = xy[k * 2 + 1] - xy[j * 2 + 1];
    const turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
    // Away from the band's own corners.
    if (Math.abs(xy[j * 2 + 1]) < 300 && turn > Math.PI / 2) sharp++;
  }
  assert.ok(sharp <= 4, `${sharp} sharp turns`);
});

test('a slider can run past 100 without moving the values below it', () => {
  const over = { top: 200, value: 6 };
  assert.equal(dialToValue(100, 0.3, 3, over), 3);
  assert.equal(dialToValue(52, 0.3, 3, over), dialToValue(52, 0.3, 3));
  assert.equal(dialToValue(150, 0.3, 3, over), 4.5);
  assert.equal(dialToValue(200, 0.3, 3, over), 6);
  for (const d of [0, 52, 100, 101, 150, 200]) assert.equal(valueToDial(dialToValue(d, 0.3, 3, over), 0.3, 3, over), d);
});

test('the point limit holds however hard ink is stretched', () => {
  const m = new Marble({ maxVertices: 6000 });
  for (let i = 0; i < 40; i++) m.drop({ x: -400 + (i % 8) * 110, y: -280 + (i >> 3) * 140, quantity: 1, dispersion: 5 });
  m.settle();
  m.fullRake({ angle: 0, teeth: 40, speed: 800, D: 40 });
  m.fullRake({ angle: 90, teeth: 40, speed: 800, D: 40 });
  let most = 0;
  for (let i = 0; i < 400 && m.busy; i++) { m.step(); most = Math.max(most, m.vertexCount); }
  assert.ok(most <= 6000 * 1.01, `reached ${most}`);
  assert.ok(most > 4500, `only reached ${most}, so this test didn't press the limit`);
});

test('a point budget raises the detail a tank keeps', () => {
  const a = new Marble();
  const b = new Marble({ pointBudget: 1000000, maxVertices: 5000000 });
  assert.equal(a.detailBudget, 60000);
  assert.equal(b.detailBudget, 1000000);
  assert.equal(new Marble({ pointBudget: 5 }).saveState().pointBudget, 5);
});

test('a painted stroke is ordinary ink that redraws identically', () => {
  const m = new Marble();
  m.paint({ path: [[-200, 0], [200, 50]], width: 40, wobble: 8, swell: 0.3, color: '#102030' });
  m.step();
  assert.equal(m.polys.length, 1);
  const again = new Marble();
  again.replay(m.log);
  again.step();
  assert.deepEqual(Array.from(again.polys[0].xy), Array.from(m.polys[0].xy));
  let area = 0;
  const { xy, n } = m.polys[0];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += xy[i * 2] * xy[j * 2 + 1] - xy[j * 2] * xy[i * 2 + 1];
  }
  const length = Math.hypot(400, 50);
  assert.ok(area > 0, 'runs counter-clockwise');
  assert.ok(Math.abs(area / 2 - length * 40) < length * 40 * 0.25, `area ${area / 2}`);
  assert.equal(m.saveState().polys.length, 1);
});

test('stripes leave no water in the tank, in any simulator', async () => {
  const { MODELS } = await import('./models.js');
  for (const { label: name, engine: Engine = Marble } of MODELS) {
    if (Engine.prototype.printInk) continue; // no outlines; gridink.test.mjs checks its stripes
    const m = new Engine();
    m.stripes({ angle: 30, count: 12, colors: ['#111111', '#222222', '#333333'] });
    m.step();
    const canvas = { covers(x, y) {
      for (const { xy, n } of m.polys) {
        let inside = false;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const yi = xy[i * 2 + 1], yj = xy[j * 2 + 1];
          if ((yi > y) !== (yj > y) && x < xy[i * 2] + ((y - yi) / (yj - yi)) * (xy[j * 2] - xy[i * 2])) inside = !inside;
        }
        if (inside) return true;
      }
      return false;
    } };
    let bare = 0;
    for (let i = 0; i < 40; i++) for (let j = 0; j < 30; j++) {
      if (!canvas.covers(-490 + i * 25, -340 + j * 23.5)) bare++;
    }
    assert.equal(bare, 0, `${name}: ${bare} of 1200 points are bare`);
  }
});

// ---- Air

test('a breath of air moves ink around without changing its area, and the same seed repeats exactly', () => {
  const run = (seed) => {
    const m = new Marble();
    m.drop({ x: -100, y: 50, quantity: 2, color: '#a00' });
    m.drop({ x: 150, y: -80, quantity: 1, color: '#00a' });
    m.runUntilIdle();
    const before = m.polys.map(area);
    const start = m.polys.map((p) => Float64Array.from(p.xy.subarray(0, p.n * 2)));
    m.air({ scale: 150, speed: 80, duration: 2, seed });
    m.runUntilIdle();
    return { m, before, start, after: m.polys.map(area) };
  };
  const a = run(7);
  for (let i = 0; i < a.before.length; i++) near(a.after[i], a.before[i], a.before[i] * 0.01, `area of drop ${i}`);
  let moved = 0;
  for (let i = 0; i < a.start.length; i++) for (let j = 0; j < a.start[i].length; j++) moved = Math.max(moved, Math.abs(a.m.polys[i].xy[j] - a.start[i][j]));
  assert.ok(moved > 20, `ink moved ${moved} mm`);
  const b = run(7);
  for (let i = 0; i < a.m.polys.length; i++) assert.deepEqual(Array.from(a.m.polys[i].xy.subarray(0, a.m.polys[i].n * 2)), Array.from(b.m.polys[i].xy.subarray(0, b.m.polys[i].n * 2)));
  const c = run(8);
  assert.notDeepEqual(Array.from(a.m.polys[0].xy.subarray(0, 20)), Array.from(c.m.polys[0].xy.subarray(0, 20)));
});

test('air draws a seed when none is given, records it, and the script and replay reproduce it', () => {
  const m = new Marble();
  m.drop({ quantity: 2 });
  m.runUntilIdle();
  runScript(m, 'air({ scale: 15, speed: 6, duration: 1 });');
  m.runUntilIdle();
  const logged = m.log.at(-1);
  assert.equal(logged.fn, 'air');
  assert.ok(Number.isInteger(logged.args.seed));
  assert.match(m.toScript(), /air\(\{"scale":15,"speed":6,"octaves":2,"duration":1,"seed":\d+,"at":[\d.]+\}\);/);
  // A replay never idles between the drop and the breath, so its outline is sampled differently;
  // the shape has to be the same.
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
  const same = (other, what) => {
    near(area(other.polys[0]), area(m.polys[0]), area(m.polys[0]) * 0.005, `${what} area`);
    const [ax, ay] = centroid(other.polys[0]);
    const [bx, by] = centroid(m.polys[0]);
    assert.ok(Math.hypot(ax - bx, ay - by) < 0.5, `${what} centroid moved ${Math.hypot(ax - bx, ay - by)} mm`);
  };
  same(new Marble().replay(m.log).runUntilIdle(), 'replay');
  const fromScript = new Marble();
  runScript(fromScript, m.toScript());
  same(fromScript.runUntilIdle(), 'script');
});

test('a saved state in the middle of a breath carries on the same', () => {
  const m = new Marble();
  m.drop({ quantity: 2 });
  m.runUntilIdle();
  m.air({ scale: 150, speed: 80, duration: 2, seed: 3 });
  for (let i = 0; i < 20; i++) m.step();
  const copy = new Marble().loadState(m.saveState());
  m.runUntilIdle();
  copy.runUntilIdle();
  assert.deepEqual(Array.from(copy.polys[0].xy.subarray(0, copy.polys[0].n * 2)), Array.from(m.polys[0].xy.subarray(0, m.polys[0].n * 2)));
});

const dotsAfter = (m, n) => m.log.filter((e) => e.fn === 'drop').slice(n).map((e) => ({ ...e.args, r: maxRadius(e.args.quantity, m.film) * Math.sqrt(m.spreadFactor) }));
const FILL = { count: 150, min: 1, max: 9, gap: 0.3, colors: ['#111', '#222'] };

test('fillDots goes around a drop still to land, and around one that has landed', () => {
  for (const settled of [false, true]) {
    const m = new Marble({ seed: 3 });
    const api = scriptApi(m);
    api.drop({ x: 50, y: 50, quantity: 10, color: '#f00' });
    const R = Math.sqrt(m.queued.concat(m.active)[0].maxArea);
    if (settled) { m.settle(); while (m.busy) m.step(); }
    api.fillDots(FILL);
    const dots = dotsAfter(m, 1);
    assert.ok(R > 100 && dots.length > 10, `R ${R}, ${dots.length} dots`);
    for (const d of dots) assert.ok(Math.hypot(d.x, d.y) >= R + d.r - 1, `dot at ${d.x},${d.y} on the drop (settled ${settled})`);
  }
});

test('two fills in a row share the room, and over puts dots on top', () => {
  const m = new Marble({ seed: 3 });
  const api = scriptApi(m);
  api.fillDots({ ...FILL, count: 10 });
  api.fillDots({ ...FILL, count: 40 });
  const all = dotsAfter(m, 0);
  for (const [i, a] of all.entries()) for (const b of all.slice(i + 1)) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r - 0.01, 'overlap');
  const o = new Marble({ seed: 3 });
  const oapi = scriptApi(o);
  oapi.drop({ x: 50, y: 50, quantity: 40, color: '#f00' });
  const R = Math.sqrt(o.queued.concat(o.active)[0].maxArea);
  oapi.fillDots({ ...FILL, over: true });
  assert.ok(dotsAfter(o, 1).some((d) => Math.hypot(d.x, d.y) < R), 'some dot should land on it');
});

test('an empty tank fills as it always did', () => {
  const a = new Marble({ seed: 3 });
  const b = new Marble({ seed: 3 });
  scriptApi(a).fillDots(FILL);
  scriptApi(b).fillDots({ ...FILL, over: true });
  assert.deepEqual(a.log, b.log);
});

test('an eraser removes exactly its share of ink, and the surface closes up around it', () => {
  const m = new Marble({ width: 300, height: 210 });
  m.drop({ x: 0, y: 0, quantity: 1, dispersion: Infinity, color: '#123456' });
  m.drop({ x: 110, y: 0, quantity: 0.02, dispersion: Infinity, color: '#654321' });
  m.step();
  const area = ({ xy, n }) => {
    let sum = 0;
    for (let i = 0, k = n - 1; i < n; k = i++) sum += xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
    return Math.abs(sum) / 2;
  };
  const big = m.polys[0];
  const R = Math.sqrt(area(big) / Math.PI);
  const r = 12;
  // The big drop pushed this one aside as it landed, so find where it is now.
  const small = m.polys[1];
  let sx = 0, sy = 0;
  for (let i = 0; i < small.n; i++) { sx += small.xy[i * 2] / small.n; sy += small.xy[i * 2 + 1] / small.n; }
  m.erase({ x: sx, y: sy, radius: Math.sqrt(area(small) / Math.PI) + 1, duration: 0.5 });
  m.runUntilIdle();
  assert.equal(m.polys.length, 1, 'the swallowed drop is gone');
  const remaining = area(big);
  m.erase({ x: R, y: 0, radius: r, duration: 0.5 });
  m.runUntilIdle();
  // Exactly the lens where the eraser's disc overlapped the drop.
  const lens = r * r * Math.acos(r / (2 * R)) + R * R * Math.acos(1 - (r * r) / (2 * R * R))
    - 0.5 * Math.sqrt((2 * R - r) * r * r * (2 * R + r));
  const lost = remaining - area(big);
  assert.ok(Math.abs(lost - lens) < 0.05 * lens, `lost ${lost}, expected ${lens}`);
  assert.ok(big.xy.subarray(0, big.n * 2).every(Number.isFinite));
});

test('erasing replays exactly, and works on a repeating tank', () => {
  const build = (tiled) => {
    const m = new Marble({ width: 200, height: 200 });
    if (tiled) m.tile();
    m.drop({ x: 0, y: 0, quantity: 40 * 40 * m.film / 1000, dispersion: Infinity });
    m.erase({ x: 30, y: 0, radius: 15, duration: 0.4 });
    return m.runUntilIdle();
  };
  const a = build(false), b = build(false), t = build(true);
  assert.deepEqual([...a.polys[0].xy.subarray(0, a.polys[0].n * 2)], [...b.polys[0].xy.subarray(0, b.polys[0].n * 2)]);
  assert.ok(t.polys[0].xy.every(Number.isFinite));
});

test('lifting ink cuts out exactly the circle and leaves everything else where it was', () => {
  const area = ({ xy, n }) => {
    let sum = 0;
    for (let i = 0, k = n - 1; i < n; k = i++) sum += xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
    return Math.abs(sum) / 2;
  };
  const start = () => {
    const m = new Marble({ width: 300, height: 210 });
    m.drop({ x: 0, y: 0, quantity: 1, dispersion: Infinity, color: '#123456' });
    m.step();
    return m;
  };
  const a = start();
  const R = Math.sqrt(area(a.polys[0]) / Math.PI);
  // Wholly inside: a hole, whose outline keeps the ink's own points unmoved.
  const before = a.polys[0].n;
  a.erase({ x: 5, y: 5, radius: 10, mode: 'lift' });
  a.step();
  assert.ok(Math.abs(Math.PI * R * R - area(a.polys[0]) - Math.PI * 100) < 2, 'a hole takes the disc');
  assert.ok(a.polys[0].n > before);
  // Over the edge: exactly the lens.
  const b = start();
  const r = 12;
  b.erase({ x: R, y: 0, radius: r, mode: 'lift' });
  b.step();
  const lens = r * r * Math.acos(r / (2 * R)) + R * R * Math.acos(1 - (r * r) / (2 * R * R))
    - 0.5 * Math.sqrt((2 * R - r) * r * r * (2 * R + r));
  assert.ok(Math.abs(Math.PI * R * R - area(b.polys[0]) - lens) < 0.02 * lens);
  // Across the middle, a line of cuts splits it in two, and both pieces stay.
  const c = start();
  for (let x = -R - 5; x <= R + 5; x += 3) c.erase({ x, y: 0, radius: 4, mode: 'lift' });
  c.step();
  assert.equal(c.polys.length, 2);
  assert.ok(Math.abs(area(c.polys[0]) - area(c.polys[1])) < 0.02 * area(c.polys[0]));
  // All of it.
  const d = start();
  d.erase({ x: 0, y: 0, radius: R + 2, mode: 'lift' });
  d.step();
  assert.equal(d.polys.length, 0);
  // Across a seam of a repeating tank.
  const t = new Marble({ width: 200, height: 200 });
  t.tile();
  t.drop({ x: 95, y: 0, quantity: 0.2, dispersion: Infinity });
  t.step();
  const whole = area(t.polys[0]);
  t.erase({ x: -100, y: 0, radius: 5, mode: 'lift' });
  t.step();
  assert.ok(whole - area(t.polys[0]) > 0.9 * Math.PI * 25, 'the image of the circle cuts too');
});

test('rings in filled dots land one at a time, even with a start time', () => {
  const m = new Marble({ width: 300, height: 210, seed: 1 });
  const dots = m.fillDots({ count: 6, min: 5, max: 15, rings: 2, colors: ['#111111', '#222222', '#333333'], at: 0 });
  m.step();
  assert.equal(m.sources.length, dots, 'only the first ring has started');
  m.runUntilIdle();
  assert.equal(m.sources.length, dots * 2);
});

test('filling a repeating tank uses its edges, and keeps dots apart across them', () => {
  const wrap = (d, L) => d - L * Math.floor(d / L + 0.5);
  const m = new Marble({ width: 300, height: 210, seed: 2 });
  m.tile();
  const placed = [];
  const drop = m.drop.bind(m);
  m.drop = (o) => { placed.push(o); return drop(o); };
  m.fillDots({ count: 80, min: 4, max: 18, gap: 1, colors: ['#111111', '#222222'] });
  const R = (o) => Math.sqrt((o.quantity * 1000) / (m.film * Math.PI));
  const across = placed.filter((o) => Math.abs(o.x) + R(o) > 150 || Math.abs(o.y) + R(o) > 105);
  assert.ok(across.length >= 3, `only ${across.length} of ${placed.length} sit across an edge`);
  for (let i = 0; i < placed.length; i++) {
    for (let j = 0; j < i; j++) {
      const d = Math.hypot(wrap(placed[i].x - placed[j].x, 300), wrap(placed[i].y - placed[j].y, 210));
      assert.ok(d >= R(placed[i]) + R(placed[j]), `dots ${i} and ${j} overlap across a seam`);
    }
  }
});

test('filling a tank that does not repeat still keeps dots inside it', () => {
  const m = new Marble({ width: 300, height: 210, seed: 2 });
  const placed = [];
  const drop = m.drop.bind(m);
  m.drop = (o) => { placed.push(o); return drop(o); };
  m.fillDots({ count: 40, min: 4, max: 18, colors: ['#111111'] });
  const R = (o) => Math.sqrt((o.quantity * 1000) / (m.film * Math.PI));
  for (const o of placed) assert.ok(Math.abs(o.x) + R(o) <= 150.01 && Math.abs(o.y) + R(o) <= 105.01);
});

test('stripes with no unevenness and no wobble are straight bands of equal width', () => {
  const m = new Marble({ width: 400, height: 400, seed: 3 });
  const made = [];
  const paint = m.paint.bind(m);
  m.paint = (o) => { made.push(o); return paint(o); };
  m.stripes({ count: 8, colors: ['#111111', '#222222'], variation: 0, wobble: 0, slivers: 0 });
  m.runUntilIdle();
  assert.equal(made.length, 8);
  const ys = made.map((o) => o.path[0][1]).sort((a, b) => a - b);
  for (let i = 2; i < ys.length; i++) assert.ok(Math.abs(ys[i] - ys[i - 1] - (ys[1] - ys[0])) < 1e-6, `band ${i} is ${ys[i] - ys[i - 1]} from the last`);
  for (const o of made) assert.equal(o.wobble, 0);
  for (const { xy, n } of m.polys) {
    const seen = new Set();
    for (let i = 0; i < n; i++) if (Math.abs(xy[i * 2]) < 150) seen.add(Math.round(xy[i * 2 + 1] * 100));
    assert.ok(seen.size <= 2, 'a band has straight edges');
  }
});

test('on a repeating tank even stripes are even all the way round, including at the seam', () => {
  const m = new Marble({ width: 400, height: 400, seed: 3 });
  m.tile();
  m.step();
  const colors = ['#111111', '#555555', '#999999', '#dddddd'];
  m.stripes({ count: 8, colors, variation: 0, wobble: 0, slivers: 0 });
  m.runUntilIdle();
  // Which outline shows at each height: the last drawn wins, in every copy.
  const top = (y) => {
    let found = -1;
    m.polys.forEach((poly, p) => {
      for (const [, sy] of m.tileShifts([poly])) {
        const ys = [];
        for (let i = 0; i < poly.n; i++) ys.push(poly.xy[i * 2 + 1] + sy);
        if (y > Math.min(...ys) && y < Math.max(...ys)) found = p;
      }
    });
    return found;
  };
  const edges = [];
  for (let y = -199.5; y < 200; y++) if (top(y) !== top(y - 1)) edges.push(y);
  assert.equal(edges.length, 8, `edges at ${edges}`);
  for (let i = 0; i < 8; i++) {
    const gap = (edges[(i + 1) % 8] - edges[i] + 400) % 400;
    assert.ok(Math.abs(gap - 50) <= 1, `a band is ${gap} wide, in ${edges}`);
  }
});

test('a rake pulls dead-straight stripes, whose edges only have points outside the tank', () => {
  const m = new Marble({ width: 1000, height: 700, seed: 3, viscosity: 1000 });
  m.stripes({ count: 16, colors: ['#111111', '#555555', '#999999', '#dddddd'], variation: 0, wobble: 0, slivers: 0 });
  m.runUntilIdle();
  m.fullRake({ angle: 90, teeth: 12, speed: 200, D: 8 });
  m.runUntilIdle(60);
  let tallest = 0;
  for (const { xy, n } of m.polys) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) {
      if (Math.abs(xy[i * 2]) > 450) continue;
      lo = Math.min(lo, xy[i * 2 + 1]);
      hi = Math.max(hi, xy[i * 2 + 1]);
    }
    if (hi > lo) tallest = Math.max(tallest, hi - lo);
  }
  assert.ok(tallest > 120, `the tallest band is only ${tallest} mm`);
});

test('stripes can go around existing ink, and later ones go under what is there', () => {
  const m = new Marble({ width: 600, height: 400, seed: 3 });
  m.drop({ x: 0, y: 0, quantity: 0.3, dispersion: Infinity, color: '#ff0000' });
  m.runUntilIdle();
  const dot = m.polys[0];
  const n = m.stripes({ count: 6, colors: ['#111111', '#222222'], variation: 0, slivers: 0, over: false });
  m.step();
  assert.equal(m.polys.at(-1), dot, 'the dot stays on top');
  assert.equal(m.polys.length, n + 1);
  assert.deepEqual(m.polys.slice(0, n).map((p) => p.color), ['#111111', '#222222', '#111111', '#222222', '#111111', '#222222'], 'the bands stay in order');
  const first = m.polys[0];
  m.stripes({ count: 2, colors: ['#333333', '#444444'], variation: 0, slivers: 0, over: false });
  m.step();
  assert.equal(m.polys[0].color, '#333333');
  assert.equal(m.polys[2], first, 'a later batch goes beneath the earlier one');
  // A rake moves bands and dot alike, and it all replays in the same order.
  m.fullRake({ angle: 90, teeth: 6, speed: 200, D: 8 });
  m.runUntilIdle(40);
  const again = new Marble({ width: 600, height: 400, seed: 3 }).replay(m.log);
  again.runUntilIdle(40);
  assert.deepEqual(again.polys.map((p) => p.color), m.polys.map((p) => p.color));
  // The default is still on top.
  const top = new Marble({ width: 600, height: 400, seed: 3 });
  top.drop({ x: 0, y: 0, quantity: 0.3, dispersion: Infinity, color: '#ff0000' });
  top.runUntilIdle();
  top.stripes({ count: 6, colors: ['#111111'], slivers: 0 });
  top.step();
  assert.equal(top.polys[0].color, '#ff0000');
  assert.equal(top.log.at(-1).args.under, undefined);
});

test('a script added to a tank in use counts its times from when it starts', () => {
  const m = new Marble();
  runScript(m, 'drop({ x: 30, y: 50 });');
  m.runUntilIdle();
  const start = m.time;
  assert.ok(start > 0);
  const shapes = m.polys.length;
  runScript(m, 'drop({ x: 70, y: 50, at: 2 }); settle(); drop({ x: 50, y: 20, at: 1 });', {}, { fromNow: true });
  assert.equal(m.polys.length, shapes);
  const logged = m.log.filter((e) => e.fn === 'drop');
  assert.equal(logged[1].args.at, start + 2);
  // After a settle, times already count from that settle, so they aren't moved again.
  assert.equal(logged[2].args.at, 1);
  assert.equal(m.queued.find((op) => op.delay !== undefined).delay, 1);
  m.runUntilIdle();
  assert.equal(m.polys.length, shapes + 2);
});

test('a script on a fresh tank keeps its times as written', () => {
  const m = new Marble();
  runScript(m, 'drop({ x: 70, y: 50, at: 2 });');
  assert.equal(m.log.find((e) => e.fn === 'drop').args.at, 2);
});
