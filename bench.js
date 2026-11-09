// A one-second benchmark of this device (#54), for the profile summary (?profile=1) and, later, for
// caps that follow what a device can do rather than what it says it is. It times the two things the
// phone profile found dominate (research/2026-11-09-phone-profile.md): a Classic step on a fixed
// scene, and one draw of that scene at the tank canvas's real size. Runs in a worker
// (benchworker.js), so the page stays responsive; DOM-free, so node can run it too (draw is then null).
import { Marble, runScript } from './engine.js';

// Real time needs a step within one tick of the simulation (dt = 1/30 s).
const TICK_MS = 1000 / 30;

// The fixed scene, in the script API: a broom flick of drops and a comb through them, the same every
// time (seed 1).
const SCENE = `broom({ x: 50, y: 50, color: '#2c3a5a' });
broom({ x: 50, y: 50, color: '#7a2e24', at: 0.2 });
fullRake({ angle: 0, teeth: 12, speed: 20, at: 1 });`;
function scene() {
  const m = new Marble();
  m.seed = 1;
  runScript(m, SCENE);
  return m;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

// budgetMs: how long to spend stepping. canvas: { width, height } in device pixels, to time a draw
// at that size; left out (or without OffscreenCanvas), draw is null.
export function benchmark({ budgetMs = 1000, canvas = null } = {}) {
  const m = scene();
  const steps = [];
  const t0 = performance.now();
  while (performance.now() - t0 < budgetMs && m.busy) {
    const t = performance.now();
    m.step();
    steps.push(performance.now() - t);
  }
  const points = (m.polys ?? []).reduce((s, p) => s + p.n, 0);
  let draw = null;
  if (canvas && typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(canvas.width, canvas.height);
    const ctx = c.getContext('2d');
    // The same number of pixels as the tank's canvas, whichever way round the page shows it.
    const px = Math.sqrt((canvas.width * canvas.height) / (m.width * m.height));
    const times = [];
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      m.draw(ctx, px);
      times.push(performance.now() - t);
    }
    draw = { ms: +median(times).toFixed(1), width: canvas.width, height: canvas.height };
  }
  const stepMs = median(steps);
  return {
    stepMs: stepMs === null ? null : +stepMs.toFixed(2),
    steps: steps.length,
    points,
    // How many times faster than real time Classic could step this scene (over 1 keeps up).
    realTime: stepMs ? +(TICK_MS / stepMs).toFixed(2) : null,
    draw,
    seconds: +((performance.now() - t0) / 1000).toFixed(2),
  };
}

// In a page, on its own thread: one draw of the benchmark scene at the tank canvas's size, on an
// ordinary canvas (a worker's OffscreenCanvas draws far slower than the page's, so it isn't a fair
// stand-in). steps: how far to run the scene first (the worker's count), so the ink is the same.
export function drawBenchmark({ canvas, steps = 60 } = {}) {
  if (!canvas || typeof document === 'undefined') return null;
  const m = scene();
  for (let i = 0; i < steps && m.busy; i++) m.step();
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const ctx = c.getContext('2d');
  const px = Math.sqrt((canvas.width * canvas.height) / (m.width * m.height));
  const times = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    m.draw(ctx, px); // timed the way the tank's loop times its own draws (tankview.js)
    times.push(performance.now() - t);
  }
  return { ms: +median(times).toFixed(1), width: canvas.width, height: canvas.height };
}

// In a page: runs the benchmark in a worker and resolves with its result (or null if workers aren't
// available or it fails), without blocking the page.
export function benchmarkInWorker(options = {}) {
  return new Promise((resolve) => {
    let w;
    try { w = new Worker(new URL('./benchworker.js', import.meta.url), { type: 'module' }); } catch { resolve(null); return; }
    const done = (v) => { w.terminate(); resolve(v); };
    w.onmessage = (e) => done(e.data?.ok ? e.data.result : null);
    w.onerror = () => done(null);
    w.postMessage(options);
  });
}

// #54 (b): how dense the tank's canvas may be while ink moves on this device, from the startup
// draw benchmark at the canvas's full size (never from what the device says it is). A draw that fits
// DRAW_BUDGET_MS needs no cap (null). Otherwise fill time goes with the pixel count, so the density is
// scaled by √(budget / measured), in quarter steps, never below 1 or above the screen's own.
export const DRAW_BUDGET_MS = 12;
export function densityCapFor(draw, dpr) {
  if (!draw?.ms || !(dpr > 1) || draw.ms <= DRAW_BUDGET_MS) return null;
  const cap = Math.max(1, Math.floor(dpr * Math.sqrt(DRAW_BUDGET_MS / draw.ms) * 4) / 4);
  return cap < dpr ? cap : null;
}
