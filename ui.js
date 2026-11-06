import { Marble, maxRadius, WEAVE_POINTS, WEAVE_SHAPES } from './engine.js';
import { toMm, dialToValue, valueToDial } from './api.js';
import { TOOLS, isDial } from './tools.js';
import { latticeShifts } from './tile.js';
import { MODELS } from './models.js';
import { renderPrint, PRINT_DEFAULTS } from './print.js';
import { makeProfiler } from './profile.js';
import { listSaves, addSave, deleteSave } from './saves.js';
import { keptList } from './kept.js';
import { PALETTES, setSavedPalettes, isBuiltInPalette, validPalette, cleanPalette, MAX_INKS } from './palettes.js';
import { addInfo, infoIcon } from './info.js';
import { FONTS, textContours } from './text.js';
import { TINTS, PULL_SECONDS, LAY_SECONDS, pullPrint, drawSweep, savePull, listPulls, deletePull } from './paper.js';
import { TankController, DEFAULT_SETTINGS, FLOW_FIELDS, START_PALETTE, STANDARD_LIMIT, parseHex } from './controller.js';
import { EXAMPLES, EXAMPLE_SIMULATOR } from './examples.js';

const $ = (id) => document.getElementById(id);

const DIRECTIONS = [[0, '→', 'Right'], [180, '←', 'Left'], [90, '↑', 'Up'], [270, '↓', 'Down']];

// ---- Simulator ----------------------------------------------------------

for (const m of MODELS) {
  const option = new Option(m.label, m.id);
  option.title = m.title;
  $('simulator').add(option);
}
$('simulator').value = MODELS.some((m) => m.id === localStorage.getItem('marbler.simulator'))
  ? localStorage.getItem('marbler.simulator') : MODELS[0].id;
$('lowFramerate').checked = localStorage.getItem('marbler.lowFramerate') === '1';
$('gridCell').value = localStorage.getItem('marbler.gridCell') || 2;
$('clearFirst').checked = localStorage.getItem('marbler.runKeepsInk') !== '1';

// ---- State --------------------------------------------------------------

// The tank and what drives it live in the controller. The form fields named after its settings
// hand every edit straight over, and are redrawn from the settings whenever it changes them.
const FIELDS = Object.keys(DEFAULT_SETTINGS).filter((id) => $(id));
const fieldValue = (el) => (el.type === 'checkbox' ? el.checked : el.value);
// Viscosity and base colour start as the simulator and palette say, not as the page does.
const c = new TankController({
  settings: Object.fromEntries(FIELDS.filter((id) => id !== 'visc' && id !== 'bath').map((id) => [id, fieldValue($(id))])),
  trace: textContours,
});
// Added before any other handler, so those always see the new value.
for (const id of FIELDS) {
  const take = () => { c.settings[id] = fieldValue($(id)); };
  $(id).addEventListener('input', take);
  $(id).addEventListener('change', take);
}

const tank = $('tank');
const overlay = $('overlay');
const tctx = tank.getContext('2d');
const octx = overlay.getContext('2d');
let pxPerMm = 1;
let hover = null; // pointer position in tank mm, for the text preview
let pull = null;  // the pull in progress
let tint = Object.values(TINTS)[0];
let pullSeed = Date.now() % 1e9;

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
  const cssScale = Math.min(box.width / c.marble.width, box.height / c.marble.height);
  pxPerMm = cssScale * dpr;
  for (const el of [tank, overlay]) {
    el.width = Math.round(c.marble.width * pxPerMm);
    el.height = Math.round(c.marble.height * pxPerMm);
    el.style.width = `${c.marble.width * cssScale}px`;
    el.style.height = `${c.marble.height * cssScale}px`;
  }
  c.dirty = true;
}
new ResizeObserver(resize).observe($('wrap'));
c.on('tank', resize);

function toTank(ev) {
  const r = overlay.getBoundingClientRect();
  return [
    ((ev.clientX - r.left) / r.width - 0.5) * c.marble.width,
    (0.5 - (ev.clientY - r.top) / r.height) * c.marble.height,
  ];
}
const toPx = ([x, y]) => [(x + c.marble.width / 2) * pxPerMm, (c.marble.height / 2 - y) * pxPerMm];

// ---- Settings -----------------------------------------------------------

// Puts every setting back in its field, and shows only the controls the simulator can use.
function renderSettings() {
  const s = c.settings;
  for (const id of FIELDS) {
    const el = $(id);
    if (el.type === 'checkbox') el.checked = s[id];
    else el.value = s[id];
  }
  const can = c.capabilities();
  $('tools').querySelector('[data-tool="erase"]').hidden = !can.erase;
  $('tools').querySelector('[data-tool="hearts"]').hidden = !can.hearts;
  if ($('freezeRow')) $('freezeRow').hidden = !can.freeze;
  $('tile').disabled = !can.tile;
  $('tile').closest('label').hidden = !can.tile;
  $('walls').disabled = !can.walls;
  $('walls').closest('label').hidden = !can.walls;
  $('tileOffset').closest('label').hidden = !can.tileOffset;
  $('bathPanel').hidden = !can.flow;
  $('queueGapLabel').hidden = s.queueMode !== 'order';
  showRunMode();
  showAngleHint();
}

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

// The same colour fully opaque, so previews stay visible however faint the ink is.
function opaque(color) {
  if (/^#[0-9a-f]{8}$/i.test(color)) return color.slice(0, 7);
  if (/^#[0-9a-f]{4}$/i.test(color)) return color.slice(0, 4);
  const m = /^rgba\(\s*([^,]+),\s*([^,]+),\s*([^,)]+)/i.exec(color);
  return m ? `rgb(${m[1]},${m[2]},${m[3]})` : color;
}

function colorPicker() {
  const box = document.createElement('div');
  const row = document.createElement('div');
  row.className = 'swatches';
  const swatches = c.inks.map((ink, i) => {
    const b = document.createElement('button');
    b.style.background = ink.color;
    const name = ink.shimmer > 0 ? `${ink.color}, shimmer ${ink.shimmer}` : ink.color;
    b.title = i < 9 ? `${i + 1}: ${name}` : name;
    b.classList.toggle('metal', ink.shimmer > 0);
    b.onclick = () => { c.setInk(ink.color, c.inkAlpha()); c.shimmer = ink.shimmer; sync(); };
    return b;
  });
  const native = Object.assign(document.createElement('input'), { type: 'color', id: 'customColor' });
  native.style.width = '40px';
  native.oninput = () => { c.setInk(native.value, c.inkAlpha()); sync(); };
  row.append(...swatches, native, infoIcon('color.swatches'));

  const hex = Object.assign(document.createElement('input'), {
    type: 'text', id: 'colorHex', spellcheck: false, title: '#rrggbb or #rrggbbaa',
  });
  hex.setAttribute('aria-label', 'Colour as hex');
  hex.oninput = () => {
    const parsed = parseHex(hex.value);
    hex.classList.toggle('invalid', !parsed);
    if (parsed) { c.setInk(parsed.rgb, parsed.alpha); sync(hex); }
  };
  hex.onblur = () => sync();

  const alpha = Object.assign(document.createElement('input'), {
    type: 'range', id: 'colorAlpha', min: 0, max: 100, step: 1,
  });
  const alphaValue = typeBox(alpha);
  alpha.oninput = () => { c.setInk(c.inkRgb(), Number(alpha.value) / 100); sync(); };
  const alphaLabel = document.createElement('label');
  alphaLabel.className = 'block';
  alphaLabel.append('Opacity (%)', infoIcon('color.alpha'), alphaValue, alpha);

  // Refreshes every control, leaving alone the one being typed in.
  function sync(typing) {
    for (const [i, b] of swatches.entries()) b.classList.toggle('on', c.inks[i].color === c.inkRgb());
    sheen.value = Math.round(c.shimmer * 100);
    sheenValue.refresh();
    native.value = c.inkRgb();
    alpha.value = Math.round(c.inkAlpha() * 100);
    alphaValue.refresh();
    if (typing !== hex) {
      hex.value = c.color;
      hex.classList.remove('invalid');
    }
  }
  const sheen = Object.assign(document.createElement('input'), {
    type: 'range', id: 'colorShimmer', min: 0, max: 100, step: 5,
  });
  const sheenValue = typeBox(sheen);
  sheen.oninput = () => { c.shimmer = Number(sheen.value) / 100; sync(); };
  const sheenLabel = document.createElement('label');
  sheenLabel.className = 'block';
  sheenLabel.append('Shimmer (%)', infoIcon('color.shimmer'), sheenValue, sheen);

  sync();
  box.append(row, hex, alphaLabel, sheenLabel);
  return box;
}

// On a repeating tank a slanted full rake runs at the nearest angle that joins up, so this says which.
let angleHint = null;
function showAngleHint() {
  if (!angleHint) return;
  const wanted = c.values.fullRake.angle;
  const runs = c.fullRakeAngle();
  angleHint.textContent = runs % 360 === wanted % 360 ? '' : `On this repeating tank it runs at ${runs}°, the nearest angle that joins up.`;
}

// Full rake's clicks on the tank are free, so they can pick ink to freeze.
function freezeRow(box) {
  const row = document.createElement('div');
  row.id = 'freezeRow';
  row.className = 'row freezes';
  row.hidden = !c.capabilities().freeze;
  const label = document.createElement('span');
  label.append('Freeze ink', infoIcon('freeze'));
  row.append(label);
  const pick = (mode, text) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.classList.toggle('on', c.freezeMode === mode);
    b.onclick = () => {
      c.pickFreezeMode(mode);
      for (const s of row.querySelectorAll('button')) s.classList.remove('on');
      b.classList.toggle('on', c.freezeMode === mode);
      overlay.style.cursor = c.freezeMode === 'off' ? '' : 'crosshair';
    };
    return b;
  };
  const clear = document.createElement('button');
  clear.textContent = 'Clear all';
  clear.onclick = () => c.unfreezeAll();
  row.append(pick('freeze', 'Freeze'), pick('unfreeze', 'Unfreeze'), clear);
  box.append(row);
}

// Where each heart's tine will run, dashed like the rake previews, in every copy that shows.
function drawHeartLines() {
  const m = c.marble;
  if (c.tool !== 'hearts' || !m.heartPaths || m.busy) return;
  const px = devicePixelRatio || 1;
  octx.save();
  octx.lineWidth = px;
  octx.setLineDash([5 * px, 4 * px]);
  const paths = m.heartPaths(c.inMm('hearts'));
  const line = (from, to, sx, sy) => {
    const [ax, ay] = toPx([from[0] + sx, from[1] + sy]);
    const [bx, by] = toPx([to[0] + sx, to[1] + sy]);
    octx.moveTo(ax, ay);
    octx.lineTo(bx, by);
  };
  for (const [colour, phase] of [['#000c', 0], ['#fffc', 4.5 * px]]) {
    octx.beginPath();
    octx.strokeStyle = colour;
    octx.lineDashOffset = phase;
    for (const { from, to, loops } of paths) for (const [sx, sy] of m.tileShifts(loops)) line(from, to, sx, sy);
    octx.stroke();
  }
  octx.restore();
}

function drawFrozen() {
  const m = c.marble;
  if (!m.polys.some((p) => p.frozen)) return;
  const masked = c.tool === 'fullRake';
  const px = devicePixelRatio || 1;
  const pathFor = (loops) => {
    const path = new Path2D();
    for (const poly of loops) {
      for (const [sx, sy] of m.tileShifts([poly])) {
        for (let i = 0; i < poly.n; i++) {
          const [x, y] = toPx([poly.xy[i * 2] + sx, poly.xy[i * 2 + 1] + sy]);
          if (i) path.lineTo(x, y);
          else path.moveTo(x, y);
        }
        path.closePath();
      }
    }
    return path;
  };
  octx.save();
  octx.lineWidth = px;
  octx.setLineDash([5 * px, 4 * px]);
  for (const poly of m.polys) {
    if (!poly.frozen) continue;
    const path = pathFor([poly]);
    if (masked) {
      octx.fillStyle = '#ff305866';
      octx.fill(path, poly.group ? 'evenodd' : 'nonzero');
    }
    octx.strokeStyle = '#000c';
    octx.lineDashOffset = 0;
    octx.stroke(path);
    octx.strokeStyle = '#fffc';
    octx.lineDashOffset = 4.5 * px;
    octx.stroke(path);
  }
  octx.restore();
  // What a click would pick.
  if (c.tool === 'fullRake' && c.freezeMode !== 'off' && hover) {
    const loops = m.shapeAt(hover[0], hover[1], { frozen: c.freezeMode === 'unfreeze' });
    if (loops) {
      octx.save();
      octx.lineWidth = 2 * px;
      octx.strokeStyle = c.freezeMode === 'freeze' ? '#ff3058' : '#fff';
      octx.stroke(pathFor(loops));
      octx.restore();
    }
  }
}

const showTool = (name) => c.setTool(name);

// Builds the panel for the chosen tool.
function renderTool({ changed }) {
  if (changed) overlay.style.cursor = '';
  const name = c.tool;
  const values = c.values;
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
      b.dataset.angle = angle;
      b.classList.toggle('on', values[name].angle === angle);
      b.onclick = () => {
        values[name].angle = angle;
        for (const s of row.children) s.classList.toggle('on', s === b);
        const slider = box.querySelector('input[data-key="angle"]');
        if (slider) { slider.value = angle; slider.oninput(); }
      };
      row.append(b);
    }
    box.append(row);
  }
  if (name === 'fullRake') freezeRow(box);
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
      if (name === 'fullRake' && key === 'angle') {
        angleHint = hint;
        showAngleHint();
        return;
      }
      if (name !== 'drop' || key !== 'quantity') return;
      const mL = toMm('drop', { quantity: values[name][key] }, c.marble).quantity;
      hint.textContent = `${Math.round((200 * maxRadius(mL, c.marble.film)) / c.marble.width)}% of the tank's width across`;
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
      if (key === 'angle' && def.directions) {
        for (const b of box.querySelectorAll('.directions button')) b.classList.toggle('on', Number(b.dataset.angle) === values[name].angle);
      }
      // Adding height to a straight rake means wanting a weave.
      if (key === 'waveAmp' && values[name][key] > 0 && values[name].waveShape === 'straight') {
        values[name].waveShape = 'sine';
        for (const b of document.querySelectorAll('.weaves button')) b.classList.toggle('on', b.title === 'Sine');
      }
    };
    describe();
    wrap.append(label, infoIcon(`${name}.${key}`), typed, input);
    if (hint.textContent || angleHint === hint) wrap.append(hint);
    box.append(wrap);
  }
}
c.on('tool', renderTool);

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
  const values = c.values;
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
  const p = c.usePalette(name);
  showTool(c.tool);
  $('palette').value = p.name;
  $('paletteName').value = isBuiltInPalette(p.name) ? '' : p.name;
  renderPaletteEditor();
}

const myPalettes = keptList('marbler.palettes', validPalette);

// The current palette's inks, each with its colour, shimmer and a button to remove it.
function renderPaletteEditor() {
  $('paletteInks').replaceChildren(...c.inks.map((ink, i) => {
    const row = document.createElement('div');
    row.className = 'paletteInk';
    const pick = Object.assign(document.createElement('input'), { type: 'color', value: ink.color.slice(0, 7), title: `Ink ${i + 1}` });
    pick.setAttribute('aria-label', `Ink ${i + 1} colour`);
    pick.oninput = () => {
      c.setPaletteInk(i, { rgb: pick.value });
      showTool(c.tool);
    };
    const metal = Object.assign(document.createElement('input'), { type: 'range', min: 0, max: 1, step: 0.05, value: ink.shimmer, title: 'Shimmer: 0 is matte, 1 is metallic' });
    metal.setAttribute('aria-label', `Ink ${i + 1} shimmer`);
    metal.oninput = () => {
      c.setPaletteInk(i, { shimmer: Number(metal.value) });
      showTool(c.tool);
    };
    const remove = Object.assign(document.createElement('button'), { textContent: '✕', title: 'Remove this ink', disabled: c.inks.length < 2 });
    remove.onclick = () => {
      c.removePaletteInk(i);
      showTool(c.tool);
      renderPaletteEditor();
    };
    row.append(pick, metal, remove);
    return row;
  }));
  $('addInk').disabled = c.inks.length >= MAX_INKS;
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
  c.addPaletteInk();
  showTool(c.tool);
  renderPaletteEditor();
};
$('savePalette').onclick = () => {
  const name = $('paletteName').value.trim();
  if (!name) { $('paletteName').focus(); return; }
  if (isBuiltInPalette(name)) { showError(`"${name}" is a built-in palette, so choose another name.`); return; }
  const entry = { name, bath: c.settings.bath, inks: c.inks };
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
renderPaletteEditor();

for (const name of Object.keys(TOOLS)) {
  const b = document.createElement('button');
  b.textContent = TOOLS[name].label ?? name[0].toUpperCase() + name.slice(1);
  b.dataset.tool = name;
  b.onclick = () => showTool(name);
  $('tools').append(b);
}

// From here on the fields follow the settings, which already hold the starting viscosity and bath.
c.on('settings', renderSettings);
renderSettings();

// ---- History ---------------------------------------------------------------

function updateHistoryButtons() {
  $('undo').disabled = !c.canUndo;
  $('redo').disabled = !c.canRedo;
}
c.on('history', updateHistoryButtons);

// ---- Canvas interaction -------------------------------------------------

overlay.addEventListener('pointerdown', (ev) => {
  if (pull) return;
  overlay.setPointerCapture(ev.pointerId);
  c.press(toTank(ev));
});
// The system can take the pointer away mid-press, with no pointerup, so a press also ends here.
overlay.addEventListener('pointercancel', () => c.endPress());
overlay.addEventListener('pointerleave', () => { hover = null; });
overlay.addEventListener('pointermove', (ev) => {
  const p = toTank(ev);
  hover = p;
  c.move(p, Boolean(ev.buttons));
});
overlay.addEventListener('pointerup', () => c.release());

$('apply').onclick = () => c.applyTool();

// ---- Transport ----------------------------------------------------------

// Point limits are a setting of the machine, not of the tank, so they're kept between visits.
function setPointLimit(limit) {
  c.setPointLimit(limit);
  const preset = [...$('detailPreset').options].find((o) => Number(o.value) === limit);
  $('detailPreset').value = preset ? preset.value : 'custom';
  localStorage.setItem('marbler.pointLimit', String(c.pointLimit()));
}
$('detailPreset').onchange = () => {
  if ($('detailPreset').value !== 'custom') setPointLimit(Number($('detailPreset').value));
};
$('pointLimit').onchange = () => setPointLimit(c.pointLimit());
$('lowFramerate').onchange = () => {
  localStorage.setItem('marbler.lowFramerate', c.settings.lowFramerate ? '1' : '0');
  nextDraw = 0;
};

setPointLimit(Number(localStorage.getItem('marbler.pointLimit')) || STANDARD_LIMIT);
$('gridCell').onchange = () => localStorage.setItem('marbler.gridCell', $('gridCell').value);

c.on('playing', () => {
  $('play').textContent = c.playing ? 'Pause' : 'Play';
  $('paused').hidden = c.playing;
});
// Keys 1 to 9 pick a palette ink. They only give way to fields being typed in, so they
// still work after clicking a slider, button or dropdown in the sidebar.
function pickInkByKey(ev) {
  if (!/^[1-9]$/.test(ev.key) || ev.metaKey || ev.ctrlKey || ev.altKey || ev.repeat) return false;
  if (!TOOLS[c.tool].color || $('viewer').open) return false;
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
    if (ev.shiftKey) c.redo(); else c.undo();
    return;
  }
  if (ev.code !== 'Space' || ev.repeat) return;
  ev.preventDefault();
  c.setPlaying(!c.playing);
});
// Takes effect straight away, on everything from here on, without clearing the tank.
$('visc').onchange = () => c.commitViscosity();
$('flowPreset').onchange = () => c.commitFlowPreset();
for (const id of Object.values(FLOW_FIELDS)) $(id).onchange = () => c.commitFlow();

$('tile').onchange = () => c.commitTile();
$('tileOffset').onchange = () => c.commitTileOffset();
$('tilePreview').onclick = () => {
  // Three by three at the tank's own resolution, so the view can zoom out without losing detail.
  const canvas = Object.assign(document.createElement('canvas'), { width: tank.width * 3, height: tank.height * 3 });
  const ctx = canvas.getContext('2d');
  // With no base colour the tank's canvas is see-through, over whatever the page shows behind it.
  ctx.fillStyle = getComputedStyle(tank).backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // An offset shifts each row or column by half a tile. Page rows run down, the tank's y runs up.
  const offset = c.marble.tileOn ? c.marble.tileOffset : null;
  for (let i = -1; i < 4; i++) {
    for (let j = -1; j < 4; j++) {
      const x = (i + (offset === 'brick' ? (((j % 2) + 2) % 2) / 2 : 0)) * tank.width;
      const y = (j - (offset === 'halfDrop' ? (((i % 2) + 2) % 2) / 2 : 0)) * tank.height;
      ctx.drawImage(tank, x, y);
    }
  }
  canvas.toBlob((blob) => openViewer(blob, null, Date.now()));
};
function onSimulatorChange() {
  localStorage.setItem('marbler.simulator', c.settings.simulator);
  c.commitSimulator();
}
$('simulator').onchange = onSimulatorChange;
$('walls').onchange = () => c.commitWalls();
$('queueMode').onchange = () => { $('queueGapLabel').hidden = c.settings.queueMode !== 'order'; };
$('useBath').onchange = $('bath').oninput = () => c.commitBath();
$('play').onclick = () => c.setPlaying(!c.playing);
$('clear').onclick = () => c.clear();
$('applyTank').onclick = () => c.clear();

$('undo').onclick = () => c.undo();
$('redo').onclick = () => c.redo();

$('finish').onclick = () => c.finish();

function runSource(options) {
  $('error').hidden = true;
  const failed = c.runScript($('script').value, options);
  if (failed) {
    $('error').textContent = String(failed);
    $('error').hidden = false;
  }
}
$('run').onclick = () => runSource();
function showRunMode() { $('run').textContent = c.settings.clearFirst ? 'Run (clears tank)' : 'Run (keeps ink)'; }
$('clearFirst').onchange = () => {
  localStorage.setItem('marbler.runKeepsInk', c.settings.clearFirst ? '0' : '1');
  showRunMode();
};
$('capture').onclick = () => { $('script').value = c.marble.toScript(); };

function showError(message) {
  $('error').textContent = message;
  $('error').hidden = !message;
}
c.on('notice', showError);

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
        currentPalette: { name: $('palette').value, bath: c.settings.bath, inks: c.inks },
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
$('examples').onchange = () => {
  if (!$('examples').value) return;
  // Some examples only look right on one simulator, so choosing them chooses it too.
  const simulator = EXAMPLE_SIMULATOR[$('examples').value];
  if (simulator) {
    localStorage.setItem('marbler.simulator', simulator);
    c.setSimulator(simulator);
  }
  $('script').value = EXAMPLES[$('examples').value];
  $('myScripts').value = '';
  syncScriptButtons();
  // An example picks its own simulator, which needs a tank of its own.
  runSource({ clearing: true });
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
    c.settings.simulator = script.simulator;
    onSimulatorChange();
  }
};

$('saveScript').onclick = () => {
  const name = $('scriptName').value.trim();
  if (!name) { $('scriptName').focus(); return; }
  // Saving over the one that's open is the point of saving. Over any other, it asks.
  if (name !== $('myScripts').value && myScripts.list().some((s) => s.name === name) && !confirm(`Replace the saved script "${name}"?`)) return;
  try {
    myScripts.save({ name, text: $('script').value, simulator: c.settings.simulator, saved: Date.now() });
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
  const { simulator, useBath, bath, visc, state } = c.saveData();
  const saved = addSave({
    created: Date.now(),
    thumb: shot.toDataURL('image/png'),
    simulator,
    script: $('script').value,
    useBath,
    bath,
    visc,
    state,
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
  $('script').value = save.script;
  c.restore(save);
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
  const m = c.marble;
  const scale = 3000 / Math.max(m.width, m.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(m.width * scale);
  canvas.height = Math.round(m.height * scale);
  m.draw(canvas.getContext('2d'), scale);
  canvas.toBlob((b) => download(b, 'marble.png'));
};
$('svg').onclick = () => download(new Blob([c.marble.toSVG()], { type: 'image/svg+xml' }), 'marble.svg');
const MM_PER_SOFT = 0.06; // the top of the Soft edges slider is 6 mm
$('printSoft').oninput = () => { $('printSoftValue').textContent = $('printSoft').value; };
$('print').onclick = async () => {
  const button = $('print');
  const bar = $('printProgress');
  button.disabled = true;
  bar.hidden = false;
  try {
    const texture = $('printTexture').checked;
    const { width, height, data } = await renderPrint(c.marble, {
      paleness: $('printPale').checked ? PRINT_DEFAULTS.paleness : 0,
      rim: texture ? PRINT_DEFAULTS.rim : 0,
      mottle: texture ? PRINT_DEFAULTS.mottle : 0,
      grain: texture ? PRINT_DEFAULTS.grain : 0,
      soft: Number($('printSoft').value) * MM_PER_SOFT,
      paper: c.settings.useBath ? c.settings.bath : PRINT_DEFAULTS.paper,
    }, (share) => { bar.value = share; });
    const canvas = Object.assign(document.createElement('canvas'), { width, height });
    canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
    canvas.toBlob((blob) => {
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
    ...pullPrint(c.marble, {
      tint: $('pullBase').checked && c.settings.useBath ? c.settings.bath : tint,
      imperfection: Number($('imperfection').value) / 100,
      mirror: $('mirror').checked,
      seed: pullSeed++,
    }),
    cleared: false,
  };
  c.locked = true; // no undo or redo under the sheet
  $('pull').disabled = true;
  c.stroke = null;
}

async function finishPull() {
  const { print } = pull;
  pull = null;
  c.locked = false;
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
for (const [name, color] of Object.entries(TINTS)) {
  const b = document.createElement('button');
  b.style.background = color;
  b.title = name;
  b.classList.toggle('on', color === tint);
  b.onclick = () => {
    tint = color;
    for (const s of $('tints').children) s.classList.toggle('on', s === b);
  };
  $('tints').append(b);
}

// ---- Main loop ----------------------------------------------------------

// Black or white guides, whichever stands out against the bath.
function guideColor(alpha) {
  const hex = parseHex(c.marble.bath);
  const n = hex ? parseInt(hex.rgb.slice(1), 16) : 0xffffff;
  const luma = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return `${luma < 110 ? 'rgba(255,255,255,' : 'rgba(0,0,0,'}${alpha})`;
}

function drawTextPreview() {
  const contours = c.currentText();
  if (!contours.length) return;
  octx.save();
  octx.globalAlpha = 0.55;
  octx.fillStyle = c.inkRgb();
  octx.beginPath();
  for (const contour of contours) {
    for (let i = 0; i < contour.length; i += 2) {
      const [x, y] = toPx([contour[i] + hover[0], contour[i + 1] + hover[1]]);
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

function dashedRakeLines(ctx, m, planned) {
  ctx.beginPath();
  for (const op of planned.together ?? [planned]) {
    const steps = op.waveAmp ? Math.ceil((op.total * WEAVE_POINTS) / op.waveLength) : 1;
    for (const off of op.offs) {
      const points = [];
      let left = Infinity, right = -Infinity, low = Infinity, high = -Infinity;
      for (let k = 0; k <= steps; k++) {
        const p = m._rakePoint(op, (op.total * k) / steps, off);
        points.push(p);
        left = Math.min(left, p[0]); right = Math.max(right, p[0]);
        low = Math.min(low, p[1]); high = Math.max(high, p[1]);
      }
      // A tine past a repeating tank's edge is really at its copy here, so that's what shows.
      const marble = c.marble;
      const { width: W, height: H } = marble;
      const shifts = (marble.tileWanted ?? marble.tileOn)
        ? latticeShifts(-W / 2 - right, W / 2 - left, -H / 2 - high, H / 2 - low, W, H, marble.tileOffsetWanted ?? marble.tileOffset)
        : [[0, 0]];
      for (const [sx, sy] of shifts) {
        points.forEach(([px, py], k) => {
          const [x, y] = toPx([px + sx, py + sy]);
          k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
      }
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
  for (const op of showQueued ? c.marble.queued : []) {
    if (op.kind === 'rake') {
      dashedRakeLines(lctx, c.marble, op);
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
      const color = opaque(op.color);
      lctx.strokeStyle = color;
      lctx.fillStyle = color;
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
  const { tool, stroke, marble } = c;
  if (tool !== 'fullRake' && tool !== 'rake') return null;
  // Rake has no line until it's dragged, so until then it shows one straight across, at the pointer.
  const along = marble.width / 2 + 20;
  const y = hover ? hover[1] : 0;
  const line = tool === 'rake' ? (stroke?.length > 1 ? stroke : [[-along, y], [along, y]]) : null;
  const key = JSON.stringify([tool, c.values[tool], line, marble.width, marble.height, marble.tileWanted ?? marble.tileOn, marble.tileOffsetWanted ?? marble.tileOffset]);
  if (key !== plannedRake.key) {
    const m = new Marble({ width: marble.width, height: marble.height });
    m.tileWanted = marble.tileWanted ?? marble.tileOn;
    m.tileOffsetWanted = marble.tileOffsetWanted ?? marble.tileOffset;
    const op = tool === 'rake'
      ? m.rake({ from: line[0], to: line[1], ...c.inMm('rake', m), at: 0 })
      : m.fullRake({ ...c.inMm('fullRake', m), at: 0 });
    plannedRake = { key, op: op && { m, op } };
  }
  return plannedRake.op;
}

function drawPreviewLayer() {
  const showQueued = !c.playing;
  const planned = plannedFullRake();
  const key = [showQueued, showQueued ? c.marble.log.length : 0, showQueued ? c.marble.queued.length : 0,
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
  const { tool, stroke } = c;
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
      const { teeth, spacing } = c.inMm('rake');
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
  drawHeartLines();
  drawFrozen();
  octx.fillStyle = guideColor(0.8);
  for (const p of c.marble.tinePositions()) {
    const [x, y] = toPx(p);
    octx.beginPath();
    octx.arc(x, y, 2 * octx.lineWidth, 0, 7);
    octx.fill();
  }
}

const GLINT_MS = 33;
const SLOW_DRAW_MS = 25;
const SNAPSHOT_EVERY_MS = 2000;
const LOADED_FRAME_MS = 28;  // average frame gap that counts as the page falling behind
const BEHIND_FRAME_MS = 40;  // ...and that slows tank redraws too

let nextDraw = 0;
let nextGlint = 0;
let lastDrawMs = 0;
let nextStats = 0;
let frameGap = 16;      // smoothed time between frames; canvas work mostly lands here, not in draw()
let glintResting = null; // the tank state the glint gave up on, until something changes
let last = performance.now();
let drawnLog = 0;
let wasSnapshotting = false;
const profiler = makeProfiler(() => {
  const marble = c.marble;
  return {
    simulator: c.model().id, engine: marble.constructor.name, simTime: Math.round(marble.time * 10) / 10,
    points: marble.vertexCount, shapes: marble.polys.length, active: marble.active.length, activeKinds: [...new Set(marble.active.map((op) => op.kind))],
    flowing: Boolean(marble.flowing), detail: marble.detail, capped: Boolean(marble.capped), gpuInUse: Boolean(marble.gpu), viscosity: marble.viscosity,
    tank: [marble.width, marble.height], canvas: [tank.width, tank.height], lowFramerate: c.snapshotting(), speed: Number(c.settings.speed),
  };
});
c.onTick = (ms) => profiler.tick(ms);
// A hosted build has no server behind it, so the features that need one go. See scripts/build.mjs.
const hostedDemo = Boolean(document.querySelector('meta[name="marbler-demo"]'));
if (hostedDemo) {
  $('profiling').closest('label').hidden = true;
  $('prompt').closest('.row').style.display = 'none'; // .row sets its own display, which beats hidden
  $('assistantLocal').hidden = false;
}
$('profiling').checked = !hostedDemo && localStorage.getItem('marbler.profiling') === '1';
profiler.on = $('profiling').checked;
$('profiling').onchange = () => {
  profiler.on = $('profiling').checked;
  localStorage.setItem('marbler.profiling', profiler.on ? '1' : '0');
};

function frame(now) {
  profiler.frame(now - last, now);
  profiler.watch(c.marble);
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
      c.clear();
    }
    if (elapsed >= PULL_SECONDS) finishPull();
  } else {
    c.advance(wall, start);
  }
  const marble = c.marble;
  // Metallic inks glint, but not under load. If the page can't keep up even when the
  // sim has settled, the glint rests until the tank next changes.
  const underLoad = c.finishing || c.snapshotting() || c.owed > 0.1 || lastDrawMs > SLOW_DRAW_MS || frameGap > LOADED_FRAME_MS;
  const tankState = `${marble.seed}|${marble.log.length}|${marble.polys.length}`;
  if (underLoad && !marble.busy && !c.finishing) glintResting = tankState;
  else if (glintResting !== tankState) glintResting = null;
  if (!pull && !underLoad && !glintResting && now >= nextGlint && marble.polys.some((p) => p.shimmer > 0)) {
    marble.sheenPhase += Math.max(wall, GLINT_MS / 1000);
    nextGlint = now + GLINT_MS;
    c.dirty = true;
  }
  c.noteLoad(lastDrawMs);
  // Show the finished or paused tank straight away, not at the next snapshot.
  const snapshotsOn = c.snapshotting();
  if (wasSnapshotting && !snapshotsOn) nextDraw = 0;
  wasSnapshotting = snapshotsOn;
  // Anything the user just did shows straight away, even between snapshots.
  if (marble.log.length !== drawnLog) nextDraw = 0;
  // A slow redraw waits twice its own length before the next, so most of the time stays free.
  // Drawing in the background: the page only posts the work, and shows it when it's ready.
  let drawnLive = false;
  if (c.dirty && marble.drawLive && performance.now() >= nextDraw) {
    const drawing = marble;
    const sent = marble.drawLive(tctx, pxPerMm, ({ ms }) => {
      lastDrawMs = ms;
      profiler.draw(ms);
      return drawing === c.marble;
    });
    if (sent === 'busy') drawnLive = true;
    else if (sent) {
      drawnLive = true;
      c.dirty = false;
      drawnLog = marble.log.length;
      nextDraw = performance.now() + 100;
    }
  }
  if (!drawnLive && c.dirty && performance.now() >= nextDraw) {
    const drawStart = performance.now();
    marble.draw(tctx, pxPerMm);
    lastDrawMs = performance.now() - drawStart;
    profiler.draw(lastDrawMs);
    drawnLog = marble.log.length;
    nextDraw = drawStart + Math.max(lastDrawMs * 3, frameGap > BEHIND_FRAME_MS ? 100 : 0,
      c.snapshotting() ? SNAPSHOT_EVERY_MS : 0);
    c.dirty = false;
  }
  drawOverlay();
  if (now >= nextStats) {
    nextStats = now + 250;
    showStats();
  }
  requestAnimationFrame(frame);
}

function showStats() {
  const marble = c.marble;
  // First, so that a warning still shows if the line runs out of room.
  const warn = marble.stoppedAtLimit ? '<span class="warn">point limit reached: the bath has stopped. A higher limit in Detail lets it run longer</span> '
    : marble.capped ? '<span class="warn">point limit reached: curls will look rough, so raise it in Detail</span> ' : '';
  const snap = c.snapshotting() ? ` <span class="snap">low framerate${c.autoSnapshots && !c.settings.lowFramerate ? ' (automatic)' : ''}</span>` : '';
  $('stats').innerHTML = `${warn}t ${marble.time.toFixed(1)} s · ${marble.polys.length} shapes · `
    + `${marble.vertexCount.toLocaleString()} points · ${marble.active.length} active · ${marble.queued.length} queued${marble.busy && !marble.active.length && !marble.queued.length ? ' · bath still moving' : ''}${snap}`;
  $('stats').title = $('stats').textContent; // the whole line, if it's cut off
}

// ---- Start --------------------------------------------------------------

showTool('drop');
// Opens on an empty tank; the examples only run when chosen.
c.clear();
showGallery();
requestAnimationFrame(frame);

window.marble = () => c.marble; // for use from the browser console

for (const el of document.querySelectorAll('[data-info]')) addInfo(el, el.dataset.info);
c.syncTile();
