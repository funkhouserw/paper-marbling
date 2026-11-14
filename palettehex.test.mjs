// The typed hex field on palette inks: what counts as a whole colour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// parseHex lives in a .jsx file node can't import, so the test runs the function's own source.
const src = readFileSync(new URL('./app/src/ui/sections.jsx', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('export function parseHex'), src.indexOf('function HexField')).replace('export ', '');
const parseHex = new Function(`${body}; return parseHex;`)();

test('whole colours are taken, with or without the #, short or long', () => {
  assert.equal(parseHex('#C9A227'), '#c9a227');
  assert.equal(parseHex('c9a227'), '#c9a227');
  assert.equal(parseHex('#fa0'), '#ffaa00');
  assert.equal(parseHex(' 4a0e12 '), '#4a0e12');
});

test('half-typed or wrong text waits', () => {
  for (const t of ['', '#', '#c9a2', 'c9a22', '#gggggg', '#c9a2277']) assert.equal(parseHex(t), null);
});
