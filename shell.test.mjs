// Shell drops: equal-area rings, darker in the middle (Jaffer's profile), one logged drop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble, shellTints } from './engine.js';
import { Film } from './film.js';

const area = ({ xy, n }) => {
  let s = 0;
  for (let i = 0, k = n - 1; i < n; k = i++) s += xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
  return Math.abs(s) / 2;
};
const luma = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };

test('the tints run from dark in the middle to pale at the edge, and the other way for negative oil', () => {
  const dark = shellTints('#7a4a2a', 2.25, 5).map(luma);
  for (let j = 1; j < 5; j++) assert.ok(dark[j] > dark[j - 1]);
  const pale = shellTints('#7a4a2a', -2.25, 5).map(luma);
  for (let j = 1; j < 5; j++) assert.ok(pale[j] < pale[j - 1]);
  assert.deepEqual(shellTints('#7a4a2a', 0, 3), ['#7a4a2a', '#7a4a2a', '#7a4a2a']);
});

for (const [name, Engine] of [['Classic', Marble], ['Film', Film]]) {
  test(`${name}: a shell lands as nested rings of about equal area, as big as a plain drop`, () => {
    const plain = new Engine({ width: 1000, height: 700, seed: 1 });
    plain.drop({ quantity: 1 });
    plain.runUntilIdle();
    const m = new Engine({ width: 1000, height: 700, seed: 1 });
    m.drop({ quantity: 1, oil: 0.75, bands: 4, color: '#7a4a2a' });
    m.runUntilIdle();
    assert.equal(m.log.length, 1, 'only the drop is logged');
    assert.equal(m.polys.length, 4);
    const outlines = m.polys.map(area).sort((a, b) => b - a);
    const whole = area(plain.polys[0]);
    assert.ok(Math.abs(outlines[0] - whole) < 0.03 * whole, `${outlines[0]} vs ${whole}`);
    const rings = outlines.map((a, i) => a - (outlines[i + 1] ?? 0));
    // Classic keeps every band's area exactly. In Film, touching inks share pressure, so the halo,
    // the only band facing water, takes some area from those inside it.
    const tolerance = Engine === Film ? 0.35 : 0.15;
    for (const r of rings) assert.ok(Math.abs(r - whole / 4) < tolerance * whole / 4, `ring ${r} of ${whole / 4}`);
    // The darkest is drawn last, in the middle.
    assert.ok(luma(m.polys.at(-1).color) < luma(m.polys[0].color));
  });
}

test('a shell replays exactly', () => {
  const m = new Marble({ width: 600, height: 420, seed: 1 });
  m.drop({ x: -50, quantity: 0.4, oil: 0.5, color: '#2a4a7a' });
  m.drop({ x: 120, quantity: 0.3, oil: -0.5, bands: 3, color: '#7a2a2a' });
  m.runUntilIdle();
  const again = new Marble({ width: 600, height: 420, seed: 1 }).replay(m.log);
  again.runUntilIdle();
  assert.deepEqual(again.polys.map((p) => [p.color, Math.round(area(p))]), m.polys.map((p) => [p.color, Math.round(area(p))]));
});

// #45: drop() scheduled a Shell and returned before the Stormont setup, so turpentine did nothing with oil.
test('an oiled drop with turpentine breaks into lace through every band, and replays the same', async () => {
  const { Film } = await import('./film.js');
  for (const Engine of [Marble, Film]) {
    const run = () => {
      const m = new Engine({ width: 400, height: 300, seed: 2 });
      m.drop({ quantity: 1, oil: 0.15, bands: 3, turpentine: 0.2, color: '#2c4f86' });
      m.runUntilIdle();
      return m;
    };
    const m = run();
    const cut = new Set(m.polys.filter((p, k) => k && p.group && m.polys[k - 1].group === p.group).map((p) => p.group));
    const holes = m.polys.filter((p, k) => k && p.group && m.polys[k - 1].group === p.group).length;
    assert.ok(holes > 20, `${Engine.name}: ${holes} holes`);
    const colours = new Set(m.polys.filter((p) => cut.has(p.group)).map((p) => p.color));
    assert.ok(colours.size >= 2, `${Engine.name}: holes cut ${colours.size} bands`);
    const again = run();
    assert.deepEqual(again.polys.map((p) => p.n), m.polys.map((p) => p.n), `${Engine.name}: replays`);
    // Without turpentine the shell has no holes.
    const plain = new Engine({ width: 400, height: 300, seed: 2 });
    plain.drop({ quantity: 1, oil: 0.15, bands: 3, color: '#2c4f86' });
    plain.runUntilIdle();
    assert.ok(!plain.polys.some((p) => p.group), `${Engine.name}: plain shell uncut`);
  }
});
