// The simulators to choose from. A simulator with its own engine adds an `engine` class here.
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
    label: 'Thin film (new)',
    title: 'Tracks how thick the ink is. Bare water has no pressure, so films only feel each other once they touch.',
    spreading: false,
    engine: ThinFilm,
  },
];
