import test from 'node:test';
import assert from 'node:assert/strict';
import { keptList } from './kept.js';
import { PALETTES, BUILT_IN_PALETTES, palette, setSavedPalettes, validPalette, cleanPalette } from './palettes.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const kept = keptList('k');

test('things come back as saved, in the order first saved', () => {
  const s = memory();
  kept.save({ name: 'a', text: 'one' }, s);
  kept.save({ name: 'b', text: 'two' }, s);
  assert.deepEqual(kept.list(s).map((x) => [x.name, x.text]), [['a', 'one'], ['b', 'two']]);
});

test('saving under the same name replaces, and removing takes only that one', () => {
  const s = memory();
  kept.save({ name: 'a', text: 'one' }, s);
  kept.save({ name: 'b', text: 'two' }, s);
  kept.save({ name: 'a', text: 'three' }, s);
  assert.deepEqual(kept.list(s).map((x) => [x.name, x.text]), [['a', 'three'], ['b', 'two']]);
  kept.remove('a', s);
  assert.deepEqual(kept.list(s).map((x) => x.name), ['b']);
});

test('awkward names are ordinary names, and bad storage reads as empty', () => {
  const s = memory();
  kept.save({ name: '__proto__', text: 'x' }, s);
  assert.equal(kept.list(s)[0].name, '__proto__');
  assert.deepEqual(kept.list({ getItem: () => '{not json' }), []);
});

test('saved palettes work through palette() and PALETTES, and leave built-ins alone', () => {
  const mine = { name: 'Mine', bath: '#112233', inks: [{ color: '#ff0000', shimmer: 0.5 }] };
  const before = BUILT_IN_PALETTES.length;
  setSavedPalettes([mine]);
  assert.equal(palette('mine').bath, '#112233');
  assert.equal(PALETTES.length, before + 1);
  assert.ok(palette('Old Dutch'));
  setSavedPalettes([]);
  assert.equal(PALETTES.length, before);
  assert.throws(() => palette('Mine'), /Unknown palette/);
});

test('palettes are checked', () => {
  const ok = { name: 'A', bath: '#000000', inks: [{ color: '#abcdef', shimmer: 0 }, { color: '#abcdef80', shimmer: 1 }] };
  assert.ok(validPalette(ok));
  for (const bad of [
    null, { ...ok, name: ' ' }, { ...ok, bath: 'red' }, { ...ok, inks: [] }, { ...ok, inks: [{ color: 'red', shimmer: 0 }] },
    { ...ok, inks: [{ color: '#000000', shimmer: 2 }] }, { ...ok, inks: Array(13).fill(ok.inks[0]) }, { ...ok, name: 'x'.repeat(41) },
  ]) assert.ok(!validPalette(bad), JSON.stringify(bad));
  assert.deepEqual(Object.keys(cleanPalette({ ...ok, name: ' A ', extra: 1 })), ['name', 'bath', 'inks']);
  assert.equal(cleanPalette({ ...ok, name: ' A ' }).name, 'A');
});
