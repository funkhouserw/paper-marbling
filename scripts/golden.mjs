// Review of every example against a reference (request #50). Each example runs headless, the way the
// Examples menu runs it (its own simulator, a fresh tank), for at most a fixed number of steps, and
// its outlines are summed up as features (golden-metrics.mjs: line directions and length, shape
// count, colour shares, shape sizes, overall and per tile). The reference for an example is its
// features on seed 1, plus how far apart seeds 1 to 4 land (the median over every pair, measure by
// measure): that spread is the example's own tolerance. An example that moves more than 3× its spread is FLAGGED, not failed, and the review
// puts its reference and new picture side by side for a person to decide. Only hard errors fail (an
// exception, no ink, still moving at the step limit).
//
//   node scripts/golden.mjs                       every example, compared with golden/
//   node scripts/golden.mjs --only "Feather plumes,Stormont"
//   node scripts/golden.mjs --jobs 4 --out /tmp/review
//   node scripts/golden.mjs --refresh --only Stormont   make the current look the reference, on
//                                                      purpose, after a change you meant (seeds 1–4)
//   node scripts/golden.mjs --unpinned classic        examples with no simulator of their own, in Classic
//   node scripts/golden.mjs --root /tmp/old-worktree --only "Feather plumes" --out /tmp/at-old
//                                                      render another checkout (to bisect), compared
//                                                      with this checkout's references
//
// The review is <out>/report.html (open it in a browser), <out>/report.json, and for each flagged
// example <out>/review/<name>.png (reference left, now right). Film and Wake examples take a minute
// or more each, so this runs before a merge or overnight, not in `npm test`.
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN = join(here, 'golden');
const args = process.argv.slice(2);
const opt = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
// The code to render: this checkout, or another with --root.
const root = opt('--root') ?? here;
const WIDTH = 320;          // pixels across the pictures for people
const MAX_STEPS = 6000;     // simulation steps after the script, at most; still moving after is an error
const TIMEOUT_S = 1500;     // a hard stop per run

export const slug = (name) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- One example on one seed, in its own process --------------------------------------------
async function renderOne(name, seed, out) {
  const { TankController } = await import(join(root, 'controller.js'));
  const { EXAMPLES, EXAMPLE_SIMULATOR } = await import(join(root, 'examples.js'));
  const { Resvg } = await import('@resvg/resvg-js'); // from this checkout, whatever the root
  const { features } = await import('./golden-metrics.mjs');
  // An example without a simulator of its own runs in whichever is chosen; the editor starts on
  // Wake (fast).
  const simulator = EXAMPLE_SIMULATOR[name] ?? opt('--unpinned') ?? 'wakefast';
  const c = new TankController({ settings: { simulator } });
  c.clear();
  c.marble.seed = seed; // the example's own tank is made from this one, seed and all
  const t0 = performance.now();
  const failed = c.runScript(EXAMPLES[name], { clearing: true });
  const m = c.marble;
  let steps = 0;
  while (!failed && m.busy && steps < MAX_STEPS) { m.step(); steps++; }
  const f = features(m.polys ?? [], m.width, m.height);
  const base = join(out, `${slug(name)}.s${seed}`);
  const png = new Resvg(m.toSVG(), { fitTo: { mode: 'width', value: WIDTH }, background: 'white' }).render().asPng();
  writeFileSync(`${base}.png`, png);
  const grid = !m.polys?.length && Boolean(m.grid); // Grid ink keeps colour on a grid, not outlines
  const hard = failed ? `the script failed: ${failed}`
    : m.busy ? `still moving after ${MAX_STEPS} steps`
    : !m.polys?.length && !grid ? 'no ink in the tank'
    : [f.length, ...f.orient].some((v) => !Number.isFinite(v)) ? 'a feature came out NaN' : null;
  return {
    name, seed, simulator, steps, shapes: m.polys?.length ?? 0, grid,
    seconds: +((performance.now() - t0) / 1000).toFixed(1), error: hard, features: f,
  };
}

if (args[0] === '--one') {
  process.stdout.write(JSON.stringify(await renderOne(args[1], Number(args[2]), args[3])));
  process.exit(0);
}

// ---- Everything ------------------------------------------------------------------------------
const { EXAMPLES } = await import(join(root, 'examples.js'));
const only = opt('--only')?.split(',').map((s) => s.trim());
const missing = only?.filter((n) => !(n in EXAMPLES)) ?? [];
if (missing.length) { console.error(`No example called: ${missing.join(', ')}`); process.exit(2); }
const names = Object.keys(EXAMPLES).filter((n) => !only || only.includes(n));
const refresh = args.includes('--refresh');
// A refresh renders seeds 1 to --seeds (4 by default); an example whose seeds 1 and 2 come out the
// same has no random layout, so it skips the rest.
const SEEDS = Math.max(2, Number(opt('--seeds') ?? 4));
const seeds = refresh ? [1, 2] : [1];
const jobs = Number(opt('--jobs') ?? Math.max(1, Math.floor(availableParallelism() / 2)));
const out = opt('--out') ?? join(here, 'golden-out');
mkdirSync(join(out, 'review'), { recursive: true });

const passOn = ['--root', root, ...(opt('--unpinned') ? ['--unpinned', opt('--unpinned')] : [])];
const run = (name, seed) => new Promise((done) => {
  const t0 = Date.now();
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--one', name, String(seed), out, ...passOn], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_S * 1000);
  child.on('close', (code) => {
    clearTimeout(timer);
    try { done(JSON.parse(stdout)); } catch {
      done({ name, seed, error: code === null ? `stopped after ${TIMEOUT_S} s` : (stderr.trim().split('\n').pop() || `exit ${code}`), seconds: (Date.now() - t0) / 1000 });
    }
  });
});

const runs = [];
const runAll = (queue) => Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  while (queue.length) {
    const [name, seed] = queue.shift();
    const r = await run(name, seed);
    runs.push(r);
    console.log(`${r.error ? '✖' : '·'} ${name}${refresh ? ` (seed ${seed})` : ''}: ${r.seconds} s${r.steps !== undefined ? `, ${r.steps} steps, ${r.shapes} shapes` : ''}${r.error ? `: ${r.error}` : ''}`);
  }
}));
await runAll(names.flatMap((name) => seeds.map((seed) => [name, seed])));
const runOf = (name, seed) => runs.find((r) => r.name === name && r.seed === seed);
const { distances, judge, spreadOf } = await import('./golden-metrics.mjs');
const seedsOf = (name) => runs.filter((r) => r.name === name).sort((a, b) => a.seed - b.seed);
if (refresh && SEEDS > 2) {
  const random = names.filter((name) => {
    const a = runOf(name, 1), b = runOf(name, 2);
    return !a.error && !b.error && JSON.stringify(a.features) !== JSON.stringify(b.features);
  });
  await runAll(random.flatMap((name) => Array.from({ length: SEEDS - 2 }, (_, k) => [name, k + 3])));
}

let commit = null;
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root }).toString().trim(); } catch { /* not a checkout */ }
const hardErrors = runs.filter((r) => r.error);

if (refresh) {
  mkdirSync(GOLDEN, { recursive: true });
  for (const name of names) {
    const all = seedsOf(name), a = all[0];
    if (all.some((r) => r.error)) { console.log(`not refreshed, it failed: ${name}`); continue; }
    const { spread, range } = spreadOf(all.map((r) => r.features));
    writeFileSync(join(GOLDEN, `${slug(name)}.json`), `${JSON.stringify({
      name, commit, date: new Date().toISOString().slice(0, 10), simulator: a.simulator, steps: a.steps, shapes: a.shapes,
      grid: a.grid, seeds: all.length, spread, range, features: a.features,
    })}\n`);
    copyFileSync(join(out, `${slug(name)}.s1.png`), join(GOLDEN, `${slug(name)}.png`));
  }
  console.log(`References refreshed for ${names.length - new Set(hardErrors.map((r) => r.name)).size} example(s) at ${commit}.`);
  process.exit(hardErrors.length ? 1 : 0);
}

// ---- Compare with the references --------------------------------------------------------------
const { PNG } = await import('pngjs');
// Two pictures side by side, a white gap between, for the review.
const sideBySide = (left, right) => {
  const a = PNG.sync.read(readFileSync(left)), b = PNG.sync.read(readFileSync(right));
  const gap = 8, w = a.width + gap + b.width, h = Math.max(a.height, b.height);
  const png = new PNG({ width: w, height: h });
  png.data.fill(255);
  PNG.bitblt(a, png, 0, 0, a.width, a.height, 0, 0);
  PNG.bitblt(b, png, 0, 0, b.width, b.height, a.width + gap, 0);
  return PNG.sync.write(png);
};
const results = names.map((name) => {
  const r = runOf(name, 1);
  const refFile = join(GOLDEN, `${slug(name)}.json`);
  const ref = existsSync(refFile) ? JSON.parse(readFileSync(refFile, 'utf8')) : null;
  const res = { name, simulator: r.simulator, seconds: r.seconds, steps: r.steps, shapes: r.shapes, reference: ref && { commit: ref.commit, date: ref.date, simulator: ref.simulator } };
  if (r.error) return { ...res, error: r.error, flagged: true, why: [r.error] };
  if (!ref) return { ...res, flagged: true, why: ['no reference yet: refresh it once it looks right'] };
  if (ref.simulator !== r.simulator) return { ...res, flagged: true, why: [`runs in ${r.simulator} now, its reference in ${ref.simulator}`] };
  if (r.grid) return { ...res, flagged: false, why: [], note: 'Grid ink keeps no outlines: compare the pictures by eye' };
  return { ...res, ...judge(ref.features, r.features, ref.spread) };
});
for (const r of results) {
  const now = join(out, `${slug(r.name)}.s1.png`), ref = join(GOLDEN, `${slug(r.name)}.png`);
  if (r.flagged && existsSync(now) && existsSync(ref)) writeFileSync(join(out, 'review', `${slug(r.name)}.png`), sideBySide(ref, now));
  if (existsSync(ref)) copyFileSync(ref, join(out, `${slug(r.name)}.ref.png`));
}

const flagged = results.filter((r) => r.flagged);
writeFileSync(join(out, 'report.json'), `${JSON.stringify({ commit, date: new Date().toISOString(), results }, null, 1)}\n`);
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const img = (file, caption) => (existsSync(join(out, file)) ? `<figure><img src="${file}"><figcaption>${esc(caption)}</figcaption></figure>` : '');
const row = (r) => `<section class="${r.error ? 'error' : r.flagged ? 'flag' : 'ok'}"><h2>${esc(r.name)} <small>${esc(r.simulator ?? '')}${r.reference ? `, reference ${esc(r.reference.commit)} (${esc(r.reference.date)})` : ''}</small></h2>
<p>${r.error ? `<b>Failed:</b> ${esc(r.error)}` : r.flagged ? `<b>Look at this:</b> ${esc(r.why.join('; '))}` : esc(r.note ?? 'Within its own seed-to-seed spread.')}${r.worst ? ` · furthest: ${esc(r.worst.measure)}, ${r.worst.times}× its spread` : ''}${r.noisy?.length ? ` · noisy reference (${esc(r.noisy.join(', '))} at the cap)` : ''} · ${r.seconds} s, ${r.steps ?? '–'} steps, ${r.shapes ?? '–'} shapes</p>
<div class="imgs">${img(`${slug(r.name)}.ref.png`, 'reference')}${img(`${slug(r.name)}.s1.png`, `now (${commit ?? ''})`)}</div></section>`;
writeFileSync(join(out, 'report.html'), `<!doctype html><meta charset="utf-8"><title>Marbler examples review, ${esc(commit ?? '')}</title>
<style>body{font:14px system-ui;margin:2em;background:#fafaf7}section{margin:1.5em 0;padding:.5em 1em;border-left:4px solid #9b9}section.flag{border-color:#d90;background:#fff9ee}section.error{border-color:#d33;background:#fff0ee}h2{font-size:16px;margin:.3em 0}small{color:#777;font-weight:normal}.imgs{display:flex;gap:12px;flex-wrap:wrap}figure{margin:0}figcaption{color:#777;font-size:12px}img{width:${WIDTH}px;border:1px solid #ddd}</style>
<h1>Examples review at ${esc(commit ?? '?')}</h1><p>${flagged.length} of ${results.length} flagged for a look, ${hardErrors.length} failed. Flagged isn't failed: if the change was meant, refresh that example's reference (<code>node scripts/golden.mjs --refresh --only "Name"</code>).</p>
${[...results.filter((r) => r.error), ...flagged.filter((r) => !r.error), ...results.filter((r) => !r.flagged)].map(row).join('\n')}`);
console.log(`\n${flagged.length} of ${results.length} flagged for a look${flagged.length ? `: ${flagged.map((r) => `${r.name} (${r.why.join('; ')})`).join('\n  ')}` : ''}.\nReview: ${join(out, 'report.html')}`);
process.exit(hardErrors.length ? 1 : 0);
