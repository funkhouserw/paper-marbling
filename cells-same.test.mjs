// #38 / #1 / #33 in Cells: a drop centred on a cell of its own colour joins it; one centred beside it
// that comes to press on it is a cell of its own, and the two show a dark hairline seam where they
// press, not a channel of bare bath. Cells of one throw keep their channels (photo 26).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cells } from './cells.js';

const one = (m, x, y, size, color = '#3b2b24') => {
  m.broom({ n: 1, x, y, w: 0.01, h: 0.01, size, spread: 0, spreading: 25, color });
  for (let t = 0; m.busy && t < 3000; t++) m.step();
};

function host() {
  const m = new Cells({ width: 300, height: 200, seed: 3 });
  m.separate({ on: true, at: 0 });
  one(m, 0, 0, 0.06);
  return m;
}

for (const [x, where] of [[0, 'in the middle of'], [25, 'near the edge of']]) test(`a same-colour drop centred ${where} a cell joins it`, () => {
  const m = host();
  const cell = m.polys.find((p) => p.cell);
  const before = cell.own;
  one(m, x, 0, 0.015);
  const cells = m.polys.filter((p) => p.cell);
  assert.equal(cells.length, 1);
  assert.ok(cell.own > before);
  assert.ok(!cell.contacts);
});

for (const [x, where] of [[60, 'beside it']]) {
  test(`a same-colour drop centred ${where} is its own cell, with a dark seam where they meet`, () => {
    const m = host();
    const cell = m.polys.find((p) => p.cell);
    const before = cell.own;
    one(m, x, 0, 0.015);
    const cells = m.polys.filter((p) => p.cell);
    assert.equal(cells.length, 2);
    assert.equal(cell.own, before);
    for (const c of cells) assert.ok(c.contacts, 'both sides of the seam are marked');
    // Drawn as a band: the points along the contact are marked as pressing on their own colour.
    m.toSVG();
    for (const c of cells) assert.ok(c.edgeFaces.some((f) => f === 1) && c.edgeFaces.length === c.n);
  });
}

test('cells of one throw keep their channels of bare bath, with no seams marked', () => {
  const m = new Cells({ width: 300, height: 200, seed: 3 });
  m.separate({ on: true, at: 0 });
  m.broom({ n: 25, x: 0, y: 0, w: 200, h: 160, size: 0.02, spread: 0.6, spreading: 25, color: '#3b2b24' });
  for (let t = 0; m.busy && t < 3000; t++) m.step();
  const cells = m.polys.filter((p) => p.cell);
  assert.ok(cells.length > 10);
  assert.ok(cells.every((c) => !c.contacts));
});

test("the Cells law's pressure: the film law under capacity, the collapse plateau over it, smooth between", async () => {
  const { cellPressure, filmPressure } = await import('./engine.js');
  const cap = 3.5, knee = 1 + (cap - 1) * 0.98;
  // Up to the knee, and at any fill with no weight, it is the film law.
  for (const t of [1, 2, knee]) assert.equal(cellPressure(t, cap, 1), filmPressure(t, cap));
  assert.equal(cellPressure(knee + 1, cap, 0), filmPressure(knee + 1, cap));
  // Full weight: past the knee only the rest slope.
  const rest = 1 / (1 - 1 / cap) ** 2;
  assert.ok(Math.abs(cellPressure(knee + 1, cap, 1) - cellPressure(knee, cap, 1) - rest) < 1e-9);
  // In between it moves continuously with the weight.
  const a = cellPressure(knee + 1, cap, 0.5), b = cellPressure(knee + 1, cap, 0.5001);
  assert.ok(Math.abs(a - b) < 1e-3 * Math.abs(filmPressure(knee + 1, cap)));
});
