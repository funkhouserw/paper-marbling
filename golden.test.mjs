// The examples review's measures (scripts/golden-metrics.mjs, request #50), on made-up outlines:
// the same sheet scores 0, the same look laid out differently stays within its spread, and bands
// that lost their plumes (fewer lines, all one way) are flagged and say why.
import test from 'node:test';
import assert from 'node:assert/strict';
import { features, distances, judge, spreadOf } from './scripts/golden-metrics.mjs';

const W = 400, H = 300;
const poly = (pts, color) => ({ xy: Float64Array.from(pts.flat()), n: pts.length, color });
// Vertical bands of two colours, `count` across, each edge wiggled by `wiggle` mm with `waves` waves.
const bands = (count, { wiggle = 0, waves = 6, phase = 0 } = {}) => Array.from({ length: count }, (_, i) => {
  const x0 = -W / 2 + (i * W) / count, x1 = x0 + W / count;
  const edge = (x, up) => Array.from({ length: 41 }, (_, k) => {
    const y = -H / 2 + (k / 40) * H;
    return [x + wiggle * Math.sin((k / 40) * waves * 2 * Math.PI + phase + i), up ? y : -y];
  });
  return poly([...edge(x0, true), ...edge(x1, false)], i % 2 ? '#c43a2b' : '#7d93c4');
});

test('the same sheet is the same, and moving the pattern along a little stays within its spread', () => {
  const a = features(bands(20, { wiggle: 6 }), W, H);
  const d = distances(a, a);
  for (const k of ['orient', 'length', 'shapes', 'colours', 'sizes', 'tileOrient', 'tileLength']) assert.equal(d[k], 0, k);
  // Another seed of the same look: the waves shifted.
  const b = features(bands(20, { wiggle: 6, phase: 1.3 }), W, H);
  const spread = distances(a, b);
  const c = features(bands(20, { wiggle: 6, phase: 2.1 }), W, H);
  assert.equal(judge(a, c, spread).flagged, false, judge(a, c, spread).why.join());
});

test('plumes combed flat into straight bands are flagged for fewer lines, in other directions', () => {
  const plumes = features(bands(20, { wiggle: 14, waves: 9 }), W, H);
  const spread = distances(plumes, features(bands(20, { wiggle: 14, waves: 9, phase: 1 }), W, H));
  const flat = features(bands(20), W, H);
  const r = judge(plumes, flat, spread);
  assert.ok(r.flagged);
  assert.ok(r.why.some((w) => /fewer lines/.test(w)), r.why.join('; '));
  assert.ok(r.why.some((w) => /other directions/.test(w)), r.why.join('; '));
  assert.ok(r.worst.times > 3);
});

test('outlines off the tank do not count, and an empty tank has no lines', () => {
  const off = features([poly([[1000, 1000], [1100, 1000], [1100, 1100]], '#000')], W, H);
  assert.equal(off.length, 0);
  assert.equal(features([], W, H).length, 0);
});

test('the spread over several seeds is the median pair, so one odd seed does not set it', () => {
  const look = [0, 1.3, 2.1, 0.7].map((phase) => features(bands(20, { wiggle: 6, phase }), W, H));
  const odd = features(bands(20, { wiggle: 14, waves: 9 }), W, H); // a seed that came out unlike the rest
  const two = spreadOf([look[0], odd]).spread;
  const { spread, range } = spreadOf([look[0], look[1], look[2], odd]);
  assert.deepEqual(spreadOf([look[0], look[1]]).spread.orient, distances(look[0], look[1]).orient);
  assert.ok(spread.orient < two.orient, `${spread.orient} vs ${two.orient}`);
  assert.ok(range.orient[1] >= spread.orient && range.orient[0] <= spread.orient);
  assert.equal(judge(look[0], look[3], spread).flagged, false, judge(look[0], look[3], spread).why.join());
});
