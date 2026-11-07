import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Film } from './film.js';
import { ThinFilm } from './thinfilm.js';
import { renderPrint } from './print.js';

const TANK = { width: 1000, height: 700 };
const plainOptions = { paleness: 0, rim: 0, mottle: 0, grain: 0, width: 200, smooth: 1 };
const pixel = ({ width, height, data }, xMm, yMm) => {
  const x = Math.round((xMm / 1000 + 0.5) * (width - 1));
  const y = Math.round((0.5 - yMm / 700) * (height - 1));
  return [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 3)];
};
const settled = (m) => { m.runUntilIdle(); return m; };

test('with everything off, ink keeps its chosen colour on the paper', async () => {
  const m = settled(new Film(TANK));
  m.drop({ x: 0, y: 0, quantity: 2, spreading: 1, color: '#174a7e' });
  settled(m);
  const image = await renderPrint(m, plainOptions);
  const [r, g, b] = pixel(image, 0, 0);
  assert.ok(Math.abs(r - 0x17) <= 2 && Math.abs(g - 0x4a) <= 2 && Math.abs(b - 0x7e) <= 2, `${r},${g},${b}`);
  assert.deepEqual(pixel(image, 450, 300), [246, 241, 228]);
});

test('a drop that spread further prints paler than one at plain size', async () => {
  const m = new Film(TANK);
  m.drop({ x: -250, y: 0, quantity: 2, spreading: 1, color: '#174a7e' });
  m.drop({ x: 250, y: 0, quantity: 2, spreading: 4, color: '#174a7e' });
  settled(m);
  const image = await renderPrint(m, { ...plainOptions, paleness: 0.5 });
  assert.ok(pixel(image, 250, 0)[0] > pixel(image, -250, 0)[0] + 10);
});

test('a thin gap between films fills with ink, and open water does not', async () => {
  const m = new Film(TANK);
  m.separateOn = false; // the joined look: Keep cells separate off
  m.polys.push({ xy: Float64Array.from([-100, -50, -2, -50, -2, 50, -100, 50]), n: 4, color: '#112233' });
  m.polys.push({ xy: Float64Array.from([2, -50, 100, -50, 100, 50, 2, 50]), n: 4, color: '#112233' });
  const image = await renderPrint(m, { ...plainOptions, width: 1000 });
  assert.ok(pixel(image, 0, 0)[0] < 60);
  assert.ok(pixel(image, 200, 0)[0] > 200);
});

test('printing leaves the tank alone and reports its progress', async () => {
  const m = new Film(TANK);
  m.drop({ x: 0, y: 0, quantity: 2, color: '#112233' });
  settled(m);
  const before = Float64Array.from(m.polys[0].xy);
  const seen = [];
  await renderPrint(m, plainOptions, (share) => seen.push(share));
  assert.deepEqual(Float64Array.from(m.polys[0].xy), before);
  assert.equal(seen.at(-1), 1);
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b));
});

test('no rim is drawn between touching regions of one colour', async () => {
  const m = new Film(TANK);
  m.separateOn = false; // the joined look: Keep cells separate off
  // With a thin gap between them, which the print closes.
  m.polys.push({ xy: Float64Array.from([-100, -50, -2, -50, -2, 50, -100, 50]), n: 4, color: '#c8553d' });
  m.polys.push({ xy: Float64Array.from([2, -50, 100, -50, 100, 50, 2, 50]), n: 4, color: '#c8553d' });
  const image = await renderPrint(m, { ...plainOptions, width: 1000, rim: 0.5, rimWidth: 2 });
  assert.deepEqual(pixel(image, 0, 0), pixel(image, 50, 0));
});

test('a print draws a many-sided outline as a curve, not straight chords', async () => {
  const m = new Film(TANK);
  const xy = [];
  for (let i = 0; i < 16; i++) xy.push(200 * Math.cos((i / 16) * 2 * Math.PI), 200 * Math.sin((i / 16) * 2 * Math.PI));
  m.polys.push({ xy: Float64Array.from(xy), n: 16, color: '#112233' });
  const image = await renderPrint(m, { ...plainOptions, width: 1000 });
  // Halfway along a side, the curve is on the circle and a straight chord would be 3.8 mm inside.
  const angle = Math.PI / 16;
  assert.ok(pixel(image, 198.5 * Math.cos(angle), 198.5 * Math.sin(angle))[0] < 60);
});

test('soft edges blend inks at an edge and leave flat ink alone', async () => {
  const m = new Film(TANK);
  m.paint({ path: [[-600, 0], [600, 0]], width: 300, color: '#174a7e' });
  m.step();
  const crisp = await renderPrint(m, plainOptions);
  const soft = await renderPrint(m, { ...plainOptions, soft: 12 });
  assert.deepEqual(pixel(soft, 0, 0), pixel(crisp, 0, 0));
  assert.deepEqual(pixel(soft, 0, 330), pixel(crisp, 0, 330));
  let changed = 0;
  for (let x = -480; x <= 480; x += 20) {
    const a = pixel(crisp, x, 150);
    const b = pixel(soft, x, 150);
    if (Math.abs(a[0] - b[0]) > 5) changed++;
  }
  assert.ok(changed > 5, `only ${changed} points along the edge softened`);
});

class Tiled extends Film {
  get tileSupported() { return true; }
}

test('a tile is drawn wherever it shows, and joins itself at the seam', async () => {
  const m = new Tiled(TANK);
  m.tile({ on: true });
  m.paint({ path: [[300, 0], [800, 0]], width: 100, color: '#174a7e' });
  m.step();
  const { xy, n } = m.polys[0];
  // Its right end runs past the edge, so it comes back in on the left.
  assert.deepEqual(m.tileShifts([m.polys[0]]).map(([x]) => x).sort((a, b) => a - b), [-1000, 0]);
  assert.ok(n > 8 && xy.length >= n * 2);
  const image = await renderPrint(m, plainOptions);
  const [r] = pixel(image, -400, 0);
  assert.ok(Math.abs(r - 0x17) <= 2, 'the part past the right edge shows on the left');
  assert.deepEqual(pixel(image, -100, 0), [246, 241, 228]);
});

test('stripes on a tile match across both seams', async () => {
  const m = new Tiled(TANK);
  m.tile({ on: true });
  m.stripes({ count: 14, colors: ['#111111', '#777777', '#dddddd'], slivers: 0 });
  m.step();
  const { width, height, data } = await renderPrint(m, { ...plainOptions, width: 500 });
  const at = (x, y) => data[(y * width + x) * 4];
  let differ = 0;
  for (let y = 0; y < height; y++) if (Math.abs(at(0, y) - at(width - 1, y)) > 40) differ++;
  assert.ok(differ / height < 0.02, `${differ} of ${height} rows differ across the left and right seam`);
  let bare = 0;
  for (let i = 0; i < width * height; i++) if (data[i * 4] > 240) bare++;
  assert.equal(bare, 0, 'no water shows');
});

test('tile refuses simulators without repeating motion, and leaves them unchanged', () => {
  assert.throws(() => new ThinFilm(TANK).tile({ on: true }), /can't repeat/);
  const m = new ThinFilm(TANK);
  m.drop({ x: 0, y: 0, quantity: 1 });
  m.runUntilIdle();
  assert.deepEqual(m.tileShifts([m.polys[0]]), [[0, 0]]);
});
