# Bibliography

What Marbler draws on, what we took from each source, and where it shows up. Sources are grouped by how much they shaped the code. Where a source was only partly read, or a detail is from memory, the entry says so. Citation details marked "checked" were confirmed against Crossref, CTAN or GitHub on 2026-11-07.

See [`NOTICE`](NOTICE) for licence terms.

## Foundations: code or maths used directly

**Jaffer, Aubrey. pst-marble, v. 1.6 (2019). LaTeX/PSTricks package. LPPL 1.3c. Copyright 2018–2019 Aubrey Jaffer; maintained by Aubrey Jaffer, Manuel Luque and the late Jürgen Gilg.** https://ctan.org/pkg/pst-marble. Maintainers, version and licence checked on CTAN; the 1.6 release date (30 April 2019) is from a search summary of the package documentation, not checked directly.
- **Took:** Marbler's starting point. the drop and tine formulas, the idea of marbling as a list of actions, and the view of raking as a continuous, reversible mapping of the surface.
- **Where:** `engine.js`, which identifies itself as a modified reimplementation that applies the formulas incrementally. Classic is the direct descendant.
- **Changed:** motion plays out tick by tick, instead of a finished picture being computed. Everything else is built on top of that.

**Jaffer, Aubrey. "Dropping Paint" and related marbling pages.** https://people.csail.mit.edu/jaffer/Marbling/Dropping-Paint
- **Took:** the drop map and its argument for preserving area, where a point at distance r moves to sqrt(r² + s).
- **Where:** Classic's drops; Grid ink's drops, read backwards; the near-drop map in Film.

**Jaffer, Aubrey G. "Oseen Flow in Paint Marbling." arXiv:1702.02106, v4, 2018.** https://arxiv.org/abs/1702.02106
- **Took:** the published form of the tine and stylus field that `_tine` is translated from: the Oseen displacement around a moving tine, with reach L = speed × D² / viscosity, averaged over a stroke's two ends so that a stroke is close to reversible. The code came through pst-marble's `/stylus-deformation`; the paper explains it, and states that the map doesn't preserve area exactly.
- **Where:** `engine.js`, `Marble._tine`, so every rake, comb and stylus in Classic, and the tools in Spreading, Thin film, Film and Wake.
- **Note:** read in full on 2026-11-03, after `_tine` was written. The PDF is kept with our research notes.

**Lu, S., Jaffer, A., Jin, X., Zhao, H., Mao, X. "Mathematical Marbling." IEEE Computer Graphics and Applications 32(6), 26–35, 2012.** DOI 10.1109/MCG.2011.51 (checked). Open copy: https://www.gwern.net/doc/cs/cellular-automaton/2012-lu.pdf
- **Took:** the paper form of the same closed-form operations, which most marbling software builds on.
- **Where:** background to `engine.js`.

**Qu, Z., Zhang, X., Gao, M., Jiang, C., Chen, B. "Efficient and Conservative Fluids Using Bidirectional Mapping" (BiMocq²). ACM Transactions on Graphics 38(4), Article 128, 2019.** DOI 10.1145/3306346.3322945 (authors checked)
- **Took:** Grid ink's whole method: forward and backward maps, reading fields from a checkpoint, error correction, accumulating changes through the forward map, the projection coefficient of 2 or 1, the dual-mesh trace back, and the check that the maps still agree.
- **Where:** `gridink.js`, `gridgl.js`.
- **Differs:** the header of `gridink.js` lists every difference, including one map level instead of two, a torus instead of walls, and our own checkpoint threshold.

**Qu, Z. et al. Bimocq, official code. MIT.** https://github.com/ziyinq/Bimocq
- **Took:** I read its 2D solver, `src/bimocq2D/BimocqSolver2D.cpp`, and followed its step order and constants: 5-sample weights, the midpoint velocity, neighbour clamping, `blend_coeff = 1`. It's a rewrite in JavaScript and GLSL, not a copy, but it follows that code closely.
- **Where:** `gridink.js`, `gridgl.js`.

**Bridson, R., Hourihan, J., Nordenstam, M. "Curl-Noise for Procedural Fluid Flow." ACM Transactions on Graphics 26(3), Article 46 (SIGGRAPH 2007).** DOI 10.1145/1276377.1276435 (checked)
- **Took:** a smooth random flow built as the curl of a noise field, which can't compress ink overall.
- **Where:** the Air tool, `air.js`. Measured divergence is under 2e-4 per second.

**Perlin, K. "Improving Noise." ACM Transactions on Graphics 21(3), 681–682 (SIGGRAPH 2002).** DOI 10.1145/566654.566636 (checked)
- **Took:** gradient noise with the quintic fade curve, used as Air's stream function so that the flow, its curl, is smooth too.
- **Where:** `air.js`.

**Wong, M. T., Zongker, D. E., Salesin, D. H. "Computer-Generated Floral Ornament." SIGGRAPH 1998, 423–434.** https://dl.acm.org/doi/10.1145/280814.280948 (checked)
- **Took:** the greedy loop: find the largest free disc, fill it, repeat.
- **Where:** `fillDots`, `fill.js`. We took this through florilegium and didn't read the paper itself.

**Makhoul, J. "A Fast Cosine Transform in One and Two Dimensions." IEEE Transactions on Acoustics, Speech, and Signal Processing 28(1), 27–34, 1980.** DOI 10.1109/TASSP.1980.1163351 (checked)
- **Took:** computing sine and cosine transforms with an n-point complex FFT.
- **Where:** `dst.js`, used by Wake's flow solver.
- **Note:** the method is cited from memory. I didn't reread the paper.

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
- **VortexShedding:** https://github.com/amandaghassaei/VortexShedding. No licence, so read-only. Flow past obstacles.

**Nervous System. Blog post on marbled puzzles.** https://n-e-r-v-o-u-s.com/blog/?p=9225
- **Took:** confirmation that others combine a fluid solve with curl noise for marbling. No code or specifics.

**Kevin Raymond, florilegium.** MIT. https://github.com/kevinraymond/florilegium
- **Took:** the practice of growing a composition by filling the largest hole, which led to `fillDots`. It was also my route to Wong et al.

## Physics that shaped Film, Wake and spreading

These changed how we think about the models. None are implemented as written, and no parameter is calibrated against them. I found no source that measures marbling ink films directly, so applying oil-slick and surfactant results to ink is an analogy.

**McNair, R., Jensen, O. E., Landel, J. R. "Confinement-induced drift in Marangoni-driven transport of surfactant: a Lagrangian perspective." Journal of Fluid Mechanics 986, A5, 2024.** DOI 10.1017/jfm.2024.334 (checked). https://arxiv.org/abs/2310.09559
- **Took:** the most direct marbling physics we found. A deposit spreads "until the edges meet a solid boundary or the edges of another deposit", and larger deposits compress others. It backs the idea that big drops can fill a tank.
- **Where:** the reasoning behind Spreading, Film and "films ignore each other until they touch". An early Monge-Ampère prototype came from it, but wasn't kept.

**Sun, Yue, Bush, John W. M., Spagnolie, Saverio E., Rycroft, Chris H. "Hydrodynamics of marbling art." Physical Review Fluids 9, 110506, 2024 (Gallery of Fluid Motion).** DOI 10.1103/PhysRevFluids.9.110506 (checked). https://people.math.wisc.edu/~spagnolie/Papers/sbsr24.pdf. A three-page gallery piece with no equations; the physics is in chapter 4 of Sun's 2024 Harvard thesis (https://dash.harvard.edu/handle/1/37378811). Citation corrected on 2026-11-03 from marble-fable's survey. I originally worked from a summary.
- **Took:** paint spreads through a balance of surface tensions, and surfactant makes it spread into thinner layers, so how far a drop goes depends on the ink. New colours shift the balance and move what's there.
- **Where:** per-drop `spreading`, and my dropping of a single "minimum thickness" rule. It's also why Print's "thin ink looks paler" stays an artistic option: the paper didn't confirm it. Jaffer's "Pigment Transport in Paint Marbling" (2019, under Read along the way) does give a paleness law, so Print's option could follow it.

**Kim, I., Požár, N. "Porous medium equation to Hele-Shaw flow with general initial density." Transactions of the American Mathematical Society 370(2), 873–909, 2018.** DOI 10.1090/tran/6969 (checked). https://arxiv.org/abs/1509.06287

**Sulak, A., Turanova, O. "The Incompressible Limit of an Inhomogeneous Model of Tissue Growth." Acta Applicandae Mathematicae 203, 2026.** DOI 10.1007/s10440-026-00797-3 (checked). https://arxiv.org/abs/2503.19849 (we read the 2025 arXiv version)
- **Took (both):** the mathematical frame for ink as a film carrying pressure with a free edge, as a Hele-Shaw problem. They concern tumours and porous media, not ink.
- **Where:** `film.js`, described there as one-phase Hele-Shaw flow with a screened outer region. The screening and constants are ours.

**Jensen, O. E. "The spreading of insoluble surfactant at the free surface of a deep fluid layer." Journal of Fluid Mechanics 293, 349–378, 1995.** DOI 10.1017/S0022112095001741 (checked)
- **Took:** background on spreading in a deep layer, where the surface drags the fluid below. At first I had the abstract and citations only; the 2026-11-03 spreading scan read it in full, and it is what showed that the t^(3/4) spreading law only holds for a source held at constant strength.

**Fay, J. A., Hoult, D. P. "Physical Processes in the Spread of Oil on a Water Surface." Report for the U.S. Coast Guard, MIT, 1971. DTIC AD0726281.** https://apps.dtic.mil/sti/pdfs/AD0726281.pdf. Title, authors and date from the DTIC and TRID records found by search; I didn't open the PDF again.
- **Took:** spreading regimes driven by the spreading coefficient at the slick's edge. This supported the comparison with oil on water, as an analogy only.

**Wikipedia, "Marangoni effect."** https://en.wikipedia.org/wiki/Marangoni_effect
- **Took:** general background.

**Standard fluid mechanics and numerics, not from one source I can point to:**
- Vortex shedding behind a cylinder, Strouhal number about 0.2, starting near a Reynolds number of 40: Wake's tine wobble (`wake.js`).
- Flow around a moving cylinder: tine `width`.
- Wake's flow as vorticity carried by the flow, with velocity from a streamfunction (`wake.js`).
- Friction from a shallow floor, about viscosity / depth²: Wake and Grid ink.
- Beer-Lambert absorption: Print's thin ink.
- Periodic Green's function on a torus: Repeating (`tile.js`), which I derived rather than took from a text.
- The Lamb-Oseen vortex, angular speed Γ / r² × (1 − e^(−r² / 4νt)): Classic's `vortex` (`engine.js`). Jaffer treats it for marbling in "The Lamb-Oseen Vortex and Paint Marbling" (below); whether the code followed that paper or pst-marble's own vortex wasn't recorded.
- Marching squares, to trace text into outlines (`text.js`).
- Catmull-Rom sampling, clamped to the nearest four cells: Grid ink's one-off moves and drop pushes (`gridink.js`, `gridgl.js`).
- A mixed-radix Stockham FFT (`dst.js`).
- Contour surgery: cutting off ink ribbons too thin to see (`engine.js`, `_cutFilaments`). The name and the idea are Dritschel's (Dritschel, D. G. "Contour dynamics and contour surgery." Computer Physics Reports 10(3), 77–146, 1989, DOI 10.1016/0167-7977(89)90004-X, checked). Ours was written on 2026-11-01, before we read his rules, and is much cruder: it cuts where an outline comes within a fixed width of itself.

**Jaffer, Aubrey G. "The Lamb-Oseen Vortex and Paint Marbling." arXiv:1810.04646, 2018.** https://arxiv.org/abs/1810.04646
- **Took:** a closed-form, reversible model of a decaying vortex, and the finding that "French Curl" is made by circling a stylus, not by a true vortex. Read in full on 2026-11-03; useful as a check on Classic's vortex and Wake's shedding thresholds.

## Background on grid fluid solvers

**Stam, J. "Stable Fluids." SIGGRAPH 1999, 121–128.** DOI 10.1145/311535.311548 (checked). Open copy: http://pages.cs.wisc.edu/~chaol/data/cs777/stam-stable_fluids.pdf
- **Took:** the base method behind Grid ink's `method: 'semilag'` comparison, plus Wake's semi-Lagrangian vorticity transport and spectral solve in general form.

**Stam, J. The Art of Fluid Animation. 2004.** Listed by Ghassaei. Not read.

**Wong, Jamie. "Fluid Simulation (with WebGL demo)." 2016.** https://jamie-wong.com/2016/08/05/webgl-fluid-simulation/.
- **Took:** nothing I can name specifically. It's background on the same approach, and `gridgl.js`'s pressure passes are the common Jacobi form it and GPU Gems describe.

**Harris, Mark J. "Fast Fluid Dynamics Simulation on the GPU." GPU Gems, chapter 38, NVIDIA, 2004.** http://developer.download.nvidia.com/books/HTML/gpugems/gpugems_ch38.html. Author from memory, not checked.
- **Took:** the collocated Jacobi projection in `gridgl.js` is this standard recipe. I wrote it from general knowledge. The link came up in Ghassaei's references, and I didn't reread it.

## Compared against: nothing taken

Surveyed so that we'd know what exists. No code or methods came from these.

- Marblizer, Nick Walker: https://github.com/nickswalker/marblizer (MIT). Browser, scripted, the closest to Marbler. We first found it through the fork https://github.com/cihat/marblizer.
- Ebru: https://apps.apple.com/app/id6758916412
- Marbling by danybittel: https://danybittel.itch.io/marbling
- The Coding Train, "Mathematical Marbling": https://thecodingtrain.com/challenges/183-mathematical-marbling
- Jin, X., Chen, S., Mao, X. "Computer-Generated Marbling Textures: A GPU-Based Design System." IEEE Computer Graphics and Applications 27(2), 78–84, 2007. https://doi.org/10.1109/MCG.2007.28 (checked)
- "Solid Mathematical Marbling": https://www.researchgate.net/publication/327027824_Solid_Mathematical_Marbling
- Others that came up: PaperMarbling (CableCry), marbellous (T. Erxleben, https://github.com/t-erxleben/marbellous), suminagashi (MarinovM03), marblingpy, tryebru, Ink Marbling, Battal Ebru. The open-source marbling apps we read more closely are under Read along the way.

## Found but not used

- Liu, Han, Liu. "TBR: Transport-Based Rendering with Deposition Strokes for Inverse Graphics." 2026. https://arxiv.org/abs/2609.08722. Fitting marbling strokes to a target image. Read in full on 2026-11-03: its area-exact pushing capsule is a candidate for Paint and Stripes.
- arXiv 1312.6590 (Marangoni spreading of alcohol on water), 1703.00327 (variable surface tension solver), 2008.05737 (fingering on polymer solutions), 2111.00699 (multi-GPU simulation). Turned up in searches. I only saw their abstracts.
- Paper Marbling Society and teaching pages from AIP, TeachEngineering and howtosmile. General background on suminagashi.

## Read along the way

Read, skimmed or summarised during the research of 3 November 2026, by me or by research agents I briefed. None of these is in the code yet. They shaped the roadmap and corrected what we believed, so they're credited here. "Abstract" means only the abstract was seen.

### Marbling papers

- **Jaffer, A. "Pigment Transport in Paint Marbling." 2019.** https://people.csail.mit.edu/jaffer/Marbling/transfer.pdf. Read in full by marble-fable. Gives a paleness law, I' = 1 − (1 − I)^γ with γ the normalised pigment thickness, and a map for how paper laying distorts a print. It's the planned source for Print's "thin ink looks paler" and for Pull paper.
- **Jaffer, A., Lu, S., Jin, X., Gao, F., Mao, X., Kaplan, C. S., Huang, Y. "The Physics of Ink Marbling." Slides, November 2017.** Read for the spreading scan.
- **Jaffer, A. "Marbling the Torus" and "Transfer Effects" pages.** https://people.csail.mit.edu/jaffer/Marbling/. Read as summaries. A closed form for tines on a repeating tank, and the family of paper-transfer distortions.
- **James, D. L., James, E. "Mixwell: Sharp 2D Fluid Brushes for Progressive Physics-Based Mixing." ACM Transactions on Graphics 45(4), 2026.** DOI 10.1145/3811312 (checked). https://dougjam.github.io/mixwell-2026/, code https://github.com/dougjam/mixwell-2026 (MIT). Read in full. Showed that Classic's finite strokes lose area, gives an incompressible tine brush, periodic comb composition and pattern recipes. Planned for exact tines, SVG combs and a per-pixel renderer. No code taken yet.
- **Ando, R., Tsuruno, R. "Vector Graphics Depicting Marbling Flow." Computers & Graphics 35(1), 148–159, 2011.** DOI 10.1016/j.cag.2010.11.002 (checked). Read in full. Placing outline points by curvature and vorticity, subdividing by rewinding time, area correction and thin-line removal: the plan for outline trimming.
- **Ando, R., Tsuruno, R. "Vector Fluid: A Vector Graphics Depiction of Surface Flow." NPAR 2010, 129–135.** DOI 10.1145/1809939.1809954 (checked). Read in full. The earlier version of the same method.
- **Acar, R., Boulanger, P. "Digital Marbling: A Multiscale Fluid Model." IEEE Transactions on Visualization and Computer Graphics 12(4), 600–614, 2006.** DOI 10.1109/TVCG.2006.66 (checked). Read in full. A sharp-edge transform for grid ink, a reaction term for spreading, local turbulence for suminagashi and reversing stirrers. All parked.
- **Gazziro, M., Gois, J. P., Tenorio Gonzales, C., Rodrigues Jr, J. "A Computational Method for Interactive Design of Marbling Patterns." SBGames 2018, pp. 352–361 (pages from our notes).** DOI 10.1109/SBGAMES.2018.00010 (authors checked). https://www.sbgames.org/sbgames2018/files/papers/ComputacaoFull/186763.pdf. Read in full. Display-time sharpening, recolouring an ink after the fact, and drops that grow while held.
- **Wen, Si. "Digital Marbling: A GPU Approach with Precomputed Velocity Field." University of Waterloo Technical Report CS-2014-08, 2014.** Archived copy: http://web.archive.org/web/20240705122737id_/https://cs.uwaterloo.ca/sites/ca.computer-science/files/uploads/files/cs-2014-08.pdf. Read in full. A stored response to a stylus instead of a fluid solve, which confirmed that Classic already is that kind of model.
- **Xu, J., Mao, X., Jin, X. "Nondissipative Marbling." IEEE Computer Graphics and Applications 28(2), 35–43, 2008.** DOI 10.1109/MCG.2008.36 (checked). Read in full. Higher-order advection for grid marbling.
- **Zhao, H., Jin, X., Lu, S., Mao, X., Shen, J. "AtelierM++: a fast and accurate marbling system." Multimedia Tools and Applications 44(2), 187–203, 2009.** DOI 10.1007/s11042-009-0290-z (checked). Read in full. Showed that earlier GPU marbling used multigrid pressure, not Jacobi.

### Spreading physics

- **Bickel, T., Detcheverry, F. "Exact solutions for viscous Marangoni spreading." Physical Review E 106, 045107, 2022.** DOI 10.1103/PhysRevE.106.045107 (checked). https://arxiv.org/abs/2209.05176. Key sections read in full. A cheap, exact spreading model for deep baths, the basis of the planned physical drops.
- **McNair, R., Temprano-Coleto, F., Peaudecerf, F. J., Gibou, F., Luzzatto-Fegiz, P., Jensen, O. E., Landel, J. R. "Exogenous–Endogenous Surfactant Interaction Yields Heterogeneous Spreading in Complex Branching Networks." Physical Review Letters 134, 034001, 2025.** DOI 10.1103/PhysRevLett.134.034001 (checked). Abstract. Spreading on an already-covered surface is felt across the whole connected film.
- **Lu, J., Zhang, Q., Ubal, S., Corvalán, C. "Surfactant spreading on liquid films in the Stokes regime." AIP Advances 12(12), 2022.** DOI 10.1063/5.0125503 (checked; our notes had it as Physics of Fluids). Abstract. The change in spreading speed once a drop is wider than the bath is deep.
- **Chan, S., Fried, E. "Marangoni spreading on liquid substrates in new media art." PNAS Nexus 3(2), pgae059, 2024.** DOI 10.1093/pnasnexus/pgae059 (checked). Skimmed through a summary. Rough drop edges and faint halos on shear-thinning baths.
- **Hsieh, T.-L., Garoff, S., Tilton, R. D. "Marangoni spreading time evolution and synergism in binary surfactant mixtures." Journal of Colloid and Interface Science 623, 685–696, 2022.** DOI 10.1016/j.jcis.2022.05.063 (checked). Abstract. A spreading pressure per ink; mixing gall isn't additive.
- **Ishii, T., Muro, J., Yamakoshi, Y., Shimizu, M. "'Suminagashi' used in studies on monolayers." Nippon Kagaku Kaishi 1987(11), 2064–2069.** DOI 10.1246/nikkashi.1987.2064 (checked). Abstract, in Japanese. A drop spreads only if its pressure beats the film it lands on; otherwise it beads.
- **Sauleda, M. L., Chu, H. C. W., Tilton, R. D., Garoff, S. "Surfactant Driven Marangoni Spreading in the Presence of Predeposited Insoluble Surfactant Monolayers." Langmuir 37(11), 3309–3320, 2021.** DOI 10.1021/acs.langmuir.0c03348 (checked). Abstract. Spreading fronts stop at equal surface pressure, and the stronger compresses the weaker.
- **Iasella et al., Journal of Colloid and Interface Science, 2024.** Abstract. The same finding for fronts meeting. Full citation not checked.
- **Jensen, O. E., Grotberg, J. B. "Insoluble surfactant spreading on a thin viscous film: shock evolution and film rupture." Journal of Fluid Mechanics 240, 259–288, 1992.** DOI 10.1017/S0022112092000090 (checked). From memory. The thin-film spreading rate.
- **Vernay, C., Ramos, L., Ligoure, C., 2015.** https://arxiv.org/abs/1511.00451. One passage read, for a deep-layer spreading rate law. Title not checked.

### Outlines and integration

- **Ramani, R. "Interface tracking with Microscale Topological Surgery for two-dimensional filament breakup." arXiv:2606.27615, 2026.** https://arxiv.org/abs/2606.27615. Most sections read. Trimming and merging hair-thin outlines against a pixel grid: the plan for outline trimming.
- **Dritschel, D. G. "Contour dynamics and contour surgery." Computer Physics Reports 10(3), 77–146, 1989.** DOI 10.1016/0167-7977(89)90004-X (checked). Read through a 1997 restatement. Curvature-based node placement and surgery rules (see also the standard methods above).
- **Hairer, E., Lubich, C., Wanner, G. Geometric Numerical Integration, 2nd ed. Springer, 2006.** DOI 10.1007/3-540-30666-8 (checked). Standard result, from memory. Implicit midpoint steps would make each tine stroke exactly area-preserving and reversible: the plan for exact tines.
- **Meunier, P., Villermaux, E. "The diffusive strip method for scalar mixing in two dimensions." Journal of Fluid Mechanics 662, 134–172, 2010.** DOI 10.1017/S0022112010003162 (checked). Abstract and memory. Drawing sub-pixel threads as a centreline with a width.

### Grid solvers

- **Yin, X.-Y., Mercier, O., Yadav, B., Schneider, K., Nave, J.-C. "A Characteristic Mapping method for the two-dimensional incompressible Euler equations." Journal of Computational Physics 424, 109781, 2021.** DOI 10.1016/j.jcp.2020.109781 (checked). https://arxiv.org/abs/1910.10841. Code https://github.com/CharacteristicMappingMethod/cmm-turbulence (GPL-3.0, read only). Sections 2–4 read. Stored backward maps, so colour is never resampled: the idea behind the planned Mapped simulators.
- **Mercier, O., Yin, X.-Y., Nave, J.-C. "The Characteristic Mapping Method for the Linear Advection of Arbitrary Sets." SIAM Journal on Scientific Computing 42(3), A1663–A1685, 2020.** DOI 10.1137/18M1234424 (checked). Sections 1–4.1. A bounded-memory variant.
- **Rabbani, A. H., Guertin, J.-P., Rioux-Lavoie, D., Schoentgen, A., Tong, K., Sirois-Vigneux, A., Nowrouzezahrai, D. "Compact Poisson Filters for Fast Fluid Simulation." SIGGRAPH 2022.** DOI 10.1145/3528233.3530737 (checked). Skimmed. A faster pressure solve for Grid ink; its code is CC BY-NC-ND, so any use would be reimplemented from the paper.
- **Li, Z., Wang, R., Li, J., Chen, D., Wang, S., Zhu, B. "EDGE: Epsilon-Difference Gradient Evolution for Buffer-Free Flow Maps." ACM Transactions on Graphics 44(4), 2025.** DOI 10.1145/3731193 (checked). Skimmed. Long-lived backward maps in fixed memory.
- **Sun, Y., Li, J., Wang, R., Wang, S., Li, Z., van Bloemen Waanders, B., Zhu, B. "Leapfrog Flow Maps for Real-Time Fluid Simulation." ACM Transactions on Graphics 44(4), 2025.** DOI 10.1145/3731180 (checked). Skimmed. Real-time flow maps and a multigrid pressure solve.
- **Li, X., Ni, X., Zhu, B., Wang, B., Chen, B. "GARM-LS: A Gradient-Augmented Reference-Map Method for Level-Set Fluid Simulation." ACM Transactions on Graphics 42(6), 2023.** DOI 10.1145/3618377 (checked). Abstract.
- **Narita, F., Ando, R. "Tiled Characteristic Maps for Tracking Detailed Liquid Surfaces." Computer Graphics Forum 41(8), 2022.** Abstract. Author initial and pages not checked.
- **Osher, S., Rudin, L. I. "Feature-Oriented Image Enhancement Using Shock Filters." SIAM Journal on Numerical Analysis 27, 919–940, 1990.** DOI 10.1137/0727053 (checked). Sections 1–3, via Gazziro. Display sharpening.
- **Bolz, J., Farmer, I., Grinspun, E., Schröder, P. "Sparse matrix solvers on the GPU: conjugate gradients and multigrid." SIGGRAPH 2003.** From memory. Multigrid on the GPU.
- **glsl-fft, Ricky Reusser.** https://github.com/rreusser/glsl-fft. An FFT in fragment shaders, for an exact pressure solve.

### Splats

- **Xing, J., Wang, B., Chu, M., Chen, B. "Gaussian Fluids: A Grid-Free Fluid Solver based on Gaussian Spatial Representation." SIGGRAPH 2025 Conference Papers.** DOI 10.1145/3721238.3730620 (checked). Code https://github.com/xjr01/Gaussian-Fluids-Code (MIT). Read the project page, README and limitations. Concluded that splat solvers don't suit marbling's viscous flows.
- **Tao, N. et al. "LagrangianSplats: Divergence-Free Transport of Gaussian Primitives for Fluid Reconstruction." SIGGRAPH 2026.** https://arxiv.org/abs/2605.09299. Method sections. The idea of fitting a tine's flow to video, planned with Ilse's experiments.
- **Xing, J. et al. "DDFKs: Fluid Simulation with Dynamic Divergence-Free Kernels." 2026.** https://arxiv.org/abs/2601.17693. Read through summaries.
- Also looked at, for a splat-based ink renderer, and set aside: Image-GS (https://arxiv.org/abs/2407.01866), GaussianImage (https://arxiv.org/abs/2403.08551), Bézier Splatting (https://arxiv.org/abs/2503.16424), WebSplatter (https://arxiv.org/abs/2602.03207), and regularised Stokeslets (Cortez 2001) and Kelvinlets (de Goes and James), from memory.

### Other marbling apps

Code read by a research agent for how others render marbling. Nothing copied. Licences as GitHub reports them.

- davipferr/suminagashi: https://github.com/davipferr/suminagashi (no licence). Refining outlines by chord error, then flattening to a raster with a coordinate map.
- rupe5h/marbling: https://github.com/rupe5h/marbling (MIT; its maths is pst-marble's). Inverse rendering on WebGPU with checkpoints.
- skalyan91/marbled-paper: https://github.com/skalyan91/marbled-paper (MIT). Jacobian antialiasing, and a wake-shaped tine kernel.
- erenciracioglu-dotcom/ebru: https://github.com/erenciracioglu-dotcom/ebru (MIT). A bake cache that changes cost but not the result.
- Jonas Luebbers, marbled-paper: https://github.com/nonphoto/marbled-paper (no licence file).
- kiwehhh/exhale: https://github.com/kiwehhh/exhale (MIT). Non-round drops.
- TringyTrongy/ebru: https://github.com/TringyTrongy/ebru (MIT). Bounding boxes so strokes skip unreachable outline.
- Nafiz001/ebru: https://github.com/Nafiz001/ebru (MIT). Strokes as a stream-function flow, keeping area within 2%.

### Craft sources

- **Halfer, Josef. The Progress of the Marbling Art, from Technical Scientific Principles. Translated by Herman Dieck. German original Die Fortschritte der Marmorierkunst, 1894.** https://www.gutenberg.org/ebooks/41241. Title and translator checked; the 1894 date is from our notes. With the two below, the marblers' rules (later colours need more gall, a strong colour squeezes a weak one into a ring, white veins from gall-water) that corrected our physics.
- **Jacquard Products, Marbling FAQs.** https://www.jacquardproducts.com/s/Marbling-FAQs-zy93.pdf
- **Dharma Trading Co., marbling troubleshooting pages.** Exact page not recorded.

### Pointed to but not read

Named in the papers above. Only titles seen.

- Mao, X., Suzuki, T., Imamiya, A. "AtelierM." GRAPHITE 2003. DOI 10.1145/604471.604489 (checked). The first digital marbling system.
- Suzuki et al. "Simulating Marbling with Computer Graphics." IASTED VIIP 2001.
- Akgün, "The Digital Art of Marbled Paper." Leonardo 37(1), 2004.
- Eroglu, S., Weyers, B., Kuhlen, T. "Fluid sketching: Bringing ebru art into VR." Mensch und Computer 2018 workshops.
- Lu, S., Jin, X., Zhao, H., Zhao, Y. "Real-time image marbleization." Multimedia Tools and Applications 64(3), 795–808. DOI 10.1007/s11042-012-0989-0 (checked).
- Khalid & Egli, "Precomputed 3D Velocity Field for Simulating Fluid Dynamics." Game Engine Gems 1, 2010.
- Galerkin, Sugimoto, Lait, Batty, Hachisuka, regularized Stokeslets for curves, 2024. https://arxiv.org/abs/2409.18276
- Crowdy, uniform flow past a periodic array of cylinders, 2016, and Crowdy, SIAM Journal on Applied Mathematics 81, 2021, DOI 10.1137/21M1400316.
- Temprano-Coleto & Stone, Journal of Fluid Mechanics 2024, DOI 10.1017/jfm.2024.563.

## Further reading

Recommended in Ilse's marbling reference notes, for pattern names and history. Not yet read or used, and titles not checked.

- Wolfe, Richard J. Marbled Paper: Its History, Techniques, and Patterns. 1990.
- Easton, Phoebe Jane. Marbling: A History and a Bibliography. 1983.
- Chambers, Anne. The Practical Guide to Marbling Paper. 1986.
- Maurer-Mathison, Diane. The Ultimate Marbling Handbook. 1999.

## Colour and AI services

- **Palettes (`palettes.js`):** artistic interpretations, not historical pigment matches. The academia palettes began from dark academia palette web pages of doubtful quality. **Which pages wasn't recorded**, so I can't cite them.
- **OpenAI pricing and API documentation:** https://developers.openai.com/api/docs/pricing, and the function-calling and prompt-caching guides. Used for the assistant in `server.mjs`, which calls OpenAI's `gpt-6-luna` model by default (set by `MARBLE_MODEL`).

## Software Marbler is built with

The simulators have no runtime dependencies. The new interface in `app/` bundles these libraries into the built site. Their licence texts are in [`NOTICE`](NOTICE).

- React, react-dom and scheduler (Meta Platforms, MIT): the interface.
- lucide-react (Lucide Icons and Contributors, ISC), including icons derived from Feather (Cole Bemis, MIT): the icons. The comb icon is our own, drawn in lucide's style.
- CodeMirror 6 (Marijn Haverbeke and others, MIT): the script editor, with its packages `@codemirror/state`, `view`, `language`, `commands`, `search`, `autocomplete`, `lint`, `lang-javascript` and `theme-one-dark`.
- Lezer (`@lezer/common`, `highlight`, `lr`, `javascript`), style-mod, w3c-keyname, crelt and `@marijn/find-cluster-break` (Marijn Haverbeke, MIT): CodeMirror's parser and helpers.
- Tailwind CSS (Tailwind Labs, MIT): the styles.

Thanks also to the tools Marbler is built and tested with, none of which ship in it: Vite, esbuild, Storybook, Vitest, Playwright, oxlint and Node.js. The interface names the Inter and JetBrains Mono fonts, but doesn't bundle them, so they appear only where already installed. Text in the tank is traced from fonts on your own system.

The pictures in `docs/images` are presumed to be Marbler's own renders. The commit that added them doesn't say so.

## Contributors, not sources

- **Claude (Anthropic):** Marbler was written with Claude, including a first film prototype and the research behind this list. First-person notes here are Claude's.
- **Ilse:** the physics corrections that shaped the project (oil on water, no pushing before contact), and the ideas for tiling, snapshots and adding models instead of replacing them.

## Licences

See [`NOTICE`](NOTICE) for what applies to each source, including the conditions on the code derived from pst-marble, and for the licences of the bundled libraries.
