import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INFO } from './info.js';
import { TOOLS } from './tools.js';

test('every tool and sidebar control has an explanation', () => {
  for (const [name, def] of Object.entries(TOOLS)) {
    assert.ok(INFO[`tool.${name}`], `tool ${name}`);
    for (const key of [...Object.keys(def.params), ...Object.keys(def.choices ?? {})]) {
      assert.ok(INFO[`${name}.${key}`], `${name}.${key}`);
    }
  }
});

test('every (i) in the page points at an explanation', () => {
  const keys = [...readFileSync(new URL('./index.html', import.meta.url), 'utf8').matchAll(/data-info="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 15);
  for (const key of keys) assert.ok(INFO[key], key);
});
