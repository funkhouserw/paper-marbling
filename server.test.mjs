// Run with: node --test server.test.mjs
// Exercises /api/chat against a fake upstream, so no real API key is needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';

const call = (name, args, id = 'c1') => ({ type: 'function_call', name, call_id: id, arguments: JSON.stringify(args) });
const say = (text) => ({ status: 200, body: { output: [{ type: 'message', content: [{ text }] }] } });
const tools = (...calls) => ({ status: 200, body: { output: calls } });

let seen = [];
let replies = [];
const upstream = createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  seen.push({ auth: req.headers.authorization, url: req.url, body: JSON.parse(raw) });
  const reply = replies.shift();
  res.writeHead(reply.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(reply.body));
});
await new Promise((r) => upstream.listen(0, '127.0.0.1', r));

process.env.OPENAI_BASE_URL = `http://127.0.0.1:${upstream.address().port}/v1`;
process.env.OPENAI_API_KEY = 'test-key';
const { server, applyTool, INSTRUCTIONS } = await import('./server.mjs');
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const post = (body, headers = {}) => fetch(`${base}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
const ask = (content, script) => post({ messages: [{ role: 'user', content }], script });

test.beforeEach(() => { seen = []; replies = []; });
test.after(() => { server.close(); upstream.close(); });

test('a turn sends the settings, the key and the current script', async () => {
  replies = [say('Done.')];
  const res = await ask('a red stone pattern', 'wait(1);');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { script: 'wait(1);', reply: 'Done.', edits: 0, model: 'gpt-6-luna' });
  const { auth, url, body } = seen[0];
  assert.equal(auth, 'Bearer test-key');
  assert.equal(url, '/v1/responses');
  assert.equal(body.model, 'gpt-6-luna');
  assert.deepEqual(body.reasoning, { effort: 'medium' });
  assert.equal(body.store, false);
  assert.deepEqual(body.prompt_cache_options, { mode: 'explicit' });
  assert.deepEqual(body.tools.map((t) => t.name), ['edit_script', 'replace_script', 'save_palette', 'use_palette']);
  assert.ok(body.input[0].content.includes('wait(1);') && body.input[0].content.includes('a red stone pattern'));
});

test('earlier messages are sent, and the script goes with the newest one', async () => {
  replies = [say('Sure.')];
  await post({
    messages: [
      { role: 'user', content: 'first' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'second' },
    ],
    script: 'settle();',
  });
  const { input } = seen[0].body;
  assert.deepEqual(input.slice(0, 2), [{ role: 'user', content: 'first' }, { role: 'assistant', content: 'ok' }]);
  assert.match(input[2].content, /settle\(\);[\s\S]*second/);
});

test('tool calls edit the script, and results go back with their reasoning', async () => {
  const reasoning = { type: 'reasoning', encrypted_content: 'abc' };
  replies = [
    { status: 200, body: { output: [reasoning, call('edit_script', { old_string: 'angle: 90', new_string: 'angle: 180' })] } },
    tools(call('edit_script', { old_string: 'teeth: 9', new_string: 'teeth: 5' }, 'c2')),
    say('Turned it left.'),
  ];
  const res = await ask('left, fewer teeth', 'fullRake({ angle: 90, teeth: 9 });');
  assert.deepEqual(await res.json(), {
    script: 'fullRake({ angle: 180, teeth: 5 });', reply: 'Turned it left.', edits: 2, model: 'gpt-6-luna',
  });
  const { input } = seen[2].body;
  assert.deepEqual(input[1], reasoning);
  assert.deepEqual(input.filter((i) => i.type === 'function_call_output').map((i) => [i.call_id, i.output]),
    [['c1', 'Edit applied.'], ['c2', 'Edit applied.']]);
});

test('a failed edit is reported to the model, which can try again', async () => {
  replies = [
    tools(call('edit_script', { old_string: 'nope', new_string: 'x' })),
    tools(call('edit_script', { old_string: 'wait(1)', new_string: 'wait(2)' }, 'c2')),
    say('Fixed.'),
  ];
  const data = await (await ask('slower', 'wait(1);')).json();
  assert.equal(data.script, 'wait(2);');
  assert.equal(data.edits, 1);
  assert.match(seen[1].body.input.at(-1).output, /not found/);
});

test('a turn that never finishes, or fails midway, changes nothing', async () => {
  replies = Array.from({ length: 12 }, () => tools(call('replace_script', { script: 'bad();' })));
  let res = await ask('loop', 'wait(1);');
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /too many tool calls/);
  assert.equal(seen.length, 12);

  replies = [tools(call('replace_script', { script: 'bad();' })), { status: 500, body: { error: { message: 'boom' } } }];
  res = await ask('fail', 'wait(1);');
  const data = await res.json();
  assert.equal(res.status, 502);
  assert.match(data.error, /boom/);
  assert.equal(data.script, undefined);
});

test('applyTool: exact single matches only, and syntax errors are flagged', () => {
  const edit = (from, to, script) => applyTool('edit_script', JSON.stringify({ old_string: from, new_string: to }), script);
  assert.equal(edit('b', 'x', 'abc').script, 'axc');
  assert.equal(edit('$&', '$$', 'a$&b').script, 'a$$b');
  assert.match(edit('a', 'x', 'a a').result, /matches 2 places/);
  assert.equal(edit('a', 'x', 'a a').script, 'a a');
  assert.match(edit('', 'x', '').result, /empty/);
  assert.match(edit('wait(1);', 'wait(', 'wait(1);').result, /syntax error/);
  assert.match(applyTool('edit_script', '{oops', 'a').result, /not valid JSON/);
  assert.equal(applyTool('rm_rf', '{}', 'a').ok, false);
  assert.equal(applyTool('replace_script', '{"script":"settle();"}', 'a').script, 'settle();');
});

test('a syntax check never runs the script', () => {
  globalThis.__ran = false;
  applyTool('replace_script', JSON.stringify({ script: 'globalThis.__ran = true;' }), '');
  assert.equal(globalThis.__ran, false);
  delete globalThis.__ran;
});

test('the instructions list the commands', () => {
  assert.match(INSTRUCTIONS, /print\(\{ contours, color, shimmer, at \}\)/);
  assert.match(INSTRUCTIONS, /compression: number; default 0/);
  assert.match(INSTRUCTIONS, /Turkish Ebru/);
  assert.match(INSTRUCTIONS, /Concentric rings/);
  assert.match(INSTRUCTIONS, /"Weave height": fullRake option waveAmp: slider 0 to 150, script value is the slider divided by 10/);
  assert.match(INSTRUCTIONS, /Stylus, "Tine thickness": stylus option D: 0=0\.3, .*100=3/);
  assert.match(INSTRUCTIONS, /Drop, "Drop size": drop option quantity:/);
});

test('upstream errors reach the user with their message', async () => {
  replies = [{ status: 404, body: { error: { message: 'model not found' } } }];
  const res = await ask('x');
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /model not found/);
});

test('bad requests and other websites are refused', async () => {
  assert.equal((await post({ messages: [{ role: 'user', content: 'x' }] }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await ask('  ')).status, 400);
  assert.equal((await post({ messages: [] })).status, 400);
  assert.equal((await post({ messages: [{ role: 'system', content: 'x' }] })).status, 400);
  assert.equal((await post({ messages: [{ role: 'assistant', content: 'x' }] })).status, 400);
  assert.equal((await fetch(`${base}/api/chat`)).status, 403);
});

test('serves the app but not the server source, dotfiles or parent paths', async () => {
  // / is the built editor, or a note saying how to build it, so a fresh checkout passes too.
  assert.ok([200, 503].includes((await fetch(`${base}/`)).status));
  assert.equal((await fetch(`${base}/classic/`)).status, 200);
  assert.equal((await fetch(`${base}/engine.js`)).status, 200);
  assert.equal((await fetch(`${base}/server.mjs`)).status, 404);
  assert.equal((await fetch(`${base}/.git/config`)).status, 404);
  assert.equal((await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`)).status, 404);
});

test('the editor is at /, the classic page at /classic/, and old /new/ links go to /', async () => {
  const old = await fetch(`${base}/new/`, { redirect: 'manual' });
  assert.equal(old.status, 301);
  assert.equal(old.headers.get('location'), '/');
  const bare = await fetch(`${base}/classic`, { redirect: 'manual' });
  assert.equal(bare.status, 301);
  assert.equal(bare.headers.get('location'), '/classic/');
  const classic = await fetch(`${base}/classic/`);
  assert.equal(classic.status, 200);
  assert.match(await classic.text(), /<script type="module" src="ui.js">/);
  assert.equal((await fetch(`${base}/classic/ui.js`)).status, 200);
  // / is the built editor, or a note saying how to build it.
  assert.ok([200, 503].includes((await fetch(`${base}/`)).status));
  assert.equal((await fetch(`${base}/assets/%2e%2e/%2e%2e/%2e%2e/server.mjs`)).status, 404);
  assert.equal((await fetch(`${base}/assets/%2e%2e/%2e%2e/.git/config`)).status, 404);
});

const inks = [{ color: '#112233', shimmer: 0.5 }];
const mine = { name: 'Mine', bath: '#000000', inks };

test('the assistant sees palettes, and a saved palette comes back to the browser once the turn succeeds', async () => {
  replies = [tools(call('save_palette', { ...mine, replace: false }), call('use_palette', { name: 'mine' }, 'c2')), say('Saved it.')];
  const res = await post({ messages: [{ role: 'user', content: 'keep this' }], script: 'a', palettes: [{ name: 'Old', bath: '#111111', inks }, { name: 'bad' }], currentPalette: mine });
  const body = await res.json();
  assert.deepEqual(body.paletteActions, [{ type: 'save', palette: mine }, { type: 'use', name: 'Mine' }]);
  const asked = seen.at(-2).body.input.at(-1).content ?? JSON.stringify(seen.at(-2).body.input);
  assert.ok(asked.includes('"Old"') && !asked.includes('"bad"') && asked.includes('Sidebar palette'));
});

test('a failed turn saves no palette', async () => {
  replies = [tools(call('save_palette', { ...mine, replace: false })), { status: 500, body: { error: { message: 'boom' } } }];
  const body = await (await post({ messages: [{ role: 'user', content: 'keep' }], script: '' })).json();
  assert.equal(body.paletteActions, undefined);
  assert.ok(body.error);
});

test('palette tools refuse bad colours, built-in names, unknown palettes, and replacing without being told', async () => {
  const { applyPaletteTool } = await import('./server.mjs');
  const fresh = () => ({ saved: [mine], actions: [] });
  const run = (name, args, s = fresh()) => ({ ...applyPaletteTool(name, JSON.stringify(args), s), s });
  assert.match(run('save_palette', { ...mine, name: 'New', bath: 'red', replace: false }).result, /bath/);
  assert.match(run('save_palette', { ...mine, name: 'old dutch', replace: true }).result, /built-in/);
  assert.match(run('save_palette', { ...mine, name: 'MINE', replace: false }).result, /already saved/);
  assert.equal(run('save_palette', { ...mine, name: 'MINE', replace: true }).ok, true);
  assert.match(run('use_palette', { name: 'nope' }).result, /no palette/);
  assert.equal(run('use_palette', { name: 'old dutch' }).s.actions[0].name, 'Old Dutch');
});

// fetch won't always send a made-up Host, so this goes through node:http.
const withHost = (path, host) => new Promise((resolve, reject) => {
  const req = request({ port: server.address().port, host: '127.0.0.1', path, method: 'POST', headers: { Host: host, 'Content-Type': 'application/json' } }, (res) => {
    res.resume();
    resolve(res.statusCode);
  });
  req.on('error', reject);
  req.end('{}');
});

test('the API only answers requests addressed to this computer', async () => {
  for (const path of ['/api/chat', '/api/profile']) {
    assert.equal(await withHost(path, 'rebound.example:8000'), 403, path);
    assert.equal(await withHost(path, 'localhost.example.com'), 403, path);
  }
  assert.equal(await withHost('/api/chat', 'localhost:8000'), 400);
  assert.equal(await withHost('/api/chat', '127.0.0.1:8000'), 400);
});
