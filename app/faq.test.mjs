// The drop's FAQ: answers come from the browser alone, and the obvious questions find them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FAQ, DOCS, search, wantsScript } from './src/ui/faq.js';
import { INFO } from './src/ui/live.js';
import { COMMANDS } from '../api.js';

test('every hand-written question finds its own answer first', () => {
  for (const f of FAQ) assert.equal(search(f.q)[0]?.title, f.q, f.q);
});

test('every explanation and script command is searchable, with a readable title', () => {
  assert.ok(DOCS.length >= FAQ.length + Object.keys(INFO).length + COMMANDS.length);
  for (const d of DOCS) assert.match(d.title, /^[A-Z0-9]/, d.title);
});

test('everyday wording finds the right answer', () => {
  const cases = {
    'change the background color': 'How do I change the background colour?',
    'how do I make it repeat seamlessly': 'How do I make a seamless repeating pattern?',
    'how do I write code': /script/,
    'gold ink': 'Can I use metallic or gold ink?',
    'what does the spray scatter do': 'Spray: Scatter',
    'save a picture': 'How do I save my work?',
  };
  for (const [q, want] of Object.entries(cases)) {
    const top = search(q)[0]?.title;
    if (want instanceof RegExp) assert.match(top, want, q); else assert.equal(top, want, q);
  }
  assert.deepEqual(search('banana'), []);
});

test('requests read as script requests, questions as questions', () => {
  for (const m of ['Five rows of drops then a feather rake', 'can you change the script to use gold', 'make the bath curl more']) assert.ok(wantsScript(m), m);
  for (const m of ['what is a script', 'how do I undo', 'does Wake keep moving?']) assert.ok(!wantsScript(m), m);
});
