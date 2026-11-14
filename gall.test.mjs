// Ox gall: per-drop strength, the opening rule, and the bath-wide level that rises with each colour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble } from './engine.js';
import { Film } from './film.js';

const area = ({ xy, n }) => {
  let s = 0;
  for (let i = 0, k = n - 1; i < n; k = i++) s += xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
  return Math.abs(s) / 2;
};
const tank = (Engine = Marble, spreading = false) => {
  const m = new Engine({ width: 1000, height: 700, seed: 1, viscosity: 1000 });
  if (spreading) m.openWater();
  return m;
};
const lone = (o, Engine) => {
  const m = tank(Engine);
  m.drop({ quantity: 0.5, ...o });
  m.runUntilIdle();
  return area(m.polys[0]);
};

for (const [name, Engine] of [['Classic', Marble], ['Film', Film]]) {
  test(`${name}: gall 1 spreads as drops always have, and more gall spreads further`, () => {
    const plain = lone({}, Engine);
    assert.ok(Math.abs(lone({ gall: 1 }, Engine) - plain) < 0.01 * plain);
    assert.ok(lone({ gall: 3 }, Engine) > plain * 1.3);
    assert.ok(lone({ gall: 0.3 }, Engine) < plain * 0.8);
  });

  test(`${name}: a drop no stronger than the ink it lands on stays a dot; a stronger one opens`, () => {
    const second = (gall) => {
      const m = tank(Engine);
      m.drop({ quantity: 1.5, gall: 1, color: '#111111' });
      m.settle();
      const d = m.drop({ quantity: 0.2, gall, color: '#999999' });
      m.runUntilIdle();
      return area(m.polys.find((p) => p.color === '#999999')) / (Math.PI * d.maxArea);
    };
    assert.ok(second(1) < 1.1, `equal gall stays at its plain size: ${second(1)}`);
    assert.ok(second(4) > 1.3, `more gall opens over the ink: ${second(4)}`);
  });
}

test('Spreading: against ink a drop gets its gall margin of its spread', () => {
  const second = (gall) => {
    const m = tank(Marble, true);
    m.drop({ quantity: 1.5, gall: 1, color: '#111111' });
    m.settle();
    const d = m.drop({ quantity: 0.2, gall, color: '#999999' });
    m.runUntilIdle();
    return area(m.polys.find((p) => p.color === '#999999')) / (Math.PI * d.maxArea);
  };
  assert.ok(second(1) < 1.1);
  assert.ok(second(6) > second(2) && second(2) > 1.05, `${second(2)} then ${second(6)}`);
});

test('the bath gives each new colour more gall, starts again on a new tank, and replays', () => {
  const m = tank();
  m.setGall({ start: 1, step: 0.5 });
  const a = m.drop({ color: '#111111' });
  const b = m.drop({ color: '#222222' });
  const c = m.drop({ color: '#111111' });
  const own = m.drop({ color: '#333333', gall: 0.2 });
  assert.deepEqual([a.gall, b.gall, c.gall, own.gall], [1, 1.5, 1, 0.2]);
  m.runUntilIdle();
  const again = tank().replay(m.log);
  again.runUntilIdle();
  assert.deepEqual(again.polys.map((p) => Math.round(area(p))), m.polys.map((p) => Math.round(area(p))));
  assert.equal(tank().drop({ color: '#222222' }).gall, undefined, 'a new tank has no gall until it is set');
  m.setGall({ on: false });
  assert.equal(m.drop({ color: '#444444' }).gall, undefined);
});

test('Classic: a second gall drop opens over a colour an earlier gall drop already cut', () => {
  const m = tank(Marble);
  m.broom({ n: 40, size: 0.15, color: '#1f4e79' });
  m.settle();
  m.runUntilIdle();
  for (const x of [-180, -60, 60]) {
    m.drop({ x, y: 0, quantity: 0.5, color: 'clear', gall: 3 });
    m.settle();
    m.runUntilIdle();
    assert.equal(m.shapesAt(x, 0, { one: true }).length, 0, `bare bath at x=${x}`);
  }
});
