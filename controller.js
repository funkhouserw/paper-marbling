// The tank and everything that drives it, with no page attached, so any interface can run it.
// Settings are kept the way the page's form fields hold them: strings for typed boxes and
// dropdowns, true or false for ticks. Their keys are the old interface's element IDs.
// An interface changes `settings` as the user edits, calls the commit methods where a
// change should act on the tank, and redraws when told to through on().
import { Marble, runScript } from './engine.js';
import { toMm, strikeToEngine } from './api.js';
import { TOOLS, PAGE_UNITS } from './tools.js';
import { closedDirection } from './tile.js';
import { MODELS } from './models.js';
import { GridInk } from './gridink.js';
import { palette } from './palettes.js';
import { imageCells, cellsToPrints, workingSize, downsample } from './image.js';

export const START_PALETTE = 'Dark Academia';
export const STANDARD_VISCOSITY = 100;

// Point limits are a setting of the machine, not of the tank, so saved tanks and undo don't change them.
export const STANDARD_LIMIT = 400000;
export const LEAST_LIMIT = 50000;
export const MOST_LIMIT = 20000000;

// The Wake simulator's bath. Each preset is also a viscosity, since it needs a thin bath to show.
export const FLOW_PRESETS = {
  calm: { viscosity: 100, push: 1, friction: 0.25, coast: 25, cell: 7 },
  curling: { viscosity: 30, push: 1, friction: 0.05, coast: 120, cell: 7 },
  whorls: { viscosity: 10, push: 3, friction: 0.05, coast: 120, cell: 7 },
  storm: { viscosity: 10, push: 10, friction: 0.05, coast: 40, cell: 7 },
};
export const FLOW_FIELDS = { push: 'flowPush', friction: 'flowFriction', coast: 'flowCoast', cell: 'flowCell' };
// Simulators whose bath can move, so the Moving bath settings mean something.
const FLOWING = ['wake', 'wakefast', 'gridink'];

// Every setting, once, for any interface to draw: what kind of control it is, where it starts,
// its range, the (i) text in info.js, and the localStorage key for the few kept between visits.
// The old page's fields match these, which settings.test.mjs checks.
//   kind: 'number' (typed or slid), 'toggle', 'choice' or 'colour'. A choice's options are
//   [value, label] pairs in order (an object would put number-like values first, in number order).
//   when: a capabilities() key; the setting only shows while that is true.
//   showIf: shown only while other settings have these values.
// Numbers are kept as strings, as a form field holds them.
const yes = (v) => (v ? '1' : '0');
export const SETTINGS = {
  simulator: {
    kind: 'choice', label: 'Simulator', info: 'simulator', default: MODELS[0].id,
    options: MODELS.map((m) => [m.id, m.label]),
    store: 'marbler.simulator', save: String, load: (s) => (MODELS.some((m) => m.id === s) ? s : undefined),
  },
  // Starts at the chosen simulator's own viscosity, not at default; see startingViscosity().
  visc: { kind: 'number', label: 'Viscosity (mm²/s)', info: 'viscosity', default: '100', min: 5, max: 20000, step: 1 },
  tankW: { kind: 'number', label: 'Width (mm)', info: 'tankSize', default: '1000', min: 100, max: 4000, step: 1 },
  tankH: { kind: 'number', label: 'Height (mm)', info: 'tankSize', default: '700', min: 100, max: 4000, step: 1 },
  useBath: { kind: 'toggle', label: 'Base colour', info: 'baseColour', default: false },
  // Starts as the palette's bath; see usePalette().
  bath: { kind: 'colour', label: 'Base colour', info: 'baseColour', default: '#f4efe2' },
  walls: { kind: 'toggle', label: 'Hard edges', info: 'walls', default: false, when: 'walls' },
  // Keep cells separate (every simulator): drops that spread into each other keep a thin bare seam,
  // even of one colour; a drop landing inside a same-colour drop still joins it. See Marble.separate.
  separate: { kind: 'toggle', label: 'Keep cells separate', info: 'separate', default: true },
  seam: { kind: 'number', label: 'Seam width (mm)', info: 'seam', default: '', min: 0.1, max: 5, step: 0.1 },
  channel: { kind: 'number', label: 'Bare channel (% of cell)', info: 'channel', default: '', min: 0, max: 15, step: 0.5 },
  // The thin-ink cut (every outline simulator): ribbons stretched under half a millimetre are cut
  // away while tools move ink. See Marble.ribbonCut.
  ribbonCut: { kind: 'toggle', label: 'Cut hairline ink', info: 'ribbonCut', default: true },
  // Ox gall for the bath: each new colour gets gallStart + gallStep·k. See Marble.setGall.
  gall: { kind: 'toggle', label: 'Ox gall', info: 'gall', default: false },
  gallStart: { kind: 'number', label: 'First colour', info: 'gallStart', default: '1', min: 0, max: 10, step: 0.05 },
  gallStep: { kind: 'number', label: 'More per colour', info: 'gallStep', default: '0.15', min: 0, max: 3, step: 0.05 },
  gallMost: { kind: 'number', label: 'Strongest spread', info: 'gallMost', default: '7', min: 2, max: 50, step: 1 },
  tile: { kind: 'toggle', label: 'Repeating', info: 'tile', default: false, when: 'tile' },
  tileOffset: {
    kind: 'choice', label: 'Offset', info: 'tileOffset', default: '', when: 'tileOffset',
    options: [['', 'none'], ['brick', 'brick'], ['halfDrop', 'half-drop']],
  },
  toolsWait: { kind: 'toggle', label: 'Tools wait for ink to settle', info: 'toolsWait', default: true },
  queueMode: {
    kind: 'choice', label: 'While paused', info: 'queueMode', default: 'together',
    options: [['together', 'all at once'], ['order', 'in order'], ['settled', 'each after the last settles']],
  },
  queueGap: { kind: 'number', label: 'gap (s)', default: '0.5', min: 0, max: 30, step: 0.1, showIf: { queueMode: 'order' } },
  lowFramerate: {
    kind: 'toggle', label: 'Low framerate', info: 'lowFramerate', default: false,
    store: 'marbler.lowFramerate', save: yes, load: (s) => s === '1',
  },
  speed: { kind: 'choice', label: 'Speed', info: 'speed', default: '1', options: [['0.5', '0.5×'], ['1', '1×'], ['2', '2×'], ['5', '5×']] },
  flowPreset: {
    kind: 'choice', label: 'Moving bath', info: 'flowPreset', default: 'calm', when: 'flow',
    options: [
      ['calm', 'Calm: ink stops soon after the tool'], ['curling', 'Curling: long feathers and wobble'],
      ['whorls', 'Whorls: wakes roll up into spirals'], ['storm', 'Storm: chaos, needs a high point limit'], ['custom', 'Custom'],
    ],
  },
  flowPush: { kind: 'number', label: 'Rake push', info: 'flowPush', default: '1', min: 0, max: 20, step: 0.5, when: 'flow' },
  flowFriction: { kind: 'number', label: 'Floor drag', info: 'flowFriction', default: '0.25', min: 0, max: 10, step: 0.05, when: 'flow' },
  flowCoast: { kind: 'number', label: 'Longest coast (s)', info: 'flowCoast', default: '25', min: 1, max: 600, step: 5, when: 'flow' },
  flowCell: { kind: 'number', label: 'Flow grid (mm)', info: 'flowCell', default: '7', min: 1.5, max: 20, step: 0.5, when: 'flow' },
  // Held to LEAST_LIMIT–MOST_LIMIT when used; see pointLimit(). The presets are DETAIL_PRESETS.
  pointLimit: {
    kind: 'number', label: 'Point limit', info: 'pointLimit', default: String(STANDARD_LIMIT), min: LEAST_LIMIT, max: MOST_LIMIT, step: 50000,
    store: 'marbler.pointLimit', save: String, load: (s) => (Number(s) ? s : undefined),
  },
  gridCell: {
    kind: 'number', label: 'Grid ink cell (mm)', info: 'gridCell', default: '2', min: 0.5, max: 10, step: 0.5,
    store: 'marbler.gridCell', save: String, load: (s) => s || undefined,
  },
  // Kept the other way round, as whether a run keeps the ink.
  clearFirst: {
    kind: 'toggle', label: 'Clear tank first', info: 'clearFirst', default: true,
    store: 'marbler.runKeepsInk', save: (v) => (v ? '0' : '1'), load: (s) => s !== '1',
  },
};

// The Detail presets, by point limit. Any other limit shows as custom.
export const DETAIL_PRESETS = [['400000', 'Standard: smooth live play'], ['2000000', 'High'], ['5000000', 'Very high'], ['10000000', 'Extreme']];

// What the page started with before anyone touched it.
export const DEFAULT_SETTINGS = {
  ...Object.fromEntries(Object.entries(SETTINGS).map(([id, s]) => [id, s.default])),
  tileForced: false, // the tick was set by arriving at a simulator that starts out repeating
};

// The kept settings found in storage, such as localStorage, to pass as new TankController({ settings }).
export function storedSettings(storage) {
  const out = {};
  for (const [id, s] of Object.entries(SETTINGS)) {
    if (!s.store) continue;
    const raw = storage.getItem(s.store);
    const value = raw === null ? undefined : s.load(raw);
    if (value !== undefined) out[id] = value;
  }
  return out;
}

// Keeps one setting for next time, if it's one that's kept.
export function storeSetting(storage, id, value) {
  const s = SETTINGS[id];
  if (s?.store) storage.setItem(s.store, s.save(value));
}

// The fields every simulator shares: the ink, what's queued, the clock, the toggles and the
// random seed. A switch of simulator hands these to the new engine, which carries on from them.
const CARRIED = Object.keys(new Marble());
// Grid ink holds colour on a grid rather than outlines, so it can't take over another engine's ink.
const carries = (Engine) => !(Engine === GridInk || Engine.prototype instanceof GridInk);

const KEPT_UNDO_STATES = 30;
const KEPT_UNDO_BYTES = 500e6;
const stateBytes = (state) => state.polys.reduce((sum, p) => sum + p.xy.byteLength, 0)
  + Object.values(state.grid ?? {}).flat().reduce((sum, f) => sum + (f?.byteLength ?? 0), 0);

const SLOW_AFTER_S = 20;  // real seconds of moving ink before a crawl is called slow
const SLOW_RATE = 0.1;    // simulated seconds per real second below which it crawls
const STEP_BUDGET_MS = 10;   // simulation per frame while playing, leaving room for input
const FINISH_BUDGET_MS = 24; // Finish now asks for speed, so it gets more
const SNAPSHOT_STEP_MS = 150; // simulation per frame in low framerate mode
const SLOW_STEP_MS = 66;      // a tick this slow can't reach half of real time
const SLOW_TANK_DRAW_MS = 150;
const RECOVER_SHARE = 0.6;   // low framerate goes off below this share of both limits...
const RECOVER_MS = 3000;     // ...held this long

// Normalises #rgb, #rgba, #rrggbb and #rrggbbaa, with or without the #. Null if invalid.
export function parseHex(text) {
  const h = text.trim().replace(/^#/, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(h) || ![3, 4, 6, 8].includes(h.length)) return null;
  const full = h.length < 6 ? [...h].map((c) => c + c).join('') : h;
  return { rgb: `#${full.slice(0, 6)}`, alpha: full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1 };
}

// What a step did, from its log entries: the first that isn't only timing.
const STEP_NAMES = {
  setViscosity: 'Viscosity', setFlow: 'Moving bath', openWater: 'Simulator', simulator: 'Simulator', walls: 'Hard edges', separate: 'Keep cells separate', ribbonCut: 'Cut hairline ink', tile: 'Repeating',
  setBath: 'Base colour', freeze: 'Freeze', unfreeze: 'Unfreeze', unfreezeAll: 'Unfreeze all', print: 'Text',
};
const TIMING = new Set(['settle', 'wait']);
function stepLabel(entries) {
  const fn = entries.find((e) => !TIMING.has(e.fn))?.fn ?? entries[0]?.fn;
  return STEP_NAMES[fn] ?? TOOLS[fn]?.label ?? (fn ? fn[0].toUpperCase() + fn.slice(1) : 'Step');
}

function startingValues() {
  const values = {};
  for (const [name, def] of Object.entries(TOOLS)) {
    values[name] = Object.fromEntries(Object.entries(def.params).map(([k, p]) => [k, p[1]]));
    for (const [k, c] of Object.entries(def.choices ?? {})) values[name][k] = c[2];
  }
  values.fullRake.angle = 0;
  values.stripes.angle = 0;
  values.text.string = 'Marbled';
  values.text.font = 'serif';
  return values;
}

export class TankController {
  // trace turns text into contours. It needs a canvas, so the interface supplies it.
  constructor({ settings = {}, trace = () => [] } = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.trace = trace;
    this.picture = null;
    this.imaged = { key: null, prints: null };
    this.imageStep = null; // the newest image laid: { mark, length, point }
    this.listeners = {};
    this.onTick = null; // told how long each tick took, for profiling

    this.marble = new Marble();
    this.playing = true;
    this.tool = 'drop';
    this.values = startingValues();
    this.freezeMode = 'off'; // Full rake's clicks can pick ink to freeze: 'off', 'freeze' or 'unfreeze'
    this.locked = false;     // set while the interface pulls a print, which holds the tank still
    this.dirty = true;       // the tank needs drawing again

    // Each simulator has its own starting viscosity.
    if (settings.visc === undefined) this.settings.visc = this.startingViscosity();
    this.viscositySimulator = this.model().id; // whose starting viscosity the box was last given
    this.tileSimulator = null; // the simulator the Repeating tick was last set for

    // A copy, so changing colours can't change the palette it started from.
    const p = palette(START_PALETTE);
    this.inks = p.inks.map((ink) => ({ ...ink }));
    this.color = this.inks[0].color;
    this.shimmer = this.inks[0].shimmer;
    if (settings.bath === undefined) this.settings.bath = p.bath;
    this.marble.bath = this.bathColor();

    // Pointer presses.
    this.stroke = null;        // the rake, stylus or paint path being dragged
    this.lastSpray = null;
    this.pressCounted = false; // whether this press has already made an undo step

    // Each user action is one undo step, however many log entries it adds. undoMarks
    // holds the log length before each action; the log before the first mark (settings
    // the tank started with) can't be undone.
    this.undoMarks = [];
    this.redoGroups = [];
    this.undoStates = [];
    this.redoStates = [];
    this.stepLabels = new Map(); // by the log length the step started at

    this.queueEnd = 0;
    this.traced = { key: null, contours: [] };

    // Running.
    this.finishing = false;
    this.owed = 0;
    this.stepMs = 0;            // smoothed time for one tick
    this.autoSnapshots = false; // ticks or draws got too slow, so low framerate is on (noteLoad)
    this.fastSince = null;      // when ticks and draws last became comfortably fast again

    // The first tank is the chosen simulator's, with its id, so undo back to the start finds it.
    this.newTank();
  }

  // ---- Telling the interface ------------------------------------------------

  // Events: 'tank' (a new tank, so sizes may have changed), 'settings', 'history', 'playing', 'tool',
  // 'freeze' (freezeMode changed) and 'notice' (a message for the user).
  on(type, fn) {
    (this.listeners[type] ??= []).push(fn);
    return () => { this.listeners[type] = this.listeners[type].filter((f) => f !== fn); };
  }

  emit(type, detail) {
    for (const fn of this.listeners[type] ?? []) fn(detail);
  }

  // One place for messages to the user, such as errors, from any part of the interface.
  // An empty message clears the last one. Heard through on('notice').
  notice(message) {
    this.emit('notice', message);
  }

  // Whether a setting should show now, by its when and showIf rules.
  shows(id) {
    const s = SETTINGS[id];
    if (!s) return true;
    if (s.when && !this.capabilities()[s.when]) return false;
    return Object.entries(s.showIf ?? {}).every(([k, v]) => this.settings[k] === v);
  }

  // ---- Simulator ------------------------------------------------------------

  model() { return MODELS.find((m) => m.id === this.settings.simulator); }

  // A throw the simulator can't keep up with (#51: Starry spray in Cells sat on "Working…" for over a
  // minute): the ink is still moving but simulated time crawls. Called about once a second with the
  // clock in seconds; says so once per stretch of moving ink, and returns what it said.
  checkSlow(nowS) {
    const m = this.marble;
    if (!this.playing || !m.busy) { this.slowSince = null; this.slowWarned = false; return null; }
    if (!this.slowSince) { this.slowSince = { at: nowS, time: m.time }; return null; }
    const wall = nowS - this.slowSince.at;
    if (wall < SLOW_AFTER_S) return null;
    const done = m.time - this.slowSince.time;
    if (done >= SLOW_RATE * wall) { this.slowSince = { at: nowS, time: m.time }; return null; } // keeping up
    if (this.slowWarned) return null;
    this.slowWarned = true;
    const text = `${this.model().label} is struggling: ${Math.round(wall)} s for ${done.toFixed(1)} s of marbling, with ${m.polys.length.toLocaleString('en')} shapes. Pause or undo, or try Wake (fast), the quickest.`;
    this.notice(text);
    return text;
  }
  engine() { return this.model().engine ?? Marble; }
  startingViscosity(model = this.model()) { return model?.viscosity ?? STANDARD_VISCOSITY; }

  // What the chosen simulator can do, so an interface shows only what will work.
  capabilities() {
    const model = this.model();
    const proto = this.engine().prototype;
    const atFirst = model.repeatsAtFirst === true;
    return {
      erase: Boolean(proto.eraseSupported),
      hearts: Boolean(proto.freezeSupported),
      freeze: Boolean(proto.freezeSupported),
      tile: Boolean(!model.spreading && proto.tileSupported),
      tileOffset: Boolean(this.settings.tile && proto.tileOffsetSupported),
      walls: !atFirst, // Grid ink's sides are solid whenever it isn't repeating
      flow: FLOWING.includes(model.id),
    };
  }

  // Changing simulator moves the viscosity to the new one's starting value, unless it holds the user's own.
  syncViscosity() {
    const was = MODELS.find((m) => m.id === this.viscositySimulator);
    if (Number(this.settings.visc) === this.startingViscosity(was)) this.settings.visc = this.startingViscosity();
    this.viscositySimulator = this.model().id;
  }

  // A script's openWater() shows here too, so the setting always says what's really running.
  showSpreading(on) {
    if (this.model().engine) return; // only Classic and Spreading share an engine and switch this way
    this.settings.simulator = MODELS.find((m) => m.spreading === on).id;
  }

  // Puts settings the chosen simulator can't use back in line.
  syncTile() {
    const s = this.settings;
    const model = this.model();
    const proto = this.engine().prototype;
    if (!proto.eraseSupported && this.tool === 'erase') this.setTool('drop');
    if (!proto.freezeSupported && this.tool === 'hearts') this.setTool('drop');
    if (!proto.freezeSupported && this.freezeMode !== 'off') {
      this.freezeMode = 'off';
      this.emit('freeze');
    }
    const atFirst = model.repeatsAtFirst === true;
    const supported = !model.spreading && proto.tileSupported;
    if (!supported) s.tile = false;
    // Grid ink starts out repeating, once on arriving at it, and that doesn't count as asking other
    // simulators to repeat. After that the tick is the user's.
    if (this.tileSimulator !== model.id) {
      this.tileSimulator = model.id;
      if (atFirst) { s.tile = true; s.tileForced = true; }
      else if (s.tileForced) { s.tile = false; s.tileForced = false; }
    }
    if (atFirst) s.walls = false;
    if (s.tile && s.walls) s.walls = false;
    if (!proto.tileOffsetSupported) s.tileOffset = '';
    this.emit('settings');
  }

  // Sets the simulator without touching the tank, as choosing an example does before it runs.
  setSimulator(id) {
    this.settings.simulator = id;
    this.syncViscosity();
    this.syncTile();
  }

  // After settings.simulator changes. An empty tank simply becomes the new simulator. With ink in
  // it, the new simulator takes the ink over and carries on, as one undo step. Grid ink can't
  // trade ink with the others, so a switch to or from it waits for a clear.
  commitSimulator() {
    this.dropSwitchNotice();
    const m = this.marble;
    const from = m.simulatorId ?? this.viscositySimulator;
    this.syncViscosity();
    this.syncTile();
    const Engine = this.engine();
    const same = m instanceof Engine && m.constructor === Engine;
    if (!same && !m.polys.length && !m.active.length && !m.log.some((e) => !['openWater', 'walls', 'tile', 'separate', 'ribbonCut'].includes(e.fn))) {
      this.newTank();
      this.resetHistory();
      return;
    }
    if (same) {
      m.simulatorId = this.model().id;
      this.act(() => m.live(() => m.openWater({ on: this.model().spreading, at: m.time })));
      return;
    }
    if (!carries(m.constructor) || !carries(Engine)) {
      const name = (id) => MODELS.find((x) => x.id === id)?.label ?? id;
      this.notice(`${name(this.model().id)} can't take over ink from ${name(from)}. It starts when you clear the tank.`);
      this.switchWaiting = true;
      return;
    }
    const before = m.log.length;
    const state = m.saveState();
    const n = this.carryInto(this.model().id, from);
    // What the new simulator can't do is turned off, and its viscosity applied, all in this step.
    const s = this.settings;
    n.live(() => {
      if (n.openWaterOn !== Boolean(this.model().spreading)) n.openWater({ on: Boolean(this.model().spreading), at: n.time });
      if (n.tileOn && (!s.tile || !n.tileSupported)) n.tile({ on: false, at: n.time });
      if (n.wallsOn && !s.walls) n.walls({ on: false, at: n.time });
      if (typeof n.separate === 'function' && n.separateOn !== Boolean(s.separate)) n.separate({ ...this.separateValues(), at: n.time });
      if (typeof n.ribbonCut === 'function' && n.ribbonCutOn !== (s.ribbonCut !== false)) n.ribbonCut({ on: s.ribbonCut !== false, at: n.time });
      const visc = Number(s.visc);
      if (Number.isFinite(visc) && visc > 0 && visc !== n.viscosity) n.setViscosity({ value: visc });
    });
    s.visc = n.viscosity;
    this.undoMarks.push(before);
    this.undoStates.push(state);
    this.stepLabels.delete(before);
    this.trimUndo();
    this.redoGroups = [];
    this.redoStates = [];
    this.emit('settings');
    this.emit('history');
  }

  // The "starts when you clear" notice goes once it's no longer true or no longer news: on a new
  // tank, the next simulator change, or the next step made.
  dropSwitchNotice() {
    if (!this.switchWaiting) return;
    this.switchWaiting = false;
    this.notice('');
  }

  // Hands the tank to a new engine for simulator id, which carries on from exactly where the old
  // one was, and marks the switch in the log. The live switch and rebuild() both use this, so a
  // replay matches what happened.
  carryInto(id, from) {
    const old = this.marble.saveState();
    const queueEnd = this.queueEnd;
    this.settings.simulator = id;
    const m = this.newTank();
    for (const key of CARRIED) if (key in old) m[key] = old[key];
    m.startViscosity = old.startViscosity;
    m.simulatorId = id;
    this.applyDetail(m);
    this.queueEnd = queueEnd;
    m.simulator({ id, from, at: m.time });
    this.dirty = true;
    return m;
  }

  // Makes the tank the engine a kept state came from, for undo and redo across a switch.
  useEngineOf(id) {
    const Engine = MODELS.find((x) => x.id === id)?.engine ?? Marble;
    if (!id || this.marble.constructor === Engine) return;
    this.settings.simulator = id;
    this.viscositySimulator = id;
    this.syncTile();
    this.newTank();
    this.emit('settings');
  }

  // ---- Values -----------------------------------------------------------------

  // Tool settings are in page units, like scripts. This gives a tool's values in mm.
  inMm(name, tank = this.marble) {
    const k = tank.width / 100;
    const scale = { w: k, tenth: k / 10, w2: k * k, q: toMm('drop', { quantity: 1 }, tank).quantity };
    const out = { ...this.values[name] };
    for (const [key, unit] of Object.entries(PAGE_UNITS)) if (key in out && out[key] !== null) out[key] *= scale[unit]; // null is Auto
    if (name === 'hearts' && typeof out.angle === 'number') out.angle = strikeToEngine(out.angle); // 0 = down, as Heart drop
    return out;
  }

  // On a repeating tank a slanted full rake runs at the nearest angle that joins up.
  fullRakeAngle() {
    const wanted = this.values.fullRake.angle;
    return this.settings.tile ? Math.round(closedDirection(wanted, this.marble.width, this.marble.height, this.tileOffset()).angle) : wanted;
  }

  // No base colour by default: the tank shows an empty grid and exports stay transparent.
  bathColor() { return this.settings.useBath ? this.settings.bath : 'rgba(0,0,0,0)'; }

  // After useBath or bath change. Takes effect straight away.
  commitBath() {
    this.marble.bath = this.bathColor();
    this.dirty = true;
  }

  // ---- Ink --------------------------------------------------------------------

  // Ink colours are #rrggbb, or #rrggbbaa when translucent.
  inkRgb() { return this.color.slice(0, 7); }
  inkAlpha() { return this.color.length > 7 ? parseInt(this.color.slice(7), 16) / 255 : 1; }
  setInk(rgb, alpha) {
    const a = Math.round(alpha * 255);
    this.color = (a === 255 ? rgb : rgb + a.toString(16).padStart(2, '0')).toLowerCase();
  }

  // Swaps the inks and bath colour straight away, without clearing the tank.
  usePalette(name) {
    const p = palette(name);
    this.inks = p.inks.map((ink) => ({ ...ink }));
    this.color = this.inks[0].color;
    this.shimmer = this.inks[0].shimmer;
    this.settings.bath = p.bath.toLowerCase(); // as a colour field would hold it
    this.marble.bath = this.bathColor();
    this.dirty = true;
    this.emit('settings');
    return p;
  }

  // Edits to the palette's inks. The chosen ink follows the one being edited.
  setPaletteInk(i, { rgb, shimmer }) {
    const ink = this.inks[i];
    const chosen = this.color === ink.color;
    if (rgb !== undefined) ink.color = rgb + ink.color.slice(7); // keeps any transparency
    if (shimmer !== undefined) ink.shimmer = shimmer;
    if (chosen) {
      if (rgb !== undefined) this.color = ink.color;
      if (shimmer !== undefined) this.shimmer = ink.shimmer;
    }
  }

  removePaletteInk(i) {
    this.inks.splice(i, 1);
    if (!this.inks.some((k) => k.color === this.color)) { this.color = this.inks[0].color; this.shimmer = this.inks[0].shimmer; }
  }

  addPaletteInk() { this.inks.push({ color: '#808080', shimmer: 0 }); }

  // ---- Tools ------------------------------------------------------------------

  // Every tool's settings back to how they ship; the tool in hand and the tank's ink stay.
  resetToolValues() {
    this.values = startingValues();
    this.emit('settings');
  }

  setTool(name) {
    const changed = name !== this.tool;
    if (changed && this.freezeMode !== 'off') {
      this.freezeMode = 'off';
      this.emit('freeze');
    }
    this.tool = name;
    this.stroke = null;
    this.emit('tool', { changed });
  }

  // While freezing is on, a press on the tank freezes or unfreezes the ink there instead of using
  // the tool. 'off', 'freeze' or 'unfreeze'; choosing a tool turns it off. Heard through on('freeze').
  setFreezeMode(mode) {
    if (mode !== 'off' && !this.capabilities().freeze) mode = 'off';
    if (mode === this.freezeMode) return;
    this.freezeMode = mode;
    this.emit('freeze');
  }

  // Freeze or Unfreeze, or off when it's picked again.
  pickFreezeMode(mode) {
    this.setFreezeMode(this.freezeMode === mode ? 'off' : mode);
  }

  // Freezes or unfreezes the ink at a point in tank mm, as mode says, whatever the tool.
  freezeAt([x, y], mode = this.freezeMode) {
    const m = this.marble;
    const unfreezing = mode === 'unfreeze';
    if (!m.shapeAt(x, y, { frozen: unfreezing })) return;
    this.act(() => {
      m.live(() => (unfreezing ? m.unfreeze({ x, y, at: m.time }) : m.freeze({ x, y, at: m.time })));
      m.applyNow();
    });
    this.dirty = true;
  }

  // The loops a press would freeze or unfreeze at a point, or null, for previews and menus.
  freezeTarget([x, y], mode = this.freezeMode) {
    if (mode === 'off' || !this.capabilities().freeze) return null;
    return this.marble.shapeAt(x, y, { frozen: mode === 'unfreeze' }) ?? null;
  }

  unfreezeAll() {
    const m = this.marble;
    if (!m.polys.some((p) => p.frozen)) return;
    this.act(() => {
      m.live(() => m.unfreezeAll({ at: m.time }));
      m.applyNow();
    });
    this.dirty = true;
  }

  // Contours centred on the origin, traced once per distinct text setting.
  currentText() {
    const { string, font, size } = this.inMm('text');
    const key = JSON.stringify([string, font, size]);
    if (key !== this.traced.key) this.traced = { key, contours: string.trim() ? this.trace({ text: string, font, size }) : [] };
    return this.traced.contours;
  }

  // The Image tool's picture ({ data, w, h }, decoded in the page). It lives only here: values and
  // settings are stored, and the picture must never be. null forgets it.
  setPicture(picture) {
    this.picture = picture;
    this.imaged = { key: null, prints: null };
  }

  // A chosen picture goes straight onto the bath, centred. While that image is still the newest
  // step, choosing another file replaces it instead of adding a second one.
  choosePicture(picture) {
    const replacing = this.imageIsNewest();
    this.setPicture(picture);
    if (replacing) this.relayImage();
    else this.layImage([0, 0]);
  }

  // Lays the picture at point as one step, "Image", and remembers that step.
  layImage(point = [0, 0]) {
    const before = this.undoMarks.length;
    this.act(() => this.runTool('image', { point }), 'Image');
    this.imageStep = this.undoMarks.length > before ? { mark: this.undoMarks.at(-1), length: this.marble.log.length, point } : null;
    this.dirty = true;
  }

  // Whether the last image laid is still the newest step: nothing has been done to the tank since.
  imageIsNewest() {
    const s = this.imageStep;
    return Boolean(s) && this.undoMarks.at(-1) === s.mark && this.marble.log.length === s.length && this.stepLabels.get(s.mark) === 'Image';
  }

  // New Image settings (or a new file) redo the newest image in place, as the same one step, so the
  // sliders visibly do something. Once anything else has happened they only affect the next lay.
  relayImage() {
    if (!this.imageIsNewest() || this.locked) return false;
    const { point } = this.imageStep;
    this.undo();
    this.redoGroups.pop();
    this.redoStates.pop();
    this.layImage(point);
    this.emit('history');
    return true;
  }

  // The picture as print() arguments centred on the origin, traced once per distinct setting.
  currentImage() {
    if (!this.picture) return null;
    const { colours, detail, fit, from } = this.values.image;
    const m = this.marble;
    const palette = from === 'palette' ? this.inks.map((i) => (typeof i === 'object' ? i.color : i)) : null;
    const key = JSON.stringify([colours, detail, fit, palette, m.width, m.height]);
    if (key !== this.imaged.key) {
      const { w: pw, h: ph } = this.picture;
      const [w, h] = workingSize(pw, ph, detail);
      const cells = imageCells(downsample(this.picture, w, h), { colours, detail, palette });
      const full = Math.min(m.width * 0.95, m.height * 0.95 * (w / h));
      this.imaged = { key, prints: cellsToPrints(cells, { w, h }, { size: (full * fit) / 100 }) };
    }
    return this.imaged.prints;
  }

  // Decides when an action starts, then calls fn(at). at is undefined when the action
  // should follow the script timeline, behind a settle point.
  place(isTool, fn) {
    const m = this.marble;
    const s = this.settings;
    const mode = this.playing ? 'together' : s.queueMode;
    const growing = [...m.active, ...m.queued].some((op) => op.kind === 'drop');
    if (mode === 'settled' || (isTool && s.toolsWait && growing)) {
      m.settle();
      const op = fn(undefined);
      // Marked so the view can show it waiting, even while playing.
      if (op && typeof op === 'object' && mode !== 'settled') op.waitingForInk = true;
      return op;
    }
    const gap = Number(s.queueGap) || 0;
    if (mode === 'order' && m.gates.length) {
      m.wait(gap);
      return fn(undefined);
    }
    const at = mode === 'order' ? Math.max(this.queueEnd, m.time) : m.time;
    const op = m.live(() => fn(at));
    if (mode === 'order') this.queueEnd = at + (op?.duration ?? (op?.total ? op.total / op.speed : 0)) + gap;
    return op;
  }

  // How a tool is used: 'click', 'stroke', 'line' or 'whole'. See tools.js.
  toolInput(name = this.tool) {
    const def = TOOLS[name];
    return def.input ?? (def.whole ? 'whole' : 'click');
  }

  // Does what a tool does, with what its act() in tools.js is given. extra is its point or path,
  // and share for drags. Returns what act() did.
  runTool(name, extra = {}) {
    const def = TOOLS[name];
    return def.act({
      m: this.marble,
      v: this.inMm(name),
      ink: { color: this.color, shimmer: this.shimmer },
      inks: this.inks,
      queueMode: this.settings.queueMode,
      text: () => this.currentText(),
      image: () => this.currentImage(),
      notice: (message) => this.notice(message),
      place: (fn) => this.place(Boolean(def.waits), fn),
      ...extra,
    });
  }

  // What a click does with the current tool, at a point in tank mm.
  clickAction(point) {
    if (this.toolInput() === 'click') this.runTool(this.tool, { point });
  }

  // A press on the tank, at a point in tank mm.
  press(p) {
    if (this.freezeMode !== 'off') {
      this.freezeAt(p);
      return;
    }
    this.stroke = null; // a press that never saw its release must not carry over into this one
    this.lastSpray = null;
    const input = this.toolInput();
    if (input === 'stroke' || input === 'line') this.stroke = [p];
    else if (input === 'click') {
      const before = this.undoMarks.length;
      if (this.tool === 'image') this.layImage(p);
      else this.act(() => this.clickAction(p), TOOLS[this.tool].stepLabel);
      this.pressCounted = this.undoMarks.length > before;
    }
    if (TOOLS[this.tool].drag) this.lastSpray = p;
  }

  // The pointer moved to p. buttons is false once the button is up, whatever we were told.
  move(p, buttons) {
    if (!buttons) this.endPress();
    const { tool, lastSpray } = this;
    const drag = TOOLS[tool].drag;
    // Dragging some tools keeps them going along the way, a little at a time.
    if (lastSpray && drag && Math.hypot(p[0] - lastSpray[0], p[1] - lastSpray[1]) > this.inMm(tool).radius * drag.spacing(this.values[tool])) {
      this.lastSpray = p;
      // A whole drag is one undo step, so only the first spot of it needs to start one.
      const more = () => this.runTool(tool, { point: p, share: drag.share });
      if (this.pressCounted) more();
      else {
        const before = this.undoMarks.length;
        this.act(more);
        this.pressCounted = this.undoMarks.length > before;
      }
    }
    if (!this.stroke) return;
    if (this.toolInput() === 'line') this.stroke[1] = p;
    else this.stroke.push(p);
  }

  release() {
    this.lastSpray = null;
    if (!this.stroke) return;
    const path = this.stroke;
    this.stroke = null;
    if (path.length < 2) return;
    this.act(() => this.runTool(this.tool, { path }));
  }

  // The system can take the pointer away mid-press, with no release, so a press also ends here.
  endPress() {
    this.stroke = null;
    this.lastSpray = null;
  }

  // The Apply button, for tools that work on the whole tank.
  applyTool() {
    if (this.toolInput() !== 'whole') return;
    this.act(() => this.runTool(this.tool));
  }

  // ---- History ----------------------------------------------------------------

  get canUndo() { return this.undoMarks.length > 0; }
  get canRedo() { return this.redoGroups.length > 0; }

  // label names the step in history(), for steps whose log entries don't say what they were.
  act(fn, label) {
    const m = this.marble;
    const before = m.log.length;
    const state = m.saveState();
    fn();
    if (m.log.length > before) {
      this.dropSwitchNotice();
      if (label) this.stepLabels.set(before, label);
      else this.stepLabels.delete(before);
      this.undoMarks.push(before);
      this.undoStates.push(state);
      if (this.undoStates.length > KEPT_UNDO_STATES) this.undoStates[this.undoStates.length - KEPT_UNDO_STATES - 1] = null;
      this.trimUndo();
      this.redoGroups = [];
      this.redoStates = [];
      this.emit('history');
    }
  }

  // Big tanks are expensive to copy. Older steps lose their copy and are replayed if undone.
  trimUndo() {
    let bytes = 0;
    for (let i = this.undoStates.length - 1; i >= 0; i--) {
      if (!this.undoStates[i]) continue;
      bytes += stateBytes(this.undoStates[i]);
      if (bytes > KEPT_UNDO_BYTES && i < this.undoStates.length - 1) this.undoStates[i] = null;
    }
  }

  // Every step, done and undone, oldest first. current is how many are done, so steps from
  // current on are the ones redo brings back.
  history() {
    const log = this.marble.log;
    const done = this.undoMarks.map((at, i) => ({ at, entries: log.slice(at, this.undoMarks[i + 1] ?? log.length) }));
    let at = log.length;
    const undone = [...this.redoGroups].reverse().map((entries) => {
      const step = { at, entries };
      at += entries.length;
      return step;
    });
    const steps = [...done, ...undone].map(({ at: start, entries }) => ({
      label: this.stepLabels.get(start) ?? stepLabel(entries),
      fns: entries.map((e) => e.fn),
    }));
    return { steps, current: done.length };
  }

  resetHistory() {
    this.stepLabels = new Map();
    this.undoMarks = [];
    this.redoGroups = [];
    this.undoStates = [];
    this.redoStates = [];
    this.emit('history');
  }

  // Sets the settings to whatever a log leaves in place.
  syncToggles(entries) {
    const s = this.settings;
    const last = (fn) => entries.filter((e) => e.fn === fn).at(-1);
    const water = last('openWater');
    if (water) this.showSpreading(water.args.on);
    s.walls = last('walls')?.args.on ?? false;
    s.separate = last('separate')?.args.on ?? this.marble.separateOn ?? true;
    s.ribbonCut = last('ribbonCut')?.args.on ?? this.marble.ribbonCutOn ?? true;
    s.tile = last('tile')?.args.on ?? this.model().repeatsAtFirst === true;
    s.tileOffset = last('tile')?.args.offset ?? '';
    this.syncTile();
    // A script's bath() shows in the settings, and so carries over to the next run like a chosen setting.
    const thickness = last('setViscosity');
    s.visc = thickness ? thickness.args.value : this.marble.startViscosity ?? s.visc;
    const flow = last('setFlow');
    if (flow) this.showFlow(flow.args);
    const bath = last('setBath');
    if (bath) {
      s.useBath = bath.args.color !== null;
      if (parseHex(bath.args.color ?? '')?.rgb) s.bath = parseHex(bath.args.color).rgb;
    }
    this.emit('settings');
  }

  // Rebuilds the tank from log entries, so seeded randomness replays identically.
  rebuild(entries) {
    // The tank starts at the viscosity it first had, whatever the setting says now.
    if (this.marble.startViscosity) this.settings.visc = this.marble.startViscosity;
    this.settings.walls = false;
    // The log starts in the simulator its first switch came from. Undoing a switch cuts it off the
    // entries, so the tank's whole log is looked at too; with no switch at all, it's this tank's own.
    const isSwitch = (e) => e.fn === 'simulator';
    const first = entries.find(isSwitch) ?? this.marble.log.find(isSwitch);
    const startId = first ? first.args.from : this.marble.simulatorId;
    if (startId) { this.settings.simulator = startId; this.viscositySimulator = startId; }
    this.settings.tile = this.model().repeatsAtFirst === true;
    let m = this.newTank();
    let start = 0;
    entries.forEach((e, i) => {
      if (e.fn !== 'simulator') return;
      m.replay(entries.slice(start, i));
      // The old simulator runs up to the moment of the switch, as it did live.
      while (m.time < (e.args.at ?? 0) - 1e-9) m.step();
      m = this.carryInto(e.args.id, e.args.from);
      this.viscositySimulator = e.args.id;
      start = i + 1;
    });
    m.replay(entries.slice(start));
    this.emit('settings');
    this.syncToggles(entries);
    this.finishing = true; // catch up over several frames rather than freezing on a big tank
    this.emit('history');
  }

  showState(state) {
    this.useEngineOf(state.simulatorId);
    this.marble.loadState(state);
    this.applyDetail(this.marble);
    this.syncToggles(this.marble.log);
    this.finishing = false;
    this.owed = 0;
    this.dirty = true;
    this.emit('history');
  }

  undo() {
    if (this.locked || !this.undoMarks.length) return;
    const at = this.undoMarks.pop();
    this.redoGroups.push(this.marble.log.slice(at));
    this.redoStates.push(this.marble.saveState());
    // Puts the tank straight back. Only actions older than the kept states need replaying.
    const state = this.undoStates.pop();
    if (state) this.showState(state);
    else this.rebuild(this.marble.log.slice(0, at));
  }

  // Takes back every step made since there were count of them, leaving nothing to redo, as if
  // they never happened. For a press that turns out to be the start of a gesture.
  discardStepsSince(count) {
    if (this.undoMarks.length <= count) return;
    while (this.undoMarks.length > count && !this.locked) {
      this.undo();
      this.redoGroups.pop();
      this.redoStates.pop();
    }
    this.emit('history');
  }

  redo() {
    if (this.locked || !this.redoGroups.length) return;
    const group = this.redoGroups.pop();
    this.undoMarks.push(this.marble.log.length);
    this.undoStates.push(this.marble.saveState());
    const state = this.redoStates.pop();
    if (state) this.showState(state);
    else this.rebuild([...this.marble.log, ...group]);
  }

  // ---- Tank settings ----------------------------------------------------------

  pointLimit() {
    return Math.min(MOST_LIMIT, Math.max(LEAST_LIMIT, Number(this.settings.pointLimit) || STANDARD_LIMIT));
  }

  // Above the standard limit, detail holds until about a fifth of the way there, then slowly coarsens.
  applyDetail(m) {
    const limit = this.pointLimit();
    m.maxVertices = limit;
    m.pointBudget = limit > STANDARD_LIMIT ? limit / 5 : null;
  }

  setPointLimit(limit) {
    this.settings.pointLimit = limit;
    this.applyDetail(this.marble);
    this.emit('settings');
    return this.pointLimit();
  }

  newTank() {
    const s = this.settings;
    const prev = this.marble;
    const model = this.model();
    const Engine = this.engine();
    const m = new Engine({
      width: Number(s.tankW) || prev.width,
      height: Number(s.tankH) || prev.height,
      viscosity: Number(s.visc) || prev.viscosity,
      bath: this.bathColor(),
      seed: prev.seed,
      gridCell: Number(s.gridCell) || undefined,
    });
    this.dropSwitchNotice();
    this.marble = m;
    m.simulatorId = model.id; // kept in saved states, so undo can find the engine again
    m.startViscosity = m.viscosity; // for putting the setting back when undo reaches the start
    m.flowTuning = this.flow(); // a setting like viscosity, so not in the log
    this.applyDetail(m);
    this.queueEnd = 0;
    if (model.spreading) m.openWater({ on: true, at: 0 });
    if (s.walls) m.walls({ on: true, at: 0 });
    if (typeof m.separate === 'function') m.separate({ ...this.separateValues(), at: 0 });
    if (typeof m.ribbonCut === 'function') m.ribbonCut({ on: this.settings.ribbonCut !== false, at: 0 });
    if (s.gall) m.setGall(this.gallValues()); // a new tank starts counting colours again
    this.syncTile(); // the tick may not have caught up yet, on the first tank after a reload
    if (s.tile && this.capabilities().tile && (!model.repeatsAtFirst || this.tileOffset())) m.tile({ on: true, offset: this.tileOffset(), at: 0 });
    if (!s.tile && model.repeatsAtFirst) m.tile({ on: false, at: 0 });
    this.dirty = true;
    this.emit('tank');
    return m;
  }

  // Clear, or Apply to the tank's size: a new tank and no history.
  clear() {
    this.newTank();
    this.resetHistory();
  }

  setPlaying(p) {
    this.playing = p;
    this.emit('playing');
  }

  // After settings.visc changes. Takes effect straight away, on everything from here on, without clearing the tank.
  commitViscosity() {
    const m = this.marble;
    const value = Number(this.settings.visc);
    if (!Number.isFinite(value) || value <= 0) {
      this.settings.visc = m.viscosity;
      this.emit('settings');
      return;
    }
    if (value === m.viscosity) return;
    m.startViscosity ??= m.viscosity;
    this.act(() => m.setViscosity({ value }));
    this.settings.visc = m.viscosity; // it may have been held to the allowed range
    this.emit('settings');
  }

  flow() {
    return Object.fromEntries(Object.entries(FLOW_FIELDS).map(([key, id]) => [key, Number(this.settings[id])]));
  }

  showFlow(flow) {
    for (const [key, id] of Object.entries(FLOW_FIELDS)) this.settings[id] = flow[key];
    const match = Object.entries(FLOW_PRESETS).find(([, p]) => Object.keys(FLOW_FIELDS).every((k) => p[k] === flow[k]));
    this.settings.flowPreset = match ? match[0] : 'custom';
  }

  // After settings.flowPreset changes.
  commitFlowPreset() {
    const preset = FLOW_PRESETS[this.settings.flowPreset];
    if (!preset) return;
    const m = this.marble;
    this.showFlow(preset);
    this.settings.visc = preset.viscosity;
    m.startViscosity ??= m.viscosity;
    this.act(() => {
      m.setViscosity({ value: preset.viscosity });
      m.setFlow(this.flow());
    });
    this.emit('settings');
  }

  // After one of the flow settings changes.
  commitFlow() {
    this.showFlow(this.flow());
    this.act(() => this.marble.setFlow(this.flow()));
    this.emit('settings');
  }

  tileOffset() { return (this.settings.tile && this.settings.tileOffset) || null; }

  // Takes effect at once, so it shows even on a paused tank.
  setRepeat(on, offset) {
    const m = this.marble;
    this.act(() => m.live(() => m.tile({ on, offset, at: m.time })));
    m.applyNow();
    this.dirty = true;
  }

  // After settings.tile changes.
  commitTile() {
    this.setRepeat(this.settings.tile, this.tileOffset());
    this.syncTile();
  }

  // After settings.tileOffset changes.
  commitTileOffset() {
    this.setRepeat(true, this.tileOffset());
    this.emit('settings');
  }

  // After separate or seam change. Takes effect for ink from here on.
  commitSeparate() {
    const m = this.marble;
    if (typeof m.separate !== 'function') return;
    this.act(() => m.live(() => m.separate({ ...this.separateValues(), at: m.time })), 'Keep cells separate');
  }

  // After ribbonCut changes. Takes effect for tool moves from here on.
  commitRibbonCut() {
    const m = this.marble;
    if (typeof m.ribbonCut !== 'function') return;
    this.act(() => m.live(() => m.ribbonCut({ on: this.settings.ribbonCut !== false, at: m.time })), 'Cut hairline ink');
  }

  separateValues() {
    const s = this.settings;
    const seam = s.seam === '' || s.seam === null || s.seam === undefined ? null : Number(s.seam);
    const ch = s.channel === '' || s.channel === null || s.channel === undefined ? null : Number(s.channel);
    return { on: s.separate !== false, seam: Number.isFinite(seam) && seam > 0 ? seam : null, share: Number.isFinite(ch) && ch >= 0 ? ch / 100 : null };
  }

  // After settings.walls changes.
  // After gall, gallStart, gallStep or gallMost change. Takes effect for drops from here on.
  commitGall() {
    const m = this.marble;
    this.act(() => m.setGall(this.gallValues()), 'Ox gall');
  }

  gallValues() {
    const s = this.settings;
    const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d);
    return { on: Boolean(s.gall), start: num(s.gallStart, 1), step: num(s.gallStep, 0.15), most: num(s.gallMost, 7) };
  }

  commitWalls() {
    const m = this.marble;
    this.act(() => m.live(() => m.walls({ on: this.settings.walls, at: m.time })));
    if (this.settings.walls && this.settings.tile) { this.settings.tile = false; this.syncTile(); }
  }

  // ---- Scripts ----------------------------------------------------------------

  // Runs a script, on a fresh tank or on top of the ink. Returns the error if it failed, or null.
  runScript(source, { clearing = this.settings.clearFirst } = {}) {
    const m = clearing ? this.newTank() : this.marble;
    if (clearing) this.resetHistory();
    // An earlier script's inOrder() shouldn't reach into this one.
    else if (m.orderGap !== null) m.orderGap = null;
    const before = m.log.length;
    let failed = null;
    this.act(() => {
      try {
        runScript(m, source, {
          // Lives here because tracing needs a canvas, which the engine must not depend on.
          text: (o = {}) => {
            const { string, x, y, size, font, color: c, shimmer: sh, at } = toMm('text', o, m);
            return m.print({ contours: this.trace({ text: string, x, y, size, font }), color: c, shimmer: sh, at });
          },
        }, { fromNow: !clearing });
      } catch (err) {
        failed = err;
      }
    }, 'Script');
    // Half a script shouldn't land on work you wanted to keep, or leave a redo that brings it back.
    if (failed && !clearing && this.marble.log.length > before) {
      this.undo();
      this.redoGroups.pop();
      this.redoStates.pop();
      this.emit('history');
    }
    // A script may change these settings itself, so they follow whatever it left in place.
    this.syncToggles(this.marble.log);
    this.setPlaying(true);
    return failed;
  }

  // ---- Saved tanks ------------------------------------------------------------

  // What a saved tank needs from here, besides its picture and script.
  saveData() {
    const s = this.settings;
    return { simulator: s.simulator, useBath: s.useBath, bath: s.bath, visc: s.visc, state: this.marble.saveState() };
  }

  restore(save) {
    const s = this.settings;
    s.simulator = save.simulator;
    s.useBath = save.useBath;
    s.bath = save.bath;
    s.visc = save.visc;
    s.tankW = save.state.width;
    s.tankH = save.state.height;
    this.newTank();
    this.resetHistory();
    this.marble.loadState(save.state);
    this.applyDetail(this.marble);
    this.queueEnd = 0;
    this.syncToggles(this.marble.log);
    s.simulator = save.simulator;
    this.finishing = false;
    this.owed = 0;
    this.dirty = true;
    this.emit('settings');
    this.emit('tank');
  }

  // ---- Running ----------------------------------------------------------------

  finish() { this.finishing = true; }

  snapshotting() {
    return this.playing && this.marble.busy && (this.settings.lowFramerate || this.autoSnapshots);
  }

  // Runs ticks until the budget is spent, and notes how long they take.
  runTicks(budgetMs, start, canRun) {
    while (canRun() && performance.now() < start + budgetMs) {
      const t = performance.now();
      this.marble.step();
      this.stepMs += (performance.now() - t - this.stepMs) * 0.1;
      this.onTick?.(performance.now() - t);
      this.dirty = true;
    }
  }

  // One frame of simulation. wall is the real time since the last frame, in seconds, and start
  // is when this frame's work began, from performance.now().
  advance(wall, start) {
    const m = this.marble;
    if (this.finishing) {
      this.runTicks(FINISH_BUDGET_MS, start, () => m.busy);
      if (!m.busy) this.finishing = false;
    } else if (this.snapshotting()) {
      // Nothing to keep in step with, so it runs as fast as the machine allows.
      this.runTicks(SNAPSHOT_STEP_MS, start, () => m.busy);
      this.owed = 0;
    } else if (this.playing && m.busy) {
      this.owed += wall * Number(this.settings.speed);
      this.runTicks(STEP_BUDGET_MS, start, () => {
        if (this.owed < m.dt) return false;
        this.owed -= m.dt;
        return true;
      });
      this.owed = Math.min(this.owed, 0.5); // run slower than real time rather than freezing
    } else if (this.playing) {
      m.time += wall; // idle time passes, so new actions start now
      this.owed = 0;
    }
  }

  // Ticks or redraws too slow to keep up turn low framerate on. It goes off again when the tank
  // settles, or once ticks and redraws have been comfortably fast (RECOVER_SHARE of the limits) for
  // RECOVER_MS in a row (row 61: one slow spike, or a slow draw left over from the tank before, kept
  // it on for a whole long movement). The gap between the two limits keeps it from flickering.
  noteLoad(lastDrawMs, now = performance.now()) {
    const m = this.marble;
    if (!m.busy) {
      this.autoSnapshots = false;
      this.stepMs = 0;
      this.fastSince = null;
      return;
    }
    if (this.stepMs > SLOW_STEP_MS || lastDrawMs > SLOW_TANK_DRAW_MS) {
      this.autoSnapshots = true;
      this.fastSince = null;
    } else if (this.autoSnapshots && this.stepMs < SLOW_STEP_MS * RECOVER_SHARE && lastDrawMs < SLOW_TANK_DRAW_MS * RECOVER_SHARE) {
      this.fastSince ??= now;
      if (now - this.fastSince >= RECOVER_MS) {
        this.autoSnapshots = false;
        this.fastSince = null;
      }
    } else {
      this.fastSince = null;
    }
  }
}
