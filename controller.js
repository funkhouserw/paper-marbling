// The tank and everything that drives it, with no page attached, so any interface can run it.
// Settings are kept the way the page's form fields hold them: strings for typed boxes and
// dropdowns, true or false for ticks. Their keys are the old interface's element IDs.
// An interface changes `settings` as the user edits, calls the commit methods where a
// change should act on the tank, and redraws when told to through on().
import { Marble, runScript } from './engine.js';
import { toMm } from './api.js';
import { TOOLS, PAGE_UNITS } from './tools.js';
import { closedDirection } from './tile.js';
import { MODELS } from './models.js';
import { palette } from './palettes.js';

export const START_PALETTE = 'Dark Academia';
export const STANDARD_VISCOSITY = 1000;

// Point limits are a setting of the machine, not of the tank, so saved tanks and undo don't change them.
export const STANDARD_LIMIT = 400000;
export const LEAST_LIMIT = 50000;
export const MOST_LIMIT = 20000000;

// The Wake simulator's bath. Each preset is also a viscosity, since it needs a thin bath to show.
export const FLOW_PRESETS = {
  calm: { viscosity: 1000, push: 1, friction: 0.25, coast: 25, cell: 7 },
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
  visc: { kind: 'number', label: 'Viscosity (mm²/s)', info: 'viscosity', default: '1000', min: 5, max: 20000, step: 1 },
  tankW: { kind: 'number', label: 'Width (mm)', info: 'tankSize', default: '1000', min: 100, max: 4000, step: 1 },
  tankH: { kind: 'number', label: 'Height (mm)', info: 'tankSize', default: '700', min: 100, max: 4000, step: 1 },
  useBath: { kind: 'toggle', label: 'Base colour', info: 'baseColour', default: false },
  // Starts as the palette's bath; see usePalette().
  bath: { kind: 'colour', label: 'Base colour', info: 'baseColour', default: '#f4efe2' },
  walls: { kind: 'toggle', label: 'Hard edges', info: 'walls', default: false, when: 'walls' },
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

const KEPT_UNDO_STATES = 30;
const KEPT_UNDO_BYTES = 500e6;
const stateBytes = (state) => state.polys.reduce((sum, p) => sum + p.xy.byteLength, 0)
  + Object.values(state.grid ?? {}).flat().reduce((sum, f) => sum + (f?.byteLength ?? 0), 0);

const STEP_BUDGET_MS = 10;   // simulation per frame while playing, leaving room for input
const FINISH_BUDGET_MS = 24; // Finish now asks for speed, so it gets more
const SNAPSHOT_STEP_MS = 150; // simulation per frame in low framerate mode
const SLOW_STEP_MS = 66;      // a tick this slow can't reach half of real time
const SLOW_TANK_DRAW_MS = 150;

// Normalises #rgb, #rgba, #rrggbb and #rrggbbaa, with or without the #. Null if invalid.
export function parseHex(text) {
  const h = text.trim().replace(/^#/, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(h) || ![3, 4, 6, 8].includes(h.length)) return null;
  const full = h.length < 6 ? [...h].map((c) => c + c).join('') : h;
  return { rgb: `#${full.slice(0, 6)}`, alpha: full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1 };
}

// What a step did, from its log entries: the first that isn't only timing.
const STEP_NAMES = {
  setViscosity: 'Viscosity', setFlow: 'Moving bath', openWater: 'Simulator', walls: 'Hard edges', tile: 'Repeating',
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
    this.autoSnapshots = false; // ticks got too slow, so low framerate is on until the tank settles
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

  // After settings.simulator changes. An empty tank simply becomes the new simulator; with ink
  // in it, the change waits for a clear.
  commitSimulator() {
    this.syncViscosity();
    this.syncTile();
    const m = this.marble;
    const Engine = this.engine();
    if (!(m instanceof Engine && m.constructor === Engine) && !m.polys.length && !m.active.length && !m.log.some((e) => !['openWater', 'walls', 'tile'].includes(e.fn))) {
      this.newTank();
      this.resetHistory();
      return;
    }
    this.act(() => m.live(() => m.openWater({ on: this.model().spreading, at: m.time })));
  }

  // ---- Values -----------------------------------------------------------------

  // Tool settings are in page units, like scripts. This gives a tool's values in mm.
  inMm(name, tank = this.marble) {
    const k = tank.width / 100;
    const scale = { w: k, tenth: k / 10, w2: k * k, q: toMm('drop', { quantity: 1 }, tank).quantity };
    const out = { ...this.values[name] };
    for (const [key, unit] of Object.entries(PAGE_UNITS)) if (key in out) out[key] *= scale[unit];
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

  // Decides when an action starts, then calls fn(at). at is undefined when the action
  // should follow the script timeline, behind a settle point.
  place(isTool, fn) {
    const m = this.marble;
    const s = this.settings;
    const mode = this.playing ? 'together' : s.queueMode;
    const growing = [...m.active, ...m.queued].some((op) => op.kind === 'drop');
    if (mode === 'settled' || (isTool && s.toolsWait && growing)) {
      m.settle();
      return fn(undefined);
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
      this.act(() => this.clickAction(p));
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
    this.settings.tile = this.model().repeatsAtFirst === true;
    const m = this.newTank();
    m.replay(entries);
    this.syncToggles(entries);
    this.finishing = true; // catch up over several frames rather than freezing on a big tank
    this.emit('history');
  }

  showState(state) {
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
    this.marble = m;
    m.startViscosity = m.viscosity; // for putting the setting back when undo reaches the start
    m.flowTuning = this.flow(); // a setting like viscosity, so not in the log
    this.applyDetail(m);
    this.queueEnd = 0;
    if (model.spreading) m.openWater({ on: true, at: 0 });
    if (s.walls) m.walls({ on: true, at: 0 });
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

  // After settings.walls changes.
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

  // Ticks or redraws too slow to keep up turn low framerate on, until the tank settles.
  noteLoad(lastDrawMs) {
    if (this.marble.busy && (this.stepMs > SLOW_STEP_MS || lastDrawMs > SLOW_TANK_DRAW_MS)) this.autoSnapshots = true;
    if (!this.marble.busy) {
      this.autoSnapshots = false;
      this.stepMs = 0;
    }
  }
}
