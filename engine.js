// Marbling engine: no DOM, usable from the browser or Node.
//
// Units: mm, seconds, mL, degrees. Origin at the tank centre, +y up.
//
// Every drop is an outline polygon. Each simulation tick, every active process
// (a growing drop, a moving rake, ...) deforms all outlines by a small amount.
// Because deformations are incremental, processes can overlap in time.
//
// The drop, stir, jiggle and wriggle motions follow the formulas of pst-marble by Aubrey Jaffer
// (LPPL 1.3c), reworked here to apply incrementally, and _tine is translated from it. See NOTICE
// for what changed and the conditions on reusing that code. This is a modified version, not the
// original package, and its authors don't support it. The vortex uses the Lamb-Oseen velocity field.

import { PALETTES, palette } from './palettes.js';
import { makeAir } from './air.js';
import { wrapX, wrapY, doubled, closedDirection, latticeShifts, pushApartTiled, swirlTiled } from './tile.js';
import { cutDisc } from './erase.js';
import { SEAM, seamed } from './seam.js';
import { COMMANDS, toMm, fromMm } from './api.js';
import { planDots, colourDots, dotGrid, clearanceFrom } from './fill.js';
import { ribbon, planStripes } from './paint.js';
import { heartOutline } from './heartshape.js';
import { partialTransport, erode, grow, ccw, polygonArea, keepInside, centreOf } from './stone.js';

const MIN_LEFT = 1; // mm²; the least ink an eraser's cut leaves as its own piece

const DEG = Math.PI / 180;
const GROWTH_DONE = 0.015; // a drop rests when this fraction of its area remains: the rest is too small to watch
const COMPACT_TOLERANCE = 0.04; // mm; about a tenth of a pixel in a 3000 pixel print
const NO_SHIFT = [[0, 0]];
const DETAIL_BUDGET = 60000; // outline points before detail starts to reduce
const MAX_DETAIL = 4;
// With spreading on, ink covers the surface: a drop keeps growing while any of its edge
// faces water, up to its quantity times its spreading. Fully surrounded by ink, it only
// gets this share of that, which is all it has to push the ink around it outward.
const AGAINST_INK_SHARE = 0.25;
// Ox gall. An ink's spreading pressure rises with its gall and levels off: Π(g) = g / (g + GALL_HALF).
// On clear water it spreads to 1 + (most - 1)·Π(g) times its plain area, where most is the bath's
// gall({ most }) (GALL_MOST by default, so gall 1 is the default spreading of 4). Raising most lets
// strong gall reach much further, thinning veins. A drop opens only if its pressure beats the ink
// it lands on.
const GALL_HALF = 1;
const GALL_MOST = 7;
export const gallPressure = (g) => g / (g + GALL_HALF);
const gallSpread = (g, most = GALL_MOST) => 1 + (most - 1) * gallPressure(g);

// Shell (oil in a colour): Jaffer's pigment profile across a drop that landed with radius r is
// τ(a) = exp(−ζa²/r²)·ζe^ζ/(e^ζ − 1), thickest in the middle for ζ > 0 (Jaffer 2019, §6; ζ ≈ 2.25
// matched walnut-oil shells). A shell drop lands as k bands of equal area, and band j, which covers
// a²/r² from j/k to (j+1)/k, takes the mean τ over that span. Its colour follows his tint law,
// I' = 1 − (1 − I)^γ per channel with γ = 1/τ.
export function shellTints(color, zeta, k) {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (!hex || !zeta) return Array(k).fill(color);
  const n = parseInt(hex[1], 16);
  const rgb = [n >> 16, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const norm = (zeta * Math.exp(zeta)) / Math.expm1(zeta);
  return Array.from({ length: k }, (_, j) => {
    const tau = (norm * k * (Math.exp((-zeta * j) / k) - Math.exp((-zeta * (j + 1)) / k))) / zeta;
    const out = rgb.map((I) => Math.round(255 * (1 - (1 - I) ** (1 / tau))));
    return `#${out.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
  });
}
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

const HEART_LAND = 0.6; // seconds a Heart drop takes to land and push the ink round it aside
const TAU_MAX = 4;
const SEAM_SHARE = 0.03; // bare channel between broom cells, as a share of a cell's size (√area)
const BROOM_TAU_MAX = 3.5; // how far a broom cell's ink can be squeezed; by eye on Ilse's photo 31, to measure
const ROUND_SHARE = 0.12;
const NEST_ROUND_SHARE = 0.25; // and their corners round more, as photo 31's blue cells
const BROOM_SPREAD = 2.5; // seconds a broom throw takes to spread out // corner radius, likewise // the most a film can be squeezed: a monolayer collapses past a point (Π–A isotherm)
const HOLES_CLOSE = 0.6; // share of a Stormont hole's area that evaporation closes
const PUSH_RAYS = 720; // directions a bending heart's push is worked out in
const ROUND_ENOUGH = 0.95; // Heart strike bends only loops at least this round: 4πA/P², 1 for a circle

// How far a ray from (cx, cy) along unit (dx, dy) runs before leaving an outline: its farthest
// crossing, so a slightly lumpy loop still gives its outer edge.
function rayReach({ xy, n }, cx, cy, dx, dy) {
  let best = 0;
  for (let i = 0, k = n - 1; i < n; k = i++) {
    const ax = xy[k * 2] - cx, ay = xy[k * 2 + 1] - cy;
    const ex = xy[i * 2] - xy[k * 2], ey = xy[i * 2 + 1] - xy[k * 2 + 1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (ax * ey - ay * ex) / den;
    const u = (ax * dy - ay * dx) / den;
    if (t > best && u >= 0 && u <= 1) best = t;
  }
  return best;
}

// Thickness. A film's thickness τ is its area when it stopped spreading, A₀, over its area now:
// combing is area-preserving and never changes it, but ink squeezed by later throws thickens (and
// Film's give records that). It darkens ink through Jaffer's tint law, I' = 1 − (1 − I)^τ, and
// spares squeezed seams from the ribbon cut, which looks at width × τ. Pieces keep their film's τ.
const outlineArea = ({ xy, n }) => {
  let s = 0;
  for (let i = 0, k = n - 1; i < n; k = i++) s += xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
  return Math.abs(s) / 2;
};
// τ is capped at the film's own spreading: squeezed back to its landing thickness but not past it.
export const thickness = (poly) => (poly.a0 ? Math.max(1, Math.min(poly.tauMax ?? TAU_MAX, poly.a0 / (outlineArea(poly) || poly.a0))) : 1);
const tintCache = new Map();
export function squeezedColour(color, tau) {
  if (tau <= 1.02 || !/^#[0-9a-f]{6}$/i.test(color)) return color;
  const key = `${color}|${Math.round(tau * 20)}`;
  let out = tintCache.get(key);
  if (!out) {
    const n = parseInt(color.slice(1), 16);
    const t = Math.round(tau * 20) / 20;
    out = `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(255 * (1 - (1 - v / 255) ** (1 / t))).toString(16).padStart(2, "0")).join("")}`;
    tintCache.set(key, out);
  }
  return out;
}

// A repeatable random sequence from a seed, so a heart's variation replays exactly.
function seeded(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Thin ribbons. Stretching makes ink ever longer and thinner, and past a certain width it can't be
// seen but still costs points, so every outline simulator cuts ribbons narrower than THINNEST.
const THINNEST = 0.5; // mm
const CUT_EVERY = 15; // ticks
const MIN_CUT = 8; // points
const MIN_PIECE = 24; // points

export class Marble {
  constructor({ width = 1000, height = 700, viscosity = 1000, bath = '#f4efe2',
                film = 0.1, dt = 1 / 30, seed = 1, maxVertices = 400000, pointBudget = null } = {}) {
    Object.assign(this, { width, height, viscosity, bath, film, dt, seed, maxVertices, pointBudget });
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
    this.separateOn = true; // Keep cells separate: fronts that meet keep a hairline seam
    this.seam = SEAM;
    this.tileOn = false;
    this.tileOffset = null;
    this.tileOffsetWanted = null;
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
    // Saved before Keep cells separate existed: it stays as it was, joined, and its log says so, so
    // that undoing (which replays the log on a new tank) keeps it that way.
    if (!('separateOn' in state)) {
      this.separateOn = false;
      this.seam = SEAM;
      this.log.unshift({ fn: 'separate', args: { on: false, at: 0 } });
    }
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

  // Marks where the tank changed simulator. The controller hands the ink to the new engine here;
  // the engine itself only records it.
  simulator({ id, from, at } = {}) {
    this.log.push({ fn: 'simulator', args: { id, from, at } });
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

  // Keep cells separate, on by default: two drops whose spreading fronts meet keep a hairline seam
  // between them, even of one colour, while a drop landing inside a drop of its own colour merges
  // into it. seam is the seam's width in mm (null for the default). Off, touching drops of one
  // colour join, as they did before. Each simulator shows it its own way; see seamSupported.
  separate({ on = true, seam = null, at } = {}) {
    const args = { on };
    if (seam !== null && seam !== undefined) args.seam = seam;
    if (at !== undefined) args.at = at;
    return this._schedule('separate', args, { kind: 'separate', on, seam: seam ?? SEAM });
  }

  // Whether this simulator draws seams yet. Simulators that don't ignore the setting.
  get seamSupported() { return true; }
  get seamsDrawn() { return this.separateOn && this.seamSupported; }

  // Makes the tank a tile that repeats in both directions, so what leaves one edge comes back in
  // at the other. Outlines are never cut at the seam: they stay whole and are drawn at each place
  // they show. Simulators opt in with tileSupported, because all their motion has to repeat too.
  // offset 'brick' shifts each row of tiles by half a tile, and 'halfDrop' each column. See tile.js.
  tile({ on = true, offset = null, at } = {}) {
    if (on && !this.tileSupported) throw new Error('This simulator can\'t repeat yet.');
    if (offset && offset !== 'brick' && offset !== 'halfDrop') throw new Error(`Offset must be 'brick' or 'halfDrop', not '${offset}'.`);
    if (on && offset && !this.tileOffsetSupported) throw new Error('This simulator can\'t do an offset repeat yet.');
    const args = { on };
    if (offset) args.offset = offset;
    if (at !== undefined) args.at = at;
    this.tileWanted = on; // what later commands should expect, ahead of the op running
    this.tileOffsetWanted = on ? offset : null;
    return this._schedule('tile', args, { kind: 'tile', on, offset });
  }

  get tileOffsetSupported() { return true; }

  _applyTile({ on, offset }) {
    this.tileOn = on;
    this.tileOffset = on ? offset ?? null : null;
    if (on) this.wallsOn = false;
  }

  // Applies a change of setting that's waiting, without waiting for the next tick, so it shows on a
  // paused tank. Replaying the log gets to the same place, a tick later.
  applyNow() {
    const now = (o) => (o.kind === 'tile' || o.kind === 'freeze' || o.kind === 'separate') && o.at <= this.time;
    for (const op of this.pending.filter(now)) {
      if (op.kind === 'tile') this._applyTile(op);
      else if (op.kind === 'separate') { this.separateOn = op.on; this.seam = op.seam; this.dirty = true; }
      else this._applyFreeze(op);
    }
    this.pending = this.pending.filter((o) => !now(o));
    return this;
  }

  // ---- Freezing --------------------------------------------------------

  // Frozen ink stays exactly where it is: no tool, drop or flow moves it, and erasers leave it alone.
  // Other ink can then cross it, so frozen ink goes to the top of the pile, and stays there.
  freeze({ x = 0, y = 0, at } = {}) {
    if (!this.freezeSupported) throw new Error('This simulator can\'t freeze ink yet.');
    const args = { x, y };
    if (at !== undefined) args.at = at;
    return this._schedule('freeze', args, { kind: 'freeze', action: 'freeze', x, y });
  }

  unfreeze({ x = 0, y = 0, at } = {}) {
    const args = { x, y };
    if (at !== undefined) args.at = at;
    return this._schedule('unfreeze', args, { kind: 'freeze', action: 'unfreeze', x, y });
  }

  unfreezeAll({ at } = {}) {
    const args = {};
    if (at !== undefined) args.at = at;
    return this._schedule('unfreezeAll', args, { kind: 'freeze', action: 'all' });
  }

  get freezeSupported() { return true; }

  // All the outlines of the topmost shape at a point: one, or all of a printed shape's loops. It
  // can look only at frozen ink. A repeating tank's copies count, wherever they show.
  shapeAt(x, y, { frozen = false } = {}) {
    return this.shapesAt(x, y, { frozen, one: true })[0] ?? null;
  }

  // Every shape whose fill covers a point, topmost first. Ink drawn later lies over earlier ink
  // without cutting it, so one point can be under several.
  shapesAt(x, y, { frozen = false, one = false } = {}) {
    const found = [];
    for (let p = this.polys.length - 1; p >= 0; p--) {
      const first = this.polys[p];
      const loops = [first];
      if (first.group) while (this.polys[p - 1]?.group === first.group) loops.unshift(this.polys[--p]);
      if (frozen && !first.frozen) continue;
      for (const [sx, sy] of this.tileShifts(loops)) {
        let winding = 0;
        let crossings = 0;
        for (const { xy, n } of loops) {
          for (let i = 0, k = n - 1; i < n; k = i++) {
            const ay = xy[k * 2 + 1] + sy, by = xy[i * 2 + 1] + sy;
            if ((ay > y) === (by > y)) continue;
            const ax = xy[k * 2] + sx, bx = xy[i * 2] + sx;
            if (x < ax + ((bx - ax) * (y - ay)) / (by - ay)) {
              crossings++;
              winding += by > ay ? 1 : -1;
            }
          }
        }
        if (first.group ? crossings % 2 : winding) {
          found.push(loops);
          if (one) return found;
          break;
        }
      }
    }
    return found;
  }

  _applyFreeze({ action, x, y }) {
    if (action === 'all') {
      for (const poly of this.polys) delete poly.frozen;
      return;
    }
    const loops = this.shapeAt(x, y, { frozen: action === 'unfreeze' });
    if (!loops) return;
    for (const poly of loops) {
      if (action === 'unfreeze') delete poly.frozen;
      else poly.frozen = true;
    }
    if (action === 'freeze') {
      const moved = new Set(loops);
      this.polys = [...this.polys.filter((p) => !moved.has(p)), ...loops];
    }
  }

  // Classic repeats: every push and drag here has a periodic form in tile.js.
  get tileSupported() { return !this.openWaterOn; }

  // Where to draw an outline, as shifts from where it is, so that it covers the tank.
  tileShifts(polys) {
    if (!this.tileOn) return NO_SHIFT;
    let left = Infinity, right = -Infinity, low = Infinity, high = -Infinity;
    for (const { xy, n } of polys) {
      for (let i = 0; i < n; i++) {
        const x = xy[i * 2], y = xy[i * 2 + 1];
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < low) low = y;
        if (y > high) high = y;
      }
    }
    const W = this.width, H = this.height;
    return latticeShifts(-W / 2 - right, W / 2 - left, -H / 2 - high, H / 2 - low, W, H, this.tileOffset);
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

  // Lays ink along a path, like a loaded brush. See paint.js. It doesn't spread, and it sits on
  // top of what's there without pushing it, but every later tool moves it. seed fixes the wobble.
  paint({ path, width = 30, color = '#1f4e79', shimmer = 0, taper = 0, wobble = 0, swell = 0, period = 0, seed, under = false, at } = {}) {
    if (typeof color === 'object') ({ color, shimmer = 0 } = color); // a palette ink
    const fixed = seed ?? Math.floor(this.random() * 2 ** 31);
    const args = { path: path.map((p) => [...p]), width, color, shimmer, taper, wobble, swell, period, seed: fixed };
    if (under) args.under = under;
    if (at !== undefined) args.at = at;
    const outline = ribbon({ path, width, taper, wobble, swell, period, seed: fixed });
    if (!outline) return null;
    return this._schedule('paint', args, { kind: 'paint', outline, color, shimmer, under });
  }

  // Bands of colour across the whole tank, a starting point for combing.
  stripes({ angle = 0, count = 16, colors = ['#1f4e79'], variation = 0.6, wobble = null, slivers = 0.5, over = true, at } = {}) {
    // Bands running across an offset meet their own copies half a tile along. So they only span half
    // the tile, those copies do the rest, and each needs to be twice as long to come back to itself.
    const off = this.tileOffsetWanted ?? (this.tileOn ? this.tileOffset : null);
    const upright = Math.round(angle / 90) % 2 !== 0;
    const across = (off === 'brick' && upright) || (off === 'halfDrop' && !upright);
    const size = !across ? [this.width, this.height] : upright ? [this.width / 2, this.height * 2] : [this.width * 2, this.height / 2];
    const strokes = planStripes({
      width: size[0], height: size[1], angle, count: across ? Math.ceil(count / 2) : count, variation, wobble, slivers, colors, tiled: this.tileOn || off !== null, random: () => this.random(),
    });
    // Going around existing ink means going under it: it stays in sight, and every tool moves both alike.
    const under = over ? false : this.log.length + 1;
    for (const stroke of strokes) this.paint({ ...stroke, under, at });
    return strokes.length;
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

  // Gall for the whole bath, as a marbler adds a little more with each colour: every drop that
  // doesn't set its own gall gets start + step·k, where k counts the colours thrown before its own
  // since the tank was cleared. With gall in play, a drop opens only over weaker ink; otherwise it
  // stays a dot. on: false goes back to every drop opening as before.
  // most is how far the strongest gall can spread a drop on clear water, as times its plain area.
  setGall({ on = true, start = 1, step = 0.15, most = GALL_MOST } = {}) {
    this.gallBath = { on, start, step };
    this.gallMost = Math.max(2, Math.min(50, most));
    const args = { on, start, step };
    if (this.gallMost !== GALL_MOST) args.most = this.gallMost;
    this.log.push({ fn: 'setGall', args });
    return this;
  }

  // The bath's gall for a drop of this colour, or undefined with bath gall off.
  _bathGall(color) {
    if (!this.gallBath?.on) return undefined;
    this.gallColours ??= [];
    let k = this.gallColours.indexOf(color);
    if (k < 0) k = this.gallColours.push(color) - 1;
    return this.gallBath.start + this.gallBath.step * k;
  }

  // Whether a drop opens, decided as it lands: its gall's pressure against the ink under it.
  // open is the share of the difference, 0 or less meaning it stays a dot at its plain size.
  _openDrop(op) {
    op.pressure = gallPressure(op.gall);
    const under = this.shapeAt(op.x, op.y);
    // Ink from before gall was in play counts as having the default.
    const film = under ? Math.max(...under.map((p) => p.gall ?? gallPressure(this.gallBath?.start ?? 1))) : 0;
    op.open = (op.pressure - film) / op.pressure;
    if (op.open <= 0) op.spreading = 1;
  }

  // Tunes the bath's flow. Only Wake has one, but every simulator keeps the setting.
  setFlow({ cell = 7, friction = 0.25, coast = 25, push = 1 } = {}) {
    this.flowTuning = {
      cell: Math.max(1.5, Math.min(20, cell)),
      friction: Math.max(0, Math.min(10, friction)),
      coast: Math.max(1, Math.min(600, coast)),
      push: Math.max(0, Math.min(20, push)),
    };
    this.log.push({ fn: 'setFlow', args: { ...this.flowTuning } });
    return this;
  }

  // ---- Inks ------------------------------------------------------------

  // Fills the surface with dots of varying size, largest holes first. See fill.js. Sizes are
  // what the dots end up as, so drops are smaller on simulators where ink spreads. Dots go around
  // ink already there or on its way, unless `over` asks for them on top.
  fillDots({ count = 150, min = 8, max = 60, gap = 3, margin = 0, tightness = 0.6, colors = ['#1f4e79'], rings = 1, dispersion = 0.8, shimmer = 0, over = false, gall, at } = {}) {
    const tiled = (this.tileWanted ?? this.tileOn) === true;
    const offset = tiled ? this.tileOffsetWanted ?? this.tileOffset : null;
    const dots = colourDots(planDots({
      width: this.width, height: this.height, minR: min, maxR: max, gap, margin, count, tightness, random: () => this.random(), taken: over ? null : this._takenRoom(tiled, offset), tiled, offset,
    }), colors, () => this.random(), tiled ? { width: this.width, height: this.height, offset } : null);
    const growth = this.spreadFactor;
    for (let ring = 0; ring < rings; ring++) {
      for (const dot of dots) {
        const c = colors[(dot.colorIndex + ring) % colors.length];
        const quantity = ((Math.PI * dot.r * dot.r) / growth / rings) * this.film / 1000;
        // Only the first layer can have a set time. Later ones wait for the last to settle, since
        // two inks spreading from one spot at once push each other into halves, not rings.
        this.drop({ x: dot.x, y: dot.y, quantity, dispersion, gall, color: c, shimmer: typeof c === 'object' ? c.shimmer : shimmer, at: ring ? undefined : at });
      }
      if (ring < rings - 1) this.settle();
    }
    return dots.length;
  }

  // The room ink is using: drops still to land or growing, at the size they'll end up, and what's
  // already on the surface. It can't foresee where tools still in the queue will move anything.
  _takenRoom(tiled = false, offset = null) {
    const circles = [...this.active, ...this.queued]
      .filter((op) => op.kind === 'drop')
      .map((op) => ({ x: op.x, y: op.y, r: Math.sqrt(op.maxArea * this.spreadFactor) }));
    const { step, cols, rows } = dotGrid(this.width, this.height);
    const marked = new Uint8Array(cols * rows);
    const any = this._markInk(marked, cols, rows, step);
    return { circles, clearance: any ? clearanceFrom(marked, cols, rows, step, tiled, offset) : null };
  }

  // Marks the grid points under ink, and any point an outline passes close to, so thin threads
  // between points count too. Returns whether it marked anything.
  _markInk(marked, cols, rows, step) {
    let any = false;
    const put = (col, row) => {
      if (col >= 0 && col < cols && row >= 0 && row < rows) { marked[row * cols + col] = 1; any = true; }
    };
    for (let p = 0; p < this.polys.length; p++) {
      const first = this.polys[p];
      const loops = [first];
      while (first.group && this.polys[p + 1]?.group === first.group) loops.push(this.polys[++p]);
      for (const [sx, sy] of this.tileShifts(loops)) {
        const lines = new Map();
        for (const { xy, n } of loops) {
          for (let i = 0, k = n - 1; i < n; k = i++) {
            const ax = (xy[k * 2] + sx + this.width / 2) / step;
            const ay = (xy[k * 2 + 1] + sy + this.height / 2) / step;
            const bx = (xy[i * 2] + sx + this.width / 2) / step;
            const by = (xy[i * 2 + 1] + sy + this.height / 2) / step;
            put(Math.round(bx), Math.round(by));
            const from = Math.max(0, Math.ceil(Math.min(ay, by)));
            const to = Math.min(rows - 1, Math.ceil(Math.max(ay, by)) - 1);
            for (let row = from; row <= to; row++) {
              let list = lines.get(row);
              if (!list) lines.set(row, list = []);
              list.push(ax + ((bx - ax) * (row - ay)) / (by - ay));
            }
          }
        }
        for (const [row, list] of lines) {
          list.sort((a, b) => a - b);
          for (let q = 0; q + 1 < list.length; q += 2) {
            for (let col = Math.max(0, Math.ceil(list[q])); col <= list[q + 1] && col < cols; col++) put(col, row);
          }
        }
      }
    }
    return any;
  }

  // A spray of many fine dots, most of them tiny, thickest in the middle like a real spray.
  // min and max are the radii the dots end up at.
  // skew shapes the mix of sizes between min and max: 3 (the default) makes most dots tiny, 1 spreads
  // them evenly on a log scale, below 1 favours big ones.
  spray({ x = 0, y = 0, radius = 150, n = 150, min = 0.5, max = 6, skew = 3, colors = ['#1f4e79'], dispersion = 4, stagger = 0.4, gall, at } = {}) {
    const start = at ?? this._now;
    const growth = this.spreadFactor;
    for (let i = 0; i < n; i++) {
      const angle = this.random() * 2 * Math.PI;
      const reach = radius * Math.sqrt(-Math.log(1 - this.random() * 0.98)) / 2;
      const r = min * (max / min) ** (this.random() ** skew);
      this.drop({
        x: x + reach * Math.cos(angle),
        y: y + reach * Math.sin(angle),
        quantity: ((Math.PI * r * r) / growth) * this.film / 1000,
        dispersion,
        gall,
        color: colors[Math.floor(this.random() * colors.length)],
        at: this.orderGap !== null && at === undefined ? undefined : start + this.random() * stagger,
      });
    }
    return this;
  }

  // How many times its plain area a lone drop finally covers, at the default spreading. The same in
  // every simulator, so a drop of a given size comes out the same size whichever one is chosen.
  get spreadFactor() { return 4; }

  // The area a drop grows to in still water: its plain area times its spreading, as a lone drop does
  // in the film simulators, except a drop placed whole (dispersion Infinity) stays at its plain size.
  _stillArea(op) { return op.dispersion === Infinity ? op.maxArea : op.maxArea * op.spreading; }


  // quantity: mL. dispersion: spreading rate (1/s), larger is faster. spreading: how many
  // times its plain size the ink can stretch over water, like adding surfactant to a paint.
  // shimmer (0..1) makes the ink metallic.
  // gall: its ox gall; left out, the bath's (see setGall), or none, which opens as always.
  // oil makes a Shell: rings darker in the middle than at the edge (negative oil, the other way
  // round), in bands of equal area, thrown one after another at the same spot.
  // turpentine (0 to 1) makes a Stormont: as the colour spreads it breaks into a lace of holes,
  // more and finer with more turpentine. evaporation (seconds) lets them partly close again.
  drop({ x = 0, y = 0, quantity = 1, dispersion = 0.8, spreading = 4, gall, oil = 0, bands = 5, turpentine = 0, evaporation = 0, color = '#1f4e79', shimmer = 0, at } = {}) {
    if (typeof color === 'object') ({ color, shimmer = 0 } = color); // a palette ink
    const args = { x, y, quantity, dispersion, spreading, color, shimmer };
    if (gall !== undefined && gall !== null) args.gall = gall;
    if (turpentine > 0) Object.assign(args, { turpentine, evaporation });
    if (oil) {
      args.oil = oil;
      args.bands = bands;
      if (at !== undefined) args.at = at;
      const k = Math.max(2, Math.min(12, Math.round(bands)));
      // The halo lands first and spreads like any drop; the bands after it land in its middle at
      // their plain size, so each is exactly its share. Darkest last, so it ends in the middle.
      const tints = shellTints(color, 3 * oil, k);
      const g = gall ?? this._bathGall(color);
      const reach = g === undefined ? spreading : spreading * gallSpread(g, this.gallMost) / gallSpread(1);
      const op = { kind: 'shell', x, y, quantity, dispersion, spreading, reach, gall: g, shimmer, k, tints, next: 0, current: null };
      return this._schedule('drop', args, op);
    }
    if (at !== undefined) args.at = at;
    const g = gall ?? this._bathGall(color);
    // 'clear' is gall water: no colour of its own. Inside ink it cuts a real hole, showing the bare
    // bath, and on open water it only pushes.
    const clear = color === 'clear';
    const maxArea = maxRadius(quantity, this.film) ** 2;
    const growTime = dispersion === Infinity ? 0 : -Math.log(GROWTH_DONE) / dispersion;
    const op = {
      kind: 'drop', x, y, color, shimmer, quantity, dispersion, maxArea, growTime, grown: 0, elapsed: 0, poly: null,
      exposure: 1, owed: 0, spreading,
      gall: g,
    };
    if (clear) { op.clear = true; op.color = 'rgba(0,0,0,0)'; }
    // More gall, further spread; gall 1 is the default spreading.
    if (g !== undefined) op.spreading = spreading * gallSpread(g, this.gallMost) / gallSpread(1);
    if (turpentine > 0) op.stormont = { turpentine: Math.min(1, turpentine), evaporation, thrown: false };
    return this._schedule('drop', args, op);
  }

  // A heart of ink, landing whole. It takes the area a lone drop of the same quantity spreads to,
  // pushes the ink round it aside as it lands, as a drop's growth does, then holds its shape: it
  // never spreads, so its fine point lasts until a tool moves it. angle turns it, 0 point down.
  // variation (0 to 1) makes each heart a little different.
  heartDrop({ x = 0, y = 0, quantity = 1, angle = 0, variation = 0.3, color = '#1f4e79', shimmer = 0, seed, at } = {}) {
    if (typeof color === 'object') ({ color, shimmer = 0 } = color); // a palette ink
    const fixed = seed ?? Math.floor(this.random() * 2 ** 31);
    const args = { x, y, quantity, angle, variation, color, shimmer, seed: fixed };
    if (at !== undefined) args.at = at;
    const area = Math.PI * maxRadius(quantity, this.film) ** 2 * this.spreadFactor;
    const op = { kind: 'heartDrop', x, y, area, angle, variation, color, shimmer, seed: fixed, duration: HEART_LAND, elapsed: 0, grown: 0, poly: null };
    return this._schedule('heartDrop', args, op, HEART_LAND);
  }

  _advanceHeartDrop(op, dt) {
    const [, p] = this._ramp(op, dt);
    const target = op.area * p;
    const da = target - op.grown;
    if (da <= 0 && op.poly) return op.elapsed >= op.duration;
    // The heart steps out of the way while everything else is pushed, then comes back larger.
    const at = op.poly ? this.polys.indexOf(op.poly) : -1;
    if (at >= 0) this.polys.splice(at, 1);
    op.grown = target;
    const place = () => {
      const heart = heartOutline({ x: op.x, y: op.y, area: Math.max(target, 1e-3), angle: op.angle, variation: op.variation, random: seeded(op.seed) });
      op.poly ??= { color: op.color, shimmer: op.shimmer, shaping: true };
      op.poly.xy = heart.xy;
      op.poly.n = heart.n;
      if (at >= 0 && at <= this.polys.length) this.polys.splice(at, 0, op.poly);
      else this.polys.push(op.poly);
    };
    if (da > 0 && this._flushGrowth === Marble.prototype._flushGrowth) {
      // Pushed in the same pass as any drops still growing, as they push each other, so none of
      // them is knocked off its own middle. The heart goes back once that pass is done.
      this.growth.push([op.x, op.y, da / Math.PI]);
      (this._afterGrowth ??= []).push(place);
    } else {
      if (da > 0) this._pushApart([[op.x, op.y, da / Math.PI]]);
      place();
    }
    if (op.elapsed < op.duration) return false;
    delete op.poly.shaping;
    return true;
  }

  // A clear drop that opened inside a colour becomes a hole in it: its outline joins the colour's
  // even-odd group, right after the colour's own loops, so the bath shows through it.
  // It cuts every shape under it, each getting its own copy of the hole: the copies start alike and
  // every engine moves points by where they are, so they stay together.
  _joinCut(op) {
    const targets = (Array.isArray(op.cut) ? op.cut : [op.cut]).filter((t) => this.polys.includes(t) && !t.frozen);
    const was = this.polys.indexOf(op.poly);
    if (was < 0 || !targets.length) return;
    this.polys.splice(was, 1);
    targets.forEach((target, k) => {
      const hole = k ? { xy: Float64Array.from(op.poly.xy), n: op.poly.n } : op.poly;
      target.group ??= this.nextGroup++;
      Object.assign(hole, { group: target.group, color: target.color, shimmer: target.shimmer });
      let at = this.polys.indexOf(target);
      while (this.polys[at + 1]?.group === target.group) at++;
      this.polys.splice(at + 1, 0, hole);
    });
  }

  // Stormont. Turpentine in the colour reaches the surface as tiny spots of low tension, each of
  // which thins the film until it punctures (Néel & Villermaux 2018), so the colour breaks into a
  // lace of holes and "flies out". Here the holes are clear drops seeded inside the colour as it
  // spreads: Poisson-disc spaced, log-normal in size, and together 35 to 70% of its area. They open
  // almost at once, as real ones do in milliseconds, and are real holes: the bath shows through.
  _throwHoles(op) {
    const s = op.stormont;
    s.thrown = true;
    const { xy, n } = op.poly;
    let twice = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0, k = n - 1; i < n; k = i++) {
      twice += xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
      x0 = Math.min(x0, xy[i * 2]); x1 = Math.max(x1, xy[i * 2]);
      y0 = Math.min(y0, xy[i * 2 + 1]); y1 = Math.max(y1, xy[i * 2 + 1]);
    }
    const area = Math.abs(twice) / 2;
    const t = s.turpentine;
    const spacing = Math.sqrt(area / Math.PI) / (4 + 12 * t);
    const inside = (px, py) => {
      let c = false;
      for (let i = 0, k = n - 1; i < n; k = i++) {
        const yi = xy[i * 2 + 1], yk = xy[k * 2 + 1];
        if ((yi > py) !== (yk > py) && px < ((xy[k * 2] - xy[i * 2]) * (py - yi)) / (yk - yi) + xy[i * 2]) c = !c;
      }
      return c;
    };
    const spots = [];
    const most = Math.min(700, Math.ceil(area / (0.9 * spacing * spacing)));
    for (let tries = 0; tries < most * 30 && spots.length < most; tries++) {
      const px = x0 + this.random() * (x1 - x0);
      const py = y0 + this.random() * (y1 - y0);
      if (!inside(px, py) || spots.some(([qx, qy]) => (qx - px) ** 2 + (qy - py) ** 2 < spacing * spacing)) continue;
      spots.push([px, py]);
    }
    if (!spots.length) return;
    // Log-normal sizes, scaled so the holes come to their share of the colour's area.
    const gauss = () => Math.sqrt(-2 * Math.log(1 - this.random())) * Math.cos(2 * Math.PI * this.random());
    const weights = spots.map(() => Math.exp(1.0 * gauss())); // heavy-tailed: mostly tiny, a few large
    const total = weights.reduce((a, b) => a + b, 0);
    const share = (0.35 + 0.35 * t) * area;
    const log = this.log;
    const live = this._live;
    this.log = [];
    this._live = true;
    const holes = spots.map(([hx, hy], i) => {
      const a = (share * weights[i]) / total;
      const hole = this.drop({ x: hx, y: hy, quantity: (a * this.film) / 1000, dispersion: 25, spreading: 1, color: 'clear', at: this.time });
      // Through this colour and everything drawn beneath it, never through ink lying on top.
      const under = this.shapesAt(hx, hy).map((loops) => loops[0]);
      const k = under.indexOf(op.poly);
      hole.cut = k >= 0 ? under.slice(k) : [op.poly];
      return { hole, area: a };
    });
    this.log = log;
    this._live = live;
    // Through pending, since this runs while the active list is being filtered.
    if (s.evaporation > 0) {
      this.pending.push({ kind: 'stormont', holes, evaporation: s.evaporation, at: this.time });
      this.pending.sort((a, b) => a.at - b.at);
    }
  }

  // As the turpentine evaporates, the holes close again by about this share of their area,
  // pulling the colour back in, so the lace thickens and the colour pales back.
  _advanceStormont(op) {
    if (op.holes.some(({ hole }) => this.pending.includes(hole) || this.active.includes(hole))) return false;
    const log = this.log;
    const live = this._live;
    this.log = [];
    this._live = true;
    for (const { hole, area } of op.holes) {
      this.erase({ x: hole.x, y: hole.y, radius: Math.sqrt((HOLES_CLOSE * area) / Math.PI), duration: op.evaporation, at: this.time });
    }
    this.log = log;
    this._live = live;
    return true;
  }

  // Throws a shell's next band once the last is half grown. The bands aren't logged: the shell's
  // own drop() is, and replaying it throws them again the same way.
  _advanceShell(op) {
    const c = op.current;
    const growing = c && (this.pending.includes(c) || this.active.includes(c));
    if (growing && c.elapsed < 0.5 * c.growTime) return false;
    if (op.next >= op.k) return !growing;
    const j = op.k - 1 - op.next; // outermost band first
    const halo = op.next === 0;
    const log = this.log;
    const live = this._live;
    this.log = [];
    this._live = true;
    // Each band lands where the last one's middle has been pushed to, so the rings stay centred.
    if (c) { op.x = c.x; op.y = c.y; }
    op.current = this.drop({
      x: op.x, y: op.y,
      quantity: halo ? op.quantity / op.k : (op.quantity * op.reach) / op.k,
      dispersion: op.dispersion * 2,
      spreading: halo ? op.spreading : 1,
      gall: op.gall,
      color: op.tints[j], shimmer: op.shimmer, at: this.time,
    });
    this.log = log;
    this._live = live;
    op.next++;
    return false;
  }

  _advanceHeartBend(op, dt) {
    const [p0, p] = this._ramp(op, dt);
    // Ink beyond each heart makes room for it first, ray by ray. Along a ray r² grows by the same
    // amount everywhere past the old loop, which keeps every area. The hearts are drawn after.
    for (const { field, pushes } of op.bends) {
      if (!pushes || p <= p0) continue;
      const { x: cx, y: cy, reach, push } = field;
      const dp = p - p0;
      const move = (x, y, out) => {
        const dx = x - cx;
        const dy = y - cy;
        const r2 = dx * dx + dy * dy;
        let t = Math.atan2(dy, dx);
        if (t < 0) t += 2 * Math.PI;
        const f = (t / (2 * Math.PI)) * PUSH_RAYS;
        const k = Math.floor(f) % PUSH_RAYS;
        const w = f - Math.floor(f);
        const r0 = reach[k] * (1 - w) + reach[(k + 1) % PUSH_RAYS] * w;
        const e = push[k] * (1 - w) + push[(k + 1) % PUSH_RAYS] * w;
        if (e <= 0 || r2 <= r0 * r0 * 0.98) { out[0] = x; out[1] = y; return; }
        const a = Math.sqrt(1 + (e * dp) / r2);
        out[0] = cx + dx * a;
        out[1] = cy + dy * a;
      };
      this._map(move);
      // Other hearts still bending move whole, with their middles.
      const out = [0, 0];
      for (const other of op.bends) {
        if (!other.pushes || other.field === field) continue;
        move(other.field.x, other.field.y, out);
        other.field.x = out[0];
        other.field.y = out[1];
      }
    }
    for (const { poly, from, to, n, field } of op.bends) {
      if (poly.frozen) continue;
      // A fresh outline each tick, so refining or thinning in between can't throw the points out of step.
      const xy = new Float64Array(n * 4);
      const sx = field.x - field.cx;
      const sy = field.y - field.cy;
      for (let i = 0; i < n * 2; i += 2) {
        xy[i] = from[i] + (to[i] - from[i]) * p + sx;
        xy[i + 1] = from[i + 1] + (to[i + 1] - from[i + 1]) * p + sy;
      }
      poly.xy = xy;
      poly.n = n;
    }
    if (op.elapsed < op.duration) return false;
    for (const { poly } of op.bends) delete poly.shaping;
    return true;
  }

  // A broom-straw throw: many drops of one colour at once, of very different sizes (log-normal,
  // spread is σ), spreading a long way. Each keeps its own cell: where two meet, a seam of bare bath
  // `seam` mm wide stays between them, as in stone and vein marbling, instead of the colour joining.
  broom({ n = 60, x = 0, y = 0, w = this.width, h = this.height, size = 0.15, spread = 1, spreading = 25, dispersion = 1.5, gall, seam = 1.5, color = '#1f4e79', shimmer = 0, at } = {}) {
    if (typeof color === 'object') ({ color, shimmer = 0 } = color);
    const args = { n, x, y, w, h, size, spread, spreading, dispersion, seam, color, shimmer };
    if (gall !== undefined && gall !== null) args.gall = gall;
    if (at !== undefined) args.at = at;
    // Where the drops land and how much ink each carries are drawn now, so a replay matches.
    const gauss = () => Math.sqrt(-2 * Math.log(1 - this.random())) * Math.cos(2 * Math.PI * this.random());
    const drops = Array.from({ length: n }, () => ({
      x: x + (this.random() - 0.5) * w,
      y: y + (this.random() - 0.5) * h,
      quantity: size * Math.exp(spread * Math.max(-2.5, Math.min(2.5, gauss()))), // no freak giants
    }));
    return this._schedule('broom', args, { kind: 'broom', drops, spreading, seam, color, shimmer }, 0.5);
  }

  // The throw lands as its settled layout (stone.js). Cells form a tree, a Voronoi treemap
  // (Nocaj & Brandes 2012): a drop falling in an earlier colour's cell becomes its child, one on bare
  // bath is a top-level cell, and one in a cell of its own colour joins it. Each throw re-solves the
  // whole tree of cells that haven't been combed yet, top down: every cell gets its own ink plus its
  // children's, cells on bare bath share straight walls and leave bare size where they don't reach,
  // and children are laid out inside their parent, whose own ink is left as a rim squeezed no
  // thinner than its cap, so it darkens (τ). A drop on combed or ordinary ink falls back to a drop.
  _landBroom(op) {
    const plain = (q) => Math.PI * maxRadius(q, this.film) ** 2;
    // Still as laid out? Refining and thinning points keep a cell's area, middle and perimeter;
    // combing moves the middle or stretches the perimeter.
    const shape = (p) => {
      let twice = 0, cx = 0, cy = 0, perimeter = 0;
      for (let i = 0, k = p.n - 1; i < p.n; k = i++) {
        const cross = p.xy[k * 2] * p.xy[i * 2 + 1] - p.xy[i * 2] * p.xy[k * 2 + 1];
        twice += cross;
        cx += (p.xy[k * 2] + p.xy[i * 2]) * cross;
        cy += (p.xy[k * 2 + 1] + p.xy[i * 2 + 1]) * cross;
        perimeter += Math.hypot(p.xy[i * 2] - p.xy[k * 2], p.xy[i * 2 + 1] - p.xy[k * 2 + 1]);
      }
      return { area: Math.abs(twice) / 2, x: cx / (3 * twice), y: cy / (3 * twice), perimeter };
    };
    const laid = (p) => {
      if (!p.cell || !p.laid || !this.polys.includes(p)) return false;
      const now = shape(p);
      const was = p.laid;
      return Math.abs(now.area - was.area) < 0.01 * was.area && Math.hypot(now.x - was.x, now.y - was.y) < 0.5
        && Math.abs(now.perimeter - was.perimeter) < 0.01 * was.perimeter;
    };
    // The first tick sorts the drops into the tree; every tick after re-solves it as they grow.
    if (!op.top) {
    op.top = this.polys.filter((p) => laid(p) && !(p.parentCell && laid(p.parentCell)));
    const laidBefore = op.top.length > 0;
    op.start = this.time;
    const top = op.top;
    const log = this.log;
    const live = this._live;
    for (const d of op.drops) {
      const area = plain(d.quantity) * op.spreading;
      const under = this.shapesAt(d.x, d.y)[0]?.[0] ?? null;
      if (under && laid(under) && under.color === op.color) { under.own += area; continue; }
      if (under && !laid(under)) {
        // Lands on ink the layout can't hold: an ordinary drop, unlogged.
        this.log = [];
        this._live = true;
        this.drop({ x: d.x, y: d.y, quantity: d.quantity, spreading: op.spreading, color: op.color, shimmer: op.shimmer, at: this.time });
        this.log = log;
        this._live = live;
        continue;
      }
      const cell = { xy: new Float64Array(0), n: 0, color: op.color, shimmer: op.shimmer, cell: true, site: [d.x, d.y], own: area, kids: [], tauMax: Math.min(op.spreading, BROOM_TAU_MAX), parentCell: under, fresh: true };
      if (under) {
        // Where it landed in its parent, relative to the parent's centre and size, so it moves
        // with the parent when the parent is laid out again.
        const c0 = centreOf(Array.from(under.xy.subarray(0, under.n * 2)));
        cell.rel = { dx: d.x - c0.x, dy: d.y - c0.y, area: c0.area };
        under.kids.push(cell);
      } else {
        // A later colour landing on bare bath spreads as a disc until it meets ink, so its corners
        // stay rounder than a first throw's packed cells.
        if (laidBefore) cell.roundShare = NEST_ROUND_SHARE;
        top.push(cell);
      }
    }
    }
    const top = op.top;
    // New cells grow as fronts spread on a deep layer (area ∝ t^¾, Jensen 1995), each tick a
    // settled layout (the films' pressure evens out far faster than the fronts move).
    const e = (this.time - op.start) / BROOM_SPREAD;
    const done = e >= 1;
    const grown = done ? 1 : Math.max(0.02, e ** 0.75);
    const ownNow = (c) => (c.fresh ? c.own * grown : c.own);
    const W = this.width, H = this.height;
    const total = (c) => ownNow(c) + c.kids.filter((k) => !k.gone).reduce((sum, k) => sum + total(k), 0);
    const placed = [];
    const layout = (cells, domain, most = Infinity, nested = false) => {
      if (!cells.length || domain.length < 6) { for (const c of cells) c.gone = true; return; }
      const room = Math.min(most, 0.97 * polygonArea(domain));
      // New ink spreads in full and squeezes the older: each cell's own ink gives first, down to
      // its cap, and only then do the children inside it give too.
      const own = cells.map(ownNow);
      const inner = cells.map((c) => total(c) - ownNow(c));
      const sumOwn = own.reduce((a, b) => a + b, 0);
      const sumInner = inner.reduce((a, b) => a + b, 0);
      // Ink thrown just now doesn't give; it's what does the squeezing.
      const give = (c) => (c.fresh ? 1 : c.tauMax);
      const least = cells.reduce((a, c) => a + ownNow(c) / give(c), 0);
      // share: the area each cell's own ink is left with at this level, which sets its thickness.
      let share;
      if (sumOwn + sumInner <= room) share = own.slice();
      else if (least + sumInner <= room) {
        const f = (room - sumInner - least) / (sumOwn - least);
        share = cells.map((c, k) => own[k] / give(c) + (own[k] - own[k] / give(c)) * f);
      } else {
        // Older ink is at its cap; the new ink inside takes whatever room is left. Only if even the
        // capped ink can't fit does everything shrink together.
        share = cells.map((c, k) => own[k] / give(c));
        const left = room - least;
        if (left > 0) for (let k = 0; k < cells.length; k++) inner[k] *= left / sumInner;
        else {
          const g = room / least;
          for (let k = 0; k < cells.length; k++) { share[k] *= g; inner[k] = 0; }
        }
      }
      const want = cells.map((c, k) => share[k] + inner[k]);
      cells.forEach((c, k) => { c.share = share[k]; });
      // Each cell is drawn eroded by half its channel, so it asks the solve for that much more:
      // its drawn area is then what it was allotted, and the ink between cells is what's left.
      const gapOf = (a) => Math.max(op.seam, (nested ? 0 : SEAM_SHARE) * Math.sqrt(a));
      let ask = want.map((a) => a + 1.1 * 2 * Math.sqrt(Math.PI * a) * (gapOf(a) / 2));
      // Never more than the domain holds, or the transport has no solution.
      const askSum = ask.reduce((a, b) => a + b, 0);
      const holds = 0.995 * polygonArea(domain);
      if (askSum > holds) ask = ask.map((a) => (a * holds) / askSum);
      // A parent's cell moves when it's laid out again; its children's sites stay inside it.
      if (nested) {
        const now = centreOf(domain);
        for (const c of cells) {
          const k = c.rel ? Math.sqrt(now.area / c.rel.area) : 0;
          c.site = keepInside(domain, c.rel ? [now.x + c.rel.dx * k, now.y + c.rel.dy * k] : c.site);
        }
      }
      const solved = partialTransport(cells.map((c) => c.site), ask, domain, { weights: cells.map((c) => c.psi), iterations: done ? 60 : 4 });
      const shapes = solved.cells;
      cells.forEach((c, k) => { c.psi = solved.weights[k]; });
      cells.forEach((c, k) => {
        const outer = shapes[k];
        // A channel of bare size between cells, wider for bigger cells, with rounded corners.
        const size = outer.length >= 6 ? Math.sqrt(polygonArea(outer)) : 0;
        // Inside a parent, the gap between siblings is the parent's own ink, squeezed into a net as
        // thin as its share allows: a hairline seam, the rest of its ink lying as the rim.
        const gap = nested ? op.seam : Math.max(op.seam, SEAM_SHARE * size);
        const round = (c.roundShare ?? (nested ? NEST_ROUND_SHARE : ROUND_SHARE)) * size;
        const pts = outer.length >= 6 ? grow(erode(outer, gap / 2 + round), round) : [];
        if (pts.length < 6) { c.gone = true; return; }
        const m = pts.length / 2;
        c.xy = new Float64Array(m * 4);
        c.xy.set(pts);
        c.n = m;
        c.laid = shape(c);
        placed.push(c);
        const kids = c.kids.filter((x) => !x.gone);
        // Ink thrown just now is what squeezes; it isn't squeezed itself.
        // Thickness from what the layout allotted the cell's own ink, not from the gaps drawn
        // around it: a rim round children is as squeezed as its share says.
        const tauOf = () => (c.fresh ? 1 : Math.min(c.tauMax, Math.max(1, ownNow(c) / Math.max(1e-9, c.share))));
        if (!kids.length) { c.a0 = tauOf() * polygonArea(pts); return; }
        // Children inside, leaving the parent's own ink as a rim no thinner than its cap allows.
        const inside = erode(pts, op.seam);
        const area = polygonArea(pts);
        // Children fill what the parent's own share leaves (never squeezing it past its cap).
        const kidRoom = Math.max(0, area - Math.max(c.share, ownNow(c) / c.tauMax));
        layout(kids, inside, kidRoom, true);
        c.a0 = tauOf() * area;
      });
    };
    // Whether a cell fits is re-decided every tick: a drop too small to show at first still grows.
    const clear = (c) => { delete c.gone; for (const k of c.kids ?? []) clear(k); };
    for (const c of top) clear(c);
    // The tank's walls bound the cells only with Hard edges (or a repeating tank, where the cells
    // must stay within one tile). On open water, cells near an edge carry on past it, rounded, as
    // any drop does, instead of pressing flat against an edge that isn't there.
    const pad = this.wallsOn || this.tileOn ? 0 : Math.max(W, H);
    const X = W / 2 + pad, Y = H / 2 + pad;
    layout(top, [-X, -Y, X, -Y, X, Y, -X, Y]);
    if (done) for (const c of placed) delete c.fresh;
    // The laid-out cells replace their old outlines, parents before their children so children
    // draw on top; everything else keeps its place.
    const keep = this.polys.filter((p) => !placed.includes(p) && !(p.cell && p.laid && p.gone));
    const ordered = [];
    const add = (c) => { if (c.gone || !placed.includes(c)) return; ordered.push(c); for (const k of c.kids) add(k); };
    for (const c of top) add(c);
    this.polys = [...keep, ...ordered];
    this.dirty = true;
    return done;
  }

  // Pulls a cell's edge in by half a seam, once it has stopped spreading, so the bath shows between
  // it and its neighbours. Each point moves along the outline's inward normal there.
  _insetCell(poly, seam) {
    const { xy, n } = poly;
    if (n < 3 || !seam) return;
    let twice = 0;
    for (let i = 0, k = n - 1; i < n; k = i++) twice += xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
    const inward = twice > 0 ? 1 : -1; // counter-clockwise outlines have the inside to the left
    const d = seam / 2;
    const out = new Float64Array(xy.length);
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, b = (i + 1) % n;
      const tx = xy[b * 2] - xy[a * 2], ty = xy[b * 2 + 1] - xy[a * 2 + 1];
      const len = Math.hypot(tx, ty) || 1;
      out[i * 2] = xy[i * 2] - (ty / len) * d * inward;
      out[i * 2 + 1] = xy[i * 2 + 1] + (tx / len) * d * inward;
    }
    poly.xy = out;
  }

  // n drops scattered in a w x h box, each with a random start within `stagger` seconds.
  drops({ n = 20, x = 0, y = 0, w = this.width, h = this.height, quantity = 0.5, spread = 0.3,
          dispersion = 0.8, spreading = 4, gall, colors = ['#1f4e79'], stagger = 0, at } = {}) {
    const start = at ?? this._now;
    for (let i = 0; i < n; i++) {
      this.drop({
        x: x + (this.random() - 0.5) * w,
        y: y + (this.random() - 0.5) * h,
        quantity: quantity * (1 + (this.random() * 2 - 1) * spread),
        dispersion,
        spreading,
        gall,
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
    // A tine's pull reaches about seven times L. It must fit in the tank (in a repeating tank's
    // tile), or a thin bath lets one small comb drag the whole sheet; and a comb's tines mustn't
    // reach through each other, or they move the sheet as one paddle.
    op.L = Math.min(op.L, Math.min(this.width, this.height) / 14);
    if (offs.length > 1) {
      const sorted = [...offs].sort((a, b) => a - b);
      let gap = Infinity;
      for (let k = 1; k < sorted.length; k++) gap = Math.min(gap, sorted[k] - sorted[k - 1]);
      if (gap > 0) op.L = Math.max(0.25, Math.min(op.L, gap / 2));
    }
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
    if (this.tileWanted ?? this.tileOn) {
      const kx = (2 * Math.PI * op.nx) / period;
      const ky = (2 * Math.PI * op.ny) / period;
      let mx = Math.round((kx * this.width) / (2 * Math.PI));
      let my = Math.round((ky * this.height) / (2 * Math.PI));
      if (!mx && !my) { if (Math.abs(kx) * this.width >= Math.abs(ky) * this.height) mx = Math.sign(kx) || 1; else my = Math.sign(ky) || 1; }
      // An offset allows half waves along the doubled side, as long as mx + my is even.
      const off = this.tileOffsetWanted ?? this.tileOffset;
      const [wide, tall] = doubled(off);
      if (off) {
        const exactX = (kx * this.width * wide) / (2 * Math.PI);
        const exactY = (ky * this.height * tall) / (2 * Math.PI);
        mx = Math.round(exactX);
        my = Math.round(exactY);
        if ((mx + my) % 2) {
          if (Math.abs(exactX - mx) > Math.abs(exactY - my)) mx += exactX > mx ? 1 : -1;
          else my += exactY > my ? 1 : -1;
        }
        if (!mx && !my) { if (off === 'brick') my = 2; else mx = 2; }
      }
      const fx = (2 * Math.PI * mx) / (this.width * wide);
      const fy = (2 * Math.PI * my) / (this.height * tall);
      const k = Math.hypot(fx, fy);
      Object.assign(op, { period: (2 * Math.PI) / k, nx: fx / k, ny: fy / k });
    }
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

  get eraseSupported() { return true; }

  // Drains ink away at a point: the opposite of a drop, by the same formula read backwards. Everything
  // inside radius goes to the centre and is gone, and the rest of the surface slides in to fill the
  // space, so the area lost is exactly the disc's.
  // With mode 'lift', only the ink goes: it's cut out at once, and the water and everything else stay put.
  erase({ x = 0, y = 0, radius = 10, duration = 1, mode = 'drain', at } = {}) {
    const args = { x, y, radius, duration, mode };
    if (at !== undefined) args.at = at;
    if (mode === 'lift') return this._schedule('erase', args, { kind: 'lift', x, y, radius }, 0, false);
    return this._schedule('erase', args, { kind: 'erase', x, y, radius, duration, elapsed: 0 }, duration, true);
  }

  // A breath of air: a smooth random flow over the whole bath that stretches ink without
  // changing its area. The same seed gives the same breath, and a fresh one is drawn otherwise.
  air({ scale = 200, speed = 50, octaves = 2, duration = 2, seed, at } = {}) {
    if (seed === undefined || seed === null) seed = Math.floor(this.random() * 2 ** 31);
    const args = { scale, speed, octaves, duration, seed };
    if (at !== undefined) args.at = at;
    const op = { kind: 'air', scale, speed, octaves: Math.max(1, Math.min(4, Math.round(octaves))), duration, seed, elapsed: 0 };
    return this._schedule('air', args, op, duration, true);
  }

  // The breath's velocity field. Ops are copied into saved states, so the field lives apart from them.
  _airField(op) {
    const tiled = this.tileOn;
    const off = tiled ? this.tileOffset : null;
    const key = `${op.seed}/${op.scale}/${op.speed}/${op.octaves}/${tiled ? `tiled${off}` : 'plain'}`;
    this._airs ??= new Map();
    let field = this._airs.get(key);
    if (!field) {
      // On a repeating tank the eddies tile the sheet: a whole number of them each way.
      const [wide, tall] = doubled(off);
      const W = this.width * wide, H = this.height * tall;
      const period = tiled ? [Math.max(1, Math.round(W / op.scale)), Math.max(1, Math.round(H / op.scale))] : null;
      const scale = tiled ? [W / period[0], H / period[1]] : op.scale;
      const copy = off === 'brick' ? [this.width / 2, this.height] : off === 'halfDrop' ? [this.width, this.height / 2] : null;
      field = makeAir({ seed: op.seed, scale, speed: op.speed, octaves: op.octaves, period, copy });
      this._airs.set(key, field);
    }
    return field;
  }

  shift({ dx = 0, dy = 0, duration = 1, at } = {}) {
    const args = { dx, dy, duration };
    if (at !== undefined) args.at = at;
    return this._schedule('shift', args, { kind: 'shift', dx, dy, duration, elapsed: 0 }, duration, true);
  }

  turn({ x = 0, y = 0, degrees = 90, duration = 1, at } = {}) {
    // A rotation can't repeat across the seams of a repeating tank.
    if (this.tileWanted ?? this.tileOn) throw new Error('A repeating tank can\'t be turned. Use shift, stir or air instead.');
    const args = { x, y, degrees, duration };
    if (at !== undefined) args.at = at;
    return this._schedule('turn', args, { kind: 'turn', x, y, degrees, duration, elapsed: 0 }, duration, true);
  }

  // ---- Simulation ------------------------------------------------------

  // A straight full rake starts past the tank's corners. On a repeating tank there's no such place: those
  // tines' copies are already inside, in the middle of the page, and come back in on new rows. So here
  // each tooth starts where its path crosses a seam, and travels one lap, ending where it began. Teeth
  // run as far apart as they would on a tank that doesn't repeat.
  _fullRakeLaps(lap, { teeth, offset, speed, D, waveAmp, waveLength, waveShape, width, overhang = 0, at }) {
    const { width: W, height: H } = this;
    const off = this.tileOffsetWanted ?? this.tileOffset;
    const c = lap.x / lap.length;
    const s = lap.y / lap.length;
    const across = Math.abs(s) * W + Math.abs(c) * H;
    const count = Math.max(1, Math.round((lap.gap * teeth) / across));
    const firstAt = at ?? this._now;
    const ops = [];
    // A lap along the tank's own sides (half-drop going across, brick going up or down) crosses the
    // tile a whole number of times in a straight line.
    const straight = Math.abs(lap.x) < 1e-9 || Math.abs(lap.y) < 1e-9;
    const parts = Math.round(lap.length / (Math.abs(lap.y) < 1e-9 ? W : H));
    const wrapped = (t, sideways) => {
      const x = c * t - s * sideways;
      const y = s * t + c * sideways;
      return [wrapX(x, y, W, H, off), wrapY(x, y, W, H, off)];
    };
    for (let k = 0; k < count; k++) {
      const sideways = ((((k + 0.5) * lap.gap) / count + offset) % lap.gap + lap.gap) % lap.gap - lap.gap / 2;
      // Walk along the path until it jumps across the seam it mostly runs at.
      const axis = Math.abs(c) >= Math.abs(s) ? 0 : 1;
      const size = axis ? H : W;
      let from = null;
      let last = wrapped(0, sideways);
      for (let t = 1; t <= lap.length && !from; t++) {
        const here = wrapped(t, sideways);
        if (Math.abs(here[axis] - last[axis]) > size / 2) from = here;
        last = here;
      }
      from ??= wrapped(0, sideways);
      if (straight) {
        // Each tile-width of the lap is its own tine, and they all go at once, as on a tank with no
        // offset. One long tine would sweep the tile's rows one after another.
        for (let p = 0; p < parts; p++) {
          const x = from[0] + c * size * p;
          const y = from[1] + s * size * p;
          const start = [wrapX(x, y, W, H, off) - c * overhang, wrapY(x, y, W, H, off) - s * overhang];
          const end = [start[0] + c * (size + 2 * overhang), start[1] + s * (size + 2 * overhang)];
          ops.push(this.rake({ from: start, to: end, offsets: [0], speed, D, waveAmp, waveLength, waveShape, width, at: ops.length ? firstAt : at }));
        }
        continue;
      }
      const to = [from[0] + lap.x, from[1] + lap.y];
      ops.push(this.rake({ from, to, offsets: [0], speed, D, waveAmp, waveLength, waveShape, width, at: k ? firstAt : at }));
    }
    const op = ops.at(-1);
    op.together = ops;
    return op;
  }

  // A small tine through the middle of every loop that isn't frozen, which pulls round dots into hearts.
  // above and below are how far it starts and ends from the middle, as a percentage of the way from
  // there to the loop's edge, so 100 is the edge. pull is its reach, as a percentage of the loop's radius.
  // Loops are found when this starts, so it works on ink still to land. Loops sharing a middle, like
  // the rings of a target, are one shape and get one tine. min and max limit it to loops of that radius.
  //
  // style 'bend' (the default) instead bends every loop that is already round (roundness, 4πA/P², at
  // least 0.95) into a heart of the same area and middle, over duration seconds, pointing the way
  // angle says. The rings of a target bend together and stay nested. variation (0 to 1) makes each
  // heart a little different. Odd shapes are left alone.
  hearts({ angle = 270, style = 'bend', variation = 0.3, above = 130, below = 130, pull = 25, min = 0, max = 1e6, speed = 200, duration = 1.5, seed, at } = {}) {
    if (!this.freezeSupported) throw new Error('This simulator can\'t find loops to rake yet.');
    // Logged, so a replay bends the same hearts whatever else has used the random sequence.
    const fixed = seed ?? Math.floor(this.random() * 2 ** 31);
    const args = { angle, style, variation, above, below, pull, min, max, speed, duration, seed: fixed };
    if (at !== undefined) args.at = at;
    return this._schedule('hearts', args, { kind: 'hearts', ...args, elapsed: 0 }, style === 'bend' ? duration : 0, true);
  }

  // The loops Heart strike's bend would change, grouped by shared middle, biggest first:
  // { cx, cy, r, loops }. Prints and frozen ink are left out, and so is anything not round enough.
  roundBodies({ min = 0, max = 1e6 } = {}) {
    const measured = [];
    for (const poly of this.polys) {
      if (poly.frozen || poly.group || poly.n < 8) continue;
      const { xy, n } = poly;
      let twice = 0, cx = 0, cy = 0, perimeter = 0;
      for (let i = 0, k = n - 1; i < n; k = i++) {
        const cross = xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
        twice += cross;
        cx += (xy[k * 2] + xy[i * 2]) * cross;
        cy += (xy[k * 2 + 1] + xy[i * 2 + 1]) * cross;
        perimeter += Math.hypot(xy[i * 2] - xy[k * 2], xy[i * 2 + 1] - xy[k * 2 + 1]);
      }
      const area = Math.abs(twice) / 2;
      if (area < 1e-6 || (4 * Math.PI * area) / (perimeter * perimeter) < ROUND_ENOUGH) continue;
      measured.push({ poly, area, cx: cx / (3 * twice), cy: cy / (3 * twice), r: Math.sqrt(area / Math.PI) });
    }
    measured.sort((a, b) => b.area - a.area);
    const bodies = [];
    for (const m of measured) {
      const home = bodies.find((b) => Math.hypot(b.cx - m.cx, b.cy - m.cy) < 0.2 * b.r);
      if (home) home.loops.push(m);
      else bodies.push({ cx: m.cx, cy: m.cy, r: m.r, loops: [m] });
    }
    return bodies.filter(({ r }) => r >= min && r <= max);
  }

  // What each round loop becomes: its outline now and its heart, with the same points, so the bend
  // can move each point straight along its ray from the middle. { poly, from, to, n } per loop.
  heartBends({ angle = 270, variation = 0.3, min = 0, max = 1e6, seed = 1 } = {}) {
    const bends = [];
    const random = seeded(seed);
    for (const body of this.roundBodies({ min, max })) {
      // One set of proportions for the whole body, so its rings stay nested.
      const bodySeed = Math.floor(random() * 2 ** 31);
      // How much further out the heart reaches than the old outer loop, ray by ray, as a difference
      // of squared radii: what the ink beyond it is pushed by, so it makes room as a drop's growth does.
      const outer = body.loops[0];
      const outerHeart = heartOutline({ x: body.cx, y: body.cy, area: outer.area, angle: angle + 90, variation, random: seeded(bodySeed) });
      const reach = new Float64Array(PUSH_RAYS);
      const push = new Float64Array(PUSH_RAYS);
      for (let k = 0; k < PUSH_RAYS; k++) {
        const t = (2 * Math.PI * k) / PUSH_RAYS;
        const r0 = rayReach(outer.poly, body.cx, body.cy, Math.cos(t), Math.sin(t));
        const r1 = rayReach(outerHeart, body.cx, body.cy, Math.cos(t), Math.sin(t));
        reach[k] = r0;
        push[k] = Math.max(0, r1 * r1 - r0 * r0);
      }
      // x, y is where the body's middle has been pushed to by other hearts as they bend.
      const field = { cx: body.cx, cy: body.cy, x: body.cx, y: body.cy, reach, push };
      for (const { poly, area } of body.loops) {
        const heart = heartOutline({ x: body.cx, y: body.cy, area, angle: angle + 90, variation, random: seeded(bodySeed) });
        const from = new Float64Array(heart.n * 4);
        for (let i = 0; i < heart.n; i++) {
          const dx = heart.xy[i * 2] - body.cx;
          const dy = heart.xy[i * 2 + 1] - body.cy;
          const len = Math.hypot(dx, dy) || 1;
          const r = rayReach(poly, body.cx, body.cy, dx / len, dy / len);
          from[i * 2] = body.cx + (dx / len) * r;
          from[i * 2 + 1] = body.cy + (dy / len) * r;
        }
        bends.push({ poly, from, to: heart.xy, n: heart.n, field, pushes: poly === outer.poly });
      }
    }
    return bends;
  }

  // The line of each heart's tine, for what's on the tank now: { from, to, L, loops }.
  heartPaths({ angle = 270, above = 130, below = 130, pull = 25, min = 0, max = 1e6 } = {}) {
    const c = Math.cos(angle * DEG);
    const s = Math.sin(angle * DEG);
    const bodies = [];
    for (let p = 0; p < this.polys.length; p++) {
      const first = this.polys[p];
      const loops = [first];
      while (first.group && this.polys[p + 1]?.group === first.group) loops.push(this.polys[++p]);
      if (first.frozen) continue;
      let twice = 0, cx = 0, cy = 0;
      for (const { xy, n } of loops) {
        for (let i = 0, k = n - 1; i < n; k = i++) {
          const cross = xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
          twice += cross;
          cx += (xy[k * 2] + xy[i * 2]) * cross;
          cy += (xy[k * 2 + 1] + xy[i * 2 + 1]) * cross;
        }
      }
      if (Math.abs(twice) < 1e-6) continue;
      cx /= 3 * twice;
      cy /= 3 * twice;
      let back = 0, ahead = 0;
      for (const { xy, n } of loops) {
        for (let i = 0; i < n; i++) {
          const d = (xy[i * 2] - cx) * c + (xy[i * 2 + 1] - cy) * s;
          if (d < back) back = d;
          if (d > ahead) ahead = d;
        }
      }
      bodies.push({ cx, cy, back: -back, ahead, r: Math.sqrt(Math.abs(twice) / 2 / Math.PI), loops });
    }
    bodies.sort((a, b) => b.r - a.r);
    const kept = [];
    for (const b of bodies) {
      if (kept.some((o) => Math.hypot(o.cx - b.cx, o.cy - b.cy) < 0.2 * o.r)) continue;
      kept.push(b);
    }
    return kept.filter(({ r }) => r >= min && r <= max).map(({ cx, cy, back, ahead, r, loops }) => ({
      from: [cx - c * back * (above / 100), cy - s * back * (above / 100)],
      to: [cx + c * ahead * (below / 100), cy + s * ahead * (below / 100)],
      L: Math.max(0.25, (r * pull) / 100),
      loops,
    }));
  }

  // Each tine is an ordinary rake, except that only the hearts command itself is in the log.
  _startHearts(op) {
    if (op.style === 'bend') {
      op.bends = this.heartBends(op);
      for (const { poly, from, n } of op.bends) { poly.xy = Float64Array.from(from); poly.n = n; poly.shaping = true; }
      this.active.push(op);
      return;
    }
    const log = this.log;
    const live = this._live;
    this.log = [];
    this._live = true;
    for (const { from, to, L } of this.heartPaths(op)) {
      const rake = this.rake({ from, to, offsets: [0], speed: op.speed, D: 10, at: this.time });
      if (rake) rake.L = this.tileOn ? Math.min(L, Math.min(this.width, this.height) / 14) : L;
    }
    this.log = log;
    this._live = live;
  }

  // A rake across the whole tank: teeth spread evenly, travelling along angle
  // (0 is +x, 90 is +y, 180 is -x, 270 is -y). offset slides the teeth sideways in mm, wrapping at the edges.
  fullRake({ angle = 0, teeth = 10, offset = 0, speed = 200, D = 10, waveAmp = 0, waveLength = 100, waveShape = 'sine', width = 0, overhang, at } = {}) {
    // How far the teeth start and end past the tank's edges. On a repeating tank anything past one
    // edge is raked again at the other, so there it defaults to none.
    overhang ??= (this.tileWanted ?? this.tileOn) ? 0 : 20;
    // On a repeating tank a slanted rake goes round in laps. See _fullRakeLaps.
    if (this.tileWanted ?? this.tileOn) {
      const lap = closedDirection(angle, this.width, this.height, this.tileOffsetWanted ?? this.tileOffset);
      const clean = Math.abs(lap.y) < 1e-9 ? lap.length === this.width : Math.abs(lap.x) < 1e-9 && lap.length === this.height;
      if (!clean) return this._fullRakeLaps(lap, { teeth, offset, speed, D, waveAmp, waveLength, waveShape, width, overhang, at });
      angle = lap.angle;
    }
    const c = Math.cos(angle * DEG);
    const s = Math.sin(angle * DEG);
    const along = (Math.abs(c) * this.width + Math.abs(s) * this.height) / 2 + overhang;
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
  get detailBudget() { return this.pointBudget ?? DETAIL_BUDGET; }

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
      if (poly.frozen) continue;
      const { xy, n } = poly;
      for (let i = 0; i < n * 2; i += 2) {
        apply(xy[i], xy[i + 1]);
        xy[i] = out[0];
        xy[i + 1] = out[1];
      }
    }
    for (const op of this.sources) {
      if (op.poly?.frozen) continue;
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
  // A push of `a` (as a share of the offset) stops at the ink's edge when the drop has a limit.
  _limitedPush(a, dx, dy, d2, limit) {
    if (!limit) return a;
    const d = Math.sqrt(d2);
    if (d > limit.farthest + PUSH_FADE * 5) return 0;
    const u = (Math.atan2(dy, dx) / (2 * Math.PI) + 1) * PUSH_DIRECTIONS;
    const k = Math.floor(u);
    const t = u - k;
    const R = limit[k % PUSH_DIRECTIONS] * (1 - t) + limit[(k + 1) % PUSH_DIRECTIONS] * t;
    // Past the ink's edge is water, which carries no pressure.
    if (d > R) {
      const beyond = d - R;
      if (beyond > PUSH_FADE * 5) return 0;
      a *= Math.exp(-beyond / PUSH_FADE);
    }
    return a;
  }

  _pushApart(sources) {
    if (this.tileOn) return pushApartTiled(this, sources);
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
          const a = this._limitedPush(Math.sqrt(1 + sa[i] / d2) - 1, dx, dy, d2, limits[i]);
          if (!a) continue;
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
    // Against ink a drop gets a share of its spread: with gall, its pressure's margin over the ink.
    const floor = op.open === undefined ? limit * AGAINST_INK_SHARE : Math.max(op.maxArea, limit * Math.min(1, op.open));
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
    const target = this._stillArea(op) * frac;
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
      const n = op.cut ? 16 : 48; // holes are many and small; refining adds points where they grow
      const xy = new Float64Array(n * 4);
      for (let i = 0; i < n; i++) {
        xy[i * 2] = op.x + r * Math.cos((i / n) * 2 * Math.PI);
        xy[i * 2 + 1] = op.y + r * Math.sin((i / n) * 2 * Math.PI);
      }
      op.poly = { xy, n, color: op.color, shimmer: op.shimmer };
      if (op.pressure !== undefined) op.poly.gall = op.pressure;
      if (op.cell) op.poly.cell = true;
      this.polys.push(op.poly);
      if (op.cut) this._joinCut(op);
    }
    this.landing = [];
  }

  // Moves one tine from (bx,by) to (ex,ey).
  // Modified from /stylus-deformation in pst-marble.pro, copyright Aubrey Jaffer, LPPL 1.3c: translated
  // to JavaScript, applied tick by tick, with a limited reach, and measured across a repeating tank's
  // seams. NOTICE lists the conditions on reusing this function.
  _tine(bx0, by0, ex0, ey0, L) {
    const len = Math.hypot(ex0 - bx0, ey0 - by0);
    if (len < 1e-9) return;
    const rpts = Math.ceil(len / L);
    const tU = len / rpts;
    const nx = (ex0 - bx0) / len;
    const ny = (ey0 - by0) / len;
    const reach2 = (6 * L + tU) ** 2;
    const tiled = this.tileOn;
    const off = this.tileOffset;
    const { width: W, height: H } = this;
    for (let k = 0; k < rpts; k++) {
      const bx = bx0 + nx * tU * k;
      const by = by0 + ny * tU * k;
      const ex = bx + nx * tU;
      const ey = by + ny * tU;
      this._map((px, py, out) => {
        out[0] = px;
        out[1] = py;
        // On a repeating tank the tine pulls from its nearest image.
        const dxB = tiled ? wrapX(bx - px, by - py, W, H, off) : bx - px;
        const dyB = tiled ? wrapY(bx - px, by - py, W, H, off) : by - py;
        const r2 = dxB * dxB + dyB * dyB;
        if (r2 > reach2 || r2 < 1e-18) return;
        const r = Math.sqrt(r2);
        const dxE = dxB + (ex - bx);
        const dyE = dyB + (ey - by);
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
    const tiled = this.tileOn;
    const { width: W, height: H } = this;
    // A smooth flow with no sides to fall on, so ink can't tear apart at the tine's centre line.
    // It stays slower than the tine, so ink slips past instead of riding along on its front.
    for (let k = 0; k < steps; k++) {
      const cx = bx + nx * ds * (k + 0.5);
      const cy = by + ny * ds * (k + 0.5);
      this._map((px, py, out) => {
        out[0] = px;
        out[1] = py;
        const rx = tiled ? wrapX(px - cx, py - cy, W, H, this.tileOffset) : px - cx;
        const ry = tiled ? wrapY(px - cx, py - cy, W, H, this.tileOffset) : py - cy;
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
        if (this.tileOn) {
          // On a tile the twist repeats through a periodic flow; the in-and-out part doesn't repeat and is left out.
          swirlTiled(this, op.x, op.y, (rho, out) => { out[0] = da * Math.sin(k * rho); out[1] = da * k * Math.cos(k * rho); return out; });
          break;
        }
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
        if (this.tileOn) {
          swirlTiled(this, op.x, op.y, (rho, out) => {
            let a = 0, slope = 0;
            for (const r of op.radii) {
              const R = Math.abs(r);
              const e = Math.sign(r) * Math.exp((-Math.abs(rho - R) * op.Linv) / R);
              a += e;
              slope += e * (-Math.sign(rho - R) * op.Linv) / R;
            }
            out[0] = a * dth;
            out[1] = slope * dth;
            return out;
          });
          break;
        }
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
        if (this.tileOn) {
          swirlTiled(this, op.x, op.y, (rho, out) => {
            const r2 = rho * rho;
            if (r2 < 1e-9) { out[0] = (gamma / nu4t) * dt; out[1] = 0; return out; }
            const e = Math.exp(-r2 / nu4t);
            const omega = (gamma / r2) * (1 - e);
            out[0] = omega * dt;
            // d omega / d rho
            out[1] = ((-2 * gamma / (r2 * rho)) * (1 - e) + (gamma / r2) * e * (2 * rho / nu4t)) * dt;
            return out;
          });
          break;
        }
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
      case 'air': {
        // The breath blows for its duration, easing in and out, carrying ink along the flow.
        const span = op.duration * dp;
        if (span <= 0) break;
        const { velocity } = this._airField(op);
        const u = [0, 0];
        this._map((x, y, out) => {
          velocity(x, y, u);
          const mx = x + (u[0] * span) / 2;
          const my = y + (u[1] * span) / 2;
          velocity(mx, my, u);
          out[0] = x + u[0] * span;
          out[1] = y + u[1] * span;
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
      case 'erase': {
        const s = -op.radius * op.radius * dp;
        if (this.tileOn) pushApartTiled(this, [[op.x, op.y, s]]);
        else {
          this._map((x, y, out) => {
            const dx = x - op.x;
            const dy = y - op.y;
            const d2 = dx * dx + dy * dy;
            const a = d2 + s > 0 ? Math.sqrt(1 + s / d2) : 0;
            out[0] = op.x + dx * a;
            out[1] = op.y + dy * a;
          }, { slowNearWalls: false, clamp: false });
        }
        if (op.elapsed >= op.duration) this._dropCollapsed();
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

  // Whether any of an edge might show. Both its ends can be outside with its middle across the tank,
  // as on a long straight band, so this goes by the box around it.
  _edgeInView(ax, ay, bx, by) {
    if (this.tileOn) return true; // every point shows somewhere
    const mx = this.width / 2 + this.width * 0.1;
    const my = this.height / 2 + this.height * 0.1;
    return Math.max(ax, bx) > -mx && Math.min(ax, bx) < mx && Math.max(ay, by) > -my && Math.min(ay, by) < my;
  }

  _inView(x, y) {
    if (this.tileOn) return true; // every point shows somewhere
    const mx = this.width / 2 + this.width * 0.1;
    const my = this.height / 2 + this.height * 0.1;
    return x > -mx && x < mx && y > -my && y < my;
  }

  // How many vertices each outline needs so that no edge in view is longer than lim.
  _extraVertices(lim, extras) {
    let sum = 0;
    for (let p = 0; p < this.polys.length; p++) {
      const { xy, n } = this.polys[p];
      let extra = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = xy[i * 2], ay = xy[i * 2 + 1], bx = xy[j * 2], by = xy[j * 2 + 1];
        if (!this._edgeInView(ax, ay, bx, by)) continue;
        const len = Math.hypot(bx - ax, by - ay);
        if (len > lim) extra += Math.ceil(len / lim) - 1;
      }
      extras[p] = extra;
      sum += extra;
    }
    return sum;
  }

  // Adds vertices where stretching has made edges too long to look smooth. maxVertices is a
  // real limit: when the ink needs more, every edge gets coarser so that the total still fits.
  _refine() {
    let total = 0;
    for (const poly of this.polys) total += poly.n;
    if (total >= this.maxVertices) { this.capped = true; return; }
    this.capped = false;
    // Past the budget, trade fine detail for speed instead of slowing without limit.
    this.detail = Math.min(MAX_DETAIL, Math.max(1, total / this.detailBudget));
    let lim = this.maxEdge * this.detail;
    const extras = new Int32Array(this.polys.length);
    let needed = this._extraVertices(lim, extras);
    const room = this.maxVertices - total;
    while (needed > room) {
      this.capped = true;
      lim *= Math.max(1.1, needed / room);
      needed = this._extraVertices(lim, extras);
    }
    for (let p = 0; p < this.polys.length; p++) {
      const poly = this.polys[p];
      const { xy, n } = poly;
      const extra = extras[p];
      if (!extra) continue;
      const out = xy.length >= (n + extra) * 2 ? new Float64Array(xy.length)
                                                : new Float64Array((n + extra) * 4);
      let w = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = xy[i * 2], ay = xy[i * 2 + 1], bx = xy[j * 2], by = xy[j * 2 + 1];
        out[w++] = ax;
        out[w++] = ay;
        if (!this._edgeInView(ax, ay, bx, by)) continue;
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
        // Distance to the segment, not the line through it: a thin spike running out along the
        // line and back is close to the line but far from the segment, and must not be cut off
        // as a straight chord.
        for (let i = from + 1; i < to; i++) {
          const px = xy[i * 2] - ax, py = xy[i * 2 + 1] - ay;
          const t = len > 1e-12 ? Math.max(0, Math.min(1, (px * (bx - ax) + py * (by - ay)) / (len * len))) : 0;
          const d = Math.hypot(px - t * (bx - ax), py - t * (by - ay));
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
  // Cuts a circle out of the ink. On a repeating tank outlines stay whole across the seams, so each
  // one is cut wherever an image of the circle reaches it.
  _liftInk({ x, y, radius }) {
    const { width: W, height: H } = this;
    const step = Math.min(1.5, radius / 6);
    const shoelace = ({ xy, n }) => {
      let sum = 0;
      for (let i = 0, k = n - 1; i < n; k = i++) sum += xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
      return Math.abs(sum);
    };
    const cutAll = (poly, cx, cy) => {
      const xy = poly.xy;
      const pieces = cutDisc(xy, poly.n, cx, cy, radius, step);
      if (!pieces) return [poly];
      const left = pieces.map((p) => ({ ...poly, xy: p, n: p.length / 2, from: poly.from ?? poly }));
      // Crumbs where cuts nearly met would otherwise stay as specks and threads.
      return left.filter((p) => shoelace(p) > 2 * MIN_LEFT);
    };
    const kept = [];
    const gone = new Set();
    for (const poly of this.polys) {
      if (poly.frozen) { kept.push(poly); continue; }
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < poly.n; i++) {
        x0 = Math.min(x0, poly.xy[i * 2]);
        x1 = Math.max(x1, poly.xy[i * 2]);
        y0 = Math.min(y0, poly.xy[i * 2 + 1]);
        y1 = Math.max(y1, poly.xy[i * 2 + 1]);
      }
      let pieces = [poly];
      const images = this.tileOn
        ? latticeShifts(x0 - radius - x, x1 + radius - x, y0 - radius - y, y1 + radius - y, W, H, this.tileOffset)
        : [[0, 0]];
      for (const [sx, sy] of images) pieces = pieces.flatMap((p) => cutAll(p, x + sx, y + sy));
      if (!pieces.length) { gone.add(poly); continue; }
      if (pieces.length === 1 && pieces[0] === poly) { kept.push(poly); continue; }
      // The largest piece carries on as this outline, since drops and prints keep hold of it.
      let largest = pieces[0];
      for (const p of pieces) if (shoelace(p) > shoelace(largest)) largest = p;
      for (const p of pieces) {
        if (p === largest) {
          poly.xy = p.xy;
          poly.n = p.n;
          kept.push(poly);
        } else kept.push(p);
      }
    }
    this.polys = kept;
    this.sources = this.sources.filter((op) => !gone.has(op.poly));
    this.active = this.active.filter((op) => !gone.has(op.poly));
  }

  // Forgets ink that an eraser has taken down to a point, and the points an eraser piled up at its
  // centre on outlines that survive.
  _dropCollapsed() {
    const gone = new Set();
    for (const poly of this.polys) {
      const { xy, n } = poly;
      let w = 0;
      for (let i = 0; i < n; i++) {
        const x = xy[i * 2], y = xy[i * 2 + 1];
        if (w && Math.abs(x - xy[w * 2 - 2]) < 1e-9 && Math.abs(y - xy[w * 2 - 1]) < 1e-9) continue;
        xy[w * 2] = x;
        xy[w * 2 + 1] = y;
        w++;
      }
      poly.n = w;
      let sum = 0;
      for (let i = 0, k = w - 1; i < w; k = i++) sum += xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
      if (w < 3 || Math.abs(sum) < 0.02) gone.add(poly); // less than a hundredth of a square millimetre
    }
    if (!gone.size) return;
    this.polys = this.polys.filter((p) => !gone.has(p));
    this.sources = this.sources.filter((op) => !gone.has(op.poly));
    this.active = this.active.filter((op) => !gone.has(op.poly));
  }

  _cullOutside() {
    if (this.wallsOn || this.tileOn) return;
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
      if (op.kind === 'separate') {
        this.separateOn = op.on;
        this.seam = op.seam;
        this.dirty = true;
        continue;
      }
      if (op.kind === 'walls') {
        this.wallsOn = op.on;
        if (op.on) { this.tileOn = false; this._fitInside(); }
        continue;
      }
      if (op.kind === 'tile') {
        this._applyTile(op);
        continue;
      }
      if (op.kind === 'freeze') {
        this._applyFreeze(op);
        continue;
      }
      if (op.kind === 'hearts') {
        this._startHearts(op);
        continue;
      }
      if (op.kind === 'lift') {
        this._liftInk(op);
        continue;
      }
      if (op.kind === 'paint') {
        const poly = { xy: Float64Array.from(op.outline), n: op.outline.length / 2, color: op.color, shimmer: op.shimmer };
        if (op.under) {
          // Beneath everything already there, but above the rest of the same batch.
          poly.under = op.under;
          let at = 0;
          this.polys.forEach((p, i) => { if (p.under === op.under) at = i + 1; });
          this.polys.splice(at, 0, poly);
        } else this.polys.push(poly);
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
        if (op.gall !== undefined) this._openDrop(op);
        if (op.clear) {
          // Gall water too weak to open over the ink just sinks (Woolnough: "will just sink").
          if (op.open !== undefined && op.open <= 0) continue;
          // It cuts through every layer of ink at that point, down to the bath.
          op.cut ??= this.shapesAt(op.x, op.y).map((loops) => loops[0]);
          if (!op.cut.length) op.cut = null;
        }
        this.sources.push(op);
      }
      this.active.push(op);
    }
    this.active = this.active.filter((op) => {
      if (op.kind === 'drop') {
        const done = this._advanceDrop(op, dt);
        if (op.stormont && !op.stormont.thrown && op.poly && done) this._throwHoles(op); // once it has spread, so no solid core is left
        if (done && op.cell && op.poly) this._insetCell(op.poly, op.cell);
        if (done && op.poly && !op.poly.a0 && !op.poly.group) {
          op.poly.a0 = outlineArea(op.poly);
          op.poly.tauMax = Math.max(1, op.spreading ?? TAU_MAX);
        }
        return !done;
      }
      if (op.kind === 'stormont') return !this._advanceStormont(op);
      if (op.kind === 'heartDrop') return !this._advanceHeartDrop(op, dt);
      if (op.kind === 'shell') return !this._advanceShell(op);
      if (op.kind === 'broom') return !this._landBroom(op);
      if (op.kind === 'hearts') return !this._advanceHeartBend(op, dt);
      if (op.kind === 'rake') return !this._advanceRake(op, dt);
      return !this._advanceTimed(op, dt);
    });
    this._flushGrowth();
    if (this._afterGrowth) {
      const waiting = this._afterGrowth;
      this._afterGrowth = null;
      for (const fn of waiting) fn();
    }
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
    if (this.tick % CUT_EVERY === 0 && this.polys.length && this._wantsCut()) this._cutFilaments();
  }

  // Whether to cut thin ribbons this tick: while a tool is moving ink, but not while a drop is
  // still growing, whose fresh outline is all close points.
  _wantsCut() { return this.active.length > 0 && !this.active.some((op) => op.kind === 'drop'); }

  // Contour surgery: stretching makes ribbons of ink ever longer and thinner, and each needs more
  // points to draw, though past a certain width it can't be seen. So where an outline comes within
  // THINNEST of itself, its thin end is cut off, or if both sides are large it becomes two outlines.
  _cutFilaments() {
    // At least as big as the longest edge, so that a nearby edge is always found from either end.
    const cell = Math.max(4, this.maxEdge * this.detail * 1.5);
    const key = (x, y) => (Math.floor(x / cell) + 2048) * 4096 + Math.floor(y / cell) + 2048;
    const out = [];
    for (const poly of this.polys) {
      if (poly.group || poly.n < 64 || poly.shaping) { out.push(poly); continue; } // shaping: a heart landing or bending
      const pieces = this._cutOutline(poly, cell, key);
      for (const piece of pieces) out.push(piece);
    }
    if (out.length !== this.polys.length || out.some((p, i) => p !== this.polys[i])) this.polys = out;
  }

  _cutOutline(poly, cell, key) {
    const { xy, n } = poly;
    const tau = thickness(poly);
    const buckets = new Map();
    for (let i = 0; i < n; i++) {
      const k = key(xy[i * 2], xy[i * 2 + 1]);
      const list = buckets.get(k);
      if (list) list.push(i);
      else buckets.set(k, [i]);
    }
    const near2 = THINNEST * THINNEST;
    const closest = (i) => {
      const x = xy[i * 2];
      const y = xy[i * 2 + 1];
      let best = -1;
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const list = buckets.get(key(x + a * cell, y + b * cell));
          if (!list) continue;
          for (const j of list) {
            // Points just along the outline from here are close because they're neighbours.
            if (j <= i + MIN_CUT || n - (j - i) <= MIN_CUT || j + 1 >= n) continue;
            const ax = xy[j * 2];
            const ay = xy[j * 2 + 1];
            const dx = xy[j * 2 + 2] - ax;
            const dy = xy[j * 2 + 3] - ay;
            const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
            const ex = ax + dx * t - x;
            const ey = ay + dy * t - y;
            if (ex * ex + ey * ey < near2 && j > best) best = j;
          }
        }
      }
      return best;
    };
    const piece = (from, to) => {
      const count = to - from + 1;
      const copy = new Float64Array(count * 4);
      copy.set(xy.subarray(from * 2, (to + 1) * 2));
      return { ...poly, xy: copy, n: count, from: poly.from ?? poly };
    };
    const areaLength = (from, to) => {
      let area = 0;
      let length = 0;
      for (let i = from; i < to; i++) {
        area += xy[i * 2] * xy[i * 2 + 3] - xy[i * 2 + 2] * xy[i * 2 + 1];
        length += Math.hypot(xy[i * 2 + 2] - xy[i * 2], xy[i * 2 + 3] - xy[i * 2 + 1]);
      }
      area += xy[to * 2] * xy[from * 2 + 1] - xy[from * 2] * xy[to * 2 + 1];
      return [Math.abs(area) / 2, length];
    };
    const kept = [];
    const extra = [];
    let i = 0;
    while (i < n) {
      kept.push(i);
      const j = closest(i);
      if (j < 0) { i++; continue; }
      const [area, length] = areaLength(i, j);
      if ((area / length) * tau >= THINNEST) {
        // A big piece behind a thin neck stands alone, unless it would take almost the whole outline.
        if (j - i < n - MIN_PIECE && j - i >= MIN_PIECE) extra.push(piece(i + 1, j));
        else { i++; continue; }
      }
      i = j + 1;
    }
    if (kept.length === n) return [poly];
    if (kept.length < 16) return [poly];
    const cleaned = new Float64Array(kept.length * 4);
    kept.forEach((v, w) => {
      cleaned[w * 2] = xy[v * 2];
      cleaned[w * 2 + 1] = xy[v * 2 + 1];
    });
    poly.xy = cleaned;
    poly.n = kept.length;
    // Pieces and what's left keep the film's thickness.
    if (poly.a0) for (const p of [poly, ...extra]) p.a0 = outlineArea(p) * tau;
    return [poly, ...extra];
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
    const half = this.seamsDrawn ? this.seam / 2 : 0;
    for (let p = 0; p < this.polys.length; p++) {
      const { group, shimmer } = this.polys[p];
      const color = squeezedColour(this.polys[p].color, thickness(this.polys[p]));
      const first = p;
      ctx.beginPath();
      // Loops of one printed shape share a path, so inner loops become holes.
      do {
        const { n } = this.polys[p];
        // With Keep cells separate, every loop is drawn half a seam into its ink (a hole's outward).
        const xy = half ? seamed(this.polys[p].xy, n, half, p === first) : this.polys[p].xy;
        // Points closer than a third of a pixel can't change the picture.
        const skip = (0.33 / pxPerMm) ** 2;
        for (const [sx, sy] of this.tileShifts([this.polys[p]])) {
          ctx.moveTo(xy[0] + sx, xy[1] + sy);
          let lx = xy[0], ly = xy[1];
          for (let i = 1; i < n; i++) {
            const x = xy[i * 2], y = xy[i * 2 + 1];
            const dx = x - lx, dy = y - ly;
            if (dx * dx + dy * dy < skip) continue;
            ctx.lineTo(x + sx, y + sy);
            lx = x;
            ly = y;
          }
          ctx.closePath();
        }
      } while (group && this.polys[p + 1]?.group === group && ++p);
      ctx.fillStyle = color;
      ctx.fill(group ? 'evenodd' : 'nonzero');
      // A hairline closes the sliver of water between near-touching drops, so drops of
      // one colour join. See-through ink would show it as a darker edge, so it's skipped, and
      // with Keep cells separate there's a seam to show instead.
      if (!half && !group && !this.polys[p].cell && !isTranslucent(color)) {
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
    const half = this.seamsDrawn ? this.seam / 2 : 0;
    for (let p = 0; p < this.polys.length; p++) {
      const { group, cell } = this.polys[p];
      const color = squeezedColour(this.polys[p].color, thickness(this.polys[p]));
      const first = p;
      let d = '';
      do {
        const { n } = this.polys[p];
        const xy = half ? seamed(this.polys[p].xy, n, half, p === first) : this.polys[p].xy;
        for (const [sx, sy] of this.tileShifts([this.polys[p]])) {
          const pts = [];
          for (let i = 0; i < n; i++) pts.push(`${(xy[i * 2] + sx).toFixed(2)} ${(-(xy[i * 2 + 1] + sy)).toFixed(2)}`);
          d += `M${pts.join('L')}Z`;
        }
      } while (group && this.polys[p + 1]?.group === group && ++p);
      const extra = group ? ' fill-rule="evenodd"'
        : isTranslucent(color) || cell || half ? '' : ` stroke="${color}" stroke-width="0.8" stroke-linejoin="round"`;
      paths.push(`<path fill="${color}"${extra} d="${d}"/>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-w / 2} ${-h / 2} ${w} ${h}" width="${w}mm" height="${h}mm">`
      + `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${this.bath}"/>${this._svgBeforeInk()}${paths.join('')}</svg>`;
  }

  // The session as a script that reproduces it exactly.
  toScript() {
    return this.log.map(({ fn, args }) => {
      if (fn === 'wait') return `wait(${args.seconds});`;
      if (fn === 'simulator') return `// The tank switched from the ${args.from} simulator to ${args.id} here. A script runs in one simulator.`;
      if (fn === 'setBath') return `bath(${JSON.stringify(args)});`;
      if (fn === 'setViscosity') return `viscosity(${JSON.stringify(args)});`;
      if (fn === 'setFlow') return `flow(${JSON.stringify(args)});`;
      return `${fn}(${JSON.stringify(fromMm(fn, args, this))});`;
    }).join('\n');
  }
}

// The commands a script has in scope, taking page units as described in api.js.
// With fromNow, a script added to a tank already in use counts its `at` times from when it starts,
// not from when the tank began. Times after a settle() already count from that settle.
export function scriptApi(marble, extras = {}, { fromNow = false } = {}) {
  const start = marble.time;
  const timed = (o) => (fromNow && o.at !== undefined && !marble.gates.length ? { ...o, at: o.at + start } : o);
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
    if (params && name !== 'text') api[name] = (o = {}) => marble[engine ?? name](toMm(name, timed(o), marble));
  }
  const added = Object.fromEntries(Object.entries(extras).map(([name, fn]) => [name, (o = {}) => fn(timed(o))]));
  return { ...api, ...added };
}

// Runs a user script with the tank's commands in scope.
export function runScript(marble, source, extras = {}, options = {}) {
  const api = scriptApi(marble, extras, options);
  const names = Object.keys(api);
  new Function(...names, source)(...names.map((k) => api[k]));
}
