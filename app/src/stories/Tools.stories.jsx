// Every tool's settings, in Simple and Advanced, so nothing from tools.js goes missing.
import { GROUPS, toolDef } from '../ui/controls.js';
import { ToolSettings } from '../ui/parts.jsx';
import { WithTank } from './frames.jsx';

export default { title: 'Parts/Tool settings', parameters: { layout: 'padded' } };

const All = ({ view }) => (
  <div className="space-y-6 bg-ink-950 p-4 text-ink-100">
    {GROUPS.flatMap((g) => g.tools).map((tool) => (
      <section key={tool}>
        <h3 className="mb-2 text-sm font-semibold text-gilt">{toolDef(tool).label}</h3>
        <WithTank overrides={{ tool, view }}>{(tank) => <ToolSettings tank={tank} />}</WithTank>
      </section>
    ))}
  </div>
);

export const SimpleView = { render: () => <All view="simple" /> };
export const AdvancedView = { render: () => <All view="advanced" /> };
