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

// The pressure law and coalescence in Cells are off by default for now (cellsPressure); these tests
// switch them on.
class LawCells extends Cells { get cellsPressure() { return true; } get cellDrift() { return true; } }

test('Cells: two cells of one colour pressed together coalesce; of two colours, they stay apart', () => {
  const run = (second) => {
    const m = new LawCells({ width: 120, height: 80, seed: 2 });
    m.walls({ on: true, at: 0 });
    m.coalesce({ on: true, at: 0 });
    m.drop({ x: -15, y: 0, quantity: 0.6, color: '#3b2b24', at: 0 });
    m.drop({ x: 15, y: 0, quantity: 0.6, color: second, at: 0 });
    for (let t = 0; t < 2000 && m.busy; t++) m.step();
    return m.polys.length;
  };
  assert.equal(run('#3b2b24'), 1, 'one colour: the film between them broke');
  assert.equal(run('#b38a6a'), 2, 'two colours: still two');
});

for (const Engine of [Marble, Film]) {
  test(`${Engine.name}: a drop landing in a settled film doesn't count as squeezing it; pressing it does`, async () => {
    const { thickness } = await import('./engine.js');
    const m = new Engine({ width: 200, height: 140, seed: 2 });
    m.drop({ x: 0, y: 0, quantity: 0.4, dispersion: 4, color: '#3b2b24', at: 0 });
    for (let t = 0; t < 3000 && m.busy; t++) m.step();
    const host = m.polys[0];
    m.drop({ x: 0, y: 0, quantity: 0.1, dispersion: 4, color: '#3fa7d6' });
    for (let t = 0; t < 3000 && m.busy; t++) m.step();
    assert.ok(thickness(host) < 1.05, `host tau ${thickness(host).toFixed(2)} after a drop landed in it on open water`);
  });
}

test('Film, walled: a host pressed by drops landing in it does read as squeezed', async () => {
  const { thickness } = await import('./engine.js');
  const m = new Film({ width: 100, height: 70, seed: 3 });
  m.walls({ on: true, at: 0 });
  m.drop({ x: 0, y: 0, quantity: 0.6, dispersion: 4, color: '#3b2b24', at: 0 });
  for (let t = 0; t < 3000 && m.busy; t++) m.step();
  const host = m.polys[0];
  for (let k = 0; k < 4; k++) m.drop({ x: (k - 1.5) * 18, y: 0, quantity: 0.12, dispersion: 4, color: '#3fa7d6' });
  for (let t = 0; t < 3000 && m.busy; t++) m.step();
  assert.ok(thickness(host) > 1.1, `host tau ${thickness(host).toFixed(2)} in a full walled tank`);
});

test('Classic, walled: a host with drops nested in it reads as squeezed when the tank is full', async () => {
  const { thickness } = await import('./engine.js');
  const m = new Marble({ width: 100, height: 70, seed: 3 });
  m.walls({ on: true, at: 0 });
  m.drop({ x: 0, y: 0, quantity: 0.6, color: '#3b2b24', at: 0 });
  m.runUntilIdle();
  const host = m.polys[0];
  for (let k = 0; k < 4; k++) m.drop({ x: (k - 1.5) * 18, y: 0, quantity: 0.12, color: '#3fa7d6' });
  m.runUntilIdle();
  assert.ok(thickness(host) > 1.05, `host tau ${thickness(host).toFixed(2)} in a full walled tank`);
});

test('Cells, walled: a second colour landing keeps every first-colour cell whole', () => {
  const m = new Cells({ width: 300, height: 200, seed: 11 });
  m.walls({ on: true, at: 0 });
  m.broom({ n: 25, x: 0, y: 0, w: 260, h: 170, size: 0.02, spread: 0.9, spreading: 12, color: '#3b2b24' });
  for (let t = 0; t < 2000 && m.busy; t++) m.step();
  const brown = m.polys.filter((p) => p.cell);
  const area = (p) => { let a = 0; for (let i = 0, k = p.n - 1; i < p.n; k = i++) a += p.xy[k * 2] * p.xy[i * 2 + 1] - p.xy[i * 2] * p.xy[k * 2 + 1]; return Math.abs(a / 2); };
  let last = new Map(brown.map((p) => [p, area(p)]));
  m.broom({ n: 25, x: 0, y: 0, w: 260, h: 170, size: 0.012, spread: 0.9, spreading: 12, color: '#3fa7d6' });
  let worst = 0;
  for (let t = 0; t < 2000 && m.busy; t++) {
    m.step();
    for (const p of brown) {
      if (!m.polys.includes(p)) { worst = 1; continue; }
      const a = area(p), was = last.get(p);
      worst = Math.max(worst, 1 - a / was);
      last.set(p, a);
    }
  }
  assert.ok(worst < 0.3, `a first-colour cell lost ${(worst * 100).toFixed(0)}% of its area in one tick (or vanished)`);
});

// The same scene with the pressure law and site drift on, over several seeds below capacity
// (research/2026-11-08-cells-shatter-analysis.md: seeds 2 and 3 of this recipe need ≥ 95 % of the
// tank at the cap, which no layout under the law allows). Re-laid cells used to restart cold at
// their centroid, and on the second throw's first tick small cells were crushed to τ 6–7.5: 54–89 %
// lost in one tick at most seeds, 62 % at seed 11.
test('Cells, walled, law and drift on: a second colour keeps every first-colour cell whole, over seeds', () => {
  class LawCells extends Cells { get cellsPressure() { return true; } get cellDrift() { return true; } }
  const area = (p) => { let a = 0; for (let i = 0, k = p.n - 1; i < p.n; k = i++) a += p.xy[k * 2] * p.xy[i * 2 + 1] - p.xy[i * 2] * p.xy[k * 2 + 1]; return Math.abs(a / 2); };
  for (const seed of [1, 5, 11]) {
    const m = new LawCells({ width: 300, height: 200, seed });
    m.walls({ on: true, at: 0 });
    m.broom({ n: 25, x: 0, y: 0, w: 260, h: 170, size: 0.02, spread: 0.9, spreading: 12, color: '#3b2b24' });
    for (let t = 0; t < 2000 && m.busy; t++) m.step();
    const brown = m.polys.filter((p) => p.cell);
    const last = new Map(brown.map((p) => [p, area(p)]));
    m.broom({ n: 25, x: 0, y: 0, w: 260, h: 170, size: 0.012, spread: 0.9, spreading: 12, color: '#3fa7d6' });
    let worst = 0;
    for (let t = 0; t < 2000 && m.busy; t++) {
      m.step();
      for (const p of brown) {
        if (!m.polys.includes(p)) { worst = 1; continue; }
        const a = area(p);
        worst = Math.max(worst, 1 - a / last.get(p));
        last.set(p, a);
      }
    }
    assert.ok(worst < 0.3, `seed ${seed}: a first-colour cell lost ${(worst * 100).toFixed(0)}% of its area in one tick (or vanished)`);
    const blue = m.polys.filter((p) => p.cell && p.color === '#3fa7d6');
    assert.ok(blue.length >= 10, `seed ${seed}: ${blue.length} blue cells`);
  }
});

// The law review (808cd94): the drift step had no time step, so a finer dt drifted half as far a second.
test('Cells drift is per second: halving the time step lays the same cells out', () => {
  class LawCells extends Cells { get cellsPressure() { return true; } get cellDrift() { return true; } }
  const run = (dt) => {
    const m = new LawCells({ width: 300, height: 200, seed: 11, dt });
    m.walls({ on: true, at: 0 });
    m.broom({ n: 25, x: 0, y: 0, w: 260, h: 170, size: 0.02, spread: 0.9, spreading: 12, color: '#3b2b24' });
    for (let t = 0; t < 4000 && m.busy; t++) m.step();
    return m.polys.filter((p) => p.cell).map((p) => { let x = 0, y = 0; for (let i = 0; i < p.n; i++) { x += p.xy[i * 2]; y += p.xy[i * 2 + 1]; } return [x / p.n, y / p.n]; });
  };
  const a = run(1 / 30), b = run(1 / 60);
  assert.equal(a.length, b.length);
  const off = a.map(([x, y], k) => Math.hypot(x - b[k][0], y - b[k][1])).sort((p, q) => p - q);
  const median = off[off.length >> 1];
  assert.ok(median < 2, `cells' centres differ by ${median.toFixed(2)} mm (median), ${off.at(-1).toFixed(1)} at most`);
});
