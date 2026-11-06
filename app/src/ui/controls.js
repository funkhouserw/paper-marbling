// How the new interface arranges the real controls, which come from the tank's own modules
// through live.js, so every tool and setting has a place here.
import {
  Droplet, SprayCan, Grip, Type, Brush, Rows3, Heart, PenTool, Waves, Activity, RefreshCw,
  Tornado, Wind, Eraser, Snowflake, Columns3, Spline, Sparkles,
} from 'lucide-react';
import { TOOL_GROUPS } from './features.js';

import { TOOLS } from './live.js';

export { TOOLS, INFO, SIMULATORS, PALETTES, EXAMPLES, WEAVE_ICONS, FONTS } from './live.js';

// A tool in tools.js that isn't placed in TOOL_GROUPS (features.js) still appears, under More with a
// sparkle icon, so a new brush is usable straight away; coverage.test.mjs then asks for a proper place.
const PLACED = TOOL_GROUPS;
const unplaced = Object.keys(TOOLS).filter((t) => !PLACED.some((g) => g.tools.includes(t)));
export const GROUPS = unplaced.length ? [...PLACED, { id: 'more', label: 'More', tools: unplaced }] : PLACED;

// Tools that need something the simulator may not have, as TankController.capabilities() keys.
export const NEEDS = { erase: 'erase', hearts: 'hearts' };

// Freeze is a mode, not a tool: it holds chosen ink still under whichever tool is chosen.
export const FREEZE_INFO_KEY = 'freeze';

export const toolDef = (id) => TOOLS[id];
export const groupOf = (id) => GROUPS.find((g) => g.tools.includes(id)) ?? GROUPS[0];

export const ICONS = {
  drop: Droplet, spray: SprayCan, fillDots: Grip, paint: Brush, stripes: Rows3, text: Type,
  rake: Columns3, fullRake: Spline, hearts: Heart, stylus: PenTool,
  jiggle: Waves, wriggle: Activity, stir: RefreshCw, vortex: Tornado, air: Wind,
  erase: Eraser,
};
export const iconFor = (id) => ICONS[id] ?? Sparkles;
export { Snowflake as FreezeIcon };

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
};
// Choices Simple view keeps, because without them a tool can't do its main job.
export const SIMPLE_CHOICES = {
  spray: ['sprayColors'], stir: ['direction'], vortex: ['direction'], wriggle: ['direction'],
  rake: ['waveShape'], fullRake: ['waveShape'],
};

// A tool without a SIMPLE entry shows its first two settings in Simple view.
export function shownParams(id, view) {
  const def = toolDef(id);
  if (view !== 'simple') return def.params;
  return SIMPLE[id] ? def.params.filter((p) => SIMPLE[id].includes(p.key)) : def.params.slice(0, 2);
}
export const shownChoices = (id, view) => (view === 'simple'
  ? toolDef(id).choices.filter((c) => SIMPLE_CHOICES[id]?.includes(c.key))
  : toolDef(id).choices);

export const SPEEDS = ['0.5', '1', '2', '5'];
