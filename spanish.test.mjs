// Spanish as a Pull option: Jaffer's transfer map for rocking the paper as it's laid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spanishMap } from './paper.js';

test('with no rocking the map is the identity, and the paper takes paint evenly', () => {
  const map = spanishMap({ wavelength: 20 });
  for (const [p, q] of [[0, 0], [7.3, -2], [55, 10]]) {
    const [a, b, g] = map(p, q);
    assert.ok(Math.abs(a - p) < 1e-9 && Math.abs(b - q) < 1e-9 && g === 1);
  }
});

test('rocking conserves paint on average over a wave, and the factor stays within 0 to 2', () => {
  const lambda = 20;
  const map = spanishMap({ wavelength: lambda, along: (0.9 * lambda) / Math.PI });
  let lo = Infinity, hi = -Infinity, sum = 0, n = 0;
  // Over one wave of bath (a), γ averages to 1: the paper takes as much paint as it would laid flat.
  const k = (2 * Math.PI) / lambda, A = (0.9 * lambda) / Math.PI;
  for (let a = 0; a < lambda; a += 0.01) {
    const p = a + (A / 2) * Math.sin(k * a);
    const [back, , g] = map(p, 0);
    assert.ok(Math.abs(back - a) < 1e-6, 'the map inverts f');
    lo = Math.min(lo, g); hi = Math.max(hi, g);
    sum += g; n++;
  }
  assert.ok(lo >= 0 && hi <= 2, `γ in [${lo}, ${hi}]`);
  assert.ok(Math.abs(sum / n - 1) < 0.01, `mean γ ${sum / n}`);
  const [a0] = map(0, 0), [a1] = map(lambda, 0);
  assert.ok(Math.abs(a1 - a0 - lambda) < 1e-6, 'one wave of paper is one wave of bath');
});

test('too much rocking is clamped, so the contact line never goes backwards', () => {
  const lambda = 20;
  const map = spanishMap({ wavelength: lambda, along: lambda });
  let last = -Infinity;
  for (let p = 0; p < 2 * lambda; p += 0.05) {
    const [a, , g] = map(p, 0);
    assert.ok(g > 0, 'γ stays positive');
    assert.ok(a >= last - 1e-9, 'a keeps moving forward');
    last = a;
  }
});
