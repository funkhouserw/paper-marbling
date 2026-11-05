// The public docs make promises about the code, so these keep them honest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Marble, runScript } from './engine.js';
import { MODELS } from './models.js';
import { MODEL_NOTES } from './howitworks.js';

const read = (file) => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');

test('How it works explains every simulator', () => {
  for (const model of MODELS) {
    const notes = MODEL_NOTES[model.id];
    assert.ok(notes?.how && notes.good && notes.limit, model.id);
  }
});

test('the script in the README and on How it works runs', () => {
  const script = read('README.md').match(/```js\n([\s\S]*?)```/)[1];
  const html = read('how-it-works.html').match(/<pre><code>([\s\S]*?)<\/code><\/pre>/)[1].replaceAll('&amp;', '&');
  assert.equal(html.trim(), script.trim());
  const marble = new Marble();
  runScript(marble, script);
  marble.runUntilIdle();
  assert.ok(marble.polys.length > 10);
});

test('images and local links in the docs exist', () => {
  for (const file of ['README.md', 'how-it-works.html', 'ROADMAP.md']) {
    const refs = [...read(file).matchAll(/(?:\]\(|src="|href=")(?!https?:|#)([^)"#\s]+)/g)].map((m) => m[1]);
    assert.ok(refs.length > 0, file);
    for (const ref of refs) assert.ok(existsSync(new URL(`./${ref}`, import.meta.url)), `${file} points at ${ref}`);
  }
});

test('the hosted demo stays free of private notes and the server', () => {
  const build = read('scripts/build.mjs');
  assert.ok(!/server\.mjs|PLAN|roadmap|bench/.test(build));
});
