// Broom straw: many drops of one colour at once, sizes heavy-tailed, each keeping its own cell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble } from './engine.js';

test('a broom throw is one logged command of many separate cells with bare seams between them', () => {
  const m = new Marble({ width: 600, height: 420, seed: 2 });
  m.broom({ n: 40, size: 0.05, color: '#b5793f' });
  m.runUntilIdle();
  assert.equal(m.log.length, 1);
  assert.equal(m.log[0].fn, 'broom');
  const cells = m.polys.filter((p) => p.cell);
  assert.ok(cells.length > 20, `${cells.length} cells`);
  // Walking straight across the tank, one cell never runs straight into another: bath lies between.
  let meetings = 0, straight = 0;
  for (let y = -180; y <= 180; y += 30) {
    let last = null;
    for (let x = -290; x <= 290; x += 0.1) {
      const hit = m.shapeAt(x, y)?.[0] ?? null;
      if (hit !== last) {
        if (last && hit) straight++;
        else if (!last && hit) meetings++;
        last = hit;
      }
    }
  }
  assert.ok(meetings > 30, `${meetings} cells crossed`);
  // A drop landing inside an earlier cell of the same throw nests in it with no seam, as same-colour
  // ink landing on itself merges; the rest keep a seam.
  assert.ok(straight <= meetings * 0.3, `${straight} of ${meetings} cell edges with no seam`);
  const again = new Marble({ width: 600, height: 420, seed: 2 }).replay(m.log);
  again.runUntilIdle();
  assert.equal(again.polys.length, m.polys.length);
});

test('broom sizes vary widely: the biggest cell is many times the smallest', () => {
  const m = new Marble({ width: 1000, height: 700, seed: 4 });
  const ops = m.broom({ n: 80, size: 0.05, spread: 1 });
  const q = ops.map((o) => o.quantity).sort((a, b) => a - b);
  assert.ok(q.at(-1) / q[0] > 20, `${q[0]} to ${q.at(-1)}`);
});
