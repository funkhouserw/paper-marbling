// Paint thick ↔ thin (row 62, items 5–7): water in the colour thins its gall, so a thinner drop opens
// a little less and prints lighter; ordinary paint (0.5, or left out) is exactly what it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Marble, runScript, paintThinness } from './engine.js';

const area = (p) => { let a = 0; for (let i = 0, k = p.n - 1; i < p.n; k = i++) a += p.xy[k * 2] * p.xy[i * 2 + 1] - p.xy[i * 2] * p.xy[k * 2 + 1]; return Math.abs(a) / 2; };
const lone = (thin) => {
  const m = new Marble();
  runScript(m, `drop({ x: 50, y: 50, quantity: 1${thin === undefined ? '' : `, thin: ${thin}`} }); settle();`);
  while (m.busy) m.step();
  return m;
};
const lightness = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255); };

test('ordinary paint is unchanged, and leaves no trace in the log', () => {
  assert.equal(paintThinness(0.5, 1), null);
  assert.equal(paintThinness(undefined, 2), null);
  const a = lone(), b = lone(0.5);
  assert.deepEqual(a.log, b.log);
  assert.equal(area(a.polys[0]), area(b.polys[0]));
});

test('thinner paint opens less and prints lighter; thicker the reverse; monotone', () => {
  const sizes = [0, 0.25, 0.5, 0.75, 1].map((t) => { const m = lone(t); return { a: area(m.polys[0]), l: lightness(m.polys[0].color) }; });
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(sizes[i].a < sizes[i - 1].a, `area falls with water: ${sizes.map((s) => s.a.toFixed(0))}`);
    assert.ok(sizes[i].l > sizes[i - 1].l, `colour lightens with water, strictly: ${sizes.map((s) => s.l)}`);
  }
  assert.equal(lone(1).log[0].args.thin, 1, 'logged when not ordinary');
});

test('the bath\'s rising gall still counts colours by the colour thrown, not the thinned shade', () => {
  const m = new Marble();
  runScript(m, `gall({ on: true, start: 1, step: 0.5 });
broom({ n: 5, color: '#336699', thin: 0.9 });
drop({ x: 20, y: 20, color: '#336699' });
drop({ x: 80, y: 80, color: '#993333' });`);
  assert.deepEqual(m.gallColours, ['#336699', '#993333']);
});

test('thin paint prints lighter and thick darker than ordinary paint, by pigment per area', () => {
  const [thick, plain, thin] = [0, 0.5, 1].map((t) => lightness(lone(t).polys[0].color));
  assert.ok(thin > plain && plain > thick, `lightness thick ${thick}, ordinary ${plain}, thin ${thin}`);
});
