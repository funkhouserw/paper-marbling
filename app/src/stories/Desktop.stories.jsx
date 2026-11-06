import { Desktop } from '../desktop/Desktop.jsx';
import { WithTank } from './frames.jsx';

export default {
  title: 'Layouts/Desktop',
  parameters: { layout: 'fullscreen' },
  render: ({ overrides, canWriteScripts }) => (
    <div style={{ height: '100vh' }}>
      <WithTank overrides={overrides}>{(tank) => <Desktop tank={tank} canWriteScripts={canWriteScripts} />}</WithTank>
    </div>
  ),
  args: { overrides: {}, canWriteScripts: true },
};

export const Simple = {};
export const Advanced = { args: { overrides: { view: 'advanced', tool: 'fullRake' } } };
export const ScriptDrawer = { args: { overrides: { view: 'advanced', drawer: true } } };
export const ScriptError = { args: { overrides: { view: 'advanced', drawer: true, scriptError: 'Line 3: oops is not defined' } } };
export const AskTheDrop = { args: { overrides: { creature: true } } };
export const PublicDemo = { name: 'Public demo (no script-writing)', args: { overrides: { creature: true }, canWriteScripts: false } };
export const Paused = { args: { overrides: { playing: false, tool: 'rake' } } };
