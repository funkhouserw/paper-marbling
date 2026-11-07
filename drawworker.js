// Draws a tank away from the page, so that the simulation and the page never wait for it. Outlines
// arrive whole and are thinned first to what the screen can show. See wakefast.js.
import { thin, underpaintWidth } from './thin.js';
import { latticeShifts } from './tile.js';
import { seamed, mergedPoints } from './seam.js';

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
  const whole = polys.map((p) => Float64Array.from(thin(xy, p.off, p.n, tol)));
  // Points inside another drop of the same colour aren't pulled in: those drops have merged.
  const merged = half ? mergedPoints(polys.map((p, k) => ({ xy: whole[k], n: whole[k].length / 2, color: p.base ?? p.color, group: p.group }))) : null;
  const thinned = polys.map((p, k) => {
    let points = whole[k];
    if (half) {
      const first = !p.group || polys[k - 1]?.group !== p.group;
      points = seamed(points, points.length / 2, half, first, merged[k]);
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
