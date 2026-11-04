import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble } from './engine.js';
import { Film } from './film.js';
import { Wake } from './wake.js';
import { WakeFast } from './wakefast.js';
import { GridInk } from './gridink.js';

const W = 600, H = 420;
const copy = (poly) => Array.from(poly.xy.subarray(0, poly.n * 2));
const box = ({ xy, n }) => {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (let i = 0; i < n; i++) {
    a = Math.min(a, xy[i * 2]); b = Math.max(b, xy[i * 2]);
    c = Math.min(c, xy[i * 2 + 1]); d = Math.max(d, xy[i * 2 + 1]);
  }
  return [a, b, c, d];
};
const setup = (Engine, options = {}) => {
  const m = new Engine({ width: W, height: H, seed: 1, viscosity: 300, ...options });
  m.drop({ x: -120, y: 0, quantity: 0.3, dispersion: Infinity, color: '#111111' });
  m.drop({ x: 120, y: 0, quantity: 0.3, dispersion: Infinity, color: '#555555' });
  m.runUntilIdle();
  return m;
};

for (const [name, Engine] of [['Classic', Marble], ['Film', Film], ['Wake', Wake], ['Wake (fast)', WakeFast]]) {
  test(`${name}: frozen ink stays put through a full rake, and the other ink doesn't`, () => {
    const m = setup(Engine);
    const [left, right] = m.polys;
    m.freeze({ x: -120, y: 0 });
    m.step();
    assert.equal(left.frozen, true);
    assert.equal(right.frozen, undefined);
    assert.equal(m.polys.at(-1), left, 'frozen ink goes on top');
    const before = box(left);
    const other = box(right);
    m.fullRake({ angle: 35, teeth: 12, speed: 200, D: 8 });
    for (let s = 0; s < 300 && m.busy; s++) m.step();
    box(left).forEach((v, i) => assert.ok(Math.abs(v - before[i]) < 1e-6, `moved by ${v - before[i]}`));
    assert.ok(box(right).some((v, i) => Math.abs(v - other[i]) > 3), 'the other ink should be raked');
  });
}

test('unfreeze and unfreeze all let ink move again, and clicks on bare water do nothing', () => {
  const m = setup(Marble);
  const [left, right] = m.polys;
  m.freeze({ x: 280, y: 200 });
  m.step();
  assert.ok(!left.frozen && !right.frozen);
  m.freeze({ x: -120, y: 0 });
  m.freeze({ x: 120, y: 0 });
  m.step();
  assert.ok(left.frozen && right.frozen);
  m.unfreeze({ x: 120, y: 0 });
  m.step();
  assert.ok(left.frozen && !right.frozen);
  m.unfreezeAll();
  m.step();
  assert.ok(!left.frozen && !right.frozen);
  const before = copy(left);
  m.jiggle({ angle: 0, period: 90, amplitude: 8, duration: 0.3 });
  m.runUntilIdle();
  assert.notDeepEqual(copy(left), before);
});

test('unfreeze picks frozen ink even under something newer, and erasers leave frozen ink alone', () => {
  const m = setup(Marble);
  const [left] = m.polys;
  m.freeze({ x: -120, y: 0 });
  m.step();
  m.paint({ path: [[-300, 0], [300, 0]], width: 20, color: '#00ff00' });
  m.step();
  assert.notEqual(m.shapeAt(-120, 0), m.shapeAt(-120, 0, { frozen: true }));
  assert.deepEqual(m.shapeAt(-120, 0, { frozen: true }), [left]);
  const before = copy(left);
  m.erase({ x: -120, y: 0, radius: 15, mode: 'lift' });
  m.erase({ x: -120, y: 0, radius: 15, duration: 0.2 });
  m.runUntilIdle();
  assert.deepEqual(copy(left).slice(0, before.length), before);
});

test('freezing works at once when asked, saves, replays and repeats', () => {
  const m = new Marble({ width: W, height: H, seed: 1 });
  m.tile();
  m.step();
  m.drop({ x: 0, y: H / 2 - 5, quantity: 0.2, dispersion: Infinity, color: '#111111' });
  m.runUntilIdle();
  // On a repeating tank the part past the top edge shows at the bottom, and clicking it counts.
  m.live(() => m.freeze({ x: 0, y: -H / 2 + 5, at: m.time }));
  const time = m.time;
  m.applyNow();
  assert.equal(m.polys[0].frozen, true);
  assert.equal(m.queued.length, 0);
  assert.equal(m.time, time);
  const saved = new Marble({ width: W, height: H }).loadState(m.saveState());
  assert.equal(saved.polys[0].frozen, true);
  m.fullRake({ angle: 90, teeth: 8, speed: 200, D: 8 });
  m.runUntilIdle(30);
  const again = new Marble({ width: W, height: H, seed: 1 }).replay(m.log);
  again.runUntilIdle(30);
  assert.equal(again.polys[0].frozen, true);
  // Point by point they can differ, since simplifying depends on when a tank came to rest. The shape can't.
  box(again.polys[0]).forEach((v, i) => assert.ok(Math.abs(v - box(m.polys[0])[i]) < 0.1, `replay is off by ${v - box(m.polys[0])[i]}`));
});

test('Grid ink says plainly that it cannot freeze', () => {
  const m = new GridInk({ width: W, height: H, seed: 1 });
  assert.equal(m.freezeSupported, false);
  assert.throws(() => m.freeze({ x: 0, y: 0 }), /can't freeze/);
});
