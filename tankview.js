// The tank on a page: its canvases, sizing, pointer input, the previews drawn over it, the paper
// pull's sweep, and the frame loop that runs and draws it. Any interface mounts it once:
//
//   const view = mountTank(container, controller, { profiler, onStats });
//
// container is an element to fill, or { wrap, tank, overlay } for canvases the page already has.
// The tank fits inside the wrap, which should be sized by the page. A static wrap is made relative.
import { Marble, WEAVE_POINTS } from './engine.js';
import { latticeShifts } from './tile.js';
import { parseHex } from './controller.js';
import { PULL_SECONDS, LAY_SECONDS, pullPrint, drawSweep } from './paper.js';

const GLINT_MS = 33;
const SLOW_DRAW_MS = 25;
const SNAPSHOT_EVERY_MS = 2000;
const LOADED_FRAME_MS = 28;  // average frame gap that counts as the page falling behind
const BEHIND_FRAME_MS = 40;  // ...and that slows tank redraws too
const STATS_EVERY_MS = 250;

// The same colour fully opaque, so previews stay visible however faint the ink is.
function opaque(color) {
  if (/^#[0-9a-f]{8}$/i.test(color)) return color.slice(0, 7);
  if (/^#[0-9a-f]{4}$/i.test(color)) return color.slice(0, 4);
  const m = /^rgba\(\s*([^,]+),\s*([^,]+),\s*([^,)]+)/i.exec(color);
  return m ? `rgb(${m[1]},${m[2]},${m[3]})` : color;
}

// profiler: from makeProfiler(), told about frames, ticks and draws. onStats: called a few times
// a second, to show the tank's numbers.
// leftOnly: other mouse buttons don't use the tool, leaving them free for menus.
// touchGestures: a touch waits a moment before it uses the tool, so that a second finger can turn
// it into a gesture instead. Two fingers are then the interface's: onGesture({ type, touches }) is
// told when one starts ('start') and when the last finger lifts ('end'), and nothing touches the
// tank in between. Whatever the first finger had already done is taken back.
export function mountTank(container, c, { profiler = null, onStats = null, leftOnly = false, touchGestures = false, onGesture = null } = {}) {
  let wrap, tank, overlay;
  if (container.tank) ({ wrap, tank, overlay } = container);
  else {
    wrap = container;
    tank = document.createElement('canvas');
    overlay = document.createElement('canvas');
    for (const el of [tank, overlay]) Object.assign(el.style, { position: 'absolute', inset: '0', margin: 'auto' });
    // The canvases sit absolutely inside, which needs a positioned box. Only a static one is
    // changed, so a box the page already places (by a class, say) keeps its own position.
    if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
    wrap.append(tank, overlay);
  }
  const tctx = tank.getContext('2d');
  const octx = overlay.getContext('2d');
  let pxPerMm = 1;
  let pull = null; // the pull in progress
  const unsubscribe = [];

  const view = {
    tank, overlay,
    hover: null, // pointer position in tank mm, for previews
    get pulling() { return Boolean(pull); },
    get pxPerMm() { return pxPerMm; },
  };

  // ---- Layout -------------------------------------------------------------

  function resize() {
    const box = wrap.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    const cssScale = Math.min(box.width / c.marble.width, box.height / c.marble.height);
    pxPerMm = cssScale * dpr;
    for (const el of [tank, overlay]) {
      el.width = Math.round(c.marble.width * pxPerMm);
      el.height = Math.round(c.marble.height * pxPerMm);
      el.style.width = `${c.marble.width * cssScale}px`;
      el.style.height = `${c.marble.height * cssScale}px`;
    }
    c.dirty = true;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(wrap);
  unsubscribe.push(c.on('tank', resize));

  function toTank(ev) {
    const r = overlay.getBoundingClientRect();
    return [
      ((ev.clientX - r.left) / r.width - 0.5) * c.marble.width,
      (0.5 - (ev.clientY - r.top) / r.height) * c.marble.height,
    ];
  }
  const toPx = ([x, y]) => [(x + c.marble.width / 2) * pxPerMm, (c.marble.height / 2 - y) * pxPerMm];
  view.toTank = toTank;

  // Freezing picks ink, so the pointer says so.
  unsubscribe.push(c.on('freeze', () => { overlay.style.cursor = c.freezeMode === 'off' ? '' : 'crosshair'; }));

  // ---- Pointer --------------------------------------------------------------

  const on = (type, fn) => {
    overlay.addEventListener(type, fn);
    unsubscribe.push(() => overlay.removeEventListener(type, fn));
  };
  const HOLD_MS = 70;   // how long a touch waits before it counts as using the tool
  const HOLD_PX = 6;    // ...unless it moves this far first
  const touches = new Map(); // touches down now, by pointer id
  let held = null;     // a touch waiting to start: { id, point, x, y, timer, marks }
  let pressing = null; // the touch whose press has started: { id, marks }
  let gesture = false; // two fingers came down, so the tank ignores touches until all lift
  const capture = (ev) => { try { overlay.setPointerCapture(ev.pointerId); } catch { /* already gone */ } };
  const startHeld = () => {
    clearTimeout(held.timer);
    pressing = { id: held.id, marks: held.marks };
    const { point } = held;
    held = null;
    c.press(point);
  };
  // A second finger: nothing the first one did should stay.
  const startGesture = () => {
    if (held) { clearTimeout(held.timer); held = null; }
    if (pressing) {
      c.endPress();
      c.discardStepsSince(pressing.marks);
      pressing = null;
    }
    gesture = true;
    onGesture?.({ type: 'start', touches: touches.size });
  };
  const isTouch = (ev) => touchGestures && ev.pointerType === 'touch';

  on('pointerdown', (ev) => {
    if (pull || (leftOnly && ev.button > 0)) return;
    if (isTouch(ev)) {
      touches.set(ev.pointerId, true);
      if (gesture) return;
      if (touches.size > 1) { startGesture(); return; }
      capture(ev);
      held = { id: ev.pointerId, point: toTank(ev), x: ev.clientX, y: ev.clientY, marks: c.undoMarks.length };
      held.timer = setTimeout(() => { if (held?.id === ev.pointerId) startHeld(); }, HOLD_MS);
      return;
    }
    capture(ev);
    c.press(toTank(ev));
  });
  const lift = (ev, cancelled) => {
    if (!isTouch(ev)) {
      if (cancelled) c.endPress();
      else c.release();
      return;
    }
    touches.delete(ev.pointerId);
    if (gesture) {
      if (!touches.size) {
        gesture = false;
        onGesture?.({ type: 'end', touches: 0 });
      }
      return;
    }
    // A quick tap still counts, once it lifts.
    if (held?.id === ev.pointerId) {
      if (cancelled) { clearTimeout(held.timer); held = null; return; }
      startHeld();
    }
    if (pressing?.id === ev.pointerId) {
      if (cancelled) c.endPress();
      else c.release();
      pressing = null;
    }
  };
  // The system can take the pointer away mid-press, with no pointerup, so a press also ends here.
  on('pointercancel', (ev) => lift(ev, true));
  on('pointerleave', () => { view.hover = null; });
  on('pointermove', (ev) => {
    const p = toTank(ev);
    view.hover = p;
    if (isTouch(ev)) {
      if (gesture) return;
      if (held?.id === ev.pointerId) {
        if (Math.hypot(ev.clientX - held.x, ev.clientY - held.y) < HOLD_PX) return;
        startHeld();
      }
      if (pressing?.id !== ev.pointerId) return;
    }
    c.move(p, Boolean(ev.buttons));
  });
  on('pointerup', (ev) => lift(ev, false));

  // ---- Previews over the tank -----------------------------------------------

  // Black or white guides, whichever stands out against the bath.
  function guideColor(alpha) {
    const hex = parseHex(c.marble.bath);
    const n = hex ? parseInt(hex.rgb.slice(1), 16) : 0xffffff;
    const luma = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return `${luma < 110 ? 'rgba(255,255,255,' : 'rgba(0,0,0,'}${alpha})`;
  }

  // Where each heart's tine will run, dashed like the rake previews, in every copy that shows.
  function drawHeartLines() {
    const m = c.marble;
    if (c.tool !== 'hearts' || !m.heartPaths || m.busy) return;
    const px = devicePixelRatio || 1;
    octx.save();
    octx.lineWidth = px;
    octx.setLineDash([5 * px, 4 * px]);
    const paths = m.heartPaths(c.inMm('hearts'));
    const line = (from, to, sx, sy) => {
      const [ax, ay] = toPx([from[0] + sx, from[1] + sy]);
      const [bx, by] = toPx([to[0] + sx, to[1] + sy]);
      octx.moveTo(ax, ay);
      octx.lineTo(bx, by);
    };
    for (const [colour, phase] of [['#000c', 0], ['#fffc', 4.5 * px]]) {
      octx.beginPath();
      octx.strokeStyle = colour;
      octx.lineDashOffset = phase;
      for (const { from, to, loops } of paths) for (const [sx, sy] of m.tileShifts(loops)) line(from, to, sx, sy);
      octx.stroke();
    }
    octx.restore();
  }

  // The outline of some loops, in every copy that shows.
  function pathFor(loops) {
    const m = c.marble;
    const path = new Path2D();
    for (const poly of loops) {
      for (const [sx, sy] of m.tileShifts([poly])) {
        for (let i = 0; i < poly.n; i++) {
          const [x, y] = toPx([poly.xy[i * 2] + sx, poly.xy[i * 2 + 1] + sy]);
          if (i) path.lineTo(x, y);
          else path.moveTo(x, y);
        }
        path.closePath();
      }
    }
    return path;
  }

  // Frozen ink is outlined, and masked red where a full rake or a freeze would leave it be.
  function drawFrozen() {
    const m = c.marble;
    if (!m.polys.some((p) => p.frozen)) return;
    const masked = c.tool === 'fullRake' || c.freezeMode !== 'off';
    const px = devicePixelRatio || 1;
    octx.save();
    octx.lineWidth = px;
    octx.setLineDash([5 * px, 4 * px]);
    for (const poly of m.polys) {
      if (!poly.frozen) continue;
      const path = pathFor([poly]);
      if (masked) {
        octx.fillStyle = '#ff305866';
        octx.fill(path, poly.group ? 'evenodd' : 'nonzero');
      }
      octx.strokeStyle = '#000c';
      octx.lineDashOffset = 0;
      octx.stroke(path);
      octx.strokeStyle = '#fffc';
      octx.lineDashOffset = 4.5 * px;
      octx.stroke(path);
    }
    octx.restore();
  }

  // What a click would freeze or unfreeze, before anything is frozen too.
  function drawFreezePick() {
    if (c.freezeMode === 'off' || !view.hover) return;
    const loops = c.freezeTarget(view.hover);
    if (!loops) return;
    octx.save();
    octx.lineWidth = 2 * (devicePixelRatio || 1);
    octx.strokeStyle = c.freezeMode === 'freeze' ? '#ff3058' : '#fff';
    octx.stroke(pathFor(loops));
    octx.restore();
  }

  function drawTextPreview() {
    const contours = c.currentText();
    if (!contours.length) return;
    const { hover } = view;
    octx.save();
    octx.globalAlpha = 0.55;
    octx.fillStyle = c.inkRgb();
    octx.beginPath();
    for (const contour of contours) {
      for (let i = 0; i < contour.length; i += 2) {
        const [x, y] = toPx([contour[i] + hover[0], contour[i + 1] + hover[1]]);
        i ? octx.lineTo(x, y) : octx.moveTo(x, y);
      }
      octx.closePath();
    }
    octx.fill('evenodd');
    octx.restore();
  }

  // Dashed previews are slow to draw, so they live on their own canvas, redrawn only
  // when what they show changes. Queued actions show only while paused.
  const previewLayer = document.createElement('canvas');
  const lctx = previewLayer.getContext('2d');
  let previewKey = '';
  let previewHasContent = false;

  function dashedRakeLines(ctx, m, planned) {
    ctx.beginPath();
    for (const op of planned.together ?? [planned]) {
      const steps = op.waveAmp ? Math.ceil((op.total * WEAVE_POINTS) / op.waveLength) : 1;
      for (const off of op.offs) {
        const points = [];
        let left = Infinity, right = -Infinity, low = Infinity, high = -Infinity;
        for (let k = 0; k <= steps; k++) {
          const p = m._rakePoint(op, (op.total * k) / steps, off);
          points.push(p);
          left = Math.min(left, p[0]); right = Math.max(right, p[0]);
          low = Math.min(low, p[1]); high = Math.max(high, p[1]);
        }
        // A tine past a repeating tank's edge is really at its copy here, so that's what shows.
        const marble = c.marble;
        const { width: W, height: H } = marble;
        const shifts = (marble.tileWanted ?? marble.tileOn)
          ? latticeShifts(-W / 2 - right, W / 2 - left, -H / 2 - high, H / 2 - low, W, H, marble.tileOffsetWanted ?? marble.tileOffset)
          : [[0, 0]];
        for (const [sx, sy] of shifts) {
          points.forEach(([px, py], k) => {
            const [x, y] = toPx([px + sx, py + sy]);
            k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          });
        }
      }
    }
    // Alternating dark and light dashes show up on any bath or ink.
    ctx.strokeStyle = '#000c';
    ctx.lineDashOffset = 0;
    ctx.stroke();
    ctx.strokeStyle = '#fffc';
    ctx.lineDashOffset = 4.5;
    ctx.stroke();
    ctx.lineDashOffset = 0;
  }

  function renderPreviewLayer(showQueued, fullRakeOp) {
    if (previewLayer.width !== overlay.width || previewLayer.height !== overlay.height) {
      previewLayer.width = overlay.width;
      previewLayer.height = overlay.height;
    }
    const px = devicePixelRatio || 1;
    lctx.clearRect(0, 0, previewLayer.width, previewLayer.height);
    lctx.lineWidth = px;
    lctx.setLineDash([5, 4]);
    previewHasContent = false;
    // Paused, everything queued shows. Playing, only what a tool is waiting to do: a stroke held
    // back by "Tools wait for ink to settle" would otherwise look as if it never registered.
    for (const op of showQueued ? c.marble.queued : c.marble.queued.filter((q) => q.waitingForInk)) {
      if (op.kind === 'rake') {
        dashedRakeLines(lctx, c.marble, op);
        previewHasContent = true;
      } else if (op.kind === 'erase' || op.kind === 'lift') {
        const [x, y] = toPx([op.x, op.y]);
        lctx.beginPath();
        lctx.arc(x, y, op.radius * pxPerMm, 0, 7);
        lctx.strokeStyle = '#000c';
        lctx.lineDashOffset = 0;
        lctx.stroke();
        lctx.strokeStyle = '#fffc';
        lctx.lineDashOffset = 4.5;
        lctx.stroke();
        lctx.lineDashOffset = 0;
        previewHasContent = true;
      } else if (op.kind === 'drop') {
        const [x, y] = toPx([op.x, op.y]);
        const color = opaque(op.color);
        lctx.strokeStyle = color;
        lctx.fillStyle = color;
        lctx.beginPath();
        lctx.arc(x, y, Math.sqrt(op.maxArea) * pxPerMm, 0, 7);
        lctx.stroke();
        lctx.beginPath();
        lctx.arc(x, y, 3 * px, 0, 7);
        lctx.fill();
        previewHasContent = true;
      }
    }
    if (fullRakeOp) {
      dashedRakeLines(lctx, fullRakeOp.m, fullRakeOp.op);
      previewHasContent = true;
    }
  }

  // The planned tines come from a throwaway tank, so the preview uses the engine's geometry.
  let plannedRake = { key: null, op: null };
  function plannedFullRake() {
    const { tool, stroke, marble } = c;
    if (tool !== 'fullRake' && tool !== 'rake') return null;
    // Rake has no line until it's dragged, so until then it shows one straight across, at the pointer.
    const along = marble.width / 2 + 20;
    const y = view.hover ? view.hover[1] : 0;
    const line = tool === 'rake' ? (stroke?.length > 1 ? stroke : [[-along, y], [along, y]]) : null;
    const key = JSON.stringify([tool, c.values[tool], line, marble.width, marble.height, marble.tileWanted ?? marble.tileOn, marble.tileOffsetWanted ?? marble.tileOffset]);
    if (key !== plannedRake.key) {
      const m = new Marble({ width: marble.width, height: marble.height });
      m.tileWanted = marble.tileWanted ?? marble.tileOn;
      m.tileOffsetWanted = marble.tileOffsetWanted ?? marble.tileOffset;
      const op = tool === 'rake'
        ? m.rake({ from: line[0], to: line[1], ...c.inMm('rake', m), at: 0 })
        : m.fullRake({ ...c.inMm('fullRake', m), at: 0 });
      plannedRake = { key, op: op && { m, op } };
    }
    return plannedRake.op;
  }

  function drawPreviewLayer() {
    const showQueued = !c.playing;
    const planned = plannedFullRake();
    const key = [showQueued, c.marble.log.length, c.marble.queued.length,
      planned ? plannedRake.key : '', overlay.width, overlay.height].join('|');
    if (key !== previewKey) {
      renderPreviewLayer(showQueued, planned);
      previewKey = key;
    }
    if (previewHasContent) octx.drawImage(previewLayer, 0, 0);
  }

  function drawOverlay() {
    octx.clearRect(0, 0, overlay.width, overlay.height);
    if (pull) {
      drawSweep(octx, pull, (performance.now() - pull.start) / 1000);
      return;
    }
    const { tool, stroke } = c;
    if (tool === 'text' && view.hover) drawTextPreview();
    octx.lineWidth = devicePixelRatio || 1;
    if (stroke && stroke.length > 1) {
      octx.strokeStyle = guideColor(0.7);
      octx.beginPath();
      stroke.forEach((p, i) => { const [x, y] = toPx(p); i ? octx.lineTo(x, y) : octx.moveTo(x, y); });
      octx.stroke();
      if (tool === 'rake') {
        const [a, b] = stroke;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const perp = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
        const { teeth, spacing } = c.inMm('rake');
        octx.fillStyle = guideColor(0.75);
        for (let i = 0; i < teeth; i++) {
          const off = (i - (teeth - 1) / 2) * spacing;
          const [x, y] = toPx([a[0] + perp[0] * off, a[1] + perp[1] * off]);
          octx.beginPath();
          octx.arc(x, y, 2.5 * octx.lineWidth, 0, 7);
          octx.fill();
        }
      }
    }
    drawPreviewLayer();
    drawHeartLines();
    drawFrozen();
    drawFreezePick();
    octx.fillStyle = guideColor(0.8);
    for (const p of c.marble.tinePositions()) {
      const [x, y] = toPx(p);
      octx.beginPath();
      octx.arc(x, y, 2 * octx.lineWidth, 0, 7);
      octx.fill();
    }
  }

  // ---- Paper pull -------------------------------------------------------------

  // Lays a sheet across the tank and lifts it, over a few seconds. Resolves with the print's
  // canvas, or null if a pull was already under way. clearAfter, true or a function asked as the
  // sheet lands, clears the tank under it. No undo or redo while the sheet is down.
  view.startPull = ({ tint, imperfection, mirror, seed, clearAfter = false }) => {
    if (pull) return Promise.resolve(null);
    return new Promise((resolve) => {
      pull = {
        start: performance.now(),
        ...pullPrint(c.marble, { tint, imperfection, mirror, seed }),
        cleared: false,
        clearAfter,
        resolve,
      };
      c.locked = true;
      c.stroke = null;
    });
  };

  function stepPull(now) {
    // The tank holds still under the sheet. Clearing happens once it is fully covered.
    const elapsed = (now - pull.start) / 1000;
    const clearing = typeof pull.clearAfter === 'function' ? pull.clearAfter() : pull.clearAfter;
    if (!pull.cleared && elapsed > LAY_SECONDS && clearing) {
      pull.cleared = true;
      c.clear();
    }
    if (elapsed >= PULL_SECONDS) {
      const { print, resolve } = pull;
      pull = null;
      c.locked = false;
      resolve(print);
    }
  }

  // ---- Pictures of the tank -----------------------------------------------------

  // A small picture of the tank as it shows now, as a data URL.
  view.thumbnail = (width = 120) => {
    const shot = document.createElement('canvas');
    shot.width = width;
    shot.height = Math.round((width * tank.height) / tank.width) || 84;
    shot.getContext('2d').drawImage(tank, 0, 0, shot.width, shot.height);
    return shot.toDataURL('image/png');
  };

  // The tank as it shows now, three by three, as a PNG blob.
  view.tilePreview = () => new Promise((resolve) => {
    // At the tank's own resolution, so the view can zoom out without losing detail.
    const canvas = Object.assign(document.createElement('canvas'), { width: tank.width * 3, height: tank.height * 3 });
    const ctx = canvas.getContext('2d');
    // With no base colour the tank's canvas is see-through, over whatever the page shows behind it.
    ctx.fillStyle = getComputedStyle(tank).backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // An offset shifts each row or column by half a tile. Page rows run down, the tank's y runs up.
    const offset = c.marble.tileOn ? c.marble.tileOffset : null;
    for (let i = -1; i < 4; i++) {
      for (let j = -1; j < 4; j++) {
        const x = (i + (offset === 'brick' ? (((j % 2) + 2) % 2) / 2 : 0)) * tank.width;
        const y = (j - (offset === 'halfDrop' ? (((i % 2) + 2) % 2) / 2 : 0)) * tank.height;
        ctx.drawImage(tank, x, y);
      }
    }
    canvas.toBlob(resolve);
  });

  // ---- Frame loop -------------------------------------------------------------

  let nextDraw = 0;
  let nextGlint = 0;
  let lastDrawMs = 0;
  let nextStats = 0;
  let frameGap = 16;      // smoothed time between frames; canvas work mostly lands here, not in draw()
  let glintResting = null; // the tank state the glint gave up on, until something changes
  let last = performance.now();
  let drawnLog = 0;
  let wasSnapshotting = false;
  let running = true;

  // Draws at the next frame, whatever the schedule says.
  view.redrawNow = () => { nextDraw = 0; };

  function frame(now) {
    if (!running) return;
    profiler?.frame(now - last, now);
    profiler?.watch(c.marble);
    const wall = Math.min((now - last) / 1000, 0.1);
    const gap = now - last;
    if (gap < 250) frameGap += (gap - frameGap) * 0.1; // longer gaps are a hidden tab, not load
    last = now;
    const start = performance.now();
    if (pull) stepPull(now);
    else c.advance(wall, start);
    const marble = c.marble;
    // Metallic inks glint, but not under load. If the page can't keep up even when the
    // sim has settled, the glint rests until the tank next changes.
    const underLoad = c.finishing || c.snapshotting() || c.owed > 0.1 || lastDrawMs > SLOW_DRAW_MS || frameGap > LOADED_FRAME_MS;
    const tankState = `${marble.seed}|${marble.log.length}|${marble.polys.length}`;
    if (underLoad && !marble.busy && !c.finishing) glintResting = tankState;
    else if (glintResting !== tankState) glintResting = null;
    if (!pull && !underLoad && !glintResting && now >= nextGlint && marble.polys.some((p) => p.shimmer > 0)) {
      marble.sheenPhase += Math.max(wall, GLINT_MS / 1000);
      nextGlint = now + GLINT_MS;
      c.dirty = true;
    }
    c.noteLoad(lastDrawMs);
    // Show the finished or paused tank straight away, not at the next snapshot.
    const snapshotsOn = c.snapshotting();
    if (wasSnapshotting && !snapshotsOn) nextDraw = 0;
    wasSnapshotting = snapshotsOn;
    // Anything the user just did shows straight away, even between snapshots.
    if (marble.log.length !== drawnLog) nextDraw = 0;
    // A slow redraw waits twice its own length before the next, so most of the time stays free.
    // Drawing in the background: the page only posts the work, and shows it when it's ready.
    let drawnLive = false;
    if (c.dirty && marble.drawLive && performance.now() >= nextDraw) {
      const drawing = marble;
      const sent = marble.drawLive(tctx, pxPerMm, ({ ms }) => {
        lastDrawMs = ms;
        profiler?.draw(ms);
        return drawing === c.marble;
      });
      if (sent === 'busy') drawnLive = true;
      else if (sent) {
        drawnLive = true;
        c.dirty = false;
        drawnLog = marble.log.length;
        nextDraw = performance.now() + 100;
      }
    }
    if (!drawnLive && c.dirty && performance.now() >= nextDraw) {
      const drawStart = performance.now();
      marble.draw(tctx, pxPerMm);
      lastDrawMs = performance.now() - drawStart;
      profiler?.draw(lastDrawMs);
      drawnLog = marble.log.length;
      nextDraw = drawStart + Math.max(lastDrawMs * 3, frameGap > BEHIND_FRAME_MS ? 100 : 0,
        c.snapshotting() ? SNAPSHOT_EVERY_MS : 0);
      c.dirty = false;
    }
    drawOverlay();
    if (now >= nextStats) {
      nextStats = now + STATS_EVERY_MS;
      onStats?.();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Stops the loop and lets go of the page, for an interface that unmounts the tank.
  view.destroy = () => {
    running = false;
    clearTimeout(held?.timer);
    observer.disconnect();
    for (const off of unsubscribe) off();
    if (!container.tank) { tank.remove(); overlay.remove(); }
  };

  return view;
}
