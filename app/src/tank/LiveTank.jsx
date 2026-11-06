// The live tank. tankview.js does all of it: the canvases, previews, glint, the frame loop and
// pointer input. This only gives it a box to fill and opens the tank's menu on a right-click
// or a long press, since mountTank leaves those clicks free.
import { useEffect, useRef } from 'react';
import { mountTank } from '../../../tankview.js';
import { cx } from '../ui/widgets.jsx';

export function LiveTank({ tank, className, onMenu }) {
  const c = tank.controller;
  const box = useRef(null);
  const view = useRef(null);
  const menu = useRef(onMenu);
  menu.current = onMenu;

  useEffect(() => {
    const v = mountTank(box.current, c, { leftOnly: true, onStats: tank.onStats });
    view.current = v;
    tank.setView(v);
    return () => { v.destroy(); tank.setView(null); view.current = null; };
    // The tank and its view live as long as the page.
  }, [c]); // eslint-disable-line react-hooks/exhaustive-deps

  // A long press on a touch screen opens the menu, as right-click does with a mouse.
  const hold = useRef(null);
  const cancelHold = () => clearTimeout(hold.current);
  const open = (e) => menu.current?.({ x: e.clientX, y: e.clientY, point: view.current?.toTank(e) });

  return (
    <div
      ref={box}
      aria-label="The tank"
      className={cx('tank-box min-h-0 min-w-0', tank.state.freezeMode !== 'off' && 'freezing', className)}
      onContextMenu={(e) => { e.preventDefault(); open(e); }}
      onPointerDown={(e) => {
        if (e.pointerType !== 'touch') return;
        const { clientX, clientY } = e;
        hold.current = setTimeout(() => {
          c.endPress();
          open({ clientX, clientY });
        }, 550);
      }}
      onPointerMove={cancelHold}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
    />
  );
}
