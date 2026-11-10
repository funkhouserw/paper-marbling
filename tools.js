// The sidebar's tools and sliders. The page uses these to build its controls, and the
// server uses them to tell the assistant what slider numbers mean.
import { COMMANDS, dialToValue } from './api.js';
import { moveContours } from './text.js';

export const TURNS = { ccw: 'Counter-clockwise', cw: 'Clockwise' };

const WEAVE_CHOICE = {
  straight: 'Straight', sine: 'Sine', scallop: 'Scallop', points: 'Points', zigzag: 'Zigzag', fin: 'Fin', breaker: 'Breaker', curl: 'Curl',
  spiral: 'Spiral', wave: 'Wave', shell: 'Shell', flick: 'Flick', hook: 'Hook',
};

// Much past 100 a tine drags the whole page along, so a full-width rake can push all the
// ink out of an open tank. Shorter strokes still use the extra reach.
const FAR_DRAG = { top: 200, value: 6 };

// Each tool says how it's used, and what it does to the tank:
//   input: 'click' (at a point), 'stroke' (along a dragged path), 'line' (from where the drag
//     starts to where it ends) or 'whole' (on the whole tank, from the Apply button).
//   waits: it moves ink, so it waits for growing drops to settle when Tools wait is on.
//   drag: a click tool that keeps going while dragged, every spacing × its radius, at share of
//     its strength. spacing is given the tool's values.
//   act(t): does it. t has m (the tank), v (the tool's values in mm), point or path, ink (the
//     chosen { color, shimmer }), inks (the palette), text() (the Text tool's contours), image()
//     (the Image tool's cells, or null before a picture is chosen), notice(message),
//     queueMode, share for drags, and place(fn), which calls fn(at) with when the action
//     should start (undefined: behind a settle point) and returns what fn did.
// Adding a tool: its engine method, an entry here, its (i) text in info.js, and its script
// command in api.js if scripts should use it. An interface gives it a place and an icon.
// What Auto means for the spread overrides (row 62): the tools' own values before the rule.
const DROP_OPENING = 0.6;
const BROOM_SPREAD = 12;

export const TOOLS = {
  drop: {
    input: 'click',
    act(t) {
      const { m, v, point: [x, y], ink } = t;
      for (let i = 0; i < v.count; i++) {
        const r = v.scatter * Math.sqrt(m.random());
        const a = m.random() * 2 * Math.PI;
        const jitter = v.count > 1 ? m.random() * 0.5 : 0;
        t.place((at) => m.drop({
          x: x + r * Math.cos(a), y: y + r * Math.sin(a),
          quantity: v.quantity, dispersion: v.dispersion ?? DROP_OPENING, gall: v.gall, thin: v.thin, oil: v.oil, bands: v.bands, turpentine: v.turpentine, evaporation: v.evaporation, ...ink,
          at: at === undefined || t.queueMode !== 'together' ? at : at + jitter,
        }));
      }
    },
    hint: 'Click to place drops. Each click can be a different quantity and colour. Keys 1 to 9 pick a palette ink.',
    color: true,
    params: {
      quantity: ['Ink amount', 1.5, 0.05, 30, 0.05],
      gall: ['Gall in the colour', null, 0, 5, 0.05, undefined, { auto: 'Bath' }], // null: the bath's
      thin: ['Paint: thick ↔ thin', 0.5, 0, 1, 0.05],
      count: ['Drops per click', 1, 1, 60, 1],
      scatter: ['Scatter', 0, 0, 40, 0.5],
      oil: ['Oil (shell)', 0, -1, 1, 0.05],
      bands: ['Shell rings', 5, 2, 12, 1, undefined, { advanced: true }],
      turpentine: ['Turpentine (stormont)', 0, 0, 1, 0.05],
      evaporation: ['Holes close over (s)', 0, 0, 20, 0.5, undefined, { advanced: true }],
      // Override of the engine's rule (row 62): Auto is the drop's own opening speed.
      dispersion: ['Opening speed (override)', null, 0.05, 5, 0.05, undefined, { advanced: true, auto: 'Auto' }],
    },
  },
  // A flick of a broom-straw brush: many drops of one colour landing at once, a few large and many
  // small (log-normal sizes), scattered over the reach. Stone and vein marbling are built from these.
  broom: {
    label: 'Broom straw',
    input: 'click',
    // The broom only places drops; how they meet is the simulator's. Ink amount is the whole flick's:
    // each drop's mean share, corrected for the log-normal's mean. Oil and turpentine (Advanced) go
    // into every drop, and are only passed when set, so plain flicks log as before.
    act(t) {
      const { m, v, point: [x, y], ink } = t;
      const n = Math.max(1, Math.round(v.count));
      const size = v.quantity / n / Math.exp(v.variation ** 2 / 2);
      const extra = { ...(v.oil ? { oil: v.oil } : {}), ...(v.turpentine ? { turpentine: v.turpentine } : {}) };
      t.place((at) => m.broom({ n, x, y, w: 2 * v.scatter, h: 2 * v.scatter, size, spread: v.variation, spreading: v.spreading ?? BROOM_SPREAD, gall: v.gall ?? undefined, thin: v.thin, ...extra, ...ink, at }));
    },
    hint: 'Click to flick a broom-straw brush: many drops of the colour at once, a few large and many small, over the reach. Throw colour after colour for stone and vein.',
    color: true,
    params: {
      // One flick colours a patch, as in Jeffrey Ang's stone video (research/references, photos
      // 26–27): about half the bath at first, near 90% after two or three flicks (measured
      // 2026-11-07), rather than flooding the tank at once.
      count: ['Drops', 60, 3, 300, 1],
      quantity: ['Ink amount', 2.5, 0.5, 100, 0.5],
      scatter: ['Scatter', 25, 2, 80, 0.5],
      variation: ['Size spread', 0.9, 0, 2, 0.05],
      gall: ['Gall in the colour', null, 0, 5, 0.05, undefined, { auto: 'Bath' }],
      thin: ['Paint: thick ↔ thin', 0.5, 0, 1, 0.05],
      oil: ['Oil (shell)', 0, -1, 1, 0.05, undefined, { advanced: true }],
      turpentine: ['Turpentine (stormont)', 0, 0, 1, 0.05, undefined, { advanced: true }],
      // Override of the engine's rule (row 62): Auto lets the gall decide how far the flick opens.
      spreading: ['Spread (override)', null, 1, 50, 1, undefined, { advanced: true, auto: 'Auto' }],
    },
  },
  heartDrop: {
    input: 'click',
    act(t) {
      const { m, v, point: [x, y], ink } = t;
      t.place((at) => m.heartDrop({ x, y, quantity: v.quantity, angle: v.angle, variation: v.variation, ...ink, at }));
    },
    label: 'Heart drop',
    hint: 'Click to place a heart of ink. It pushes the ink round it aside, then keeps its shape and its fine point until a tool moves it.',
    color: true,
    params: {
      quantity: ['Ink amount', 1.5, 0.05, 30, 0.05],
      angle: ['Angle (°)', 0, -180, 180, 1],
      variation: ['Variation', 0.3, 0, 1, 0.05],
    },
  },
  spray: {
    input: 'click',
    drag: { spacing: () => 0.75, share: 0.25 },
    act(t) {
      const { m, v, point: [x, y], share = 1 } = t;
      const colors = v.sprayColors === 'one' ? [t.ink] : t.inks;
      // The smallest dot is a share of the largest, so the two sliders can't hide a ×17 range.
      const min = v.max * Math.max(0.01, Math.min(1, v.smallest / 100));
      const skew = { small: 3, even: 1.4, big: 0.6 }[v.sizes] ?? 1.4;
      const extra = { ...(v.oil ? { oil: v.oil } : {}), ...(v.turpentine ? { turpentine: v.turpentine } : {}) };
      t.place((at) => m.spray({ x, y, radius: v.radius, n: Math.max(1, Math.round(v.n * share)), min, max: v.max, skew, colors, gall: v.gall, thin: v.thin, ...extra, at }));
    },
    hint: 'Click, or drag, to spray fine dots. They use the colours chosen below.',
    color: true,
    choices: {
      sprayColors: ['Spray colours', { palette: 'All inks in the palette', one: 'Just the chosen ink' }, 'palette'],
      sizes: ['Dot sizes', { small: 'Mostly small', even: 'Even mix', big: 'Mostly big' }, 'even'],
    },
    params: {
      // Defaults give a spatter like a broom flicked over the size (stone video, photo 36): a range
      // of dot sizes, not dust.
      n: ['Dots per spray', 120, 10, 600, 10],
      radius: ['Scatter', 15, 1, 60, 0.5],
      max: ['Largest dot', 0.6, 0.05, 5, 0.01],
      smallest: ['Smallest dot (% of largest)', 20, 1, 100, 1],
      gall: ['Gall in the colour', null, 0, 5, 0.05, undefined, { auto: 'Bath' }], // null: the bath's
      thin: ['Paint: thick ↔ thin', 0.5, 0, 1, 0.05],
      oil: ['Oil (shell)', 0, -1, 1, 0.05, undefined, { advanced: true }],
      turpentine: ['Turpentine (stormont)', 0, 0, 1, 0.05, undefined, { advanced: true }],
    },
  },
  fillDots: {
    input: 'whole',
    act(t) {
      const { m } = t;
      const { sprayColors, over, ...v } = t.v;
      const options = { ...v, over: over === 'over', colors: sprayColors === 'one' ? [t.ink] : t.inks };
      // Rings go on one at a time, each waiting for the last to settle, and that needs the script's timeline.
      if (v.rings > 1) {
        m.settle();
        return m.fillDots(options);
      }
      return t.place((at) => m.fillDots({ ...options, at }));
    },
    label: 'Fill dots',
    hint: 'Fills the open space with dots, largest holes first. Then press its button.',
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
      rings: ['Colours per dot', 1, 1, 5, 1],
      gall: ['Gall', null, 0, 5, 0.05, undefined, { advanced: true, auto: 'Bath' }], // null: the bath's
    },
  },
  text: {
    input: 'click',
    act(t) {
      const { m, point: [x, y], ink } = t;
      const contours = t.text();
      if (contours.length) t.place((at) => m.print({ contours: moveContours(contours, x, y), ...ink, at }));
    },
    hint: 'Click to print the text as ink. It never grows, but rakes and drops move it.',
    color: true,
    text: true,
    params: {
      size: ['Text size', 12, 2, 50, 0.5],
    },
  },
  image: {
    input: 'click',
    act(t) {
      const prints = t.image();
      if (!prints) { t.notice('Choose an image first.'); return null; }
      const [x, y] = t.point;
      // Every cell lands at once, as one step.
      return t.place((at) => {
        let op = null;
        for (const p of prints) op = t.m.print({ contours: moveContours(p.contours, x, y), color: p.color, at });
        return op;
      });
    },
    label: 'Image',
    stepLabel: 'Image',
    hint: 'Choose a jpg or png, then click to lay it as cells of ink.',
    image: true,
    params: {
      colours: ['Colours', 8, 2, 10, 1],
      detail: ['Detail', 3, 1, 5, 1],
      fit: ['Size', 100, 10, 100, 1], // % of the largest size that fits the tank
    },
    choices: {
      from: ['Colours from', { photo: 'The picture', palette: 'The palette' }, 'photo'],
    },
  },
  paint: {
    input: 'stroke',
    act: (t) => t.place((at) => t.m.paint({ path: t.path, ...t.v, ...t.ink, at })),
    hint: 'Drag to paint a line of ink. It doesn\'t spread, but later tools move it.',
    color: true,
    params: {
      width: ['Brush width', 3, 0.2, 30, 0.1],
      taper: ['Taper', 0, 0, 1, 0.05],
      wobble: ['Wobble', 0, 0, 5, 0.05],
    },
  },
  stripes: {
    input: 'whole',
    act: (t) => t.place((at) => {
      const { over, ...v } = t.v;
      return t.m.stripes({ ...v, over: over === 'over', colors: t.inks, at });
    }),
    label: 'Stripes',
    choices: { over: ['Existing ink', { over: 'Go on top of it', around: 'Go around it' }, 'over'] },
    hint: 'Fills the tank with bands of the palette\'s inks. Rake across them for chevrons. Then press its button.',
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
    input: 'line',
    waits: true,
    act: (t) => t.place((at) => t.m.rake({ from: t.path[0], to: t.path[1], ...t.v, at })),
    hint: 'Drag across the tank: the rake travels along your line, teeth perpendicular to it.',
    choices: { waveShape: ['Weave shape', WEAVE_CHOICE, 'straight'] },
    params: {
      teeth: ['Teeth', 10, 1, 80, 1],
      spacing: ['Space between teeth', 5, 0.5, 20, 0.1],
      speed: ['Speed', 15, 1, 80, 1],
      D: ['Pull', 1, 0.3, 3, 0.1, FAR_DRAG],
      width: ['Tine width', 0, 0, 8, 0.1],
      ease: ['Ease in and out (s)', 0, 0, 3, 0.1, undefined, { advanced: true }],
      waveAmp: ['Weave height', 0, 0, 150, 1],
      waveLength: ['Weave length', 10, 2, 40, 0.5],
    },
  },
  hearts: {
    input: 'whole',
    waits: true,
    act: (t) => t.place((at) => t.m.hearts({ ...t.v, at })),
    label: 'Heart strike',
    choices: { style: ['Style', { bend: 'Bend round loops into hearts', tine: 'Drag a tine through each' }, 'bend'] },
    hint: 'Turns every round dot that isn\'t frozen into a heart, rings and all. The dashed outlines show what each becomes. Then press its button.',
    whole: true,
    directions: 'heart', // 0 points down, as Heart drop
    params: {
      angle: ['Angle (°)', 0, 0, 360, 1],
      variation: ['Variation', 0.3, 0, 1, 0.05],
      above: ['Start above (%)', 130, 0, 300, 5],
      below: ['End below (%)', 130, 0, 300, 5],
      pull: ['Pull (%)', 25, 5, 100, 1],
      min: ['Only loops from', 0.02, 0.02, 60, 0.01],
      max: ['Only loops up to', 60, 0.02, 60, 0.01],
      speed: ['Speed', 20, 1, 80, 1],
    },
  },
  fullRake: {
    input: 'whole',
    waits: true,
    act: (t) => t.place((at) => t.m.fullRake({ ...t.v, at })),
    label: 'Full rake',
    choices: { waveShape: ['Weave shape', WEAVE_CHOICE, 'straight'] },
    hint: 'Teeth spread evenly across the whole page; offset slides them and wraps at the edges. Pick a direction, then press its button.',
    whole: true,
    directions: true,
    params: {
      angle: ['Angle (°)', 0, 0, 360, 1],
      teeth: ['Teeth', 12, 1, 80, 1],
      offset: ['Offset', 0, 0, 20, 0.1],
      speed: ['Speed', 20, 1, 80, 1],
      D: ['Pull', 0.8, 0.3, 3, 0.1, FAR_DRAG],
      width: ['Tine width', 0, 0, 8, 0.1],
      ease: ['Ease in and out (s)', 0, 0, 3, 0.1, undefined, { advanced: true }],
      waveAmp: ['Weave height', 0, 0, 150, 1],
      waveLength: ['Weave length', 10, 2, 40, 0.5],
      // null is Auto: none on a repeating tank, where anything past an edge is raked again at the
      // other, and 2 cm otherwise. Only in Advanced view.
      overhang: ['Overhang', null, 0, 6, 0.1, undefined, { advanced: true, auto: 'Auto' }],
    },
  },
  // A whole rake dragged freehand. Its teeth stay in the line set by the first direction you move
  // (the engine's rake keeps one heading along a path), so curving the stroke fans every tine the
  // same way: drag east, then curve south, for feather plumes.
  drawnRake: {
    label: 'Drawn rake',
    input: 'stroke',
    waits: true,
    act: (t) => t.place((at) => t.m.rake({ path: t.path, ...t.v, at })),
    hint: 'Draw freely: the whole rake follows your stroke, its teeth keeping the line your first movement set.',
    params: {
      teeth: ['Teeth', 8, 1, 80, 1],
      spacing: ['Space between teeth', 3, 0.5, 20, 0.1],
      speed: ['Speed', 15, 1, 80, 1],
      D: ['Pull', 1, 0.3, 3, 0.1, FAR_DRAG],
      width: ['Tine width', 0, 0, 8, 0.1],
      ease: ['Ease in and out (s)', 0, 0, 3, 0.1, undefined, { advanced: true }],
    },
  },
  stylus: {
    input: 'stroke',
    waits: true,
    act: (t) => t.place((at) => t.m.stylus({ path: t.path, ...t.v, at })),
    hint: 'Draw freely: a single tine follows your stroke.',
    params: {
      speed: ['Speed', 15, 1, 80, 1],
      D: ['Pull', 1, 0.3, 3, 0.1, FAR_DRAG],
      width: ['Tine width', 0, 0, 8, 0.1],
    },
  },
  jiggle: {
    input: 'whole',
    waits: true,
    act: (t) => t.place((at) => t.m.jiggle({ ...t.v, at })),
    hint: 'Shakes the whole tank into waves. Then press its button.',
    whole: true,
    params: {
      angle: ['Wave direction (°)', 0, -180, 180, 5],
      period: ['Wave length', 20, 2, 80, 0.5],
      amplitude: ['Wave height', 3, 0, 20, 0.1],
      duration: ['Duration (s)', 2, 0.2, 10, 0.1],
    },
  },
  wriggle: {
    input: 'click',
    waits: true,
    act(t) {
      const { m, v, point: [x, y] } = t;
      const degrees = v.direction === 'cw' ? -v.degrees : v.degrees;
      t.place((at) => m.wriggle({ x, y, period: v.period, degrees, duration: v.duration, at }));
    },
    hint: 'Click a centre: rings around it twist back and forth.',
    choices: { direction: ['Starts turning', TURNS, 'ccw'] },
    params: {
      period: ['Ring spacing', 15, 2, 60, 0.5],
      degrees: ['Twist (°)', 20, 1, 180, 1],
      duration: ['Duration (s)', 2, 0.2, 10, 0.1],
    },
  },
  stir: {
    input: 'click',
    waits: true,
    act(t) {
      const { m, v, point: [x, y] } = t;
      const opposed = (i) => v.direction === 'alternate' && i % 2;
      const radii = Array.from({ length: v.rings }, (_, i) => (opposed(i) ? -1 : 1) * (i + 1) * v.ringSpacing);
      const degrees = v.direction === 'cw' ? -v.degrees : v.degrees;
      t.place((at) => m.stir({ x, y, radii, degrees, rate: v.rate, D: v.D, at }));
    },
    hint: 'Click a centre: circular tines turn around it.',
    choices: { direction: ['Direction', { alternate: 'Alternating rings', ...TURNS }, 'alternate'] },
    params: {
      rings: ['Rings', 3, 1, 12, 1],
      ringSpacing: ['Ring spacing', 10, 1, 30, 0.5],
      degrees: ['Turn (°)', 180, 10, 1080, 10],
      rate: ['Speed (°/s)', 60, 5, 360, 5],
      D: ['Pull', 3, 0.2, 10, 0.1],
    },
  },
  air: {
    input: 'whole',
    waits: true,
    act: (t) => t.place((at) => t.m.air({ ...t.v, at })),
    label: 'Air',
    hint: 'A breath of air across the whole tank. Each press is a different breath. Then press its button.',
    whole: true,
    params: {
      scale: ['Swirl size', 20, 3, 60, 0.5],
      strength: ['Strength', 5, 0.5, 30, 0.1],
      octaves: ['Fine detail', 2, 1, 4, 1],
      duration: ['Duration (s)', 2, 0.2, 10, 0.1],
    },
  },
  erase: {
    input: 'click',
    // Lifting cuts a hard edge, so a drag needs closer spots to make a smooth stroke.
    drag: { spacing: (values) => (values.mode === 'lift' ? 0.3 : 0.75) },
    act(t) {
      const { m, v, point: [x, y] } = t;
      if (m.eraseSupported) t.place((at) => m.erase({ x, y, ...v, at }));
    },
    label: 'Eraser',
    hint: 'Click or drag to take ink away. Pause first to mark several spots, then play to watch them go.',
    choices: { mode: ['Takes away', { drain: 'Ink and water: the surface closes up', lift: 'Just the ink: the water stays' }, 'drain'] },
    params: {
      radius: ['Eraser size', 5, 0.5, 30, 0.1],
      duration: ['Duration (s)', 1, 0.1, 10, 0.1],
    },
  },
  vortex: {
    input: 'click',
    waits: true,
    act(t) {
      const { m, v, point: [x, y] } = t;
      const circulation = v.direction === 'cw' ? -v.circulation : v.circulation;
      t.place((at) => m.vortex({ x, y, circulation, duration: v.duration, at }));
    },
    hint: 'Click a centre: a swirl spins up around it.',
    choices: { direction: ['Direction', TURNS, 'ccw'] },
    params: {
      circulation: ['Swirl strength', 105, 10, 1100, 1, { top: 200, value: 20000 }],
      duration: ['Duration (s)', 3, 0.2, 15, 0.1],
    },
  },
};

export const PAGE_UNITS = {
  quantity: 'q', scatter: 'w', size: 'w', spacing: 'w', speed: 'w', strength: 'w', D: 'w', waveAmp: 'tenth', waveLength: 'w',
  gap: 'w', width: 'w', wobble: 'w', scale: 'w', radius: 'w', min: 'w', max: 'w', offset: 'w', period: 'w', amplitude: 'w', ringSpacing: 'w', circulation: 'w2', overhang: 'w',
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
