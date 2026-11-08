// Draws a tank away from the page, so that the simulation and the page never wait for it. Outlines
// arrive whole and are thinned first to what the screen can show. See wakefast.js.
import { thinKept, underpaintWidth } from './thin.js';
import { latticeShifts } from './tile.js';
import { seamed, mergedPoints, bareSeam, contactKeep, contactRuns, bandWidth } from './seam.js';
import { squeezedColour } from './tint.js';

const translucent = (color) => /^#(.{4}|.{8})$|^(rgba|hsla)\(/.test(color) && !/^#.{3}f$|^#.{6}ff$/i.test(color);
let canvas = null;

// Where to draw an outline so that it covers the tank, as in Marble.tileShifts.
// points: one outline, or a list of them (a group's loops).
function shifts(points, W, H, offset) {
  let left = Infinity, right = -Infinity, low = Infinity, high = -Infinity;
  for (const loop of Array.isArray(points) ? points : [points]) {
    for (let i = 0; i < loop.length; i += 2) {
      if (loop[i] < left) left = loop[i];
      if (loop[i] > right) right = loop[i];
      if (loop[i + 1] < low) low = loop[i + 1];
      if (loop[i + 1] > high) high = loop[i + 1];
    }
  }
  return latticeShifts(-W / 2 - right, W / 2 - left, -H / 2 - high, H / 2 - low, W, H, offset);
}

function trace(ctx, points, sx, sy) {
  ctx.moveTo(points[0] + sx, points[1] + sy);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i] + sx, points[i + 1] + sy);
  ctx.closePath();
}

self.onmessage = ({ data: m }) => {
  const start = performance.now();
  const { width, height, px, W, H, bath, tile, offset, closeGaps, polys, xy, tolPx, join, seam = 0, share = 0, touch = 2 * seam, edgeTau, edgeFaces } = m;
  if (!canvas || canvas.width !== width || canvas.height !== height) canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = bath;
  ctx.fillRect(0, 0, width, height);
  ctx.setTransform(px, 0, 0, -px, (W / 2) * px, (H / 2) * px);
  const tol = tolPx / px;
  let kept = 0;
  // Keep cells separate: each loop drawn half a seam into its ink (a hole's loop outward).
  const half = seam / 2;
  // Thinned outlines, with the edge marks (#33) of the points kept.
  const kept0 = polys.map((p) => thinKept(xy, p.off, p.n, tol));
  const whole = polys.map((p, k) => { const ix = kept0[k], out = new Float64Array(ix.length * 2); ix.forEach((i, w) => { out[w * 2] = xy[(p.off + i) * 2]; out[w * 2 + 1] = xy[(p.off + i) * 2 + 1]; }); return out; });
  const faces = polys.map((p, k) => (edgeFaces ? Uint8Array.from(kept0[k], (i) => edgeFaces[p.off + i]) : null));
  const taus = polys.map((p, k) => (edgeTau ? Float32Array.from(kept0[k], (i) => edgeTau[p.off + i]) : null));
  // Points inside another drop of the same colour aren't pulled in: those drops have merged.
  const merged = half ? mergedPoints(polys.map((p, k) => ({ xy: whole[k], n: whole[k].length / 2, color: p.base ?? p.color, group: p.group })), touch) : null;
  const thinned = polys.map((p, k) => {
    let points = whole[k];
    // Holes (later loops of a group, gall water) are never seamed, as in Marble.draw.
    const first = !p.group || polys[k - 1]?.group !== p.group;
    if (half && first) points = seamed(points, points.length / 2, half, true, contactKeep(merged[k], faces[k], points.length / 2), p.group ? half : bareSeam(points, points.length / 2, seam, share) / 2);
    kept += points.length / 2;
    return points;
  });
  const where = (points) => (tile ? shifts(points, W, H, offset) : [[0, 0]]);
  // Film's underpaint, which closes thin gaps. None with Keep cells separate, or for a broom cell.
  ctx.lineJoin = join;
  for (let p = 0; p < polys.length && !half; p++) {
    const { group, color, off, n, cell } = polys[p];
    if (group || cell || translucent(color)) continue;
    ctx.lineWidth = underpaintWidth(xy, off, n, closeGaps * 2);
    ctx.beginPath();
    for (const [sx, sy] of where(thinned[p])) trace(ctx, thinned[p], sx, sy);
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  for (let p = 0; p < polys.length; p++) {
    const { group, color } = polys[p];
    const first = p;
    ctx.fillStyle = color;
    if (group) {
      while (polys[p + 1]?.group === group) p++;
      // Each repeat is filled on its own: a shape longer than the tile overlaps its own copies, and in
      // one even-odd path the overlap would cancel (#47).
      for (const [sx, sy] of where(thinned.slice(first, p + 1))) {
        ctx.beginPath();
        for (let k = first; k <= p; k++) trace(ctx, thinned[k], sx, sy);
        ctx.fill('evenodd');
      }
    } else {
      ctx.beginPath();
      for (const [sx, sy] of where(thinned[p])) trace(ctx, thinned[p], sx, sy);
      ctx.fill('nonzero');
    }
    // Plateau borders (see Marble.draw).
    const runs = half ? contactRuns(whole[first], whole[first].length / 2, faces[first], taus[first]) : null;
    if (runs) {
      ctx.save();
      ctx.lineCap = 'round';
      for (const { tau, seg } of runs) {
        ctx.beginPath();
        for (const [sx, sy] of where(whole[first])) for (let i = 0; i < seg.length; i += 4) { ctx.moveTo(seg[i] + sx, seg[i + 1] + sy); ctx.lineTo(seg[i + 2] + sx, seg[i + 3] + sy); }
        ctx.lineWidth = 2 * (bandWidth(tau) + half);
        ctx.strokeStyle = squeezedColour(polys[first].base ?? color, Math.max(tau, polys[first].tau ?? 1));
        ctx.stroke();
      }
      ctx.restore();
    }
    if (!half && !group && !polys[p].cell && !translucent(color)) {
      ctx.lineWidth = 1.2 / px;
      ctx.lineJoin = join;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  }
  const bitmap = canvas.transferToImageBitmap();
  self.postMessage({ id: m.id, bitmap, ms: performance.now() - start, points: m.total, kept }, [bitmap]);
};
