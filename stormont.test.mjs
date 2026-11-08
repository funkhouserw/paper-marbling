// Clear (gall-water) drops cut real holes; Stormont's turpentine breaks a colour into a lace of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble } from './engine.js';

const area = ({ xy, n }) => {
  let s = 0;
  for (let i = 0, k = n - 1; i < n; k = i++) s += xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
  return Math.abs(s) / 2;
};
const tank = () => new Marble({ width: 1000, height: 700, seed: 1 });

test('a clear drop inside ink cuts a real hole: it joins the colour\'s even-odd group', () => {
  const m = tank();
  m.drop({ quantity: 1, color: '#2c4f86' });
  m.settle();
  m.drop({ quantity: 0.1, spreading: 1, color: 'clear' });
  m.runUntilIdle();
  assert.equal(m.polys.length, 2);
  const [ink, hole] = m.polys;
  assert.ok(ink.group && hole.group === ink.group, 'one even-odd shape');
  assert.equal(hole.color, ink.color);
  assert.equal(m.shapeAt(0, 0), null, 'nothing at the hole');
});

test('a clear drop on open water only pushes, and one too weak for the ink under it sinks', () => {
  const m = tank();
  m.drop({ x: 200, quantity: 0.3, color: 'clear' });
  m.runUntilIdle();
  assert.ok(m.polys.every((p) => p.color === 'rgba(0,0,0,0)'), 'invisible on open water');
  const s = tank();
  s.drop({ quantity: 1, gall: 3, color: '#2c4f86' });
  s.settle();
  s.drop({ quantity: 0.1, gall: 1, color: 'clear' });
  s.runUntilIdle();
  assert.equal(s.polys.length, 1, 'the weak gall water sank');
});

test('turpentine breaks only its own colour into many holes, more with more, and replays exactly', () => {
  const run = (turpentine) => {
    const m = tank();
    m.drop({ x: -250, quantity: 0.8, color: '#a8322d' });
    m.drop({ x: 250, quantity: 0.8, turpentine, color: '#e2b23a' });
    m.runUntilIdle();
    return m;
  };
  const few = run(0.3);
  const many = run(0.9);
  const holes = (m, c) => m.polys.filter((p) => p.color === c).length - 1;
  assert.equal(holes(few, '#a8322d'), 0, 'the other colour stays solid');
  assert.ok(holes(few, '#e2b23a') > 30, `holes: ${holes(few, '#e2b23a')}`);
  assert.ok(holes(many, '#e2b23a') > holes(few, '#e2b23a'));
  assert.equal(few.log.length, 2, 'only the two drops are logged');
  const again = tank().replay(few.log);
  again.runUntilIdle();
  assert.equal(again.polys.length, few.polys.length);
});

test('evaporation closes the holes partway', () => {
  const holeArea = (evaporation) => {
    const m = tank();
    m.drop({ quantity: 0.8, turpentine: 0.5, evaporation, color: '#e2b23a' });
    m.runUntilIdle();
    return m.polys.slice(1).reduce((s, p) => s + area(p), 0);
  };
  const open = holeArea(0);
  const closed = holeArea(2);
  assert.ok(closed < open * 0.8, `${closed} vs ${open}`);
});

test('clear cuts through every layer of ink at its point, down to the bath', () => {
  for (const Engine of [Marble]) {
    const m = new Engine({ width: 600, height: 420, seed: 1 });
    m.drop({ quantity: 3, color: '#1a2a66' });
    m.drop({ quantity: 1, color: '#d8b84a', at: 0 });
    m.runUntilIdle();
    assert.equal(m.shapesAt(0, 0).length, 2, 'two layers over the middle');
    m.drop({ quantity: 0.3, spreading: 1, color: 'clear' });
    m.runUntilIdle();
    assert.equal(m.shapesAt(0, 0).length, 0, 'bare bath');
  }
});

// #44: in Film and Wake a Stormont's few hundred holes open together. Each source pinned away all the
// drift it read, its neighbours' push included, so the ring was pulled in on itself and its middle
// crushed into hairline scribbles; and the ring's rest area was fed what the holes asked for, not
// what they took, so it read as squeezed past its cap.
test('a Stormont in Film and Wake opens outward into a lace: the ring keeps its ink and is not squeezed', async () => {
  const { Film } = await import('./film.js');
  const { Wake } = await import('./wake.js');
  for (const [Engine, extra] of [[Film, {}], [Wake, { viscosity: 227 }]]) {
    const m = new Engine({ width: 400, height: 300, seed: 3, ...extra });
    m.drop({ quantity: 1, dispersion: 0.6, turpentine: 0.65, color: '#8a6a30' });
    let rest = 0;
    while (!m.polys[0]?.a0 && m.time < 20) { m.step(); rest = m.polys[0] ? area(m.polys[0]) : 0; }
    m.runUntilIdle();
    const ring = m.polys[0];
    const holes = m.polys.filter((p) => p !== ring && p.group === ring.group);
    assert.ok(holes.length > 100, `${Engine.name}: ${holes.length} holes`);
    const ink = area(ring) - holes.reduce((s, h) => s + area(h), 0);
    assert.ok(area(ring) > 1.3 * rest, `${Engine.name}: the ring opened outward (${area(ring).toFixed(0)} vs ${rest.toFixed(0)} at rest)`);
    assert.ok(ink > 0.85 * rest, `${Engine.name}: its ink kept (${ink.toFixed(0)} of ${rest.toFixed(0)})`);
    assert.ok(ring.a0 / area(ring) < 1.1, `${Engine.name}: not read as squeezed (τ ${(ring.a0 / area(ring)).toFixed(2)})`);
    const points = m.polys.reduce((s, p) => s + p.n, 0);
    assert.ok(points < 30000, `${Engine.name}: no hairline scribble (${points} points)`);
  }
});
