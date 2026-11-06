// The settings spec in controller.js is what a new interface draws from, so it must match the old page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SETTINGS, DEFAULT_SETTINGS, DETAIL_PRESETS, storedSettings, storeSetting, TankController } from './controller.js';
import { INFO } from './info.js';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const ui = await readFile(new URL('./ui.js', import.meta.url), 'utf8');

// The opening tag of an element, by id.
function tag(id) {
  const m = html.match(new RegExp(`<(input|select)[^>]*\\bid="${id}"[^>]*>`));
  assert.ok(m, `no field #${id} in index.html`);
  return m[0];
}
const attr = (t, name) => t.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
function options(id) {
  const body = html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1];
  return [...body.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)].map(([, v, text]) => [v, text]);
}

test('every setting has a field in the old page with the same start, range and options', () => {
  for (const [id, s] of Object.entries(SETTINGS)) {
    const t = tag(id);
    if (s.kind === 'toggle') {
      assert.equal(attr(t, 'type'), 'checkbox', id);
      assert.equal(/\bchecked\b/.test(t), s.default, id);
    } else if (s.kind === 'number') {
      assert.equal(attr(t, 'type'), 'number', id);
      assert.equal(attr(t, 'value'), s.default, id);
      assert.equal(Number(attr(t, 'min')), s.min, `${id} min`);
      assert.equal(Number(attr(t, 'max')), s.max, `${id} max`);
      assert.equal(Number(attr(t, 'step') ?? 1), s.step, `${id} step`);
    } else if (s.kind === 'colour') {
      assert.equal(attr(t, 'type'), 'color', id);
      assert.equal(attr(t, 'value'), s.default, id);
    } else if (id !== 'simulator') { // the page fills that one from MODELS
      const found = options(id);
      assert.deepEqual(found.map(([v, text]) => [v, text.trim()]), s.options, `${id} options`);
      const chosen = html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>[\\s\\S]*?<option value="([^"]*)"[^>]*selected`))?.[1];
      assert.equal(chosen ?? found[0][0], s.default, `${id} default`);
    }
  }
});

test('the Detail presets are the old page’s', () => {
  assert.deepEqual(options('detailPreset').filter(([v]) => v !== 'custom').map(([v, t]) => [v, t]), DETAIL_PRESETS);
});

test('every setting’s (i) exists, and the kept ones use the old page’s storage keys', () => {
  for (const [id, s] of Object.entries(SETTINGS)) {
    if (s.info) assert.ok(s.info in INFO, `${id}: ${s.info}`);
    if (s.store) assert.ok(ui.includes(`'${s.store}'`), `${id}: ${s.store}`);
  }
});

test('kept settings come back as they were stored, and bad ones are left out', () => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  storeSetting(storage, 'clearFirst', false);
  storeSetting(storage, 'lowFramerate', true);
  storeSetting(storage, 'pointLimit', 2000000);
  storeSetting(storage, 'visc', '5'); // not kept
  storage.setItem('marbler.simulator', 'nonsense');
  assert.equal(store.get('marbler.runKeepsInk'), '1');
  assert.deepEqual(storedSettings(storage), { clearFirst: false, lowFramerate: true, pointLimit: '2000000' });
  assert.ok(!('visc' in storedSettings(storage)));
});

test('defaults are the spec’s, and shows() follows the simulator', () => {
  for (const [id, s] of Object.entries(SETTINGS)) assert.equal(DEFAULT_SETTINGS[id], s.default, id);
  const c = new TankController({ settings: { simulator: 'classic' } });
  assert.ok(c.shows('walls') && c.shows('tile') && !c.shows('tileOffset') && !c.shows('flowPush') && !c.shows('queueGap'));
  c.settings.tile = true;
  c.settings.queueMode = 'order';
  assert.ok(c.shows('tileOffset') && c.shows('queueGap'));
  c.setSimulator('gridink');
  assert.ok(!c.shows('walls') && c.shows('tile') && !c.shows('tileOffset') && c.shows('flowPush'));
  c.setSimulator('spreading');
  assert.ok(!c.shows('tile'));
});
