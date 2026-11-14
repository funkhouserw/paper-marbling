// Shimmer's textures repeat with the tile, so a repeating design has no shimmer seam.
import test from 'node:test';
import assert from 'node:assert/strict';
import { texturePeriod } from './tile.js';

const whole = (v) => Math.abs(v - Math.round(v)) < 1e-9;

test('a whole number of repeats fits the tile both ways', () => {
  for (const [W, H] of [[1000, 700], [700, 1000], [500, 500], [300, 210], [2000, 100]]) {
    for (const period of [819.2, 179.2]) {
      const p = texturePeriod(period, W, H);
      assert.ok(whole(W / p.x) && whole(H / p.y), `${W}x${H} at ${period}`);
    }
  }
});

test('a brick offset gets an even count across, a half-drop an even count up', () => {
  for (const [W, H] of [[1000, 700], [700, 1000], [300, 210], [820, 820]]) {
    for (const period of [819.2, 179.2]) {
      const b = texturePeriod(period, W, H, 'brick');
      assert.equal((W / b.x) % 2, 0);
      assert.ok(whole(H / b.y));
      const d = texturePeriod(period, W, H, 'halfDrop');
      assert.equal((H / d.y) % 2, 0);
      assert.ok(whole(W / d.x));
    }
  }
});

test('the stretch stays close to the texture\'s own size where the tile allows', () => {
  const p = texturePeriod(179.2, 1000, 700);
  assert.ok(Math.abs(p.x / 179.2 - 1) < 0.2 && Math.abs(p.y / 179.2 - 1) < 0.2);
});
