// Lays out dots the way ornament is grown in Wong, Zongker & Salesin (SIGGRAPH 1998), as used by
// florilegium: find the largest free disc, put a dot in it, repeat. Big holes fill first, so
// sizes fall into a natural hierarchy, and the dots end up evenly spread without looking gridded.
import { wrapX, wrapY } from './tile.js';

const STEP = 5; // mm between the points checked

export function dotGrid(width, height) {
  return { step: STEP, cols: Math.ceil(width / STEP) + 1, rows: Math.ceil(height / STEP) + 1 };
}

// How far each grid point is from the nearest marked one, by a chamfer sweep: at most about 8% over.
// On a repeating tank the grid's last row and column are its first again, so distance carries across
// the seams, and it takes a second round of sweeps to come all the way back round.
export function clearanceFrom(marked, cols, rows, step, tiled = false, offset = null) {
  const d = new Float64Array(cols * rows);
  for (let q = 0; q < d.length; q++) d[q] = marked[q] ? 0 : Infinity;
  const diagonal = step * Math.SQRT2;
  const relax = (q, col, row, dc, dr, cost) => {
    let c = col + dc;
    let r = row + dr;
    if (tiled) {
      if (offset === 'brick' && (r < 0 || r >= rows - 1)) c += (cols - 1) >> 1;
      if (offset === 'halfDrop' && (c < 0 || c >= cols - 1)) r += (rows - 1) >> 1;
      c = ((c % (cols - 1)) + cols - 1) % (cols - 1);
      r = ((r % (rows - 1)) + rows - 1) % (rows - 1);
    } else if (c < 0 || c >= cols || r < 0 || r >= rows) return;
    const v = d[r * cols + c] + cost;
    if (v < d[q]) d[q] = v;
  };
  for (let round = tiled ? 2 : 1; round > 0; round--) {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const q = row * cols + col;
      relax(q, col, row, -1, 0, step); relax(q, col, row, 0, -1, step); relax(q, col, row, -1, -1, diagonal); relax(q, col, row, 1, -1, diagonal);
    }
  }
  for (let row = rows - 1; row >= 0; row--) {
    for (let col = cols - 1; col >= 0; col--) {
      const q = row * cols + col;
      relax(q, col, row, 1, 0, step); relax(q, col, row, 0, 1, step); relax(q, col, row, 1, 1, diagonal); relax(q, col, row, -1, 1, diagonal);
    }
  }
  }
  if (tiled) {
    for (let row = 0; row < rows; row++) d[row * cols + cols - 1] = d[row * cols];
    for (let col = 0; col < cols; col++) d[(rows - 1) * cols + col] = d[col];
  }
  return d;
}

// taken lists room already used up: `circles` of { x, y, r } from the tank's centre, and a grid of
// how far each point is from other ink, `clearance`. Dots keep `gap` from both.
// On a repeating tank (tiled) there are no edges: a dot can sit across one, and distance wraps.
export function planDots({ width, height, minR, maxR, gap, margin, count, tightness, random, taken, tiled = false, offset = null }) {
  const apart = (dx, dy) => (tiled ? Math.hypot(wrapX(dx, dy, width, height, offset), wrapY(dx, dy, width, height, offset)) : Math.hypot(dx, dy));
  const { cols, rows } = dotGrid(width, height);
  const free = new Float64Array(cols * rows);
  for (let row = 0, q = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++, q++) {
      const x = col * STEP;
      const y = row * STEP;
      free[q] = tiled ? Math.max(width, height) : Math.min(x, width - x, y, height - y) - margin;
      if (taken?.clearance) free[q] = Math.min(free[q], taken.clearance[q] - gap - STEP / 2);
      for (const c of taken?.circles ?? []) free[q] = Math.min(free[q], apart(x - width / 2 - c.x, y - height / 2 - c.y) - c.r - gap);
    }
  }
  const dots = [];
  while (dots.length < count) {
    let biggest = 0;
    for (let q = 0; q < free.length; q++) if (free[q] > biggest) biggest = free[q];
    if (biggest < minR) break;
    // Any spot nearly as open as the best will do, so that it doesn't read as a lattice.
    const spots = [];
    for (let q = 0; q < free.length; q++) if (free[q] >= biggest * 0.8 && free[q] >= minR) spots.push(q);
    const q = spots[Math.floor(random() * spots.length)];
    const x = (q % cols) * STEP;
    const y = Math.floor(q / cols) * STEP;
    const room = free[q];
    const r = Math.max(minR, Math.min(maxR, room * (tightness + random() * (1 - tightness))));
    dots.push({ x: x - width / 2, y: y - height / 2, r });
    for (let row = 0, k = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++, k++) {
        const clear = apart(col * STEP - x, row * STEP - y) - r - gap;
        if (clear < free[k]) free[k] = clear;
      }
    }
  }
  return dots;
}

// Picks each dot's colour from those its nearest neighbours aren't using, weighted towards
// whichever colour has been used least, so that the mix stays balanced everywhere.
export function colourDots(dots, colors, random, tile = null) {
  const apart = (a, b) => (tile ? Math.hypot(wrapX(a.x - b.x, a.y - b.y, tile.width, tile.height, tile.offset), wrapY(a.x - b.x, a.y - b.y, tile.width, tile.height, tile.offset)) : Math.hypot(a.x - b.x, a.y - b.y));
  const used = colors.map(() => 0);
  dots.forEach((dot, i) => {
    const near = dots.slice(0, i)
      .map((o) => [apart(o, dot) - o.r - dot.r, o.colorIndex])
      .sort((a, b) => a[0] - b[0])
      .slice(0, Math.min(3, colors.length - 1))
      .map((n) => n[1]);
    let best = 0;
    let bestScore = -Infinity;
    colors.forEach((_, c) => {
      const score = (near.includes(c) ? -100 : 0) - used[c] + random() * 2;
      if (score > bestScore) { bestScore = score; best = c; }
    });
    dot.colorIndex = best;
    dot.color = colors[best];
    used[best] += dot.r * dot.r / (dots[0].r * dots[0].r);
  });
  return dots;
}
