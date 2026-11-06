// The real tank behind the new interface. It gives the layouts the same { state, dispatch,
// palette, act, applyTool } shape as useMockTank, so they work with either, but every change goes
// to TankController, and the state is read back from it after each of its events.
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { TankController, SETTINGS, DETAIL_PRESETS, storedSettings, storeSetting } from '../../../controller.js';
import { textContours } from '../../../text.js';
import { EXAMPLES, EXAMPLE_SIMULATOR } from '../../../examples.js';
import { PALETTES, palette as findPalette } from '../../../palettes.js';
import { FIXED, SECTIONS } from '../ui/features.js';

// Settings that belong to the page, not the tank (paper, export, views), held here with their defaults.
const PAGE_SETTINGS = Object.fromEntries([...SECTIONS.flatMap((x) => x.controls), ...FIXED]
  .filter((c) => 'value' in c && !(c.id in SETTINGS) && c.id !== 'detailPreset').map((c) => [c.id, c.value]));

// The method that makes each setting take effect once changed. Settings not listed only need
// their new value, which the controller reads when it next uses them.
const COMMIT = {
  visc: (c) => c.commitViscosity(),
  flowPreset: (c) => c.commitFlowPreset(),
  flowPush: (c) => c.commitFlow(),
  flowFriction: (c) => c.commitFlow(),
  flowCoast: (c) => c.commitFlow(),
  flowCell: (c) => c.commitFlow(),
  tile: (c) => c.commitTile(),
  tileOffset: (c) => c.commitTileOffset(),
  simulator: (c) => c.commitSimulator(),
  walls: (c) => c.commitWalls(),
  useBath: (c) => c.commitBath(),
  bath: (c) => c.commitBath(),
  pointLimit: (c, v) => c.setPointLimit(Number(v)),
};

// The status line's numbers and warnings, as the old page's showStats gives them.
function readStats(c) {
  const m = c.marble;
  return {
    points: m.vertexCount,
    active: m.active.length,
    queued: m.queued.length,
    bathMoving: m.busy && !m.active.length && !m.queued.length,
    warn: m.stoppedAtLimit ? 'Point limit reached: the bath has stopped. A higher limit in Detail lets it run longer.'
      : m.capped ? 'Point limit reached: curls will look rough, so raise it in Detail.' : null,
    snapshots: c.snapshotting() ? (c.autoSnapshots && !c.settings.lowFramerate ? 'low framerate (automatic)' : 'low framerate') : null,
  };
}

// The Detail menu shows a preset when the point limit is one, and Custom otherwise.
const detailPreset = (limit) => DETAIL_PRESETS.find(([v]) => Number(v) === Number(limit))?.[0] ?? 'custom';

const START = {
  view: 'simple',
  drawer: false,
  creature: false,
  commandOpen: false,
  notice: null,
  script: '',
  example: '',
  scriptError: null,
  palette: 'Dark Academia',
  ink: 0,
  page: PAGE_SETTINGS,
};

function uiReducer(s, a) {
  return { ...s, ...a };
}

export function useTank() {
  const controller = useMemo(() => {
    const c = new TankController({ settings: storedSettings(localStorage), trace: textContours });
    c.setPointLimit(c.pointLimit());
    return c;
  }, []);
  const c = controller;
  const [ui, setUi] = useReducer(uiReducer, START);
  const [version, bump] = useReducer((n) => n + 1, 0);

  // Redraw on anything the controller says changed. Time and shape counts change every frame,
  // so they're read a few times a second instead.
  useEffect(() => {
    const offs = ['tank', 'settings', 'history', 'playing', 'tool', 'freeze'].map((t) => c.on(t, bump));
    offs.push(c.on('notice', (msg) => setUi({ notice: msg || null })));
    return () => offs.forEach((off) => off());
  }, [c]);

  // tankview.js, once LiveTank has mounted it. It reports the tank's numbers every 250 ms.
  const view = useRef(null);
  const setView = useCallback((v) => { view.current = v; }, []);
  const onStats = useCallback(() => bump(), []);

  const latestUi = useRef(ui);
  latestUi.current = ui;

  const pickInk = useCallback((i) => {
    const ink = c.inks[i];
    if (!ink) return;
    c.setInk(ink.color, c.inkAlpha());
    c.shimmer = ink.shimmer;
    setUi({ ink: i });
  }, [c]);

  const dispatch = useCallback((a) => {
    switch (a.type) {
      case 'set': {
        const { tool, freezeMode, playing, palette, ink, settings, ...rest } = a.patch;
        if (tool !== undefined) c.setTool(tool);
        if (freezeMode !== undefined) c.setFreezeMode(freezeMode);
        if (playing !== undefined) c.setPlaying(playing);
        if (palette !== undefined) {
          const p = c.usePalette(palette);
          rest.palette = p.name;
          rest.ink = 0;
          pickInk(0);
        }
        if (ink !== undefined) pickInk(ink);
        if (settings) {
          for (const [k, v] of Object.entries(settings)) {
            if (c.settings[k] === v) continue;
            c.settings[k] = v;
            COMMIT[k]?.(c, v);
            storeSetting(localStorage, k, v);
          }
          c.emit('settings');
        }
        if (Object.keys(rest).length) setUi(rest);
        return;
      }
      case 'setting': {
        if (a.key === 'detailPreset') {
          if (a.value !== 'custom') { c.setPointLimit(Number(a.value)); storeSetting(localStorage, 'pointLimit', String(c.pointLimit())); }
          setUi({ detailCustom: a.value === 'custom' });
          bump();
          return;
        }
        if (!(a.key in SETTINGS)) {
          setUi({ page: { ...latestUi.current.page, [a.key]: a.value } });
          return;
        }
        c.settings[a.key] = a.value;
        COMMIT[a.key]?.(c, a.value);
        if (a.key === 'lowFramerate') view.current?.redrawNow();
        if (a.key === 'pointLimit') storeSetting(localStorage, 'pointLimit', String(c.pointLimit()));
        else storeSetting(localStorage, a.key, a.value);
        if (!COMMIT[a.key]) c.emit('settings');
        return;
      }
      case 'value':
        c.values[a.tool][a.key] = a.value;
        bump();
        return;
      case 'tool': c.setTool(a.tool); return;
      case 'undo': c.undo(); return;
      case 'redo': c.redo(); return;
      case 'clear': c.clear(); return;
      case 'notice': c.notice(a.text ?? ''); setUi({ notice: a.text || null }); return;
      case 'run': {
        c.notice('');
        const failed = c.runScript(latestUi.current.script);
        setUi({ scriptError: failed ? String(failed) : null });
        return;
      }
      case 'example': {
        // Examples open on the simulator they were made for, ready to change, and only run on Run.
        const sim = EXAMPLE_SIMULATOR[a.name];
        if (sim && sim !== c.settings.simulator) {
          c.settings.simulator = sim;
          c.commitSimulator();
          storeSetting(localStorage, 'simulator', sim);
        }
        setUi({ example: a.name, script: EXAMPLES[a.name], scriptError: null });
        return;
      }
      default: throw new Error(`Unknown action ${a.type}`);
    }
  }, [c, pickInk]);

  // What the layouts read. Built fresh on every change; the controller holds the truth.
  const { steps, current } = c.history();
  const state = {
    ...ui,
    tool: c.tool,
    values: c.values,
    settings: { ...ui.page, ...c.settings, detailPreset: ui.detailCustom ? 'custom' : detailPreset(c.pointLimit()), pointLimit: String(c.pointLimit()) },
    playing: c.playing,
    freezeMode: c.freezeMode,
    history: steps.map((s) => s.label),
    historyAt: current,
    time: c.marble.time,
    shapes: c.marble.polys.length,
    stats: readStats(c),
    version,
  };
  const pal = findPalette(ui.palette) ?? PALETTES[0];
  const paletteView = { name: pal.name, bath: c.settings.bath, inks: c.inks };

  // Actions from features.js that the real tank handles itself. The rest fall back to the
  // shared handlers in commands.jsx.
  const perform = useCallback((id, ctx) => {
    switch (id) {
      case 'finish': c.finish(); return true;
      case 'seeRepeat':
        view.current?.tilePreview().then((blob) => window.open(URL.createObjectURL(blob), '_blank'));
        return true;
      case 'freezeHere': if (ctx?.point) c.freezeAt(ctx.tankPoint ?? ctx.point, 'freeze'); return true;
      case 'unfreezeHere': if (ctx?.point) c.freezeAt(ctx.tankPoint ?? ctx.point, 'unfreeze'); return true;
      case 'unfreezeAll': c.unfreezeAll(); return true;
      case 'copySession': setUi({ script: c.marble.toScript(), example: '', drawer: true, view: 'advanced' }); return true;
      default: return false;
    }
  }, [c]);

  return {
    controller: c,
    state,
    dispatch,
    palette: paletteView,
    act: () => {},
    applyTool: () => c.applyTool(),
    perform,
    setView,
    onStats,
    settingsSpec: SETTINGS,
  };
}
