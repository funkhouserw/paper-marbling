// How the new interface arranges the real controls. Tool settings come from the fixture, which
// is copied from tools.js, so every tool and setting has a place here.
import {
  Droplet, SprayCan, Grip, Type, Brush, Rows3, Heart, PenTool, Waves, Activity, RefreshCw,
  Tornado, Wind, Eraser, Snowflake, Columns3, Spline,
} from 'lucide-react';
import controls from '../fixtures/controls.json';

export const { tools: TOOLS, info: INFO, simulators: SIMULATORS, palettes: PALETTES, examples: EXAMPLES } = controls;

export const GROUPS = [
  { id: 'ink', label: 'Ink', tools: ['drop', 'spray', 'fillDots', 'paint', 'stripes', 'text'] },
  { id: 'comb', label: 'Comb', tools: ['rake', 'fullRake', 'hearts', 'stylus'] },
  { id: 'move', label: 'Move', tools: ['jiggle', 'wriggle', 'stir', 'vortex', 'air'] },
  { id: 'lift', label: 'Lift', tools: ['erase', 'freeze'] },
];

// Freeze isn't a tool in tools.js: it's a mode that holds chosen ink still.
export const FREEZE = {
  label: 'Freeze',
  hint: 'Click ink to hold it still, like a mask. Click again to let it go.',
  whole: false, color: false, directions: false, text: false, params: [], choices: [],
};
export const toolDef = (id) => (id === 'freeze' ? FREEZE : TOOLS[id]);
export const groupOf = (id) => GROUPS.find((g) => g.tools.includes(id));

export const ICONS = {
  drop: Droplet, spray: SprayCan, fillDots: Grip, paint: Brush, stripes: Rows3, text: Type,
  rake: Columns3, fullRake: Spline, hearts: Heart, stylus: PenTool,
  jiggle: Waves, wriggle: Activity, stir: RefreshCw, vortex: Tornado, air: Wind,
  erase: Eraser, freeze: Snowflake,
};

// The settings Simple view shows for each tool. Everything else waits in Advanced.
// A first draft, to be argued over.
export const SIMPLE = {
  drop: ['quantity', 'count'],
  spray: ['n', 'radius'],
  fillDots: ['count', 'max'],
  paint: ['width', 'taper'],
  stripes: ['count', 'wobble'],
  text: ['size'],
  rake: ['teeth', 'spacing', 'speed'],
  fullRake: ['angle', 'teeth', 'speed'],
  hearts: ['pull', 'speed'],
  stylus: ['speed', 'D'],
  jiggle: ['amplitude', 'period'],
  wriggle: ['degrees', 'period'],
  stir: ['rings', 'degrees'],
  vortex: ['circulation', 'duration'],
  air: ['speed', 'scale'],
  erase: ['radius'],
  freeze: [],
};

export function shownParams(id, view) {
  const def = toolDef(id);
  return view === 'simple' ? def.params.filter((p) => SIMPLE[id].includes(p.key)) : def.params;
}
export const shownChoices = (id, view) => (view === 'simple' ? [] : toolDef(id).choices);

export const SPEEDS = ['0.5', '1', '2', '5'];

export const FLOW_PRESETS = {
  calm: 'Calm: ink stops soon after the tool',
  curling: 'Curling: long feathers and wobble',
  whorls: 'Whorls: wakes roll up into spirals',
  storm: 'Storm: chaos, needs a high point limit',
  custom: 'Custom',
};
export const DETAIL_PRESETS = {
  400000: 'Standard: smooth live play', 2000000: 'High', 5000000: 'Very high', 10000000: 'Extreme', custom: 'Custom',
};
export const QUEUE_MODES = { together: 'All at once', order: 'In order', settled: 'Each after the last settles' };

// Menus. Each item names what it does in the current interface, so the mockup shows where it went.
export const MENUS = [
  { label: 'File', items: ['New tank', 'Save state…', 'Saved states', '—', 'Export PNG', 'Export SVG', 'Export print…', '—', 'Pull a print'] },
  { label: 'Edit', items: ['Undo', 'Redo', '—', 'Copy session to script', '—', 'Clear tank'] },
  { label: 'Tank', items: ['Simulator…', 'Tank size…', 'Base colour…', '—', 'Walls', 'Repeating', 'See it repeat', '—', 'Moving bath…', 'Detail…'] },
  { label: 'View', items: ['Simple', 'Advanced', '—', 'Script drawer', 'Panels', '—', 'Low framerate'] },
  { label: 'Help', items: ['How it works', 'Ask the drop', 'Keyboard shortcuts'] },
];
