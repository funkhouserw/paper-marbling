// The simulators to choose from. A simulator with its own engine adds an `engine` class here.
import { Film } from './film.js';
import { ThinFilm } from './thinfilm.js';
import { Wake } from './wake.js';
import { GridInkGL } from './gridgl.js';

export const MODELS = [
  {
    id: 'classic',
    label: 'Classic',
    title: 'The original: drops keep a fixed size and each one pushes everything, water included.',
    spreading: false,
  },
  {
    id: 'spreading',
    label: 'Spreading',
    title: 'Ink spreads over bare water until it meets other ink.',
    spreading: true,
  },
  {
    id: 'thinfilm',
    label: 'Thin film (beta)',
    title: 'Tracks how much surface each ink can still claim. Bare water has no pressure, so films only feel each other once they touch.',
    spreading: false,
    engine: ThinFilm,
  },
  {
    id: 'film',
    label: 'Film',
    title: 'Ink is a film that carries pressure and water is not. Films ignore each other until they touch, then push as one.',
    spreading: false,
    engine: Film,
  },
  {
    id: 'wake',
    label: 'Wake',
    title: 'Film, in a bath that keeps moving. Tools leave a flow that lasts longer the thinner the bath is, with curls and wobble behind fast rakes. Try viscosity 5 to 60.',
    spreading: false,
    engine: Wake,
  },
  {
    id: 'gridink',
    label: 'Grid ink (beta)',
    title: 'Ink is colour on a grid, moved by a full fluid solve (BiMocq2), so it blends softly and flows can run as long as you like. Always repeats. Runs on the GPU where it can.',
    spreading: false,
    repeats: true,
    engine: GridInkGL,
  },
];
