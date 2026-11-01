// Pulling a sheet of paper off the tank: the print, the sweep animation and the gallery.

export const TINTS = {
  'Warm white': '#f7f1e3',
  'Bright white': '#fbfbf8',
  Cream: '#efe3c4',
  Kraft: '#c9a97c',
  'Pale blue': '#dce6ea',
  Black: '#1d1c1b',
};

const PRINT_MAX_PX = 2400;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// A w×h canvas of black noise whose alpha runs from `low` to 1.
function noiseField(w, h, low, random) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4 + 3] = 255 * (low + (1 - low) * random());
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Multiplies the canvas's alpha by a noise field stretched over it.
function modulate(ctx, w, h, cols, low, random) {
  const rows = Math.max(2, Math.round((cols * h) / w));
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(noiseField(cols, rows, low, random), 0, 0, w, h);
  ctx.restore();
}

// Knocks soft-edged holes where air was trapped under the sheet.
function airBubbles(ctx, w, h, amount, random) {
  const count = Math.round(amount * (3 + random() * 7));
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const bubble = (x, y, r) => {
    const g = ctx.createRadialGradient(x, y, r * 0.75, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
  };
  const unit = Math.max(w, h) / 1000;
  for (let i = 0; i < count; i++) {
    const x = random() * w, y = random() * h;
    bubble(x, y, unit * (2 + random() ** 2 * 11));
    // Bubbles tend to gather in small clusters.
    for (let k = Math.floor(random() * 4); k > 0; k--) {
      bubble(x + (random() - 0.5) * unit * 40, y + (random() - 0.5) * unit * 40, unit * (1 + random() * 3));
    }
  }
  ctx.restore();
}

// A faint line across the sheet where the paper paused on its way down.
function hesitationLine(ctx, w, h, amount, random) {
  if (random() > amount) return;
  const x = w * (0.15 + random() * 0.7);
  const band = Math.max(w, h) / 500;
  const g = ctx.createLinearGradient(x - band, 0, x + band, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, `rgba(0,0,0,${0.35 * amount})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = g;
  ctx.fillRect(x - band, 0, band * 2, h);
  ctx.restore();
}

function paperSheet(w, h, tint, random) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, w, h);
  // Blotchy tone, then fine grain, tiled because the grain is too fine to need more.
  ctx.globalAlpha = 0.02;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(noiseField(40, Math.max(2, Math.round((40 * h) / w)), 0, random), 0, 0, w, h);
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = ctx.createPattern(noiseField(256, 256, 0, random), 'repeat');
  ctx.fillRect(0, 0, w, h);
  // Stray fibres.
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#3a2d1c';
  ctx.lineWidth = Math.max(1, w / 2400);
  const unit = Math.max(w, h) / 100;
  for (let i = 0; i < 260; i++) {
    const x = random() * w, y = random() * h, a = random() * Math.PI * 2;
    const len = unit * (0.3 + random());
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a) * len + (random() - 0.5) * unit, y + Math.sin(a) * len + (random() - 0.5) * unit,
      x + Math.cos(a) * len * 2, y + Math.sin(a) * len * 2,
    );
    ctx.stroke();
  }
  return c;
}

// Renders the tank's ink onto paper and returns { print, sheet } canvases at the same size.
export function pullPrint(marble, { tint = TINTS['Warm white'], imperfection = 0.5, mirror = false, seed = 1 } = {}) {
  const random = rng(seed);
  const scale = PRINT_MAX_PX / Math.max(marble.width, marble.height);
  const w = Math.round(marble.width * scale), h = Math.round(marble.height * scale);

  // The bath stays behind on a real pull, so only the ink is drawn here.
  const ink = canvas(w, h);
  const ictx = ink.getContext('2d');
  const inkOnly = Object.create(marble);
  inkOnly.bath = 'rgba(0,0,0,0)';
  inkOnly.draw(ictx, scale);

  if (imperfection > 0) {
    modulate(ictx, w, h, 14, 1 - 0.28 * imperfection, random);   // broad, uneven pickup
    modulate(ictx, w, h, 160, 1 - 0.14 * imperfection, random);  // mottling
    modulate(ictx, w, h, w, 1 - 0.18 * imperfection, random);    // ink missing the paper's tooth
    airBubbles(ictx, w, h, imperfection, random);
    hesitationLine(ictx, w, h, imperfection, random);
  }

  const sheet = paperSheet(w, h, tint, random);
  const print = canvas(w, h);
  const pctx = print.getContext('2d');
  pctx.drawImage(sheet, 0, 0);
  if (mirror) { pctx.translate(w, 0); pctx.scale(-1, 1); }
  pctx.drawImage(ink, 0, 0);
  return { print, sheet };
}

// ---- Sweep animation ------------------------------------------------------

export const LAY_SECONDS = 1.8;
export const HOLD_SECONDS = 0.35;
export const LIFT_SECONDS = 1;
export const PULL_SECONDS = LAY_SECONDS + HOLD_SECONDS + LIFT_SECONDS;

const smooth = (t) => t * t * (3 - 2 * t);

// The contact line bows forwards in the middle, as a sheet lowered by its edges does.
function contactPath(ctx, w, h, x, bow, closeLeft) {
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.quadraticCurveTo(x + bow, h / 2, x, h);
  if (closeLeft) {
    ctx.lineTo(-bow, h);
    ctx.lineTo(-bow, 0);
  } else {
    ctx.lineTo(w + bow, h);
    ctx.lineTo(w + bow, 0);
  }
  ctx.closePath();
}

// Draws the moving sheet over the tank at `elapsed` seconds into the pull.
// The whole tank is covered by the end of the lay and uncovered by the end of the lift.
export function drawSweep(ctx, { print, sheet }, elapsed) {
  const { width: w, height: h } = ctx.canvas;
  const bow = w * 0.05;
  ctx.save();
  if (elapsed < LAY_SECONDS + HOLD_SECONDS) {
    // Laying: the sheet's back, with ink starting to show through behind the contact line.
    const t = Math.min(elapsed / LAY_SECONDS, 1);
    const x = smooth(t) * (w + bow * 2) - bow * 2;
    ctx.save();
    contactPath(ctx, w, h, x, bow, true);
    ctx.clip();
    ctx.drawImage(sheet, 0, 0, w, h);
    ctx.globalAlpha = 0.3 * t;
    ctx.drawImage(print, 0, 0, w, h);
    ctx.restore();
    // The part still in the air casts a shadow onto the bath ahead of the line.
    if (t < 1) {
      const shadow = ctx.createLinearGradient(x, 0, x + bow * 2.5, 0);
      shadow.addColorStop(0, 'rgba(0,0,0,.4)');
      shadow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadow;
      ctx.fillRect(x, 0, bow * 3.5, h);
    }
  } else {
    // Lifting: the sheet comes away from the left, leaving the tank behind it.
    const t = Math.min((elapsed - LAY_SECONDS - HOLD_SECONDS) / LIFT_SECONDS, 1);
    const x = smooth(t) * (w + bow * 2) - bow * 2;
    ctx.save();
    contactPath(ctx, w, h, x, bow, false);
    ctx.clip();
    ctx.drawImage(sheet, 0, 0, w, h);
    ctx.globalAlpha = 0.3;
    ctx.drawImage(print, 0, 0, w, h);
    ctx.restore();
  }
  ctx.restore();
}

// ---- Gallery: prints kept in IndexedDB, so they survive a reload --------------

const DB = 'marbler';
const STORE = 'pulls';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const savePull = (blob) => withStore('readwrite', (s) => s.add({ blob, date: Date.now() }));
export const listPulls = () => withStore('readonly', (s) => s.getAll());
export const deletePull = (id) => withStore('readwrite', (s) => s.delete(id));
