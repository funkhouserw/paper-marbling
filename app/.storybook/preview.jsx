import '../src/index.css';

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  parameters: {
    backgrounds: { options: { dark: { name: 'Dark', value: '#0e0f11' } } },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'todo' },
  },
  initialGlobals: { backgrounds: { value: 'dark' } },
};

export default preview;
