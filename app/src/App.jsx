// The new interface mockup. It picks the phone or desktop layout by screen size.
// Nothing here is connected to the tank yet: useMockTank stands in for the controller.
import { useEffect, useState } from 'react';
import { Desktop } from './desktop/Desktop.jsx';
import { Phone } from './phone/Phone.jsx';
import { useMockTank } from './ui/useMockTank.js';

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

export default function App() {
  const tank = useMockTank();
  const wide = useWide();
  // The public demo has no server, and so no script-writing assistant.
  const local = !document.querySelector('meta[name="marbler-demo"]');
  return wide ? <Desktop tank={tank} canWriteScripts={local} /> : <Phone tank={tank} canWriteScripts={local} />;
}
