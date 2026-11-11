// Row 73: on a repeating tank a slanted full rake runs as laps whose paths go tiles past the page; the
// tines the page draws must be their copies in the tile, which are the ones moving the ink.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble } from './engine.js';

const run = ({ tile, angle, offset }) => {
  const m = new Marble({ width: 1000, height: 700, seed: 1 });
  if (tile) m.tile({ on: true, offset, at: 0 });
  m.fullRake({ angle, teeth: 12, speed: 200, D: 8, waveShape: 'wave', waveAmp: 30, waveLength: 100 });
  const counts = [], outside = [];
  for (let s = 0; s < 4000 && m.busy; s++) {
    m.step();
    const t = m.tinePositions();
    if (!t.length) continue;
    counts.push(t.length);
    outside.push(t.filter(([x, y]) => Math.abs(x) > 500 + 1e-6 || Math.abs(y) > 350 + 1e-6).length);
  }
  return { m, counts, outside };
};

test('a slanted full rake on a repeating tank shows every lap in the tile, all the way', () => {
  for (const angle of [22, 45, 160]) for (const offset of [undefined, 'brick', 'halfDrop']) {
    const { m, counts, outside } = run({ tile: true, angle, offset });
    const laps = m.log.filter((e) => e.fn === 'rake').length;
    assert.ok(laps > 1, `${angle}° ${offset}: laps`);
    assert.ok(counts.length > 10);
    assert.ok(outside.every((n) => n === 0), `${angle}° ${offset}: a tine drawn outside the page`);
    assert.ok(counts.every((n) => n === laps), `${angle}° ${offset}: every lap's tine is drawn while it runs`);
  }
});

test('without repeating, tine positions are where the tines are, as before', () => {
  const { m } = run({ tile: false, angle: 22 });
  const again = new Marble({ width: 1000, height: 700, seed: 1 });
  again.fullRake({ angle: 22, teeth: 12, speed: 200, D: 8, waveShape: 'wave', waveAmp: 30, waveLength: 100 });
  for (let s = 0; s < 40; s++) again.step();
  const op = again.active.find((o) => o.kind === 'rake');
  assert.deepEqual(again.tinePositions(), op.offs.map((off) => again._rakePoint(op, op.dist, off)));
  assert.ok(m.log.filter((e) => e.fn === 'rake').length === 1);
});
