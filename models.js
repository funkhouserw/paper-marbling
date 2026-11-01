// The simulators to choose from. A simulator with its own engine adds an `engine` class here.
import { Film } from './film.js';
import { ThinFilm } from './thinfilm.js';

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
];
