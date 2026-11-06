// The new interface mockup. It picks the phone or desktop layout by screen size.
// Nothing here is connected to the tank yet: useMockTank stands in for the controller.
import { useEffect, useState } from 'react';
import { Desktop } from './desktop/Desktop.jsx';
import { Phone } from './phone/Phone.jsx';
import { useMockTank } from './ui/useMockTank.js';
import { useTank } from './tank/useTank.js';

function useWide() {
  const query = '(min-width: 900px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const change = () => setWide(m.matches);
    m.addEventListener('change', change);
    return () => m.removeEventListener('change', change);
  }, []);
  return wide;
}

// ?mock shows the unconnected mockup, with a still picture for a tank.
const MOCK = new URLSearchParams(location.search).has('mock');

export default function App() {
  // Which hook runs never changes while the page is open, so this keeps React's hook order.
  const tank = MOCK ? useMockTank() : useTank(); // eslint-disable-line react-hooks/rules-of-hooks
  const wide = useWide();
  // The public demo has no server, so no script-writing assistant, microphone or timing recorder.
  const local = !document.querySelector('meta[name="marbler-demo"]');
  return wide ? <Desktop tank={tank} local={local} /> : <Phone tank={tank} local={local} />;
}
