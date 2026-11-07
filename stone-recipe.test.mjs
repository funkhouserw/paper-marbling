// The stone video as a regression test (see research/renders/2026-11-07-stone-stages.mjs): the
// broom-straw recipe replayed headless at a small size, with coarse ranges measured on 2026-11-07, so
// tonight's gains (distinct first-colour cells, a second colour that opens inside the first, settled
// cells that stay put) can't quietly regress. Film and Wake are too slow at test size and are left to
// the full sheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS } from './models.js';
import { Marble } from './engine.js';

const W = 400, H = 280, K = W / 1000;
const BROWN = '#3b2b24', BLUE = '#3fa7d6';

function tank(sim) {
  const model = MODELS.find((m) => m.id === sim);
  const m = new (model.engine ?? Marble)({ width: W, height: H, seed: 11 });
  m.separate({ on: true, at: 0 });
  return m;
}
const settle = (m) => { let t = 0; while (m.busy && t < 4000) { m.step(); t++; } };
// Share of the tank whose topmost ink is `color` (or any ink), sampled every 6 mm.
function cover(m, color) {
  let n = 0, t = 0;
  for (let x = -W / 2 + 4; x < W / 2; x += 6) {
    for (let y = -H / 2 + 4; y < H / 2; y += 6) {
      t++;
      const top = m.shapesAt(x, y)[0];
      if (top && (!color || top[0].color === color)) n++;
    }
  }
  return (100 * n) / t;
}

test('Classic: the broom-straw stone recipe gives distinct first cells, then a second colour that opens inside them', () => {
  const m = tank('classic');
  m.setGall({ on: true, start: 1, step: 0.5 });
  // The Broom straw tool's defaults (60 drops, colour per flick 2.5, spread 12), scaled to the tank.
  const size = (2.5 / 60 / Math.exp(0.9 ** 2 / 2)) * 0.7 * K * K;
  const flick = (x, y, color, f = 1) => m.broom({ n: 60, x: x * K, y: y * K, w: 500 * K, h: 500 * K, size: size * f, spread: 0.9, spreading: 12, color });
  const spots = [[-250, -120], [250, 120], [220, -170], [-230, 170]];
  for (const [x, y] of spots) { flick(x, y, BROWN); settle(m); }
  const first = cover(m);
  assert.ok(first > 45 && first < 75, `first colour covers ${first.toFixed(0)}% (60% on 2026-11-07)`);
  assert.ok(m.polys.length >= 150, `first colour stays ${m.polys.length} separate cells (240 on 2026-11-07)`);
  for (const [x, y] of spots.slice(0, 3)) { flick(-x * 0.8, y * 0.9, BLUE, 0.45); settle(m); }
  const blue = cover(m, BLUE);
  assert.ok(blue > 16 && blue < 46, `second colour covers ${blue.toFixed(0)}% (31% on 2026-11-07)`);
});

test('Cells: a later throw far away leaves settled cells where they were', () => {
  const m = tank('cells');
  m.broom({ n: 25, x: -60, y: 0, w: 160, h: 200, size: 0.004, spread: 0.9, spreading: 12, color: BROWN });
  settle(m);
  const middles = () => m.polys.filter((p) => p.color === BROWN).map((p) => {
    let sx = 0, sy = 0;
    for (let i = 0; i < p.n; i++) { sx += p.xy[i * 2]; sy += p.xy[i * 2 + 1]; }
    return [sx / p.n, sy / p.n];
  });
  const before = middles();
  assert.ok(before.length >= 15, `${before.length} brown cells`);
  m.broom({ n: 10, x: 120, y: 0, w: 60, h: 60, size: 0.002, spread: 0.6, spreading: 12, color: BLUE });
  settle(m);
  const after = middles();
  assert.equal(after.length, before.length, 'no brown cell lost');
  const moved = before.filter(([x, y], i) => Math.hypot(after[i][0] - x, after[i][1] - y) > 2).length;
  assert.equal(moved, 0, `${moved} settled cells moved more than 2 mm`);
});
