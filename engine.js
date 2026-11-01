// Marbling engine: no DOM, usable from the browser or Node.
//
// Units: mm, seconds, mL, degrees. Origin at the tank centre, +y up.
//
// Every drop is an outline polygon. Each simulation tick, every active process
// (a growing drop, a moving rake, ...) deforms all outlines by a small amount.
// Because deformations are incremental, processes can overlap in time.
//
// The deformation formulas (drop spread, stylus, stir, jiggle, wriggle) follow
// pst-marble by Aubrey Jaffer (LPPL 1.3c), reworked here to apply incrementally.
// The vortex uses the Lamb-Oseen velocity field. This is a modified JavaScript
// reimplementation, not the original package.

import { PALETTES, palette } from './palettes.js';
import { COMMANDS, toMm, fromMm } from './api.js';
import { planDots, colourDots } from './fill.js';

const DEG = Math.PI / 180;
const GROWTH_DONE = 0.015; // a drop rests when this fraction of its area remains: the rest is too small to watch
const COMPACT_TOLERANCE = 0.04; // mm; about a tenth of a pixel in a 3000 pixel print
const DETAIL_BUDGET = 60000; // outline points before detail starts to reduce
const MAX_DETAIL = 4;
// With spreading on, ink covers the surface: a drop keeps growing while any of its edge
// faces water, up to its quantity times its spreading. Fully surrounded by ink, it only
// gets this share of that, which is all it has to push the ink around it outward.
const AGAINST_INK_SHARE = 0.25;
const NO_WATER_LEFT = 0.03; // the share of a drop's edge facing water below which it rests
// A full tank never quite runs out of water, so spreading also ends after this many times
// a drop's growth time. Without it, drops keep pushing each other and settle() never ends.
const SPREAD_TIME_LIMIT = 3;
// How far past its own edge a drop's push carries through ink, in mm. Without a limit, once
// the tank is full of ink every drop moves all of it, which is slow and never calms down.
const PUSH_THROUGH_INK = 60;
// How far past the edge of the ink a drop's push still carries, in mm. Bare water carries no
// pressure, so this is only long enough to keep the outlines from folding. A longer push
// makes drops shove each other away before they touch, leaving a film of water between them.
const PUSH_FADE = 1.5;
// Directions around a drop in which its push knows exactly where the ink ends.
const PUSH_DIRECTIONS = 48;

// How fast ink at a wide tine's centre moves, compared with the tine.
const TINE_SLIP = 0.8;

// Straight pieces per weave of a rake, for both its path and its preview.
export const WEAVE_POINTS = 32;

// Weave shapes: for t from 0 to 1 along one weave, [along, across], where along is in weave
// lengths and across runs from -1 to 1 in weave heights. Overhangs and loops come from along.
const TAU = 2 * Math.PI;
// A shape drawn by hand: points [x, y] across one weave, x from 0 to 1, joined by a smooth
// curve that repeats. Drawing out of order in x is what makes overhangs and curls.
function drawn(points) {
  const n = points.length;
  const at = (i) => {
    const k = Math.floor(i / n);
    const [x, y] = points[i - k * n];
    return [x + k, y];
  };
  return (t) => {
    const u = t * n;
    const i = Math.floor(u);
    const f = u - i;
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const blend = (a, b, c, d) => 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f);
    return [blend(p0[0], p1[0], p2[0], p3[0]) - t, Math.max(-1, Math.min(1, blend(p0[1], p1[1], p2[1], p3[1])))];
  };
}

export const WEAVE_SHAPES = {
  straight: () => [0, 0],
  sine: (t) => [0, Math.sin(TAU * t)],
  scallop: (t) => [0, 2 * Math.abs(Math.sin(Math.PI * t)) - 1],
  points: (t) => [0, 1 - 2 * Math.abs(Math.sin(Math.PI * t))],
  zigzag: (t) => [0, 1 - 4 * Math.abs(((t + 0.25) % 1) - 0.5)],
  // A long rise and a quick drop.
  fin: (t) => [0, t < 0.8 ? -1 + 2 * Math.sin((Math.PI / 2) * (t / 0.8)) : 1 - 2 * ((t - 0.8) / 0.2)],
  // The crest leans forward and hangs over the trough.
  breaker: (t) => {
    const a = TAU * t;
    return [0.16 * Math.sin(a) + 0.09 * Math.sin(2 * a), -Math.cos(a)];
  },
  // Traced from the reference: a rising line over a crest that winds into a spiral. The tine
  // has to come back out, so it retraces the spiral on its way to the next wave.
  spiral: drawn([[0, -0.6], [0.2, -0.1], [0.4, 0.55], [0.6, 1], [0.82, 0.9], [0.95, 0.35], [0.88, -0.35], [0.66, -0.72], [0.48, -0.45], [0.45, -0.02], [0.58, 0.22], [0.7, 0.05], [0.58, 0.22], [0.45, -0.02], [0.48, -0.45], [0.66, -0.72], [0.85, -0.75]]),
  // Traced from the reference: a surf wave. From the tip it runs over the crest, down into the
  // trough, then up and under the next crest, whose tip overhangs it.
  wave: drawn([[0, 0.95], [0.03, 0.98], [0.12, 1], [0.25, 0.93], [0.42, 0.35], [0.6, -0.55], [0.78, -1], [0.92, -0.85], [1.05, -0.35], [1.11, 0.2], [1.1, 0.62], [1.04, 0.92], [1.01, 0.95]]),
  // Overlapping arches, like a row of shells.
  shell: drawn([[0, 0.1], [0.15, 0.8], [0.45, 1], [0.8, 0.75], [1, 0.15], [0.95, -0.4], [0.65, -0.65], [0.3, -0.5], [0.12, -0.15]]),
  // A long low slide with a small flick at the end.
  flick: drawn([[0, -0.1], [0.3, -0.35], [0.6, -0.75], [0.82, -0.95], [0.92, -0.45], [0.8, 0.1], [0.72, 0.5], [0.85, 0.75], [1, 0.2]]),
  // A deep teardrop hanging from each crest.
  hook: drawn([[0, 0.9], [0.2, 0.3], [0.32, -0.5], [0.5, -0.95], [0.68, -0.55], [0.58, -0.1], [0.42, -0.3], [0.55, -0.6], [0.78, 0.2], [1, 0.9]]),
  // Each weave loops right back over itself.
  curl: (t) => {
    const a = TAU * t;
    return [-0.42 * Math.sin(a), -Math.cos(a)];
  },
};

// Tiling textures for metallic ink: fine flakes, and a broad soft sheen.
let shimmerTiles = null;
function makeShimmerTiles() {
  const tile = (size, paint) => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    paint(img.data, size);
    ctx.putImageData(img, 0, 0);
    return c;
  };
  const rnd = mulberry32(7);
  const flakes = tile(256, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      const r = rnd();
      const v = r > 0.93 ? 255 : r > 0.7 ? 190 : 110;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v * 0.94;
      d[i + 3] = r > 0.93 ? 255 : r > 0.7 ? 70 : 25;
    }
  });
  const sheen = tile(512, (d, size) => {
    const k = (2 * Math.PI) / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const w = Math.sin(k * (x + 2 * y)) + 0.6 * Math.sin(k * (3 * x - y) + 1) + 0.4 * Math.sin(k * (2 * x + 5 * y) + 2);
        const i = (y * size + x) * 4;
        const v = Math.max(0, Math.min(1, 0.5 + w / 4));
        d[i] = 255;
        d[i + 1] = 245;
        d[i + 2] = 220;
        d[i + 3] = v * v * 170;
      }
    }
  });
  return { flakes, sheen };
}

export const isTranslucent = (color) => /^#(.{4}|.{8})$|^(rgba|hsla)\(/.test(color) && !/^#.{3}f$|^#.{6}ff$/i.test(color);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Final area (mm^2) of a quantity (mL) spread over a film of thickness h (mm).
export function maxRadius(quantity, film) {
  return Math.sqrt((quantity * 1000) / (film * Math.PI));
}

export class Marble {
  constructor({ width = 1000, height = 700, viscosity = 1000, bath = '#f4efe2',
                film = 0.1, dt = 1 / 30, seed = 1, maxVertices = 400000 } = {}) {
    Object.assign(this, { width, height, viscosity, bath, film, dt, seed, maxVertices });
    this.maxEdge = Math.max(width, height) / 400;
    this.reset();
  }

  // Clears the tank and the recorded log.
  reset() {
    this.time = 0;
    this.cursor = 0;
    this.pending = [];
    this.active = [];
    this.polys = [];
    this.sources = []; // every drop that has landed; centres move with the ink
    this.gates = []; // settle() points waiting for the tank to rest, each holding later actions
    this.orderGap = null; // seconds between actions while inOrder() is in force
    this.openWaterOn = false;
    this._live = false;
    this.wallsOn = false;
    this.growth = [];
    this.landing = [];
    this.fieldAbove = 2e6; // point-source pairs per push before switching to the coarse field
    this.detail = 1;
    this.nextGroup = 1;
    this.sheenPhase = 0;
    this.log = [];
    this.tick = 0;
    this.capped = false;
    this.rngState = this.seed >>> 0;
  }

  random() {
    this.rngState = (this.rngState + 0x6d2b79f5) >>> 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // A complete copy of the tank, including ink still growing and anything queued. Fields
  // starting with _ are only caches.
  saveState() {
    const state = {};
    for (const [key, value] of Object.entries(this)) {
      if (!key.startsWith('_') && typeof value !== 'function') state[key] = value;
    }
    return structuredClone(state);
  }

  loadState(state) {
    for (const key of Object.keys(this)) if (key.startsWith('_')) delete this[key];
    Object.assign(this, structuredClone(state));
    return this;
  }

  // ---- Scheduling ------------------------------------------------------

  // Where the timeline currently is. After a settle() it counts from that settle point.
  get _now() { return this.gates.length ? this.cursor : Math.max(this.cursor, this.time); }

  _schedule(fn, args, op, duration = 0, blocking = false) {
    const entry = { fn, args: { ...args } };
    const held = this.gates.length && !this._live;
    const at = args.at ?? this._now;
    if (held) {
      op.delay = at;
      this.gates.at(-1).ops.push(op);
    } else {
      op.at = at;
      this.pending.push(op);
      this.pending.sort((a, b) => a.at - b.at);
      entry.args.at = at;
      if (this._live) entry.live = true;
    }
    this.log.push(entry);
    if (args.at === undefined) {
      if (this.orderGap !== null) this.cursor = at + duration + this.orderGap;
      else if (blocking) this.cursor = at + duration;
    }
    return op;
  }

  // Runs fn so that its actions start at the times given, even with a settle() waiting.
  // The UI uses this for actions the person performs directly.
  live(fn) {
    this._live = true;
    try { return fn(); } finally { this._live = false; }
  }

  // Replays log entries, reproducing the session they came from.
  replay(entries) {
    for (const { fn, args, live } of entries) {
      if (live) this.live(() => this[fn](args));
      else this[fn](args);
    }
    return this;
  }

  // Moves the timeline on. Takes seconds, or { seconds } when replayed from a log.
  wait(s) {
    const seconds = typeof s === 'object' ? s.seconds : s;
    this.cursor = this._now + seconds;
    if (this.gates.length) this.log.push({ fn: 'wait', args: { seconds } });
    return this;
  }

  // Everything after this waits until the tank is at rest: every drop has finished
  // growing and every earlier tool has finished moving. Later times count from then.
  settle() {
    this.gates.push({ ops: [] });
    this.cursor = 0;
    this.log.push({ fn: 'settle', args: {} });
    return this;
  }

  // From here on, each action starts gap seconds after the previous one finishes.
  inOrder({ gap = 0.5 } = {}) {
    this.orderGap = gap;
    this.log.push({ fn: 'inOrder', args: { gap } });
    return this;
  }

  // From here on, drops start together again (the default).
  allAtOnce() {
    this.orderGap = null;
    this.log.push({ fn: 'allAtOnce', args: {} });
    return this;
  }

  // Releases the next settle() once the tank is at rest.
  _releaseGates() {
    while (this.gates.length && !this.pending.length && !this.active.length) {
      const gate = this.gates.shift();
      for (const op of gate.ops) {
        op.at = this.time + op.delay;
        this.pending.push(op);
      }
      this.pending.sort((a, b) => a.at - b.at);
      if (!this.gates.length) this.cursor += this.time;
    }
  }

  // Everything scheduled but not yet started, including actions held by a settle().
  get queued() { return [...this.pending, ...this.gates.flatMap((g) => g.ops)]; }

  get busy() { return this.pending.length > 0 || this.active.length > 0 || this.gates.length > 0; }

  // Turns open-water spreading on or off. While on, a drop spreads further the more of
  // its edge faces open water and holds back once it meets other ink. Water gives way
  // instead of passing the push across the tank, so drops expand until they touch.
  openWater({ on = true, at } = {}) {
    const args = { on };
    if (at !== undefined) args.at = at;
    return this._schedule('openWater', args, { kind: 'openWater', on });
  }

  // Turns hard edges on or off. While on, ink stays inside the rectangle: drops
  // flatten against the walls and push back, however far they grow.
  walls({ on = true, at } = {}) {
    const args = { on };
    if (at !== undefined) args.at = at;
    return this._schedule('walls', args, { kind: 'walls', on });
  }

  // Prints a shape as ink that never grows but moves with everything else.
  // contours: closed loops, each a flat [x0, y0, x1, y1, ...] array in mm.
  // Together they form one even-odd shape, so inner loops become holes.
  print({ contours, color = '#1a1a1a', shimmer = 0, at } = {}) {
    if (typeof color === 'object') ({ color, shimmer = 0 } = color); // a palette ink
    const loops = contours.map((c) => Array.from(c));
    const args = { contours: loops, color, shimmer };
    if (at !== undefined) args.at = at;
    return this._schedule('print', args, { kind: 'print', contours: loops, color, shimmer });
  }

  // Named apart from the `bath` colour it sets. null means no colour at all.
  setBath({ color = null } = {}) {
    const hex = color && typeof color === 'object' ? color.color : color;
    this.bath = hex ?? 'rgba(0,0,0,0)';
    this.log.push({ fn: 'setBath', args: { color: hex } });
    return this;
  }

  // Named apart from the `viscosity` value it sets.
  setViscosity({ value = 1000 } = {}) {
    this.viscosity = Math.max(5, Math.min(20000, value));
    this.log.push({ fn: 'setViscosity', args: { value: this.viscosity } });
    return this;
  }

  // ---- Inks ------------------------------------------------------------

  // Fills the surface with dots of varying size, largest holes first. See fill.js. Sizes are
  // what the dots end up as, so drops are smaller on simulators where ink spreads.
  fillDots({ count = 150, min = 8, max = 60, gap = 3, margin = 0, tightness = 0.6, colors = ['#1f4e79'], rings = 1, dispersion = 0.8, shimmer = 0, at } = {}) {
    const dots = colourDots(planDots({
      width: this.width, height: this.height, minR: min, maxR: max, gap, margin, count, tightness, random: () => this.random(),
    }), colors, () => this.random());
    const growth = this.spreadFactor;
    for (let ring = 0; ring < rings; ring++) {
      for (const dot of dots) {
        const c = colors[(dot.colorIndex + ring) % colors.length];
        const quantity = ((Math.PI * dot.r * dot.r) / growth / rings) * this.film / 1000;
        this.drop({ x: dot.x, y: dot.y, quantity, dispersion, color: c, shimmer: typeof c === 'object' ? c.shimmer : shimmer, at });
      }
      if (ring < rings - 1) this.settle();
    }
    return dots.length;
  }

  // A spray of many fine dots, most of them tiny, thickest in the middle like a real spray.
  // min and max are the radii the dots end up at.
  spray({ x = 0, y = 0, radius = 150, n = 150, min = 0.5, max = 6, colors = ['#1f4e79'], dispersion = 4, stagger = 0.4, at } = {}) {
    const start = at ?? this._now;
    const growth = this.spreadFactor;
    for (let i = 0; i < n; i++) {
      const angle = this.random() * 2 * Math.PI;
      const reach = radius * Math.sqrt(-Math.log(1 - this.random() * 0.98)) / 2;
      const r = min * (max / min) ** (this.random() ** 3);
      this.drop({
        x: x + reach * Math.cos(angle),
        y: y + reach * Math.sin(angle),
        quantity: ((Math.PI * r * r) / growth) * this.film / 1000,
        dispersion,
        color: colors[Math.floor(this.random() * colors.length)],
        at: this.orderGap !== null && at === undefined ? undefined : start + this.random() * stagger,
      });
    }
    return this;
  }

  // How many times its plain area a lone drop finally covers.
  get spreadFactor() { return this.openWaterOn ? 4 : 1; }


  // quantity: mL. dispersion: spreading rate (1/s), larger is faster. spreading: how many
  // times its plain size the ink can stretch over water, like adding surfactant to a paint.
  // shimmer (0..1) makes the ink metallic.
  drop({ x = 0, y = 0, quantity = 1, dispersion = 0.8, spreading = 4, color = '#1f4e79', shimmer = 0, at } = {}) {
    if (typeof color === 'object') ({ color, shimmer = 0 } = color); // a palette ink
    const args = { x, y, quantity, dispersion, spreading, color, shimmer };
    if (at !== undefined) args.at = at;
    const maxArea = maxRadius(quantity, this.film) ** 2;
    const growTime = dispersion === Infinity ? 0 : -Math.log(GROWTH_DONE) / dispersion;
    const op = {
      kind: 'drop', x, y, color, shimmer, quantity, dispersion, maxArea, growTime, grown: 0, elapsed: 0, poly: null,
      exposure: 1, owed: 0, spreading,
    };
    return this._schedule('drop', args, op);
  }

  // n drops scattered in a w x h box, each with a random start within `stagger` seconds.
  drops({ n = 20, x = 0, y = 0, w = this.width, h = this.height, quantity = 0.5, spread = 0.3,
          dispersion = 0.8, spreading = 4, colors = ['#1f4e79'], stagger = 0, at } = {}) {
    const start = at ?? this._now;
    for (let i = 0; i < n; i++) {
      this.drop({
        x: x + (this.random() - 0.5) * w,
        y: y + (this.random() - 0.5) * h,
        quantity: quantity * (1 + (this.random() * 2 - 1) * spread),
        dispersion,
        spreading,
        color: colors[i % colors.length],
        at: this.orderGap !== null && at === undefined ? undefined : start + this.random() * stagger,
      });
    }
    return this;
  }

  // ---- Tools -----------------------------------------------------------

  // A rake: `teeth` tines `spacing` mm apart (or explicit `offsets`), moving along
  // from -> to (or a `path`). waveAmp/waveLength make it weave as it travels.
  rake({ from, to, path, teeth = 10, spacing = 50, offsets, speed = 100, D = 10,
         waveAmp = 0, waveLength = 100, waveShape = 'sine', width = 0, at } = {}) {
    const points = path ?? [from, to];
    const offs = offsets ?? Array.from({ length: teeth }, (_, i) => (i - (teeth - 1) / 2) * spacing);
    const args = { path: points, offsets: offs, speed, D, waveAmp, waveLength, waveShape, width };
    if (at !== undefined) args.at = at;

    const segs = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1];
      const [bx, by] = points[i];
      const len = Math.hypot(bx - ax, by - ay);
      if (len > 0) { segs.push({ ax, ay, bx, by, len, start: total }); total += len; }
    }
    if (!segs.length) return null;
    const s0 = segs[0];
    const perp = [-(s0.by - s0.ay) / s0.len, (s0.bx - s0.ax) / s0.len];
    const op = {
      kind: 'rake', segs, total, offs, perp, speed, waveAmp, waveLength, waveShape, width, dist: 0,
      L: Math.max((speed * D * D) / this.viscosity, 0.25),
    };
    return this._schedule('rake', args, op, total / speed, true);
  }

  // A single tine dragged along a path.
  stylus({ path, speed = 100, D = 10, width = 0, at } = {}) {
    return this.rake({ path, offsets: [0], speed, D, width, at });
  }

  // Sinusoidal shear across the whole tank: waves travel along `angle`.
  jiggle({ angle = 0, period = 200, amplitude = 30, compression = 0, offset = 0,
           duration = 2, at } = {}) {
    const args = { angle, period, amplitude, compression, offset, duration };
    if (at !== undefined) args.at = at;
    const op = {
      kind: 'jiggle', nx: Math.cos(angle * DEG), ny: Math.sin(angle * DEG),
      period, amplitude, compression, offset, duration, elapsed: 0,
    };
    return this._schedule('jiggle', args, op, duration, true);
  }

  // Concentric oscillation: rings rotate back and forth by up to `degrees`.
  wriggle({ x = 0, y = 0, period = 150, degrees = 20, radial = 0, duration = 2, at } = {}) {
    const args = { x, y, period, degrees, radial, duration };
    if (at !== undefined) args.at = at;
    const op = { kind: 'wriggle', x, y, period, degrees, radial, duration, elapsed: 0 };
    return this._schedule('wriggle', args, op, duration, true);
  }

  // Circular tines at the given radii turning by `degrees` at `rate` deg/s.
  // A negative radius turns the opposite way.
  stir({ x = 0, y = 0, radii = [100, 200, 300], degrees = 180, rate = 60, D = 30, at } = {}) {
    const args = { x, y, radii, degrees, rate, D };
    if (at !== undefined) args.at = at;
    const omega = Math.abs(rate) * DEG;
    const op = {
      kind: 'stir', x, y, radii, degrees, duration: Math.abs(degrees / rate), elapsed: 0,
      Linv: this.viscosity / (omega * D * D),
    };
    return this._schedule('stir', args, op, op.duration, true);
  }

  // An irrotational vortex; circulation in mm^2/s, positive is counter-clockwise.
  vortex({ x = 0, y = 0, circulation = 300000, duration = 3, at } = {}) {
    const args = { x, y, circulation, duration };
    if (at !== undefined) args.at = at;
    const op = { kind: 'vortex', x, y, circulation, duration, elapsed: 0 };
    return this._schedule('vortex', args, op, duration, true);
  }

  shift({ dx = 0, dy = 0, duration = 1, at } = {}) {
    const args = { dx, dy, duration };
    if (at !== undefined) args.at = at;
    return this._schedule('shift', args, { kind: 'shift', dx, dy, duration, elapsed: 0 }, duration, true);
  }

  turn({ x = 0, y = 0, degrees = 90, duration = 1, at } = {}) {
    const args = { x, y, degrees, duration };
    if (at !== undefined) args.at = at;
    return this._schedule('turn', args, { kind: 'turn', x, y, degrees, duration, elapsed: 0 }, duration, true);
  }

  // ---- Simulation ------------------------------------------------------

  // A rake across the whole tank: teeth spread evenly, travelling along angle
  // (0 is +x, 90 is +y, 180 is -x, 270 is -y). offset slides the teeth sideways in mm, wrapping at the edges.
  fullRake({ angle = 0, teeth = 10, offset = 0, speed = 200, D = 10, waveAmp = 0, waveLength = 100, waveShape = 'sine', width = 0, at } = {}) {
    const c = Math.cos(angle * DEG);
    const s = Math.sin(angle * DEG);
    const along = (Math.abs(c) * this.width + Math.abs(s) * this.height) / 2 + 20;
    const across = Math.abs(s) * this.width + Math.abs(c) * this.height;
    const spacing = across / teeth;
    // Teeth that slide off one edge come back in on the other, so the page stays covered.
    const wrap = (v) => ((v % across) + across) % across;
    const offsets = Array.from({ length: teeth }, (_, i) => wrap((i + 0.5) * spacing + offset) - across / 2);
    return this.rake({
      from: [-c * along, -s * along], to: [c * along, s * along],
      offsets, speed, D, waveAmp, waveLength, waveShape, width, at,
    });
  }

  // Outline points past which fine detail starts to reduce.
  get detailBudget() { return DETAIL_BUDGET; }

  // With this false, ink only slows when moving towards a wall. Back-and-forth flow beside a wall
  // then walks the ink away from it, because the moves away are bigger than the moves towards.
  get evenWalls() { return false; }

  // Applies f(x, y, out) to every outline vertex and every landed drop's centre.
  // Drops that haven't landed yet are unaffected. With hard edges nothing crosses the walls.
  _map(f, { slowNearWalls = true, clamp = true } = {}) {
    const out = [0, 0];
    const walls = this.wallsOn && clamp;
    const hw = this.width / 2;
    const hh = this.height / 2;
    // Hard edges resist: ink slows as it nears a wall and compresses against it, rather
    // than being cut off there.
    const resist = walls && slowNearWalls;
    const band = Math.min(this.width, this.height) * 0.1;
    const apply = (x, y) => {
      f(x, y, out);
      if (resist) {
        const dx = out[0] - x;
        const dy = out[1] - y;
        const roomX = this.evenWalls ? hw - Math.abs(x) : dx > 0 ? hw - x : x + hw;
        const roomY = this.evenWalls ? hh - Math.abs(y) : dy > 0 ? hh - y : y + hh;
        if (roomX < band) out[0] = x + dx * Math.max(roomX, 0) / band;
        if (roomY < band) out[1] = y + dy * Math.max(roomY, 0) / band;
      }
      if (walls) {
        out[0] = Math.max(-hw, Math.min(hw, out[0]));
        out[1] = Math.max(-hh, Math.min(hh, out[1]));
      }
    };
    for (const poly of this.polys) {
      const { xy, n } = poly;
      for (let i = 0; i < n * 2; i += 2) {
        apply(xy[i], xy[i + 1]);
        xy[i] = out[0];
        xy[i + 1] = out[1];
      }
    }
    for (const op of this.sources) {
      apply(op.x, op.y);
      op.x = out[0];
      op.y = out[1];
    }
  }

  // Pushes everything away from [x, y, area] sources, all together in one pass.
  // Displacements are summed at the original point: applying them one after another
  // would knock a drop's centre off its own source and fling its ink outward.
  // With walls, mirror images in the nearest walls stop most flow through them, and a
  // uniform contraction removes the added area from the bare bath.
  _pushApart(sources) {
    const { width: W, height: H } = this;
    // Mirror images stop a push flowing through the walls, which only matters for a push that
    // doesn't fade. A spreading drop's images would hold its ink back from the wall like water
    // pressure, so it just meets the wall and flattens there.
    const fading = sources.some((src) => src[3]);
    const walled = this.wallsOn && !fading;
    const per = walled ? 4 : 1;
    const count = sources.length * per;
    const sx = new Float64Array(count);
    const sy = new Float64Array(count);
    const sa = new Float64Array(count);
    const limits = new Array(count); // where each push stops by direction, or nothing if it doesn't
    let total = 0;
    sources.forEach(([cx, cy, da, limit], k) => {
      const mx = cx >= 0 ? W - cx : -W - cx;
      const my = cy >= 0 ? H - cy : -H - cy;
      const spots = walled ? [[cx, cy], [mx, cy], [cx, my], [mx, my]] : [[cx, cy]];
      spots.forEach(([ix, iy], m) => {
        sx[k * per + m] = ix;
        sy[k * per + m] = iy;
        sa[k * per + m] = da;
        limits[k * per + m] = limit;
      });
      total += da;
    });
    // Open water gives way by itself, so a fading push needs no contraction.
    const scale = walled && !fading ? Math.sqrt((W * H) / (W * H + total)) : 1;
    if (!fading && count * this.vertexCount > this.fieldAbove) this._pushField(sx, sy, sa, count, scale);
    else {
      this._map((x0, y0, out) => {
        let x = x0;
        let y = y0;
        for (let i = 0; i < count; i++) {
          const dx = x0 - sx[i];
          const dy = y0 - sy[i];
          const d2 = dx * dx + dy * dy;
          if (d2 < 1e-12) continue;
          let a = Math.sqrt(1 + sa[i] / d2) - 1;
          const limit = limits[i];
          if (limit) {
            const d = Math.sqrt(d2);
            if (d > limit.farthest + PUSH_FADE * 5) continue;
            const u = (Math.atan2(dy, dx) / (2 * Math.PI) + 1) * PUSH_DIRECTIONS;
            const k = Math.floor(u);
            const t = u - k;
            const R = limit[k % PUSH_DIRECTIONS] * (1 - t) + limit[(k + 1) % PUSH_DIRECTIONS] * t;
            // Past the ink's edge is water, which carries no pressure.
            if (d > R) {
              const beyond = d - R;
              if (beyond > PUSH_FADE * 5) continue;
              a *= Math.exp(-beyond / PUSH_FADE);
            }
          }
          x += dx * a;
          y += dy * a;
        }
        out[0] = x * scale;
        out[1] = y * scale;
      }, { slowNearWalls: !fading });
    }
  }

  // The same push for heavy scenes. A source's effect varies slowly far away, so far
  // effects are computed on a coarse grid and interpolated; only sources close to a
  // point are computed exactly. A smooth blend hides the join between the two.
  _pushField(sx, sy, sa, count, scale) {
    const cell = Math.max(this.width, this.height) / 40;
    const near = cell * 3;
    const inner = near / 2;
    const x0 = -this.width * 0.75;
    const y0 = -this.height * 0.75;
    const cols = Math.ceil((this.width * 1.5) / cell) + 1;
    const rows = Math.ceil((this.height * 1.5) / cell) + 1;
    const blend = (d) => {
      if (d <= inner) return 1;
      if (d >= near) return 0;
      const u = (near - d) / (near - inner);
      return u * u * (3 - 2 * u);
    };
    const gx = new Float64Array(cols * rows);
    const gy = new Float64Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      const py = y0 + r * cell;
      for (let c = 0; c < cols; c++) {
        const px = x0 + c * cell;
        let ux = 0;
        let uy = 0;
        for (let i = 0; i < count; i++) {
          const dx = px - sx[i];
          const dy = py - sy[i];
          const d2 = dx * dx + dy * dy;
          if (d2 <= inner * inner) continue;
          const w = 1 - blend(Math.sqrt(d2));
          const a = (Math.sqrt(1 + sa[i] / d2) - 1) * w;
          ux += dx * a;
          uy += dy * a;
        }
        gx[r * cols + c] = ux;
        gy[r * cols + c] = uy;
      }
    }
    // Buckets of nearby sources, each listed in every bucket its reach touches.
    const bw = Math.ceil((this.width * 1.5) / near) + 1;
    const bh = Math.ceil((this.height * 1.5) / near) + 1;
    const buckets = new Array(bw * bh);
    for (let i = 0; i < count; i++) {
      const bc = Math.floor((sx[i] - x0) / near);
      const br = Math.floor((sy[i] - y0) / near);
      for (let r = Math.max(0, br - 1); r <= Math.min(bh - 1, br + 1); r++) {
        for (let c = Math.max(0, bc - 1); c <= Math.min(bw - 1, bc + 1); c++) {
          (buckets[r * bw + c] ??= []).push(i);
        }
      }
    }
    const near2 = near * near;
    this._map((x, y, out) => {
      const fc = Math.max(0, Math.min(cols - 1.001, (x - x0) / cell));
      const fr = Math.max(0, Math.min(rows - 1.001, (y - y0) / cell));
      const c = Math.floor(fc);
      const r = Math.floor(fr);
      const tc = fc - c;
      const tr = fr - r;
      const i00 = r * cols + c;
      const i10 = i00 + 1;
      const i01 = i00 + cols;
      const i11 = i01 + 1;
      let nx = x + (gx[i00] * (1 - tc) + gx[i10] * tc) * (1 - tr) + (gx[i01] * (1 - tc) + gx[i11] * tc) * tr;
      let ny = y + (gy[i00] * (1 - tc) + gy[i10] * tc) * (1 - tr) + (gy[i01] * (1 - tc) + gy[i11] * tc) * tr;
      const bc = Math.floor((x - x0) / near);
      const br = Math.floor((y - y0) / near);
      const list = bc >= 0 && bc < bw && br >= 0 && br < bh ? buckets[br * bw + bc] : undefined;
      if (list) {
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          const dx = x - sx[i];
          const dy = y - sy[i];
          const d2 = dx * dx + dy * dy;
          if (d2 >= near2 || d2 < 1e-12) continue;
          const a = (Math.sqrt(1 + sa[i] / d2) - 1) * blend(Math.sqrt(d2));
          nx += dx * a;
          ny += dy * a;
        }
      }
      out[0] = nx * scale;
      out[1] = ny * scale;
    });
  }

  // A coarse map of which parts of the tank hold ink.
  _inkGrid() {
    const { width: W, height: H } = this;
    const cell = Math.max(W, H) / 400;
    const cols = Math.ceil(W / cell);
    const rows = Math.ceil(H / cell);
    const inked = new Uint8Array(cols * rows);
    const crossings = Array.from({ length: rows }, () => []);
    for (const { xy, n } of this.polys) {
      let lo = rows;
      let hi = -1;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const y0 = (xy[j * 2 + 1] + H / 2) / cell - 0.5;
        const y1 = (xy[i * 2 + 1] + H / 2) / cell - 0.5;
        const from = Math.max(0, Math.ceil(Math.min(y0, y1)));
        const to = Math.min(rows - 1, Math.ceil(Math.max(y0, y1)) - 1);
        for (let r = from; r <= to; r++) {
          const t = (r - y0) / (y1 - y0);
          crossings[r].push((xy[j * 2] + (xy[i * 2] - xy[j * 2]) * t + W / 2) / cell - 0.5);
        }
        if (from <= to) {
          lo = Math.min(lo, from);
          hi = Math.max(hi, to);
        }
      }
      for (let r = lo; r <= hi; r++) {
        const c = crossings[r].sort((a, b) => a - b);
        for (let k = 0; k + 1 < c.length; k += 2) {
          const end = Math.min(cols - 1, Math.floor(c[k + 1]));
          for (let col = Math.max(0, Math.ceil(c[k])); col <= end; col++) inked[r * cols + col] = 1;
        }
        c.length = 0;
      }
    }
    return { inked, cell, cols, rows };
  }

  // Looks just outside a drop's edge to see how much of it faces open water.
  _updateExposure(op, grid) {
    const { inked, cell, cols, rows } = grid;
    // A drop about to land has no outline yet, so look around its landing spot instead.
    const ring = () => Float64Array.from({ length: 32 }, (_, i) => {
      const a = (Math.floor(i / 2) / 16) * 2 * Math.PI;
      return i % 2 ? op.y + 2 * cell * Math.sin(a) : op.x + 2 * cell * Math.cos(a);
    });
    const { xy, n } = op.poly ?? { xy: ring(), n: 16 };
    const step = Math.max(1, Math.floor(n / 32));
    let open = 0;
    let samples = 0;
    for (let i = 0; i < n; i += step) {
      const dx = xy[i * 2] - op.x;
      const dy = xy[i * 2 + 1] - op.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      const col = Math.round((xy[i * 2] + ux * cell + this.width / 2) / cell - 0.5);
      const row = Math.round((xy[i * 2 + 1] + uy * cell + this.height / 2) / cell - 0.5);
      const inside = col >= 0 && col < cols && row >= 0 && row < rows;
      const isOpen = inside ? !inked[row * cols + col] : !this.wallsOn;
      samples++;
      if (isOpen) open++;
    }
    // Smoothed, because one odd reading could otherwise end a drop's growth for good.
    const reading = open / samples;
    // It can only fall: a drop that has met ink doesn't start spreading again when a neighbour
    // gets pushed away, which would have drops shoving each other back and forth for ever.
    op.exposure = op.poly ? Math.min(op.exposure, op.exposure * 0.8 + reading * 0.2) : reading;
    this._inkRays(op, grid);
  }

  // How far solid ink extends from a spot in each direction. Ink can't compress, so a drop's
  // push has to carry through it and only stop at water. Eased over time, because the map's
  // cells would otherwise make the push's edge flicker from one reading to the next.
  _inkRays(op, { inked, cell, cols, rows }) {
    const first = !op.rays;
    op.rays ??= new Float64Array(PUSH_DIRECTIONS);
    for (let i = 0; i < PUSH_DIRECTIONS; i++) {
      const a = (i / PUSH_DIRECTIONS) * 2 * Math.PI;
      let d = 0;
      for (;;) {
        const col = Math.round((op.x + Math.cos(a) * (d + cell) + this.width / 2) / cell - 0.5);
        const row = Math.round((op.y + Math.sin(a) * (d + cell) + this.height / 2) / cell - 0.5);
        if (col < 0 || col >= cols || row < 0 || row >= rows || !inked[row * cols + col]) break;
        d += cell;
      }
      op.rays[i] = first ? d + cell : op.rays[i] + (d + cell - op.rays[i]) * 0.3;
    }
  }

  // Where this drop's push stops in each direction: its own outline, exactly, or further if
  // solid ink carries the push on.
  _pushLimits(op) {
    const limits = new Float64Array(PUSH_DIRECTIONS);
    if (op.poly) {
      const { xy, n } = op.poly;
      for (let i = 0; i < n; i++) {
        const dx = xy[i * 2] - op.x;
        const dy = xy[i * 2 + 1] - op.y;
        const k = Math.round((Math.atan2(dy, dx) / (2 * Math.PI) + 1) * PUSH_DIRECTIONS) % PUSH_DIRECTIONS;
        limits[k] = Math.max(limits[k], Math.hypot(dx, dy));
      }
      // A small outline can leave directions with no point in them.
      for (let pass = 0; pass < 2; pass++) {
        for (let k = 0; k < PUSH_DIRECTIONS; k++) {
          if (!limits[k]) limits[k] = limits[(k + PUSH_DIRECTIONS - 1) % PUSH_DIRECTIONS] || limits[(k + 1) % PUSH_DIRECTIONS];
        }
      }
    } else limits.fill(Math.sqrt(op.grown));
    let farthest = 0;
    for (let k = 0; k < PUSH_DIRECTIONS; k++) {
      if (op.rays) limits[k] = Math.max(limits[k], Math.min(op.rays[k], limits[k] + PUSH_THROUGH_INK));
      farthest = Math.max(farthest, limits[k]);
    }
    limits.farthest = farthest;
    return limits;
  }

  _advanceOpenWaterDrop(op, dt) {
    if (!op.poly || this.tick % 3 === 0) {
      if (this._exposureTick !== this.tick) {
        this._grid = this._inkGrid();
        this._exposureTick = this.tick;
      }
      this._updateExposure(op, this._grid);
    }
    const limit = op.maxArea * op.spreading;
    const floor = limit * AGAINST_INK_SHARE;
    const rate = 1 - Math.exp(-op.dispersion * dt);
    // A drop always reaches its floor; past that, only the edge facing water draws it on.
    const da = Math.max(floor - op.grown, (limit - op.grown) * op.exposure, 0) * rate;
    op.grown += da;
    op.owed += da;
    op.elapsed += dt;
    const resting = op.exposure < NO_WATER_LEFT || limit - op.grown < GROWTH_DONE * op.maxArea
      || op.elapsed > op.growTime * SPREAD_TIME_LIMIT;
    const done = resting && floor - op.grown < GROWTH_DONE * op.maxArea;
    if (op.poly && !done && op.owed < Math.sqrt(op.grown)) return false;
    if (op.owed > 0) {
      this.growth.push([op.x, op.y, op.owed, this._pushLimits(op)]);
      if (!op.poly) this.landing.push([op, Math.sqrt(op.owed)]);
      op.owed = 0;
    }
    return done;
  }

  _advanceDrop(op, dt) {
    if (this.openWaterOn && op.dispersion !== Infinity) return this._advanceOpenWaterDrop(op, dt);
    op.elapsed += dt;
    const frac = op.dispersion === Infinity || op.elapsed >= op.growTime
      ? 1 : 1 - Math.exp(-op.dispersion * op.elapsed);
    const target = op.maxArea * frac;
    const da = target - op.grown;
    // Late growth is tiny, and every update moves every point in the tank, so save it
    // up until the edge would visibly move (about half a millimetre).
    if (op.poly && frac < 1 && da < Math.sqrt(op.grown) * 1) return false;
    op.grown = target;
    if (da <= 0) return frac >= 1;
    this.growth.push([op.x, op.y, da]);
    if (!op.poly) this.landing.push([op, Math.sqrt(da)]);
    return frac >= 1;
  }

  // Applies this tick's drop growth in one pass, then creates any newly landed ink.
  _flushGrowth() {
    if (this.growth.length) this._pushApart(this.growth);
    this.growth = [];
    for (const [op, r] of this.landing) {
      const n = 48;
      const xy = new Float64Array(n * 4);
      for (let i = 0; i < n; i++) {
        xy[i * 2] = op.x + r * Math.cos((i / n) * 2 * Math.PI);
        xy[i * 2 + 1] = op.y + r * Math.sin((i / n) * 2 * Math.PI);
      }
      op.poly = { xy, n, color: op.color, shimmer: op.shimmer };
      this.polys.push(op.poly);
    }
    this.landing = [];
  }

  // Moves one tine from (bx,by) to (ex,ey).
  _tine(bx0, by0, ex0, ey0, L) {
    const len = Math.hypot(ex0 - bx0, ey0 - by0);
    if (len < 1e-9) return;
    const rpts = Math.ceil(len / L);
    const tU = len / rpts;
    const nx = (ex0 - bx0) / len;
    const ny = (ey0 - by0) / len;
    const reach2 = (6 * L + tU) ** 2;
    for (let k = 0; k < rpts; k++) {
      const bx = bx0 + nx * tU * k;
      const by = by0 + ny * tU * k;
      const ex = bx + nx * tU;
      const ey = by + ny * tU;
      this._map((px, py, out) => {
        out[0] = px;
        out[1] = py;
        const dxB = bx - px;
        const dyB = by - py;
        const r2 = dxB * dxB + dyB * dyB;
        if (r2 > reach2 || r2 < 1e-18) return;
        const r = Math.sqrt(r2);
        const dxE = ex - px;
        const dyE = ey - py;
        const s = Math.max(Math.hypot(dxE, dyE), 1e-9);
        const txB = dxB * nx + dyB * ny;
        const txE = dxE * nx + dyE * ny;
        const ty = dxB * ny - dyB * nx;
        const denR = Math.exp(r / L) * r * L * 2;
        const denS = Math.exp(s / L) * s * L * 2;
        const inx = ((r * L - ty * ty) * tU) / denR + ((s * L - ty * ty) * tU) / denS;
        const iny = (txB * ty * tU) / denR + (txE * ty * tU) / denS;
        out[0] = px + inx * nx + iny * ny;
        out[1] = py + inx * ny - iny * nx;
      });
    }
  }

  // A tine that takes up space: ink ahead of it bulges aside and closes up behind it, by the
  // flow around a moving cylinder of radius a.
  _tineBody(bx, by, ex, ey, a) {
    const len = Math.hypot(ex - bx, ey - by);
    if (len < 1e-9) return;
    const steps = Math.ceil(len / (a * 0.5));
    const ds = len / steps;
    const nx = (ex - bx) / len;
    const ny = (ey - by) / len;
    const a2 = a * a;
    const near = a * 6;
    const far = a * 12;
    // A smooth flow with no sides to fall on, so ink can't tear apart at the tine's centre line.
    // It stays slower than the tine, so ink slips past instead of riding along on its front.
    for (let k = 0; k < steps; k++) {
      const cx = bx + nx * ds * (k + 0.5);
      const cy = by + ny * ds * (k + 0.5);
      this._map((px, py, out) => {
        out[0] = px;
        out[1] = py;
        const rx = px - cx;
        const ry = py - cy;
        const r2 = rx * rx + ry * ry;
        if (r2 >= far * far) return;
        const along = nx * rx + ny * ry;
        const across = ny * rx - nx * ry;
        const s = r2 + a2;
        const fade = r2 <= near * near ? 1 : (far - Math.sqrt(r2)) / (far - near);
        const c = (TINE_SLIP * a2 * ds * fade) / (s * s);
        const moveAlong = c * (s - 2 * across * across);
        const moveAcross = c * 2 * along * across;
        out[0] += moveAlong * nx + moveAcross * ny;
        out[1] += moveAlong * ny - moveAcross * nx;
      });
    }
  }

  _rakePoint(op, dist, offset) {
    let along = 0;
    let weave = 0;
    if (op.waveAmp) {
      const turns = dist / op.waveLength;
      const [a, across] = (WEAVE_SHAPES[op.waveShape] ?? WEAVE_SHAPES.sine)(turns - Math.floor(turns));
      along = a * op.waveLength;
      weave = op.waveAmp * across;
    }
    const at = dist + along;
    let seg = op.segs[op.segs.length - 1];
    for (const s of op.segs) { if (at <= s.start + s.len) { seg = s; break; } }
    const t = (at - seg.start) / seg.len;
    return [
      seg.ax + (seg.bx - seg.ax) * t + op.perp[0] * (offset + weave),
      seg.ay + (seg.by - seg.ay) * t + op.perp[1] * (offset + weave),
    ];
  }

  _advanceRake(op, dt) {
    const next = Math.min(op.dist + op.speed * dt, op.total);
    // A weave is a curve, so it needs short straight pieces however fast the rake goes.
    const pieces = op.waveAmp ? Math.max(1, Math.ceil(((next - op.dist) * WEAVE_POINTS) / op.waveLength)) : 1;
    for (let k = 0; k < pieces; k++) {
      const from = op.dist + ((next - op.dist) * k) / pieces;
      const to = op.dist + ((next - op.dist) * (k + 1)) / pieces;
      for (const off of op.offs) {
        const [bx, by] = this._rakePoint(op, from, off);
        const [ex, ey] = this._rakePoint(op, to, off);
        // A tine wider than its drag has only its body: the drag's core would catch ink at the
        // centre line and carry it the whole way.
        if (op.width / 2 <= op.L) this._tine(bx, by, ex, ey, op.L);
        if (op.width) this._tineBody(bx, by, ex, ey, op.width / 2);
      }
    }
    op.dist = next;
    return next >= op.total;
  }

  // Smooth 0..1 progress of a timed process over this tick: returns [before, after].
  _ramp(op, dt) {
    const ease = (u) => u * u * (3 - 2 * u);
    const before = ease(Math.min(op.elapsed / op.duration, 1));
    op.elapsed += dt;
    return [before, ease(Math.min(op.elapsed / op.duration, 1))];
  }

  _rotateAbout(cx, cy, x, y, angle, out) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const dx = x - cx;
    const dy = y - cy;
    out[0] = cx + dx * c - dy * s;
    out[1] = cy + dx * s + dy * c;
  }

  _advanceTimed(op, dt) {
    const [p0, p1] = op.kind === 'vortex' ? [0, 0] : this._ramp(op, dt);
    const dp = p1 - p0;
    switch (op.kind) {
      case 'jiggle': {
        const { nx, ny, offset, period } = op;
        const k = (2 * Math.PI) / period;
        const across = op.amplitude * dp;
        const along = op.compression * dp;
        this._map((x, y, out) => {
          const w = Math.sin(k * (x * nx + y * ny + offset));
          out[0] = x + w * (-ny * across + nx * along);
          out[1] = y + w * (nx * across + ny * along);
        });
        break;
      }
      case 'wriggle': {
        const k = (2 * Math.PI) / op.period;
        const da = op.degrees * DEG * dp;
        const dr = op.radial * dp;
        this._map((x, y, out) => {
          const dx = x - op.x;
          const dy = y - op.y;
          const rho = Math.hypot(dx, dy);
          const w = Math.sin(k * rho);
          this._rotateAbout(op.x, op.y, x, y, da * w, out);
          if (dr !== 0 && rho > 1e-6) {
            const grow = (rho + dr * Math.cos(k * rho)) / rho;
            out[0] = op.x + (out[0] - op.x) * grow;
            out[1] = op.y + (out[1] - op.y) * grow;
          }
        });
        break;
      }
      case 'stir': {
        const dth = op.degrees * DEG * dp;
        this._map((x, y, out) => {
          const rho = Math.hypot(x - op.x, y - op.y);
          let a = 0;
          for (const r of op.radii) {
            const R = Math.abs(r);
            a += Math.sign(r) * Math.exp((-Math.abs(rho - R) * op.Linv) / R);
          }
          this._rotateAbout(op.x, op.y, x, y, a * dth, out);
        });
        break;
      }
      case 'vortex': {
        op.elapsed += dt;
        const nu4t = 4 * this.viscosity * op.elapsed;
        const gamma = op.circulation / (2 * Math.PI);
        this._map((x, y, out) => {
          const dx = x - op.x;
          const dy = y - op.y;
          const r2 = dx * dx + dy * dy;
          if (r2 < 1e-9) { out[0] = x; out[1] = y; return; }
          const omega = (gamma / r2) * (1 - Math.exp(-r2 / nu4t));
          this._rotateAbout(op.x, op.y, x, y, omega * dt, out);
        });
        break;
      }
      case 'fit': {
        // Only ink in a band along each wall moves, and everything further in stays exactly
        // where it is. Depth d past the band's start becomes d / (1 + c d), and because two
        // of those in a row just add their c, the steps of the animation combine exactly.
        const fold = (v, half, c) => {
          const depth = Math.abs(v) - (half - op.band);
          if (depth <= 0 || !c) return v;
          return Math.sign(v) * (half - op.band + depth / (1 + c * depth));
        };
        this._map((x, y, out) => {
          out[0] = fold(x, this.width / 2, op.cx * dp);
          out[1] = fold(y, this.height / 2, op.cy * dp);
        }, { slowNearWalls: false, clamp: false });
        break;
      }
      case 'shift': {
        const dx = op.dx * dp;
        const dy = op.dy * dp;
        this._map((x, y, out) => { out[0] = x + dx; out[1] = y + dy; });
        break;
      }
      case 'turn': {
        const a = op.degrees * DEG * dp;
        this._map((x, y, out) => this._rotateAbout(op.x, op.y, x, y, a, out));
        break;
      }
    }
    return op.elapsed >= op.duration;
  }

  _inView(x, y) {
    const mx = this.width / 2 + this.width * 0.1;
    const my = this.height / 2 + this.height * 0.1;
    return x > -mx && x < mx && y > -my && y < my;
  }

  // Adds vertices where stretching has made edges too long to look smooth.
  _refine() {
    let total = 0;
    for (const p of this.polys) total += p.n;
    if (total >= this.maxVertices) { this.capped = true; return; }
    this.capped = false;
    // Past the budget, trade fine detail for speed instead of slowing without limit.
    this.detail = Math.min(MAX_DETAIL, Math.max(1, total / this.detailBudget));
    const lim = this.maxEdge * this.detail;
    for (const poly of this.polys) {
      const { xy, n } = poly;
      let extra = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = xy[i * 2], ay = xy[i * 2 + 1], bx = xy[j * 2], by = xy[j * 2 + 1];
        if (!this._inView(ax, ay) && !this._inView(bx, by)) continue;
        const len = Math.hypot(bx - ax, by - ay);
        if (len > lim) extra += Math.ceil(len / lim) - 1;
      }
      if (!extra) continue;
      const out = xy.length >= (n + extra) * 2 ? new Float64Array(xy.length)
                                                : new Float64Array((n + extra) * 4);
      let w = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = xy[i * 2], ay = xy[i * 2 + 1], bx = xy[j * 2], by = xy[j * 2 + 1];
        out[w++] = ax;
        out[w++] = ay;
        if (!this._inView(ax, ay) && !this._inView(bx, by)) continue;
        const len = Math.hypot(bx - ax, by - ay);
        if (len > lim) {
          const parts = Math.ceil(len / lim);
          for (let k = 1; k < parts; k++) {
            out[w++] = ax + ((bx - ax) * k) / parts;
            out[w++] = ay + ((by - ay) * k) / parts;
          }
        }
      }
      poly.xy = out;
      poly.n = w / 2;
    }
  }

  // Removes vertices that lie almost on the line between their neighbours, far more
  // readily outside the view, and discards ink pushed well beyond the tank.
  // Once nothing is moving, keeps only the points needed to draw each outline to within a
  // tiny fraction of a millimetre. Tools add points back where they need them.
  _compact() {
    for (const poly of this.polys) {
      const { xy, n } = poly;
      if (n < 32) continue;
      const keep = new Uint8Array(n);
      const stack = [[0, n >> 1], [n >> 1, n]];
      keep[0] = keep[n >> 1] = 1;
      while (stack.length) {
        const [from, to] = stack.pop();
        if (to - from < 2) continue;
        const ax = xy[from * 2], ay = xy[from * 2 + 1];
        const bx = xy[(to % n) * 2], by = xy[(to % n) * 2 + 1];
        const len = Math.hypot(bx - ax, by - ay);
        let worst = -1;
        let at = -1;
        for (let i = from + 1; i < to; i++) {
          const px = xy[i * 2] - ax, py = xy[i * 2 + 1] - ay;
          const d = len > 1e-12 ? Math.abs((bx - ax) * py - (by - ay) * px) / len : Math.hypot(px, py);
          if (d > worst) { worst = d; at = i; }
        }
        if (worst > COMPACT_TOLERANCE) {
          keep[at] = 1;
          stack.push([from, at], [at, to]);
        }
      }
      let w = 0;
      for (let i = 0; i < n; i++) {
        if (keep[i]) {
          xy[w++] = xy[i * 2];
          xy[w++] = xy[i * 2 + 1];
        }
      }
      poly.n = w / 2;
    }
  }

  _simplify() {
    const tol = this.maxEdge * 0.024 * this.detail;
    const reach = this.maxEdge * 0.9 * this.detail;
    this._cullOutside();
    for (const poly of this.polys) {
      const { xy, n } = poly;
      if (n <= 24) continue;
      let w = 0;
      let px = xy[(n - 1) * 2], py = xy[(n - 1) * 2 + 1];
      for (let i = 0; i < n; i++) {
        const x = xy[i * 2], y = xy[i * 2 + 1];
        const nx = xy[((i + 1) % n) * 2], ny = xy[((i + 1) % n) * 2 + 1];
        const chord = Math.hypot(nx - px, ny - py);
        const off = chord > 0 ? Math.abs((nx - px) * (y - py) - (ny - py) * (x - px)) / chord : 0;
        const hidden = !this._inView(x, y) && !this._inView(px, py) && !this._inView(nx, ny);
        const scale = hidden ? 20 : 1;
        if (chord < reach * scale && off < tol * scale) continue;
        xy[w++] = x;
        xy[w++] = y;
        px = x;
        py = y;
      }
      if (w / 2 >= 16) poly.n = w / 2;
    }
  }

  // When hard edges switch on, eases ink already past the walls back inside: everything
  // shrinks together, so nothing overlaps or gets cut. Ink fully outside was never visible.
  _fitInside() {
    const hw = this.width / 2;
    const hh = this.height / 2;
    const gone = new Set();
    let maxX = hw;
    let maxY = hh;
    for (const poly of this.polys) {
      const { xy, n } = poly;
      let bx = 0;
      let by = 0;
      let seen = false;
      for (let i = 0; i < n; i++) {
        const ax = Math.abs(xy[i * 2]);
        const ay = Math.abs(xy[i * 2 + 1]);
        bx = Math.max(bx, ax);
        by = Math.max(by, ay);
        if (ax < hw && ay < hh) seen = true;
      }
      if (seen) {
        maxX = Math.max(maxX, bx);
        maxY = Math.max(maxY, by);
      } else if (!poly.group) gone.add(poly);
    }
    if (gone.size) {
      this.polys = this.polys.filter((p) => !gone.has(p));
      this.sources = this.sources.filter((op) => !gone.has(op.poly));
      this.active = this.active.filter((op) => !gone.has(op.poly));
    }
    if (maxX > hw || maxY > hh) {
      // How hard to fold each axis so that the farthest ink ends up exactly on the wall.
      const band = Math.min(this.width, this.height) * 0.1;
      const strength = (far, half) => (far > half ? 1 / band - 1 / (far - (half - band)) : 0);
      this.active.push({ kind: 'fit', cx: strength(maxX, hw), cy: strength(maxY, hh), band, duration: 0.8, elapsed: 0 });
    }
  }

  // Without walls, ink can drift far outside the tank. Past half a tank away it can't
  // realistically return, so it stops costing anything. Printed shapes are kept whole.
  _cullOutside() {
    if (this.wallsOn) return;
    const mx = this.width;
    const my = this.height;
    const gone = new Set();
    for (const poly of this.polys) {
      if (poly.group) continue;
      const { xy, n } = poly;
      let out = true;
      for (let i = 0; i < n && out; i++) {
        out = Math.abs(xy[i * 2]) > mx || Math.abs(xy[i * 2 + 1]) > my;
      }
      if (out) gone.add(poly);
    }
    if (!gone.size) return;
    this.polys = this.polys.filter((p) => !gone.has(p));
    this.sources = this.sources.filter((op) => !gone.has(op.poly));
    this.active = this.active.filter((op) => !gone.has(op.poly));
  }

  step() {
    const wasMoving = this.busy;
    const dt = this.dt;
    this._releaseGates();
    while (this.pending.length && this.pending[0].at <= this.time + 1e-9) {
      const op = this.pending.shift();
      if (op.kind === 'openWater') {
        this.openWaterOn = op.on;
        continue;
      }
      if (op.kind === 'walls') {
        this.wallsOn = op.on;
        if (op.on) this._fitInside();
        continue;
      }
      if (op.kind === 'print') {
        const group = this.nextGroup++;
        for (const c of op.contours) {
          this.polys.push({ xy: Float64Array.from(c), n: c.length / 2, color: op.color, shimmer: op.shimmer, group });
        }
        continue;
      }
      if (op.kind === 'drop') {
        op.at = this.time;
        this.sources.push(op);
      }
      this.active.push(op);
    }
    this.active = this.active.filter((op) => {
      if (op.kind === 'drop') return !this._advanceDrop(op, dt);
      if (op.kind === 'rake') return !this._advanceRake(op, dt);
      return !this._advanceTimed(op, dt);
    });
    this._flushGrowth();
    this.tick++;
    if (wasMoving) {
      this._refine();
      if (this.tick % 15 === 0) this._simplify();
    }
    this.time += dt;
    if (wasMoving && !this.busy) {
      this._cullOutside();
      this._compact();
    }
  }

  runUntilIdle(maxSeconds = 600) {
    const end = this.time + maxSeconds;
    while (this.busy && this.time < end) this.step();
    return this;
  }

  // ---- Output ----------------------------------------------------------

  get vertexCount() { return this.polys.reduce((sum, p) => sum + p.n, 0); }

  // Current tine positions, for drawing the tool over the tank.
  tinePositions() {
    const out = [];
    for (const op of this.active) {
      if (op.kind === 'rake') for (const off of op.offs) out.push(this._rakePoint(op, op.dist, off));
    }
    return out;
  }

  // A simulator can paint under all the ink, on canvas and in SVG.
  _beforeInk() {}
  _svgBeforeInk() { return ''; }

  draw(ctx, pxPerMm) {
    ctx.save();
    ctx.clearRect(0, 0, this.width * pxPerMm, this.height * pxPerMm); // the bath may be transparent
    ctx.fillStyle = this.bath;
    ctx.fillRect(0, 0, this.width * pxPerMm, this.height * pxPerMm);
    ctx.setTransform(pxPerMm, 0, 0, -pxPerMm, (this.width / 2) * pxPerMm, (this.height / 2) * pxPerMm);
    this._beforeInk(ctx);
    for (let p = 0; p < this.polys.length; p++) {
      const { group, color, shimmer } = this.polys[p];
      ctx.beginPath();
      // Loops of one printed shape share a path, so inner loops become holes.
      do {
        const { xy, n } = this.polys[p];
        ctx.moveTo(xy[0], xy[1]);
        // Points closer than a third of a pixel can't change the picture.
        const skip = (0.33 / pxPerMm) ** 2;
        let lx = xy[0], ly = xy[1];
        for (let i = 1; i < n; i++) {
          const x = xy[i * 2], y = xy[i * 2 + 1];
          const dx = x - lx, dy = y - ly;
          if (dx * dx + dy * dy < skip) continue;
          ctx.lineTo(x, y);
          lx = x;
          ly = y;
        }
        ctx.closePath();
      } while (group && this.polys[p + 1]?.group === group && ++p);
      ctx.fillStyle = color;
      ctx.fill(group ? 'evenodd' : 'nonzero');
      // A hairline closes the sliver of water between near-touching drops, so drops of
      // one colour join. See-through ink would show it as a darker edge, so it's skipped.
      if (!group && !isTranslucent(color)) {
        ctx.lineWidth = 1.2 / pxPerMm;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = color;
        ctx.stroke();
      }
      if (shimmer > 0) this._drawShimmer(ctx, group ? 'evenodd' : 'nonzero', shimmer);
    }
    ctx.restore();
  }

  // Paints metallic texture over the current path. Raising sheenPhase slides the
  // highlights across the ink, which reads as light moving over metal.
  _drawShimmer(ctx, rule, amount) {
    shimmerTiles ??= makeShimmerTiles();
    ctx.save();
    const sheen = ctx.createPattern(shimmerTiles.sheen, 'repeat');
    sheen.setTransform(new DOMMatrix().translate(this.sheenPhase * 40, this.sheenPhase * 25).scale(1.6));
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = amount;
    ctx.fillStyle = sheen;
    ctx.fill(rule);
    const flakes = ctx.createPattern(shimmerTiles.flakes, 'repeat');
    flakes.setTransform(new DOMMatrix().scale(0.7));
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = flakes;
    ctx.fill(rule);
    ctx.restore();
  }

  toSVG() {
    const { width: w, height: h } = this;
    const paths = [];
    for (let p = 0; p < this.polys.length; p++) {
      const { group, color } = this.polys[p];
      let d = '';
      do {
        const { xy, n } = this.polys[p];
        const pts = [];
        for (let i = 0; i < n; i++) pts.push(`${xy[i * 2].toFixed(2)} ${(-xy[i * 2 + 1]).toFixed(2)}`);
        d += `M${pts.join('L')}Z`;
      } while (group && this.polys[p + 1]?.group === group && ++p);
      const extra = group ? ' fill-rule="evenodd"'
        : isTranslucent(color) ? '' : ` stroke="${color}" stroke-width="0.8" stroke-linejoin="round"`;
      paths.push(`<path fill="${color}"${extra} d="${d}"/>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-w / 2} ${-h / 2} ${w} ${h}" width="${w}mm" height="${h}mm">`
      + `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${this.bath}"/>${this._svgBeforeInk()}${paths.join('')}</svg>`;
  }

  // The session as a script that reproduces it exactly.
  toScript() {
    return this.log.map(({ fn, args }) => {
      if (fn === 'wait') return `wait(${args.seconds});`;
      if (fn === 'setBath') return `bath(${JSON.stringify(args)});`;
      if (fn === 'setViscosity') return `viscosity(${JSON.stringify(args)});`;
      return `${fn}(${JSON.stringify(fromMm(fn, args, this))});`;
    }).join('\n');
  }
}

// The commands a script has in scope, taking page units as described in api.js.
export function scriptApi(marble, extras = {}) {
  const api = {
    wait: (s) => marble.wait(s),
    settle: () => marble.settle(),
    allAtOnce: () => marble.allAtOnce(),
    random: () => marble.random(),
    palette,
    PALETTES,
    W: 100,
    H: 100,
    ASPECT: marble.height / marble.width,
  };
  for (const { name, engine, params } of COMMANDS) {
    if (params && name !== 'text') api[name] = (o = {}) => marble[engine ?? name](toMm(name, o, marble));
  }
  return { ...api, ...extras };
}

// Runs a user script with the tank's commands in scope.
export function runScript(marble, source, extras = {}) {
  const api = scriptApi(marble, extras);
  const names = Object.keys(api);
  new Function(...names, source)(...names.map((k) => api[k]));
}
