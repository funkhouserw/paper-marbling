# Bibliography

What Marbler draws on, what we took from each source, and where it shows up. Sources are grouped by how much they shaped the code. Where a source was only partly read, or a detail is from memory, the entry says so.

See [`NOTICE`](NOTICE) for licence terms.

## Foundations: code or maths used directly

**Jaffer, Aubrey. pst-marble, v. 1.6 (2019), maintained by Jürgen Gilg and Manuel Luque. LaTeX/PSTricks package. LPPL 1.3c.** https://ctan.org/pkg/pst-marble.
- **Took:** Marbler's starting point. the drop and tine formulas, the idea of marbling as a list of actions, and the view of raking as a continuous, reversible mapping of the surface.
- **Where:** `engine.js`, which identifies itself as a modified reimplementation that applies the formulas incrementally. Classic is the direct descendant.
- **Changed:** motion plays out tick by tick, instead of a finished picture being computed. Everything else is built on top of that.

**Jaffer, Aubrey. "Dropping Paint" and related marbling pages.** https://people.csail.mit.edu/jaffer/Marbling/Dropping-Paint
- **Took:** the drop map and its argument for preserving area, where a point at distance r moves to sqrt(r² + s).
- **Where:** Classic's drops; Grid ink's drops, read backwards; the near-drop map in Film.

**Lu, S., Jaffer, A., Jin, X., Zhao, H., Mao, X. "Mathematical Marbling." IEEE Computer Graphics and Applications, 2012.** https://www.gwern.net/doc/cs/cellular-automaton/2012-lu.pdf
- **Took:** the paper form of the same closed-form operations, which most marbling software builds on.
- **Where:** background to `engine.js`.

**Qu, Z., Zhang, X., Gao, M., Jiang, C., Chen, B. "Efficient and Conservative Fluids Using Bidirectional Mapping" (BiMocq²). ACM Transactions on Graphics 38(4), Article 128, 2019.** DOI 10.1145/3306346.3322945
- **Took:** Grid ink's whole method: forward and backward maps, reading fields from a checkpoint, error correction, accumulating changes through the forward map, the projection coefficient of 2 or 1, the dual-mesh trace back, and the check that the maps still agree.
- **Where:** `gridink.js`, `gridgl.js`.
- **Differs:** the header of `gridink.js` lists every difference, including one map level instead of two, a torus instead of walls, and our own checkpoint threshold.

**Qu, Z. et al. Bimocq, official code. MIT.** https://github.com/ziyinq/Bimocq
- **Took:** I read its 2D solver, `src/bimocq2D/BimocqSolver2D.cpp`, and followed its step order and constants: 5-sample weights, the midpoint velocity, neighbour clamping, `blend_coeff = 1`. It's a rewrite in JavaScript and GLSL, not a copy, but it follows that code closely.
- **Where:** `gridink.js`, `gridgl.js`.

**Bridson, R., Hourihan, J., Nordenstam, M. "Curl-Noise for Procedural Fluid Flow." SIGGRAPH 2007.**
- **Took:** a smooth random flow built as the curl of a noise field, which can't compress ink overall.
- **Where:** the Air tool, `air.js`. Measured divergence is under 2e-4 per second.
- **Note:** citation details are partly from memory, by way of Ghassaei's reference list.

**Wong, M., Zongker, D., Salesin, D. "Computer-Generated Floral Ornament." SIGGRAPH 1998.** https://dl.acm.org/doi/10.1145/280814.280948
- **Took:** the greedy loop: find the largest free disc, fill it, repeat.
- **Where:** `fillDots`, `fill.js`. We took this through florilegium and didn't read the paper itself.

**Makhoul, J. "A Fast Cosine Transform in One and Two Dimensions." 1980.**
- **Took:** computing sine and cosine transforms with an n-point complex FFT.
- **Where:** `dst.js`, used by Wake's flow solver.
- **Note:** cited from memory. I didn't reread it this session.

## Direct inspiration and design

**Ghassaei, Amanda. "Digital Marbling." 2022.** https://blog.amandaghassaei.com/2022/10/25/digital-marbling/
- **Took:** the target look, and the case for BiMocq² over Stable Fluids. Also rakes as forces on the flow, curl noise as air, and the warning that fitting Jaffer's formula to a bounded space breaks strict area preservation, because expansion needs contraction elsewhere. Her stripes-then-comb layering and painterly edges shaped Paint, Stripes and soft edges.
- **Where:** Wake's whorls were the goal. Grid ink follows the method her post describes (BiMocq² instead of Stable Fluids, rakes as forces on the flow), written independently from the paper and the Bimocq code. Her published code is the older Stable Fluids method, so none of Grid ink came from it. Her repeating patterns partly motivated tiling, which was your idea.
- **Not taken:** any code. Her BiMocq² simulator is unreleased, and she calls it a "hacky research prototype".
- **Ideas from it not yet used:** combs drawn as vector art (stroke width as tine size, and many tiny tines for a brushed look), editing an earlier comb pass and seeing the result update, ink thickening as drops are added (slower spreading, darker and contracting pattern), Jaffer's comb formulas combined with a fluid solve, vortex streets behind obstacles, designed flow fields instead of combs, and bouquet, birdwing, dovetail and thistle patterns.

**Ghassaei, Amanda. gpu-io. MIT.** https://github.com/amandaghassaei/gpu-io
- **Took:** nothing in the code. When Grid ink was written I had only read a summary of its README. Our WebGL is hand-written.
- **Read since (2026-11-03):** the README, the fluid example, and the parts that handle devices without full float support. Worth borrowing: emulating smooth texture sampling in the shader when the GPU can't, falling back to half-precision floats, and keeping positions as an anchor plus a small offset so half precision stays accurate. Grid ink currently drops to the CPU on such devices.
- **Shape:** about 9,000 lines of TypeScript, MIT, four runtime dependencies, WebGL 1 or 2, with WebGPU planned.

**Ghassaei, Amanda. marbling-experiment and fluid examples.** https://apps.amandaghassaei.com/marbling-experiment/, https://github.com/amandaghassaei/marbling-experiment
- **Took:** a working reference for what an interactive version feels like.
- **Read (2026-11-03):** `marbling-experiment/src/simulation.ts` and `gpu-io/examples/fluid/index.js`, both MIT. Both are Stable Fluids: flow on a grid 8 times coarser than the screen, ink at full resolution, 3 to 5 Jacobi pressure passes reusing the last answer, and tracer particles drawn as trails. Grid ink uses 40 passes and ink only 3 times finer than its flow, so both are worth trying.
- **VortexShedding:** no licence, so read-only. Flow past obstacles.

**Nervous System. Blog post on marbled puzzles.** https://n-e-r-v-o-u-s.com/blog/?p=9225
- **Took:** confirmation that others combine a fluid solve with curl noise for marbling. No code or specifics.

**Kevin Raymond, florilegium.** MIT. https://github.com/kevinraymond/florilegium
- **Took:** the practice of growing a composition by filling the largest hole, which led to `fillDots`. It was also my route to Wong et al.

## Physics that shaped Film, Wake and spreading

These changed how we think about the models. None are implemented as written, and no parameter is calibrated against them. I found no source that measures marbling ink films directly, so applying oil-slick and surfactant results to ink is an analogy.

**McNair, R., Jensen, O. E., Landel, J. R. "Confinement-induced drift in Marangoni-driven transport of surfactant: a Lagrangian perspective." Journal of Fluid Mechanics 986, A5, 2024.** https://arxiv.org/abs/2310.09559
- **Took:** the most direct marbling physics we found. A deposit spreads "until the edges meet a solid boundary or the edges of another deposit", and larger deposits compress others. It backs the idea that big drops can fill a tank.
- **Where:** the reasoning behind Spreading, Film and "films ignore each other until they touch". An early Monge-Ampère prototype came from it, but wasn't kept.

**Sun, Bush, Spagnolie, Rycroft. "Hydrodynamics of marbling art." Physical Review Fluids 9, 110506, 2024 (Gallery of Fluid Motion).** https://people.math.wisc.edu/~spagnolie/Papers/sbsr24.pdf. A three-page gallery piece with no equations; the physics is in chapter 4 of Sun's 2024 Harvard thesis (https://dash.harvard.edu/handle/1/37378811). Citation corrected on 2026-11-03 from marble-fable's survey. I originally worked from a summary.
- **Took:** paint spreads through a balance of surface tensions, and surfactant makes it spread into thinner layers, so how far a drop goes depends on the ink. New colours shift the balance and move what's there.
- **Where:** per-drop `spreading`, and my dropping of a single "minimum thickness" rule. It's also why Print's "thin ink looks paler" stays an artistic option: the paper didn't confirm it. Jaffer's 2019 "Pigment Transport in Paint Marbling" does give a paleness law, I' = 1 − (1 − I)^γ with γ the normalised pigment thickness (read by marble-fable, not yet by me), so Print's option could follow it.

**Kim, I., Požár, N. "Porous medium equation to Hele-Shaw flow with general initial density." 2015.** https://arxiv.org/abs/1509.06287

**Sulak, A., Turanova, O. "The incompressible limit of an inhomogeneous model of tissue growth." 2025.** https://arxiv.org/abs/2503.19849
- **Took (both):** the mathematical frame for ink as a film carrying pressure with a free edge, as a Hele-Shaw problem. They concern tumours and porous media, not ink.
- **Where:** `film.js`, described there as one-phase Hele-Shaw flow with a screened outer region. The screening and constants are ours.

**Jensen, O. E. "Spreading of insoluble surfactant at the free surface of a deep fluid layer." Journal of Fluid Mechanics, 1995.** Abstract and citations only.
- **Took:** background on spreading in a deep layer, where the surface drags the fluid below.

**Fay and Hoult, DTIC report on oil-slick spreading.** https://apps.dtic.mil/sti/pdfs/AD0726281.pdf
- **Took:** spreading regimes driven by the spreading coefficient at the slick's edge. This supported the comparison with oil on water, as an analogy only.

**Wikipedia, "Marangoni effect."** https://en.wikipedia.org/wiki/Marangoni_effect
- **Took:** general background.

**Standard fluid mechanics, not from one source I can point to:**
- Vortex shedding behind a cylinder, Strouhal number about 0.2: Wake's tine wobble.
- Flow around a moving cylinder: tine `width`.
- Friction from a shallow floor, about viscosity / depth²: Wake and Grid ink.
- Beer-Lambert absorption: Print's thin ink.
- Periodic Green's function on a torus: Repeating (`tile.js`), which I derived rather than took from a text.

## Background on grid fluid solvers

**Stam, J. "Stable Fluids." SIGGRAPH 1999.** http://pages.cs.wisc.edu/~chaol/data/cs777/stam-stable_fluids.pdf
- **Took:** the base method behind Grid ink's `method: 'semilag'` comparison, plus Wake's semi-Lagrangian vorticity transport and spectral solve in general form.

**Stam, J. *The Art of Fluid Animation.* 2004.** Listed by Ghassaei. Not read.

**Wong, Jamie. "Fluid Simulation (with WebGL demo)." 2016.** https://jamie-wong.com/2016/08/05/webgl-fluid-simulation/.
- **Took:** nothing I can name specifically. It's background on the same approach, and `gridgl.js`'s pressure passes are the common Jacobi form it and GPU Gems describe.

**NVIDIA, GPU Gems, chapter 38, "Fast Fluid Dynamics Simulation on the GPU."** http://developer.download.nvidia.com/books/HTML/gpugems/gpugems_ch38.html
- **Took:** the collocated Jacobi projection in `gridgl.js` is this standard recipe. I wrote it from general knowledge. The link came up in Ghassaei's references, and I didn't reread it.

## Compared against: nothing taken

Surveyed so that we'd know what exists. No code or methods came from these.

- Marblizer: https://github.com/cihat/marblizer. Browser, scripted, the closest to Marbler.
- Ebru: https://apps.apple.com/app/id6758916412
- Marbling by danybittel: https://danybittel.itch.io/marbling
- The Coding Train, "Mathematical Marbling": https://thecodingtrain.com/challenges/183-mathematical-marbling
- Jin, X., Chen, S., Mao, X. "Computer-Generated Marbling Textures: A GPU-Based Design System." IEEE Computer Graphics and Applications 27(2), 2007. https://doi.org/10.1109/MCG.2007.28
- "Solid Mathematical Marbling": https://www.researchgate.net/publication/327027824_Solid_Mathematical_Marbling
- Others that came up: PaperMarbling (CableCry), marbellous (T. Erxleben), suminagashi (MarinovM03), marblingpy, tryebru, Ink Marbling, Battal Ebru.

## Found but not used

- Liu, Han, Liu. "TBR: Transport-Based Rendering with Deposition Strokes for Inverse Graphics." 2026. https://arxiv.org/abs/2609.08722. Fitting marbling strokes to a target image, which could be worth a read.
- arXiv 1312.6590 (Marangoni spreading of alcohol on water), 1703.00327 (variable surface tension solver), 2008.05737 (fingering on polymer solutions), 2111.00699 (multi-GPU simulation). Turned up in searches. I only saw their abstracts.
- Paper Marbling Society and teaching pages from AIP, TeachEngineering and howtosmile. General background on suminagashi.

## Colour and AI services

- **Palettes (`palettes.js`):** artistic interpretations, not historical pigment matches. The academia palettes began from dark academia palette web pages of doubtful quality. **Which pages wasn't recorded**, so I can't cite them.
- **OpenAI pricing and API documentation:** https://developers.openai.com/api/docs/pricing, and the function-calling and prompt-caching guides. Used for the assistant in `server.mjs`.

## Contributors, not sources

- **Claude (Anthropic):** Marbler was written with Claude, including a first film prototype and the research behind this list. First-person notes here are Claude's.
- **Ilse:** the physics corrections that shaped the project (oil on water, no pushing before contact), and the ideas for tiling, snapshots and adding models instead of replacing them.

## Licences

See [`NOTICE`](NOTICE) for what applies to each source, including the conditions on the code derived from pst-marble.
