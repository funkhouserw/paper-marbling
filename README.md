# Marbler

Simulated ink marbling, based on the mathematics of
[pst-marble](https://ctan.org/pkg/pst-marble) by Aubrey Jaffer (LPPL 1.3c).
This is a modified reimplementation in JavaScript, not the original package.

## Run

    python3 -m http.server 8000     # then open http://localhost:8000
    node --test engine.test.mjs thinfilm.test.mjs server.test.mjs     # tests

To chat with the assistant that edits the script, put `OPENAI_API_KEY=...` in `../.env.local` (outside this repo) and run the local server instead:

    node server.mjs

## Script commands

`api.js` is the catalogue of every command, with types, defaults and units. The assistant's instructions are generated from it, and a test checks it against the engine.

Scripts work on a 0 to 100 page, the way CSS percentages do, and the engine converts to mm internally:

- **Positions:** `x` is % of the width from the left, `y` is % of the height from the top, so `50, 50` is the centre.
- **Sizes and distances:** % of the width, so circles stay round on any tank.
- **`quantity`:** % of the tank's area the drop covers.
- **Equal spacing:** a `y` step is the `x` step divided by `ASPECT`.
- **Time and angles:** seconds and degrees. Angle 0 is right, 90 up, 180 left, 270 down.
- **`W` and `H`:** always 100.
- **Sidebar sliders:** size-like sliders run 0 to 100 across a useful range, so their numbers aren't script values. `tools.js` defines them, and the assistant gets the conversion from it.

- **Timeline:** drops start at the current cursor and don't move it, so consecutive
  drops grow together. Tools move the cursor by their duration, and `wait` moves it
  further. `at` sets an explicit start time.
- **`settle()`:** everything after it waits until every drop has stopped growing and
  every earlier tool has finished, however long that takes. Later times count from then.
- **Drop size:** `quantity` is the amount of ink, as the share of the tank it covers at plain size.
- **Simulators:** `models.js` lists them. Classic is the original physics. Under Spreading, ink covers the surface: a drop keeps growing while any of its edge faces bare water, up to `quantity` x `spreading` (4 by default), and its push carries through ink and stops at its edge in each direction. A fully surrounded drop gets a quarter of that limit, which is what pushes the ink around it outward. A higher `spreading` works like adding surfactant to a paint. A script can pick one with `openWater({ on })`.
- **Film simulator:** choose it from the Simulator list. Ink carries pressure and water doesn't, so films ignore each other until they touch, then push as one. A drop landing on ink gets its plain size; one with water at its edge spreads up to `quantity` x `spreading`. Gaps where films meet stop closing at about 5 mm, so each ink's outline is also painted 3.5 mm wide under all the ink, on canvas and in SVG, which also grows edges facing real water by 3.5 mm. Translucent inks skip this, so their seams can show.
- **Base colour:** the UI has none by default. An empty tank shows a soft grid, which is
  never exported, so PNG and SVG exports have transparent backgrounds.
- **Growth:** `area(t) = final area × (1 − e^(−dispersion × t))`.

- **Colours:** any CSS colour, including translucent `#rrggbbaa` or `rgba(...)`.
- **Palettes and shimmer:** `palette(name)` returns `{ bath, inks }`, and an ink can be passed
  as `color`. `drop`, `print` and `text` take `shimmer` from 0 to 1 for metallic ink.
- **Printed ink:** `text` and `print` ink never expands, but every later action moves it.

## Wake

The **Wake** simulator is Film in a bath that keeps moving. Rakes push momentum into a flow on a 7 mm grid, and the flow lasts longer the thinner the bath is: at viscosity 1000 it stops almost at once, so the picture stays close to Film, and at viscosity 5 to 60 ink coasts on for seconds and curls where the rake stopped. Past a Reynolds number of about 40 (speed x tine thickness / viscosity), tines also leave a wobble. Thin baths also narrow a tine's direct drag. Only rakes make flow so far: stir, vortex and the other tools don't. The flow's edge is the tank's edge, with or without walls.

## Print

The **Print** button in Export makes a 3000 pixel picture of the tank on paper and downloads it as a PNG, showing its progress. It doesn't change the tank, and works with every simulator except for gap closing, which only Film does. **Thin ink looks paler** tints the paper less where a drop spread further. Nothing confirms real ink behaves this way, so it's subtle and can be turned off. **Rims and texture** are artistic touches, not simulated.

## Paper pull

**Pull paper** lays a sheet across the tank, shows the print and downloads it as a PNG.
Pulls are also kept in the browser (IndexedDB) and listed in the Paper section.
Options there set the paper tint, how imperfect the pull is (uneven pickup, grain, air
bubbles, a hesitation line) and whether the tank is cleared afterwards. Prints read the
same way round as the tank unless **Mirror like a real print** is on.

## Direction

Positive `degrees` and `circulation` turn counter-clockwise and negative clockwise. In
`stir`, a negative radius reverses that ring.

## Limits

- SVG export has flat colours only, without shimmer. PNG export and paper pulls include it.
- Without `walls`, the tank has no walls: ink pushed past the rectangle continues outside the view.
- With `walls`, `shift` and `turn` smear ink along the walls because it's clamped there.
- With `walls`, ink slows and compresses near the walls but doesn't spread along them, so ink dragged hard into a wall thins to a sliver and loses most of its area.
- Neighbouring open-water drops stop about 8 mm apart. Drops of one colour only read as joined when the gap is under about a pixel, and they always stay separate outlines.
- Quantity sets area only, and a drop's ink has one flat colour.
