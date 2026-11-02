// The short explanations behind each (i). A test checks every sidebar control has one.
const THICKNESS = 'How far the pull reaches. Ink nearby gets carried along, more so the higher this is, though the tine itself stays a point. Very high values drag the whole page along, so a full-width rake can push all the ink off an open tank. In Wake, more thickness stops adding direct pull fairly early.';
const TINE_WIDTH = 'The physical size of each tine. Ink bulges aside and closes up behind it, instead of being dragged. If the width is more than about twice the pull\'s reach, you only get the bulge.';
const SPEED = 'How fast the tool travels. It changes how much ink gets pulled as well as how long the stroke takes: faster reaches further. In Wake, a fast tool also leaves more movement in the bath.';
const WEAVE_SHAPE = 'The path each tooth follows as it travels. Straight goes in a line; the others swing side to side in that shape. Needs some weave height to show.';
const WEAVE_HEIGHT = 'How far each tooth swings to the side. Overlapping neighbouring teeth is fine and often the point.';
const WEAVE_LENGTH = 'How far the rake travels for one full swing of the weave. Short gives tight, busy marks.';
const TEETH = 'How many teeth the rake has.';
const DURATION = 'How long the motion takes.';
const COLOURS = 'The inks of the current palette. Keys 1 to 9 pick them while this tool is chosen. The square at the end picks any colour.';

export const INFO = {
  // Transport
  speed: 'How fast the simulation plays compared with real time. It doesn\'t change the result. Low framerate ignores this and runs as fast as it can.',
  finish: 'Skips ahead until everything has stopped moving.',
  simulator: 'Which physics moves the ink. Classic: the original; drops keep a fixed size and each pushes everything. Spreading: ink grows over bare water until it meets other ink. Thin film (beta): each ink can claim a limited area, which gives even rings. Film: ink carries pressure and water doesn\'t, so drops ignore each other until they touch. Best for filling the canvas. Wake: Film in a bath that keeps moving, so ink coasts and curls after a tool stops. Try viscosity 5 to 60.',
  walls: 'Keeps ink inside the rectangle, where it flattens against the walls. Off, ink pushed past the edge carries on out of view.',
  tile: 'Makes the tank one tile of a seamless repeat, joined at its edges like a torus: ink that leaves one side comes back in at the other. Exports join up when placed side by side. Only simulators that can repeat show this. See it repeat shows four copies.',
  toolsWait: 'A rake or stir waits until all the ink has finished growing. Off, it starts straight away and catches drops mid-growth.',
  queueMode: 'What happens to things you add while paused: all start together, one after another with a gap, or each waiting for the last to settle.',
  lowFramerate: 'Shows a snapshot every 2 seconds or so instead of animating, and spends the time simulating, as fast as your computer allows. Good for heavy, beautiful runs. It switches on by itself when ticks get too slow, until the ink settles, and the status line then says "automatic". The page can feel sluggish while it works.',
  pull: 'Lays a sheet of paper across the tank, shows the print and keeps it in the Paper section.',
  // Performance
  pointLimit: 'Outlines are made of points, and stretched ink needs more of them to stay smooth. This is the most the tank will use. More keeps fine curls crisp but runs slower and uses more memory. Standard is tuned for smooth live play, and low framerate takes over when higher settings get slow. As a rough guide, each million points adds about 16 to 32 MB per copy, and undo keeps copies. Takes effect straight away.',
  // Moving bath
  flowPreset: 'How much life the bath has in the Wake simulator. Each preset also sets the viscosity. It takes effect straight away, on everything from here on, without clearing the tank. Higher settings make far more points, so low framerate and a higher point limit help.',
  flowPush: 'How hard each tine shoves the water, as a multiple of normal. About 3 makes wakes roll up into whorls, and 10 is chaos.',
  flowFriction: 'Drag from the tank floor. Lower lets the water keep swirling for longer. Very thick baths add their own drag on top.',
  flowCoast: 'The longest the water keeps moving after a tool stops, whatever else is going on.',
  flowCell: 'The size of the boxes used to track how the water moves. Ink outlines stay sharp either way, but smaller boxes allow smaller curls. It matters most with high push and small tines, and halving it makes each tick about four times slower.',
  // Sections
  palette: 'A set of inks and a bath colour. Changing it recolours the swatches and the bath, not ink already in the tank.',
  assistant: 'Describe a pattern or a change and it edits the script below. Nothing happens in the tank until you press Run.',
  script: 'A JavaScript recipe for a whole design, so it can be repeated and shared. Positions and sizes are on a 0 to 100 page. Run clears the tank and plays it. Copy session writes what you\'ve done by hand as a script.',
  savedStates: 'Keeps the tank exactly as it is now, in this browser, to come back to later. They survive a reload, but very big tanks may not fit in the browser\'s storage.',
  tankSize: 'The tank\'s size. Physics works in millimetres, so a bigger tank makes the same drop relatively smaller. Applying clears the tank.',
  viscosity: 'How thick the bath is, from 5 (thin as water) to 20000; 1000 is the default. Lower generally means tines pull more. In Classic and Film, 200 is a good step and much lower can drag ink off the page. In Wake, 5 to 60 keeps the bath moving for seconds, giving curls. Applying clears the tank; a script can set it with viscosity() instead.',
  baseColour: 'A background colour under the ink. Off, an empty tank shows a faint grid, and exports have a transparent background. Print uses it as the paper colour.',
  imperfection: 'How imperfect a pull is: uneven pickup, grain, air bubbles and a hesitation line.',
  mirror: 'A real print is the tank\'s mirror image, so text reads backwards. Off, prints read the same way round as the tank.',
  clearAfter: 'Empties the tank once the paper has covered it.',
  autoSave: 'Downloads a PNG of each pull as well as keeping it in this browser.',
  exportButtons: 'PNG: exactly what the tank shows. SVG: scalable shapes in flat colour, without shimmer. Print: a slow 3000 pixel picture on paper with smooth curves. None of these change the tank.',
  printPale: 'Ink that spread further is a thinner layer, so it tints the paper less. It\'s a guess at real ink, kept subtle. Print only.',
  printTexture: 'Slightly deeper edges and uneven pigment. An artistic touch, not simulated. Print only.',
  printSoft: 'Lets inks bleed into each other in soft patches, so some edges stay crisp and others go hazy. It\'s a painterly effect added when printing, not simulated, and only Print shows it.',
  // Colour
  'color.swatches': COLOURS,
  'color.alpha': 'How see-through the ink is. Overlaps between translucent inks can show seams in Film.',
  'color.shimmer': 'Makes the ink metallic, with a moving glint. PNG and pulls include it; SVG and Print don\'t.',
  // Tools
  'tool.drop': 'A drop of ink on the surface. How it spreads and what it pushes depends on the simulator.',
  'tool.spray': 'A burst of very fine dots, mostly tiny and thickest in the middle, like flicking a brush.',
  'tool.text': 'Prints letters as ink. They don\'t expand, but every later tool moves them, so they marble with everything else.',
  'tool.paint': 'A brush for laying lines of ink. Unlike a drop it doesn\'t expand or push anything; it sits on top, then moves with everything else once you rake or stir.',
  'tool.stripes': 'Covers the tank in bands of colour, the starting point for chevrons and bouquet patterns. Rake across the bands with Full rake, then back the other way with an offset. It adds to the tank rather than clearing it. The arrows set which way the bands run.',
  'paint.width': 'How wide the line is.',
  'paint.taper': 'At 0 the line keeps its width. At 1 it narrows to a point at both ends, like a brush lifting.',
  'paint.wobble': 'How far the line wanders from where you drew it, so it looks less mechanical.',
  'stripes.count': 'How many bands. Many thin bands make fine, busy patterns once raked.',
  'stripes.variation': 'How uneven the bands are. At 0 they\'re equal and cycle through the palette in order. Higher mixes wide and narrow bands in random order.',
  'stripes.wobble': 'How far the bands wander. At 0 each band picks a little to suit its width.',
  'stripes.slivers': 'Thin tapered streaks of another colour added per band, which make bands look hand-laid once combed.',
  'tool.rake': 'A comb you drag by hand. Each tooth pulls ink along its path, which makes feathers and chevrons.',
  'tool.fullRake': 'A comb across the whole page, for exact, repeatable passes. Two passes in opposite directions with an offset give classic combed patterns.',
  'tool.stylus': 'A single tine that follows your hand, for drawing.',
  'tool.jiggle': 'Shakes the whole tank in a wave, so straight lines become wavy.',
  'tool.wriggle': 'Twists rings around a centre back and forth, leaving a rippled, turbulent look, especially in Wake.',
  'tool.stir': 'Circular tines turning around a centre, which winds ink into spirals.',
  'tool.air': 'A breath of air over the whole bath: a smooth random flow that stretches and swirls the ink without changing its area. Scripts can pass a seed to repeat the same breath. In Wake it also sets the bath moving.',
  'air.scale': 'How big the swirls are. A second breath at a smaller size adds fine turbulence on top.',
  'air.speed': 'How fast the air moves the ink, and so how far the ink gets pushed.',
  'air.octaves': 'How many layers of smaller swirls are added to the main ones.',
  'air.duration': DURATION,
  'tool.vortex': 'A swirl that spins up around a point and fades with distance.',
  'drop.quantity': 'How much ink, and so how big the drop ends up. In Film and Spreading, a drop on open water grows further than one landing on ink.',
  'drop.dispersion': 'How quickly a drop reaches its full size. It doesn\'t change the final size.',
  'drop.count': 'How many drops each click places, using Scatter to spread them.',
  'drop.scatter': 'How far from your click the drops can land.',
  'spray.sprayColors': 'Use every ink in the palette at random, or only the chosen one.',
  'spray.n': 'How many dots each burst makes. Dragging adds bursts as you go.',
  'spray.radius': 'How wide the burst is.',
  'spray.min': 'The size of the tiniest dots.',
  'spray.max': 'The size of the largest dots. Most dots stay close to the smallest size.',
  'text.size': 'The height of the letters.',
  'rake.waveShape': WEAVE_SHAPE,
  'rake.teeth': TEETH,
  'rake.spacing': 'The gap between neighbouring teeth.',
  'rake.speed': SPEED,
  'rake.D': THICKNESS,
  'rake.width': TINE_WIDTH,
  'rake.waveAmp': WEAVE_HEIGHT,
  'rake.waveLength': WEAVE_LENGTH,
  'fullRake.waveShape': WEAVE_SHAPE,
  'fullRake.teeth': `${TEETH} They spread evenly across the page.`,
  'fullRake.offset': 'Slides all the teeth sideways, wrapping at the edges. A second pass with half a tooth\'s offset lands between the first pass\'s lines.',
  'fullRake.speed': SPEED,
  'fullRake.D': THICKNESS,
  'fullRake.width': TINE_WIDTH,
  'fullRake.waveAmp': WEAVE_HEIGHT,
  'fullRake.waveLength': WEAVE_LENGTH,
  'stylus.speed': SPEED,
  'stylus.D': THICKNESS,
  'stylus.width': TINE_WIDTH,
  'jiggle.angle': 'The direction the wave travels in.',
  'jiggle.period': 'The distance from one wave crest to the next.',
  'jiggle.amplitude': 'How far the ink moves to each side.',
  'jiggle.duration': DURATION,
  'wriggle.direction': 'Which way the rings turn first.',
  'wriggle.period': 'The distance between rings that twist in opposite directions.',
  'wriggle.degrees': 'How far each ring twists.',
  'wriggle.duration': DURATION,
  'stir.direction': 'The way the rings turn. Alternating gives each ring the opposite direction to the last.',
  'stir.rings': 'How many circular tines there are.',
  'stir.ringSpacing': 'The gap between the rings.',
  'stir.degrees': 'How far the rings turn in total.',
  'stir.rate': 'How fast the rings turn.',
  'stir.D': 'How far each ring\'s pull reaches.',
  'vortex.direction': 'Which way it spins.',
  'vortex.circulation': 'How strongly it spins. Ink nearest the centre moves most.',
  'vortex.duration': DURATION,
};

let tip = null;
let pinned = null;

function hideTip() {
  pinned = null;
  if (tip) tip.hidden = true;
}

function showTip(icon, text) {
  if (!tip) {
    tip = Object.assign(document.createElement('div'), { id: 'infoTip', hidden: true });
    tip.setAttribute('role', 'tooltip');
    document.body.append(tip);
    document.addEventListener('pointerdown', (ev) => { if (!ev.target.closest?.('.info')) hideTip(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hideTip(); });
  }
  tip.textContent = text;
  tip.hidden = false;
  const r = icon.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const left = Math.max(8, Math.min(innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2));
  const below = r.bottom + 6;
  tip.style.left = `${left}px`;
  tip.style.top = `${below + t.height > innerHeight - 8 ? Math.max(8, r.top - t.height - 6) : below}px`;
}

// A small (i) that explains on hover, and stays open when clicked. It sits inside labels and
// section headings, so it must not trigger them.
export function infoIcon(key) {
  const text = INFO[key];
  if (!text) throw new Error(`No explanation for ${key}`);
  const icon = Object.assign(document.createElement('span'), { className: 'info', textContent: 'i', tabIndex: 0 });
  icon.setAttribute('role', 'button');
  icon.setAttribute('aria-label', text);
  const toggle = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (pinned === icon) { hideTip(); return; }
    pinned = icon;
    showTip(icon, text);
  };
  icon.addEventListener('click', toggle);
  icon.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') toggle(ev);
  });
  icon.addEventListener('pointerenter', () => { if (!pinned) showTip(icon, text); });
  icon.addEventListener('pointerleave', () => { if (!pinned) hideTip(); });
  return icon;
}

// Puts the (i) straight after an element's own words, wherever its control sits.
export function addInfo(el, key) {
  el.removeAttribute('title');
  el.closest('[title]')?.removeAttribute('title');
  const words = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
  const icon = infoIcon(key);
  if (words) words.after(icon);
  else el.append(icon);
  return icon;
}
