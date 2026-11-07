// Run with: node --test thinfilm.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ThinFilm } from './thinfilm.js';

const area = ({ xy, n }) => {
  let a = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += xy[i * 2] * xy[j * 2 + 1] - xy[j * 2] * xy[i * 2 + 1];
  }
  return Math.abs(a) / 2;
};
const finite = (m) => m.polys.every((p) => p.xy.subarray(0, p.n * 2).every(Number.isFinite));
const settle = (m, limit = 2000) => {
  for (let i = 0; m.busy && i < limit; i++) m.step();
  assert.equal(m.busy, false, 'still busy');
};

test('films far apart do not move each other', () => {
  const m = new ThinFilm();
  const a = m.drop({ x: -400, quantity: 0.3 });
  m.drop({ x: 350, quantity: 0.3 });
  settle(m);
  assert.ok(Math.abs(a.x + 400) < 1e-6, `moved to ${a.x}`);
});

test('a stack pushes the first ring out every time', () => {
  const m = new ThinFilm();
  const first = m.drop({ quantity: 0.3 });
  m.settle();
  settle(m);
  let last = area(first.poly);
  for (let i = 0; i < 4; i++) {
    m.drop({ quantity: 0.3 });
    m.settle();
    settle(m);
    assert.ok(area(first.poly) > last * 1.1, `drop ${i}: ${area(first.poly)} from ${last}`);
    last = area(first.poly);
  }
});

test('a stronger ink claims more of the surface', () => {
  const m = new ThinFilm();
  const a = m.drop({ x: -150, quantity: 1, spreading: 12 });
  const b = m.drop({ x: 150, quantity: 1, spreading: 4 });
  settle(m);
  assert.ok(area(a.poly) > area(b.poly) * 1.5);
});

test('extreme drops stay finite and bounded, with or without walls', () => {
  for (const walled of [true, false]) {
    const m = new ThinFilm();
    if (walled) m.walls();
    m.drop({ quantity: 0.05 });
    m.drop({ x: -300, y: -200, quantity: 30 });
    m.drop({ x: 300, y: 200, quantity: 0.2, spreading: 40 });
    m.drop({ x: 495, y: 345, quantity: 20 });
    settle(m);
    assert.ok(finite(m), 'an outline went to NaN');
    assert.ok(m.vertexCount < 30000, `${m.vertexCount} points`);
  }
});

test('a saved state comes back', () => {
  const m = new ThinFilm();
  m.drop({ quantity: 2 });
  for (let i = 0; i < 20; i++) m.step();
  const state = m.saveState();
  settle(m);
  const finished = area(m.polys[0]);
  const back = new ThinFilm().loadState(state);
  settle(back);
  assert.ok(Math.abs(area(back.polys[0]) - finished) < 1e-6);
});

test('a small drop lands about as large as in Classic, not as a tiny dot (#11)', async () => {
  const { Marble } = await import('./engine.js');
  const { ThinFilm } = await import('./thinfilm.js');
  const radius = (E) => {
    const m = new E({ width: 200, height: 140, seed: 1 });
    m.drop({ x: 0, y: 0, quantity: 0.002, color: '#123456', at: 0 });
    for (let t = 0; t < 2000 && m.busy; t++) m.step();
    const p = m.polys[0];
    let a = 0; for (let i = 0, k = p.n - 1; i < p.n; k = i++) a += p.xy[k * 2] * p.xy[i * 2 + 1] - p.xy[i * 2] * p.xy[k * 2 + 1];
    return Math.sqrt(Math.abs(a / 2) / Math.PI);
  };
  const classic = radius(Marble), thin = radius(ThinFilm);
  assert.ok(thin > 0.8 * classic, `Thin film ${thin.toFixed(2)} mm vs Classic ${classic.toFixed(2)} mm`);
  // And round, not pushed on into a square by the coarse grid.
  const m = new ThinFilm({ width: 200, height: 140, seed: 1 });
  m.drop({ x: 3.3, y: -1.7, quantity: 0.002, color: '#123456', at: 0 });
  for (let t = 0; t < 2000 && m.busy; t++) m.step();
  const p = m.polys[0];
  let cx = 0, cy = 0; for (let i = 0; i < p.n; i++) { cx += p.xy[i * 2]; cy += p.xy[i * 2 + 1]; }
  cx /= p.n; cy /= p.n;
  const r = Array.from({ length: p.n }, (_, i) => Math.hypot(p.xy[i * 2] - cx, p.xy[i * 2 + 1] - cy));
  assert.ok(Math.max(...r) < 1.1 * Math.min(...r), `round: radius ${Math.min(...r).toFixed(2)} to ${Math.max(...r).toFixed(2)} mm`);
});
