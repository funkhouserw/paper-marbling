// The sidebar's tools and sliders. The page uses these to build its controls, and the
// server uses them to tell the assistant what slider numbers mean.
import { COMMANDS, dialToValue } from './api.js';

export const TURNS = { ccw: 'Counter-clockwise', cw: 'Clockwise' };

const WEAVE_CHOICE = {
  straight: 'Straight', sine: 'Sine', scallop: 'Scallop', points: 'Points', zigzag: 'Zigzag', fin: 'Fin', breaker: 'Breaker', curl: 'Curl',
  spiral: 'Spiral', wave: 'Wave', shell: 'Shell', flick: 'Flick', hook: 'Hook',
};

export const TOOLS = {
  drop: {
    hint: 'Click to place drops. Each click can be a different quantity and colour.',
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
  text: {
    hint: 'Click to print the text as ink. It never grows, but rakes and drops move it.',
    color: true,
    text: true,
    params: {
      size: ['Text size', 12, 2, 50, 0.5],
    },
  },
  rake: {
    hint: 'Drag across the tank: the rake travels along your line, teeth perpendicular to it.',
    choices: { waveShape: ['Weave shape', WEAVE_CHOICE, 'straight'] },
    params: {
      teeth: ['Teeth', 10, 1, 80, 1],
      spacing: ['Space between teeth', 5, 0.5, 20, 0.1],
      speed: ['Speed', 15, 1, 80, 1],
      D: ['Tooth thickness', 1, 0.3, 3, 0.1],
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
      teeth: ['Teeth', 12, 1, 80, 1],
      offset: ['Slide sideways', 0, 0, 20, 0.1],
      speed: ['Speed', 20, 1, 80, 1],
      D: ['Tooth thickness', 0.8, 0.3, 3, 0.1],
      width: ['Tine width', 0, 0, 8, 0.1],
      waveAmp: ['Weave height', 0, 0, 150, 1],
      waveLength: ['Weave length', 10, 2, 40, 0.5],
    },
  },
  stylus: {
    hint: 'Draw freely: a single tine follows your stroke.',
    params: {
      speed: ['Speed', 15, 1, 80, 1],
      D: ['Tine thickness', 1, 0.3, 3, 0.1],
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
  vortex: {
    hint: 'Click a centre: a swirl spins up around it.',
    choices: { direction: ['Direction', TURNS, 'ccw'] },
    params: {
      circulation: ['Swirl strength', 3000, 100, 20000, 100],
      duration: ['Duration (s)', 3, 0.2, 15, 0.1],
    },
  },
};

export const PAGE_UNITS = {
  quantity: 'q', scatter: 'w', size: 'w', spacing: 'w', speed: 'w', D: 'w', waveAmp: 'tenth', waveLength: 'w',
  width: 'w', radius: 'w', min: 'w', max: 'w', offset: 'w', period: 'w', amplitude: 'w', ringSpacing: 'w', circulation: 'w2',
};

// Size-like sliders run 0 to 100 across their useful range; counts, degrees and seconds
// show their real values.
export const isDial = (key) => key === 'dispersion' || (key in PAGE_UNITS && PAGE_UNITS[key] !== 'tenth');

// What each 0-100 slider means as a script option, for the assistant's instructions.
export function renderSliders() {
  const lines = [];
  for (const [name, def] of Object.entries(TOOLS)) {
    const options = COMMANDS.find((c) => c.name === name)?.params ?? [];
    for (const [key, [label, , min, max]] of Object.entries(def.params)) {
      if (!options.some((p) => p[0] === key)) continue;
      if (PAGE_UNITS[key] === 'tenth') {
        lines.push(`  ${def.label ?? name[0].toUpperCase() + name.slice(1)}, "${label}": ${name} option ${key}: slider 0 to ${max}, script value is the slider divided by 10`);
        continue;
      }
      if (!isDial(key)) continue;
      const stops = [0, 25, 50, 75, 100].map((d) => `${d}=${dialToValue(d, min, max)}`).join(', ');
      lines.push(`  ${def.label ?? name[0].toUpperCase() + name.slice(1)}, "${label}": ${name} option ${key}: ${stops}`);
    }
  }
  return lines.join('\n');
}
