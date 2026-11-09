// How the new interface arranges the real controls, which come from the tank's own modules
// through live.js, so every tool and setting has a place here.
import {
  Droplet, SprayCan, Grip, Type, Brush, Wheat, Rows3, Heart, PenTool, Waves, Activity, RefreshCw,
  Tornado, Wind, Eraser, Snowflake, Columns3, Sparkles, Spline,
  Expand, Hash, Droplets, CircleDot, FlaskConical, Hourglass, TestTube, Shuffle, Maximize2, Compass,
  CircleDashed, Circle, Dot, MoveHorizontal, Shrink, Target, Ruler, Triangle, Slice, BetweenHorizontalStart,
  Gauge, Disc, MoveRight, AudioWaveform, ArrowUpToLine, ArrowDownToLine, Magnet, Frame, Timer, RotateCw,
  Disc3, Maximize, Layers, Palette, BarChart3, Layers2, RotateCcw, SlidersHorizontal,
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

// Heart drop: heart B with its long, fine point, drawn like a lucide icon.
function HeartDropIcon({ size = 24, ...rest }) {
  return h('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...rest,
  },
  h('path', { d: 'M12 6.2C10.6 3.9 6 3.6 5.2 7.2c-.5 2.3 1.4 4.3 3.4 6.2 1.4 1.4 2.6 3.2 3.4 7.6.8-4.4 2-6.2 3.4-7.6 2-1.9 3.9-3.9 3.4-6.2C18 3.6 13.4 3.9 12 6.2Z' }));
}

export const ICONS = {
  drop: Droplet, heartDrop: HeartDropIcon, broom: Wheat, spray: SprayCan, fillDots: Grip, paint: Brush, stripes: Rows3, text: Type,
  rake: Columns3, drawnRake: Spline, fullRake: FullRakeIcon, hearts: Heart, stylus: PenTool,
  jiggle: Waves, wriggle: Activity, stir: RefreshCw, vortex: Tornado, air: Wind,
  erase: Eraser,
};
export const iconFor = (id) => ICONS[id] ?? Sparkles;
export { Snowflake as FreezeIcon };

// Every brush shows all of its settings in Simple view too, except the few tools.js marks advanced.
export const shownParams = (id, view) => (view === 'advanced' ? toolDef(id).params : toolDef(id).params.filter((p) => !p.advanced));
export const shownChoices = (id, _view) => toolDef(id).choices;

// Shorter names for the settings bar, where every setting gets the same width. The full name stays
// in the panels, the phone, and the (i) and hover text in the bar.
export const SHORT_LABELS = {
  'Smallest dot (% of largest)': 'Smallest (%)',
  'Drops per click': 'Per click', 'Dots per spray': 'Per spray', 'Space between dots': 'Spacing',
  'Colours per dot': 'Colours', 'Space between teeth': 'Spacing',
  'Start above (%)': 'Starts (%)', 'Wave direction (°)': 'Direction (°)',
  'Starts turning': 'Turns first', 'Only loops from': 'Loops from', 'Only loops up to': 'Loops to', 'Swirl strength': 'Strength',
};
export const shortLabel = (label) => SHORT_LABELS[label] ?? label;

export const SPEEDS = ['0.5', '1', '2', '5'];

// One icon per setting, by its key, shown beside the label in the full settings bar and alone (with
// the value) in the folded one, so the icons are learnt by sitting next to their names.
export const SETTING_ICONS = {
  quantity: Droplet, dispersion: Expand, count: Hash, scatter: Sparkles, oil: Droplets, bands: CircleDot,
  turpentine: FlaskConical, evaporation: Hourglass, gall: TestTube, variation: Shuffle, spreading: Maximize2,
  angle: Compass, n: Hash, radius: CircleDashed, max: Circle, smallest: Dot, min: Dot, gap: BetweenHorizontalStart,
  tightness: Shrink, rings: Target, size: Type, width: Ruler, taper: Triangle, wobble: Activity, slivers: Slice,
  teeth: Columns3, spacing: BetweenHorizontalStart, speed: Gauge, D: Disc, reach: MoveHorizontal,
  waveAmp: AudioWaveform, waveLength: Waves, above: ArrowUpToLine, below: ArrowDownToLine, pull: Magnet,
  offset: MoveRight, overhang: Frame, period: Waves, amplitude: AudioWaveform, duration: Timer, degrees: RotateCw,
  ringSpacing: Disc3, rate: RefreshCw, scale: Maximize, octaves: Layers, circulation: Tornado,
  sprayColors: Palette, sizes: BarChart3, over: Layers2, waveShape: Spline, style: Heart, direction: RotateCcw,
  mode: Eraser, ease: Activity,
};
export const settingIcon = (key) => SETTING_ICONS[key] ?? SlidersHorizontal;
