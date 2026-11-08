// F3 (research/2026-11-08-fine-comb-analysis.md): a tine visits only the points near it, through a
// grid index built once a rake tick, instead of every point in the tank for every step of every tine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble } from './engine.js';
import { Film } from './film.js';

const scene = (Engine) => {
  const m = new Engine({ width: 300, height: 200, seed: 4 });
  m.stripes({ angle: 90, count: 14, colors: ['#963a33', '#3b5e4c', '#c9a24f'] });
  m.settle();
  m.fullRake({ angle: 0, teeth: 20, speed: 60 });
  m.settle();
  m.rake({ path: [[-120, 60], [0, -30], [120, 50]], teeth: 5, spacing: 10, speed: 60 });
  m.runUntilIdle(60);
  return m.polys.flatMap((p) => Array.from(p.xy.subarray(0, p.n * 2)));
};

for (const Engine of [Marble, Film]) {
  test(`${Engine.name}: tines that visit only nearby points move ink exactly as visiting every point did`, () => {
    class Everywhere extends Engine { _mapNear(f) { return this._map(f); } }
    const near = scene(Engine), all = scene(Everywhere);
    assert.equal(near.length, all.length);
    for (let i = 0; i < near.length; i++) assert.equal(near[i], all[i]);
  });
}
