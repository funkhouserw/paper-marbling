// How dark squeezed ink looks, shared by the engine and the drawing worker. No DOM.
const tintCache = new Map();
// How dark squeezed ink looks: by √τ, so how far ink squeezes (its area, which sets how much room a
// later colour gets) and how dark it turns are separate. Photo 31's net is squeezed about 3.5 times
// but reads as dark brown, not black.
export const tintOf = (tau) => Math.sqrt(Math.max(1, tau));

export function squeezedColour(color, tau) {
  tau = tintOf(tau);
  if (tau <= 1.02 || !/^#[0-9a-f]{6}$/i.test(color)) return color;
  const key = `${color}|${Math.round(tau * 20)}`;
  let out = tintCache.get(key);
  if (!out) {
    const n = parseInt(color.slice(1), 16);
    const t = Math.round(tau * 20) / 20;
    out = `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(255 * (1 - (1 - v / 255) ** (1 / t))).toString(16).padStart(2, "0")).join("")}`;
    tintCache.set(key, out);
  }
  return out;
}

// Paint thick ↔ thin (row 62): pigment per area, both ways. Thinner paint (τ < 1) has less pigment over
// the same area and prints lighter; thicker (τ > 1) darker, by the same law as squeezed ink, which only
// darkens. Unlike squeezedColour this does not skip small changes.
export function paintColour(color, tau) {
  if (!(tau > 0) || tau === 1 || !/^#[0-9a-f]{6}$/i.test(color)) return color;
  const t = Math.sqrt(tau);
  const n = parseInt(color.slice(1), 16);
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(255 * (1 - (1 - v / 255) ** (1 / t))).toString(16).padStart(2, '0')).join('')}`;
}
