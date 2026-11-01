// Palette presets. Each ink is a CSS colour plus a shimmer amount (0 = matte, 1 = metallic).
//
// These are artistic interpretations, not historical pigment matches: the sources found
// give pattern history and modern metallic ranges, not documented historic colour values.
// The academia palettes start from colours published on dark academia palette pages.

const m = (color) => ({ color, shimmer: 0 });
const s = (color, shimmer = 0.8) => ({ color, shimmer });

export const PALETTES = [
  { name: 'Dark Academia', bath: '#1e1410', inks: [m('#4b231a'), m('#7a3e2c'), m('#b38a6a'), m('#d9c6b3'), m('#202a27'), s('#a8842c', 0.7)] },
  { name: 'Oxblood & Gilt', bath: '#160b0b', inks: [m('#4a0e12'), m('#6d1a1f'), m('#2a1414'), m('#c09b88'), s('#c9a227', 0.9)] },
  { name: 'Ravenwood Library', bath: '#0d1110', inks: [m('#202a27'), m('#39463b'), m('#6d694b'), m('#b09a6f'), s('#b8912f', 0.75)] },
  { name: 'Parchment Notes', bath: '#e9ddc8', inks: [m('#3b2f2a'), m('#6a5648'), m('#a38b72'), m('#2e3d3a'), s('#8b6914', 0.6)] },
  { name: 'Light Academia', bath: '#f2e8d5', inks: [m('#d8cbb6'), m('#8b7a66'), m('#b9a27f'), m('#7b6a3b'), m('#5a4e44')] },
  { name: 'Ink & Antique Paper', bath: '#e0d2b8', inks: [m('#101820'), m('#263746'), m('#59656f'), m('#b8a995')] },
  { name: 'Shimmering Gold', bath: '#14100a', inks: [s('#d4af37', 1), s('#b8860b', 0.9), s('#f0d98a', 0.9), s('#8a6a1f', 0.8), m('#2b2112')] },
  { name: 'Emerald & Gold', bath: '#04140f', inks: [s('#0f6b4f', 0.9), s('#0a4d3a', 0.8), s('#2e9c76', 0.8), m('#06281f'), s('#d4af37', 1)] },
  { name: 'Lapis & Gilt', bath: '#070d24', inks: [m('#14296b'), s('#26619c', 0.6), m('#0b1a45'), m('#c7cfe0'), s('#d4af37', 1)] },
  { name: 'Copper & Verdigris', bath: '#14211f', inks: [s('#b87333', 0.9), s('#8c4a22', 0.8), s('#43b3a0', 0.5), m('#2a6f66'), m('#e6d8c3')] },
  { name: 'Old Dutch', bath: '#efe6d2', inks: [m('#26416b'), m('#a3322b'), m('#d1a23c'), m('#2f5d4a'), m('#f3eee0')] },
  { name: 'French Curl', bath: '#f1e7d0', inks: [m('#7c2a2a'), m('#1f3a5f'), m('#c4942f'), m('#46613f'), m('#2a2420')] },
  { name: 'Turkish Ebru', bath: '#f4efe2', inks: [m('#1b4f8a'), m('#b5283a'), m('#e0a526'), m('#1f7a63'), m('#f7f3e8')] },
  { name: 'Suminagashi', bath: '#f5f1e6', inks: [m('#1a1a1a'), m('#4a4a4a'), m('#8a8a8a'), m('#27384a')] },
];

// Looks up a palette by name, ignoring case.
export function palette(name) {
  const found = PALETTES.find((p) => p.name.toLowerCase() === String(name).toLowerCase());
  if (!found) throw new Error(`Unknown palette "${name}". Try: ${PALETTES.map((p) => p.name).join(', ')}`);
  return found;
}
