// Example scripts for the Examples menu. Some only look right on one simulator, so choosing them chooses it too.
export const EXAMPLES = {
  'Lapis bullseyes': `// Drops stacked on one spot in order, each pushing the last outward.
viscosity({ value: 1000 });
const inks = palette('Lapis & Gilt').inks;
const spots = [[16, 25.7], [44, 72.9], [73, 24.3], [93, 74.3], [7, 80]];
inOrder({ gap: 0.4 });
for (const [x, y] of spots) {
  for (let i = 0; i < 8; i++) {
    // Each later drop lands in ink, so it keeps its plain size (spreading 1) on any simulator.
    drop({ x, y, quantity: 3.1, dispersion: 2, spreading: i ? 1 : 4, color: inks[i % inks.length] });
  }
}
allAtOnce();
settle();
wait(0.5);
fullRake({ angle: 0, teeth: 6, speed: 22, D: 0.8 });
settle();
fullRake({ angle: 180, teeth: 6, offset: 5.8, speed: 22, D: 0.8 });
`,
  'Blue & gold feather': `// Rows of alternating bullseyes, combed one way and back, then feathered.
viscosity({ value: 1000 });
const inks = palette('Lapis & Gilt').inks;
allAtOnce();
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 6; c++) {
    const x = 10 + c * 16 + (r % 2) * 8;
    const y = 86.4 - r * 24.3;
    drop({ x, y, quantity: 1.6, dispersion: 1.8, color: inks[(r + c) % 2 ? 0 : 1] });
  }
}
settle();
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 6; c++) {
    const x = 10 + c * 16 + (r % 2) * 8;
    const y = 86.4 - r * 24.3;
    drop({ x, y, quantity: 1.9, dispersion: 2.5, spreading: 1, color: inks[4] }); // lands in ink
  }
}
settle();
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 6; c++) {
    const x = 10 + c * 16 + (r % 2) * 8;
    const y = 86.4 - r * 24.3;
    drop({ x, y, quantity: 0.6, dispersion: 2.5, spreading: 1, color: inks[3] });
  }
}
settle();
fullRake({ angle: 90, teeth: 8, speed: 24, D: 0.7 });
settle();
fullRake({ angle: 270, teeth: 8, offset: 6.2, speed: 24, D: 0.7 });
settle();
fullRake({ angle: 0, teeth: 30, speed: 32, D: 0.4 });
`,
  'Emerald peacock': `// Emerald and gold, combed both ways with a fine weaving rake.
viscosity({ value: 1000 });
const inks = palette('Emerald & Gold').inks;
for (let i = 0; i < 40; i++) {
  drop({ x: 5 + (i % 8) * 12.8, y: 90 - Math.floor(i / 8) * 20,
         quantity: 1.7, dispersion: 1.6, spreading: 2, color: inks[(i * 3) % inks.length] }); // spreading 2 keeps Classic's gaps
}
settle();
fullRake({ angle: 90, teeth: 10, speed: 24, D: 0.7 });
settle();
fullRake({ angle: 270, teeth: 10, offset: 5, speed: 24, D: 0.7 });
settle();
fullRake({ angle: 0, teeth: 16, speed: 26, D: 0.6, waveAmp: 2.2, waveLength: 9 });
`,
  'Gilded stone': `// A thick scatter of dark inks, then fine gold spatter over the top.
viscosity({ value: 1000 });
const dark = palette('Dark Academia').inks;
drops({ n: 90, quantity: 1.4, spread: 0.6, stagger: 2.5, dispersion: 1.4, spreading: 2, colors: dark.slice(0, 5) }); // crowded, so 2 is as far as they get
settle();
wait(0.5);
drops({ n: 70, quantity: 0.07, spread: 0.7, stagger: 2, dispersion: 2, spreading: 1, colors: [dark[5]] }); // lands on ink
`,
  'Oxblood whirl': `// Rings poured in order at the centre, then stirred in opposite directions.
viscosity({ value: 1000 });
const inks = palette('Oxblood & Gilt').inks;
inOrder({ gap: 0.35 });
for (let i = 0; i < 18; i++) {
  // Each later drop lands in ink, so it keeps its plain size (spreading 1) on any simulator.
  drop({ x: 50, y: 50, quantity: 12.9, dispersion: 2.5, spreading: i ? 1 : 4, color: inks[i % inks.length] });
}
allAtOnce();
settle();
stir({ radii: [7, -13, 19, -25], degrees: 120, rate: 60, D: 4 });
settle();
wriggle({ period: 12, degrees: 12, duration: 2 });
`,
  'Library endpaper': `// Printed text settled onto a marbled sheet, then gently combed with it.
viscosity({ value: 1000 });
const inks = palette('Ravenwood Library').inks;
for (let i = 0; i < 48; i++) {
  drop({ x: 5 + (i % 8) * 12.8 + (Math.floor(i / 8) % 2) * 6.4, y: 91.4 - Math.floor(i / 8) * 16.6,
         quantity: 1.3, dispersion: 1.8, spreading: 2, color: inks[i % inks.length] }); // spreading 2 keeps Classic's rows
}
settle();
fullRake({ angle: 0, teeth: 7, speed: 24, D: 0.7 });
settle();
text({ string: 'Ex Libris', font: 'serif', size: 17, color: '#f2e8d5' });
wait(1);
fullRake({ angle: 90, teeth: 9, speed: 9, D: 0.3 });
`,
  'Dot garden': `// Big dots first, small ones tucked into the gaps.
viscosity({ value: 1000 });
const p = palette('Old Dutch');
fillDots({ count: 220, min: 0.8, max: 9, colors: p.inks.slice(0, 4) });
settle();
`,
  'Bead field': `// Dots of stacked rings, each layer settling before the next.
viscosity({ value: 1000 });
fillDots({ count: 60, min: 1.5, max: 10, gap: 0.8, rings: 3, colors: palette('Copper & Verdigris').inks });
settle();
`,
  'Chevrons': `// Bands of colour combed one way, then back between the first lines.
viscosity({ value: 1000 });
const inks = palette('Old Dutch').inks;
stripes({ count: 30, colors: inks, slivers: 1 });
fullRake({ angle: 90, teeth: 8, speed: 24, D: 0.7 });
fullRake({ angle: 270, teeth: 8, offset: 6.25, speed: 24, D: 0.7 });
fullRake({ angle: 0, teeth: 40, speed: 30, D: 0.3 });`,
  'Ribbons': `// Stripes combed back and forth with a few wide teeth, until they stretch into ribbons.
viscosity({ value: 1000 });
const inks = ['#b5302a', '#2a4a8a', '#c8d8c0', '#7fa8b0', '#d07080', '#203070'];
bath({ color: '#c8d8c0' });
stripes({ count: 40, colors: inks, slivers: 1.5, variation: 0.8 });
for (let i = 0; i < 3; i++) {
  fullRake({ angle: 90, teeth: 4, speed: 40, D: 2 });
  fullRake({ angle: 270, teeth: 4, offset: 12.5, speed: 40, D: 2 });
}`,
  'Big waves': `// One slow, very wide pass each way bends stripes into broad waves.
viscosity({ value: 1000 });
const inks = ['#b5302a', '#2a4a8a', '#c8d8c0', '#7fa8b0', '#d07080', '#203070'];
bath({ color: '#c8d8c0' });
stripes({ count: 40, colors: inks, slivers: 1.5, variation: 0.8 });
fullRake({ angle: 90, teeth: 3, speed: 60, D: 3 });
fullRake({ angle: 270, teeth: 3, offset: 16.7, speed: 60, D: 3 });`,
  'Flames': `// Wide combing up and down, twice, draws stripes out into flames.
viscosity({ value: 1000 });
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
bath({ color: '#f7e1b5' });
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
for (let i = 0; i < 2; i++) {
  fullRake({ angle: 90, teeth: 7, speed: 30, D: 1.4 });
  fullRake({ angle: 270, teeth: 7, offset: 7.14, speed: 30, D: 1.4 });
}`,
  'Two-way feathers': `// Combed up and down, across, then up and down again, so the feathers point both ways.
viscosity({ value: 1000 });
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
bath({ color: '#f7e1b5' });
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
fullRake({ angle: 90, teeth: 6, speed: 30, D: 1 });
fullRake({ angle: 270, teeth: 6, offset: 8.33, speed: 30, D: 1 });
fullRake({ angle: 0, teeth: 24, speed: 30, D: 0.5 });
fullRake({ angle: 90, teeth: 6, speed: 20, D: 0.8 });
fullRake({ angle: 270, teeth: 6, offset: 8.33, speed: 20, D: 0.8 });`,
  'Whorls': `// In a thin bath with a strong push, the wake behind each tine rolls up into spirals.
viscosity({ value: 10 });
flow({ friction: 0.05, coast: 120, push: 3 });
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
bath({ color: '#f7e1b5' });
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
settle();
fullRake({ angle: 0, teeth: 5, speed: 30 });
settle();`,
  'Repeating whorls': `// Whorls on a repeating tank: swirls roll across the seams. Press See it repeat to check.
tile();
viscosity({ value: 10 });
flow({ friction: 0.05, coast: 120, push: 3 });
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
bath({ color: '#f7e1b5' });
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
settle();
fullRake({ angle: 0, teeth: 5, speed: 30 });
settle();`,
  'Grid ink spirals': `// Spirals in soft, blended colour. Runs for minutes on the grid ink simulator.
viscosity({ value: 10 });
flow({ friction: 0.05, coast: 40, push: 3 });
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
bath({ color: '#f7e1b5' });
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
settle();
air({ scale: 20, speed: 8 });
settle();`,
  'Storm': `// Two strong passes leave a swirling storm. A higher point limit in Detail lets it run longer.
viscosity({ value: 10 });
flow({ friction: 0.05, coast: 40, push: 3 });
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
bath({ color: '#f7e1b5' });
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
settle();
fullRake({ angle: 90, teeth: 5, speed: 30, D: 1 });
fullRake({ angle: 270, teeth: 5, offset: 10, speed: 30, D: 1 });
settle();`,
  'Italian marble': `// One breath of air over stripes, with no comb at all.
viscosity({ value: 1000 });
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
bath({ color: '#f7e1b5' });
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
air({ scale: 20, speed: 8 });`,
  'Spiral field': `// A breath of air in a whorling bath fills the page with spirals. Heavy: it makes a lot of points.
viscosity({ value: 10 });
flow({ friction: 0.05, coast: 40, push: 3 });
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
bath({ color: '#f7e1b5' });
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
settle();
air({ scale: 20, speed: 8 });
settle();`,
  'Seamless wallpaper': `// One tile of a repeating pattern. Press See it repeat to check it joins up.
viscosity({ value: 1000 });
tile();
const inks = ['#d9485f', '#f2a65a', '#f7e1b5', '#3d5a80', '#7fb7be', '#6a2c70', '#2b2d42'];
stripes({ count: 30, colors: inks, slivers: 0.5, variation: 0.7 });
fullRake({ angle: 90, teeth: 6, speed: 30, D: 1 });
fullRake({ angle: 270, teeth: 6, offset: 8.33, speed: 30, D: 1 });
fullRake({ angle: 0, teeth: 24, speed: 30, D: 0.5 });
air({ scale: 25, speed: 6 });`,
  'Starry spray': `// Dark dots with fine metallic spray over the top.
viscosity({ value: 1000 });
const p = palette('Lapis & Gilt');
bath({ color: p.bath });
fillDots({ count: 40, min: 2, max: 12, gap: 1, colors: p.inks.slice(0, 3) });
settle();
spray({ x: 30, y: 40, radius: 40, n: 300, colors: [p.inks[4]] });
spray({ x: 70, y: 65, radius: 40, n: 300, colors: [p.inks[3], p.inks[4]] });
settle();
`,
  'Wave comb': `// A traced surf wave as the rake's path. Try it on any simulator.
viscosity({ value: 1000 });
const p = palette('Old Dutch');
for (let i = 0; i < 8; i++) {
  for (let j = 0; j < 11; j++) drop({ x: 4 + j * 9.2, y: 6 + i * 12.5, quantity: 1.6, spreading: 1, color: p.inks[i % 4] }); // close packed: they meet at their plain size
}
settle();
fullRake({ angle: 0, teeth: 5, speed: 25, D: 1, waveAmp: 5, waveLength: 18, waveShape: 'wave' });
`,
  'Verdigris waves': `// Copper and verdigris bands, shaken into waves.
viscosity({ value: 1000 });
const inks = palette('Copper & Verdigris').inks;
for (let r = 0; r < 7; r++) {
  for (let c = 0; c < 9; c++) {
    drop({ x: 6 + c * 11, y: 92.9 - r * 14.3, quantity: 1.1, dispersion: 1.8, spreading: 2, // keeps Classic's gaps
           color: inks[r % inks.length] });
  }
}
settle();
jiggle({ angle: 0, period: 21, amplitude: 4.5, duration: 2 });
settle();
fullRake({ angle: 0, teeth: 14, speed: 28, D: 0.5 });
`,
  'Italian vein': `// Italian vein (Classic): a full ground of four vein colours, then clear gall-water beaten on
// in three passes. Each clear drop carries more gall than the ground (spreading 4 against 1),
// so it opens and squeezes the colours into veins between the clear cells. Passes interleave on a
// jittered grid, settling in between, so the cells come out even instead of bursting outwards.
// The clear is real gall water: it cuts holes showing the bath, so it's never tinted.
viscosity({ value: 1000 });
const water = '#f3eee0';
bath({ color: water });
const inks = palette('Old Dutch').inks;
const veins = [inks[0], inks[1], inks[2], inks[3]];
for (let r = 0; r < 9; r++) for (let c = 0; c < 12; c++) drop({ x: (c + 0.5 + (random() - 0.5) * 0.8) * 100 / 12, y: (r + 0.5 + (random() - 0.5) * 0.8) * 100 / 9, quantity: 1.0, spreading: 1, color: veins[Math.floor(random() * veins.length)] });
settle();
const cols = 22, rows = 15, passes = 3;
const cells = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
for (let p = 0; p < passes; p++) {
  cells.forEach(([c, r], i) => {
    if ((i + r) % passes !== p) return;
    drop({ x: (c + 0.5 + (random() - 0.5) * 0.6) * 100 / cols, y: (r + 0.5 + (random() - 0.5) * 0.6) * 100 / rows,
           quantity: 0.30, spreading: 4, color: 'clear' }); // real gall water: holes, never tinted
  });
  settle();
}
`,
  'Hair-vein': `// Hair-vein (Film, Wake): a thin ground that spreads to cover the bath, then a stronger throw of
// finer clear gall-water. Less colour, not more clear, is what thins the veins. Beaten on
// in three passes. Each clear drop carries more gall than the ground (spreading 4 against 1),
// so it opens and squeezes the colours into veins between the clear cells. Passes interleave on a
// jittered grid, settling in between, so the cells come out even instead of bursting outwards.
// The clear is real gall water: it cuts holes showing the bath, so it's never tinted.
viscosity({ value: 1000 });
const water = '#f3eee0';
bath({ color: water });
const inks = palette('Old Dutch').inks;
const veins = [inks[0], inks[1], inks[2], inks[3]];
for (let r = 0; r < 9; r++) for (let c = 0; c < 12; c++) drop({ x: (c + 0.5 + (random() - 0.5) * 0.8) * 100 / 12, y: (r + 0.5 + (random() - 0.5) * 0.8) * 100 / 9, quantity: 0.4, spreading: 4, color: veins[Math.floor(random() * veins.length)] });
settle();
const cols = 40, rows = 27, passes = 3;
const cells = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
for (let p = 0; p < passes; p++) {
  cells.forEach(([c, r], i) => {
    if ((i + r) % passes !== p) return;
    drop({ x: (c + 0.5 + (random() - 0.5) * 0.6) * 100 / cols, y: (r + 0.5 + (random() - 0.5) * 0.6) * 100 / rows,
           quantity: 0.14, spreading: 4, color: 'clear' });
  });
  settle();
}
`,
  'Get-gel': `// Gelgit ("come and go"): a stone ground raked across the tank and back, the second pass between the
// first one's teeth, so the colours zigzag into bands.
viscosity({ value: 1000 });
const inks = palette('Lapis & Gilt').inks;
allAtOnce();
for (let i = 0; i < 420; i++) {
  drop({ x: 2 + random() * 96, y: 2 + random() * 96, quantity: 0.9, dispersion: 1.8, spreading: 2, color: inks[i % inks.length] });
}
settle();
fullRake({ angle: 90, teeth: 24, speed: 22, D: 0.8 });
settle();
fullRake({ angle: 270, teeth: 24, offset: 2.08, speed: 22, D: 0.8 });
settle();
`,
  'Nonpareil': `// Nonpareil: a ground drawn into fine parallel stripes, then combed across them with a fine comb, so
// every stripe bends into a row of small pointed arches. A staple of 19th-century bookbinding.
viscosity({ value: 1000 });
const inks = palette('Lapis & Gilt').inks;
stripes({ angle: 90, count: 70, colors: inks, variation: 0.5, slivers: 0.3 });
settle();
fullRake({ angle: 0, teeth: 40, speed: 30, D: 1.6 });
settle();
`,
  'Broom-straw stone': `// Broom-straw stone, after a marbler's video: a broom flicks the first colour until it covers most of
// the bath, then the second colour, which opens inside the first and squeezes it into a thin dark net.
// Each drop keeps its own cell, so bare size shows as pale channels between them.
viscosity({ value: 1000 });
bath({ color: '#f4efe2' });
broom({ n: 160, size: 0.08, spread: 0.8, spreading: 6, color: '#8a6a4a' });
settle();
broom({ n: 420, size: 0.065, spread: 0.6, spreading: 6, color: '#3fa7d6' });
settle();
`,
  'Stormont': `// Stormont: a stone ground thrown with the broom, then a last colour with turpentine in it. As that
// colour spreads, the turpentine thins it into a lace of fine holes showing the bare size.
viscosity({ value: 1000 });
bath({ color: '#f4efe2' });
broom({ n: 600, size: 0.08, spread: 0.8, spreading: 2, color: '#7a2e24' });
settle();
broom({ n: 1200, size: 0.06, spread: 0.6, spreading: 2, color: '#2f4a6b' });
settle();
for (let i = 0; i < 30; i++) drop({ x: random() * 100, y: random() * 100, quantity: 0.9, turpentine: 0.28, color: '#e2c27a' });
settle();
`,
  'Stone, four colours': `// Stone in four colours, after Jeffrey Ang's broom-straw video: the first colour flicked until it
// covers most of the bath (distinct cells, bare channels), blue opening inside it and squeezing it
// into veins, then a few big yellow cells, then lilac and a scatter of red. Rising gall gives each
// colour a little more than the last, so each opens over the ones before.
viscosity({ value: 1000 });
bath({ color: '#e9e6df' });
separate({ on: true });
gall({ on: true, start: 1, step: 0.5 });
const flick = (x, y, color, size, n = 60) => { broom({ n, x, y, w: 50, h: 50, size, spread: 0.9, spreading: 25, color }); settle(); };
const spots = [[25, 33], [75, 67], [72, 26], [27, 74]];
for (const [x, y] of spots) flick(x, y, '#3b2b24', 0.028);
for (const [x, y] of spots.slice(0, 3)) flick(100 - x, y, '#3fa7d6', 0.0125);
for (const [x, y] of spots.slice(0, 2)) flick(y, x, '#e6d23a', 0.014, 10);
for (const [x, y] of spots.slice(0, 2)) flick((x + 50) / 2, 100 - y, '#cdb8e6', 0.0098, 10);
flick(50, 50, '#e2574c', 0.0034, 20);
`,
  'Stone veins (Thin film)': `// Stone veins in Thin film: the four-colour broom recipe, in the simulator whose films leave the most
// bare size between them, so every colour sits in a lace of pale veins. Rising gall gives each colour
// a little more than the last; Keep cells separate keeps same-colour cells apart.
viscosity({ value: 1000 });
bath({ color: '#e9e6df' });
separate({ on: true });
gall({ on: true, start: 1, step: 0.5 });
const flick = (x, y, color, size, n = 60) => { broom({ n, x, y, w: 50, h: 50, size, spread: 0.9, spreading: 25, color }); settle(); };
const spots = [[25, 33], [75, 67], [72, 26], [27, 74]];
for (const [x, y] of spots) flick(x, y, '#3b2b24', 0.028);
for (const [x, y] of spots.slice(0, 3)) flick(100 - x, y, '#3fa7d6', 0.0125);
for (const [x, y] of spots.slice(0, 2)) flick(y, x, '#e6d23a', 0.014, 10);
for (const [x, y] of spots.slice(0, 2)) flick((x + 50) / 2, 100 - y, '#cdb8e6', 0.0098, 10);
flick(50, 50, '#e2574c', 0.0034, 20);
`,
  'Stone (Cells)': `// Stone in Cells: the four-colour broom recipe in the simulator that packs drops into cells by
// geometry. Each colour nests in the cell it lands in and squeezes it (up to twice as thick), and the
// first throw leaves bare channels between its cells. Rising gall gives each colour a little more
// than the last.
viscosity({ value: 1000 });
bath({ color: '#e9e6df' });
separate({ on: true });
gall({ on: true, start: 1, step: 2, most: 15 });
const flick = (x, y, color, size, n = 60) => { broom({ n, x, y, w: 50, h: 50, size, spread: 0.9, spreading: 25, color }); settle(); };
const spots = [[25, 33], [75, 67], [72, 26], [27, 74]];
for (const [x, y] of spots) flick(x, y, '#3b2b24', 0.028);
for (const [x, y] of spots.slice(0, 3)) flick(100 - x, y, '#3fa7d6', 0.0125);
for (const [x, y] of spots.slice(0, 2)) flick(y, x, '#e6d23a', 0.014, 10);
for (const [x, y] of spots.slice(0, 2)) flick((x + 50) / 2, 100 - y, '#cdb8e6', 0.0098, 10);
flick(50, 50, '#e2574c', 0.0034, 20);
`,
  'Large-cell vein (Cells)': `// Large-cell vein (Cells), after veined sheets of the 1820s: a full ground of four colours, then
// clear gall water in three passes. In Cells each clear drop takes its own cell and squeezes the
// colours into thin veins between big pale cells. (The same recipe as Italian vein, in Cells.)
// The clear is real gall water: it cuts holes showing the bath, so it's never tinted.
viscosity({ value: 1000 });
const water = '#f3eee0';
bath({ color: water });
const inks = palette('Old Dutch').inks;
const veins = [inks[0], inks[1], inks[2], inks[3]];
for (let r = 0; r < 9; r++) for (let c = 0; c < 12; c++) drop({ x: (c + 0.5 + (random() - 0.5) * 0.8) * 100 / 12, y: (r + 0.5 + (random() - 0.5) * 0.8) * 100 / 9, quantity: 1.0, spreading: 1, color: veins[Math.floor(random() * veins.length)] });
settle();
const cols = 22, rows = 15, passes = 3;
const cells = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
for (let p = 0; p < passes; p++) {
  cells.forEach(([c, r], i) => {
    if ((i + r) % passes !== p) return;
    drop({ x: (c + 0.5 + (random() - 0.5) * 0.6) * 100 / cols, y: (r + 0.5 + (random() - 0.5) * 0.6) * 100 / rows,
           quantity: 0.30, spreading: 4, color: 'clear' }); // real gall water: holes, never tinted
  });
  settle();
}
`,
  'French Shell': `// French Shell: a stone ground, then a colour with oil in it. Each oiled drop spreads dark in the
// middle with a lighter outer ring, its "shell" (Jaffer's fitted walnut-oil profile at oil 0.75).
viscosity({ value: 1000 });
bath({ color: '#efe8da' });
separate({ on: true });
broom({ n: 60, x: 30, y: 40, w: 60, h: 60, size: 0.028, spread: 0.9, spreading: 25, color: '#6b2f2a' });
settle();
broom({ n: 60, x: 70, y: 60, w: 60, h: 60, size: 0.028, spread: 0.9, spreading: 25, color: '#2f4a6b' });
settle();
for (let i = 0; i < 28; i++) drop({ x: 5 + random() * 90, y: 5 + random() * 90, quantity: 0.25, oil: 0.75, bands: 5, color: '#c8962e' });
settle();
`,
  'Gloster': `// Gloster: a raked ground, then spots of a Stormont colour (blue, with turpentine) on top, and no
// white over it. Each blue spot breaks into a lace as its turpentine thins it.
viscosity({ value: 1000 });
bath({ color: '#efe8da' });
stripes({ angle: 90, count: 24, colors: ['#7a2e24', '#c8962e', '#3b2b24'], variation: 0.6 });
settle();
fullRake({ angle: 0, teeth: 12, speed: 22, D: 0.8 });
settle();
for (let i = 0; i < 26; i++) drop({ x: 5 + random() * 90, y: 5 + random() * 90, quantity: 0.25, turpentine: 0.25, color: '#2f5f9e' });
settle();
`,
  'Antique spot': `// Antique spot: the colours thrown as a stone, raked once up and back down, then spotted with pink
// and green, and finally white (Woolnough 1881). Rising gall lets each spotting open over the last.
viscosity({ value: 1000 });
bath({ color: '#efe8da' });
separate({ on: true });
gall({ on: true, start: 1, step: 0.4 });
broom({ n: 70, x: 30, y: 40, w: 60, h: 60, size: 0.03, spread: 0.9, spreading: 25, color: '#2c3a5a' });
settle();
broom({ n: 70, x: 70, y: 60, w: 60, h: 60, size: 0.03, spread: 0.9, spreading: 25, color: '#7a2e24' });
settle();
fullRake({ angle: 90, teeth: 10, speed: 22, D: 0.7 });
settle();
fullRake({ angle: 270, teeth: 10, offset: 5, speed: 22, D: 0.7 });
settle();
broom({ n: 90, x: 50, y: 50, w: 95, h: 95, size: 0.0025, spread: 0.7, spreading: 25, color: '#d98aa0' });
settle();
broom({ n: 90, x: 50, y: 50, w: 95, h: 95, size: 0.0025, spread: 0.7, spreading: 25, color: '#5c8a5a' });
settle();
broom({ n: 120, x: 50, y: 50, w: 95, h: 95, size: 0.0012, spread: 0.6, spreading: 25, color: '#f6f2ea' });
settle();
`,
  'Hatip hearts': `// Hatip (yürek, "hearts"), after a Turkish ebru: a pale stone ground, then rows of hearts, each an
// orange heart with a dark one landed inside it, so the orange stays as a rim. Named after Hatip
// Mehmed Efendi (d. 1773), whose motifs are built from drops placed inside one another.
viscosity({ value: 1000 });
bath({ color: '#e9e6d6' });
broom({ n: 70, x: 50, y: 50, w: 100, h: 100, size: 0.16, spread: 0.9, spreading: 25, color: '#c9cfa0' });
settle();
broom({ n: 50, x: 50, y: 50, w: 100, h: 100, size: 0.02, spread: 0.8, spreading: 25, color: '#a9b4a0' });
settle();
const spots = [];
for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) spots.push([9 + c * 16 + (r % 2) * 8, 10 + r * 20]);
// All the orange first, then a dark heart inside each, so no orange lands on a finished heart.
for (const [x, y] of spots) heartDrop({ x, y, quantity: 0.16, angle: 315, variation: 0.15, color: '#d8643a' });
settle();
for (const [x, y] of spots) heartDrop({ x, y, quantity: 0.08, angle: 315, variation: 0.15, color: '#1d1a1c' });
settle();
`,
  'Taraklı': `// Taraklı ebru, after a Turkish gelgit sheet: fine horizontal bands raked up and down between each
// other's lines into tall zigzags, then combed up with a fine tarak (comb) so every band breaks into
// small arches.
viscosity({ value: 1000 });
bath({ color: '#efe8da' });
stripes({ angle: 0, count: 50, colors: ['#4a2a6a', '#e0b030', '#c8582a', '#7a4a9a', '#f0d070'], variation: 0.4, slivers: 0.3 });
settle();
fullRake({ angle: 90, teeth: 7, speed: 26, D: 0.9 });
settle();
fullRake({ angle: 270, teeth: 7, offset: 7.14, speed: 26, D: 0.9 });
settle();
fullRake({ angle: 90, teeth: 60, speed: 26, D: 0.5 });
settle();
`,
  'Ebru, combed stone': `// Ebru, after a Turkish sample sheet: a stone (battal) of blue, green and pink thrown with the broom,
// each with a little more gall than the last, then combed along the diagonal and back between the first lines.
viscosity({ value: 1000 });
bath({ color: '#eef0ea' });
separate({ on: true });
gall({ on: true, start: 1, step: 0.4 });
broom({ n: 160, x: 50, y: 50, w: 100, h: 100, size: 0.03, spread: 0.9, spreading: 25, color: '#3c6a9a' });
settle();
broom({ n: 160, x: 50, y: 50, w: 100, h: 100, size: 0.013, spread: 0.9, spreading: 25, color: '#9bb08a' });
settle();
broom({ n: 160, x: 50, y: 50, w: 100, h: 100, size: 0.004, spread: 0.9, spreading: 25, color: '#e3a3a8' });
settle();
fullRake({ angle: 45, teeth: 14, speed: 22, D: 0.8 });
settle();
fullRake({ angle: 225, teeth: 14, offset: 3.5, speed: 22, D: 0.8 });
settle();
`,
  'Chevron feather': `// Chevron (feather), after a combed sheet of 1828: fine horizontal bands raked up and down between
// each other's lines into broad chevrons, then combed up with a fine comb so every band breaks into
// small arches that ride the chevrons.
viscosity({ value: 1000 });
bath({ color: '#e9e2d0' });
stripes({ angle: 0, count: 60, colors: ['#2a2420', '#8a6a3a', '#d8c8a0', '#5a4a3a', '#b89060', '#7a2e24'], variation: 0.4, slivers: 0.3 });
settle();
fullRake({ angle: 90, teeth: 4, speed: 26, D: 1 });
settle();
fullRake({ angle: 270, teeth: 4, offset: 12.5, speed: 26, D: 1 });
settle();
fullRake({ angle: 90, teeth: 64, speed: 26, D: 0.5 });
settle();
`,
  'Feather plumes': `// Feather plumes (Drawn rake): thin vertical bands of colour, combed fine, then whole rakes dragged east and curving
// south. The teeth keep the north-south line the first eastward movement set, so every tine fans
// the same way into plumes.
viscosity({ value: 1000 });
bath({ color: '#efe6d2' });
const inks = ['#6b8f71', '#5a3d7a', '#e87a5d', '#c43a2b', '#7d93c4', '#f2b8a0'];
stripes({ angle: 90, count: 36, colors: inks, variation: 0.3, slivers: 0.2 });
settle();
fullRake({ angle: 0, teeth: 24, speed: 20 });
settle();
for (const x0 of [8, 38, 68]) {
  const path = [];
  for (let k = 0; k <= 40; k++) { const t = k / 40; path.push([x0 + 22 * Math.sin(t * Math.PI / 2), 22 + 70 * (1 - Math.cos(t * Math.PI / 2))]); }
  rake({ path, teeth: 18, spacing: 1.6, speed: 22, D: 1.5 });
  settle();
}
`,
};

export const EXAMPLE_SIMULATOR = {
  Chevrons: 'film', Ribbons: 'film', 'Big waves': 'film', Flames: 'film', 'Two-way feathers': 'film', Whorls: 'wake', Storm: 'wake', 'Italian marble': 'film', 'Spiral field': 'wake', 'Seamless wallpaper': 'classic', 'Grid ink spirals': 'gridink', 'Italian vein': 'classic', 'Hair-vein': 'film', 'Feather plumes': 'film', 'Get-gel': 'classic', Nonpareil: 'classic', 'Broom-straw stone': 'classic', Stormont: 'classic', 'Stone, four colours': 'classic', 'Stone veins (Thin film)': 'thinfilm', 'Stone (Cells)': 'cells', 'Large-cell vein (Cells)': 'cells', 'French Shell': 'classic', Gloster: 'classic', 'Antique spot': 'classic', 'Hatip hearts': 'classic', 'Taraklı': 'classic', 'Ebru, combed stone': 'classic', 'Chevron feather': 'classic',
};
