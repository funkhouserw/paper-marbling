// Edge contacts for soap-bubble seams (#33): what each point of an outline faces, and its squeeze.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Film } from './film.js';

const settle = (m) => { for (let t = 0; t < 3000 && m.busy; t++) m.step(); m.step(); };

test('a lone drop faces bare bath all round', () => {
  const m = new Film({ width: 200, height: 140, seed: 1 });
  m.drop({ x: 0, y: 0, quantity: 0.3, color: '#224466', at: 0 });
  settle(m);
  const p = m.polys[0];
  assert.equal(p.edgeFaces.length, p.n);
  assert.ok(p.edgeFaces.every((f) => f === 0));
  assert.ok(p.edgeTau.every((t) => t === 1));
});

test('two drops of one colour pressed together: their contact faces the same colour, squeezed', () => {
  const m = new Film({ width: 200, height: 140, seed: 1 });
  m.drop({ x: -12, y: 0, quantity: 1, color: '#224466', at: 0 });
  m.drop({ x: 12, y: 0, quantity: 1, color: '#224466', at: 0 });
  settle(m);
  const [a] = m.polys;
  const contact = [...a.edgeFaces].filter((f) => f === 1).length;
  assert.ok(contact > 0, 'some of its edge presses on the other drop');
  assert.ok(contact < a.n, 'and some faces bare bath');
  for (let i = 0; i < a.n; i++) if (a.edgeFaces[i] === 1) assert.ok(a.edgeTau[i] >= 1.5);
});

test('a drop inside another colour faces that colour all round', () => {
  const m = new Film({ width: 200, height: 140, seed: 1 });
  m.drop({ x: 0, y: 0, quantity: 2, color: '#aa3322', at: 0 });
  settle(m);
  m.drop({ x: 0, y: 0, quantity: 0.2, color: '#2244aa' });
  settle(m);
  const inner = m.polys.find((p) => p.color === '#2244aa');
  assert.ok([...inner.edgeFaces].every((f) => f === 2));
});

test('a line of touching drops: most of each facing edge counts as contact, not just its middle', () => {
  const m = new Film({ width: 200, height: 140, seed: 1 });
  m.drop({ x: -12, y: 0, quantity: 1, color: '#224466', at: 0 });
  m.drop({ x: 12, y: 0, quantity: 1, color: '#224466', at: 0 });
  settle(m);
  const [a] = m.polys;
  // Points of a's outline on the side facing b (x > 0 half of its right side).
  let facing = 0, contact = 0;
  for (let i = 0; i < a.n; i++) if (a.xy[i * 2] > -2) { facing++; if (a.edgeFaces[i] === 1) contact++; }
  assert.ok(contact >= 0.7 * facing, `${contact} of ${facing} facing points marked as contact`);
});
