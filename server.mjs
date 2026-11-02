// Local server for Marbler: serves the app and runs the assistant that edits marbling scripts.
//
//   node server.mjs     then open http://127.0.0.1:8000
//
// OPENAI_API_KEY comes from the environment or ../.env.local. The key stays here, never in
// the browser. Options, from the same places:
//   PORT (8000), MARBLE_MODEL (gpt-6-luna), MARBLE_EFFORT (medium), OPENAI_BASE_URL (https://api.openai.com/v1)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderReference } from './api.js';
import { PALETTES } from './palettes.js';
import { renderSliders } from './tools.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
// Real environment variables win over the file, which lives outside this repo.
try {
  process.loadEnvFile(join(ROOT, '..', '.env.local'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}
const PORT = Number(process.env.PORT || 8000);
const MODEL = process.env.MARBLE_MODEL || 'gpt-6-luna';
const EFFORT = process.env.MARBLE_EFFORT || 'medium';
const BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const MAX_BODY = 1024 * 1024; // the browser sends the whole chat each time
const MAX_ROUNDS = 12;

export const INSTRUCTIONS = `You are the assistant inside Marbler, a simulated ink-marbling tank. You chat with the user and change their JavaScript script.

How to work:
- Each user turn includes the current script. It is the only truth: the user may have changed it by hand since your last turn.
- Change the script only through tools. Never put code in your reply.
- Prefer edit_script, with one small call per change, and keep everything the user didn't ask to change, including comments and formatting. old_string must match exactly one place, so include enough surrounding text.
- Use replace_script only when the script is empty or the user wants to start over.
- If a tool reports an error, fix it and try again.
- Your final reply is one or two plain sentences saying what changed. If the user only asks a question, answer it without using tools. Scripts never run until the user presses Run, so don't say you ran it.

Script rules:
Scripts work on a 0 to 100 page: x is % of the tank's width from the left, y is % of its height from the top, so 50, 50 is the centre. All sizes and distances are % of the width, so circles stay round. Time is in seconds and angles in degrees. Every command below is already in scope. Commands with a { ... } signature take one options object, and every option is optional unless marked required.

${renderReference(PALETTES.map((p) => p.name))}

Timeline: drops start at the current time and don't advance it, so consecutive drops grow together. Tools advance it by their duration. Usually place drops, call settle(), then use tools.
Sidebar sliders vs script numbers: the user also has sidebar sliders with plain names, and those run 0 to 100 (a few, as the table shows, to 200) across a useful range. That number is not a script value. A script's numbers are the page units above. When the user quotes a slider, such as "tine thickness at 62", convert it with this table, estimating between stops, and don't write 62 into the script. Numbers the user gives for script options, or sizes without a slider name, are page units. Each line lists slider=script value:
${renderSliders()}

Techniques:
- Wake recipe: only the Wake simulator's bath keeps moving. For curls and long feathers, call viscosity({ value: 5 }) up to viscosity({ value: 60 }), first thing in the script, then rake fast with few teeth, for example fullRake({ angle: 0, teeth: 3, speed: 40 }), and use settle() so later actions wait for the flow to stop. Wriggle and stir in a thin bath give swirling, turbulent marbling. Viscosity 1000 stays crisp and still.
- Whorls: in Wake, viscosity({ value: 10 }) with flow({ friction: 0.05, coast: 120, push: 3 }) first, then a fast rake with few teeth, makes wakes roll up into spirals. A higher push is wilder and makes far more points.
- The user picks a simulator in the sidebar, so don't call openWater() unless they ask for a specific one. Under Spreading, bare water is the background, and ink spreads over it until it meets other ink. Under Classic, drops stay a fixed size and each pushes everything. To cover the surface, use enough or bigger drops; to keep bare water showing, use fewer or smaller ones.
- Stripes and chevrons: stripes() covers the tank in bands of colour. Follow it with fullRake at 90, then at 270 with an offset of half the tooth spacing, for chevrons, and a fine fullRake at 0 for feathers. Use paint() for single lines.
- Concentric rings or a target, including any request to stack or overlay drops on the same spot: drops that start together at one spot just cover each other, so only the last colour shows. Place one drop per spot for the outermost colour, call settle(), then repeat for each colour moving inward. With a grid of targets, loop over the colours on the outside and the positions on the inside, with settle() after each colour. Later drops push the earlier rings outward.

Colours are CSS strings; #rrggbbaa gives translucent ink. Normal JavaScript loops and arithmetic are fine. For equal spacing both ways, a y step is the x step divided by ASPECT. Keep to about 150 drops and 60 rake teeth so that it runs smoothly. Use nothing outside this list: no other functions, no DOM and no network.`;

export const TOOLS = [
  {
    type: 'function',
    name: 'edit_script',
    description: 'Replaces one exact piece of the current script. This is the normal way to change a script.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        old_string: { type: 'string', description: 'Exact text to replace. It must appear exactly once in the script.' },
        new_string: { type: 'string', description: 'The text to put in its place.' },
      },
      required: ['old_string', 'new_string'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'replace_script',
    description: 'Replaces the whole script. Only for an empty script or when the user wants to start over.',
    strict: true,
    parameters: {
      type: 'object',
      properties: { script: { type: 'string', description: 'The complete new script.' } },
      required: ['script'],
      additionalProperties: false,
    },
  },
];

// Compiles without running: scripts only ever run in the browser, away from the API key.
function syntaxNote(script) {
  try {
    new Function(script);
    return '';
  } catch (err) {
    return ` The script now has a syntax error: ${err.message}`;
  }
}

// Applies one tool call. A bad call leaves the script alone and tells the model why.
export function applyTool(name, rawArgs, script) {
  let args;
  try {
    args = JSON.parse(rawArgs);
  } catch {
    return { script, ok: false, result: 'Error: the arguments were not valid JSON.' };
  }
  if (name === 'replace_script' && typeof args.script === 'string') {
    return { script: args.script, ok: true, result: `Script replaced.${syntaxNote(args.script)}` };
  }
  if (name === 'edit_script' && typeof args.old_string === 'string' && typeof args.new_string === 'string') {
    const { old_string: from, new_string: to } = args;
    if (!from) return { script, ok: false, result: 'Error: old_string is empty. Use replace_script on an empty script.' };
    const count = script.split(from).length - 1;
    if (count !== 1) {
      const why = count ? `matches ${count} places; include more surrounding text` : 'was not found; copy it exactly from the script';
      return { script, ok: false, result: `Error: old_string ${why}.` };
    }
    const next = script.split(from).join(to);
    return { script: next, ok: true, result: `Edit applied.${syntaxNote(next)}` };
  }
  return { script, ok: false, result: `Error: bad call to ${name}.` };
}

function replyText(data) {
  const text = data.output_text
    ?? (data.output || []).flatMap((o) => o.content || []).map((c) => c.text || '').join('');
  return text.trim();
}

// Runs the model until it stops calling tools. Nothing reaches the browser unless the whole turn succeeds.
async function chat(messages, startScript) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { status: 503, body: { error: 'No API key: add OPENAI_API_KEY to ../.env.local and restart the server.' } };
  const last = messages[messages.length - 1];
  const input = [
    ...messages.slice(0, -1),
    { role: 'user', content: `Current script:\n${startScript || '(empty)'}\n\nRequest: ${last.content}` },
  ];
  let script = startScript;
  let edits = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch(`${BASE_URL}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      // Explicit mode with no breakpoints means no cache reads or writes (GPT-5.6 and later).
      // With store off, reasoning has to travel with the tool calls in encrypted form.
      body: JSON.stringify({
        model: MODEL, reasoning: { effort: EFFORT }, instructions: INSTRUCTIONS, input, tools: TOOLS,
        parallel_tool_calls: false,
        store: false, include: ['reasoning.encrypted_content'],
        prompt_cache_options: { mode: 'explicit' },
      }),
      signal: AbortSignal.timeout(120000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: 502, body: { error: `${MODEL}: ${data.error?.message || `HTTP ${res.status}`}` } };
    }
    const output = data.output || [];
    const calls = output.filter((o) => o.type === 'function_call');
    if (!calls.length) {
      const reply = replyText(data);
      if (!reply && !edits) return { status: 502, body: { error: `${MODEL} returned no text.` } };
      return { status: 200, body: { script, reply: reply || 'Script updated.', edits, model: MODEL } };
    }
    input.push(...output);
    for (const call of calls) {
      const applied = applyTool(call.name, call.arguments, script);
      script = applied.script;
      if (applied.ok) edits++;
      input.push({ type: 'function_call_output', call_id: call.call_id, output: applied.result });
    }
  }
  return { status: 502, body: { error: `${MODEL} made too many tool calls, so its changes were dropped.` } };
}

const validMessages = (m) => Array.isArray(m) && m.length > 0
  && m.every((x) => ['user', 'assistant'].includes(x?.role) && typeof x.content === 'string')
  && m[m.length - 1].role === 'user' && m[m.length - 1].content.trim() !== '';

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/chat') {
      // Other websites open in the browser must not be able to spend the key.
      const origin = req.headers.origin;
      if (req.method !== 'POST' || (origin && new URL(origin).host !== req.headers.host)) {
        return json(res, 403, { error: 'Forbidden' });
      }
      if (!(req.headers['content-type'] || '').startsWith('application/json')) {
        return json(res, 415, { error: 'Expected JSON' });
      }
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > MAX_BODY) return json(res, 413, { error: 'Request too large' });
      }
      const { messages, script } = JSON.parse(raw);
      if (!validMessages(messages)) return json(res, 400, { error: 'Expected messages ending in a user message' });
      const { status, body } = await chat(messages, typeof script === 'string' ? script : '');
      return json(res, status, body);
    }
    const rel = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    const file = join(ROOT, rel);
    const name = rel.split(sep).pop();
    if (!file.startsWith(ROOT) || !MIME[extname(file)] || rel.split(sep).some((p) => p.startsWith('.')) || name === 'server.mjs') {
      res.writeHead(404);
      return res.end('Not found');
    }
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)], 'Cache-Control': 'no-store' });
    return res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') { res.writeHead(404); return res.end('Not found'); }
    return json(res, 500, { error: String(err.message || err) });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Marbler: http://127.0.0.1:${PORT}  model: ${MODEL}  key: ${process.env.OPENAI_API_KEY ? 'set' : 'missing'}`);
  });
}
