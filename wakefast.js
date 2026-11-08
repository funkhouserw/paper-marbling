// Wake (fast): exactly Wake's results, reached and drawn differently. On a busy tank a frame costs far more
// than a tick (10 s against 0.1 s, measured at 380,000 points in software), and much of that detail
// is finer than a pixel. So the page sends a copy of the outlines to a worker, which thins and draws
// them, and the simulation carries on meanwhile. Exports and prints still use every point.
import { Wake } from './wake.js';
import { thickness, squeezedColour } from './engine.js';

const BODY_REACH = 13; // a wide tine's pull reaches 12 half-widths
const WHILE_MOVING_PX = 0.5; // how far a thinned outline may stray from the real one
const AT_REST_PX = 0.2;

// One worker for the page. A frame from a tank that has since gone is ignored.
let worker;
let inFlight = false;
let onFrame = null;
function start() {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  try {
    worker = new Worker(new URL('./drawworker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      inFlight = false;
      onFrame?.(data);
    };
    worker.onerror = () => { worker = null; inFlight = false; };
  } catch {
    worker = null;
  }
  return worker;
}

const boxesOf = new WeakMap(); // kept apart from the outlines so that saved tanks don't carry them
const CHUNK = 128; // points to a box when skipping outlines far from a tine

export class WakeFast extends Wake {
  // A tine only moves points near it, so outlines are split into short runs with bounding boxes,
  // and runs out of reach are skipped. A box is remade whenever its points move, so it's never out of
  // date, and the result is exactly what checking every point would give.
  _boxes(poly) {
    const known = boxesOf.get(poly);
    if (known && known.xy === poly.xy && known.n === poly.n && known.moved === this._moved) return known.boxes;
    const boxes = new Float64Array(Math.ceil(poly.n / CHUNK) * 4);
    for (let c = 0; c < boxes.length / 4; c++) this._box(poly, boxes, c);
    boxesOf.set(poly, { boxes, xy: poly.xy, n: poly.n, moved: this._moved });
    return boxes;
  }

  _box(poly, boxes, c) {
    const { xy, n } = poly;
    let left = Infinity, right = -Infinity, low = Infinity, high = -Infinity;
    for (let i = c * CHUNK, end = Math.min(n, (c + 1) * CHUNK) * 2; i * 2 < end; i++) {
      const x = xy[i * 2], y = xy[i * 2 + 1];
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < low) low = y;
      if (y > high) high = y;
    }
    boxes[c * 4] = left; boxes[c * 4 + 1] = right; boxes[c * 4 + 2] = low; boxes[c * 4 + 3] = high;
  }

  _within(bx, by, ex, ey, reach, run) {
    // Hard edges can move any point, and a repeating tank's reach wraps, so those check everything.
    if (this.wallsOn || this.tileOn) return run();
    this._region = [Math.min(bx, ex) - reach, Math.max(bx, ex) + reach, Math.min(by, ey) - reach, Math.max(by, ey) + reach];
    try { return run(); } finally { this._region = null; }
  }

  _tine(bx, by, ex, ey, L) {
    // Each step of a tine reaches 6 L plus the step, and a step is at most L. A little over, to be safe.
    return this._within(bx, by, ex, ey, 7 * L + 1, () => super._tine(bx, by, ex, ey, L));
  }

  _tineBody(bx, by, ex, ey, a) {
    return this._within(bx, by, ex, ey, BODY_REACH * a + 1, () => super._tineBody(bx, by, ex, ey, a));
  }

  _map(f, options) {
    const region = this._region;
    if (!region || this._feeding) {
      this._moved = (this._moved ?? 0) + 1; // everything may have moved, so every box is out of date
      return super._map(f, options);
    }
    const out = [0, 0];
    const [x0, x1, y0, y1] = region;
    for (const poly of this.polys) {
      if (poly.frozen) continue;
      const { xy, n } = poly;
      const boxes = this._boxes(poly);
      for (let c = 0, count = boxes.length / 4; c < count; c++) {
        if (boxes[c * 4] > x1 || boxes[c * 4 + 1] < x0 || boxes[c * 4 + 2] > y1 || boxes[c * 4 + 3] < y0) continue;
        for (let i = c * CHUNK * 2, end = Math.min(n, (c + 1) * CHUNK) * 2; i < end; i += 2) {
          f(xy[i], xy[i + 1], out);
          xy[i] = out[0];
          xy[i + 1] = out[1];
        }
        this._box(poly, boxes, c);
      }
    }
    for (const op of this.sources) {
      if (op.poly?.frozen) continue;
      f(op.x, op.y, out);
      op.x = out[0];
      op.y = out[1];
    }
    return undefined;
  }

  // Sends this tank to be drawn, if the worker is free. Returns false if the caller should draw it
  // the ordinary way: no worker, or metallic ink at rest, which only the page can paint.
  // Returns 'busy' if a frame is still being drawn, so try again soon. shown(timing) says whether
  // the finished frame should still go on the canvas.
  drawLive(ctx, pxPerMm, shown) {
    const w = start();
    if (!w) return false;
    if (!this.busy && this.polys.some((p) => p.shimmer > 0)) return false;
    if (inFlight) return 'busy';
    let total = 0;
    for (const p of this.polys) total += p.n;
    const xy = new Float64Array(total * 2);
    // Edge contacts (#33), offset like xy; τ 1 and bare where a shape has none or they're stale.
    const edgeTau = new Float32Array(total).fill(1);
    const edgeFaces = new Uint8Array(total);
    let off = 0;
    const polys = this.polys.map((poly) => {
      const { xy: from, n, group, cell } = poly;
      xy.set(from.subarray(0, n * 2), off * 2);
      if (poly.edgeTau?.length === n) edgeTau.set(poly.edgeTau, off);
      if (poly.edgeFaces?.length === n) edgeFaces.set(poly.edgeFaces, off);
      // Drawn as the page draws it: darker where squeezed (τ), and a broom cell keeps its seam.
      const p = { off, n, color: squeezedColour(poly.color, thickness(poly)), base: poly.color, group, cell };
      off += n;
      return p;
    });
    onFrame = ({ bitmap, ms, kept, points }) => {
      // The tank may have been replaced while this was drawing.
      if (shown({ ms, kept, points })) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.drawImage(bitmap, 0, 0);
        ctx.restore();
      }
      bitmap.close();
    };
    inFlight = true;
    w.postMessage({
      width: ctx.canvas.width, height: ctx.canvas.height, px: pxPerMm, W: this.width, H: this.height, bath: this.bath ?? 'transparent',
      tile: this.tileOn, offset: this.tileOffset, closeGaps: this.closeGaps, polys, xy, total,
      seam: this.seamsDrawn ? this.seam : 0, share: this.seamShare ?? 0, touch: this.touchReach, edgeTau, edgeFaces,
      tolPx: this.busy ? WHILE_MOVING_PX : AT_REST_PX, join: this.busy ? 'bevel' : 'round',
    }, [xy.buffer, edgeTau.buffer, edgeFaces.buffer]);
    return true;
  }
}
