// Run with: node --test server.test.mjs
// Exercises /api/chat against a fake upstream, so no real API key is needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

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
  assert.deepEqual(body.tools.map((t) => t.name), ['edit_script', 'replace_script']);
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
  assert.match(INSTRUCTIONS, /Stylus, "Tine thickness": stylus option D: 0=0\.1, .*100=4/);
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
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/engine.js`)).status, 200);
  assert.equal((await fetch(`${base}/server.mjs`)).status, 404);
  assert.equal((await fetch(`${base}/.git/config`)).status, 404);
  assert.equal((await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`)).status, 404);
});
