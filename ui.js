import { Marble, runScript, maxRadius, WEAVE_POINTS, WEAVE_SHAPES } from './engine.js';
import { toMm, dialToValue, valueToDial } from './api.js';
import { TOOLS, TURNS, PAGE_UNITS, isDial } from './tools.js';
import { MODELS } from './models.js';
import { renderPrint, PRINT_DEFAULTS } from './print.js';
import { makeProfiler } from './profile.js';
import { listSaves, addSave, deleteSave } from './saves.js';
import { keptList } from './kept.js';
import { PALETTES, palette, setSavedPalettes, isBuiltInPalette, validPalette, cleanPalette, MAX_INKS } from './palettes.js';
import { addInfo, infoIcon } from './info.js';
import { FONTS, textContours, moveContours } from './text.js';
import { TINTS, PULL_SECONDS, LAY_SECONDS, pullPrint, drawSweep, savePull, listPulls, deletePull } from './paper.js';

const $ = (id) => document.getElementById(id);
const START_PALETTE = 'Dark Academia';

const EXAMPLES = {
  'Lapis bullseyes': `// Drops stacked on one spot in order, each pushing the last outward.
viscosity({ value: 1000 });
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
viscosity({ value: 1000 });
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
viscosity({ value: 1000 });
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
viscosity({ value: 1000 });
const dark = palette('Dark Academia').inks;
drops({ n: 90, quantity: 1.4, spread: 0.6, stagger: 2.5, dispersion: 1.4, colors: dark.slice(0, 5) });
settle();
wait(0.5);
drops({ n: 70, quantity: 0.07, spread: 0.7, stagger: 2, dispersion: 2, colors: [dark[5]] });
`,
  'Oxblood whirl': `// Rings poured in order at the centre, then stirred in opposite directions.
viscosity({ value: 1000 });
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
viscosity({ value: 1000 });
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
  'Dot garden': `// Big dots first, small ones tucked into the gaps.
viscosity({ value: 1000 });
const p = palette('Old Dutch');
fillDots({ count: 220, min: 0.8, max: 9, colors: p.inks.slice(0, 4) });
settle();
`,
  'Bead field': `// Dots of stacked rings, each layer settling before the next.
viscosity({ value: 1000 });
fillDots({ count: 60, min: 1.5, max: 10, gap: 0.8, rings: 3, colors: palette('Copper & Verdigris').inks });
settle();
`,
  'Chevrons': `// Bands of colour combed one way, then back between the first lines.
viscosity({ value: 1000 });
const inks = palette('Old Dutch').inks;
stripes({ count: 30, colors: inks, slivers: 1 });
fullRake({ angle: 90, teeth: 8, speed: 24, D: 0.7 });
fullRake({ angle: 270, teeth: 8, offset: 6.25, speed: 24, D: 0.7 });
fullRake({ angle: 0, teeth: 40, speed: 30, D: 0.3 });`,
  'Ribbons': `// Stripes combed back and forth with a few wide teeth, until they stretch into ribbons.
viscosity({ value: 1000 });
const inks = ['#b5302a', '#2a4a8a', '#c8d8c0', '#7fa8b0', '#d07080', '#203070'];
bath({ color: '#c8d8c0' });
stripes({ count: 40, colors: inks, slivers: 1.5, variation: 0.8 });
for (let i = 0; i < 3; i++) {
  fullRake({ angle: 90, teeth: 4, speed: 40, D: 2 });
  fullRake({ angle: 270, teeth: 4, offset: 12.5, speed: 40, D: 2 });
}`,
  'Big waves': `// One slow, very wide pass each way bends stripes into broad waves.
viscosity({ value: 1000 });
const inks = ['#b5302a', '#2a4a8a', '#c8d8c0', '#7fa8b0', '#d07080', '#203070'];
bath({ color: '#c8d8c0' });
stripes({ count: 40, colors: inks, slivers: 1.5, variation: 0.8 });
fullRake({ angle: 90, teeth: 3, speed: 60, D: 3 });
fullRake({ angle: 270, teeth: 3, offset: 16.7, speed: 60, D: 3 });`,
  'Flames': `// Wide combing up and down, twice, draws stripes out into flames.
viscosity({ value: 1000 });
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
bath({ color: '#f7e1b5' });
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
for (let i = 0; i < 2; i++) {
  fullRake({ angle: 90, teeth: 7, speed: 30, D: 1.4 });
  fullRake({ angle: 270, teeth: 7, offset: 7.14, speed: 30, D: 1.4 });
}`,
  'Two-way feathers': `// Combed up and down, across, then up and down again, so the feathers point both ways.
viscosity({ value: 1000 });
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
bath({ color: '#f7e1b5' });
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
fullRake({ angle: 90, teeth: 6, speed: 30, D: 1 });
fullRake({ angle: 270, teeth: 6, offset: 8.33, speed: 30, D: 1 });
fullRake({ angle: 0, teeth: 24, speed: 30, D: 0.5 });
fullRake({ angle: 90, teeth: 6, speed: 20, D: 0.8 });
fullRake({ angle: 270, teeth: 6, offset: 8.33, speed: 20, D: 0.8 });`,
  'Whorls': `// In a thin bath with a strong push, the wake behind each tine rolls up into spirals.
viscosity({ value: 10 });
flow({ friction: 0.05, coast: 120, push: 3 });
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
bath({ color: '#f7e1b5' });
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
settle();
fullRake({ angle: 0, teeth: 5, speed: 30 });
settle();`,
  'Repeating whorls': `// Whorls on a repeating tank: swirls roll across the seams. Press See it repeat to check.
tile();
viscosity({ value: 10 });
flow({ friction: 0.05, coast: 120, push: 3 });
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
bath({ color: '#f7e1b5' });
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
settle();
fullRake({ angle: 0, teeth: 5, speed: 30 });
settle();`,
  'Grid ink spirals': `// Spirals in soft, blended colour. Runs for minutes on the grid ink simulator.
viscosity({ value: 10 });
flow({ friction: 0.05, coast: 40, push: 3 });
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
bath({ color: '#f7e1b5' });
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
settle();
air({ scale: 20, speed: 8 });
settle();`,
  'Storm': `// Two strong passes leave a swirling storm. A higher point limit in Detail lets it run longer.
viscosity({ value: 10 });
flow({ friction: 0.05, coast: 40, push: 3 });
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
bath({ color: '#f7e1b5' });
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
settle();
fullRake({ angle: 90, teeth: 5, speed: 30, D: 1 });
fullRake({ angle: 270, teeth: 5, offset: 10, speed: 30, D: 1 });
settle();`,
  'Italian marble': `// One breath of air over stripes, with no comb at all.
viscosity({ value: 1000 });
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
bath({ color: '#f7e1b5' });
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
air({ scale: 20, speed: 8 });`,
  'Spiral field': `// A breath of air in a whorling bath fills the page with spirals. Heavy: it makes a lot of points.
viscosity({ value: 10 });
flow({ friction: 0.05, coast: 40, push: 3 });
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
bath({ color: '#f7e1b5' });
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
settle();
air({ scale: 20, speed: 8 });
settle();`,
  'Seamless wallpaper': `// One tile of a repeating pattern. Press See it repeat to check it joins up.
viscosity({ value: 1000 });
tile();
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
fullRake({ angle: 90, teeth: 6, speed: 30, D: 1 });
fullRake({ angle: 270, teeth: 6, offset: 8.33, speed: 30, D: 1 });
fullRake({ angle: 0, teeth: 24, speed: 30, D: 0.5 });
air({ scale: 25, speed: 6 });`,
  'Starry spray': `// Dark dots with fine metallic spray over the top.
viscosity({ value: 1000 });
const p = palette('Lapis & Gilt');
bath({ color: p.bath });
fillDots({ count: 40, min: 2, max: 12, gap: 1, colors: p.inks.slice(0, 3) });
settle();
spray({ x: 30, y: 40, radius: 40, n: 300, colors: [p.inks[4]] });
spray({ x: 70, y: 65, radius: 40, n: 300, colors: [p.inks[3], p.inks[4]] });
settle();
`,
  'Wave comb': `// A traced surf wave as the rake's path. Try it on any simulator.
viscosity({ value: 1000 });
const p = palette('Old Dutch');
for (let i = 0; i < 8; i++) {
  for (let j = 0; j < 11; j++) drop({ x: 4 + j * 9.2, y: 6 + i * 12.5, quantity: 1.6, color: p.inks[i % 4] });
}
settle();
fullRake({ angle: 0, teeth: 5, speed: 25, D: 1, waveAmp: 5, waveLength: 18, waveShape: 'wave' });
`,
  'Verdigris waves': `// Copper and verdigris bands, shaken into waves.
viscosity({ value: 1000 });
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
let tileSimulator = null; // the simulator the Repeating tick was last set for
let inks = palette(START_PALETTE).inks;
let color = inks[0].color;
let shimmer = inks[0].shimmer;
const values = {};
for (const [name, def] of Object.entries(TOOLS)) {
  values[name] = Object.fromEntries(Object.entries(def.params).map(([k, p]) => [k, p[1]]));
  for (const [k, c] of Object.entries(def.choices ?? {})) values[name][k] = c[2];
}

values.fullRake.angle = 0;
values.stripes.angle = 0;

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
// Each simulator has its own starting viscosity. Grid ink's grid flow wants a thinner bath.
const STANDARD_VISCOSITY = 1000;
const startingViscosity = (model = currentModel()) => model?.viscosity ?? STANDARD_VISCOSITY;
let viscositySimulator = currentModel().id; // whose starting viscosity the box was last given
$('visc').value = startingViscosity();
// Changing simulator moves the box to the new one's starting value, unless it holds the user's own.
function syncViscosity() {
  const was = MODELS.find((m) => m.id === viscositySimulator);
  if (Number($('visc').value) === startingViscosity(was)) $('visc').value = startingViscosity();
  viscositySimulator = currentModel().id;
}
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
  const swatches = inks.map((ink, i) => {
    const b = document.createElement('button');
    b.style.background = ink.color;
    const name = ink.shimmer > 0 ? `${ink.color}, shimmer ${ink.shimmer}` : ink.color;
    b.title = i < 9 ? `${i + 1}: ${name}` : name;
    b.classList.toggle('metal', ink.shimmer > 0);
    b.onclick = () => { setInk(ink.color, inkAlpha()); shimmer = ink.shimmer; sync(); };
    return b;
  });
  const native = Object.assign(document.createElement('input'), { type: 'color', id: 'customColor' });
  native.style.width = '40px';
  native.oninput = () => { setInk(native.value, inkAlpha()); sync(); };
  row.append(...swatches, native, infoIcon('color.swatches'));

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
  alphaLabel.append('Opacity (%)', infoIcon('color.alpha'), alphaValue, alpha);

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
  sheenLabel.append('Shimmer (%)', infoIcon('color.shimmer'), sheenValue, sheen);

  sync();
  box.append(row, hex, alphaLabel, sheenLabel);
  return box;
}

function showTool(name) {
  tool = name;
  stroke = null;
  const def = TOOLS[name];
  for (const b of $('tools').children) b.classList.toggle('on', b.dataset.tool === name);
  $('hint').textContent = `${def.hint} `;
  $('hint').append(infoIcon(`tool.${name}`));
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
    wrap.append(label, infoIcon(`${name}.${key}`), select);
    box.append(wrap);
  }
  for (const [key, [label, , min, max, step, over]] of Object.entries(def.params)) {
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
      ? { type: 'range', min: 0, max: over?.top ?? 100, step: 1, value: valueToDial(values[name][key], min, max, over) }
      : { type: 'range', min, max, step, value: values[name][key] });
    input.dataset.key = key;
    const typed = typeBox(input);
    input.oninput = () => {
      values[name][key] = dial ? dialToValue(Number(input.value), min, max, over) : Number(input.value);
      typed.refresh();
      describe();
      // Adding height to a straight rake means wanting a weave.
      if (key === 'waveAmp' && values[name][key] > 0 && values[name].waveShape === 'straight') {
        values[name].waveShape = 'sine';
        for (const b of document.querySelectorAll('.weaves button')) b.classList.toggle('on', b.title === 'Sine');
      }
    };
    describe();
    wrap.append(label, infoIcon(`${name}.${key}`), typed, input);
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
  wrap.append(label, infoIcon(`${name}.waveShape`));
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
      for (const other of buttons) other.classList.toggle('on', other === b);
      const height = document.querySelector('#params input[data-key=waveAmp]');
      if (shape === 'straight') {
        height.value = 0;
        height.oninput();
        return;
      }
      // With no height a shape does nothing, which looks like it's broken.
      if (!values[name].waveAmp) {
        height.value = DEFAULT_WEAVE_HEIGHT;
        height.oninput();
      }
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
  // A copy, so changing colours in the editor can't change the palette it started from.
  inks = p.inks.map((ink) => ({ ...ink }));
  color = inks[0].color;
  shimmer = inks[0].shimmer;
  $('bath').value = p.bath;
  marble.bath = bathColor();
  dirty = true;
  showTool(tool);
  $('palette').value = p.name;
  $('paletteName').value = isBuiltInPalette(p.name) ? '' : p.name;
  renderPaletteEditor();
}

const myPalettes = keptList('marbler.palettes', validPalette);

// The current palette's inks, each with its colour, shimmer and a button to remove it.
function renderPaletteEditor() {
  $('paletteInks').replaceChildren(...inks.map((ink, i) => {
    const row = document.createElement('div');
    row.className = 'paletteInk';
    const pick = Object.assign(document.createElement('input'), { type: 'color', value: ink.color.slice(0, 7), title: `Ink ${i + 1}` });
    pick.setAttribute('aria-label', `Ink ${i + 1} colour`);
    pick.oninput = () => {
      const chosen = color === ink.color;
      ink.color = pick.value + ink.color.slice(7); // keeps any transparency
      if (chosen) color = ink.color;
      showTool(tool);
    };
    const metal = Object.assign(document.createElement('input'), { type: 'range', min: 0, max: 1, step: 0.05, value: ink.shimmer, title: 'Shimmer: 0 is matte, 1 is metallic' });
    metal.setAttribute('aria-label', `Ink ${i + 1} shimmer`);
    metal.oninput = () => {
      const chosen = color === ink.color;
      ink.shimmer = Number(metal.value);
      if (chosen) shimmer = ink.shimmer;
      showTool(tool);
    };
    const remove = Object.assign(document.createElement('button'), { textContent: '✕', title: 'Remove this ink', disabled: inks.length < 2 });
    remove.onclick = () => {
      inks.splice(i, 1);
      if (!inks.some((k) => k.color === color)) { color = inks[0].color; shimmer = inks[0].shimmer; }
      showTool(tool);
      renderPaletteEditor();
    };
    row.append(pick, metal, remove);
    return row;
  }));
  $('addInk').disabled = inks.length >= MAX_INKS;
  $('deletePalette').disabled = isBuiltInPalette($('palette').value);
}

// The dropdown and what scripts can reach both follow what's saved.
function renderPalettes(chosen) {
  const saved = myPalettes.list();
  setSavedPalettes(saved);
  const group = (label, list) => {
    const g = Object.assign(document.createElement('optgroup'), { label });
    g.append(...list.map((p) => new Option(p.name, p.name)));
    return g;
  };
  const builtIn = PALETTES.slice(0, PALETTES.length - saved.length);
  $('palette').replaceChildren(...(saved.length ? [group('My palettes', saved), group('Built in', builtIn)] : builtIn.map((p) => new Option(p.name, p.name))));
  $('palette').value = chosen;
}

renderPalettes(START_PALETTE);
$('palette').onchange = () => applyPalette($('palette').value);
$('addInk').onclick = () => {
  inks.push({ color: '#808080', shimmer: 0 });
  showTool(tool);
  renderPaletteEditor();
};
$('savePalette').onclick = () => {
  const name = $('paletteName').value.trim();
  if (!name) { $('paletteName').focus(); return; }
  if (isBuiltInPalette(name)) { showError(`"${name}" is a built-in palette, so choose another name.`); return; }
  const entry = { name, bath: $('bath').value, inks };
  if (!validPalette(entry)) { showError('A palette name can be up to 40 characters.'); return; }
  const existing = myPalettes.list().find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (existing && existing.name !== $('palette').value && !confirm(`Replace the saved palette "${existing.name}"?`)) return;
  try {
    if (existing && existing.name !== name) myPalettes.remove(existing.name);
    myPalettes.save(cleanPalette(entry));
    showError('');
  } catch (err) {
    showError(`Couldn't save the palette: ${err.message}`);
    return;
  }
  renderPalettes(name);
  renderPaletteEditor();
};
$('deletePalette').onclick = () => {
  const name = $('palette').value;
  if (isBuiltInPalette(name) || !confirm(`Delete the saved palette "${name}"?`)) return;
  myPalettes.remove(name);
  renderPalettes(START_PALETTE);
  applyPalette(START_PALETTE);
};
// What the assistant did to palettes, applied only once its whole turn has succeeded.
function applyPaletteActions(actions = []) {
  for (const action of actions) {
    if (action.type === 'save') {
      const others = myPalettes.list().filter((p) => p.name.toLowerCase() === action.palette.name.toLowerCase() && p.name !== action.palette.name);
      for (const other of others) myPalettes.remove(other.name);
      myPalettes.save(action.palette);
      renderPalettes($('palette').value);
    } else if (action.type === 'use') {
      applyPalette(action.name);
    }
  }
}
$('bath').value = palette(START_PALETTE).bath;
marble.bath = bathColor();
inks = palette(START_PALETTE).inks.map((ink) => ({ ...ink }));
renderPaletteEditor();

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
    trimUndo();
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
  $('tile').checked = entries.filter((e) => e.fn === 'tile').at(-1)?.args.on ?? currentModel().repeatsAtFirst === true;
  $('tileOffset').value = entries.filter((e) => e.fn === 'tile').at(-1)?.args.offset ?? '';
  syncTile();
  // A script's bath() shows in the sidebar, and so carries over to the next run like a sidebar choice.
  const thickness = entries.filter((e) => e.fn === 'setViscosity').at(-1);
  if (thickness) $('visc').value = thickness.args.value;
  const flow = entries.filter((e) => e.fn === 'setFlow').at(-1);
  if (flow) showFlow(flow.args);
  syncBathPanel();
  const bath = entries.filter((e) => e.fn === 'setBath').at(-1);
  if (bath) {
    $('useBath').checked = bath.args.color !== null;
    if (parseHex(bath.args.color ?? '')?.rgb) $('bath').value = parseHex(bath.args.color).rgb;
  }
}

const KEPT_UNDO_STATES = 30;
const KEPT_UNDO_BYTES = 500e6;
const stateBytes = (state) => state.polys.reduce((sum, p) => sum + p.xy.byteLength, 0)
  + Object.values(state.grid ?? {}).flat().reduce((sum, f) => sum + (f?.byteLength ?? 0), 0);
// Big tanks are expensive to copy. Older steps lose their copy and are replayed if undone.
function trimUndo() {
  let bytes = 0;
  for (let i = undoStates.length - 1; i >= 0; i--) {
    if (!undoStates[i]) continue;
    bytes += stateBytes(undoStates[i]);
    if (bytes > KEPT_UNDO_BYTES && i < undoStates.length - 1) undoStates[i] = null;
  }
}
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
  $('tile').checked = currentModel().repeatsAtFirst === true;
  const m = newTank();
  m.replay(entries);
  syncToggles(entries);
  finishing = true; // catch up over several frames rather than freezing on a big tank
  updateHistoryButtons();
}

function showState(state) {
  marble.loadState(state);
  applyDetail(marble);
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

function sprayAt(x, y, share = 1) {
  const v = inMm('spray');
  const colors = v.sprayColors === 'one' ? [{ color, shimmer }] : inks;
  place(false, (at) => marble.spray({ x, y, radius: v.radius, n: Math.max(1, Math.round(v.n * share)), min: Math.min(v.min, v.max), max: v.max, colors, at }));
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
  } else if (tool === 'spray') {
    sprayAt(x, y);
  } else if (tool === 'erase') {
    if (marble.eraseSupported) place(false, (at) => marble.erase({ x, y, ...v, at }));
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

let lastSpray = null;
overlay.addEventListener('pointerdown', (ev) => {
  if (pull) return;
  overlay.setPointerCapture(ev.pointerId);
  const p = toTank(ev);
  stroke = null; // a press that never saw its release must not carry over into this one
  lastSpray = null;
  if (tool === 'rake' || tool === 'stylus' || tool === 'paint') stroke = [p];
  else if (!TOOLS[tool].whole) act(() => clickAction(p));
  if (tool === 'spray' || tool === 'erase') lastSpray = p;
});
overlay.addEventListener('pointerup', () => { lastSpray = null; });
// The system can take the pointer away mid-press, with no pointerup, so a press also ends here.
const dropPress = () => { stroke = null; lastSpray = null; };
overlay.addEventListener('pointercancel', dropPress);
overlay.addEventListener('pointerleave', () => { hover = null; });
overlay.addEventListener('pointermove', (ev) => {
  const p = toTank(ev);
  hover = p;
  if (!ev.buttons) dropPress(); // the button is up, whatever we were told
  // Dragging keeps spraying along the way, a little at a time.
  // Lifting cuts a hard edge, so it needs closer spots to make a smooth stroke.
  if (lastSpray && Math.hypot(p[0] - lastSpray[0], p[1] - lastSpray[1]) > inMm(tool).radius * (values.erase.mode === 'lift' && tool === 'erase' ? 0.3 : 0.75)) {
    lastSpray = p;
    act(() => (tool === 'erase' ? clickAction(p) : sprayAt(p[0], p[1], 0.25)));
  }
  if (!stroke) return;
  if (tool === 'rake') stroke[1] = p;
  else stroke.push(p);
});
overlay.addEventListener('pointerup', () => {
  if (!stroke) return;
  const path = stroke;
  stroke = null;
  if (path.length < 2) return;
  if (tool === 'paint') {
    act(() => place(false, (at) => marble.paint({ path, ...inMm('paint'), color, shimmer, at })));
    return;
  }
  act(() => place(true, (at) => (tool === 'rake'
    ? marble.rake({ from: path[0], to: path[1], ...inMm('rake'), at })
    : marble.stylus({ path, ...inMm('stylus'), at }))));
});

function fillDotsNow() {
  const { sprayColors, over, ...v } = inMm('fillDots');
  const options = { ...v, over: over === 'over', colors: sprayColors === 'one' ? [{ color, shimmer }] : inks };
  // Rings go on one at a time, each waiting for the last to settle, and that needs the script's timeline.
  if (v.rings > 1) {
    marble.settle();
    return marble.fillDots(options);
  }
  return place(false, (at) => marble.fillDots({ ...options, at }));
}

$('apply').onclick = () => act(() => (tool === 'fillDots'
  ? fillDotsNow()
  : tool === 'stripes'
  ? place(false, (at) => marble.stripes({ ...inMm('stripes'), colors: inks, at }))
  : place(true, (at) => (tool === 'air' ? marble.air({ ...inMm('air'), at }) : tool === 'fullRake'
  ? marble.fullRake({ ...inMm('fullRake'), at })
  : marble.jiggle({ ...inMm('jiggle'), at })))));

// ---- Transport ----------------------------------------------------------

// Point limits are a setting of the machine, not of the tank, so saved tanks and undo don't change them.
const STANDARD_LIMIT = 400000;
const LEAST_LIMIT = 50000;
const MOST_LIMIT = 20000000;
const pointLimit = () => Math.min(MOST_LIMIT, Math.max(LEAST_LIMIT, Number($('pointLimit').value) || STANDARD_LIMIT));
// Above the standard limit, detail holds until about a fifth of the way there, then slowly coarsens.
function applyDetail(m) {
  const limit = pointLimit();
  m.maxVertices = limit;
  m.pointBudget = limit > STANDARD_LIMIT ? limit / 5 : null;
}
function setPointLimit(limit) {
  $('pointLimit').value = limit;
  const preset = [...$('detailPreset').options].find((o) => Number(o.value) === limit);
  $('detailPreset').value = preset ? preset.value : 'custom';
  localStorage.setItem('marbler.pointLimit', String(pointLimit()));
  applyDetail(marble);
}
$('detailPreset').onchange = () => {
  if ($('detailPreset').value !== 'custom') setPointLimit(Number($('detailPreset').value));
};
$('pointLimit').onchange = () => setPointLimit(pointLimit());
$('lowFramerate').checked = localStorage.getItem('marbler.lowFramerate') === '1';
$('lowFramerate').onchange = () => {
  localStorage.setItem('marbler.lowFramerate', $('lowFramerate').checked ? '1' : '0');
  nextDraw = 0;
};

setPointLimit(Number(localStorage.getItem('marbler.pointLimit')) || STANDARD_LIMIT);
$('gridCell').value = localStorage.getItem('marbler.gridCell') || 2;
$('gridCell').onchange = () => localStorage.setItem('marbler.gridCell', $('gridCell').value);

function newTank() {
  const prev = marble;
  const Engine = currentModel().engine ?? Marble;
  marble = new Engine({
    width: Number($('tankW').value) || prev.width,
    height: Number($('tankH').value) || prev.height,
    viscosity: Number($('visc').value) || prev.viscosity,
    bath: bathColor(),
    seed: prev.seed,
    gridCell: Number($('gridCell').value) || undefined,
  });
  marble.flowTuning = sidebarFlow(); // a sidebar setting like viscosity, so not in the log
  applyDetail(marble);
  queueEnd = 0;
  if (currentModel().spreading) marble.openWater({ on: true, at: 0 });
  if ($('walls').checked) marble.walls({ on: true, at: 0 });
  syncTile(); // the tick may not have caught up yet, on the first tank after a reload
  if ($('tile').checked && !$('tile').disabled && (!currentModel().repeatsAtFirst || tileOffset())) marble.tile({ on: true, offset: tileOffset(), at: 0 });
  if (!$('tile').checked && currentModel().repeatsAtFirst) marble.tile({ on: false, at: 0 });
  resize();
  return marble;
}

function setPlaying(p) {
  playing = p;
  $('play').textContent = p ? 'Pause' : 'Play';
  $('paused').hidden = p;
}
// Keys 1 to 9 pick a palette ink. They only give way to fields being typed in, so they
// still work after clicking a slider, button or dropdown in the sidebar.
function pickInkByKey(ev) {
  if (!/^[1-9]$/.test(ev.key) || ev.metaKey || ev.ctrlKey || ev.altKey || ev.repeat) return false;
  if (!TOOLS[tool].color || $('viewer').open) return false;
  if (ev.target.matches('textarea, input:not([type=range]):not([type=checkbox]):not([type=color])')) return false;
  ev.preventDefault(); // a focused dropdown would otherwise jump to an option starting with that digit
  $('params').querySelectorAll('.swatches button')[Number(ev.key) - 1]?.click();
  return true;
}
document.addEventListener('keydown', (ev) => {
  if (pickInkByKey(ev)) return;
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
// The Wake simulator's bath. Each preset is also a viscosity, since it needs a thin bath to show.
const FLOW_PRESETS = {
  calm: { viscosity: 1000, push: 1, friction: 0.25, coast: 25, cell: 7 },
  curling: { viscosity: 30, push: 1, friction: 0.05, coast: 120, cell: 7 },
  whorls: { viscosity: 10, push: 3, friction: 0.05, coast: 120, cell: 7 },
  storm: { viscosity: 10, push: 10, friction: 0.05, coast: 40, cell: 7 },
};
const FLOW_FIELDS = { push: 'flowPush', friction: 'flowFriction', coast: 'flowCoast', cell: 'flowCell' };
function sidebarFlow() {
  return Object.fromEntries(Object.entries(FLOW_FIELDS).map(([key, id]) => [key, Number($(id).value)]));
}
function showFlow(flow) {
  for (const [key, id] of Object.entries(FLOW_FIELDS)) $(id).value = flow[key];
  const match = Object.entries(FLOW_PRESETS).find(([, p]) => Object.keys(FLOW_FIELDS).every((k) => p[k] === flow[k]));
  $('flowPreset').value = match ? match[0] : 'custom';
}
function syncBathPanel() { $('bathPanel').hidden = !['wake', 'wakefast', 'gridink'].includes(currentModel().id); }
$('flowPreset').onchange = () => {
  const preset = FLOW_PRESETS[$('flowPreset').value];
  if (!preset) return;
  showFlow(preset);
  $('visc').value = preset.viscosity;
  act(() => {
    marble.setViscosity({ value: preset.viscosity });
    marble.setFlow(sidebarFlow());
  });
};
for (const id of Object.values(FLOW_FIELDS)) {
  $(id).onchange = () => {
    showFlow(sidebarFlow());
    act(() => marble.setFlow(sidebarFlow()));
  };
}

// Only some simulators can repeat, so the toggle follows the one chosen.
const tileOffset = () => ($('tile').checked && $('tileOffset').value) || null;

function syncTile() {
  // Only some simulators can erase, and the sidebar shows only what will work.
  const canErase = (currentModel().engine ?? Marble).prototype.eraseSupported;
  $('tools').querySelector('[data-tool="erase"]').hidden = !canErase;
  if (!canErase && tool === 'erase') showTool('drop');
  const atFirst = currentModel().repeatsAtFirst === true;
  const supported = !currentModel().spreading && (currentModel().engine ?? Marble).prototype.tileSupported;
  $('tile').disabled = !supported;
  $('tile').closest('label').hidden = !supported;
  if (!supported) $('tile').checked = false;
  // Grid ink starts out repeating, once on arriving at it, and that doesn't count as asking other
  // simulators to repeat. After that the tick is the user's.
  if (tileSimulator !== currentModel().id) {
    tileSimulator = currentModel().id;
    if (atFirst) { $('tile').checked = true; $('tile').dataset.forced = '1'; }
    else if ($('tile').dataset.forced) { $('tile').checked = false; delete $('tile').dataset.forced; }
  }
  // Grid ink's sides are solid whenever it isn't repeating, so it has no Hard edges to choose.
  $('walls').disabled = atFirst;
  $('walls').closest('label').hidden = atFirst;
  if (atFirst) $('walls').checked = false;
  if ($('tile').checked && $('walls').checked) $('walls').checked = false;
  const canOffset = (currentModel().engine ?? Marble).prototype.tileOffsetSupported;
  $('tileOffset').closest('label').hidden = !$('tile').checked || !canOffset;
  if (!canOffset) $('tileOffset').value = '';
}
$('tile').onchange = () => {
  act(() => marble.live(() => marble.tile({ on: $('tile').checked, offset: $('tile').checked ? tileOffset() : null, at: marble.time })));
  syncTile();
};
$('tileOffset').onchange = () => {
  act(() => marble.live(() => marble.tile({ on: true, offset: tileOffset(), at: marble.time })));
};
$('tilePreview').onclick = () => {
  // Three by three at the tank's own resolution, so the view can zoom out without losing detail.
  const c = Object.assign(document.createElement('canvas'), { width: tank.width * 3, height: tank.height * 3 });
  const ctx = c.getContext('2d');
  // With no base colour the tank's canvas is see-through, over whatever the page shows behind it.
  ctx.fillStyle = getComputedStyle(tank).backgroundColor;
  ctx.fillRect(0, 0, c.width, c.height);
  // An offset shifts each row or column by half a tile. Page rows run down, the tank's y runs up.
  const offset = marble.tileOn ? marble.tileOffset : null;
  for (let i = -1; i < 4; i++) {
    for (let j = -1; j < 4; j++) {
      const x = (i + (offset === 'brick' ? (((j % 2) + 2) % 2) / 2 : 0)) * tank.width;
      const y = (j - (offset === 'halfDrop' ? (((i % 2) + 2) % 2) / 2 : 0)) * tank.height;
      ctx.drawImage(tank, x, y);
    }
  }
  c.toBlob((blob) => openViewer(blob, null, Date.now()));
};
$('simulator').onchange = () => {
  localStorage.setItem('marbler.simulator', $('simulator').value);
  syncViscosity();
  syncTile();
  syncBathPanel();
  // An empty tank can simply become the new simulator. With ink in it, the change waits for a clear.
  const Engine = currentModel().engine ?? Marble;
  if (!(marble instanceof Engine && marble.constructor === Engine) && !marble.polys.length && !marble.active.length && !marble.log.some((e) => !['openWater', 'walls', 'tile'].includes(e.fn))) {
    newTank();
    resetHistory();
    return;
  }
  act(() => marble.live(() => marble.openWater({ on: currentModel().spreading, at: marble.time })));
};
$('walls').onchange = () => {
  act(() => marble.live(() => marble.walls({ on: $('walls').checked, at: marble.time })));
  if ($('walls').checked && $('tile').checked) { $('tile').checked = false; syncTile(); }
};
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
      body: JSON.stringify({
        messages: sending,
        script: $('script').value,
        palettes: myPalettes.list(),
        currentPalette: { name: $('palette').value, bath: $('bath').value, inks },
      }),
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
    try {
      applyPaletteActions(data.paletteActions);
    } catch (err) {
      showError(`Couldn't save the palette: ${err.message}`);
    }
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
// Some examples only look right on one simulator, so choosing them chooses it too.
const EXAMPLE_SIMULATOR = {
  Chevrons: 'film', Ribbons: 'film', 'Big waves': 'film', Flames: 'film', 'Two-way feathers': 'film', Whorls: 'wake', Storm: 'wake', 'Italian marble': 'film', 'Spiral field': 'wake', 'Seamless wallpaper': 'classic', 'Grid ink spirals': 'gridink',
};
$('examples').onchange = () => {
  if (!$('examples').value) return;
  const simulator = EXAMPLE_SIMULATOR[$('examples').value];
  if (simulator) {
    $('simulator').value = simulator;
    localStorage.setItem('marbler.simulator', simulator);
    syncViscosity();
    syncTile();
    syncBathPanel();
  }
  $('script').value = EXAMPLES[$('examples').value];
  $('myScripts').value = '';
  syncScriptButtons();
  runSource();
};

// ---- My scripts -----------------------------------------------------------

const myScripts = keptList('marbler.scripts');

function syncScriptButtons() { $('deleteScript').disabled = !$('myScripts').value; }

function renderScripts(chosen = '') {
  const list = myScripts.list();
  $('myScripts').replaceChildren(
    new Option(list.length ? 'Open a saved script…' : 'No saved scripts yet', ''),
    ...list.map((s) => new Option(s.name, s.name)),
  );
  $('myScripts').value = chosen;
  syncScriptButtons();
}

// Opening only fills the box, so it can't clear a tank you're working on. Run does that.
$('myScripts').onchange = () => {
  const name = $('myScripts').value;
  syncScriptButtons();
  if (!name) return;
  const script = myScripts.list().find((s) => s.name === name);
  if (!script) return;
  $('script').value = script.text;
  $('scriptName').value = script.name;
  $('examples').value = '';
  $('error').hidden = true;
  if (script.simulator && [...$('simulator').options].some((o) => o.value === script.simulator)) {
    $('simulator').value = script.simulator;
    $('simulator').onchange();
  }
};

$('saveScript').onclick = () => {
  const name = $('scriptName').value.trim();
  if (!name) { $('scriptName').focus(); return; }
  // Saving over the one that's open is the point of saving. Over any other, it asks.
  if (name !== $('myScripts').value && myScripts.list().some((s) => s.name === name) && !confirm(`Replace the saved script "${name}"?`)) return;
  try {
    myScripts.save({ name, text: $('script').value, simulator: $('simulator').value, saved: Date.now() });
    showError('');
  } catch (err) {
    showError(`Couldn't save the script: ${err.message}`);
    return;
  }
  $('scriptName').value = name;
  renderScripts(name);
};

$('deleteScript').onclick = () => {
  const name = $('myScripts').value;
  if (!name || !confirm(`Delete the saved script "${name}"?`)) return;
  myScripts.remove(name);
  $('scriptName').value = '';
  renderScripts();
};

renderScripts();

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
  const saved = addSave({
    created: Date.now(),
    thumb: shot.toDataURL('image/png'),
    simulator: $('simulator').value,
    script: $('script').value,
    useBath: $('useBath').checked,
    bath: $('bath').value,
    visc: $('visc').value,
    state: marble.saveState(),
  });
  try {
    await saved;
  } catch (err) {
    $('hint').textContent = `This tank couldn't be saved, probably because it's too big for the browser's storage. ${err.message ?? ''}`;
    return;
  }
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
  applyDetail(marble);
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
const MM_PER_SOFT = 0.06; // the top of the Soft edges slider is 6 mm
$('printSoft').oninput = () => { $('printSoftValue').textContent = $('printSoft').value; };
$('print').onclick = async () => {
  const button = $('print');
  const bar = $('printProgress');
  button.disabled = true;
  bar.hidden = false;
  try {
    const texture = $('printTexture').checked;
    const { width, height, data } = await renderPrint(marble, {
      paleness: $('printPale').checked ? PRINT_DEFAULTS.paleness : 0,
      rim: texture ? PRINT_DEFAULTS.rim : 0,
      mottle: texture ? PRINT_DEFAULTS.mottle : 0,
      grain: texture ? PRINT_DEFAULTS.grain : 0,
      soft: Number($('printSoft').value) * MM_PER_SOFT,
      paper: $('useBath').checked ? $('bath').value : PRINT_DEFAULTS.paper,
    }, (share) => { bar.value = share; });
    const c = Object.assign(document.createElement('canvas'), { width, height });
    c.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
    c.toBlob((blob) => {
      download(blob, 'marble-print.png');
      const img = $('printResult');
      URL.revokeObjectURL(img.src);
      img.src = URL.createObjectURL(blob);
      img.hidden = false;
    });
  } finally {
    button.disabled = false;
    bar.hidden = true;
  }
};

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
    } else if (op.kind === 'erase' || op.kind === 'lift') {
      const [x, y] = toPx([op.x, op.y]);
      lctx.beginPath();
      lctx.arc(x, y, op.radius * pxPerMm, 0, 7);
      lctx.strokeStyle = '#000c';
      lctx.lineDashOffset = 0;
      lctx.stroke();
      lctx.strokeStyle = '#fffc';
      lctx.lineDashOffset = 4.5;
      lctx.stroke();
      lctx.lineDashOffset = 0;
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
const SNAPSHOT_STEP_MS = 150; // simulation per frame in low framerate mode
const SNAPSHOT_EVERY_MS = 2000;
const SLOW_STEP_MS = 66;      // a tick this slow can't reach half of real time
const SLOW_TANK_DRAW_MS = 150;
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
let stepMs = 0;              // smoothed time for one tick
let autoSnapshots = false;   // ticks got too slow, so low framerate is on until the tank settles
let drawnLog = 0;
let wasSnapshotting = false;
// Runs ticks until the budget is spent, and notes how long they take.
const profiler = makeProfiler(() => ({
  simulator: currentModel().id, engine: marble.constructor.name, simTime: Math.round(marble.time * 10) / 10,
  points: marble.vertexCount, shapes: marble.polys.length, active: marble.active.length, activeKinds: [...new Set(marble.active.map((op) => op.kind))],
  flowing: Boolean(marble.flowing), detail: marble.detail, capped: Boolean(marble.capped), gpuInUse: Boolean(marble.gpu), viscosity: marble.viscosity,
  tank: [marble.width, marble.height], canvas: [tank.width, tank.height], lowFramerate: snapshotting(), speed: Number($('speed').value),
}));
$('profiling').checked = localStorage.getItem('marbler.profiling') === '1';
profiler.on = $('profiling').checked;
$('profiling').onchange = () => {
  profiler.on = $('profiling').checked;
  localStorage.setItem('marbler.profiling', profiler.on ? '1' : '0');
};

function runTicks(budgetMs, start, canRun) {
  while (canRun() && performance.now() < start + budgetMs) {
    const t = performance.now();
    marble.step();
    stepMs += (performance.now() - t - stepMs) * 0.1;
    profiler.tick(performance.now() - t);
    dirty = true;
  }
}
const snapshotting = () => playing && marble.busy && ($('lowFramerate').checked || autoSnapshots);
function frame(now) {
  profiler.frame(now - last, now);
  profiler.watch(marble);
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
    runTicks(FINISH_BUDGET_MS, start, () => marble.busy);
    if (!marble.busy) finishing = false;
  } else if (snapshotting()) {
    // Nothing to keep in step with, so it runs as fast as the machine allows.
    runTicks(SNAPSHOT_STEP_MS, start, () => marble.busy);
    owed = 0;
  } else if (playing && marble.busy) {
    owed += wall * Number($('speed').value);
    runTicks(STEP_BUDGET_MS, start, () => {
      if (owed < marble.dt) return false;
      owed -= marble.dt;
      return true;
    });
    owed = Math.min(owed, 0.5); // run slower than real time rather than freezing
  } else if (playing) {
    marble.time += wall; // idle time passes, so new actions start now
    owed = 0;
  }
  // Metallic inks glint, but not under load. If the page can't keep up even when the
  // sim has settled, the glint rests until the tank next changes.
  const underLoad = finishing || snapshotting() || owed > 0.1 || lastDrawMs > SLOW_DRAW_MS || frameGap > LOADED_FRAME_MS;
  const tankState = `${marble.seed}|${marble.log.length}|${marble.polys.length}`;
  if (underLoad && !marble.busy && !finishing) glintResting = tankState;
  else if (glintResting !== tankState) glintResting = null;
  if (!pull && !underLoad && !glintResting && now >= nextGlint && marble.polys.some((p) => p.shimmer > 0)) {
    marble.sheenPhase += Math.max(wall, GLINT_MS / 1000);
    nextGlint = now + GLINT_MS;
    dirty = true;
  }
  if (marble.busy && (stepMs > SLOW_STEP_MS || lastDrawMs > SLOW_TANK_DRAW_MS)) autoSnapshots = true;
  if (!marble.busy) {
    autoSnapshots = false;
    stepMs = 0;
  }
  // Show the finished or paused tank straight away, not at the next snapshot.
  const snapshotsOn = snapshotting();
  if (wasSnapshotting && !snapshotsOn) nextDraw = 0;
  wasSnapshotting = snapshotsOn;
  // Anything the user just did shows straight away, even between snapshots.
  if (marble.log.length !== drawnLog) nextDraw = 0;
  // A slow redraw waits twice its own length before the next, so most of the time stays free.
  // Drawing in the background: the page only posts the work, and shows it when it's ready.
  let drawnLive = false;
  if (dirty && marble.drawLive && performance.now() >= nextDraw) {
    const drawing = marble;
    const sent = marble.drawLive(tctx, pxPerMm, ({ ms }) => {
      lastDrawMs = ms;
      profiler.draw(ms);
      return drawing === marble;
    });
    if (sent === 'busy') drawnLive = true;
    else if (sent) {
      drawnLive = true;
      dirty = false;
      drawnLog = marble.log.length;
      nextDraw = performance.now() + 100;
    }
  }
  if (!drawnLive && dirty && performance.now() >= nextDraw) {
    const drawStart = performance.now();
    marble.draw(tctx, pxPerMm);
    lastDrawMs = performance.now() - drawStart;
    profiler.draw(lastDrawMs);
    drawnLog = marble.log.length;
    nextDraw = drawStart + Math.max(lastDrawMs * 3, frameGap > BEHIND_FRAME_MS ? 100 : 0,
      snapshotting() ? SNAPSHOT_EVERY_MS : 0);
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
  // First, so that a warning still shows if the line runs out of room.
  const warn = marble.stoppedAtLimit ? '<span class="warn">point limit reached: the bath has stopped. A higher limit in Detail lets it run longer</span> '
    : marble.capped ? '<span class="warn">point limit reached: curls will look rough, so raise it in Detail</span> ' : '';
  const snap = snapshotting() ? ` <span class="snap">low framerate${autoSnapshots && !$('lowFramerate').checked ? ' (automatic)' : ''}</span>` : '';
  $('stats').innerHTML = `${warn}t ${marble.time.toFixed(1)} s · ${marble.polys.length} shapes · `
    + `${marble.vertexCount.toLocaleString()} points · ${marble.active.length} active · ${marble.queued.length} queued${marble.busy && !marble.active.length && !marble.queued.length ? ' · bath still moving' : ''}${snap}`;
  $('stats').title = $('stats').textContent; // the whole line, if it's cut off
}

// ---- Start --------------------------------------------------------------

showTool('drop');
// Opens on an empty tank; the examples only run when chosen.
newTank();
resetHistory();
showGallery();
requestAnimationFrame(frame);

window.marble = () => marble; // for use from the browser console

for (const el of document.querySelectorAll('[data-info]')) addInfo(el, el.dataset.info);
syncTile();
syncBathPanel();
