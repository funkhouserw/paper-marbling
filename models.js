// The simulators to choose from. A simulator with its own engine adds an `engine` class here.

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
];
