// A comb's reach as an option (for column grounds and Peacock's fans): default unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble } from './engine.js';

const comb = (reach) => {
  const m = new Marble({ width: 600, height: 400, seed: 1 });
  m.setViscosity({ value: 20 }); // thin: the pull would reach far without the cap
  const op = m.rake({ from: [-250, 0], to: [250, 0], teeth: 8, spacing: 20, speed: 100, D: 10, reach, at: 0 });
  return { m, L: op.L };
};

test('by default a tine reaches at most half the gap to the next; reach raises that', () => {
  assert.equal(comb(undefined).L, 10);
  assert.equal(comb(1.2).L, 24);
  // Never past the tank's own cap.
  assert.ok(comb(50).L <= 400 / 14 + 1e-9);
});

test('reach is logged only when set, and replays', () => {
  const plain = comb(undefined).m;
  assert.equal('reach' in plain.log[0].args, false, 'older logs stay identical');
  const wide = comb(1.2).m;
  assert.equal(wide.log.at(-1).args.reach, 1.2);
  const again = new Marble({ width: 600, height: 400, seed: 1 }).replay(wide.log);
  assert.equal(again.pending.find((o) => o.kind === 'rake').L, 24);
});

test('fullRake passes reach through', () => {
  const m = new Marble({ width: 600, height: 400, seed: 1 });
  m.setViscosity({ value: 20 });
  const op = m.fullRake({ teeth: 20, reach: 1, at: 0 });
  assert.equal(op.L, Math.min(400 / 20, 400 / 14));
});
