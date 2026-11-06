// The page actions that don't need a canvas: saved scripts and palettes, and asking the assistant.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const { TankController } = await import('./controller.js');
const pa = await import('./pageactions.js');

const tank = () => new TankController({ settings: { simulator: 'classic' } });

test('scripts save by name, ask before replacing another, and need a name', () => {
  store.clear();
  const c = tank();
  assert.deepEqual(pa.saveScript(c, { name: '  ', text: 'x' }), { error: null, needsName: true });
  assert.deepEqual(pa.saveScript(c, { name: ' Spirals ', text: 'drop();' }), { name: 'Spirals' });
  assert.equal(pa.findScript('Spirals').text, 'drop();');
  assert.equal(pa.findScript('Spirals').simulator, 'classic');
  let asked = null;
  assert.deepEqual(pa.saveScript(c, { name: 'Spirals', text: 'rake();', confirmReplace: (n) => { asked = n; return false; } }), { cancelled: true });
  assert.equal(asked, 'Spirals');
  assert.deepEqual(pa.saveScript(c, { name: 'Spirals', text: 'rake();', open: 'Spirals', confirmReplace: () => assert.fail('no question when it is the open one') }), { name: 'Spirals' });
  assert.equal(pa.findScript('Spirals').text, 'rake();');
});

test('palettes save the current inks and bath, refuse built-in names, and can be deleted', () => {
  store.clear();
  const c = tank();
  assert.match(pa.savePalette(c, { name: 'Old Dutch' }).error, /built-in/);
  assert.match(pa.savePalette(c, { name: 'x'.repeat(41) }).error, /40 characters/);
  assert.deepEqual(pa.savePalette(c, { name: 'Spring' }), { name: 'Spring' });
  const { saved } = pa.paletteChoices();
  assert.deepEqual(saved.map((p) => p.name), ['Spring']);
  assert.equal(saved[0].bath, c.settings.bath);
  assert.equal(saved[0].inks.length, c.inks.length);
  // Saving as a differently-cased name replaces it, after asking.
  assert.deepEqual(pa.savePalette(c, { name: 'SPRING', confirmReplace: () => true }), { name: 'SPRING' });
  assert.deepEqual(pa.paletteChoices().saved.map((p) => p.name), ['SPRING']);
  assert.equal(pa.deletePalette('Old Dutch'), false);
  assert.equal(pa.deletePalette('SPRING', () => false), false);
  assert.equal(pa.deletePalette('SPRING'), true);
  assert.deepEqual(pa.paletteChoices().saved, []);
});

test("the assistant's palette actions save and switch, in order", () => {
  store.clear();
  const used = [];
  let saves = 0;
  const palette = { name: 'Pastels', bath: '#fffaf0', inks: [{ color: '#f4c2c2', shimmer: 0 }] };
  pa.applyPaletteActions([{ type: 'save', palette }, { type: 'use', name: 'Pastels' }], { onSaved: () => saves++, use: (n) => used.push(n) });
  assert.equal(saves, 1);
  assert.deepEqual(used, ['Pastels']);
  assert.deepEqual(pa.myPalettes.list().map((p) => p.name), ['Pastels']);
});

test('asking the assistant sends the chat, script and palettes, and reports each kind of failure', async () => {
  store.clear();
  const c = tank();
  let sent = null;
  globalThis.fetch = async (url, init) => {
    sent = { url, body: JSON.parse(init.body) };
    return { status: 200, json: async () => ({ script: 'drop();', reply: 'Done', paletteActions: [] }) };
  };
  const ok = await pa.askAssistant(c, { messages: [{ role: 'user', content: 'hi' }], script: 'x', paletteName: 'Dark Academia' });
  assert.equal(ok.reply, 'Done');
  assert.equal(sent.url, '/api/chat');
  assert.equal(sent.body.currentPalette.name, 'Dark Academia');
  assert.equal(sent.body.currentPalette.inks.length, c.inks.length);
  globalThis.fetch = async () => ({ status: 404, json: async () => ({}) });
  assert.match((await pa.askAssistant(c, { messages: [], script: '' })).error, /local server/);
  globalThis.fetch = async () => ({ status: 503, json: async () => ({ error: 'No API key' }) });
  assert.equal((await pa.askAssistant(c, { messages: [], script: '' })).error, 'No API key');
  globalThis.fetch = async () => ({ status: 500, json: async () => { throw new Error('bad'); } });
  assert.match((await pa.askAssistant(c, { messages: [], script: '' })).error, /500 with no usable JSON/);
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.match((await pa.askAssistant(c, { messages: [], script: '' })).error, /Couldn't reach the server: offline/);
});

test('pull options take the base colour as paper only when asked and there is one', () => {
  const c = tank();
  assert.equal(pa.pullOptions(c, { tint: '#eee', onBase: true }).tint, '#eee');
  c.settings.useBath = true;
  assert.equal(pa.pullOptions(c, { tint: '#eee', onBase: true }).tint, c.settings.bath);
  assert.equal(pa.pullOptions(c, { tint: '#eee', imperfection: '50' }).imperfection, 0.5);
});
