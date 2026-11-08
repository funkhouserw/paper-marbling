// Cells: every drop keeps its own cell. Drops that land together are laid out together as their
// settled shapes, by partial optimal transport (stone.js, as the broom-straw throw was): each takes
// its area, packed drops share straight walls, and what no drop reaches is bare bath. A drop landing in
// an earlier colour's cell nests inside it and squeezes it (τ); one landing in a cell of its own
// colour merges into it. It doesn't matter which tool put the ink down: a drop, a spray, Fill dots
// or a broom throw are all drops here. Tools that move ink (rakes, combs, stirs) act as in Classic.
import { Marble } from './engine.js';

export class Cells extends Marble {
  get cellsLayout() { return true; }

  // The pressure law (cells take the area at which their pressures balance, filmPressure; 5ec856e)
  // and sites drifting down pressure differences (808cd94), on by default again since e4053b3: re-laid
  // cells keep their site and weight, the first tick of a throw converges, and the drift is per
  // second, so a second colour no longer shatters the first (law.test.mjs, six seeds). Still open:
  // a walled throw asking for more than the tank holds at the cap (proposal: cap its spread at the room).
  get cellsPressure() { return true; }
  get cellDrift() { return true; }

  // A drop's cell spreads to at most this many times its plain area, times what its gall adds (so
  // with Rising gall each later colour reaches further). A broom throw asks for 25, which on open
  // water let one flick cover several tanks, so its cells came out few and huge.
  // In a walled or repeating tank the walls bound the ink, so a drop spreads as far as its ink asks and
  // the pressure law squeezes what doesn't fit (otherwise small drops stayed small dots near the walls
  // while the films around them filled the tray). The cap is for open water, where a flick asked for
  // ×25 would spread over several tanks.
  get cellSpreadMax() { return this.wallsOn || this.tileOn ? Infinity : 8; }

  // Squeezed ink thickens to at most this, so a later colour can take up to ~70% of a cell (photo
  // 31). How dark that looks is softened separately (tintOf).
  get cellTauMax() { return 3.5; }

  // The layout keeps each cell inside one tile only with walls; it doesn't repeat yet.
  get tileSupported() { return false; }

  // A plain drop joins this tick's batch instead of growing by itself. Drops with their own way of
  // landing (Shell bands, clear gall water, Stormont) land as in Classic.
  _advanceDrop(op, dt) {
    if (op.kind !== 'drop' || op.clear || op.stormont || op.cellBatched === false) return super._advanceDrop(op, dt);
    if (!op.cellBatched) {
      op.cellBatched = true;
      (this._cellBatch ??= []).push(op);
    }
    return true;
  }

  // At the end of the tick, the batch becomes one layout, solved over the next ticks as its drops
  // spread (see _landBroom).
  _flushGrowth() {
    super._flushGrowth();
    const batch = this._cellBatch;
    if (!batch?.length) return;
    this._cellBatch = null;
    const drops = batch.map((op) => ({ x: op.x, y: op.y, quantity: op.quantity, spreading: op.spreading, gall: op.gall, color: op.color, shimmer: op.shimmer }));
    this.active.push({ kind: 'broom', drops, spreading: batch[0].spreading, seam: this.seam, color: batch[0].color, shimmer: batch[0].shimmer, at: this.time });
  }
}
