// Cells under the pressure law (#38): a same-colour drop on a laid cell is a cell of its own beside it, so
// no cell becomes a giant by swallowing the drops that land on it (research/2026-11-09-cells-size-spread.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cells } from './cells.js';

class LawCells extends Cells { get cellsPressure() { return true; } get cellDrift() { return true; } }
const area = (p) => { let a = 0; for (let i = 0, k = p.n - 1; i < p.n; k = i++) a += p.xy[k * 2] * p.xy[i * 2 + 1] - p.xy[i * 2] * p.xy[k * 2 + 1]; return Math.abs(a / 2); };

// The walled stone recipe's brown stage: four flicks of one colour, rising gall.
function brown(seed) {
  const m = new LawCells({ width: 1000, height: 700, seed, bath: '#e9e6df' });
  m.separate({ on: true, at: 0 });
  m.walls({ on: true, at: 0 });
  m.setGall({ on: true, start: 1, step: 0.5 });
  const size = (2.5 / 60 / Math.exp(0.9 ** 2 / 2)) * 0.7;
  for (const [x, y] of [[-250, -120], [250, 120], [220, -170], [-230, 170]]) {
    m.broom({ n: 60, x, y, w: 500, h: 500, size, spread: 0.9, spreading: 25, color: '#3b2b24' });
    for (let t = 0; t < 4000 && m.busy; t++) m.step();
  }
  return m.polys.filter((p) => p.cell && !p.parentCell && p.n >= 3);
}

for (const seed of [11, 5, 2]) {
  test(`law on, seed ${seed}: four brown flicks leave no giant`, () => {
    const top = brown(seed);
    const areas = top.map(area).sort((a, b) => a - b);
    const p90 = areas[Math.floor(0.9 * areas.length)], most = areas.at(-1);
    // Merged into their hosts, one cell reached 84k mm² against a p90 of 10k; as siblings 17-22k against 6k.
    assert.ok(most <= 4 * p90, `largest ${most.toFixed(0)} mm² against p90 ${p90.toFixed(0)}`);
    // Not asserted: cells crowded against the walls can still be squeezed past their cap (τ up to 5.6 on
    // seed 2 locally, 4.7-8.8 on Modal's x64, against 11.9 before this rule). A capacity question at the
    // walls, not merging; open (handoff 2026-11-09 afternoon).
    assert.ok(top.length > 200, `${top.length} cells`);
  });
}
