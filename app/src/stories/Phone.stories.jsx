import { Phone } from '../phone/Phone.jsx';
import { PhoneFrame, WithTank } from './frames.jsx';

export default {
  title: 'Layouts/Phone',
  parameters: { layout: 'centered' },
  render: ({ overrides, landscape }) => (
    <PhoneFrame width={landscape ? 844 : 390} height={landscape ? 390 : 844}>
      <WithTank overrides={overrides}>{(tank) => <Phone tank={tank} landscape={landscape} />}</WithTank>
    </PhoneFrame>
  ),
  args: { overrides: {}, landscape: false },
};

export const Portrait = {};
export const PortraitTank = { name: 'Portrait tank preset', args: { overrides: { settings: { tankW: '700', tankH: '1000' } } } };
export const Comb = { args: { overrides: { tool: 'rake' } } };
export const Landscape = { args: { landscape: true } };
