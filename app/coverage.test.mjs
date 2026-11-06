// Checks the new interface leaves nothing behind: every element id on the old page, every
// explanation in info.js and every tool setting has a home in features.js or the tool settings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SECTIONS, ACTIONS, FIXED, TOOL_GROUPS, infoKeysUsed, oldIdsCovered } from './src/ui/features.js';

const page = await readFile(new URL('../index.html', import.meta.url), 'utf8');
import { TOOLS, INFO } from './src/ui/live.js';

const controls = { tools: TOOLS, info: INFO };

test('every element id on the old page has a home', () => {
  const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 80, `only found ${ids.length} ids`);
  const covered = oldIdsCovered();
  assert.deepEqual(ids.filter((id) => !covered.has(id)), []);
});

test('every explanation in info.js is shown somewhere', () => {
  const used = infoKeysUsed();
  for (const [tool, def] of Object.entries(controls.tools)) {
    used.add(`tool.${tool}`);
    for (const p of [...def.params, ...def.choices]) used.add(`${tool}.${p.key}`);
  }
  assert.deepEqual(Object.keys(controls.info).filter((k) => !used.has(k)), []);
});

test('explanations named in features.js exist', () => {
  assert.deepEqual([...infoKeysUsed()].filter((k) => !(k in controls.info)), []);
});

test('controls name real actions, and ids are unique', () => {
  const actions = new Set(ACTIONS.map((a) => a.id));
  const all = [...SECTIONS.flatMap((s) => s.controls), ...FIXED];
  for (const c of all) {
    for (const a of [c.action, ...(c.actions ?? [])].filter(Boolean)) assert.ok(actions.has(a), `${c.id} uses unknown action ${a}`);
  }
  const sectionIds = SECTIONS.flatMap((s) => s.controls.map((c) => c.id));
  assert.equal(new Set(sectionIds).size, sectionIds.length, 'a control id is used twice');
  assert.equal(actions.size, ACTIONS.length, 'an action id is used twice');
});

test('every tool in tools.js has a place in a tool group, once', () => {
  const placed = TOOL_GROUPS.flatMap((g) => g.tools);
  assert.deepEqual(Object.keys(controls.tools).filter((t) => !placed.includes(t)), []);
  assert.deepEqual(placed.filter((t) => !(t in controls.tools)), []);
  assert.equal(new Set(placed).size, placed.length);
});

// Settings the page keeps for itself, which the tank never reads.
const PAGE_ONLY = ['imperfection', 'pullBase', 'clearAfter', 'mirror', 'autoSave', 'printPale', 'printTexture', 'printSoft', 'detailPreset', 'profiling'];

test('every setting control is a controller setting or a page setting, and every controller setting has a control', async () => {
  const { SETTINGS } = await import('../controller.js');
  const kinds = ['toggle', 'choice', 'number', 'slider', 'viscosity', 'colourToggle'];
  const all = [...SECTIONS.flatMap((s) => s.controls), ...FIXED];
  const settingControls = all.filter((c) => kinds.includes(c.kind));
  assert.deepEqual(settingControls.map((c) => c.id).filter((id) => !(id in SETTINGS) && !PAGE_ONLY.includes(id)), []);
  const placed = new Set(all.flatMap((c) => [c.id, ...(c.replaces ?? [])]));
  placed.add('speed'); // the transport's speed buttons
  assert.deepEqual(Object.keys(SETTINGS).filter((id) => !placed.has(id)), []);
});

test('choices offer the controller\'s options, in its order', async () => {
  const { SETTINGS } = await import('../controller.js');
  for (const c of SECTIONS.flatMap((s) => s.controls).filter((x) => x.kind === 'choice' && SETTINGS[x.id])) {
    assert.deepEqual(Object.keys(c.options), SETTINGS[c.id].options.map(([v]) => v), c.id);
  }
});
