// The sidebar's tools and sliders. The page uses these to build its controls, and the
// server uses them to tell the assistant what slider numbers mean.
import { COMMANDS, dialToValue } from './api.js';

export const TURNS = { ccw: 'Counter-clockwise', cw: 'Clockwise' };

const WEAVE_CHOICE = {
  straight: 'Straight', sine: 'Sine', scallop: 'Scallop', points: 'Points', zigzag: 'Zigzag', fin: 'Fin', breaker: 'Breaker', curl: 'Curl',
  spiral: 'Spiral', wave: 'Wave', shell: 'Shell', flick: 'Flick', hook: 'Hook',
};

// Much past 100 a tine drags the whole page along, so a full-width rake can push all the
// ink out of an open tank. Shorter strokes still use the extra reach.
const FAR_DRAG = { top: 200, value: 6 };

export const TOOLS = {
  drop: {
    hint: 'Click to place drops. Each click can be a different quantity and colour. Keys 1 to 9 pick a palette ink.',
    color: true,
    params: {
      quantity: ['Drop size', 1.5, 0.05, 30, 0.05],
      dispersion: ['Spread speed', 0.6, 0.05, 5, 0.05],
      count: ['Drops per click', 1, 1, 60, 1],
      scatter: ['Scatter', 0, 0, 40, 0.5],
    },
  },
  spray: {
    hint: 'Click, or drag, to spray fine dots. They use the colours chosen below.',
    color: true,
    choices: { sprayColors: ['Spray colours', { palette: 'All inks in the palette', one: 'Just the chosen ink' }, 'palette'] },
    params: {
      n: ['Dots per spray', 150, 10, 600, 10],
      radius: ['Spray width', 15, 1, 60, 0.5],
      min: ['Smallest dot', 0.05, 0.02, 1, 0.01],
      max: ['Largest dot', 0.6, 0.05, 5, 0.01],
    },
  },
  fillDots: {
    label: 'Fill dots',
    hint: 'Fills the open space with dots, largest holes first. Use the button below.',
    whole: true,
    color: true,
    choices: {
      sprayColors: ['Dot colours', { palette: 'All inks in the palette', one: 'Just the chosen ink' }, 'palette'],
      over: ['Existing ink', { around: 'Go around it', over: 'Go on top of it' }, 'around'],
    },
    params: {
      count: ['Most dots', 150, 10, 800, 10],
      min: ['Smallest dot', 0.8, 0.1, 5, 0.05],
      max: ['Largest dot', 6, 0.5, 30, 0.1],
      gap: ['Space between dots', 0.3, 0, 5, 0.05],
      tightness: ['Tightness', 0.6, 0, 1, 0.05],
      rings: ['Rings in each dot', 1, 1, 5, 1],
    },
  },
  text: {
    hint: 'Click to print the text as ink. It never grows, but rakes and drops move it.',
    color: true,
    text: true,
    params: {
      size: ['Text size', 12, 2, 50, 0.5],
    },
  },
  paint: {
    hint: 'Drag to paint a line of ink. It doesn\'t spread, but later tools move it.',
    color: true,
    params: {
      width: ['Brush width', 3, 0.2, 30, 0.1],
      taper: ['Taper', 0, 0, 1, 0.05],
      wobble: ['Wobble', 0, 0, 5, 0.05],
    },
  },
  stripes: {
    label: 'Stripes',
    hint: 'Fills the tank with bands of the palette\'s inks. Rake across them for chevrons. Use the button below.',
    whole: true,
    directions: true,
    params: {
      count: ['Bands', 16, 2, 80, 1],
      variation: ['Uneven widths', 0.6, 0, 1, 0.05],
      wobble: ['Wobble', 0.75, 0, 5, 0.05],
      slivers: ['Slivers', 0.5, 0, 3, 0.1],
    },
  },
  rake: {
    hint: 'Drag across the tank: the rake travels along your line, teeth perpendicular to it.',
    choices: { waveShape: ['Weave shape', WEAVE_CHOICE, 'straight'] },
    params: {
      teeth: ['Teeth', 10, 1, 80, 1],
      spacing: ['Space between teeth', 5, 0.5, 20, 0.1],
      speed: ['Speed', 15, 1, 80, 1],
      D: ['Tooth thickness', 1, 0.3, 3, 0.1, FAR_DRAG],
      width: ['Tine width', 0, 0, 8, 0.1],
      waveAmp: ['Weave height', 0, 0, 150, 1],
      waveLength: ['Weave length', 10, 2, 40, 0.5],
    },
  },
  fullRake: {
    label: 'Full rake',
    choices: { waveShape: ['Weave shape', WEAVE_CHOICE, 'straight'] },
    hint: 'Teeth spread evenly across the whole page; offset slides them and wraps at the edges. Pick a direction, then use the button below.',
    whole: true,
    directions: true,
    params: {
      angle: ['Angle (°)', 0, 0, 360, 1],
      teeth: ['Teeth', 12, 1, 80, 1],
      offset: ['Slide sideways', 0, 0, 20, 0.1],
      speed: ['Speed', 20, 1, 80, 1],
      D: ['Tooth thickness', 0.8, 0.3, 3, 0.1, FAR_DRAG],
      width: ['Tine width', 0, 0, 8, 0.1],
      waveAmp: ['Weave height', 0, 0, 150, 1],
      waveLength: ['Weave length', 10, 2, 40, 0.5],
    },
  },
  stylus: {
    hint: 'Draw freely: a single tine follows your stroke.',
    params: {
      speed: ['Speed', 15, 1, 80, 1],
      D: ['Tine thickness', 1, 0.3, 3, 0.1, FAR_DRAG],
      width: ['Tine width', 0, 0, 8, 0.1],
    },
  },
  jiggle: {
    hint: 'Shakes the whole tank into waves. Use the button below.',
    whole: true,
    params: {
      angle: ['Wave direction (°)', 0, -180, 180, 5],
      period: ['Wave length', 20, 2, 80, 0.5],
      amplitude: ['Wave height', 3, 0, 20, 0.1],
      duration: ['Duration (s)', 2, 0.2, 10, 0.1],
    },
  },
  wriggle: {
    hint: 'Click a centre: rings around it twist back and forth.',
    choices: { direction: ['Starts turning', TURNS, 'ccw'] },
    params: {
      period: ['Ring spacing', 15, 2, 60, 0.5],
      degrees: ['Twist (°)', 20, 1, 180, 1],
      duration: ['Duration (s)', 2, 0.2, 10, 0.1],
    },
  },
  stir: {
    hint: 'Click a centre: circular tines turn around it.',
    choices: { direction: ['Direction', { alternate: 'Alternating rings', ...TURNS }, 'alternate'] },
    params: {
      rings: ['Rings', 3, 1, 12, 1],
      ringSpacing: ['Ring spacing', 10, 1, 30, 0.5],
      degrees: ['Turn (°)', 180, 10, 1080, 10],
      rate: ['Rate (°/s)', 60, 5, 360, 5],
      D: ['Tine thickness', 3, 0.2, 10, 0.1],
    },
  },
  air: {
    label: 'Air',
    hint: 'A breath of air across the whole tank. Each press is a different breath. Use the button below.',
    whole: true,
    params: {
      scale: ['Swirl size', 20, 3, 60, 0.5],
      speed: ['Strength', 5, 0.5, 30, 0.1],
      octaves: ['Fine detail', 2, 1, 4, 1],
      duration: ['Duration (s)', 2, 0.2, 10, 0.1],
    },
  },
  erase: {
    label: 'Eraser',
    hint: 'Click or drag to take ink away. Pause first to mark several spots, then play to watch them go.',
    choices: { mode: ['Takes away', { drain: 'Ink and water: the surface closes up', lift: 'Just the ink: the water stays' }, 'drain'] },
    params: {
      radius: ['Eraser size', 5, 0.5, 30, 0.1],
      duration: ['Duration (s)', 1, 0.1, 10, 0.1],
    },
  },
  vortex: {
    hint: 'Click a centre: a swirl spins up around it.',
    choices: { direction: ['Direction', TURNS, 'ccw'] },
    params: {
      circulation: ['Swirl strength', 105, 10, 1100, 1, { top: 200, value: 20000 }],
      duration: ['Duration (s)', 3, 0.2, 15, 0.1],
    },
  },
};

export const PAGE_UNITS = {
  quantity: 'q', scatter: 'w', size: 'w', spacing: 'w', speed: 'w', D: 'w', waveAmp: 'tenth', waveLength: 'w',
  gap: 'w', width: 'w', wobble: 'w', scale: 'w', radius: 'w', min: 'w', max: 'w', offset: 'w', period: 'w', amplitude: 'w', ringSpacing: 'w', circulation: 'w2',
};

// Size-like sliders run 0 to 100 across their useful range, and past that with a param's sixth entry; counts, degrees and seconds
// show their real values.
export const isDial = (key) => key === 'dispersion' || (key in PAGE_UNITS && PAGE_UNITS[key] !== 'tenth');

// What each 0-100 slider means as a script option, for the assistant's instructions.
export function renderSliders() {
  const lines = [];
  for (const [name, def] of Object.entries(TOOLS)) {
    const options = COMMANDS.find((c) => c.name === name)?.params ?? [];
    for (const [key, [label, , min, max, , over]] of Object.entries(def.params)) {
      if (!options.some((p) => p[0] === key)) continue;
      if (PAGE_UNITS[key] === 'tenth') {
        lines.push(`  ${def.label ?? name[0].toUpperCase() + name.slice(1)}, "${label}": ${name} option ${key}: slider 0 to ${max}, script value is the slider divided by 10`);
        continue;
      }
      if (!isDial(key)) continue;
      const stops = [0, 25, 50, 75, 100, ...(over ? [150, over.top] : [])].map((d) => `${d}=${dialToValue(d, min, max, over)}`).join(', ');
      lines.push(`  ${def.label ?? name[0].toUpperCase() + name.slice(1)}, "${label}": ${name} option ${key}: ${stops}`);
    }
  }
  return lines.join('\n');
}
