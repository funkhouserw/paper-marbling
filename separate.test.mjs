// Keep cells separate: fronts that meet keep a hairline seam; a same-colour drop inside merges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble } from './engine.js';
import { ThinFilm } from './thinfilm.js';
import { Film } from './film.js';
import { Wake } from './wake.js';
import { GridInk } from './gridink.js';

// What's drawn at (x, y): the colour of the topmost path in the SVG that covers it, or the bath.
const insideD = (d, x, y) => {
  let inside = false;
  for (const loop of d.split('Z').filter(Boolean)) {
    const pts = loop.replace('M', '').split('L').map((p) => p.split(' ').map(Number));
    for (let i = 0, k = pts.length - 1; i < pts.length; k = i++) {
      const [ax, ay] = pts[k], [bx, by] = pts[i];
      if ((ay > -y) !== (by > -y) && x < ax + ((-y - ay) * (bx - ax)) / (by - ay)) inside = !inside;
    }
  }
  return inside;
};
const colourAt = (m, x, y) => {
  const svg = m.toSVG();
  const clips = new Map([...svg.matchAll(/<clipPath id="([^"]+)"><path d="([^"]+)"\/><\/clipPath>/g)].map(([, id, d]) => [id, d]));
  let found = 'bath';
  for (const [tag, fill, d] of svg.matchAll(/<path fill="([^"]+)"[^>]* d="([^"]+)"/g)) {
    const clip = tag.match(/clip-path="url\(#([^)]+)\)"/);
    if (clip && !insideD(clips.get(clip[1]), x, y)) continue;
    if (insideD(d, x, y)) found = fill;
  }
  return found;
};

const twoDrops = (on, color2 = '#224466', Engine = Marble) => {
  const m = new Engine({ width: 200, height: 140, seed: 1 });
  if (!on) m.separate({ on: false, at: 0 });
  m.drop({ x: -12, y: 0, quantity: 1, color: '#224466', at: 0 });
  m.drop({ x: 12, y: 0, quantity: 1, color: color2, at: 0 });
  for (let t = 0; t < 4000 && m.busy; t++) m.step();
  return m;
};

// Where the two drops meet: the point on the line between them where the left drop's outline ends.
const meeting = (m) => {
  const left = m.polys[0];
  let x = -Infinity;
  for (let i = 0; i < left.n; i++) if (Math.abs(left.xy[i * 2 + 1]) < 1 && left.xy[i * 2] > x) x = left.xy[i * 2];
  return x;
};

test('separate is on by default and logged when changed', () => {
  const m = new Marble({ width: 100, height: 100, seed: 1 });
  assert.equal(m.separateOn, true);
  m.separate({ on: false, seam: 1, at: 0 });
  m.step();
  assert.equal(m.separateOn, false);
  assert.equal(m.seam, 1);
  assert.deepEqual(m.log.at(-1), { fn: 'separate', args: { on: false, seam: 1, at: 0 } });
});

test('two drops of one colour that meet keep a bare seam; off, they join', () => {
  const on = twoDrops(true);
  const x = meeting(on);
  assert.equal(colourAt(on, x, 0), 'bath', 'a seam of bare bath where the fronts met');
  const off = twoDrops(false);
  const y = meeting(off);
  assert.notEqual(colourAt(off, y, 0), 'bath', 'off, the hairline stroke joins them');
  assert.match(off.toSVG(), /stroke=/);
  assert.doesNotMatch(on.toSVG(), /stroke=/);
});

test('a drop inside an older colour shows that colour as a hairline round it', () => {
  const m = new Marble({ width: 200, height: 140, seed: 1 });
  m.drop({ x: 0, y: 0, quantity: 2, color: '#aa3322', at: 0 });
  m.drop({ x: 0, y: 0, quantity: 0.5, color: '#2244aa', at: 1 });
  m.runUntilIdle();
  const inner = m.polys[1];
  let r = 0;
  for (let i = 0; i < inner.n; i++) r = Math.max(r, Math.hypot(inner.xy[i * 2], inner.xy[i * 2 + 1]));
  assert.equal(colourAt(m, r - 0.1, 0), '#aa3322', 'the older colour shows at the inner drop\'s edge');
  assert.equal(colourAt(m, r - 1, 0), '#2244aa');
});

test('a drop inside a drop of its own colour merges: no seam shows', () => {
  const m = new Marble({ width: 200, height: 140, seed: 1 });
  m.drop({ x: 0, y: 0, quantity: 2, color: '#aa3322', at: 0 });
  m.drop({ x: 0, y: 0, quantity: 0.5, color: '#aa3322', at: 1 });
  m.runUntilIdle();
  for (let x = 0; x < 15; x += 0.1) assert.equal(colourAt(m, x, 0), '#aa3322');
});

test('an old saved tank loads joined, and stays joined after undoing', () => {
  const m = new Marble({ width: 100, height: 100, seed: 1 });
  m.drop({ x: 0, y: 0, color: '#123456', at: 0 });
  const state = m.saveState();
  delete state.separateOn;
  delete state.seam;
  const n = new Marble({ width: 100, height: 100, seed: 1 }).loadState(state);
  assert.equal(n.separateOn, false);
  assert.equal(n.log[0].fn, 'separate');
  const again = new Marble({ width: 100, height: 100, seed: 1 }).replay(n.log);
  again.runUntilIdle();
  assert.equal(again.separateOn, false);
});

test('simulators without seams yet ignore the setting', () => {
  const m = new GridInk({ width: 100, height: 100, seed: 1 });
  assert.equal(m.seamsDrawn, false);
});

for (const Engine of [Film, Wake]) {
  test(`${Engine.name}: drops that meet keep a seam, with no underpaint closing it; off, they join`, () => {
    const on = twoDrops(true, '#224466', Engine);
    assert.equal(on.seamsDrawn, true);
    assert.equal(colourAt(on, meeting(on), 0), 'bath');
    assert.doesNotMatch(on.toSVG(), /fill="none" stroke=/, 'no underpaint');
    const off = twoDrops(false, '#224466', Engine);
    assert.match(off.toSVG(), /fill="none" stroke=/);
  });
}

test('Thin film draws seams, and drops landing together make room for each other', () => {
  const m = new ThinFilm({ width: 200, height: 140, seed: 1 });
  m.drop({ x: -10, y: 0, quantity: 1, color: '#224466', at: 0 });
  m.drop({ x: 10, y: 0, quantity: 1, color: '#663322', at: 0 });
  for (let t = 0; t < 3000 && m.busy; t++) m.step();
  assert.equal(m.seamsDrawn, true);
  assert.doesNotMatch(m.toSVG(), /stroke=/);
  // The later drop landed in the earlier one, which now lies round it: none of the later drop's
  // outline is outside the earlier one's, and the two never cross.
  const [a, b] = m.polys;
  const inside = (p, x, y) => { let w = false; for (let i = 0, k = p.n - 1; i < p.n; k = i++) { const ax = p.xy[k * 2], ay = p.xy[k * 2 + 1], bx = p.xy[i * 2], by = p.xy[i * 2 + 1]; if ((ay > y) !== (by > y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) w = !w; } return w; };
  let crossings = 0;
  for (let i = 0; i < b.n; i++) if (!inside(a, b.xy[i * 2], b.xy[i * 2 + 1])) crossings++;
  assert.ok(crossings === 0 || crossings === b.n, `the drops' outlines cross (${crossings} of ${b.n} points outside)`);
});

test('two drops of one colour that overlap show no seam inside the overlap; touching ones keep it', () => {
  // Outlines with points all along their edges, as drops have.
  const square = (x0, x1) => {
    const pts = [];
    for (let i = 0; i < 20; i++) pts.push(x0 + ((x1 - x0) * i) / 20, -20);
    for (let i = 0; i < 20; i++) pts.push(x1, -20 + 2 * i);
    for (let i = 0; i < 20; i++) pts.push(x1 - ((x1 - x0) * i) / 20, 20);
    for (let i = 0; i < 20; i++) pts.push(x0, 20 - 2 * i);
    return { xy: Float64Array.from(pts), n: 80, color: '#1e4d2b' };
  };
  const m = new Film({ width: 200, height: 140, seed: 1 });
  // Overlapping by 0.4 mm, less than a seam: each one's seam band would lie in the other's, leaving
  // a hairline of bath through what is one merged region (Ilse's photo 38).
  m.polys.push(square(-30, 0.2), square(-0.2, 30));
  assert.equal(colourAt(m, 0, 0), '#1e4d2b');
  const t = new Film({ width: 200, height: 140, seed: 1 });
  t.polys.push(square(-30, 0), square(0, 30)); // edge to edge
  assert.equal(colourAt(t, 0, 0), 'bath', 'touching fronts keep their seam');
});
