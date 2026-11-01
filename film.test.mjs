import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Film } from './film.js';

const TANK = { width: 1000, height: 700 };
const PERCENT = 0.7; // mL for 1% of this tank at the default film
const areaOf = ({ xy, n }) => {
  let sum = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) sum += xy[j * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[j * 2 + 1];
  return Math.abs(sum) / 2;
};
const radiusOf = (poly) => Math.sqrt(areaOf(poly) / Math.PI);
const finish = (m, ticks = 4000) => {
  let n = 0;
  while (m.busy && n++ < ticks) m.step();
  assert.equal(m.busy, false, 'the tank should come to rest');
  return m;
};
const corners = [[-250, 175], [250, 175], [-250, -175], [250, -175]];

for (const walls of [false, true]) {
  const label = walls ? 'with walls' : 'without walls';

  test(`a film 100 mm away doesn't move, ${label}`, () => {
    const m = new Film(TANK);
    if (walls) m.walls();
    m.drop({ x: -250, y: 0, quantity: 2 * PERCENT, spreading: 1, color: '#112233' });
    finish(m);
    const before = Float64Array.from(m.polys[0].xy);
    const { n } = m.polys[0];
    const edge = Math.max(...Array.from({ length: n }, (_, i) => before[i * 2]));
    m.drop({ x: edge + 100 + Math.sqrt((2 * 7000) / Math.PI), y: 0, quantity: 2 * PERCENT, spreading: 1, color: '#aa0000' });
    finish(m);
    let moved = 0;
    for (let i = 0; i < n * 2; i++) moved = Math.max(moved, Math.abs(m.polys[0].xy[i] - before[i]));
    assert.ok(moved < 0.01, `moved ${moved} mm`);
  });

  test(`each stacked drop pushes the first ring out by the area it adds, ${label}`, () => {
    const m = new Film(TANK);
    if (walls) m.walls();
    let last = 0;
    for (let k = 1; k <= 8; k++) {
      m.drop({ x: 0, y: 0, quantity: 3 * PERCENT, spreading: 1, color: '#112233' });
      finish(m);
      const r = radiusOf(m.polys[0]);
      assert.ok(r > last + 10, `drop ${k}: ${last} to ${r}`);
      last = r;
    }
    assert.ok(Math.abs(last - radiusOf(m.polys[7]) * Math.sqrt(8)) < 8, `first ring ${last}`);
  });

  test(`four big drops stay mirror symmetric and stop, ${label}`, () => {
    const m = new Film(TANK);
    if (walls) m.walls();
    corners.forEach(([x, y]) => m.drop({ x, y, quantity: 8 * PERCENT, color: '#112233' }));
    finish(m);
    for (const op of m.sources) {
      assert.ok(Math.abs(Math.abs(op.x) - Math.abs(m.sources[0].x)) < 0.1);
      assert.ok(Math.abs(Math.abs(op.y) - Math.abs(m.sources[0].y)) < 0.1);
    }
    const total = m.polys.reduce((sum, p) => sum + areaOf(p), 0) / 7000;
    assert.ok(total > 96, `covers ${total}%`);
  });
}

test('motion stops exactly when feeding stops', () => {
  const m = new Film(TANK);
  m.drop({ x: 0, y: 0, quantity: 2 * PERCENT, color: '#112233' });
  finish(m);
  const before = Float64Array.from(m.polys[0].xy);
  for (let i = 0; i < 30; i++) m.step();
  assert.deepEqual(Float64Array.from(m.polys[0].xy), before);
});

test('saved states restore and carry on', () => {
  const m = new Film(TANK);
  m.drop({ x: 0, y: 0, quantity: 2 * PERCENT, color: '#112233' });
  for (let i = 0; i < 20; i++) m.step();
  const state = m.saveState();
  const again = new Film(TANK).loadState(state);
  finish(again);
  finish(m);
  const gap = Math.abs(radiusOf(again.polys[0]) - radiusOf(m.polys[0]));
  assert.ok(gap < 0.5, `restored tank differs by ${gap} mm`);
});

test('SVG stays vector and paints the gap closer under the ink', () => {
  const m = new Film(TANK);
  m.drop({ x: 0, y: 0, quantity: 2 * PERCENT, color: '#112233' });
  m.drop({ x: 0, y: 200, quantity: 2 * PERCENT, color: '#88000080' });
  finish(m);
  const svg = m.toSVG();
  assert.equal((svg.match(/fill="none"/g) ?? []).length, 1);
  assert.ok(svg.indexOf('fill="none"') < svg.indexOf('fill="#112233"'));
  assert.ok(!svg.includes('<image'));
});

test('rakes still work after spreading', () => {
  const m = new Film(TANK);
  m.drop({ x: 0, y: 0, quantity: 4 * PERCENT, color: '#112233' });
  finish(m);
  const n = m.vertexCount;
  m.fullRake({ angle: 0, teeth: 8 });
  finish(m);
  assert.ok(m.vertexCount > n);
});

test('a drop landing on ink gets its plain size, with or without water further off', () => {
  const m = new Film(TANK);
  m.drop({ x: 0, y: 0, quantity: 6 * PERCENT, color: '#112233' });
  finish(m);
  m.drop({ x: 0, y: 0, quantity: 1 * PERCENT, color: '#aa0000' });
  finish(m);
  const share = areaOf(m.polys[1]) / 7000;
  assert.ok(share < 1.2, `covers ${share}%`);
});
