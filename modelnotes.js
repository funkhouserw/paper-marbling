// What each simulator does, is good for, and gets wrong. How it works and the drop's FAQ both show
// these. A test checks that every simulator has notes.
export const MODEL_NOTES = {
  classic: {
    how: 'The original, and the direct descendant of pst-marble. Every drop pushes everything around it, water included, by the exact area-preserving formula, and a drop keeps its plain size.',
    good: 'Clean mathematical patterns, and the sharpest match to the published formulas.',
    limit: 'Drops push at a distance, before they touch anything, which real ink doesn\'t do.',
  },
  spreading: {
    how: 'A drop keeps growing while any of its edge faces bare water, up to its quantity times its spreading. Its push carries through ink and stops at its edge in each direction. A fully surrounded drop gets a quarter of that limit, which pushes the ink around it outward. A higher spreading works like adding surfactant.',
    good: 'Ink that behaves as if it covers the surface.',
    limit: 'The first attempt at this idea, and Film does it better. It doesn\'t repeat.',
  },
  thinfilm: {
    how: 'Solves a thin-film equation, c_t = div(c K grad P) with P = ln(c), where c is how many times over the ink here could cover its surface at its thinnest. Crowded ink flows towards less crowded ink, and a film stops once c falls to 1. Bare water has no pressure, so separate films don\'t feel each other until they touch.',
    good: 'Even rings.',
    limit: 'A beta. It leaves thin seams, ignores dispersion, and a lone drop stops short of its target size.',
  },
  film: {
    how: 'Ink carries pressure and water doesn\'t. Each tick with a growing drop solves one equation on a coarse grid, -div grad p + k² p = s, and moves every outline point by velocity -grad p. On water k is large, so pressure dies within millimetres and films ignore each other until they touch. On ink k is zero, so the push carries through and rings keep their area. Close to a drop, the exact radial map takes over so rings stay round.',
    good: 'Filling the canvas with ink that packs together. A good default.',
    limit: 'When drops stop feeding, all motion stops: the bath itself never moves.',
  },
  wake: {
    how: 'Film, in a bath that keeps moving. Tools push momentum into a 2D flow on a coarse grid, w_t + u·grad w = ν lap w − friction w + curl(force), so ink coasts and curls after a tool stops. Viscosity sets how long that lasts: at 1000 it stops almost at once, and at 5 to 60 ink coasts on for seconds. Past a Reynolds number of about 40, tines also wobble at the rate a cylinder sheds vortices. The Moving bath panel tunes it, and Whorls rolls wakes up into spirals.',
    good: 'Whorls, wakes and anything that should look fluid.',
    limit: 'Heavy, because stretched outlines grow to hundreds of thousands of points.',
  },
  wakefast: {
    how: 'Exactly Wake\'s simulation, drawn differently. The page sends a copy of the outlines to a background worker, which thins them to what the screen can show and draws them, while the simulation carries on. Exports and prints still use every point.',
    good: 'Busy Wake tanks that would otherwise stutter.',
    limit: 'The picture catches up rather than staying in step, and metallic ink only shows at rest.',
  },
  gridink: {
    how: 'A different approach: ink is colour on a grid, moved by a full fluid solve, after BiMocq² (Qu et al. 2019). An ordinary grid solver re-reads the ink every tick and blurs it a little each time. This one remembers where every cell came from, reads ink once through the accumulated map, and uses the round trip to measure and correct what was lost. Rakes drive the water, instead of dragging ink directly. It runs on the GPU through WebGL2, with a CPU fallback.',
    good: 'Soft blends, and flows that can run as long as you like without running out of points.',
    limit: 'A beta. It has a fixed resolution, it repeats unless you turn that off, and it doesn\'t have offsets, the eraser, freeze or Hearts yet.',
  },
};
