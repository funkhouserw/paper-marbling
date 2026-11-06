// What the page does around the tank, shared by any interface: exports, prints, pulls, saved
// tanks, saved scripts and palettes, and asking the assistant. Each takes the TankController.
// Questions for the user, such as "replace it?", come in as functions, so an interface can ask
// them its own way. Errors come back as { error } with a message ready to show.
import { renderPrint, PRINT_DEFAULTS } from './print.js';
import { listSaves, addSave, deleteSave } from './saves.js';
import { savePull, listPulls, deletePull } from './paper.js';
import { keptList } from './kept.js';
import { PALETTES, setSavedPalettes, isBuiltInPalette, validPalette, cleanPalette } from './palettes.js';

export { listSaves, deleteSave, listPulls, deletePull };

// A date as 2026-11-06-22-40-23, for file names.
export const stamp = (date = Date.now()) => new Date(date).toISOString().slice(0, 19).replace(/[:T]/g, '-');

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve));

// ---- Exports ------------------------------------------------------------------

// The tank as a PNG 3000 pixels across its longer side.
export function pngBlob(c) {
  const m = c.marble;
  const scale = 3000 / Math.max(m.width, m.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(m.width * scale);
  canvas.height = Math.round(m.height * scale);
  m.draw(canvas.getContext('2d'), scale);
  return toBlob(canvas);
}

export const svgBlob = (c) => new Blob([c.marble.toSVG()], { type: 'image/svg+xml' });

export const MM_PER_SOFT = 0.06; // the top of the Soft edges slider, 100, is 6 mm

// A high-resolution print, slowly. pale: thin ink looks paler. texture: rims and texture.
// soft: the Soft edges slider, 0 to 100. onProgress is told the share done, 0 to 1.
export async function printBlob(c, { pale = true, texture = true, soft = 0 } = {}, onProgress = () => {}) {
  const { width, height, data } = await renderPrint(c.marble, {
    paleness: pale ? PRINT_DEFAULTS.paleness : 0,
    rim: texture ? PRINT_DEFAULTS.rim : 0,
    mottle: texture ? PRINT_DEFAULTS.mottle : 0,
    grain: texture ? PRINT_DEFAULTS.grain : 0,
    soft: Number(soft) * MM_PER_SOFT,
    paper: c.settings.useBath ? c.settings.bath : PRINT_DEFAULTS.paper,
  }, onProgress);
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
  return toBlob(canvas);
}

// ---- Pulls --------------------------------------------------------------------

// What view.startPull() needs, from the Paper settings. tint is the chosen paper colour;
// onBase uses the base colour instead, when there is one. imperfection is 0 to 100.
export function pullOptions(c, { tint, onBase = false, imperfection = 50, mirror = false, seed, clearAfter = false }) {
  return {
    tint: onBase && c.settings.useBath ? c.settings.bath : tint,
    imperfection: Number(imperfection) / 100,
    mirror,
    seed,
    clearAfter,
  };
}

// Keeps a finished pull in the browser's gallery, and downloads it too if asked.
// Resolves with { blob, id }; id is null if the gallery couldn't keep it.
export async function keepPull(print, { downloadIt = false } = {}) {
  const blob = await toBlob(print);
  if (downloadIt) download(blob, `marble-pull-${stamp()}.png`);
  const id = await savePull(blob).catch(() => null);
  return { blob, id };
}

// ---- Saved tanks ----------------------------------------------------------------

// Saves the tank, its settings, a picture and the script beside it. Resolves with { error } if
// the browser couldn't keep it, which usually means it's too big.
export async function saveTank(c, view, script) {
  const thumb = view.thumbnail(120);
  const { simulator, useBath, bath, visc, state } = c.saveData();
  try {
    await addSave({ created: Date.now(), thumb, simulator, script, useBath, bath, visc, state });
    return {};
  } catch (err) {
    return { error: `This tank couldn't be saved, probably because it's too big for the browser's storage. ${err.message ?? ''}` };
  }
}

// Puts a saved tank back. Returns the script that was saved with it.
export function restoreTank(c, save) {
  c.restore(save);
  return save.script;
}

// ---- My scripts -------------------------------------------------------------------

export const myScripts = keptList('marbler.scripts');

// Saves a script by name. open is the name of the script now open, which saving over needs no
// question. confirmReplace(name) asks before replacing any other.
export function saveScript(c, { name, text, open = '', confirmReplace = () => true }) {
  name = name.trim();
  if (!name) return { error: null, needsName: true };
  if (name !== open && myScripts.list().some((s) => s.name === name) && !confirmReplace(name)) return { cancelled: true };
  try {
    myScripts.save({ name, text, simulator: c.settings.simulator, saved: Date.now() });
  } catch (err) {
    return { error: `Couldn't save the script: ${err.message}` };
  }
  return { name };
}

// The saved script with this name, or undefined.
export const findScript = (name) => myScripts.list().find((s) => s.name === name);

// ---- Palettes ---------------------------------------------------------------------

export const myPalettes = keptList('marbler.palettes', validPalette);

// The palettes to offer: the user's own first, then the built-in ones. Also lets scripts reach
// the saved ones, so call it whenever they change.
export function paletteChoices() {
  const saved = myPalettes.list();
  setSavedPalettes(saved);
  return { saved, builtIn: PALETTES.slice(0, PALETTES.length - saved.length) };
}

// Saves the current inks and bath as a palette. current is the palette now chosen, which
// saving over needs no question. confirmReplace(name) asks before replacing any other.
export function savePalette(c, { name, current = '', confirmReplace = () => true }) {
  name = name.trim();
  if (!name) return { error: null, needsName: true };
  if (isBuiltInPalette(name)) return { error: `"${name}" is a built-in palette, so choose another name.` };
  const entry = { name, bath: c.settings.bath, inks: c.inks };
  if (!validPalette(entry)) return { error: 'A palette name can be up to 40 characters.' };
  const existing = myPalettes.list().find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (existing && existing.name !== current && !confirmReplace(existing.name)) return { cancelled: true };
  try {
    if (existing && existing.name !== name) myPalettes.remove(existing.name);
    myPalettes.save(cleanPalette(entry));
  } catch (err) {
    return { error: `Couldn't save the palette: ${err.message}` };
  }
  return { name };
}

// Deletes a saved palette, if confirmDelete(name) agrees. Built-in ones stay.
export function deletePalette(name, confirmDelete = () => true) {
  if (isBuiltInPalette(name) || !confirmDelete(name)) return false;
  myPalettes.remove(name);
  return true;
}

// What the assistant did to palettes, applied only once its whole turn has succeeded.
// onSaved() is told after each save, and use(name) is asked to switch palette.
export function applyPaletteActions(actions = [], { onSaved = () => {}, use = () => {} } = {}) {
  for (const action of actions) {
    if (action.type === 'save') {
      const others = myPalettes.list().filter((p) => p.name.toLowerCase() === action.palette.name.toLowerCase() && p.name !== action.palette.name);
      for (const other of others) myPalettes.remove(other.name);
      myPalettes.save(action.palette);
      onSaved();
    } else if (action.type === 'use') {
      use(action.name);
    }
  }
}

// ---- The assistant ----------------------------------------------------------------

// Sends the chat to the local server, which edits the script through its tools. Resolves with
// { script, reply, paletteActions } or { error }. paletteName is the palette now chosen.
export async function askAssistant(c, { messages, script, paletteName }) {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        script,
        palettes: myPalettes.list(),
        currentPalette: { name: paletteName, bath: c.settings.bath, inks: c.inks },
      }),
    });
    if (res.status === 404 || res.status === 501) return { error: 'The assistant needs the local server. Start with: node server.mjs' };
    const data = await res.json().catch(() => ({ error: `Server replied ${res.status} with no usable JSON` }));
    if (data.error) return { error: data.error };
    return data;
  } catch (err) {
    return { error: `Couldn't reach the server: ${err.message}` };
  }
}
