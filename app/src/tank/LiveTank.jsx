// The live tank canvas. For now this is a stand-in that only plays and draws the tank and passes
// pointer presses through, with none of the old page's previews or glints. tankview.js's
// mountTank(el, controller) replaces the inside of this component once it lands.
import { useEffect, useRef } from 'react';
import { cx } from '../ui/widgets.jsx';

export function LiveTank({ tank, className, onMenu }) {
  const c = tank.controller;
  const { tankW, tankH } = c.settings;
  const canvas = useRef(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el.getContext('2d');
    let last = performance.now();
    let raf = 0;
    let size = '';
    const frame = (now) => {
      const m = c.marble;
      // The canvas matches its shown size at the screen's resolution, so the tank stays sharp.
      const r = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const want = `${Math.round(r.width * dpr)}x${Math.round(r.height * dpr)}`;
      if (want !== size) {
        size = want;
        el.width = Math.max(1, Math.round(r.width * dpr));
        el.height = Math.max(1, Math.round(r.height * dpr));
        c.dirty = true;
      }
      const wall = Math.min((now - last) / 1000, 0.1);
      last = now;
      c.advance(wall, performance.now());
      if (c.dirty) {
        m.draw(ctx, el.width / m.width);
        c.dirty = false;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const redraw = () => { c.dirty = true; };
    const off = c.on('tank', redraw);
    return () => { cancelAnimationFrame(raf); off(); };
  }, [c]);

  // Page pixels to tank millimetres, centred, with y up.
  const toTank = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width - 0.5) * c.marble.width, (0.5 - (e.clientY - r.top) / r.height) * c.marble.height];
  };
  const hold = useRef(null);
  const cancelHold = () => clearTimeout(hold.current);

  return (
    <div className={cx('flex min-h-0 min-w-0 items-center justify-center', className)} style={{ containerType: 'size' }}>
      <canvas
        ref={canvas}
        aria-label={`The tank, ${tankW} by ${tankH} mm`}
        className={cx(
          'shrink-0 cursor-crosshair touch-none rounded-sm shadow-2xl ring-1',
          tank.state.freezeMode !== 'off' ? 'ring-2 ring-sky-300/70' : 'ring-black/40',
        )}
        style={{
          aspectRatio: `${tankW} / ${tankH}`,
          width: `min(100cqw, 100cqh * ${tankW / tankH})`,
          background: c.settings.useBath ? c.settings.bath : 'transparent',
        }}
        onPointerDown={(e) => {
          if (e.button === 2) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          c.press(toTank(e));
          if (e.pointerType === 'touch' && onMenu) {
            const where = { x: e.clientX, y: e.clientY, point: toTank(e) };
            hold.current = setTimeout(() => { c.endPress(); onMenu(where); }, 550);
          }
        }}
        onPointerMove={(e) => { cancelHold(); c.move(toTank(e), Boolean(e.buttons)); }}
        onPointerUp={() => { cancelHold(); c.release(); }}
        onPointerCancel={() => { cancelHold(); c.endPress(); }}
        onContextMenu={(e) => { e.preventDefault(); onMenu?.({ x: e.clientX, y: e.clientY, point: toTank(e) }); }}
      />
    </div>
  );
}
