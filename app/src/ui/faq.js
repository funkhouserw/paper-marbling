// Carra Jean's FAQ: every explanation the app already has, plus hand-written how-tos, searched in
// the browser with BM25. No server, no key and no model, so it answers on the public demo too, and
// asking it costs nothing. Plain JavaScript, so node tests can use it.
import { INFO, TOOLS, SIMULATORS } from './live.js';
import { SECTIONS, ACTIONS } from './features.js';
import { SETTINGS } from '../../../controller.js';
import { COMMANDS } from '../../../api.js';
import { MODEL_NOTES } from '../../../modelnotes.js';
import { PATTERNS } from '../../../patterns.js';

// Hand-written answers to what people ask most. `topic` groups them in the browsable list.
export const FAQ = [
  // Getting started
  { topic: 'Getting started', q: 'How do I start?', a: 'Pick Drop in the tool rail and click the tank to float ink. Then pick a comb, such as Rake or Full rake, and drag across the ink to pull it into patterns. When you like it, press Pull to lift a print onto paper.' },
  { topic: 'Getting started', q: 'How do I undo?', a: 'The curved arrows in the top bar, or ⌘Z (Ctrl+Z) to undo and ⇧⌘Z to redo. On a phone, tap with two fingers to undo. History in the side panel lists every step, and clicking one goes back to it.' },
  { topic: 'Getting started', q: 'What is the difference between Simple and Advanced?', a: 'Both have every tool and every brush setting. Advanced adds the script editor, tank size, repeating, the moving bath, detail and the finer print and export options.' },
  { topic: 'Getting started', q: 'How do I find a command?', a: 'Press ⌘K (Ctrl+K) and type what you want, or right-click the tank (long-press on a phone) for the commands that act on it.' },
  { topic: 'Getting started', q: 'How do I clear the tank?', a: 'The bin icon at the bottom, or Clear in the Tank menu. Undo brings the ink back.' },
  { topic: 'Getting started', q: 'Who is Carra Jean?', a: 'Carra Jean is the little ink drop in the corner of the tank. Say her name quickly: she is named after carrageen, the seaweed traditionally boiled to thicken a marbling bath. Ask her how anything works; when Marbler runs on your own computer, she can also write scripts for you.' },
  // Patterns
  { topic: 'Patterns', q: 'How do I make feathers?', a: 'Put drops down, let them settle, then use Full rake one way and back again with an offset. In Wake, a thin bath (viscosity 5 to 60) and a fast rake curl the feathers.' },
  { topic: 'Patterns', q: 'How do I make a nonpareil or comb pattern?', a: 'Cover the tank with Stripes or Fill dots, rake it one way with Full rake, then rake it across at 90° with more teeth and a smaller spacing. For the tight pointed arches of a real nonpareil, use a fine comb (many teeth) with a quick stroke and some pull: a straight full rake then arches the colour between its teeth by itself.' },
  { topic: 'Patterns', q: 'How do I make hearts?', a: 'Lay a row of drops, then use Heart strike: it bends every round drop into a heart, rings and all. Angle says which way the points face, 0 down, as for Heart drop, which lays a heart straight on.' },
  { topic: 'Patterns', q: 'How do I make swirls or spirals?', a: 'Stir turns the bath in rings, Vortex spins a single whirlpool, and Air breathes a gentle random swirl over everything. In Wake the bath keeps turning after the tool lets go.' },
  { topic: 'Patterns', q: 'Why does my ink stop moving?', a: 'Only the Wake simulators keep the bath moving after a tool. Lower viscosity, or choose Curling or Whorls under Moving bath, to keep it going longer.' },
  { topic: 'Patterns', q: 'Can I change the simulator without clearing the tank?', a: 'Yes. Pick another simulator and it takes over the ink where it is, so you can drop in Classic and rake in Wake. Undo switches back. Grid ink is the exception: a switch to or from it waits until you clear the tank.' },
  { topic: 'Patterns', q: 'How do I keep some ink still while I comb the rest?', a: 'Freeze ink (the snowflake under Lift, in Advanced) holds the ink you click still under every tool. Unfreeze lets it go again.' },
  { topic: 'Patterns', q: 'What does viscosity do?', a: 'Viscosity is how thick the bath is, from 5 (thin as water) to 20000. A new tank starts at 100 mm²/s, close to a real carrageenan size; ebru\'s tragacanth is thicker, a few hundred. A thinner bath lets drawn tools pull ink further, and in Wake keeps it moving for seconds after the tool, which gives curls. Change it with the slider at the bottom; it applies straight away without clearing. Saved tanks and the examples keep the thickness they were made with.' },
  { topic: 'Patterns', q: 'How do I make a seamless repeating pattern?', a: 'Turn on Repeating (in Advanced, under Repeating). The tank joins at its edges, so ink that leaves one side comes back at the other, and exports tile seamlessly. Offset gives a brick or half-drop repeat. See repeat shows it tiled. A Spanish pull of a repeating tank repeats too: its bands shift a little, to the nearest count and angle that join at the tile\'s edges.' },
  { topic: 'Getting started', q: 'How do I put the tools back to how they started?', a: 'File › Reset tools to defaults… puts every tool\'s sliders and choices back as they ship; the ink in the tank stays. File › Reset tank settings… does the same for the simulator, tank size, viscosity, Repeating, detail and the paper, and reloads the page, so save the tank first if you want it. Your saved states, prints, scripts and palettes stay either way. Clear everything… deletes all of those too. On a phone all three are at the bottom of the menu.' },
  { topic: 'Getting started', q: 'What does "is struggling" mean?', a: 'Marbler tells you when the simulator can\'t keep up with what\'s in the tank: after 20 seconds in which the ink has moved less than a tenth of a second\'s worth each second, it says how long it took and how many shapes there are. Pause or undo, or switch to Wake (fast), the quickest. Cells (beta) is the slowest with many small drops.' },
  { topic: 'Getting started', q: 'Why is it slow?', a: 'Long, stretched ink makes a lot of points. Wake (fast) keeps a busy tank moving, a lower point limit under Accuracy and speed keeps it light, and Low framerate under Tank saves effort on slower computers. Export and Print are slower on purpose, because they keep every point.' },
  // Stone, vein and the broom (2026-11-07)
  { topic: 'Patterns', q: 'How do I make stone marbling?', a: 'Use Broom straw to flick the first colour over the bath, a few flicks until it covers most of it, then flick the next colour, which opens inside the first and squeezes it into veins. Keep cells separate (Tank) keeps a thin bare seam between cells, and Rising gall (Tank, Advanced) gives each colour a little more than the last. Classic is closest to a real broom-straw sheet; Thin film gives a lace of pale veins. Try Help › Traditional patterns › Stone › Stone, four colours.' },
  { topic: 'Patterns', q: 'How do I make a colour spread more or less?', a: 'As a marbler does: with the gall in the colour. Drop, Broom straw and Spray have Gall in the colour; more spreads further, and a colour opens over the ink it lands on only if it has more gall than that ink (Bath uses the bath\'s rising gall). Paint: thick ↔ thin is the water in the colour: thinner paint thins its gall too, so it opens a little less, and prints lighter. In Advanced, Spread and Opening speed override the rule when you want a look the physics wouldn\'t give.' },
  { topic: 'Patterns', q: 'Why don\'t my cells join into one blob?', a: 'Keep cells separate is on (Tank). Where two drops spread into each other a hairline of bare bath stays between them, even when they are the same colour, as on real stone sheets. A drop landing inside one of its own colour still joins it. Turn the setting off for touching ink to run together. Grid ink doesn\'t draw it yet.' },
  { topic: 'Patterns', q: 'Can I add oil or turpentine to Broom straw and Spray?', a: 'Yes, in Advanced: both have Oil (shell) and Turpentine (stormont), as Drop does, and every drop they throw carries them. Oil gives each drop rings darker in the middle; turpentine breaks each into a lace of fine holes as it spreads. Both together make oiled rings that break into lace.' },
  { topic: 'Patterns', q: 'What is the difference between Broom straw and Spray?', a: 'Both only place ink; how it then behaves is up to the simulator. Broom straw flicks a patch of drops of very different sizes that spread a long way, like a real broom over the size. Spray makes a burst of finer dots; Dot sizes sets the mix from mostly small to mostly big.' },
  { topic: 'Patterns', q: 'Why do thin threads disappear when I comb?', a: 'Cut hairline ink (Tank, Advanced) trims ribbons stretched thinner than half a millimetre, which keeps long sessions fast. Squeezed ink is never cut. Turn it off to keep every thread, at the cost of speed.' },
  { topic: 'Patterns', q: 'Which simulator should I use for stone or veins?', a: 'Classic for broom-straw stone that looks like a real sheet; Thin film for veins; Cells (beta) packs drops into polygon cells by geometry, with each colour nesting in the one it lands in. Film and Wake suit combed patterns and a moving bath more than stone.' },
  { topic: 'Colour', q: 'How do I open holes or veins with clear?', a: 'The dashed Clear swatch after the inks has three kinds: gall water (no colour, cuts real holes down to the bath), white paint, and a translucent tint of the current colour. How far each opens over other ink is the gall\'s job: raise Gall on the tool, or turn on Rising gall in Tank.' },
  { topic: 'Colour', q: 'Can I use a colour that isn\'t in the palette?', a: 'Yes: the + swatch at the end of the palette opens a colour picker, and that colour is used for the next drops without changing the palette.' },
  // Colour
  { topic: 'Colour', q: 'How do I change the ink colours?', a: 'Pick an ink from the swatches, or choose another palette in the Palette panel. In Advanced you can edit each ink, add shimmer, and save your own palette.' },
  { topic: 'Colour', q: 'How do I change the background colour?', a: 'Base colour in the Palette panel. Its swatches are the paper tints; the picker takes any colour. Turned off, the tank shows a grid and exports are transparent.' },
  { topic: 'Colour', q: 'Can I use metallic or gold ink?', a: 'Yes. Inks with shimmer, such as the gold swatch in some palettes, glint as the tank moves. Set shimmer on any ink in the ink editor in Advanced.' },
  // Prints and saving
  { topic: 'Prints and saving', q: 'How do I save my work?', a: 'Save state (⌘S) keeps the whole tank in this browser so you can come back to it. Pull lifts a print, which collects under Paper, and Export saves a PNG, SVG or print-quality image.' },
  { topic: 'Prints and saving', q: 'What is the difference between Pull and Export?', a: 'Pull imitates lifting real paper off the tank: paper colour, imperfections and an optional mirror. Export saves exactly what the tank shows, as PNG or SVG, or as a high-resolution print.' },
  { topic: 'Prints and saving', q: 'Where are my prints?', a: 'Under Paper in the side panel. Click one to view, download or delete it. They stay in this browser.' },
  // Scripts
  { topic: 'Scripts', q: 'What is a script?', a: 'A few lines of JavaScript that make a pattern step by step: drops, rakes, waits and so on. Every tool has a script command, so anything you can do by hand a script can repeat exactly. Open the editor with Script in Advanced, or ⌘E.' },
  { topic: 'Scripts', q: 'How do I edit and run a script myself?', a: 'Switch to Advanced and press Script (⌘E). Pick one of the Examples to start from, change it, and press Run (⌘↵). Clear tank first decides whether it starts on an empty tank or on top of what is there.' },
  { topic: 'Scripts', q: 'Can Carra Jean write a script for me?', a: 'Yes, when Marbler runs on your own computer with its server. Switch Carra Jean to Script and describe the pattern, such as "five rows of blue drops, then a feather rake". It writes the script, and Run makes it.' },
  { topic: 'Scripts', q: 'How do I save a script?', a: 'In the script editor, type a name and press Save. My scripts lists them, and choosing one opens it with the simulator it was saved on.' },
  { topic: 'Scripts', q: 'How do I see the script for what I just did by hand?', a: 'Copy session, in the script editor or the File menu, copies everything done to the tank as a script that reproduces it.' },
  { topic: 'Scripts', q: 'How do I time things in a script?', a: 'wait(seconds) moves the timeline on, settle() waits until all ink is at rest, and inOrder() makes each action start after the last one finishes. Most commands also take at: to start at a given time.' },
  // Phone
  { topic: 'On a phone', q: 'How do I zoom on a phone?', a: 'Pinch with two fingers to zoom and drag with two fingers to move around. The button in the corner fits the tank again.' },
];

// ---- Everything searchable --------------------------------------------------

const settingLabels = {};
for (const s of SECTIONS) for (const c of s.controls) if (c.label) settingLabels[c.info ?? c.id] ??= c.label;
for (const [id, s] of Object.entries(SETTINGS)) if (s.label) settingLabels[s.info ?? id] ??= s.label;
const sectionOf = {};
for (const s of SECTIONS) for (const c of s.controls) sectionOf[c.info ?? c.id] ??= s.label;

// A readable title for each (i) explanation.
function infoTitle(key) {
  const [tool, part] = key.split('.');
  if (tool === 'tool' && TOOLS[part]) return `The ${TOOLS[part].label} tool`;
  if (part && TOOLS[tool]) {
    const t = TOOLS[tool];
    const label = t.params.find((p) => p.key === part)?.label ?? t.choices.find((c) => c.key === part)?.label ?? part;
    return `${t.label}: ${label}`;
  }
  if (tool === 'color') return { swatches: 'Ink colours', alpha: 'Ink transparency', shimmer: 'Shimmer' }[part] ?? key;
  const label = settingLabels[key] ?? ACTIONS.find((a) => a.id === key)?.label ?? key.replace(/([A-Z])/g, ' $1').toLowerCase();
  return sectionOf[key] && sectionOf[key] !== label ? `${sectionOf[key]}: ${label}` : label[0].toUpperCase() + label.slice(1);
}

export const DOCS = [
  ...FAQ.map((f) => ({ title: f.q, text: f.a, topic: f.topic, kind: 'faq' })),
  ...Object.entries(INFO).map(([key, text]) => ({ title: infoTitle(key), text, kind: 'setting', key })),
  ...SIMULATORS.map((m) => {
    const n = MODEL_NOTES[m.id] ?? {};
    return { title: `The ${m.label} simulator`, text: [m.title, n.how, n.good && `Good for: ${n.good}`, n.limit && `Watch out for: ${n.limit}`].filter(Boolean).join(' '), kind: 'simulator' };
  }),
  // Traditional patterns, from the checked catalogue (patterns.js). Every name it goes by is in the
  // title, so "battal" or "Steinmarmor" finds Stone; a loosely supported definition says so.
  ...PATTERNS.map((p) => ({
    title: ((t) => t[0].toUpperCase() + t.slice(1))(`${[p.names.en, p.names.tr, p.names.de, p.names.ja].filter(Boolean).join(', ')}: a traditional pattern`),
    text: p.summary + (p.status === 'verified' ? '' : p.status === 'partly' ? ' (Sources agree on the outline; details vary.)' : ' (No historical definition found.)')
      + (p.example ? ` Try the "${p.example}" example.` : ''),
    kind: 'pattern', topic: 'Patterns',
  })),
  ...COMMANDS.map((c) => ({
    title: `Script command ${c.name}()`,
    text: `${c.summary}${(c.params ?? []).length ? ` Options: ${c.params.map((p) => (Array.isArray(p) ? `${p[0]} (${p[3]})` : '')).filter(Boolean).join('; ')}.` : ''}`,
    kind: 'command', topic: 'Scripts',
  })),
];

// ---- BM25 -------------------------------------------------------------------

const STOP = new Set(('a about after all also an and any are as at be been but by can could do does doing done for from get '
  + 'had has have how i if in into is it its just like make me more most my no not of on one or our so some than that the their them '
  + 'then there these they this to too up us use using want was way we what when where which while who why will with would you your').split(' '));

// Words people use for the same thing, folded onto the app's own word.
const SAME = {
  color: 'colour', colors: 'colour', colours: 'colour', background: 'base', backdrop: 'base', bg: 'base',
  code: 'script', program: 'script', programming: 'script', automate: 'script', macro: 'script',
  comb: 'rake', combing: 'rake', combed: 'rake', tine: 'rake', tines: 'rake',
  swirl: 'stir', swirls: 'stir', spiral: 'vortex', spirals: 'vortex', whirlpool: 'vortex',
  thickness: 'viscosity', runny: 'viscosity', spreads: 'spread', spreading: 'spread',
  download: 'export', image: 'export', picture: 'export', photo: 'export', jpg: 'export', png: 'export', svg: 'export',
  print: 'pull', paper: 'pull', mistake: 'undo', revert: 'undo',
  physics: 'simulator', model: 'simulator', engine: 'simulator', mode: 'simulator',
  tile: 'repeat', tiling: 'repeat', seamless: 'repeat', repeating: 'repeat',
  gold: 'shimmer', metallic: 'shimmer', glitter: 'shimmer', sparkle: 'shimmer',
  heart: 'hearts', zoom: 'pinch', ink: 'ink', drops: 'drop', dot: 'drop', dots: 'drop',
};
// A light stemmer: makes, making and make all become mak; edges and edge become edg.
const stem = (w) => {
  if (w.length <= 3) return w;
  let r = w.replace(/ies$/, 'y').replace(/(ing|ed|s)$/, '');
  if (r.length < 3) r = w;
  return r.length > 3 ? r.replace(/e$/, '') : r;
};
export function terms(text) {
  const out = [];
  for (const raw of text.toLowerCase().normalize('NFKD').match(/[a-z0-9]+/g) ?? []) {
    if (STOP.has(raw) || raw.length < 2) continue;
    out.push(stem(SAME[raw] ?? raw));
  }
  return out;
}

const K1 = 1.2;
const B = 0.75;
const TITLE_WEIGHT = 2; // BM25F-style: the title is its own field, and a hit there counts double
const FAQ_BOOST = 1.3;  // hand-written answers win a close call

function field(texts) {
  const docs = texts.map((t) => {
    const tf = new Map();
    const words = terms(t);
    for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1);
    return { tf, length: words.length };
  });
  const mean = docs.reduce((n, d) => n + d.length, 0) / docs.length || 1;
  return { docs, mean };
}
const fields = [[field(DOCS.map((d) => d.title)), TITLE_WEIGHT], [field(DOCS.map((d) => d.text)), 1]];
const df = new Map();
for (let i = 0; i < DOCS.length; i++) {
  for (const w of new Set([...fields[0][0].docs[i].tf.keys(), ...fields[1][0].docs[i].tf.keys()])) df.set(w, (df.get(w) ?? 0) + 1);
}
const idf = (w) => Math.log(1 + (DOCS.length - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));

// The best answers for a question, best first. Each is a DOCS entry with its score.
export function search(question, n = 3) {
  const want = [...new Set(terms(question))];
  if (!want.length) return [];
  const scored = DOCS.map((doc, i) => {
    let score = 0;
    for (const w of want) {
      // Term frequency summed over fields, each normalised by its own length.
      let f = 0;
      for (const [{ docs, mean }, weight] of fields) {
        const d = docs[i];
        const raw = d.tf.get(w) ?? 0;
        if (raw) f += weight * raw / (1 - B + B * d.length / mean);
      }
      if (f) score += idf(w) * (f * (K1 + 1)) / (f + K1);
    }
    if (doc.kind === 'faq') score *= FAQ_BOOST;
    if (doc.kind === 'command' && !want.includes('script')) score *= 0.7; // script commands rank lower unless scripts are asked about
    return { ...doc, score };
  }).filter((d) => d.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return [];
  // Keep only answers close to the best, so a weak second match doesn't bury the first.
  return scored.filter((d) => d.score >= scored[0].score * 0.5).slice(0, n);
}

// Whether a message reads as a request to change the tank or the script rather than a question.
export function wantsScript(message) {
  const m = message.trim().toLowerCase();
  const asking = /^(what|how|why|where|when|which|who|is|are|does|do|did|should|can i|could i)\b/.test(m);
  if (asking || (/\?\s*$/.test(m) && !/^(can|could|would|will) you\b/.test(m))) return false;
  if (/^(make|draw|create|write|add|change|put|give|do|try|let'?s|please|can you|could you|would you|i want|i'd like|turn|use|rake|drop|stir|fill)\b/.test(m)) return true;
  if (/\b(the script|a script|my script)\b/.test(m)) return true;
  // A description rather than a question, such as "five rows of drops then a feather rake".
  return m.split(/\s+/).length >= 4 && !/\?\s*$/.test(m);
}
