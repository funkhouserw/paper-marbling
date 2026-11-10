import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageCells, cellsToPrints, segmentsClash, detailSettings, MAX_TOL } from './image.js';

// A w×h RGBA picture from a function of (x, y) → [r, g, b, a?].
function picture(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a = 255] = fn(x, y);
    data.set([r, g, b, a], (y * w + x) * 4);
  }
  return { data, w, h };
}
let s = 9;
const noise = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
const RED = [200, 30, 40], BLUE = [30, 60, 190], YELLOW = [240, 210, 40], GREEN = [30, 150, 70];

// A photo-like field: smooth bands of colour with fine strands and noise.
function photo(w, h, seed = 9) {
  s = seed;
  return picture(w, h, (x, y) => {
    const u = x / w, v = y / h;
    const f = Math.sin(u * 9 + Math.sin(v * 7) * 2) + Math.sin(v * 11 + u * 3) * 0.8 + Math.sin((u + v) * 23) * 0.35 + Math.sin(u * 41 - v * 37) * 0.25;
    const t = (f + 2.4) / 4.8;
    return [255 * t + noise() * 30, 255 * (1 - t) * (0.5 + 0.5 * Math.sin(u * 6)) + noise() * 30, 255 * Math.abs(Math.sin(v * 4 + t * 3)) + noise() * 30];
  });
}

const area = (l) => { let a = 0; for (let i = 0, j = l.length - 1; i < l.length; j = i++) a += l[j][0] * l[i][1] - l[i][0] * l[j][1]; return a / 2; };
const cellArea = (c) => c.loops.reduce((sum, l, i) => sum + (i ? -1 : 1) * Math.abs(area(l)), 0);

// Even-odd: how many cells cover the point.
function cover(cells, x, y) {
  let n = 0;
  for (const c of cells) {
    let inside = false;
    for (const l of c.loops) {
      for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
        const [xi, yi] = l[i], [xj, yj] = l[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) n++;
  }
  return n;
}

// Gap and overlap shares on a sample grid off the pixel lattice (inside the picture, all opaque).
function coverage(cells, w, h, step = 0.37) {
  let gap = 0, over = 0, total = 0;
  for (let y = 0.113; y < h; y += step) for (let x = 0.071; x < w; x += step) {
    const n = cover(cells, x, y);
    total++;
    if (n === 0) gap++;
    if (n > 1) over++;
  }
  return { gap: gap / total, over: over / total };
}

function assertSimple(cells) {
  for (const c of cells) for (const l of c.loops) {
    const n = l.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      assert.ok(!segmentsClash(l[i], l[(i + 1) % n], l[j], l[(j + 1) % n]), `loop crosses itself at ${l[i]} / ${l[j]}`);
    }
  }
}

// Every interior segment appears exactly twice, once each way; border segments once.
function assertShared(cells, w, h) {
  const seen = new Map();
  for (const c of cells) for (const l of c.loops) for (let i = 0; i < l.length; i++) {
    const a = l[i], b = l[(i + 1) % l.length];
    const k = `${a}>${b}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const onBorder = (a, b) => (a[0] === b[0] && (a[0] === 0 || a[0] === w)) || (a[1] === b[1] && (a[1] === 0 || a[1] === h));
  for (const [k, n] of seen) {
    assert.equal(n, 1, `segment ${k} used ${n} times one way`);
    const [a, b] = k.split('>').map((p) => p.split(',').map(Number));
    if (!onBorder(a, b)) assert.ok(seen.has(`${b}>${a}`), `interior segment ${k} has no partner`);
  }
}

function assertPartition(res, w, h) {
  const total = res.cells.reduce((sum, c) => sum + cellArea(c), 0);
  assert.ok(Math.abs(total - w * h) < 1e-9, `cells cover ${total} of ${w * h}`);
  assertShared(res.cells, w, h);
  assertSimple(res.cells);
  const { gap, over } = coverage(res.cells, w, h);
  assert.equal(gap, 0, 'gap');
  assert.equal(over, 0, 'overlap');
}

test('three flat colours with noise stay three colours at ten', () => {
  s = 3;
  const img = picture(60, 40, (x, y) => (x < 20 ? RED : x < 40 ? BLUE : YELLOW).map((c) => c + noise() * 20));
  const res = imageCells(img, { colours: 10 });
  assert.equal(res.colours, 3);
  assert.equal(res.cells.length, 3);
  assertPartition(res, 60, 40);
});

test('the same picture gives the same cells', () => {
  const a = imageCells(photo(120, 90), { colours: 8 });
  const b = imageCells(photo(120, 90), { colours: 8 });
  assert.deepEqual(a, b);
});

test('four squares are four cells; a speck merges; a donut is one cell with a hole', () => {
  const sq = imageCells(picture(40, 40, (x, y) => (x < 20 ? (y < 20 ? RED : BLUE) : (y < 20 ? YELLOW : GREEN))), { colours: 4 });
  assert.equal(sq.cells.length, 4);
  assertPartition(sq, 40, 40);

  const speck = imageCells(picture(40, 40, (x, y) => (x >= 10 && x < 12 && y === 10 ? BLUE : RED)), { colours: 2 });
  assert.equal(speck.cells.length, 1);

  const r = (x, y) => Math.hypot(x + 0.5 - 30, y + 0.5 - 30);
  const donut = imageCells(picture(60, 60, (x, y) => (r(x, y) < 10 ? YELLOW : r(x, y) < 20 ? BLUE : RED)), { colours: 3 });
  assert.equal(donut.cells.length, 3);
  const ring = donut.cells.find((c) => c.loops.length === 2);
  assert.ok(ring, 'the ring has an outer loop and a hole');
  assertPartition(donut, 60, 60);
});

test('outer loop first and anticlockwise, holes clockwise, in mm', () => {
  const r = (x, y) => Math.hypot(x + 0.5 - 30, y + 0.5 - 30);
  const res = imageCells(picture(60, 60, (x, y) => (r(x, y) < 10 ? YELLOW : r(x, y) < 20 ? BLUE : RED)), { colours: 3 });
  const prints = cellsToPrints(res, { w: 60, h: 60 }, { size: 300, x: 10, y: -5 });
  const flatArea = (c) => { const p = []; for (let i = 0; i < c.length; i += 2) p.push([c[i], c[i + 1]]); return area(p); };
  for (const p of prints) {
    const areas = p.contours.map(flatArea);
    assert.ok(areas[0] > 0);
    for (const a of areas.slice(1)) { assert.ok(a < 0); assert.ok(Math.abs(a) < areas[0]); }
  }
});

test('transparent pixels get no ink', () => {
  const res = imageCells(picture(40, 40, (x, y) => (x < 8 ? [0, 0, 0, 0] : RED)), { colours: 2 });
  for (const c of res.cells) for (const l of c.loops) for (const [x] of l) assert.ok(x >= 8);
  assert.ok(Math.abs(res.cells.reduce((sum, c) => sum + cellArea(c), 0) - 32 * 40) < 1e-9);
});

test('a photo-like field is an exact partition at every detail, within the caps', () => {
  for (const [detail, w, h] of [[1, 96, 72], [3, 192, 144], [5, 320, 240]]) {
    const res = imageCells(photo(w, h), { colours: 10, detail });
    const set = detailSettings(detail);
    assert.ok(res.points <= set.points, `detail ${detail}: ${res.points} points`);
    assert.ok(res.cells.length <= set.cells, `detail ${detail}: ${res.cells.length} cells`);
    assertPartition(res, w, h);
  }
});

test('one-pixel strands at the largest tolerance still give simple loops and no overlap', () => {
  // Diagonal one-pixel strands and two-pixel-wide cells, with a tiny point budget to force MAX_TOL.
  const img = picture(80, 60, (x, y) => ((x + y) % 7 === 0 ? BLUE : (x - y + 200) % 11 < 2 ? YELLOW : (x * 3 + y) % 23 < 1 ? GREEN : RED));
  const res = imageCells(img, { colours: 4, detail: 5 });
  assertPartition(res, 80, 60);
  const forced = imageCells(img, { colours: 4, detail: 5, limits: { points: 1 } });
  assert.equal(forced.tolerance, MAX_TOL);
  assertPartition(forced, 80, 60);
});

// ---- On the tank ----------------------------------------------------------------
import { Marble, runScript } from './engine.js';
import { MODELS } from './models.js';
import { GridInk } from './gridink.js';
import { TankController } from './controller.js';

const tankPhoto = () => photo(64, 48, 4);

// Even-odd cover of a point by each print group's loops, in mm.
function groupsOf(m) {
  const groups = new Map();
  for (const p of m.polys) {
    const pts = [];
    for (let i = 0; i < p.n; i++) pts.push([p.xy[i * 2], p.xy[i * 2 + 1]]);
    if (!groups.has(p.group)) groups.set(p.group, { loops: [] });
    groups.get(p.group).loops.push(pts);
  }
  return [...groups.values()];
}

test('a replayed script lays the same cells, still with no gap or overlap, in every simulator', () => {
  const img = tankPhoto();
  const res = imageCells(img, { colours: 6, detail: 3 });
  const prints = cellsToPrints(res, img, { size: 640 }); // 640 × 480 mm in a 1000 × 700 tank
  for (const model of MODELS) {
    const E = model.id === 'gridink' ? GridInk : (model.engine ?? Marble);
    const make = () => { const m = new E({ width: 1000, height: 700 }); if (model.spreading) m.spreading = true; return m; };
    const a = make();
    for (const p of prints) a.print(p);
    for (let i = 0; i < 3; i++) a.step();
    const b = make();
    runScript(b, a.toScript());
    for (let i = 0; i < 3; i++) b.step();
    if (model.id === 'gridink') { assert.equal(b.polys.length, 0, 'grid ink takes prints into its grid'); continue; }
    // The script carries the cells to within its precision (1e-4 % of the page, under 0.001 mm).
    const la = a.log.filter((e) => e.fn === 'print'), lb = b.log.filter((e) => e.fn === 'print');
    assert.equal(lb.length, la.length, model.id);
    la.forEach((e, i) => e.args.contours.forEach((c, j) => c.forEach((v, k) => {
      assert.ok(Math.abs(lb[i].args.contours[j][k] - v) < 0.001, `${model.id} print ${i}`);
    })));
    // Gap and overlap on the replayed tank, sampled in mm inside the picture.
    const cells = groupsOf(b);
    let gap = 0, over = 0;
    for (let y = -238.7; y < 239; y += 3.1) for (let x = -318.3; x < 319; x += 3.1) {
      const n = cover(cells, x, y);
      if (n === 0) gap++;
      if (n > 1) over++;
    }
    assert.equal(gap, 0, `${model.id} gap`);
    assert.equal(over, 0, `${model.id} overlap`);
  }
});

test('Image waits behind a growing drop with Tools wait on, lands whole, and undoes as one step', () => {
  const c = new TankController({ settings: { simulator: 'spreading', toolsWait: true } });
  c.tool = 'image';
  const before = c.marble.log.length;
  c.press([0, 0]);
  assert.equal(c.marble.log.length, before, 'no picture: nothing happens');
  c.setPicture(tankPhoto());
  c.tool = 'drop';
  c.press([300, 200]);
  c.tool = 'image';
  c.press([0, 0]);
  const cells = c.currentImage().length;
  for (let i = 0; i < 600 && (c.marble.busy || c.marble.queued.length); i++) c.marble.step();
  const groups = new Set(c.marble.polys.filter((p) => p.group).map((p) => p.group));
  assert.equal(groups.size, cells);
  assert.equal(c.stepLabels.get(c.undoMarks.at(-1)), 'Image');
  c.undo();
  for (let i = 0; i < 5; i++) c.marble.step();
  assert.equal(c.marble.polys.filter((p) => p.group).length, 0);
  assert.ok(c.marble.polys.length > 0, 'the drop is still there');
});

test('the picture is never in values or settings', () => {
  const c = new TankController({ settings: { simulator: 'classic' } });
  c.setPicture(tankPhoto());
  c.tool = 'image';
  c.press([0, 0]);
  const stored = JSON.stringify([c.values, c.settings]);
  assert.ok(stored.length < 20000);
  assert.deepEqual(Object.keys(c.values.image).sort(), ['colours', 'detail', 'fit', 'from']);
});

test('a small vivid patch on a dull picture gets an ink of its own', () => {
  // Browns in bands, with two small yellow discs (an owl's eyes). Plain k-means at 8 inks averages
  // them into the browns for these radii; promotion gives them an ink.
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  for (const r of [5, 7]) {
    s = 5;
    const img = picture(160, 120, (x, y) => {
      if (Math.hypot(x - 50, y - 60) < r || Math.hypot(x - 110, y - 60) < r) return [235, 190, 60];
      const t = (Math.sin(x / 9) + Math.sin(y / 7) + 2) / 4;
      return [60 + 190 * t + noise() * 20, 45 + 170 * t + noise() * 20, 30 + 140 * t + noise() * 20];
    });
    const res = imageCells(img, { colours: 8 });
    const yellow = res.cells.some((c) => { const [R, G, B] = hex(c.color); return R > 180 && G > 140 && B < 120 && R - B > 100; });
    assert.ok(yellow, `r ${r}: inks ${[...new Set(res.cells.map((c) => c.color))].join(' ')}`);
  }
});

// ---- Choosing a picture lays it; new settings replace it while it is the newest step ----
const printGroups = (c) => new Set(c.marble.polys.filter((p) => p.group).map((p) => p.group)).size;
const settle = (c) => { for (let i = 0; i < 400 && (c.marble.busy || c.marble.queued.length); i++) c.marble.step(); c.marble.step(); };

test('choosing a picture lays it at once, centred, as one Image step', () => {
  const c = new TankController({ settings: { simulator: 'classic' } });
  c.tool = 'image';
  const marks = c.undoMarks.length;
  c.choosePicture(tankPhoto());
  settle(c);
  assert.equal(c.undoMarks.length, marks + 1);
  assert.equal(c.stepLabels.get(c.undoMarks.at(-1)), 'Image');
  assert.equal(printGroups(c), c.currentImage().length);
  // Centred: the ink's bounding box is centred on the tank.
  let lo = Infinity, hi = -Infinity;
  for (const p of c.marble.polys) for (let i = 0; i < p.n; i++) { lo = Math.min(lo, p.xy[i * 2]); hi = Math.max(hi, p.xy[i * 2]); }
  assert.ok(Math.abs(lo + hi) < 1, `centre ${(lo + hi) / 2}`);
});

test('new settings or a new file replace the newest image, still one step; after other work they do not', () => {
  const c = new TankController({ settings: { simulator: 'classic' } });
  c.tool = 'image';
  c.choosePicture(tankPhoto());
  settle(c);
  const marks = c.undoMarks.length, before = printGroups(c);
  c.values.image.colours = 3;
  assert.equal(c.relayImage(), true);
  settle(c);
  assert.equal(c.undoMarks.length, marks, 'still one step');
  assert.equal(c.redoGroups.length, 0, 'nothing to redo');
  assert.equal(printGroups(c), c.currentImage().length);
  assert.notEqual(printGroups(c), before);
  // Another file while it is newest: replaced.
  c.choosePicture(picture(40, 30, (x) => (x < 20 ? RED : BLUE)));
  settle(c);
  assert.equal(c.undoMarks.length, marks);
  assert.equal(printGroups(c), 2);
  // Something else happens: the image is no longer newest, so settings only affect the next lay.
  c.tool = 'drop';
  c.press([300, 200]);
  settle(c);
  const after = c.undoMarks.length, polys = c.marble.polys.length;
  c.values.image.colours = 5;
  assert.equal(c.relayImage(), false);
  assert.equal(c.undoMarks.length, after);
  assert.equal(c.marble.polys.length, polys);
  // A new file now adds a new image rather than replacing.
  c.tool = 'image';
  c.choosePicture(tankPhoto());
  assert.equal(c.undoMarks.length, after + 1);
  // One undo takes the whole image away.
  c.undo();
  settle(c);
  assert.equal(c.undoMarks.length, after);
});

test('a click lays a copy where clicked, and that copy is the one new settings replace', () => {
  const c = new TankController({ settings: { simulator: 'classic' } });
  c.tool = 'image';
  c.choosePicture(tankPhoto());
  settle(c);
  c.values.image.fit = 20;
  c.press([250, 100]);
  settle(c);
  const marks = c.undoMarks.length;
  assert.deepEqual(c.imageStep.point, [250, 100]);
  c.values.image.colours = 3;
  assert.equal(c.relayImage(), true);
  assert.equal(c.undoMarks.length, marks);
  assert.deepEqual(c.imageStep.point, [250, 100]);
});
