// Cells: every drop keeps its own cell, whichever tool put it down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cells } from './cells.js';
import { MODELS } from './models.js';

const settle = (m) => { for (let t = 0; t < 2000 && m.busy; t++) m.step(); };

test('Cells is a simulator to choose', () => {
  assert.equal(MODELS.find((x) => x.id === 'cells')?.engine, Cells);
});

test('plain drops landing together become packed cells, logged as drops', () => {
  const m = new Cells({ width: 300, height: 200, seed: 3 });
  m.drops({ n: 12, quantity: 0.3, colors: ['#335577', '#aa6633'] });
  settle(m);
  assert.equal(m.log.length, 12);
  assert.ok(m.log.every((e) => e.fn === 'drop'));
  const cells = m.polys.filter((p) => p.cell);
  assert.ok(cells.length >= 10, `most drops are cells (${cells.length})`);
  // Each keeps its own colour.
  assert.deepEqual(new Set(cells.map((c) => c.color)), new Set(['#335577', '#aa6633']));
});

test('a drop landing in a cell of another colour nests in it; one of its own colour merges', () => {
  const m = new Cells({ width: 300, height: 200, seed: 3 });
  m.drop({ x: 0, y: 0, quantity: 2, color: '#335577' });
  settle(m);
  const big = m.polys.find((p) => p.cell);
  m.drop({ x: 0, y: 0, quantity: 0.2, color: '#aa6633' });
  settle(m);
  assert.equal(big.kids.length, 1, 'nested');
  const before = m.polys.length;
  // Somewhere in the blue cell, clear of the orange one inside it.
  let spot = null;
  for (let r = 2; r < 60 && !spot; r += 2) if (m.shapesAt(r, 0)[0]?.[0] === big) spot = [r, 0];
  assert.ok(spot);
  m.drop({ x: spot[0], y: spot[1], quantity: 0.2, color: '#335577' });
  settle(m);
  assert.ok(m.polys.length <= before, 'merged, no new cell');
});

test('with Keep cells separate off, cells share walls with no seam', () => {
  const gaps = (on) => {
    const m = new Cells({ width: 300, height: 200, seed: 3 });
    if (!on) m.separate({ on: false, at: 0 });
    m.drops({ n: 20, quantity: 0.3, colors: ['#335577'] });
    settle(m);
    return m.polys.reduce((a, p) => a + (p.n ? Math.abs(p.xy.subarray(0, p.n * 2).reduce((s, v, i, xy) => (i % 2 ? s : s + xy[i] * xy[(i + 3) % (p.n * 2)] - xy[(i + 2) % (p.n * 2)] * xy[i + 1]), 0)) / 2 : 0), 0);
  };
  assert.ok(gaps(false) > gaps(true), 'more ink area drawn when cells join');
});
