# Roadmap

Where Marbler is heading. There are no dates, and the order can change.

## Working now

Everything in [How it works](how-it-works.html): seven simulators, the full set of tools, repeating tanks (straight, brick and half-drop), scripts, prints and paper pulls.

## Up next

1. **A nicer interface.** Marbler has been a rough demo so far. Once the features, explanations and examples are in place, the interface gets a proper redesign, drawing on how Figma, Photoshop and Canva handle tools and panels. It'll be tried out on its own branch first.
2. **Grid ink catches up.** Offset repeats, the eraser, freezing ink and Hearts.

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
- Thin film leaves thin seams and ignores `dispersion`.
- On a busy tank, clicks can wait for the current tick to finish.
- Spreading and Thin film don't repeat.
