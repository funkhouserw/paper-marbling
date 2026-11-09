// The tank controller, driven the way an interface would drive it, with no page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TankController, FLOW_PRESETS, STANDARD_LIMIT, MOST_LIMIT } from './controller.js';
import { EXAMPLES, EXAMPLE_SIMULATOR } from './examples.js';
import { MODELS } from './models.js';

const fresh = (settings = {}) => {
  const c = new TankController({ settings: { simulator: 'classic', ...settings } });
  c.clear();
  return c;
};
const fns = (c) => c.marble.log.map((e) => e.fn);
const settle = (c) => { while (c.marble.busy) c.marble.step(); };

test('a click with the drop tool is one undo step, however many drops it makes', () => {
  const c = fresh();
  c.values.drop.count = 3;
  c.press([0, 0]);
  c.release();
  assert.equal(fns(c).filter((f) => f === 'drop').length, 3);
  assert.equal(c.undoMarks.length, 1);
  c.undo();
  assert.equal(fns(c).filter((f) => f === 'drop').length, 0);
  assert.ok(c.canRedo);
  c.redo();
  assert.equal(fns(c).filter((f) => f === 'drop').length, 3);
});

test('undo puts the tank back the same, from a kept copy or by replaying the log', () => {
  for (const replay of [false, true]) {
    const c = fresh();
    c.press([-20, 0]);
    settle(c);
    const before = JSON.stringify(c.marble.polys.map((p) => Array.from(p.xy)));
    c.press([20, 0]);
    settle(c);
    if (replay) c.undoStates = c.undoStates.map(() => null);
    c.undo();
    settle(c);
    assert.equal(JSON.stringify(c.marble.polys.map((p) => Array.from(p.xy))), before, replay ? 'replayed' : 'kept');
  }
});

test('dragging a rake makes one rake, and a dragged spray is one undo step', () => {
  const c = fresh();
  c.setTool('rake');
  c.press([-100, 0]);
  c.move([100, 0], true);
  c.release();
  assert.deepEqual(fns(c).filter((f) => f === 'rake'), ['rake']);
  c.setTool('spray');
  const marks = c.undoMarks.length;
  const drops = fns(c).length;
  c.press([-400, 0]);
  const first = fns(c).length;
  for (let x = -400; x <= 400; x += 50) c.move([x, 0], true);
  c.release();
  assert.equal(c.undoMarks.length, marks + 1);
  assert.ok(first > drops && fns(c).length > first, 'the drag keeps spraying');
});

test('a press that loses its button makes nothing on release', () => {
  const c = fresh();
  c.setTool('stylus');
  c.press([0, 0]);
  c.move([10, 10], false);
  c.release();
  assert.ok(!fns(c).includes('rake'), 'a stylus logs as a rake');
});

test('paused, in-order actions queue one after another with the gap between', () => {
  const c = fresh({ queueMode: 'order', queueGap: '1' });
  c.setPlaying(false);
  c.setTool('vortex');
  c.press([0, 0]);
  c.press([50, 0]);
  const [a, b] = c.marble.log.filter((e) => e.fn === 'vortex').map((e) => e.args.at);
  assert.ok(b > a + 1, `${a} then ${b}`);
});

test('a failing script on top of ink takes back what it did and leaves no redo', () => {
  const c = fresh({ clearFirst: false });
  c.press([0, 0]);
  const log = fns(c);
  const error = c.runScript('drop({ x: 50, y: 50 }); nonsense();');
  assert.ok(error);
  assert.deepEqual(fns(c), log);
  assert.ok(!c.canRedo);
  assert.ok(c.playing);
});

test('a script run on a clear tank starts the history again, with the run as its one step', () => {
  const c = fresh();
  c.press([0, 0]);
  assert.equal(c.runScript('drop({ x: 50, y: 50 });', { clearing: true }), null);
  assert.equal(c.undoMarks.length, 1);
  assert.deepEqual(fns(c).filter((f) => f === 'drop'), ['drop']);
});

test("a script's bath and viscosity show in the settings afterwards", () => {
  const c = fresh();
  c.runScript('viscosity({ value: 300 }); walls({ on: true }); bath({ color: "#112233" });', { clearing: true });
  assert.equal(Number(c.settings.visc), 300);
  assert.equal(c.settings.walls, true);
  assert.equal(c.settings.useBath, true);
  assert.equal(c.settings.bath, '#112233');
});

test('arriving at Grid ink ticks Repeating, and leaving takes it off again', () => {
  const c = fresh();
  assert.equal(c.settings.tile, false);
  c.setSimulator('gridink');
  assert.equal(c.settings.tile, true);
  assert.equal(c.capabilities().walls, false);
  assert.equal(c.capabilities().erase, false);
  c.setSimulator('classic');
  assert.equal(c.settings.tile, false);
});

test('a tool the simulator lacks gives way to Drop', () => {
  const c = fresh();
  const tools = [];
  c.on('tool', () => tools.push(c.tool));
  c.setTool('erase');
  c.setSimulator('gridink');
  assert.equal(c.tool, 'drop');
  assert.deepEqual(tools, ['erase', 'drop']);
});

test('changing simulator moves the viscosity only if it was the starting one', () => {
  const c = fresh();
  const grid = MODELS.find((m) => m.id === 'gridink').viscosity;
  c.setSimulator('gridink');
  assert.equal(Number(c.settings.visc), grid);
  c.settings.visc = '555';
  c.setSimulator('classic');
  assert.equal(Number(c.settings.visc), 555);
});

test('an empty tank becomes the new simulator, while one with ink hands its ink over', () => {
  const c = fresh();
  c.settings.simulator = 'film';
  c.commitSimulator();
  assert.equal(c.marble.constructor.name, 'Film');
  assert.ok(!c.canUndo);
  c.press([0, 0]);
  c.settings.simulator = 'spreading';
  c.commitSimulator();
  assert.equal(c.marble.constructor.name, 'Marble');
  assert.ok(c.marble.log.some((e) => e.fn === 'simulator'));
  assert.equal(c.marble.log.at(-1).fn, 'openWater');
});

test('Hard edges and Repeating rule each other out', () => {
  const c = fresh();
  c.settings.tile = true;
  c.commitTile();
  c.settings.walls = true;
  c.commitWalls();
  assert.equal(c.settings.tile, false);
  assert.equal(c.marble.log.at(-1).fn, 'walls');
});

test('a viscosity that makes no sense goes back to the tank’s own', () => {
  const c = fresh();
  c.settings.visc = '-3';
  c.commitViscosity();
  assert.equal(Number(c.settings.visc), c.marble.viscosity);
  assert.ok(!c.canUndo);
  c.settings.visc = '400';
  c.commitViscosity();
  assert.equal(c.marble.viscosity, 400);
  assert.ok(c.canUndo);
});

test('a flow preset sets the bath and viscosity, and edited values show as custom', () => {
  const c = fresh({ simulator: 'wake' });
  c.settings.flowPreset = 'whorls';
  c.commitFlowPreset();
  assert.equal(Number(c.settings.visc), FLOW_PRESETS.whorls.viscosity);
  assert.equal(Number(c.settings.flowPush), FLOW_PRESETS.whorls.push);
  c.settings.flowPush = '4';
  c.commitFlow();
  assert.equal(c.settings.flowPreset, 'custom');
});

test('point limits are held to what the machine allows', () => {
  const c = fresh();
  assert.equal(c.setPointLimit(10), 50000);
  assert.equal(c.setPointLimit(1e9), MOST_LIMIT);
  c.setPointLimit(STANDARD_LIMIT * 5);
  assert.equal(c.marble.pointBudget, STANDARD_LIMIT);
});

test('a saved tank comes back with its settings', () => {
  const c = fresh();
  c.settings.useBath = true;
  c.settings.bath = '#204060';
  c.commitBath();
  c.press([0, 0]);
  settle(c);
  const save = c.saveData();
  const d = fresh({ tankW: '500' });
  d.restore(save);
  assert.equal(d.marble.width, c.marble.width);
  assert.equal(d.settings.bath, '#204060');
  assert.equal(d.marble.polys.length, c.marble.polys.length);
  assert.ok(!d.canUndo);
});

test('a palette swaps inks and bath without touching the tank', () => {
  const c = fresh();
  c.press([0, 0]);
  const log = c.marble.log.length;
  c.usePalette('Old Dutch');
  assert.equal(c.color, c.inks[0].color);
  assert.match(c.settings.bath, /^#[0-9a-f]{6}$/);
  assert.equal(c.marble.log.length, log);
});

test('frames run the tank on, and stop once it settles', () => {
  const c = fresh();
  c.press([0, 0]);
  for (let i = 0; i < 2000 && c.marble.busy; i++) c.advance(0.1, performance.now());
  assert.ok(!c.marble.busy);
  const t = c.marble.time;
  c.advance(0.1, performance.now());
  assert.ok(c.marble.time > t, 'idle time passes');
});

test('every example names a simulator that exists', () => {
  for (const [name, id] of Object.entries(EXAMPLE_SIMULATOR)) {
    assert.ok(name in EXAMPLES, name);
    assert.ok(MODELS.some((m) => m.id === id), id);
  }
});

test('history names each step, keeps undone ones after the current, and labels script runs', () => {
  const c = fresh();
  c.press([0, 0]);
  c.setTool('vortex');
  c.press([10, 10]);
  c.runScript('drop({ x: 20, y: 20 }); rake({ from: [0, 50], to: [100, 50] });', { clearing: false });
  c.settings.visc = '400';
  c.commitViscosity();
  assert.deepEqual(c.history().steps.map((s) => s.label), ['Drop', 'Vortex', 'Script', 'Viscosity']);
  c.undo();
  c.undo();
  const h = c.history();
  assert.equal(h.current, 2);
  assert.deepEqual(h.steps.map((s) => s.label), ['Drop', 'Vortex', 'Script', 'Viscosity']);
  c.redo();
  assert.equal(c.history().current, 3);
  c.setTool('drop');
  c.press([30, 30]);
  assert.deepEqual(c.history().steps.map((s) => s.label), ['Drop', 'Vortex', 'Script', 'Drop']);
});

test('notices reach whoever listens', () => {
  const c = fresh();
  const heard = [];
  c.on('notice', (m) => heard.push(m));
  c.notice('Saved');
  c.notice('');
  assert.deepEqual(heard, ['Saved', '']);
});

test('freezing works under any tool, from a press or straight from a point, and a tool change ends it', () => {
  const c = fresh();
  c.press([0, 0]);
  settle(c);
  const heard = [];
  c.on('freeze', () => heard.push(c.freezeMode));
  c.setTool('vortex');
  c.setFreezeMode('freeze');
  assert.ok(c.freezeTarget([0, 0]));
  c.press([0, 0]);
  assert.ok(c.marble.polys.some((p) => p.frozen));
  assert.ok(!fns(c).includes('vortex'), 'the press froze instead of using the tool');
  c.setTool('drop');
  assert.equal(c.freezeMode, 'off');
  assert.deepEqual(heard, ['freeze', 'off']);
  c.freezeAt([0, 0], 'unfreeze');
  assert.ok(!c.marble.polys.some((p) => p.frozen));
  assert.equal(c.freezeTarget([0, 0], 'off'), null);
  assert.deepEqual(c.history().steps.slice(-2).map((s) => s.label), ['Freeze', 'Unfreeze']);
});

test('a simulator that can’t freeze turns freezing off and won’t take it', () => {
  const c = fresh();
  c.setFreezeMode('freeze');
  c.setSimulator('gridink');
  assert.equal(c.freezeMode, 'off');
  c.setFreezeMode('freeze');
  assert.equal(c.freezeMode, 'off');
});

test('a new tool needs only its entry in tools.js: clicks, strokes, drags and Apply all find it', async () => {
  const { TOOLS } = await import('./tools.js');
  const added = {
    dab: { hint: 'A test brush.', input: 'click', drag: { spacing: () => 0.5, share: 0.5 }, params: { radius: ['Size', 5, 1, 20, 1] }, act: (t) => t.place((at) => t.m.drop({ x: t.point[0], y: t.point[1], quantity: 0.2 * (t.share ?? 1), ...t.ink, at })) },
    smear: { hint: 'A test stroke.', input: 'stroke', waits: true, params: {}, act: (t) => t.place((at) => t.m.stylus({ path: t.path, at })) },
    shake: { hint: 'A test whole-tank tool.', whole: true, params: {}, act: (t) => t.place((at) => t.m.jiggle({ at })) },
  };
  Object.assign(TOOLS, added);
  try {
    const c = new TankController({ settings: { simulator: 'classic' } });
    c.clear();
    c.setTool('dab');
    c.press([0, 0]);
    for (let x = 0; x <= 200; x += 20) c.move([x, 0], true);
    c.release();
    assert.ok(fns(c).filter((f) => f === 'drop').length > 3);
    assert.equal(c.undoMarks.length, 1, 'the whole drag is one step');
    c.setTool('smear');
    c.press([0, 0]); c.move([50, 50], true); c.move([100, 0], true); c.release();
    assert.equal(fns(c).at(-1), 'rake'); // a stylus is a one-tine rake
    c.setTool('shake');
    assert.equal(c.toolInput(), 'whole');
    c.applyTool();
    assert.equal(fns(c).at(-1), 'jiggle');
  } finally {
    for (const k of Object.keys(added)) delete TOOLS[k];
  }
});

test('every tool says how it is used and what it does', async () => {
  const { TOOLS } = await import('./tools.js');
  for (const [name, def] of Object.entries(TOOLS)) {
    assert.ok(['click', 'stroke', 'line', 'whole'].includes(def.input), name);
    assert.equal(typeof def.act, 'function', name);
    assert.equal(def.input === 'whole', Boolean(def.whole), `${name}: whole tools have an Apply button`);
  }
});

test('steps can be taken back with nothing left to redo, as if a press never happened', () => {
  const c = fresh();
  c.press([0, 0]);
  const marks = c.undoMarks.length;
  const log = fns(c);
  c.press([20, 0]);
  c.press([40, 0]);
  c.discardStepsSince(marks);
  assert.deepEqual(fns(c), log);
  assert.ok(!c.canRedo);
  assert.equal(c.undoMarks.length, marks);
});

// ---- Switching simulator with ink in the tank ----------------------------------

const shapes = (c) => JSON.stringify(c.marble.polys.map((p) => Array.from(p.xy.slice(0, p.n * 2))));
const steps = (c, n) => { for (let i = 0; i < n; i++) c.marble.step(); };
const switchTo = (c, id) => { c.settings.simulator = id; c.commitSimulator(); };

test('switching simulator with ink in the tank carries the ink over, as one undo step', () => {
  const c = fresh();
  c.press([0, 0]);
  c.release();
  steps(c, 20);
  const before = shapes(c);
  const marks = c.undoMarks.length;
  switchTo(c, 'wake');
  assert.equal(c.marble.constructor.name, 'Wake');
  assert.equal(c.marble.simulatorId, 'wake');
  assert.equal(shapes(c), before);
  assert.equal(c.undoMarks.length, marks + 1);
  assert.equal(c.history().steps.at(-1).label, 'Simulator');
  c.undo();
  assert.equal(c.marble.constructor.name, 'Marble');
  assert.equal(c.settings.simulator, 'classic');
  assert.equal(shapes(c), before);
  c.redo();
  assert.equal(c.marble.constructor.name, 'Wake');
  assert.equal(c.settings.simulator, 'wake');
});

test('every pair of outline simulators can hand ink to each other', () => {
  const ids = MODELS.map((m) => m.id).filter((id) => id !== 'gridink');
  for (const a of ids) for (const b of ids) {
    if (a === b) continue;
    const c = fresh({ simulator: a });
    c.press([0, 0]);
    c.release();
    steps(c, 10);
    switchTo(c, b);
    assert.equal(c.marble.simulatorId, b, `${a} -> ${b}`);
    assert.ok(c.marble.polys.length > 0, `${a} -> ${b}`);
    steps(c, 30);
    for (const p of c.marble.polys) assert.ok(p.xy.slice(0, p.n * 2).every(Number.isFinite), `${a} -> ${b}`);
  }
});

test('a tank rebuilt from its log across a switch matches the live one', () => {
  const live = fresh();
  live.press([-30, 0]);
  live.release();
  steps(live, 25);
  switchTo(live, 'wake');
  live.press([40, 10]);
  live.release();
  steps(live, 40);
  const time = live.marble.time;
  const want = shapes(live);
  // Undo the last drop and redo it with no kept copies, so redo replays the whole log.
  live.undo();
  live.undoStates = live.undoStates.map(() => null);
  live.redoStates = live.redoStates.map(() => null);
  live.redo();
  assert.equal(live.marble.constructor.name, 'Wake');
  while (live.marble.time < time - 1e-9) live.marble.step();
  assert.equal(shapes(live), want);
});

test('Grid ink can\'t take over outline ink, so it says so and waits for a clear', () => {
  const c = fresh();
  const notices = [];
  c.on('notice', (m) => notices.push(m));
  c.press([0, 0]);
  c.release();
  switchTo(c, 'gridink');
  assert.equal(c.marble.constructor.name, 'Marble');
  assert.match(notices.at(-1), /starts when you clear the tank/);
  c.press([30, 0]);
  c.release();
  assert.equal(notices.at(-1), '', 'a step made clears it');
  switchTo(c, 'gridink');
  c.clear();
  assert.equal(notices.at(-1), '', 'clearing, which starts Grid ink, clears it');
  assert.equal(c.marble.simulatorId, 'gridink');
});

test('the first tank is the chosen simulator, even before any clear, and undo finds it again', () => {
  // The new interface starts on Wake and never clears first.
  const c = new TankController({ settings: { simulator: 'wake' } });
  assert.equal(c.marble.constructor.name, 'Wake');
  assert.equal(c.marble.simulatorId, 'wake');
  c.press([0, 0]);
  c.release();
  switchTo(c, 'classic');
  assert.equal(c.marble.constructor.name, 'Marble');
  c.undo();
  assert.equal(c.marble.constructor.name, 'Wake');
  assert.equal(c.settings.simulator, 'wake');
});

test('undoing a switch by replaying the log goes back to the simulator before it', () => {
  const c = fresh();
  c.press([0, 0]);
  c.release();
  switchTo(c, 'wake');
  c.press([100, 0]);
  c.release();
  // No kept copies, so each undo has to rebuild from the log.
  const forget = () => { c.undoStates = c.undoStates.map(() => null); };
  forget(); c.undo();
  assert.equal(c.marble.constructor.name, 'Wake');
  forget(); c.undo();
  assert.equal(c.marble.constructor.name, 'Marble');
  assert.equal(c.settings.simulator, 'classic');
  c.redoStates = c.redoStates.map(() => null);
  c.redo();
  assert.equal(c.marble.constructor.name, 'Wake');
});

test('a stroke held back by "Tools wait" is marked, so the view can show it waiting', () => {
  const c = fresh({ simulator: 'wake' });
  c.press([0, 0]);
  c.release();
  c.setTool('stylus');
  c.press([-200, 50]);
  c.move([0, 50], true);
  c.move([200, 50], true);
  c.release();
  const waiting = c.marble.queued.filter((op) => op.waitingForInk);
  assert.equal(waiting.length, 1);
  assert.equal(waiting[0].kind, 'rake');
  // With nothing growing, a stroke goes straight away and isn't marked.
  settle(c);
  c.press([-200, -50]);
  c.move([200, -50], true);
  c.release();
  assert.equal(c.marble.queued.filter((op) => op.waitingForInk).length, 0);
});

test('Full rake overhang on Auto stays Auto in mm, and a set value is scaled like other sizes', () => {
  const c = fresh();
  assert.equal(c.values.fullRake.overhang, null);
  assert.equal(c.inMm('fullRake').overhang, null);
  c.values.fullRake.overhang = 2;
  assert.equal(c.inMm('fullRake').overhang, 20);
});

test('Full rake arches are Off by default and reach the engine in mm when set (F1 on the tool)', () => {
  const c = fresh();
  assert.equal(c.values.fullRake.arch, null);
  assert.equal(c.values.fullRake.falloff, null);
  c.setTool('fullRake');
  c.applyTool();
  const off = c.marble.log.at(-1);
  assert.ok(!('arch' in (off.args ?? off)), JSON.stringify(off).slice(0, 200));
  c.values.fullRake.arch = 0.6;
  assert.equal(c.inMm('fullRake').arch, 6);
  assert.equal(c.inMm('fullRake').falloff, null);
  c.applyTool();
  const on = c.marble.log.at(-1);
  assert.equal((on.args ?? on).arch, 6);
});

test('Reset tools to defaults puts every tool back as shipped and keeps the ink and the tool (#48)', () => {
  const c = fresh();
  const shipped = JSON.parse(JSON.stringify(c.values));
  c.press([200, 200]);
  c.release();
  const drops = fns(c).filter((f) => f === 'drop').length;
  assert.ok(drops > 0);
  for (const values of Object.values(c.values)) for (const k of Object.keys(values)) if (typeof values[k] === 'number') values[k] += 1;
  c.values.text.string = 'changed';
  c.setTool('stripes');
  c.resetToolValues();
  assert.deepEqual(c.values, shipped);
  assert.equal(c.tool, 'stripes');
  assert.equal(fns(c).filter((f) => f === 'drop').length, drops);
});

test('a throw the simulator crawls through is called slow once, and a brisk one never (#51)', () => {
  const c = fresh();
  const said = [];
  c.on?.('notice', (t) => said.push(t));
  c.press([0, 0]);
  c.release();
  assert.ok(c.marble.busy);
  const t0 = c.marble.time;
  // Brisk: the clock and the marbling go together.
  for (let s = 0; s <= 30; s++) { c.marble.time = t0 + s; assert.equal(c.checkSlow(s), null); }
  // Crawling: 40 real seconds for a tenth of a second of marbling.
  const at = c.marble.time;
  const out = [];
  for (let s = 31; s <= 80; s++) { c.marble.time = at + (s - 31) * 0.002; out.push(c.checkSlow(s)); }
  const warnings = out.filter(Boolean);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^Classic is struggling: \d+ s for 0\.\d s of marbling, with [\d,]+ shapes/);
  // Once the ink stops, the next crawl may be told again.
  c.marble.time = 1e9;
  while (c.marble.busy) c.marble.step();
  assert.equal(c.checkSlow(81), null);
  assert.equal(c.slowWarned, false);
});
