# Roadmap

Where Marbler is heading. There are no dates, and the order can change.

## Working now

Everything in [How it works](how-it-works.html): eight simulators, the full set of tools (including the broom-straw flick and the drawn rake), Keep cells separate and rising ox gall for stone and vein marbling, repeating tanks (straight, brick and half-drop), scripts, prints and paper pulls, and a catalogue of traditional patterns with examples.

## Up next

1. **Stone marbling that matches a real broom-straw sheet in every simulator.** Fronts that stop short of each other (the bare channels between first-colour cells), and later colours that reach a real sheet's cover.
2. **More traditional patterns.** Tools for the ones that need them: a curl comb (French curl), a peacock or bouquet comb, a wide swirl (Şal), a resist or mask (Akkase, Yazılı), and rocking the paper as it's laid (Spanish).
3. **Grid ink catches up.** Offset repeats, the eraser, freezing ink, Hearts and Keep cells separate.

## After that

- **Lighter outlines:** merge same-colour outlines and draw hair-thin ribbons as a single line, so long sessions use about half the points.
- **Mapped Classic:** draw every pixel on the GPU through Classic's formulas, with no point limit and prints at any size. It starts with exact tines, which keep area precisely.
- **Physical drops:** real spreading maths, ink thickness, and which colour goes on top, as an option.
- **Edit a past step:** change an earlier action and watch the pattern replay.
- **Comparable scripts:** make the same script look more alike across simulators, starting with drop sizes.

## Smaller ideas

- Sharper points on hearts, with an option to skip Wake's underpaint on chosen ink
- Combs drawn as vector art
- Recolour an ink after the fact
- Hold to grow a drop
- More examples: bouquet, birdwing, thistle
- Reversing stirrers, and pegs that shed vortex streets
- Real walls in Classic
- Wake on several processor cores
- A sourced paleness law and paper-transfer distortion for prints
- Cloud rendering for very large prints

## Open questions

- **Grid ink's future:** polish it further, or build a stored-map flow that would make much of that polish unnecessary.
- **Matching reality:** nothing here is calibrated against real marbling. Two experiments would help: a filmed tine stroke through stripes, and a drop placed beside a settled drop, to see whether the far rim moves before they touch.

## Known bugs

- Small dark nicks can appear on Wake's edges. The cause isn't known yet.
- Long streaks can appear after raking spray dots. A fix is in, but it hasn't been confirmed.
- Thin film ignores `dispersion`.
- On a busy tank, clicks can wait for the current tick to finish.
- Spreading, Thin film and Cells don't repeat.
