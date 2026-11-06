// The live tank. tankview.js does all of it: the canvases, previews, glint, the frame loop and
// pointer input. This gives it a box to fill, opens the tank's menu on a right-click or a long
// press, and on touch screens turns two fingers into pan and zoom, and a quick two-finger tap
// into undo. tankview holds a touch back for a moment, so a second finger never leaves a mark.
import { useEffect, useRef, useState } from 'react';
import { mountTank } from '../../../tankview.js';
import { cx } from '../ui/widgets.jsx';

const MAX_ZOOM = 5;
const TAP_MS = 250;   // a two-finger tap is quicker than this
const TAP_MOVE = 12;  // and moves less than this many pixels

export function LiveTank({ tank, className, onMenu }) {
  const c = tank.controller;
  const outer = useRef(null);
  const box = useRef(null);
  const view = useRef(null);
  const menu = useRef(onMenu);
  menu.current = onMenu;
  const [zoomed, setZoomed] = useState(false);

  // Pan and zoom, kept here and written straight to the box's transform while fingers move.
  const zoom = useRef({ scale: 1, x: 0, y: 0 });
  const touches = useRef(new Map());
  const gesture = useRef(null);
  const apply = () => {
    const z = zoom.current;
    box.current.style.transform = z.scale === 1 && !z.x && !z.y ? '' : `translate(${z.x}px, ${z.y}px) scale(${z.scale})`;
    setZoomed(z.scale !== 1 || z.x !== 0 || z.y !== 0);
  };
  const resetZoom = () => { zoom.current = { scale: 1, x: 0, y: 0 }; apply(); };

  useEffect(() => {
    const v = mountTank(box.current, c, {
      leftOnly: true,
      touchGestures: true,
      onStats: tank.onStats,
      onGesture: ({ type }) => {
        if (type === 'start') {
          const pts = [...touches.current.values()];
          if (pts.length < 2) return;
          gesture.current = { start: performance.now(), from: pts.slice(0, 2).map((p) => ({ ...p })), base: { ...zoom.current }, moved: 0 };
        } else {
          const g = gesture.current;
          gesture.current = null;
          if (!g) return;
          // A quick tap with two fingers that barely moved means undo.
          if (performance.now() - g.start < TAP_MS && g.moved < TAP_MOVE) {
            zoom.current = g.base;
            apply();
            c.undo();
            return;
          }
          // Close to the whole tank snaps back to it.
          if (zoom.current.scale < 1.05) resetZoom();
        }
      },
    });
    view.current = v;
    tank.setView(v);
    // The same console handles as the old page, for looking at the tank and for browser tests.
    window.marble = () => c.marble;
    window.marbler = { controller: c, view: v };
    return () => { v.destroy(); tank.setView(null); view.current = null; };
    // The tank and its view live as long as the page.
  }, [c]); // eslint-disable-line react-hooks/exhaustive-deps

  // Two fingers: the gap between them zooms about their midpoint, and moving them pans.
  const track = (e) => {
    if (e.pointerType !== 'touch') return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const pts = [...touches.current.values()].slice(0, 2);
    if (pts.length < 2) return;
    const [a0, b0] = g.from;
    const [a, b] = pts;
    const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    g.moved = Math.max(g.moved, Math.hypot(m.x - m0.x, m.y - m0.y), Math.abs(d - d0));
    const scale = Math.min(MAX_ZOOM, Math.max(1, g.base.scale * (d / d0)));
    // Keep the point under the fingers' first midpoint under their midpoint now.
    const r = outer.current.getBoundingClientRect();
    const cx0 = m0.x - r.left - r.width / 2;
    const cy0 = m0.y - r.top - r.height / 2;
    const k = scale / g.base.scale;
    zoom.current = {
      scale,
      x: m.x - r.left - r.width / 2 - (cx0 - g.base.x) * k,
      y: m.y - r.top - r.height / 2 - (cy0 - g.base.y) * k,
    };
    apply();
  };
  const untrack = (e) => { touches.current.delete(e.pointerId); };

  // A long press on a touch screen opens the menu, as right-click does with a mouse.
  const hold = useRef(null);
  const holdAt = useRef(null);
  const cancelHold = () => { clearTimeout(hold.current); holdAt.current = null; };
  const open = (e) => menu.current?.({ x: e.clientX, y: e.clientY, point: view.current?.toTank(e) });

  return (
    <div ref={outer} className={cx('relative min-h-0 min-w-0 overflow-hidden', className)}>
      <div
        ref={box}
        aria-label="The tank"
        className={cx('tank-box origin-center', tank.state.freezeMode !== 'off' && 'freezing')}
        // Inline, because mountTank makes its box position: relative unless it already says otherwise.
        style={{ position: 'absolute', inset: 0 }}
        onContextMenu={(e) => { e.preventDefault(); open(e); }}
        // Fingers are counted on the way down, before tankview hears them, so a second finger is
        // already known when tankview says a gesture has started.
        onPointerDownCapture={track}
        onPointerMoveCapture={track}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch') return;
          if (touches.current.size > 1) { cancelHold(); return; }
          const { clientX, clientY } = e;
          holdAt.current = { x: clientX, y: clientY };
          hold.current = setTimeout(() => {
            if (touches.current.size > 1) return;
            c.endPress();
            open({ clientX, clientY });
          }, 550);
        }}
        onPointerMove={(e) => {
          const at = holdAt.current;
          if (e.pointerType === 'touch' && at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > 6) cancelHold();
        }}
        onPointerUp={(e) => { cancelHold(); untrack(e); }}
        onPointerCancel={(e) => { cancelHold(); untrack(e); }}
      />
      {zoomed && (
        <button
          type="button" onClick={resetZoom}
          className="absolute right-2 top-2 z-10 rounded-full border border-ink-600 bg-ink-900/90 px-2.5 py-1 text-xs text-ink-100 shadow"
        >
          {Math.round(zoom.current.scale * 100)}% · Fit
        </button>
      )}
    </div>
  );
}
