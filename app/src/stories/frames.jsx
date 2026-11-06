// Story helpers: a fresh mock tank per story, and fixed-size frames for desktop and phones.
import { useMockTank } from '../ui/useMockTank.js';

export function WithTank({ overrides, children }) {
  const tank = useMockTank(overrides);
  return children(tank);
}

export const PhoneFrame = ({ width = 390, height = 844, children }) => (
  <div className="mx-auto overflow-hidden rounded-[2.5rem] border-[10px] border-black shadow-2xl" style={{ width: width + 20, height: height + 20 }}>
    <div style={{ width, height }}>{children}</div>
  </div>
);
