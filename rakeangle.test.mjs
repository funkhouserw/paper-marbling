// Row 80: a rake's row of teeth can be turned with angle (as fullRake's: 0 right, 90 up), whichever way
// its path first goes. Left out, the row lies across the path's first direction, as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble } from './engine.js';
import { WakeFast } from './wakefast.js';
import { TOOLS } from './tools.js';
import { COMMANDS } from './api.js';

const DEG = Math.PI / 180;
// Tines while the rake is under way: a few steps in, so the comb is moving along its path.
const tinesOf = (args, Engine = Marble) => {
  const m = new Engine({ width: 600, height: 400, seed: 2 });
  m.drop({ x: 0, y: 0, radius: 40 });
  m.settle();
  m.rake({ teeth: 7, spacing: 20, speed: 100, D: 3, ...args });
  // Until the comb is under way (it waits for the drop to settle), then a few ticks along.
  for (let i = 0; i < 2000 && !m.active.some((o) => o.kind === 'rake'); i++) m.step();
  for (let i = 0; i < 3; i++) m.step();
  return { m, tines: m.tinePositions() };
};
// How far each tine is from the line through the first tine along `dir`, and their spacing along it.
const alongRow = (tines, dir) => {
  const [x0, y0] = tines[0];
  return tines.map(([x, y]) => ({ off: Math.abs(-(x - x0) * dir[1] + (y - y0) * dir[0]), at: (x - x0) * dir[0] + (y - y0) * dir[1] }));
};

const paths = {
  east: [[-150, 0], [150, 0]],
  south: [[0, 150], [0, -150]],
  diagonal: [[-120, -90], [120, 90]],
  curving: [[-150, 60], [-60, 50], [0, 0], [30, -100], [40, -160]],
};

test('a set angle lays the teeth along the row across it, whatever the path first does', () => {
  for (const angle of [0, 30, 90, 135, 270]) {
    const row = [-Math.sin(angle * DEG), Math.cos(angle * DEG)];
    for (const [name, path] of Object.entries(paths)) {
      const { tines } = tinesOf({ path, angle });
      assert.equal(tines.length, 7);
      const r = alongRow(tines, row);
      for (const { off } of r) assert.ok(off < 1e-9, `${name} at ${angle}°: a tine is ${off} mm off the row`);
      for (let k = 1; k < r.length; k++) assert.ok(Math.abs(Math.abs(r[k].at - r[k - 1].at) - 20) < 1e-9, `${name} at ${angle}°: spacing`);
    }
  }
});

test('the angle is logged, so the comb replays the same', () => {
  const { m, tines } = tinesOf({ path: paths.curving, angle: 30 });
  const entry = m.log.find((e) => e.fn === 'rake');
  assert.equal(entry.args.angle, 30);
  const again = new Marble({ width: 600, height: 400, seed: 2 }).replay(m.log);
  while (again.time < m.time - 1e-9) again.step();
  assert.deepEqual(again.tinePositions(), tines);
});

test('without an angle (or Auto, null) the row lies across the first direction, exactly as before', () => {
  for (const [name, path] of Object.entries(paths)) {
    const [[ax, ay], [bx, by]] = path;
    const len = Math.hypot(bx - ax, by - ay);
    const before = [-(by - ay) / len, (bx - ax) / len]; // the rule up to 877cef6
    for (const angle of [undefined, null]) {
      const { m, tines } = tinesOf({ path, angle });
      assert.ok(!('angle' in m.log.find((e) => e.fn === 'rake').args), `${name}: Auto adds nothing to the log`);
      const op = m.active.find((o) => o.kind === 'rake');
      assert.deepEqual(op.perp, before, `${name}: same row, bit for bit`);
      for (const { off } of alongRow(tines, before)) assert.ok(off < 1e-9);
    }
  }
  // An angle equal to the first direction gives the same row (to rounding).
  const { tines: auto } = tinesOf({ path: paths.diagonal });
  const { tines: set } = tinesOf({ path: paths.diagonal, angle: Math.atan2(90, 120) / DEG });
  auto.forEach(([x, y], i) => { assert.ok(Math.abs(x - set[i][0]) < 1e-9 && Math.abs(y - set[i][1]) < 1e-9); });
});

test('Wake (fast) takes the angle too', () => {
  const { tines } = tinesOf({ path: paths.south, angle: 0 }, WakeFast);
  for (const { off } of alongRow(tines, [0, 1])) assert.ok(off < 1e-9);
});

test('Drawn rake offers Angle with Auto, and the script docs list it', () => {
  const p = TOOLS.drawnRake.params.angle;
  assert.equal(p[1], null);
  assert.equal(p[6].auto, 'Auto');
  assert.ok(COMMANDS.find((c) => c.name === 'rake').params.some(([name]) => name === 'angle'));
});
