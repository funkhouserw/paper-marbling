import { Marble, runScript, maxRadius, WEAVE_POINTS, WEAVE_SHAPES } from './engine.js';
import { toMm, dialToValue, valueToDial } from './api.js';
import { TOOLS, TURNS, PAGE_UNITS, isDial } from './tools.js';
import { MODELS } from './models.js';
import { listSaves, addSave, deleteSave } from './saves.js';
import { PALETTES, palette } from './palettes.js';
import { FONTS, textContours, moveContours } from './text.js';
import { TINTS, PULL_SECONDS, LAY_SECONDS, pullPrint, drawSweep, savePull, listPulls, deletePull } from './paper.js';

const $ = (id) => document.getElementById(id);
const START_PALETTE = 'Dark Academia';

const EXAMPLES = {
  'Lapis bullseyes': `// Drops stacked on one spot in order, each pushing the last outward.
const inks = palette('Lapis & Gilt').inks;
const spots = [[16, 25.7], [44, 72.9], [73, 24.3], [93, 74.3], [7, 80]];
inOrder({ gap: 0.4 });
for (const [x, y] of spots) {
  for (let i = 0; i < 8; i++) {
    drop({ x, y, quantity: 3.1, dispersion: 2, color: inks[i % inks.length] });
  }
}
allAtOnce();
settle();
wait(0.5);
fullRake({ angle: 0, teeth: 6, speed: 22, D: 0.8 });
settle();
fullRake({ angle: 180, teeth: 6, offset: 5.8, speed: 22, D: 0.8 });
`,
  'Blue & gold feather': `// Rows of alternating bullseyes, combed one way and back, then feathered.
const inks = palette('Lapis & Gilt').inks;
allAtOnce();
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 6; c++) {
    const x = 10 + c * 16 + (r % 2) * 8;
    const y = 86.4 - r * 24.3;
    drop({ x, y, quantity: 1.6, dispersion: 1.8, color: inks[(r + c) % 2 ? 0 : 1] });
  }
}
settle();
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 6; c++) {
    const x = 10 + c * 16 + (r % 2) * 8;
    const y = 86.4 - r * 24.3;
    drop({ x, y, quantity: 1.9, dispersion: 2.5, color: inks[4] });
  }
}
settle();
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 6; c++) {
    const x = 10 + c * 16 + (r % 2) * 8;
    const y = 86.4 - r * 24.3;
    drop({ x, y, quantity: 0.6, dispersion: 2.5, color: inks[3] });
  }
}
settle();
fullRake({ angle: 90, teeth: 8, speed: 24, D: 0.7 });
settle();
fullRake({ angle: 270, teeth: 8, offset: 6.2, speed: 24, D: 0.7 });
settle();
fullRake({ angle: 0, teeth: 30, speed: 32, D: 0.4 });
`,
  'Emerald peacock': `// Emerald and gold, combed both ways with a fine weaving rake.
const inks = palette('Emerald & Gold').inks;
for (let i = 0; i < 40; i++) {
  drop({ x: 5 + (i % 8) * 12.8, y: 90 - Math.floor(i / 8) * 20,
         quantity: 1.7, dispersion: 1.6, color: inks[(i * 3) % inks.length] });
}
settle();
fullRake({ angle: 90, teeth: 10, speed: 24, D: 0.7 });
settle();
fullRake({ angle: 270, teeth: 10, offset: 5, speed: 24, D: 0.7 });
settle();
fullRake({ angle: 0, teeth: 16, speed: 26, D: 0.6, waveAmp: 2.2, waveLength: 9 });
`,
  'Gilded stone': `// A thick scatter of dark inks, then fine gold spatter over the top.
const dark = palette('Dark Academia').inks;
drops({ n: 90, quantity: 1.4, spread: 0.6, stagger: 2.5, dispersion: 1.4, colors: dark.slice(0, 5) });
settle();
wait(0.5);
drops({ n: 70, quantity: 0.07, spread: 0.7, stagger: 2, dispersion: 2, colors: [dark[5]] });
`,
  'Oxblood whirl': `// Rings poured in order at the centre, then stirred in opposite directions.
const inks = palette('Oxblood & Gilt').inks;
inOrder({ gap: 0.35 });
for (let i = 0; i < 18; i++) {
  drop({ x: 50, y: 50, quantity: 12.9, dispersion: 2.5, color: inks[i % inks.length] });
}
allAtOnce();
settle();
stir({ radii: [7, -13, 19, -25], degrees: 120, rate: 60, D: 4 });
settle();
wriggle({ period: 12, degrees: 12, duration: 2 });
`,
  'Library endpaper': `// Printed text settled onto a marbled sheet, then gently combed with it.
const inks = palette('Ravenwood Library').inks;
for (let i = 0; i < 48; i++) {
  drop({ x: 5 + (i % 8) * 12.8 + (Math.floor(i / 8) % 2) * 6.4, y: 91.4 - Math.floor(i / 8) * 16.6,
         quantity: 1.3, dispersion: 1.8, color: inks[i % inks.length] });
}
settle();
fullRake({ angle: 0, teeth: 7, speed: 24, D: 0.7 });
settle();
text({ string: 'Ex Libris', font: 'serif', size: 17, color: '#f2e8d5' });
wait(1);
fullRake({ angle: 90, teeth: 9, speed: 9, D: 0.3 });
`,
  'Verdigris waves': `// Copper and verdigris bands, shaken into waves.
const inks = palette('Copper & Verdigris').inks;
for (let r = 0; r < 7; r++) {
  for (let c = 0; c < 9; c++) {
    drop({ x: 6 + c * 11, y: 92.9 - r * 14.3, quantity: 1.1, dispersion: 1.8,
           color: inks[r % inks.length] });
  }
}
settle();
jiggle({ angle: 0, period: 21, amplitude: 4.5, duration: 2 });
settle();
fullRake({ angle: 0, teeth: 14, speed: 28, D: 0.5 });
`,
};

const DIRECTIONS = [[0, '→', 'Right'], [180, '←', 'Left'], [90, '↑', 'Up'], [270, '↓', 'Down']];
// Sidebar controls are in page units, like scripts. This gives a tool's values in mm.
function inMm(name, tank = marble) {
  const k = tank.width / 100;
  const scale = { w: k, tenth: k / 10, w2: k * k, q: toMm('drop', { quantity: 1 }, tank).quantity };
  const out = { ...values[name] };
  for (const [key, unit] of Object.entries(PAGE_UNITS)) if (key in out) out[key] *= scale[unit];
  return out;
}

// ---- State --------------------------------------------------------------

let marble = new Marble();
let playing = true;
let tool = 'drop';
let inks = palette(START_PALETTE).inks;
let color = inks[0].color;
let shimmer = inks[0].shimmer;
const values = {};
for (const [name, def] of Object.entries(TOOLS)) {
  values[name] = Object.fromEntries(Object.entries(def.params).map(([k, p]) => [k, p[1]]));
  for (const [k, c] of Object.entries(def.choices ?? {})) values[name][k] = c[2];
}

values.fullRake.angle = 0;

const tank = $('tank');
const overlay = $('overlay');
const tctx = tank.getContext('2d');
const octx = overlay.getContext('2d');
let pxPerMm = 1;
let dirty = true;
let stroke = null;
let hover = null; // pointer position in tank mm, for the text preview
let pull = null;  // the pull in progress
let tint = Object.values(TINTS)[0];
let pullSeed = Date.now() % 1e9;
values.text.string = 'Marbled';
values.text.font = 'serif';

// ---- Simulator ----------------------------------------------------------

for (const m of MODELS) {
  const option = new Option(m.label, m.id);
  option.title = m.title;
  $('simulator').add(option);
}
$('simulator').value = MODELS.some((m) => m.id === localStorage.getItem('marbler.simulator'))
  ? localStorage.getItem('marbler.simulator') : MODELS[0].id;
const currentModel = () => MODELS.find((m) => m.id === $('simulator').value);
// A script's openWater() shows here too, so the control always says what's really running.
function showSpreading(on) {
  $('simulator').value = MODELS.find((m) => m.spreading === on).id;
}

// ---- Sidebar panels -----------------------------------------------------

// Remembers which panels are open between visits.
for (const panel of document.querySelectorAll('.panel')) {
  const key = `marbler.panel.${panel.dataset.panel}`;
  const saved = localStorage.getItem(key);
  if (saved !== null) panel.open = saved === 'open';
  panel.addEventListener('toggle', () => localStorage.setItem(key, panel.open ? 'open' : 'closed'));
}

// ---- Layout -------------------------------------------------------------

function resize() {
  const box = $('wrap').getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  const cssScale = Math.min(box.width / marble.width, box.height / marble.height);
  pxPerMm = cssScale * dpr;
  for (const c of [tank, overlay]) {
    c.width = Math.round(marble.width * pxPerMm);
    c.height = Math.round(marble.height * pxPerMm);
    c.style.width = `${marble.width * cssScale}px`;
    c.style.height = `${marble.height * cssScale}px`;
  }
  dirty = true;
}
new ResizeObserver(resize).observe($('wrap'));

function toTank(ev) {
  const r = overlay.getBoundingClientRect();
  return [
    ((ev.clientX - r.left) / r.width - 0.5) * marble.width,
    (0.5 - (ev.clientY - r.top) / r.height) * marble.height,
  ];
}
const toPx = ([x, y]) => [(x + marble.width / 2) * pxPerMm, (marble.height / 2 - y) * pxPerMm];

// ---- Tool panel ---------------------------------------------------------

// A number box that stays in step with a slider, so a value can be typed or dragged.
// The slider decides what's valid; the box only tidies up once typing is finished.
function typeBox(range) {
  const box = Object.assign(document.createElement('input'), {
    type: 'number', className: 'numbox', min: range.min, max: range.max, step: range.step, value: range.value,
  });
  box.setAttribute('aria-label', 'Value');
  box.refresh = () => { if (document.activeElement !== box) box.value = range.value; };
  box.oninput = () => {
    const n = Number(box.value);
    if (box.value === '' || n < Number(range.min) || n > Number(range.max)) return;
    range.value = n;
    range.oninput();
  };
  box.onchange = () => {
    if (box.value !== '') {
      range.value = box.value; // sliders clamp and snap by themselves
      range.oninput();
    }
    box.value = range.value;
  };
  box.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); box.blur(); } };
  return box;
}

// Ink colours are #rrggbb, or #rrggbbaa when translucent.
const inkRgb = () => color.slice(0, 7);
const inkAlpha = () => (color.length > 7 ? parseInt(color.slice(7), 16) / 255 : 1);
function setInk(rgb, alpha) {
  const a = Math.round(alpha * 255);
  color = (a === 255 ? rgb : rgb + a.toString(16).padStart(2, '0')).toLowerCase();
}

// Normalises #rgb, #rgba, #rrggbb and #rrggbbaa, with or without the #. Null if invalid.
function parseHex(text) {
  const h = text.trim().replace(/^#/, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(h) || ![3, 4, 6, 8].includes(h.length)) return null;
  const full = h.length < 6 ? [...h].map((c) => c + c).join('') : h;
  return { rgb: `#${full.slice(0, 6)}`, alpha: full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1 };
}

// The same colour fully opaque, so previews stay visible however faint the ink is.
function opaque(c) {
  if (/^#[0-9a-f]{8}$/i.test(c)) return c.slice(0, 7);
  if (/^#[0-9a-f]{4}$/i.test(c)) return c.slice(0, 4);
  const m = /^rgba\(\s*([^,]+),\s*([^,]+),\s*([^,)]+)/i.exec(c);
  return m ? `rgb(${m[1]},${m[2]},${m[3]})` : c;
}

function colorPicker() {
  const box = document.createElement('div');
  const row = document.createElement('div');
  row.className = 'swatches';
  const swatches = inks.map((ink) => {
    const b = document.createElement('button');
    b.style.background = ink.color;
    b.title = ink.shimmer > 0 ? `${ink.color}, shimmer ${ink.shimmer}` : ink.color;
    b.classList.toggle('metal', ink.shimmer > 0);
    b.onclick = () => { setInk(ink.color, inkAlpha()); shimmer = ink.shimmer; sync(); };
    return b;
  });
  const native = Object.assign(document.createElement('input'), { type: 'color', id: 'customColor' });
  native.style.width = '40px';
  native.oninput = () => { setInk(native.value, inkAlpha()); sync(); };
  row.append(...swatches, native);

  const hex = Object.assign(document.createElement('input'), {
    type: 'text', id: 'colorHex', spellcheck: false, title: '#rrggbb or #rrggbbaa',
  });
  hex.setAttribute('aria-label', 'Colour as hex');
  hex.oninput = () => {
    const parsed = parseHex(hex.value);
    hex.classList.toggle('invalid', !parsed);
    if (parsed) { setInk(parsed.rgb, parsed.alpha); sync(hex); }
  };
  hex.onblur = () => sync();

  const alpha = Object.assign(document.createElement('input'), {
    type: 'range', id: 'colorAlpha', min: 0, max: 100, step: 1,
  });
  const alphaValue = typeBox(alpha);
  alpha.oninput = () => { setInk(inkRgb(), Number(alpha.value) / 100); sync(); };
  const alphaLabel = document.createElement('label');
  alphaLabel.className = 'block';
  alphaLabel.append('Opacity (%)', alphaValue, alpha);

  // Refreshes every control, leaving alone the one being typed in.
  function sync(typing) {
    for (const [i, b] of swatches.entries()) b.classList.toggle('on', inks[i].color === inkRgb());
    sheen.value = Math.round(shimmer * 100);
    sheenValue.refresh();
    native.value = inkRgb();
    alpha.value = Math.round(inkAlpha() * 100);
    alphaValue.refresh();
    if (typing !== hex) {
      hex.value = color;
      hex.classList.remove('invalid');
    }
  }
  const sheen = Object.assign(document.createElement('input'), {
    type: 'range', id: 'colorShimmer', min: 0, max: 100, step: 5,
  });
  const sheenValue = typeBox(sheen);
  sheen.oninput = () => { shimmer = Number(sheen.value) / 100; sync(); };
  const sheenLabel = document.createElement('label');
  sheenLabel.className = 'block';
  sheenLabel.append('Shimmer (%)', sheenValue, sheen);

  sync();
  box.append(row, hex, alphaLabel, sheenLabel);
  return box;
}

function showTool(name) {
  tool = name;
  const def = TOOLS[name];
  for (const b of $('tools').children) b.classList.toggle('on', b.dataset.tool === name);
  $('hint').textContent = def.hint;
  $('apply').hidden = !def.whole;
  const box = $('params');
  box.replaceChildren();
  if (def.color) box.append(colorPicker());
  if (def.text) {
    const area = document.createElement('textarea');
    area.id = 'textString';
    area.rows = 2;
    area.spellcheck = false;
    area.value = values.text.string;
    area.oninput = () => { values.text.string = area.value; };
    const font = document.createElement('select');
    font.id = 'textFont';
    for (const [k, [label]] of Object.entries(FONTS)) font.add(new Option(label, k));
    font.value = values.text.font;
    font.onchange = () => { values.text.font = font.value; };
    const fontLabel = document.createElement('label');
    fontLabel.className = 'block';
    fontLabel.append('Font', font);
    box.append(area, fontLabel);
  }
  if (def.directions) {
    const row = document.createElement('div');
    row.className = 'row directions';
    for (const [angle, arrow, title] of DIRECTIONS) {
      const b = document.createElement('button');
      b.textContent = arrow;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.classList.toggle('on', values[name].angle === angle);
      b.onclick = () => {
        values[name].angle = angle;
        for (const s of row.children) s.classList.toggle('on', s === b);
      };
      row.append(b);
    }
    box.append(row);
  }
  for (const [key, [label, options]] of Object.entries(def.choices ?? {})) {
    if (key === 'waveShape') {
      box.append(weavePicker(name, label, options));
      continue;
    }
    const select = document.createElement('select');
    for (const [k, text] of Object.entries(options)) select.add(new Option(text, k));
    select.value = values[name][key];
    select.onchange = () => { values[name][key] = select.value; };
    const wrap = document.createElement('label');
    wrap.className = 'block';
    wrap.append(label, select);
    box.append(wrap);
  }
  for (const [key, [label, , min, max, step]] of Object.entries(def.params)) {
    const wrap = document.createElement('label');
    const dial = isDial(key);
    const hint = document.createElement('small');
    hint.className = 'hint';
    const describe = () => {
      if (name !== 'drop' || key !== 'quantity') return;
      const mL = toMm('drop', { quantity: values[name][key] }, marble).quantity;
      hint.textContent = `${Math.round((200 * maxRadius(mL, marble.film)) / marble.width)}% of the tank's width across`;
    };
    const input = document.createElement('input');
    Object.assign(input, dial
      ? { type: 'range', min: 0, max: 100, step: 1, value: valueToDial(values[name][key], min, max) }
      : { type: 'range', min, max, step, value: values[name][key] });
    input.dataset.key = key;
    const typed = typeBox(input);
    input.oninput = () => {
      values[name][key] = dial ? dialToValue(Number(input.value), min, max) : Number(input.value);
      typed.refresh();
      describe();
    };
    describe();
    wrap.append(label, typed, input);
    if (hint.textContent) wrap.append(hint);
    box.append(wrap);
  }
}

// Two repeats of a weave, drawn from the same curve the rake follows.
function weaveIcon(shape) {
  const points = [];
  for (let i = 0; i <= 96; i++) {
    const turns = (i / 96) * 2;
    const [along, across] = WEAVE_SHAPES[shape](turns - Math.floor(turns));
    points.push(`${((turns + along) * 22 + 2).toFixed(1)},${(11 - across * 8).toFixed(1)}`);
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 22');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', points.join(' '));
  svg.append(line);
  return svg;
}

const DEFAULT_WEAVE_HEIGHT = 30;

function weavePicker(name, label, options) {
  const wrap = document.createElement('div');
  wrap.className = 'block';
  wrap.append(label);
  const grid = document.createElement('div');
  grid.className = 'weaves';
  const buttons = Object.entries(options).map(([shape, text]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = text;
    b.append(weaveIcon(shape), text);
    b.classList.toggle('on', values[name].waveShape === shape);
    b.onclick = () => {
      values[name].waveShape = shape;
      // With no height a shape does nothing, which looks like it's broken.
      if (!values[name].waveAmp) {
        const height = document.querySelector('#params input[data-key=waveAmp]');
        height.value = DEFAULT_WEAVE_HEIGHT;
        height.oninput();
      }
      for (const other of buttons) other.classList.toggle('on', other === b);
    };
    return b;
  });
  grid.append(...buttons);
  wrap.append(grid);
  return wrap;
}

// Swaps the swatches and bath colour straight away, without clearing the tank.
function applyPalette(name) {
  const p = palette(name);
  inks = p.inks;
  color = inks[0].color;
  shimmer = inks[0].shimmer;
  $('bath').value = p.bath;
  marble.bath = bathColor();
  dirty = true;
  showTool(tool);
}
for (const { name } of PALETTES) $('palette').add(new Option(name, name));
$('palette').value = START_PALETTE;
$('palette').onchange = () => applyPalette($('palette').value);
$('bath').value = palette(START_PALETTE).bath;
marble.bath = bathColor();

for (const name of Object.keys(TOOLS)) {
  const b = document.createElement('button');
  b.textContent = TOOLS[name].label ?? name[0].toUpperCase() + name.slice(1);
  b.dataset.tool = name;
  b.onclick = () => showTool(name);
  $('tools').append(b);
}

// No base colour by default: the tank shows an empty grid and exports stay transparent.
function bathColor() { return $('useBath').checked ? $('bath').value : 'rgba(0,0,0,0)'; }

// ---- History ---------------------------------------------------------------

// Each user action is one undo step, however many log entries it adds. undoMarks
// holds the log length before each action; the log before the first mark (settings
// the tank started with) can't be undone.
let undoMarks = [];
let redoGroups = [];

function act(fn) {
  const before = marble.log.length;
  const state = marble.saveState();
  fn();
  if (marble.log.length > before) {
    undoMarks.push(before);
    undoStates.push(state);
    if (undoStates.length > KEPT_UNDO_STATES) undoStates[undoStates.length - KEPT_UNDO_STATES - 1] = null;
    redoGroups = [];
    redoStates = [];
    updateHistoryButtons();
  }
}

// Sets the transport toggles to whatever a log leaves in place.
function syncToggles(entries) {
  const water = entries.filter((e) => e.fn === 'openWater').at(-1);
  if (water) showSpreading(water.args.on);
  $('walls').checked = entries.filter((e) => e.fn === 'walls').at(-1)?.args.on ?? false;
  // A script's bath() shows in the sidebar, and so carries over to the next run like a sidebar choice.
  const bath = entries.filter((e) => e.fn === 'setBath').at(-1);
  if (bath) {
    $('useBath').checked = bath.args.color !== null;
    if (parseHex(bath.args.color ?? '')?.rgb) $('bath').value = parseHex(bath.args.color).rgb;
  }
}

const KEPT_UNDO_STATES = 30;
let undoStates = [];
let redoStates = [];

function resetHistory() {
  undoMarks = [];
  redoGroups = [];
  undoStates = [];
  redoStates = [];
  updateHistoryButtons();
}

function updateHistoryButtons() {
  $('undo').disabled = !undoMarks.length;
  $('redo').disabled = !redoGroups.length;
}

// Rebuilds the tank from log entries, so seeded randomness replays identically.
function rebuild(entries) {
  $('walls').checked = false;
  const m = newTank();
  m.replay(entries);
  syncToggles(entries);
  finishing = true; // catch up over several frames rather than freezing on a big tank
  updateHistoryButtons();
}

function showState(state) {
  marble.loadState(state);
  syncToggles(marble.log);
  finishing = false;
  owed = 0;
  dirty = true;
  updateHistoryButtons();
}

function undo() {
  if (pull || !undoMarks.length) return;
  const at = undoMarks.pop();
  redoGroups.push(marble.log.slice(at));
  redoStates.push(marble.saveState());
  // Puts the tank straight back. Only actions older than the kept states need replaying.
  const state = undoStates.pop();
  if (state) showState(state);
  else rebuild(marble.log.slice(0, at));
}

function redo() {
  if (pull || !redoGroups.length) return;
  const group = redoGroups.pop();
  undoMarks.push(marble.log.length);
  undoStates.push(marble.saveState());
  const state = redoStates.pop();
  if (state) showState(state);
  else rebuild([...marble.log, ...group]);
}

// ---- Canvas interaction -------------------------------------------------

// Contours centred on the origin, traced once per distinct text setting.
let traced = { key: null, contours: [] };
function currentText() {
  const { string, font, size } = inMm('text');
  const key = JSON.stringify([string, font, size]);
  if (key !== traced.key) traced = { key, contours: string.trim() ? textContours({ text: string, font, size }) : [] };
  return traced.contours;
}

// Decides when an action starts, then calls fn(at). at is undefined when the action
// should follow the script timeline, behind a settle point.
let queueEnd = 0;
function place(isTool, fn) {
  const mode = playing ? 'together' : $('queueMode').value;
  const growing = [...marble.active, ...marble.queued].some((op) => op.kind === 'drop');
  if (mode === 'settled' || (isTool && $('toolsWait').checked && growing)) {
    marble.settle();
    return fn(undefined);
  }
  const gap = Number($('queueGap').value) || 0;
  if (mode === 'order' && marble.gates.length) {
    marble.wait(gap);
    return fn(undefined);
  }
  const at = mode === 'order' ? Math.max(queueEnd, marble.time) : marble.time;
  const op = marble.live(() => fn(at));
  if (mode === 'order') queueEnd = at + (op?.duration ?? (op?.total ? op.total / op.speed : 0)) + gap;
  return op;
}

function clickAction([x, y]) {
  const v = inMm(tool);
  if (tool === 'text') {
    const contours = currentText();
    if (contours.length) place(false, (at) => marble.print({ contours: moveContours(contours, x, y), color, shimmer, at }));
  } else if (tool === 'drop') {
    for (let i = 0; i < v.count; i++) {
      const r = v.scatter * Math.sqrt(marble.random());
      const a = marble.random() * 2 * Math.PI;
      const jitter = v.count > 1 ? marble.random() * 0.5 : 0;
      place(false, (at) => marble.drop({
        x: x + r * Math.cos(a), y: y + r * Math.sin(a),
        quantity: v.quantity, dispersion: v.dispersion, color, shimmer,
        at: at === undefined || $('queueMode').value !== 'together' ? at : at + jitter,
      }));
    }
  } else if (tool === 'wriggle') {
    const degrees = v.direction === 'cw' ? -v.degrees : v.degrees;
    place(true, (at) => marble.wriggle({ x, y, period: v.period, degrees, duration: v.duration, at }));
  } else if (tool === 'stir') {
    const opposed = (i) => v.direction === 'alternate' && i % 2;
    const radii = Array.from({ length: v.rings }, (_, i) => (opposed(i) ? -1 : 1) * (i + 1) * v.ringSpacing);
    const degrees = v.direction === 'cw' ? -v.degrees : v.degrees;
    place(true, (at) => marble.stir({ x, y, radii, degrees, rate: v.rate, D: v.D, at }));
  } else if (tool === 'vortex') {
    const circulation = v.direction === 'cw' ? -v.circulation : v.circulation;
    place(true, (at) => marble.vortex({ x, y, circulation, duration: v.duration, at }));
  }
}

overlay.addEventListener('pointerdown', (ev) => {
  if (pull) return;
  overlay.setPointerCapture(ev.pointerId);
  const p = toTank(ev);
  if (tool === 'rake' || tool === 'stylus') stroke = [p];
  else if (!TOOLS[tool].whole) act(() => clickAction(p));
});
overlay.addEventListener('pointerleave', () => { hover = null; });
overlay.addEventListener('pointermove', (ev) => {
  const p = toTank(ev);
  hover = p;
  if (!stroke) return;
  if (tool === 'rake') stroke[1] = p;
  else stroke.push(p);
});
overlay.addEventListener('pointerup', () => {
  if (!stroke) return;
  const path = stroke;
  stroke = null;
  if (path.length < 2) return;
  act(() => place(true, (at) => (tool === 'rake'
    ? marble.rake({ from: path[0], to: path[1], ...inMm('rake'), at })
    : marble.stylus({ path, ...inMm('stylus'), at }))));
});

$('apply').onclick = () => act(() => place(true, (at) => (tool === 'fullRake'
  ? marble.fullRake({ ...inMm('fullRake'), at })
  : marble.jiggle({ ...inMm('jiggle'), at }))));

// ---- Transport ----------------------------------------------------------

function newTank() {
  const prev = marble;
  const Engine = currentModel().engine ?? Marble;
  marble = new Engine({
    width: Number($('tankW').value) || prev.width,
    height: Number($('tankH').value) || prev.height,
    viscosity: Number($('visc').value) || prev.viscosity,
    bath: bathColor(),
    seed: prev.seed,
  });
  queueEnd = 0;
  if (currentModel().spreading) marble.openWater({ on: true, at: 0 });
  if ($('walls').checked) marble.walls({ on: true, at: 0 });
  resize();
  return marble;
}

function setPlaying(p) {
  playing = p;
  $('play').textContent = p ? 'Pause' : 'Play';
  $('paused').hidden = p;
}
document.addEventListener('keydown', (ev) => {
  if (ev.target.matches('textarea, input:not([type=range]):not([type=checkbox]), select')) return;
  if ($('viewer').open) return;
  if ((ev.metaKey || ev.ctrlKey) && ev.code === 'KeyZ') {
    ev.preventDefault();
    if (ev.shiftKey) redo(); else undo();
    return;
  }
  if (ev.code !== 'Space' || ev.repeat) return;
  ev.preventDefault();
  setPlaying(!playing);
});
$('simulator').onchange = () => {
  localStorage.setItem('marbler.simulator', $('simulator').value);
  act(() => marble.live(() => marble.openWater({ on: currentModel().spreading, at: marble.time })));
};
$('walls').onchange = () => act(() => marble.live(() => marble.walls({ on: $('walls').checked, at: marble.time })));
$('queueMode').onchange = () => { $('queueGapLabel').hidden = $('queueMode').value !== 'order'; };
$('useBath').onchange = $('bath').oninput = () => { marble.bath = bathColor(); dirty = true; };
// On release only, so a drag adds one log entry.
$('play').onclick = () => setPlaying(!playing);
$('clear').onclick = () => { newTank(); resetHistory(); };
$('applyTank').onclick = () => { newTank(); resetHistory(); };

$('undo').onclick = undo;
$('redo').onclick = redo;

let finishing = false;
$('finish').onclick = () => { finishing = true; };

function runSource() {
  $('error').hidden = true;
  const m = newTank();
  resetHistory();
  try {
    act(() => runScript(m, $('script').value, {
      // Lives here because tracing needs a canvas, which the engine must not depend on.
      text: (o = {}) => {
        const { string, x, y, size, font, color: c, shimmer: sh, at } = toMm('text', o, m);
        return m.print({ contours: textContours({ text: string, x, y, size, font }), color: c, shimmer: sh, at });
      },
    }));
  } catch (err) {
    $('error').textContent = String(err);
    $('error').hidden = false;
  }
  // A script may change these settings itself, so the controls follow whatever it left in place.
  syncToggles(m.log);
  setPlaying(true);
}
$('run').onclick = runSource;
$('capture').onclick = () => { $('script').value = marble.toScript(); };

function showError(message) {
  $('error').textContent = message;
  $('error').hidden = !message;
}

// The chat lives only in this page. The assistant edits the script box through tools on the
// server, and its changes only run once the user presses Run.
let chatMessages = [];

function renderChat() {
  const log = $('chatLog');
  log.replaceChildren(...chatMessages.map(({ role, content }) => {
    const line = document.createElement('div');
    line.className = `chat-${role}`;
    line.textContent = content;
    return line;
  }));
  log.hidden = !chatMessages.length;
  $('clearChat').hidden = !chatMessages.length;
  log.scrollTop = log.scrollHeight;
}

async function sendChat() {
  const content = $('prompt').value.trim();
  if (!content || $('generate').disabled) return;
  showError('');
  chatMessages.push({ role: 'user', content });
  $('prompt').value = '';
  renderChat();
  const sending = chatMessages;
  let failed = true;
  // A reply replaces the script, so hand edits made while waiting would be lost.
  $('script').readOnly = true;
  $('generate').disabled = true;
  $('clearChat').disabled = true;
  $('generate').textContent = 'Working…';
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: sending, script: $('script').value }),
    });
    if (res.status === 404 || res.status === 501) {
      showError('The assistant needs the local server. Start with: node server.mjs');
      return;
    }
    const data = await res.json().catch(() => ({ error: `Server replied ${res.status} with no usable JSON` }));
    if (data.error) {
      showError(data.error);
      return;
    }
    $('script').value = data.script;
    chatMessages.push({ role: 'assistant', content: data.reply });
    failed = false;
  } catch (err) {
    showError(`Couldn't reach the server: ${err.message}`);
  } finally {
    // A failed turn comes back out of the chat, ready to send again.
    if (failed) {
      chatMessages.pop();
      $('prompt').value = content;
    }
    renderChat();
    $('script').readOnly = false;
    $('generate').disabled = false;
    $('clearChat').disabled = false;
    $('generate').textContent = 'Send';
  }
}
$('generate').onclick = sendChat;
$('prompt').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') sendChat(); });
// Forgets the conversation only; the script stays as it is.
$('clearChat').onclick = () => {
  chatMessages = [];
  renderChat();
};

const Speech = window.webkitSpeechRecognition;
if (Speech) {
  const mic = $('mic');
  mic.hidden = false;
  let listening = null;
  mic.onclick = () => {
    if (listening) { listening.stop(); return; }
    const rec = new Speech();
    rec.interimResults = true;
    rec.onresult = (ev) => {
      $('prompt').value = Array.from(ev.results, (r) => r[0].transcript).join(' ');
    };
    rec.onerror = (ev) => showError(`Microphone: ${ev.error}`);
    rec.onend = () => { listening = null; mic.classList.remove('on'); };
    rec.start();
    listening = rec;
    mic.classList.add('on');
  };
}

$('examples').add(new Option('Examples…', ''));
for (const name of Object.keys(EXAMPLES)) $('examples').add(new Option(name, name));
$('examples').onchange = () => {
  if (!$('examples').value) return;
  $('script').value = EXAMPLES[$('examples').value];
  runSource();
};

// ---- Saved states ---------------------------------------------------------

async function renderSaves() {
  const saves = await listSaves();
  $('saves').replaceChildren(...saves.reverse().map((save) => {
    const row = document.createElement('div');
    row.className = 'save';
    const thumb = Object.assign(document.createElement('img'), { src: save.thumb, alt: '' });
    const when = document.createElement('span');
    when.textContent = new Date(save.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const restore = Object.assign(document.createElement('button'), { textContent: 'Restore' });
    restore.onclick = () => restoreSave(save);
    const remove = Object.assign(document.createElement('button'), { textContent: '✕', title: 'Delete this save' });
    remove.onclick = async () => { await deleteSave(save.id); renderSaves(); };
    row.append(thumb, when, restore, remove);
    return row;
  }));
}

$('saveState').onclick = async () => {
  const shot = document.createElement('canvas');
  shot.width = 120;
  shot.height = Math.round((120 * tank.height) / tank.width) || 84;
  shot.getContext('2d').drawImage(tank, 0, 0, shot.width, shot.height);
  await addSave({
    created: Date.now(),
    thumb: shot.toDataURL('image/png'),
    simulator: $('simulator').value,
    script: $('script').value,
    useBath: $('useBath').checked,
    bath: $('bath').value,
    visc: $('visc').value,
    state: marble.saveState(),
  });
  renderSaves();
};

function restoreSave(save) {
  $('simulator').value = save.simulator;
  $('script').value = save.script;
  $('useBath').checked = save.useBath;
  $('bath').value = save.bath;
  $('visc').value = save.visc;
  $('tankW').value = save.state.width;
  $('tankH').value = save.state.height;
  newTank();
  resetHistory();
  marble.loadState(save.state);
  queueEnd = 0;
  syncToggles(marble.log);
  $('simulator').value = save.simulator;
  resize();
  finishing = false;
  owed = 0;
  dirty = true;
}
renderSaves();

// ---- Export -------------------------------------------------------------

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('png').onclick = () => {
  const scale = 3000 / Math.max(marble.width, marble.height);
  const c = document.createElement('canvas');
  c.width = Math.round(marble.width * scale);
  c.height = Math.round(marble.height * scale);
  marble.draw(c.getContext('2d'), scale);
  c.toBlob((b) => download(b, 'marble.png'));
};
$('svg').onclick = () => download(new Blob([marble.toSVG()], { type: 'image/svg+xml' }), 'marble.svg');

// ---- Paper pull -----------------------------------------------------------

function startPull() {
  if (pull) return;
  pull = {
    start: performance.now(),
    ...pullPrint(marble, {
      tint,
      imperfection: Number($('imperfection').value) / 100,
      mirror: $('mirror').checked,
      seed: pullSeed++,
    }),
    cleared: false,
  };
  $('pull').disabled = true;
  stroke = null;
}

async function finishPull() {
  const { print } = pull;
  pull = null;
  $('pull').disabled = false;
  const blob = await new Promise((resolve) => print.toBlob(resolve));
  if ($('autoSave').checked) download(blob, `marble-pull-${stamp()}.png`);
  const id = await savePull(blob).catch(() => null);
  await showGallery();
  openViewer(blob, id);
}

const stamp = (date = Date.now()) => new Date(date).toISOString().slice(0, 19).replace(/[:T]/g, '-');

let viewing = null;
function openViewer(blob, id, date) {
  if (viewing) URL.revokeObjectURL(viewing.url);
  viewing = { blob, id, date, url: URL.createObjectURL(blob) };
  $('viewerImg').src = viewing.url;
  $('viewerDelete').hidden = id == null;
  if (!$('viewer').open) $('viewer').showModal();
}
$('viewerClose').onclick = () => $('viewer').close();
$('viewerSave').onclick = () => download(viewing.blob, `marble-pull-${stamp(viewing.date)}.png`);
$('viewerDelete').onclick = async () => {
  await deletePull(viewing.id);
  $('viewer').close();
  await showGallery();
};

let thumbs = [];
async function showGallery() {
  const pulls = await listPulls().catch(() => []);
  thumbs.forEach((u) => URL.revokeObjectURL(u));
  thumbs = pulls.map((p) => URL.createObjectURL(p.blob));
  $('gallery').replaceChildren(...pulls.map((p, i) => {
    const img = document.createElement('img');
    img.src = thumbs[i];
    img.alt = `Print from ${stamp(p.date)}`;
    img.title = stamp(p.date);
    img.onclick = () => openViewer(p.blob, p.id, p.date);
    return img;
  }).reverse());
}

$('pull').onclick = startPull;
const imperfectionBox = typeBox($('imperfection'));
$('imperfectionValue').replaceWith(imperfectionBox);
$('imperfection').oninput = () => imperfectionBox.refresh();
for (const [name, c] of Object.entries(TINTS)) {
  const b = document.createElement('button');
  b.style.background = c;
  b.title = name;
  b.classList.toggle('on', c === tint);
  b.onclick = () => {
    tint = c;
    for (const s of $('tints').children) s.classList.toggle('on', s === b);
  };
  $('tints').append(b);
}

// ---- Main loop ----------------------------------------------------------

// Black or white guides, whichever stands out against the bath.
function guideColor(alpha) {
  const hex = parseHex(marble.bath);
  const n = hex ? parseInt(hex.rgb.slice(1), 16) : 0xffffff;
  const luma = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return `${luma < 110 ? 'rgba(255,255,255,' : 'rgba(0,0,0,'}${alpha})`;
}

function drawTextPreview() {
  const contours = currentText();
  if (!contours.length) return;
  octx.save();
  octx.globalAlpha = 0.55;
  octx.fillStyle = inkRgb();
  octx.beginPath();
  for (const c of contours) {
    for (let i = 0; i < c.length; i += 2) {
      const [x, y] = toPx([c[i] + hover[0], c[i + 1] + hover[1]]);
      i ? octx.lineTo(x, y) : octx.moveTo(x, y);
    }
    octx.closePath();
  }
  octx.fill('evenodd');
  octx.restore();
}

// Dashed previews are slow to draw, so they live on their own canvas, redrawn only
// when what they show changes. Queued actions show only while paused.
const previewLayer = document.createElement('canvas');
const lctx = previewLayer.getContext('2d');
let previewKey = '';
let previewHasContent = false;

function dashedRakeLines(ctx, m, op) {
  const steps = op.waveAmp ? Math.ceil((op.total * WEAVE_POINTS) / op.waveLength) : 1;
  ctx.beginPath();
  for (const off of op.offs) {
    for (let k = 0; k <= steps; k++) {
      const [x, y] = toPx(m._rakePoint(op, (op.total * k) / steps, off));
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
  }
  // Alternating dark and light dashes show up on any bath or ink.
  ctx.strokeStyle = '#000c';
  ctx.lineDashOffset = 0;
  ctx.stroke();
  ctx.strokeStyle = '#fffc';
  ctx.lineDashOffset = 4.5;
  ctx.stroke();
  ctx.lineDashOffset = 0;
}

function renderPreviewLayer(showQueued, fullRakeOp) {
  if (previewLayer.width !== overlay.width || previewLayer.height !== overlay.height) {
    previewLayer.width = overlay.width;
    previewLayer.height = overlay.height;
  }
  const px = devicePixelRatio || 1;
  lctx.clearRect(0, 0, previewLayer.width, previewLayer.height);
  lctx.lineWidth = px;
  lctx.setLineDash([5, 4]);
  previewHasContent = false;
  for (const op of showQueued ? marble.queued : []) {
    if (op.kind === 'rake') {
      dashedRakeLines(lctx, marble, op);
      previewHasContent = true;
    } else if (op.kind === 'drop') {
      const [x, y] = toPx([op.x, op.y]);
      const c = opaque(op.color);
      lctx.strokeStyle = c;
      lctx.fillStyle = c;
      lctx.beginPath();
      lctx.arc(x, y, Math.sqrt(op.maxArea) * pxPerMm, 0, 7);
      lctx.stroke();
      lctx.beginPath();
      lctx.arc(x, y, 3 * px, 0, 7);
      lctx.fill();
      previewHasContent = true;
    }
  }
  if (fullRakeOp) {
    dashedRakeLines(lctx, fullRakeOp.m, fullRakeOp.op);
    previewHasContent = true;
  }
}

// The planned tines come from a throwaway tank, so the preview uses the engine's geometry.
let plannedRake = { key: null, op: null };
function plannedFullRake() {
  if (tool !== 'fullRake') return null;
  const key = JSON.stringify([values.fullRake, marble.width, marble.height]);
  if (key !== plannedRake.key) {
    const m = new Marble({ width: marble.width, height: marble.height });
    plannedRake = { key, op: { m, op: m.fullRake({ ...inMm('fullRake', m), at: 0 }) } };
  }
  return plannedRake.op;
}

function drawPreviewLayer() {
  const showQueued = !playing;
  const planned = plannedFullRake();
  const key = [showQueued, showQueued ? marble.log.length : 0, showQueued ? marble.queued.length : 0,
    planned ? plannedRake.key : '', overlay.width, overlay.height].join('|');
  if (key !== previewKey) {
    renderPreviewLayer(showQueued, planned);
    previewKey = key;
  }
  if (previewHasContent) octx.drawImage(previewLayer, 0, 0);
}

function drawOverlay() {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  if (pull) {
    drawSweep(octx, pull, (performance.now() - pull.start) / 1000);
    return;
  }
  if (tool === 'text' && hover) drawTextPreview();
  octx.lineWidth = devicePixelRatio || 1;
  if (stroke && stroke.length > 1) {
    octx.strokeStyle = guideColor(0.7);
    octx.beginPath();
    stroke.forEach((p, i) => { const [x, y] = toPx(p); i ? octx.lineTo(x, y) : octx.moveTo(x, y); });
    octx.stroke();
    if (tool === 'rake') {
      const [a, b] = stroke;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const perp = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
      const { teeth, spacing } = inMm('rake');
      octx.fillStyle = guideColor(0.75);
      for (let i = 0; i < teeth; i++) {
        const off = (i - (teeth - 1) / 2) * spacing;
        const [x, y] = toPx([a[0] + perp[0] * off, a[1] + perp[1] * off]);
        octx.beginPath();
        octx.arc(x, y, 2.5 * octx.lineWidth, 0, 7);
        octx.fill();
      }
    }
  }
  drawPreviewLayer();
  octx.fillStyle = guideColor(0.8);
  for (const p of marble.tinePositions()) {
    const [x, y] = toPx(p);
    octx.beginPath();
    octx.arc(x, y, 2 * octx.lineWidth, 0, 7);
    octx.fill();
  }
}

const STEP_BUDGET_MS = 10;   // simulation per frame while playing, leaving room for input
const FINISH_BUDGET_MS = 24; // Finish now asks for speed, so it gets more
const GLINT_MS = 33;
const SLOW_DRAW_MS = 25;
const LOADED_FRAME_MS = 28;  // average frame gap that counts as the page falling behind
const BEHIND_FRAME_MS = 40;  // ...and that slows tank redraws too

let nextDraw = 0;
let nextGlint = 0;
let lastDrawMs = 0;
let nextStats = 0;
let frameGap = 16;      // smoothed time between frames; canvas work mostly lands here, not in draw()
let glintResting = null; // the tank state the glint gave up on, until something changes
let last = performance.now();
let owed = 0;
function frame(now) {
  const wall = Math.min((now - last) / 1000, 0.1);
  const gap = now - last;
  if (gap < 250) frameGap += (gap - frameGap) * 0.1; // longer gaps are a hidden tab, not load
  last = now;
  const start = performance.now();
  if (pull) {
    // The tank holds still under the sheet. Clearing happens once it is fully covered.
    const elapsed = (now - pull.start) / 1000;
    if (!pull.cleared && elapsed > LAY_SECONDS && $('clearAfter').checked) {
      pull.cleared = true;
      newTank();
      resetHistory();
    }
    if (elapsed >= PULL_SECONDS) finishPull();
  } else if (finishing) {
    while (marble.busy && performance.now() < start + FINISH_BUDGET_MS) { marble.step(); dirty = true; }
    if (!marble.busy) finishing = false;
  } else if (playing && marble.busy) {
    owed += wall * Number($('speed').value);
    while (owed >= marble.dt && performance.now() < start + STEP_BUDGET_MS) {
      marble.step();
      owed -= marble.dt;
      dirty = true;
    }
    owed = Math.min(owed, 0.5); // run slower than real time rather than freezing
  } else if (playing) {
    marble.time += wall; // idle time passes, so new actions start now
    owed = 0;
  }
  // Metallic inks glint, but not under load. If the page can't keep up even when the
  // sim has settled, the glint rests until the tank next changes.
  const underLoad = finishing || owed > 0.1 || lastDrawMs > SLOW_DRAW_MS || frameGap > LOADED_FRAME_MS;
  const tankState = `${marble.seed}|${marble.log.length}|${marble.polys.length}`;
  if (underLoad && !marble.busy && !finishing) glintResting = tankState;
  else if (glintResting !== tankState) glintResting = null;
  if (!pull && !underLoad && !glintResting && now >= nextGlint && marble.polys.some((p) => p.shimmer > 0)) {
    marble.sheenPhase += Math.max(wall, GLINT_MS / 1000);
    nextGlint = now + GLINT_MS;
    dirty = true;
  }
  // A slow redraw waits twice its own length before the next, so most of the time stays free.
  if (dirty && performance.now() >= nextDraw) {
    const drawStart = performance.now();
    marble.draw(tctx, pxPerMm);
    lastDrawMs = performance.now() - drawStart;
    nextDraw = drawStart + Math.max(lastDrawMs * 3, frameGap > BEHIND_FRAME_MS ? 100 : 0);
    dirty = false;
  }
  drawOverlay();
  if (now >= nextStats) {
    nextStats = now + 250;
    showStats();
  }
  requestAnimationFrame(frame);
}

function showStats() {
  const warn = marble.capped ? ' <span class="warn">detail limit reached: edges may look coarse</span>' : '';
  $('stats').innerHTML = `t ${marble.time.toFixed(1)} s · ${marble.polys.length} drops · `
    + `${marble.vertexCount.toLocaleString()} points · ${marble.active.length} active · ${marble.queued.length} queued${warn}`;
}

// ---- Start --------------------------------------------------------------

showTool('drop');
// Opens on an empty tank; the examples only run when chosen.
newTank();
resetHistory();
showGallery();
requestAnimationFrame(frame);

window.marble = () => marble; // for use from the browser console
