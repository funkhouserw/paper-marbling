// Draws a tank away from the page, so that the simulation and the page never wait for it. Outlines
// arrive whole and are thinned first to what the screen can show. See wakefast.js.
import { thin, underpaintWidth } from './thin.js';
import { latticeShifts } from './tile.js';
import { seamed } from './seam.js';

const translucent = (color) => /^#(.{4}|.{8})$|^(rgba|hsla)\(/.test(color) && !/^#.{3}f$|^#.{6}ff$/i.test(color);
let canvas = null;

// Where to draw an outline so that it covers the tank, as in Marble.tileShifts.
function shifts(points, W, H, offset) {
  let left = Infinity, right = -Infinity, low = Infinity, high = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    if (points[i] < left) left = points[i];
    if (points[i] > right) right = points[i];
    if (points[i + 1] < low) low = points[i + 1];
    if (points[i + 1] > high) high = points[i + 1];
  }
  return latticeShifts(-W / 2 - right, W / 2 - left, -H / 2 - high, H / 2 - low, W, H, offset);
}

function box(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    if (points[i] < x0) x0 = points[i]; if (points[i] > x1) x1 = points[i];
    if (points[i + 1] < y0) y0 = points[i + 1]; if (points[i + 1] > y1) y1 = points[i + 1];
  }
  return [x0, y0, x1, y1];
}

function trace(ctx, points, sx, sy) {
  ctx.moveTo(points[0] + sx, points[1] + sy);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i] + sx, points[i + 1] + sy);
  ctx.closePath();
}

self.onmessage = ({ data: m }) => {
  const start = performance.now();
  const { width, height, px, W, H, bath, tile, offset, closeGaps, polys, xy, tolPx, join, seam = 0 } = m;
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
  const whole = [];
  const thinned = polys.map((p, k) => {
    let points = thin(xy, p.off, p.n, tol);
    whole[k] = points;
    if (half) {
      const first = !p.group || polys[k - 1]?.group !== p.group;
      points = Array.from(seamed(Float64Array.from(points), points.length / 2, half, first));
    }
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
    ctx.beginPath();
    do {
      for (const [sx, sy] of where(thinned[p])) trace(ctx, thinned[p], sx, sy);
    } while (group && polys[p + 1]?.group === group && ++p);
    ctx.fillStyle = color;
    ctx.fill(group ? 'evenodd' : 'nonzero');
    // Overlaps with earlier drops of the same colour are filled whole: those have merged, so no
    // seam shows inside them. Drops that only touch keep theirs. As in Marble.draw.
    if (half && !group) {
      const b = box(whole[p]);
      for (let q = 0; q < p; q++) {
        if (polys[q].group || polys[q].base !== polys[p].base) continue;
        const c = box(whole[q]);
        if (c[0] > b[2] || c[2] < b[0] || c[1] > b[3] || c[3] < b[1]) continue;
        ctx.save();
        ctx.beginPath();
        for (const [sx, sy] of where(whole[q])) trace(ctx, whole[q], sx, sy);
        ctx.clip();
        ctx.beginPath();
        for (const [sx, sy] of where(whole[p])) trace(ctx, whole[p], sx, sy);
        ctx.fill();
        ctx.restore();
      }
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
