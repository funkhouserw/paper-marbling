// The catalogue of everything a Marbler script can call, shaped like tool definitions.
// Scripts work on a 0-100 page, the way CSS percentages do: x is % of the tank's width from
// the left, y is % of its height from the top, and sizes are % of its width, so circles stay
// round. The engine works in mm, and toMm/fromMm here are the only conversion between them.
// The assistant's instructions are generated from this too, and engine.test.mjs checks it
// against the engine. Each param is [name, type, default or null, description, unit].
const AT = ['at', 'number', null, 'start time in seconds; defaults to the timeline cursor'];
const X = ['x', 'number', 50, '% of width from the left', 'x'];
const Y = ['y', 'number', 50, '% of height from the top', 'y'];
const COLOR = (def) => ['color', 'color', def, 'CSS colour or palette ink'];
const SHIMMER = ['shimmer', 'number', 0, '0 to 1, metallic ink'];
const size = (name, def, description) => [name, 'number', def, `${description}, % of width`, 'w'];
const SPEED = (def) => ['speed', 'number', def, '% of width per second', 'w'];

export const COMMANDS = [
  // Ink
  { name: 'drop', group: 'Ink', summary: 'One drop of ink. Does not advance the timeline.', params: [
    X, Y,
    ['quantity', 'number', 1.5, 'amount of ink, as % of the tank area at plain size', 'q'],
    ['dispersion', 'number', 0.8, 'growth speed, 1/s'],
    ['spreading', 'number', 4, 'how many times its plain size the ink can stretch over water; higher also pushes other ink harder, like adding surfactant'],
    COLOR('#1f4e79'), SHIMMER, AT,
  ] },
  { name: 'drops', group: 'Ink', summary: 'Random scatter of drops in a box centred on x, y.', params: [
    ['n', 'number', 20, 'how many'], X, Y,
    ['w', 'number', 100, 'box width, % of width', 'w'],
    ['h', 'number', 100, 'box height, % of height', 'h'],
    ['quantity', 'number', 0.7, 'amount of ink per drop, as for drop', 'q'],
    ['spread', 'number', 0.3, 'random size variation, 0 to 1'],
    ['dispersion', 'number', 0.8, '1/s'],
    ['spreading', 'number', 4, 'as for drop'],
    ['colors', 'color[]', ['#1f4e79'], 'cycled through; CSS colours or palette inks'],
    ['stagger', 'number', 0, 'spreads start times over this many seconds'],
    AT,
  ] },
  { name: 'fillDots', group: 'Ink', summary: 'Fills the surface with dots of varying size and colour, largest holes first, so sizes form a natural hierarchy. Dots start together. For a pleasing fill, use a wide size range and several colours, and leave out any ink that matches the bath or it will disappear.', params: [
    ['count', 'number', 150, 'most dots to place; it stops sooner if no hole is big enough'],
    size('min', 0.8, 'smallest dot radius'),
    size('max', 6, 'largest dot radius'),
    size('gap', 0.3, 'clear space kept between dots'),
    size('margin', 0, 'clear space kept from the tank edge'),
    ['tightness', 'number', 0.6, 'how fully a dot fills its hole, 0 to 1; lower varies sizes more'],
    ['colors', 'color[]', ['#1f4e79'], 'CSS colours or palette inks; neighbours avoid matching'],
    ['rings', 'number', 1, 'colours stacked in each dot, for targets; each layer waits for the last to settle'],
    ['dispersion', 'number', 0.8, '1/s'],
    SHIMMER, AT,
  ] },
  { name: 'text', group: 'Ink', summary: 'Prints text as ink, centred on x, y. It never expands, but later tools move it.', params: [
    ['string', 'string', '', 'the text'], X, Y,
    size('size', 8, 'text size'),
    ['font', 'string', 'serif', 'serif, sans, mono, script or display'],
    COLOR('#1a1a1a'), SHIMMER, AT,
  ] },
  { name: 'print', group: 'Ink', summary: 'Prints closed outlines as one even-odd shape. It never expands, but later tools move it.', params: [
    ['contours', 'number[][]', null, 'required; loops of [x0, y0, x1, y1, ...] in page coordinates', 'contours'],
    COLOR('#1a1a1a'), SHIMMER, AT,
  ] },
  // Tools
  { name: 'rake', group: 'Tools', summary: 'A comb dragged along a line or path. Advances the timeline.', params: [
    ['from', '[x, y]', null, 'start; use with to', 'point'],
    ['to', '[x, y]', null, 'end; use with from', 'point'],
    ['path', '[x, y][]', null, 'instead of from and to', 'points'],
    ['teeth', 'number', 10, 'tooth count'],
    size('spacing', 5, 'distance between teeth'),
    ['offsets', 'number[]', null, 'sideways tooth positions, % of width, instead of teeth and spacing', 'sizes'],
    SPEED(10),
    size('D', 1, 'tooth size; the effect is steep: under about 0.4 barely moves ink at normal speed, about 1 to 2 drags a broad path, and faster tools drag more'),
    size('waveAmp', 0, 'weave height; 0 means a straight rake, so set this for waveShape to do anything'),
    size('waveLength', 10, 'length of one weave'),
    ['waveShape', 'string', 'sine', 'the weave: sine, scallop, points, zigzag, fin, breaker (crest hangs over), curl (loops over itself), spiral (winds into a spiral at each crest), wave (a breaking surf wave), shell (overlapping arches), flick (long slide, small flick) or hook (teardrop under each crest)'],
    AT,
  ] },
  { name: 'fullRake', group: 'Tools', summary: 'A rake across the whole tank with evenly spaced teeth.', params: [
    ['angle', 'number', 0, 'degrees; 0 right, 90 up, 180 left, 270 down'],
    ['teeth', 'number', 10, 'tooth count'],
    size('offset', 0, 'slides the teeth sideways'),
    SPEED(20),
    size('D', 1, 'tooth size'),
    size('waveAmp', 0, 'weave height; 0 means a straight rake, so set this for waveShape to do anything'),
    size('waveLength', 10, 'length of one weave'),
    ['waveShape', 'string', 'sine', 'the weave: sine, scallop, points, zigzag, fin, breaker (crest hangs over), curl (loops over itself), spiral (winds into a spiral at each crest), wave (a breaking surf wave), shell (overlapping arches), flick (long slide, small flick) or hook (teardrop under each crest)'],
    AT,
  ] },
  { name: 'stylus', group: 'Tools', summary: 'One tine along a path.', params: [
    ['path', '[x, y][]', null, 'required', 'points'],
    SPEED(10),
    size('D', 1, 'tine size'),
    AT,
  ] },
  { name: 'stir', group: 'Tools', summary: 'Circular tines.', params: [
    X, Y,
    ['radii', 'number[]', [10, 20, 30], '% of width; a negative radius reverses that ring', 'sizes'],
    ['degrees', 'number', 180, 'positive is counter-clockwise'],
    ['rate', 'number', 60, 'degrees per second'],
    size('D', 3, 'tine size'),
    AT,
  ] },
  { name: 'vortex', group: 'Tools', summary: 'A swirl.', params: [
    X, Y,
    ['circulation', 'number', 3000, 'strength, about 1000 to 5000', 'w2'],
    ['duration', 'number', 3, 'seconds'],
    AT,
  ] },
  { name: 'jiggle', group: 'Tools', summary: 'Waves across the whole tank.', params: [
    ['angle', 'number', 0, 'direction of the wave, degrees'],
    size('period', 20, 'wavelength'),
    size('amplitude', 3, 'movement across the wave'),
    size('compression', 0, 'movement along the wave'),
    size('offset', 0, 'slides the wave'),
    ['duration', 'number', 2, 'seconds'],
    AT,
  ] },
  { name: 'wriggle', group: 'Tools', summary: 'Rings twisting back and forth around a centre.', params: [
    X, Y,
    size('period', 15, 'ring spacing'),
    ['degrees', 'number', 20, 'twist'],
    size('radial', 0, 'movement in and out'),
    ['duration', 'number', 2, 'seconds'],
    AT,
  ] },
  { name: 'shift', group: 'Tools', summary: 'Moves everything in the tank.', params: [
    ['dx', 'number', 0, '% of width; positive is right', 'w'],
    ['dy', 'number', 0, '% of height; positive is down', 'dy'],
    ['duration', 'number', 1, 'seconds'],
    AT,
  ] },
  { name: 'turn', group: 'Tools', summary: 'Rotates everything in the tank around a point.', params: [
    X, Y,
    ['degrees', 'number', 90, 'positive is counter-clockwise'],
    ['duration', 'number', 1, 'seconds'],
    AT,
  ] },
  // Tank settings
  { name: 'walls', group: 'Tank', summary: 'Hard edges: ink stays inside the tank and flattens against the walls.', params: [
    ['on', 'boolean', true, ''], AT,
  ] },
  { name: 'openWater', group: 'Tank', summary: 'Picks the physics for this script, overriding the sidebar Simulator: on is Spreading, where ink spreads over bare water until it meets other ink or reaches its spreading limit; off is Classic, with fixed-size drops that push everything, water included. Leave it out to use whatever the user has chosen.', params: [
    ['on', 'boolean', true, ''], AT,
  ] },
  { name: 'bath', engine: 'setBath', group: 'Tank', summary: 'Sets the colour of the water, which is the background. It applies straight away and is not ink, so tools do not move it.', params: [
    ['color', 'color', null, 'CSS colour or palette ink; null removes it, leaving the tank see-through in exports'],
  ] },
  // Timeline
  { name: 'inOrder', group: 'Timeline', summary: 'Each following action starts gap seconds after the previous one finishes.', params: [
    ['gap', 'number', 0.5, 'seconds'],
  ] },
  { name: 'allAtOnce', group: 'Timeline', summary: 'Following drops start together again (the default).' },
  { name: 'wait', group: 'Timeline', positional: 'seconds', summary: 'Moves the timeline on.' },
  { name: 'settle', group: 'Timeline', summary: 'Everything after this waits until every drop has stopped growing and every tool has finished. Use it before raking.' },
  // Helpers
  { name: 'random', group: 'Helpers', summary: 'Seeded random number from 0 to 1.', returns: 'number' },
  { name: 'palette', group: 'Helpers', positional: 'name', summary: 'Looks up a palette. Any ink can be passed as color, or inks as colors.', returns: '{ name, bath, inks }' },
];

export const VALUES = [
  { name: 'W', summary: 'page width, always 100' },
  { name: 'H', summary: 'page height, always 100' },
  { name: 'ASPECT', summary: "the tank's height divided by its width. A vertical distance of d % of width is d / ASPECT in y, so use it for equal spacing both ways" },
  { name: 'PALETTES', summary: 'every palette, as an array of { name, bath, inks }' },
];

const byName = new Map(COMMANDS.map((c) => [c.name, c]));
const paramsOf = (name) => byName.get(name)?.params ?? [];

// mL covering a share of the tank. The engine's final area is quantity * 1000 / film.
const mlPerPercent = ({ width, height, film }) => ((width * height) / 100) * film / 1000;

// Each unit as [page value to mm, mm to page value]; arrays and points build on these.
function units(tank) {
  const { width: W, height: H } = tank;
  const k = W / 100;
  const x = [(v) => ((v - 50) / 100) * W, (v) => (v / W) * 100 + 50];
  const y = [(v) => ((50 - v) / 100) * H, (v) => 50 - (v / H) * 100];
  const point = [([a, b]) => [x[0](a), y[0](b)], ([a, b]) => [x[1](a), y[1](b)]];
  const w = [(v) => v * k, (v) => v / k];
  const each = ([to, from]) => [(list) => list.map(to), (list) => list.map(from)];
  const flat = (pick) => (loop) => Array.from(loop, (v, i) => (i % 2 ? y : x)[pick](v));
  return {
    x, y, point, w,
    points: each(point),
    sizes: each(w),
    contours: each([flat(0), flat(1)]),
    h: [(v) => (v / 100) * H, (v) => (v / H) * 100],
    dy: [(v) => -(v / 100) * H, (v) => -(v / H) * 100],
    q: [(v) => v * mlPerPercent(tank), (v) => v / mlPerPercent(tank)],
    w2: [(v) => v * k * k, (v) => v / (k * k)],
  };
}

// Fills in defaults and converts one command's options from page units to mm.
export function toMm(name, options, tank) {
  const table = units(tank);
  const out = { ...options };
  for (const [key, , def, , unit] of paramsOf(name)) {
    if (out[key] === undefined && def !== null) out[key] = def;
    if (out[key] !== undefined && unit) out[key] = table[unit][0](out[key]);
  }
  return out;
}

const tidy = (v) => (Array.isArray(v) ? v.map(tidy) : typeof v === 'number' ? Number(v.toFixed(4)) : v);

// The reverse of toMm, for writing a session out as a script.
export function fromMm(name, args, tank) {
  const table = units(tank);
  const out = { ...args };
  for (const [key, , , , unit] of paramsOf(name)) {
    if (out[key] !== undefined && unit) out[key] = tidy(table[unit][1](out[key]));
  }
  return out;
}

// Sidebar sliders run 0 to 100 across a setting's useful range. Ranges that span a lot,
// like 0.1 to 4, are curved so that the small values get their share of the slider.
const curved = (min, max) => min > 0 && max / min >= 10;

export function dialToValue(dial, min, max) {
  const t = dial / 100;
  const v = curved(min, max) ? min * (max / min) ** t : min + (max - min) * t;
  // Enough digits that every slider position gives its own value.
  return Number(Math.min(max, Math.max(min, v)).toPrecision(4));
}

export function valueToDial(value, min, max) {
  const t = curved(min, max) ? Math.log(value / min) / Math.log(max / min) : (value - min) / (max - min);
  return Math.round(t * 100);
}

function signature(c) {
  if (c.positional) return `${c.name}(${c.positional})`;
  if (!c.params) return `${c.name}()`;
  return `${c.name}({ ${c.params.map((p) => p[0]).join(', ')} })`;
}

function paramLine([name, type, def, description]) {
  const parts = [type, def === null ? null : `default ${JSON.stringify(def)}`, description].filter(Boolean);
  return `    ${name}: ${parts.join('; ')}`;
}

// The catalogue as text for the assistant's instructions.
export function renderReference(paletteNames) {
  const lines = [];
  for (const group of ['Ink', 'Tools', 'Tank', 'Timeline', 'Helpers']) {
    lines.push(`${group}:`);
    for (const c of COMMANDS.filter((x) => x.group === group)) {
      lines.push(`  ${signature(c)}${c.returns ? ` returns ${c.returns}` : ''}: ${c.summary}`);
      for (const p of c.params || []) lines.push(paramLine(p));
    }
    lines.push('');
  }
  lines.push('Values:');
  for (const v of VALUES) lines.push(`  ${v.name}: ${v.summary}`);
  lines.push('', `Palette names: ${paletteNames.join(', ')}`);
  return lines.join('\n');
}
