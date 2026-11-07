// The traditional pattern catalogue: every entry says how well it's supported, cites its sources,
// and only uses images we may reuse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, SOURCES } from './patterns.js';
import { EXAMPLES } from './examples.js';

test('every pattern has an id, family, name, summary and status', () => {
  const ids = new Set();
  for (const p of PATTERNS) {
    assert.ok(p.id && !ids.has(p.id), p.id);
    ids.add(p.id);
    assert.ok(['base', 'combed', 'ebru', 'suminagashi'].includes(p.family), p.id);
    assert.ok(Object.keys(p.names).length > 0, p.id);
    assert.ok(p.summary.length > 20, p.id);
    assert.ok(['verified', 'partly', 'unverifiable'].includes(p.status), p.id);
  }
});

test('sources are known, and only unverifiable or attributed entries go without', () => {
  for (const p of PATTERNS) {
    for (const s of p.sources) assert.ok(s in SOURCES, `${p.id}: ${s}`);
    if (p.status === 'verified') assert.ok(p.sources.length > 0, `${p.id} is verified but cites nothing`);
  }
});

test('images carry a licence, and examples exist', () => {
  for (const p of PATTERNS) {
    if (p.image) {
      assert.match(p.image.url, /^https:\/\//, p.id);
      assert.ok(p.image.licence, `${p.id} image has no licence`);
    }
    if (p.example) assert.ok(p.example in EXAMPLES, `${p.id}: no example called ${p.example}`);
  }
});
