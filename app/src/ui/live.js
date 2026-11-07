// The real controls, read straight from the tank's own modules: every tool and setting from
// tools.js, the explanations in info.js, the simulators, palettes, fonts and example scripts.
// Nothing is copied, so a new tool or setting appears in the interface as soon as it's added there.
// Plain JavaScript with no page, so node tests can use it too.
import { TOOLS as RAW_TOOLS, isDial } from '../../../tools.js';
import { WEAVE_SHAPES } from '../../../engine.js';
import { FONTS as RAW_FONTS } from '../../../text.js';
import { INFO as RAW_INFO } from '../../../info.js';
import { MODELS } from '../../../models.js';
import { BUILT_IN_PALETTES } from '../../../palettes.js';
import { EXAMPLES as RAW_EXAMPLES } from '../../../examples.js';

export const TOOLS = Object.fromEntries(Object.entries(RAW_TOOLS).map(([id, t]) => [id, {
  label: t.label ?? id[0].toUpperCase() + id.slice(1),
  hint: t.hint,
  whole: Boolean(t.whole) || t.input === 'whole',
  input: t.input ?? null,
  color: Boolean(t.color),
  directions: Boolean(t.directions),
  text: Boolean(t.text),
  // Size-like settings show a 0 to 100 dial (further with `over`) instead of page units, as the old page did.
  // A 7th entry carries flags: advanced (Advanced view only) and auto (a value of null means the
  // tank picks, shown as an Auto toggle).
  params: Object.entries(t.params).map(([key, [label, value, min, max, step, over, flags]]) => ({
    key, label, value, min, max, step, dial: isDial(key), ...(over && { over }),
    ...(flags?.advanced && { advanced: true }), ...(flags?.auto && { auto: flags.auto }),
  })),
  choices: Object.entries(t.choices ?? {}).map(([key, [label, options, value]]) => ({ key, label, options, value })),
}]));

export const INFO = RAW_INFO;
export const SIMULATORS = MODELS.map((m) => ({ id: m.id, label: m.label, title: m.title }));
export const PALETTES = BUILT_IN_PALETTES;
export const EXAMPLES = RAW_EXAMPLES;
export const FONTS = Object.fromEntries(Object.entries(RAW_FONTS).map(([k, [label]]) => [k, label]));

// Two repeats of each weave, from the same curve the rake follows.
export const WEAVE_ICONS = Object.fromEntries(Object.keys(WEAVE_SHAPES).map((shape) => {
  const points = [];
  for (let i = 0; i <= 96; i++) {
    const turns = (i / 96) * 2;
    const [along, across] = WEAVE_SHAPES[shape](turns - Math.floor(turns));
    points.push(`${((turns + along) * 22 + 2).toFixed(1)},${(11 - across * 8).toFixed(1)}`);
  }
  return [shape, points.join(' ')];
}));
