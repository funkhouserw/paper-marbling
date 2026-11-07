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
  const throwOp = m.broom({ n: 80, size: 0.05, spread: 1 });
  const q = throwOp.drops.map((d) => d.quantity).sort((a, b) => a - b);
  assert.ok(q.at(-1) / q[0] > 20, `${q[0]} to ${q.at(-1)}`);
});

test('cells laid out by transport keep their areas, nest, and squeeze the colour they land in', async () => {
  const { thickness } = await import('./engine.js');
  const m = new Marble({ width: 1000, height: 700, seed: 3 });
  // The first colour covers most of the bath, so the second can only make room by squeezing it.
  m.broom({ n: 260, size: 0.05, spread: 0.8, spreading: 6, color: '#b5793f' });
  m.settle();
  m.broom({ n: 90, size: 0.05, spread: 0.6, spreading: 6, color: '#1f2f5c' });
  m.runUntilIdle();
  const brown = m.polys.filter((p) => p.color === '#b5793f');
  const blue = m.polys.filter((p) => p.color === '#1f2f5c');
  assert.ok(brown.length > 50 && blue.length > 30);
  assert.ok(blue.some((p) => p.parentCell && brown.includes(p.parentCell)), 'some blue cells sit inside brown ones');
  assert.ok(Math.max(...brown.map(thickness)) > 1.5, 'brown squeezed by the blue');
  // No two cells overlap: sample the tank and count points covered by more than one cell of a level.
  let doubled = 0;
  for (let x = -490; x < 490; x += 7) for (let y = -340; y < 340; y += 7) {
    const top = m.shapesAt(x, y).filter((loops) => !loops[0].parentCell);
    if (top.length > 1) doubled++;
  }
  assert.ok(doubled < 30, `${doubled} points under two top-level cells`);
});

test('a combed cell is never laid out again: a later throw leaves the combing alone', () => {
  const m = new Marble({ width: 1000, height: 700, seed: 3 });
  m.broom({ n: 40, size: 0.05, spreading: 6, color: '#b5793f' });
  m.runUntilIdle();
  m.rake({ from: [-480, 0], to: [480, 0], teeth: 6, spacing: 60, speed: 150, D: 10 });
  m.runUntilIdle();
  const perimeter = ({ xy, n }) => { let L = 0; for (let i = 0, k = n - 1; i < n; k = i++) L += Math.hypot(xy[i * 2] - xy[k * 2], xy[i * 2 + 1] - xy[k * 2 + 1]); return L; };
  const total = () => m.polys.filter((p) => p.color === '#b5793f').reduce((sum, p) => sum + perimeter(p), 0);
  const combed = total();
  m.broom({ n: 20, size: 0.02, spreading: 6, color: '#1f2f5c' });
  m.runUntilIdle();
  // Laying the combed cells out again would snap them back to compact, convex shapes.
  assert.ok(Math.abs(total() - combed) < 0.05 * combed, `${total()} vs ${combed}`);
});
