// Lays out dots the way ornament is grown in Wong, Zongker & Salesin (SIGGRAPH 1998), as used by
// florilegium: find the largest free disc, put a dot in it, repeat. Big holes fill first, so
// sizes fall into a natural hierarchy, and the dots end up evenly spread without looking gridded.
const STEP = 5; // mm between the points checked

export function planDots({ width, height, minR, maxR, gap, margin, count, tightness, random }) {
  const cols = Math.ceil(width / STEP) + 1;
  const rows = Math.ceil(height / STEP) + 1;
  const free = new Float64Array(cols * rows);
  for (let row = 0, q = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++, q++) {
      const x = col * STEP;
      const y = row * STEP;
      free[q] = Math.min(x, width - x, y, height - y) - margin;
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
        const clear = Math.hypot(col * STEP - x, row * STEP - y) - r - gap;
        if (clear < free[k]) free[k] = clear;
      }
    }
  }
  return dots;
}

// Picks each dot's colour from those its nearest neighbours aren't using, weighted towards
// whichever colour has been used least, so that the mix stays balanced everywhere.
export function colourDots(dots, colors, random) {
  const used = colors.map(() => 0);
  dots.forEach((dot, i) => {
    const near = dots.slice(0, i)
      .map((o) => [Math.hypot(o.x - dot.x, o.y - dot.y) - o.r - dot.r, o.colorIndex])
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
