// Cuts a circle out of a closed outline, for the eraser's lift mode: ink inside is gone and everything
// else stays exactly where it is. Reads n points of xy. Returns the pieces left as point arrays,
// none if the circle took it all, or null if the outline is untouched or too tangled to cut.
export function cutDisc(xy, n, cx, cy, r, step = 1) {
  // Turned to run counter-clockwise, so the ink is always on the left.
  let twice = 0;
  for (let i = 0, k = n - 1; i < n; k = i++) twice += xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const from = twice >= 0 ? i : n - 1 - i;
    px[i] = xy[from * 2] - cx;
    py[i] = xy[from * 2 + 1] - cy;
  }
  const r2 = r * r;

  // Where it crosses the circle, in order along the outline.
  const crossings = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = px[j] - px[i];
    const dy = py[j] - py[i];
    const a = dx * dx + dy * dy;
    if (a === 0) continue;
    const b = px[i] * dx + py[i] * dy;
    const c = px[i] * px[i] + py[i] * py[i] - r2;
    const root = b * b - a * c;
    if (root <= 0) continue;
    const s = Math.sqrt(root);
    for (const [t, entering] of [[(-b - s) / a, true], [(-b + s) / a, false]]) {
      if (t < 0 || t >= 1) continue;
      const x = px[i] + dx * t;
      const y = py[i] + dy * t;
      crossings.push({ seg: i, t, x, y, entering, angle: Math.atan2(y, x) });
    }
  }

  if (!crossings.length) {
    if (px[0] * px[0] + py[0] * py[0] < r2) return []; // all of it was inside
    let inside = false;
    for (let i = 0, k = n - 1; i < n; k = i++) {
      if ((py[i] > 0) !== (py[k] > 0) && 0 < px[i] + ((px[k] - px[i]) * (0 - py[i])) / (py[k] - py[i])) inside = !inside;
    }
    if (!inside) return null;
    return [keyhole(px, py, n, cx, cy, r, step)];
  }

  // A simple outline goes in and out by turns, and so its crossings alternate round the circle too.
  const count = crossings.length;
  for (let k = 0; k < count; k++) if (crossings[k].entering === crossings[(k + 1) % count].entering) return null;
  const round = [...crossings].sort((p, q) => p.angle - q.angle);
  round.forEach((c, k) => { c.place = k; });
  for (let k = 0; k < count; k++) if (round[k].entering === round[(k + 1) % count].entering) return null;

  // Each piece follows the outline outside the circle, then the circle back the other way, with the
  // ink still on its left, as far as the next place the outline comes out.
  const after = new Map();
  crossings.forEach((c, k) => after.set(c, crossings[(k + 1) % count]));
  const pieces = [];
  const done = new Set();
  for (const first of crossings) {
    if (first.entering || done.has(first)) continue;
    const out = [];
    let exit = first;
    do {
      done.add(exit);
      const enter = after.get(exit);
      out.push(exit.x, exit.y);
      for (let i = (exit.seg + 1) % n, left = (enter.seg - exit.seg + n) % n; left > 0; left--, i = (i + 1) % n) out.push(px[i], py[i]);
      out.push(enter.x, enter.y);
      const next = round[(enter.place - 1 + count) % count];
      const turn = (enter.angle - next.angle + 2 * Math.PI) % (2 * Math.PI);
      const parts = Math.max(1, Math.ceil((turn * r) / step));
      for (let k = 1; k < parts; k++) {
        const angle = enter.angle - (turn * k) / parts;
        out.push(r * Math.cos(angle), r * Math.sin(angle));
      }
      exit = next;
    } while (exit !== first && !done.has(exit));
    if (exit !== first) return null;
    pieces.push(place(out, cx, cy));
  }
  return pieces;
}

// A circle wholly inside the ink: the outline runs in to it along a cut of no width, round it, and back.
function keyhole(px, py, n, cx, cy, r, step) {
  let near = 0;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const d = px[i] * px[i] + py[i] * py[i];
    if (d < best) { best = d; near = i; }
  }
  const out = [];
  for (let k = 0; k <= n; k++) out.push(px[(near + k) % n], py[(near + k) % n]);
  const start = Math.atan2(py[near], px[near]);
  const parts = Math.max(8, Math.ceil((2 * Math.PI * r) / step));
  for (let k = 0; k <= parts; k++) {
    const angle = start - (2 * Math.PI * k) / parts;
    out.push(r * Math.cos(angle), r * Math.sin(angle));
  }
  return place(out, cx, cy);
}

function place(out, cx, cy) {
  const xy = new Float64Array(out.length);
  for (let i = 0; i < out.length; i += 2) {
    xy[i] = out[i] + cx;
    xy[i + 1] = out[i + 1] + cy;
  }
  return xy;
}
