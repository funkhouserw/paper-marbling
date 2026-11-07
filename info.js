// The short explanations behind each (i). A test checks every sidebar control has one.
const THICKNESS = 'How far the pull reaches. Ink nearby gets carried along, more so the higher this is, though the tine itself stays a point. Very high values drag the whole page along, so a full-width rake can push all the ink off an open tank. In Wake, more thickness stops adding direct pull fairly early.';
const TINE_WIDTH = 'The physical size of each tine. Ink bulges aside and closes up behind it, instead of being dragged. If the width is more than about twice the pull\'s reach, you only get the bulge.';
const SPEED = 'How fast the tool travels. It changes how much ink gets pulled as well as how long the stroke takes: faster reaches further. In Wake, a fast tool also leaves more movement in the bath.';
const WEAVE_SHAPE = 'The path each tooth follows as it travels. Straight goes in a line; the others swing side to side in that shape. Needs some weave height to show.';
const WEAVE_HEIGHT = 'How far each tooth swings to the side. Overlapping neighbouring teeth is fine and often the point.';
const WEAVE_LENGTH = 'How far the rake travels for one full swing of the weave. Short gives tight, busy marks.';
const REACH = 'How far each tooth pulls the colour, as a share of the gap to the next tooth. 0.5 keeps each tooth to its own lane, so one comb can\'t drag the whole sheet. Raise it to 1–1.5 for a fine comb after tall colour columns (Bouquet, Old Dutch) or for Peacock fans; past about 1 the teeth start moving the colour together like a paddle.';
const TEETH = 'How many teeth the rake has.';
const DURATION = 'How long the motion takes.';
const COLOURS = 'The inks of the current palette. Keys 1 to 9 pick them while this tool is chosen. The square at the end picks any colour.';

export const INFO = {
  // Transport
  speed: 'How fast the simulation plays compared with real time. It doesn\'t change the result. Low framerate ignores this and runs as fast as it can.',
  finish: 'Skips ahead until everything has stopped moving.',
  profiling: 'Records where the time goes while the tank runs, every 2 seconds, to profiles/marbler-profile.jsonl next to this project. It stays on this computer. It holds timings and settings, not your scripts. Leave it off when you are not measuring something.',
  gridCell: 'How finely the Grid ink simulator divides the tank, in mm. Smaller is sharper and much slower: half the size is about four times the work. Takes effect the next time the tank clears.',
  simulator: 'Which physics moves the ink. Classic: the original; drops keep a fixed size and each pushes everything. Spreading: ink grows over bare water until it meets other ink. Thin film (beta): each ink can claim a limited area, which gives even rings. Film: ink carries pressure and water doesn\'t, so drops ignore each other until they touch. Best for filling the canvas. Wake: Film in a bath that keeps moving, so ink coasts and curls after a tool stops. Try viscosity 5 to 60. Wake (fast): the same simulation as Wake, but drawn in the background, so a busy tank keeps moving and the picture catches up. Prints and exports keep every point, and metallic ink only shows at rest. Grid ink (beta): ink is colour on a grid, moved by a full fluid solve, so colours blend softly and a flow never runs out of points. It repeats unless you untick Repeating, which gives it solid sides: ink stays in and the water turns back at the edge. It runs on the GPU. Switching simulator with ink in the tank hands the ink to the new one, which carries on from there, and undo switches back. Grid ink is the exception: it can\'t take over outlines, or hand them back, so a switch to or from it waits until you clear the tank.',
  separate: 'Keep cells separate. Where the spreading fronts of two drops meet, a hairline seam stays between them, even when they are the same colour: bare bath between neighbours, the older colour round a drop that landed in it. A drop landing inside a drop of its own colour merges into it. Off, touching drops of one colour join. Classic and Spreading draw it so far; the other simulators keep the setting and will draw it soon.',
  ribbonCut: 'Thin-ink cut. While a tool moves ink, ribbons stretched thinner than half a millimetre are cut away, which keeps long sessions fast. Squeezed ink is never cut. Off, every thread stays however thin, and a heavily combed tank gets slower.',
  channel: 'Where a cell faces bare bath, how wide the channel of bare bath around it is, as a percentage of the cell\'s size: wider for big cells, as on real stone sheets. Left empty it\'s 3%; 0 keeps every seam at Seam width.',
  seam: 'How wide the bare seam between separate cells is, in mm. Left empty, the simulator picks its own.',
  walls: 'Keeps ink inside the rectangle, where it flattens against the walls. Off, ink pushed past the edge carries on out of view.',
  tile: 'Makes the tank one tile of a seamless repeat, joined at its edges like a torus: ink that leaves one side comes back in at the other. Exports join up when placed side by side. Only simulators that can repeat show this: Classic, Film, Wake and Grid ink. Grid ink starts out repeating. Turn doesn\'t work on a repeating tank. See it repeat shows four copies.',
  toolsWait: 'A rake or stir waits until all the ink has finished growing. Off, it starts straight away and catches drops mid-growth.',
  queueMode: 'What happens to things you add while paused: all start together, one after another with a gap, or each waiting for the last to settle.',
  lowFramerate: 'Shows a snapshot every 2 seconds or so instead of animating, and spends the time simulating, as fast as your computer allows. Good for heavy, beautiful runs. It switches on by itself when ticks get too slow, until the ink settles, and the status line then says "automatic". The page can feel sluggish while it works.',
  pull: 'Lays a sheet of paper across the tank, shows the print and keeps it in the Paper section.',
  // Performance
  pointLimit: 'Outlines are made of points, and stretched ink needs more of them to stay smooth. This is the most the tank will use. More keeps fine curls crisp but runs slower and uses more memory. Standard is tuned for smooth live play, and low framerate takes over when higher settings get slow. As a rough guide, each million points adds about 16 to 32 MB per copy, and undo keeps copies. Takes effect straight away.',
  // Moving bath
  flowPreset: 'How much life the bath has in the Wake simulator. Each preset also sets the viscosity. It takes effect straight away, on everything from here on, without clearing the tank. Higher settings make far more points. If the tank reaches the point limit, the bath stops so that the picture stays smooth, and a higher limit in Detail lets it run longer.',
  flowPush: 'How hard each tine shoves the water, as a multiple of normal. About 3 makes wakes roll up into whorls, and 10 is chaos.',
  flowFriction: 'Drag from the tank floor. Lower lets the water keep swirling for longer. Very thick baths add their own drag on top.',
  flowCoast: 'The longest the water keeps moving after a tool stops, whatever else is going on.',
  flowCell: 'The size of the boxes used to track how the water moves. Ink outlines stay sharp either way, but smaller boxes allow smaller curls. It matters most with high push and small tines, and halving it makes each tick about four times slower.',
  // Sections
  palette: 'A set of inks and a bath colour. Changing it recolours the swatches and the bath, not ink already in the tank.',
  myPalettes: 'Change colours and shimmer here, then type a name and press Save palette. It saves these inks with the Base colour from the top bar, and shows under My palettes. Scripts can use it with palette(\'its name\'), and you can ask the assistant to save or switch palettes too. Built-in palettes never change. Saved palettes are kept in this browser only, so clearing its site data removes them.',
  assistant: 'Describe a pattern or a change and it edits the script below. Nothing happens in the tank until you press Run.',
  myScripts: 'Scripts you\'ve kept, by name. Type a name and press Save script. Saving under a name you already used replaces that script, after asking. Choosing one opens it with the simulator it was saved on, ready to change. It doesn\'t run until you press Run, so your tank is safe. They\'re kept in this browser only, so clearing its site data removes them.',
  clearFirst: 'On, Run starts from an empty tank. Off, the script plays on top of the ink already there, starting now, and one Undo takes it all back. Its `at` times count from when it starts. Settings it changes, such as tile() or viscosity(), apply to the ink already there, and if the script fails, the tank goes back to how it was.',
  script: 'A JavaScript recipe for a whole design, so it can be repeated and shared. Positions and sizes are on a 0 to 100 page. Run plays it, clearing the tank first unless you untick that. Copy session writes what you\'ve done by hand as a script.',
  savedStates: 'Keeps the tank exactly as it is now, in this browser, to come back to later. They survive a reload, but very big tanks may not fit in the browser\'s storage.',
  tankSize: 'The tank\'s size. Physics works in millimetres, so a bigger tank makes the same drop relatively smaller. Applying clears the tank.',
  viscosity: 'How thick the bath is, from 5 (thin as water) to 20000. It starts at 1000, or 200 for Grid ink, and changing simulator moves it to the new one\'s starting value unless you\'ve typed your own. Lower generally means tines pull more. In Classic and Film, 200 pulls about five times as far and much lower can drag ink off the page. In Wake, 5 to 60 keeps the bath moving for seconds, giving curls. Changing it takes effect straight away, on everything from here on, without clearing the tank.',
  baseColour: 'A background colour under the ink. Off, an empty tank shows a faint grid, and exports have a transparent background. Print uses it as the paper colour.',
  imperfection: 'How imperfect a pull is: uneven pickup, grain, air bubbles and a hesitation line.',
  mirror: 'A real print is the tank\'s mirror image, so text reads backwards. Off, prints read the same way round as the tank.',
  pullBase: 'Pulls on paper in the tank\'s base colour, instead of the paper colour chosen here, so the print looks like the tank. It does nothing while Base colour is off.',
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
  'stripes.over': 'On top covers whatever is already in the tank. Around leaves that ink in sight, with the bands filling the rest. The bands really lie beneath it, so a rake moves both together.',
  'stripes.variation': 'How uneven the bands are. At 0 they\'re equal and cycle through the palette in order. Higher mixes wide and narrow bands in random order.',
  'stripes.wobble': 'How far the bands wander. At 0 they\'re dead straight.',
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
  'tool.fillDots': 'Packs the tank with dots of many sizes, biggest holes first, each in the palette\'s inks with neighbours avoiding a match. It goes around ink already there unless you tell it to go on top. Press it again to fill what\'s left.',
  'tool.erase': 'Takes ink away, either letting the surface close over the hole or leaving bare water. Not available in Grid ink yet.',
  'fillDots.count': 'The most dots it will place. It stops sooner if no hole is left that\'s big enough.',
  'fillDots.min': 'The smallest dot it will place. Lower it to fill the little gaps between the big dots.',
  'fillDots.max': 'The largest dot, which goes in the biggest hole first.',
  'fillDots.gap': 'Clear space kept between dots. They spread and touch less with more of it.',
  'fillDots.tightness': 'How fully a dot fills its hole. Lower varies the sizes more, and higher packs them closer.',
  'fillDots.rings': 'Colours stacked in each dot, like a target. Each layer waits for the one before to settle.',
  'fillDots.sprayColors': 'Use every ink in the palette, or just the one chosen above.',
  'fillDots.over': 'Dots normally go in the open space around ink already there. On top lets them land anywhere.',
  'erase.mode': 'Ink and water drains everything inside the circle to its centre, and the surface around slides in to close the hole. Just the ink cuts the ink out at once and leaves bare water, with everything else staying where it is.',
  'erase.radius': 'How much ink it takes away. The area lost is exactly this circle\'s.',
  'erase.duration': 'How long the ink takes to drain and the surface to close. Just the ink happens at once.',
  'tileOffset': 'How the repeat lines up. None stacks the tiles straight. Brick shifts each row of tiles by half a tile, like a brick wall, and half-drop shifts each column, like a lot of printed wallpaper. See it repeat shows the result. Not in Grid ink yet.',
  'tool.vortex': 'A swirl that spins up around a point and fades with distance.',
  gall: 'Ox gall for the whole bath, as a marbler adds a little more with each colour. Each new colour gets more than the last, so it opens over the earlier ones and pushes them into veins. A drop with no more gall than the ink it lands on stays a small dot. Clearing the tank starts the count again.',
  gallStart: 'Gall for the first colour. 1 spreads as drops do with gall off.',
  gallMost: 'How far the strongest gall can spread a drop on clear water, as times its plain size. 7 is the usual; 15 to 25 opens clear-water veins wider and thins them towards hairlines.',
  gallStep: 'How much more gall each later colour gets. 0 keeps it the same, so later colours stay dots wherever they land on ink.',
  'drop.oil': 'Oil in the colour makes a Shell: the drop lands as rings, darker in the middle and paler at the edge, because the oil runs out ahead of the pigment. 0.75 matches a walnut-oil shell. Below 0 the middle is pale instead.',
  'drop.bands': 'How many rings a Shell drop is made of. More look smoother but cost more points.',
  'drop.turpentine': 'Turpentine in the colour makes a Stormont: as the drop spreads it breaks into a lace of holes, mostly tiny, with the bare bath showing through. More turpentine, more and finer holes. Only this colour gets holes.',
  'drop.evaporation': 'As the turpentine evaporates the holes partly close again, over this many seconds. 0 leaves them open.',
  'drop.gall': 'This drop\'s own ox gall, instead of the bath\'s. More spreads further, and opens over weaker ink.',
  'spray.gall': 'Ox gall for these dots, instead of the bath\'s.',
  'fillDots.gall': 'Ox gall for these dots, instead of the bath\'s.',
  'drop.quantity': 'How much ink, and so how big the drop ends up. Alone on clear water a drop reaches the same size on every simulator; in Film, Wake and Spreading one landing on ink stays smaller.',
  'drop.dispersion': 'How quickly a drop reaches its full size. It doesn\'t change the final size.',
  'drop.count': 'How many drops each click places, using Scatter to spread them.',
  'drop.scatter': 'How far from your click the drops can land.',
  'spray.sprayColors': 'Use every ink in the palette at random, or only the chosen one.',
  'spray.n': 'How many dots each burst makes. Dragging adds bursts as you go.',
  'spray.radius': 'How wide the burst is.',
  'spray.smallest': 'The tiniest dots, as a percentage of the largest: 100 makes every dot the same size, 5 gives fine dust among them.',
  'spray.max': 'The size of the largest dots.',
  'spray.sizes': 'The mix of sizes between the smallest and largest: mostly small (fine spatter with a few big drops), an even mix, or mostly big.',
  'text.size': 'The height of the letters.',
  'rake.waveShape': WEAVE_SHAPE,
  'tool.drawnRake': 'A whole rake dragged freehand, like the stylus but with all its teeth. The teeth keep the line your first movement sets: start moving east and they stay lined up north to south however the stroke curves, so every tine bends the same way. Drag east and then curve south to fan the colours into feather plumes.',
  'drawnRake.teeth': TEETH,
  'drawnRake.spacing': 'The gap between neighbouring teeth.',
  'drawnRake.speed': SPEED,
  'drawnRake.D': THICKNESS,
  'drawnRake.width': TINE_WIDTH,
  'tool.broom': 'A flick of a broom-straw brush, the way stone and vein marbling is thrown: many drops of the colour landing at once, a few large and many small, scattered over the reach. Throw colour after colour; each new colour opens inside the last and squeezes it into veins, more so with rising ox gall.',
  'broom.count': 'How many drops one flick throws.',
  'broom.quantity': 'How much colour one flick carries in all, shared out among its drops by size.',
  'broom.scatter': 'How far around the click the drops land.',
  'broom.spreading': 'How many times its landing size each drop can grow on open water before it meets other ink. Lower keeps the cells small and leaves more bare bath, higher lets one flick cover more. 12 gives distinct cells in the pressure simulators; Classic looks closest to a broom-straw sheet nearer 16 to 25.',
  'broom.variation': 'How unequal the drops are: 0 makes them all the same, higher gives a few large drops among many small ones.',
  'broom.gall': 'Ox gall for this flick. Bath uses the bath\'s rising gall, if it\'s on.',
  'rake.teeth': TEETH,
  'rake.spacing': 'The gap between neighbouring teeth.',
  'rake.reach': REACH,
  'fullRake.reach': REACH,
  'drawnRake.reach': REACH,
  'rake.speed': SPEED,
  'rake.D': THICKNESS,
  'rake.width': TINE_WIDTH,
  'rake.waveAmp': WEAVE_HEIGHT,
  'rake.waveLength': WEAVE_LENGTH,
  'fullRake.waveShape': WEAVE_SHAPE,
  'fullRake.angle': 'The direction the rake travels: 0 is right, 90 up, 180 left, 270 down, and anything between runs at a slant. The arrows above jump to those four. On a repeating tank it runs at the nearest angle where the teeth join back up with themselves, and says so.',
  'tool.hearts': 'Heart strike. Bends every dot that is already round into a heart of the same size, pointing the way you choose. The rings of a target bend together and stay nested; odd shapes and frozen ink are left alone. The dashed outlines show what each dot becomes. The Drag a tine style is the older way: one small tine through the middle of each dot. Not available in Grid ink.',
  'hearts.style': 'Bend turns each round dot straight into a clean heart. Drag a tine pulls one small tine through it, as a marbler would, which leaves the marks of the pull.',
  'hearts.variation': 'For Bend: how much each heart differs from the next. 0 makes them all the same.',
  'tool.heartDrop': 'Places a heart of ink with a fine point. It lands whole, pushing the ink round it aside as a drop would, then keeps its shape and point until a tool moves it.',
  'heartDrop.quantity': 'How much ink, and so how big the heart is: the same area a lone drop of this size spreads to.',
  'heartDrop.angle': 'Which way the point faces: 0 is down, 90 right, 180 up.',
  'heartDrop.variation': 'How much each heart differs from the plain one, so a row of them looks hand-made. 0 makes them all the same.',
  'hearts.angle': 'The way the strike goes, which is the way the points face. 270 is down.',
  'hearts.above': 'For Drag a tine: where each tine starts, measured from the middle of its dot: 0 is the middle, 100 is the edge, and more is outside the dot.',
  'hearts.below': 'For Drag a tine: where each tine ends, measured the same way. Going past the edge draws out the point.',
  'hearts.pull': 'For Drag a tine: how widely each tine pulls, as a percentage of its own dot\'s radius, so big and small dots get the same shape.',
  'hearts.min': 'Dots smaller than this are left alone. The dashed outlines show which dots it will change.',
  'hearts.max': 'Dots larger than this are left alone. All the way up reaches even a dot as big as the tank.',
  'hearts.speed': 'For Drag a tine: how fast the tines travel. Small dots finish first.',
  freeze: 'Holds chosen ink still, like a mask. Choose Freeze and click any ink, or Unfreeze and click it to let it go, and Clear all to let everything go. Frozen ink shows in red while Full rake is open, and with a dashed outline in other tools. Nothing moves it, whichever tool you use, and raked ink passes underneath it. Not available in Grid ink.',
  'fullRake.teeth': `${TEETH} They spread evenly across the page.`,
  'fullRake.offset': 'Slides all the teeth sideways, wrapping at the edges. A second pass with half a tooth\'s offset lands between the first pass\'s lines.',
  'fullRake.speed': SPEED,
  'fullRake.overhang': 'How far past the edges the teeth start and stop. Auto uses none on a repeating tank, where anything past one edge would be raked a second time at the other, and 2% of the width otherwise. Try values here to compare how the seam looks.',
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
