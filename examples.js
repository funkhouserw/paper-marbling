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
         quantity: 1.7, dispersion: 1.6, color: inks[(i * 3) % inks.length] });
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
         quantity: 1.3, dispersion: 1.8, color: inks[i % inks.length] });
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
  for (let j = 0; j < 11; j++) drop({ x: 4 + j * 9.2, y: 6 + i * 12.5, quantity: 1.6, color: p.inks[i % 4] });
}
settle();
fullRake({ angle: 0, teeth: 5, speed: 25, D: 1, waveAmp: 5, waveLength: 18, waveShape: 'wave' });
`,
  'Verdigris waves': `// Copper and verdigris bands, shaken into waves.
viscosity({ value: 1000 });
const inks = palette('Copper & Verdigris').inks;
for (let r = 0; r < 7; r++) {
  for (let c = 0; c < 9; c++) {
    drop({ x: 6 + c * 11, y: 92.9 - r * 14.3, quantity: 1.1, dispersion: 1.8,
           color: inks[r % inks.length] });
  }
}
settle();
jiggle({ angle: 0, period: 21, amplitude: 4.5, duration: 2 });
settle();
fullRake({ angle: 0, teeth: 14, speed: 28, D: 0.5 });
`,
};

export const EXAMPLE_SIMULATOR = {
  Chevrons: 'film', Ribbons: 'film', 'Big waves': 'film', Flames: 'film', 'Two-way feathers': 'film', Whorls: 'wake', Storm: 'wake', 'Italian marble': 'film', 'Spiral field': 'wake', 'Seamless wallpaper': 'classic', 'Grid ink spirals': 'gridink',
};
