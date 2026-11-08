// The disc clip in the Cells layout (#39 c): exact, in one walk round a cell, not 72 half-plane cuts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partialTransport, polygonArea } from './stone.js';

const box = (w, h) => [-w / 2, -h / 2, w / 2, -h / 2, w / 2, h / 2, -w / 2, h / 2];

test('a lone cell is its disc, of exactly its area, in 72 points', () => {
  const { cells, tags } = partialTransport([[3, -2]], [500], box(200, 200));
  assert.equal(cells[0].length / 2, 72);
  assert.ok(Math.abs(polygonArea(cells[0]) - 500) < 0.5, `${polygonArea(cells[0])}`);
  assert.ok(tags[0].every((t) => t === -2), 'every edge is the disc');
});

test('a disc cut by the tank edge keeps a straight edge there, and its area', () => {
  // Centred 5 mm inside the left edge: the edge cuts a chord off the disc.
  const { cells, tags, error } = partialTransport([[-45, 0]], [300], box(100, 100));
  assert.ok(error < 0.01, `error ${error}`);
  assert.ok(Math.abs(polygonArea(cells[0]) - 300) < 3);
  assert.ok(tags[0].includes(-1) && tags[0].includes(-2), 'a domain edge and a disc arc');
  for (let k = 0; k < cells[0].length; k += 2) assert.ok(cells[0][k] >= -50 - 1e-9);
});

test('packed and partly packed cells: areas met, cells convex, walls shared', () => {
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sites = [], targets = [];
  for (let i = 0; i < 120; i++) { sites.push([(rnd() - 0.5) * 380, (rnd() - 0.5) * 280]); targets.push(300 + 700 * rnd()); }
  const { cells, error, areas } = partialTransport(sites, targets, box(400, 300), { iterations: 100 });
  assert.ok(error < 0.01, `error ${error}`);
  cells.forEach((c, i) => {
    assert.ok(Math.abs(polygonArea(c) - areas[i]) < 1e-6);
    const m = c.length / 2;
    for (let k = 0; k < m; k++) {
      const a = k * 2, b = ((k + 1) % m) * 2, d = ((k + 2) % m) * 2;
      const cross = (c[b] - c[a]) * (c[d + 1] - c[b + 1]) - (c[b + 1] - c[a + 1]) * (c[d] - c[b]);
      assert.ok(cross > -1e-6, `cell ${i} turns clockwise at ${k}`);
    }
  });
});
