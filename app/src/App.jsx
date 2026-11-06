// Marbler's new interface. It picks the phone or desktop layout by screen size, and runs the
// real tank unless the address has ?mock, which shows the unconnected mockup instead.
import { useEffect, useState } from 'react';
import { Desktop } from './desktop/Desktop.jsx';
import { Phone } from './phone/Phone.jsx';
import { useMockTank } from './ui/useMockTank.js';
import { useTank } from './tank/useTank.js';

function useMedia(query) {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const change = () => setOn(m.matches);
    m.addEventListener('change', change);
    return () => m.removeEventListener('change', change);
  }, [query]);
  return on;
}

const MOCK = new URLSearchParams(location.search).has('mock');

export default function App() {
  // Which hook runs never changes while the page is open, so React's hook order holds.
  const tank = MOCK ? useMockTank() : useTank(); // eslint-disable-line react-hooks/rules-of-hooks
  // Phones get the phone layout, turned on its side when held that way. Tablets and anything
  // wider get the desktop one.
  const wide = useMedia('(min-width: 760px) and (min-height: 600px)');
  const landscape = useMedia('(orientation: landscape)');
  // The public demo has no server, so no script-writing assistant, microphone or timing recorder.
  const local = !document.querySelector('meta[name="marbler-demo"]');
  return wide ? <Desktop tank={tank} local={local} /> : <Phone tank={tank} local={local} landscape={landscape} />;
}
