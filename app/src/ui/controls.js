// How the new interface arranges the real controls, which come from the tank's own modules
// through live.js, so every tool and setting has a place here.
import {
  Droplet, SprayCan, Grip, Type, Brush, Rows3, Heart, PenTool, Waves, Activity, RefreshCw,
  Tornado, Wind, Eraser, Snowflake, Columns3, Sparkles,
} from 'lucide-react';
import { createElement as h } from 'react';
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

// Full rake: a comb as wide as the tank, sweeping across it. Drawn like a lucide icon (24 box,
// 2 px round strokes, currentColor), since lucide has no comb.
function FullRakeIcon({ size = 24, ...rest }) {
  return h('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...rest,
  },
  h('path', { d: 'M2 4h20' }),
  h('path', { d: 'M3 4v8M7.5 4v8M12 4v8M16.5 4v8M21 4v8' }),
  h('path', { d: 'M12 15v6M9 18l3 3 3-3' }));
}

export const ICONS = {
  drop: Droplet, spray: SprayCan, fillDots: Grip, paint: Brush, stripes: Rows3, text: Type,
  rake: Columns3, fullRake: FullRakeIcon, hearts: Heart, stylus: PenTool,
  jiggle: Waves, wriggle: Activity, stir: RefreshCw, vortex: Tornado, air: Wind,
  erase: Eraser,
};
export const iconFor = (id) => ICONS[id] ?? Sparkles;
export { Snowflake as FreezeIcon };

// Every brush shows all of its settings, in Simple view too. (The view argument stays so a
// tool could hide some again later.)
export const shownParams = (id, _view) => toolDef(id).params;
export const shownChoices = (id, _view) => toolDef(id).choices;

export const SPEEDS = ['0.5', '1', '2', '5'];
