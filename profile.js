// Optional timing for slow tanks. While on, it totals where the time goes and, every couple of
// seconds, hands a summary to onSummary (the editor shows it on screen with ?profile=1) and posts it
// to /api/profile, which the local server appends to a file (the static site has no server, so there
// the post just fails quietly).
const WATCHED = ['_tine', '_tineBody', '_map', '_refine', '_simplify', '_compact', '_cutFilaments', '_stepFlow', '_flushGrowth', '_measureCoverage',
  '_absorbOutlines', '_refreshInk', '_renderInk', '_advanceMaps', '_advanceMapsGL', '_project'];
const EVERY_MS = 2000;

const empty = () => ({ ticks: 0, tickMs: 0, tickMax: 0, draws: 0, drawMs: 0, drawMax: 0, frames: 0, frameMax: 0, methods: {} });

function machine() {
  const out = { userAgent: navigator.userAgent, pixelRatio: devicePixelRatio, cores: navigator.hardwareConcurrency, memoryGB: navigator.deviceMemory };
  const gl = document.createElement('canvas').getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  out.gpu = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl ? 'hidden' : 'no webgl2';
  return out;
}

export function makeProfiler(describe, { onSummary = null, post = true } = {}) {
  let on = false;
  let now = empty();
  let next = 0;
  let sentMachine = false;
  let lastMachine = null;

  // Wraps a tank's own methods, which disappear with it. Time in one method can include another:
  // _map runs inside _tine, for example.
  const watch = (marble) => {
    if (marble._profiled) return;
    marble._profiled = true;
    for (const name of WATCHED) {
      const inner = marble[name];
      if (typeof inner !== 'function') continue;
      marble[name] = function timed(...args) {
        const start = performance.now();
        const result = inner.apply(this, args);
        const m = now.methods[name] ??= { ms: 0, calls: 0 };
        m.ms += performance.now() - start;
        m.calls++;
        return result;
      };
    }
  };

  const flush = (at) => {
    const round = (v) => Math.round(v * 10) / 10;
    const methods = Object.fromEntries(Object.entries(now.methods).map(([k, v]) => [k, { ms: round(v.ms), calls: v.calls }]));
    const body = {
      at: new Date().toISOString(), ...describe(), ...(sentMachine ? {} : { machine: machine() }),
      seconds: EVERY_MS / 1000, ticks: now.ticks, tickMs: round(now.tickMs), tickMax: round(now.tickMax),
      draws: now.draws, drawMs: round(now.drawMs), drawMax: round(now.drawMax),
      frames: now.frames, frameMax: round(now.frameMax), methods,
    };
    sentMachine = true;
    lastMachine = body.machine ?? lastMachine;
    now = empty();
    next = at + EVERY_MS;
    onSummary?.({ ...body, machine: lastMachine });
    if (post) fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  };

  return {
    set on(value) { on = value; now = empty(); next = performance.now() + EVERY_MS; sentMachine = false; },
    get on() { return on; },
    get machine() { return lastMachine; },
    watch(marble) { if (on) watch(marble); },
    tick(ms) { if (on) { now.ticks++; now.tickMs += ms; now.tickMax = Math.max(now.tickMax, ms); } },
    draw(ms) { if (on) { now.draws++; now.drawMs += ms; now.drawMax = Math.max(now.drawMax, ms); } },
    // The gap between frames also shows drawing the browser does after draw() returns.
    frame(gap, at) {
      if (!on) return;
      now.frames++;
      now.frameMax = Math.max(now.frameMax, gap);
      if (at >= next) flush(at);
    },
  };
}
