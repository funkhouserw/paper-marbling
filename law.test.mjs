// Regression test for the pressure law (2026-11-08): what it guarantees, pinned to today's numbers with
// a margin. Film and Wake: a colour that later drops land in is squeezed but never wiped out, and the
// drops don't stop early. Cells: a dense spray gives every drop a real cell. Seams: drops of different
// colours that touch get a hairline, not a bare channel (Gilded stone).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble } from './engine.js';
import { Film } from './film.js';
import { Wake } from './wake.js';
import { Cells } from './cells.js';

for (const Engine of [Film, Wake]) {
  test(`${Engine.name}: light drops in a dark walled tank squeeze it but don't wipe it out, and don't stop early`, () => {
    const m = new Engine({ width: 100, height: 70, seed: 3 });
    m.walls({ on: true, at: 0 });
    for (let k = 0; k < 2; k++) m.drop({ x: (k - 0.5) * 45, y: 0, quantity: 0.35, dispersion: 4, color: '#3b2b24', at: 0 });
    for (let t = 0; t < 3000 && m.busy; t++) m.step();
    const dark = m.polys.slice();
    const before = dark.reduce((a, p) => a + m._inkArea(p), 0);
    const ops = [];
    for (let k = 0; k < 4; k++) ops.push(m.drop({ x: (m.random() - 0.5) * 80, y: (m.random() - 0.5) * 50, quantity: 0.1, dispersion: 4, color: '#3fa7d6' }));
    for (let t = 0; t < 3000 && m.busy; t++) m.step();
    const kept = dark.filter((p) => m.polys.includes(p)).reduce((a, p) => a + m._inkArea(p), 0) / before;
    // Measured 0.45: squeezed, never wiped out.
    assert.ok(kept > 0.3 && kept < 0.95, `dark keeps ${kept.toFixed(2)} of its area`);
    // Measured: median 0.87 of plain size, smallest 0.20.
    const light = ops.map((o) => (o.poly ? m._inkArea(o.poly) / o.plain : 0)).sort((a, b) => a - b);
    assert.ok(light[2] > 0.6 && light[0] > 0.1, `light drops reach ${light.map((v) => v.toFixed(2))} of plain`);
  });
}

test('Cells: a dense spray on an empty tank gives every drop a real cell, within its cap', () => {
  const m = new Cells({ width: 600, height: 420, seed: 7 });
  m.spray({ x: 0, y: 0, n: 12, max: 24, min: 17, radius: 70, skew: 0.6, colors: ['#4b231a', '#7a3e2c', '#b38a6a'] });
  for (let t = 0; t < 2000 && m.busy; t++) m.step();
  const area = (p) => { let a = 0; for (let i = 0, j = p.n - 1; i < p.n; j = i++) a += p.xy[j * 2] * p.xy[i * 2 + 1] - p.xy[i * 2] * p.xy[j * 2 + 1]; return Math.abs(a / 2); };
  const areas = m.polys.map(area).sort((a, b) => a - b);
  assert.ok(m.polys.length >= 10, `${m.polys.length} cells`);
  assert.ok(areas[0] > 0.25 * areas[areas.length >> 1], `smallest ${Math.round(areas[0])} against median ${Math.round(areas[areas.length >> 1])}`);
  // Squeezed no further than the cap (which the law makes unreachable).
  for (const c of m.polys) assert.ok(c.share > 0 && c.own / c.share <= c.tauMax + 1e-6, `tau ${(c.own / c.share).toFixed(2)}`);
});

test('drops of different colours that touch get a hairline, not a bare channel (Gilded stone)', () => {
  // Two cells pressed edge to edge, each big enough that a bare-bath channel would be ~1.5 mm wide.
  const square = (x0, x1, color) => {
    const pts = [];
    for (let i = 0; i < 20; i++) pts.push(x0 + ((x1 - x0) * i) / 20, -30);
    for (let i = 0; i < 20; i++) pts.push(x1, -30 + 3 * i);
    for (let i = 0; i < 20; i++) pts.push(x1 - ((x1 - x0) * i) / 20, 30);
    for (let i = 0; i < 20; i++) pts.push(x0, 30 - 3 * i);
    return { xy: Float64Array.from(pts), n: 80, color };
  };
  const m = new Marble({ width: 300, height: 200, seed: 1 });
  m.polys.push(square(-50, -0.25, '#3b2b24'), square(0.25, 50, '#b38a6a')); // 0.5 mm apart: touching
  const svg = m.toSVG();
  // Where it meets the other it's pulled in by half a seam (to -0.55), not by half a bare channel
  // (to about -1.07).
  const xs = [...svg.matchAll(/<path fill="#3b2b24"[^>]* d="([^"]+)"/g)][0][1].split(/[MLZ]/).filter(Boolean).map((p) => Number(p.split(' ')[0]));
  const right = Math.max(...xs);
  assert.ok(right > -0.7, `the dark square's touching edge is at ${right.toFixed(2)} mm (a hairline puts it at -0.55)`);
});

test('Cells in a walled tank: a broom throw fills the tray instead of leaving small drops stranded', () => {
  const m = new Cells({ width: 300, height: 200, seed: 11 });
  m.walls({ on: true, at: 0 });
  m.broom({ n: 30, x: 0, y: 0, w: 260, h: 170, size: 0.02, spread: 0.9, spreading: 25, color: '#3b2b24' });
  for (let t = 0; t < 2000 && m.busy; t++) m.step();
  let cover = 0, tot = 0;
  for (let x = -147; x < 150; x += 4) for (let y = -97; y < 100; y += 4) { tot++; if (m.shapesAt(x, y).length) cover++; }
  // Measured 0.91 (0.67 with the open-water spread cap still applied).
  assert.ok(cover / tot > 0.8, `the first colour covers ${(cover / tot).toFixed(2)} of the tray`);
});
