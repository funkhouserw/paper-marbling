import { Desktop } from '../desktop/Desktop.jsx';
import { WithTank } from './frames.jsx';

export default {
  title: 'Layouts/Desktop',
  parameters: { layout: 'fullscreen' },
  render: ({ overrides, local }) => (
    <div style={{ height: '100vh' }}>
      <WithTank overrides={overrides}>{(tank) => <Desktop tank={tank} local={local} />}</WithTank>
    </div>
  ),
  args: { overrides: {}, local: true },
};

export const Simple = {};
export const Advanced = { args: { overrides: { view: 'advanced', tool: 'fullRake' } } };
export const ScriptDrawer = { args: { overrides: { view: 'advanced', drawer: true } } };
export const ScriptError = { args: { overrides: { view: 'advanced', drawer: true, scriptError: 'Line 3: oops is not defined' } } };
export const AskCarra = { args: { overrides: { creature: true } } };
export const PublicDemo = { name: 'Public demo (no script-writing)', args: { overrides: { creature: true }, local: false } };
export const Paused = { args: { overrides: { playing: false, tool: 'rake' } } };
export const CommandPalette = { name: 'Find a command (⌘K)', args: { overrides: { commandOpen: true } } };
export const GridInk = { name: 'Grid ink (no eraser, hearts, freeze or walls)', args: { overrides: { view: 'advanced', settings: { simulator: 'gridink', tile: true, visc: '200' } } } };
export const Repeating = { args: { overrides: { view: 'advanced', settings: { tile: true } } } };
export const WeavePicker = { name: 'Rake with a weave', args: { overrides: { tool: 'rake', view: 'advanced' } } };
export const Freezing = { args: { overrides: { tool: 'fullRake', freezeMode: 'freeze', view: 'advanced' } } };
