// The real tank behind the new interface. It gives the layouts the same { state, dispatch,
// palette, act, applyTool } shape as useMockTank, so they work with either, but every change goes
// to TankController, and the state is read back from it after each of its events.
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { TankController, SETTINGS, DETAIL_PRESETS, storedSettings, storeSetting } from '../../../controller.js';
import { textContours } from '../../../text.js';
import { EXAMPLES, EXAMPLE_SIMULATOR } from '../../../examples.js';
import { PALETTES, palette as findPalette } from '../../../palettes.js';
import { FIXED, SECTIONS } from '../ui/features.js';
import { TINTS } from '../../../paper.js';
import {
  download, stamp, pngBlob, svgBlob, printBlob, pullOptions, keepPull, listPulls, deletePull, listSaves, deleteSave,
  saveTank, restoreTank, myScripts, saveScript, findScript, paletteChoices, savePalette, deletePalette,
  applyPaletteActions, askAssistant,
} from '../../../pageactions.js';

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
  separate: (c) => c.commitSeparate(),
  seam: (c) => c.commitSeparate(),
  channel: (c) => c.commitSeparate(),
  ribbonCut: (c) => c.commitRibbonCut(),
  useBath: (c) => c.commitBath(),
  gall: (c) => c.commitGall(),
  gallStart: (c) => c.commitGall(),
  gallStep: (c) => c.commitGall(),
  gallMost: (c) => c.commitGall(),
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
    // Actions held behind a settle point, waiting for the ink to stop (Tools wait for ink to settle).
    held: m.gates.reduce((n, g) => n + g.ops.length, 0),
    // The tool now moving the ink, if any (a rake, stir and so on; drops spreading don't count).
    working: m.active.find((op) => op.kind !== 'drop')?.kind ?? null,
    // Any ink still moving: drops spreading, a tool, or the bath coasting. Paused counts as still.
    moving: c.playing && m.busy,
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
  chat: [],
  chatBusy: false,
  // Kept in this browser: saved tanks, pulled prints, my scripts and my palettes.
  saves: [],
  pulls: [],
  scripts: [],
  palettes: { saved: [], builtIn: PALETTES },
  tint: Object.values(TINTS)[0],
  printing: null, // 0 to 1 while a print is being made
  viewer: null,   // { url, blob, id, date } for the print being looked at
  openScript: '', // the saved script now in the editor
  scriptName: '',
  paletteName: '',
};

// Everything about how the editor was set up, kept in this browser so a reload picks up where you
// left off: the tool and every brush setting, the palette and chosen ink, Simple or Advanced, the
// panels' settings and the paper tint. The ink in the tank isn't kept here; Save state does that.
const KEPT_KEY = 'marbler.editor';
function readKept() {
  try {
    const k = JSON.parse(localStorage.getItem(KEPT_KEY) ?? 'null');
    return k && typeof k === 'object' ? k : null;
  } catch { return null; }
}
const pick = (from, allowed) => Object.fromEntries(Object.entries(from ?? {}).filter(([k]) => k in allowed));

// The storage keys of settings kept on their own (the simulator, the point limit…).
const keptSettingKeys = () => Object.values(SETTINGS).map((s) => s.store).filter(Boolean);

function uiReducer(s, a) {
  return { ...s, ...a };
}

export function useTank() {
  const controller = useMemo(() => {
    // The editor starts on Wake (fast), Ilse's choice, unless a simulator was chosen before.
    const kept = storedSettings(localStorage);
    const last = readKept();
    const lastSettings = pick(last?.settings, SETTINGS);
    // A phone held upright starts on an upright tank, so it fills the screen, unless a size was kept.
    const upright = !lastSettings.tankW && !matchMedia('(min-width: 760px) and (min-height: 600px)').matches
      && matchMedia('(orientation: portrait)').matches;
    const size = upright ? { tankW: '700', tankH: '1000' } : {};
    const c = new TankController({ settings: { simulator: 'wakefast', ...lastSettings, ...kept, ...size }, trace: textContours });
    if (last) {
      // Brush settings, only for tools and settings that still exist.
      for (const [tool, values] of Object.entries(last.values ?? {})) {
        if (c.values[tool]) Object.assign(c.values[tool], pick(values, c.values[tool]));
      }
      if (last.tool && c.values[last.tool]) c.setTool(last.tool);
      if (last.palette) {
        try { c.usePalette(last.palette); } catch { /* a palette that's since been deleted */ }
        // The palette brings its own base colour; the one last chosen wins.
        if (lastSettings.bath) { c.settings.bath = lastSettings.bath; c.commitBath(); }
      }
      const ink = c.inks[last.ink];
      if (ink) { c.setInk(ink.color, c.inkAlpha()); c.shimmer = ink.shimmer; }
    }
    if (upright || last) c.clear();
    c.setPointLimit(c.pointLimit());
    return c;
  }, []);
  const c = controller;
  const [ui, setUi] = useReducer(uiReducer, START, (start) => {
    const last = readKept();
    if (!last) return start;
    return {
      ...start,
      ...(['simple', 'advanced'].includes(last.view) && { view: last.view }),
      ...(typeof last.palette === 'string' && { palette: last.palette }),
      ...(Number.isInteger(last.ink) && c.inks[last.ink] && { ink: last.ink }),
      ...(typeof last.tint === 'string' && { tint: last.tint }),
      page: { ...start.page, ...pick(last.page, start.page) },
    };
  });
  const [version, bump] = useReducer((n) => n + 1, 0);

  // Keep the setup: at most once a second while things change (the tank changes many times a
  // second while it runs), and again whenever the page is hidden or closed.
  const keep = useRef(null);
  const resetting = useRef(false);
  keep.current = () => {
    if (resetting.current) return;
    try {
      localStorage.setItem(KEPT_KEY, JSON.stringify({
        settings: c.settings, values: c.values, tool: c.tool,
        palette: ui.palette, ink: ui.ink, view: ui.view, page: ui.page, tint: ui.tint,
      }));
    } catch { /* storage full or blocked: nothing to keep */ }
  };
  // Says so when the simulator can't keep up with what's in the tank (#51).
  useEffect(() => {
    const id = setInterval(() => c.checkSlow(performance.now() / 1000), 1000);
    return () => clearInterval(id);
  }, [c]);
  const lastKept = useRef(0);
  useEffect(() => {
    const wait = 1000 - (performance.now() - lastKept.current);
    const t = setTimeout(() => { lastKept.current = performance.now(); keep.current(); }, Math.max(0, wait));
    return () => clearTimeout(t);
  }, [c, version, ui.palette, ui.ink, ui.view, ui.page, ui.tint]);
  useEffect(() => {
    const now = () => keep.current();
    const hidden = () => { if (document.visibilityState === 'hidden') now(); };
    window.addEventListener('pagehide', now);
    document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('pagehide', now); document.removeEventListener('visibilitychange', hidden); };
  }, []);

  // Redraw on anything the controller says changed. Time and shape counts change every frame,
  // so they're read a few times a second instead.
  useEffect(() => {
    const offs = ['tank', 'settings', 'history', 'playing', 'tool', 'freeze'].map((t) => c.on(t, bump));
    offs.push(c.on('notice', (msg) => setUi({ notice: msg || null })));
    return () => offs.forEach((off) => off());
  }, [c]);

  // What's kept in this browser, read again after anything changes it.
  const refresh = useCallback(async () => {
    const [saves, pulls] = await Promise.all([listSaves().catch(() => []), listPulls().catch(() => [])]);
    const old = latestUi.current.pulls;
    old.forEach((p) => URL.revokeObjectURL(p.url));
    setUi({
      saves: saves.reverse(),
      pulls: pulls.map((p) => ({ ...p, url: URL.createObjectURL(p.blob) })).reverse(),
      scripts: myScripts.list(),
      palettes: paletteChoices(),
    });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // tankview.js, once LiveTank has mounted it. It reports the tank's numbers every 250 ms.
  const view = useRef(null);
  const setView = useCallback((v) => { view.current = v; }, []);
  const onStats = useCallback(() => bump(), []);

  const latestUi = useRef(ui);
  latestUi.current = ui;

  const pickInk = useCallback((i) => {
    if (i === 'clear') {
      // Clear (gall water): the engine's 'clear', which cuts a real hole in the ink it opens in.
      c.setInk('clear', 1);
      c.shimmer = 0;
      setUi({ ink: 'clear' });
      return;
    }
    if (i === 'white') {
      c.setInk('#ffffff', 1);
      c.shimmer = 0;
      setUi({ ink: 'white' });
      return;
    }
    if (i === 'tint') {
      // The last palette colour picked, see-through.
      const base = c.inks[typeof latestUi.current.ink === 'number' ? latestUi.current.ink : 0] ?? c.inks[0];
      c.setInk(base.color.slice(0, 7), 0.35);
      c.shimmer = 0;
      setUi({ ink: 'tint' });
      return;
    }
    if (i && typeof i === 'object' && i.custom) {
      // Any colour, from the + swatch: the next drop's ink, without changing the palette.
      c.setInk(i.custom, c.inkAlpha());
      c.shimmer = 0;
      setUi({ ink: 'custom' });
      return;
    }
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
        // The controller keeps numbers as strings, as a form field holds them.
        const value = SETTINGS[a.key].kind === 'number' ? String(a.value) : a.value;
        c.settings[a.key] = value;
        COMMIT[a.key]?.(c, value);
        if (a.key === 'lowFramerate') view.current?.redrawNow();
        if (a.key === 'pointLimit') storeSetting(localStorage, 'pointLimit', String(c.pointLimit()));
        else storeSetting(localStorage, a.key, value);
        if (!COMMIT[a.key]) c.emit('settings');
        return;
      }
      case 'ink': {
        // The ink the next drop uses, which needn't be one of the palette's.
        const rgb = a.rgb ?? c.inkRgb();
        const alpha = a.alpha ?? c.inkAlpha();
        if (a.rgb !== undefined || a.alpha !== undefined) c.setInk(rgb, alpha);
        if (a.shimmer !== undefined) c.shimmer = a.shimmer;
        bump();
        return;
      }
      case 'paletteInk':
        if (a.add) c.addPaletteInk();
        else if (a.remove) c.removePaletteInk(a.i);
        else c.setPaletteInk(a.i, { rgb: a.rgb, shimmer: a.shimmer });
        bump();
        return;
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
        // As on the old page: an example picks the simulator it was made for and runs straight away,
        // on a tank of its own.
        if (!a.name) return;
        const sim = EXAMPLE_SIMULATOR[a.name];
        if (sim) {
          c.setSimulator(sim);
          storeSetting(localStorage, 'simulator', sim);
        }
        c.notice('');
        const failed = c.runScript(EXAMPLES[a.name], { clearing: true });
        setUi({ example: a.name, script: EXAMPLES[a.name], scriptError: failed ? String(failed) : null });
        return;
      }
      case 'tint': setUi({ tint: a.color }); return;
      case 'restoreSave': {
        const script = restoreTank(c, a.save);
        setUi({ script: script ?? '', example: '', openScript: '', scriptError: null });
        return;
      }
      case 'deleteSave': deleteSave(a.id).then(refresh); return;
      case 'openPull': openViewer(a.pull.blob, a.pull.id, a.pull.date); return;
      case 'deletePull': deletePull(a.id).then(() => { closeViewer(); refresh(); }); return;
      case 'closeViewer': closeViewer(); return;
      case 'savePull': download(a.blob, `marble-pull-${stamp(a.date)}.png`); return;
      case 'openScript': {
        // Opening only fills the editor, so it can't clear a tank you're working on. Run does that.
        const found = findScript(a.name);
        if (!a.name || !found) { setUi({ openScript: '' }); return; }
        if (found.simulator && SETTINGS.simulator.options.some(([v]) => v === found.simulator)) {
          c.settings.simulator = found.simulator;
          c.commitSimulator();
          storeSetting(localStorage, 'simulator', found.simulator);
        }
        setUi({ openScript: found.name, scriptName: found.name, script: found.text, example: '', scriptError: null });
        return;
      }
      case 'saveScript': {
        const now = latestUi.current;
        const saved = saveScript(c, {
          name: now.scriptName, text: now.script, open: now.openScript,
          confirmReplace: (name) => window.confirm(`Replace the saved script "${name}"?`),
        });
        if (saved.needsName) { c.notice('Type a name for the script first.'); return; }
        if (saved.cancelled) return;
        if (saved.error) { c.notice(saved.error); return; }
        setUi({ openScript: saved.name, scriptName: saved.name });
        refresh();
        return;
      }
      case 'deleteScript': {
        const name = latestUi.current.openScript;
        if (!name || !window.confirm(`Delete the saved script "${name}"?`)) return;
        myScripts.remove(name);
        setUi({ openScript: '', scriptName: '' });
        refresh();
        return;
      }
      default: throw new Error(`Unknown action ${a.type}`);
    }
  }, [c, pickInk, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const openViewer = (blob, id, date, title = 'The print') => {
    const was = latestUi.current.viewer;
    if (was) URL.revokeObjectURL(was.url);
    setUi({ viewer: { blob, id, date, title, url: URL.createObjectURL(blob) } });
  };
  const closeViewer = () => {
    const was = latestUi.current.viewer;
    if (was) URL.revokeObjectURL(was.url);
    setUi({ viewer: null });
  };
  const seed = useRef(Date.now() % 1e9);

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
    inkNow: { rgb: c.inkRgb(), alpha: c.inkAlpha(), shimmer: c.shimmer },
    version,
  };
  const pal = findPalette(ui.palette) ?? PALETTES[0];
  const paletteView = { name: pal.name, bath: c.settings.bath, inks: c.inks };

  // The assistant, on the local server. Its reply replaces the script; nothing runs until Run.
  // A failed turn comes back out of the chat, ready to send again.
  const sendChat = useCallback(async (content) => {
    const now = latestUi.current;
    if (!content.trim() || now.chatBusy) return false;
    const messages = [...now.chat, { role: 'user', content }];
    setUi({ chat: messages, chatBusy: true });
    c.notice('');
    const data = await askAssistant(c, { messages, script: latestUi.current.script, paletteName: latestUi.current.palette });
    if (data.error) {
      c.notice(data.error);
      setUi({ chat: now.chat, chatBusy: false });
      return false;
    }
    try {
      applyPaletteActions(data.paletteActions, {
        onSaved: () => setUi({ palettes: paletteChoices() }),
        use: (name) => dispatch({ type: 'set', patch: { palette: name } }),
      });
    } catch (err) {
      c.notice(`Couldn't save the palette: ${err.message}`);
    }
    setUi({ chat: [...messages, { role: 'assistant', content: data.reply }], script: data.script, example: '', chatBusy: false });
    return true;
  }, [c, dispatch]);

  // Actions from features.js that the real tank handles itself. The rest fall back to the
  // shared handlers in commands.jsx.
  const perform = useCallback((id, ctx) => {
    switch (id) {
      case 'finish': c.finish(); return true;
      case 'seeRepeat':
        // In the same pop-up viewer as prints, as the classic page does.
        view.current?.tilePreview().then((blob) => openViewer(blob, null, Date.now(), 'Four copies of the tank, side by side'));
        return true;
      case 'freezeHere': if (ctx?.point) c.freezeAt(ctx.tankPoint ?? ctx.point, 'freeze'); return true;
      case 'unfreezeHere': if (ctx?.point) c.freezeAt(ctx.tankPoint ?? ctx.point, 'unfreeze'); return true;
      case 'unfreezeAll': c.unfreezeAll(); return true;
      case 'resetTools':
        // Brush settings only (#48): every tool's sliders and choices as shipped. Saves, prints,
        // palettes, the tank settings and the ink in the tank are left alone.
        if (!window.confirm('Reset every tool\'s settings to the defaults?\n\nThe ink in the tank, the tank settings, saved states, prints and palettes stay as they are.')) return true;
        c.resetToolValues();
        bump();
        c.notice('Tools reset to their defaults');
        return true;
      case 'resetTankSettings': {
        // The tank's settings (simulator, size, viscosity, Repeating, detail, base colour…) and the
        // paper's, as shipped. They're read when the page starts, so this forgets them and reloads.
        if (!window.confirm('Reset the tank settings to the defaults?\n\nSimulator, tank size, viscosity, Repeating, detail and the paper go back to how they ship, and the page reloads, so the ink in the tank is cleared: Save state first to keep it. Tool settings, saved states, prints and palettes stay.')) return true;
        resetting.current = true;
        for (const key of keptSettingKeys()) localStorage.removeItem(key);
        const last = readKept();
        if (last) {
          const { settings: _s, page: _p, tint: _t, ...rest } = last;
          try { localStorage.setItem(KEPT_KEY, JSON.stringify(rest)); } catch { /* nothing to keep */ }
        }
        location.reload();
        return true;
      }
      case 'resetAll': {
        // Everything Marbler keeps in this browser: saved states, prints, my scripts, my palettes and
        // every remembered setting. Asks first, then starts afresh.
        if (!window.confirm('Clear everything Marbler keeps in this browser?\n\nSaved states, pulled prints, your scripts and palettes, and all remembered settings will be deleted. This can\'t be undone.')) return true;
        resetting.current = true;
        for (const key of Object.keys(localStorage)) if (key.startsWith('marbler')) localStorage.removeItem(key);
        const gone = ['marbler', 'marbler-saves'].map((name) => new Promise((done) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = req.onerror = req.onblocked = done;
        }));
        Promise.race([Promise.all(gone), new Promise((r) => setTimeout(r, 1500))]).then(() => location.reload());
        return true;
      }
      case 'saveState':
        saveTank(c, view.current, latestUi.current.script).then(({ error }) => { if (error) c.notice(error); else refresh(); });
        return true;
      case 'pull': {
        const v = view.current;
        if (!v || v.pulling) return true;
        const page = latestUi.current.page;
        v.startPull(pullOptions(c, {
          tint: latestUi.current.tint,
          onBase: page.pullBase,
          imperfection: page.imperfection,
          mirror: page.mirror,
          spanish: page.spanish,
          spanishBands: page.spanishBands,
          spanishAngle: page.spanishAngle,
          spanishStrength: page.spanishStrength,
          spanishCreases: page.spanishCreases,
          seed: seed.current++,
          clearAfter: () => latestUi.current.page.clearAfter,
        })).then(async (print) => {
          const { blob, id } = await keepPull(print, { downloadIt: latestUi.current.page.autoSave });
          await refresh();
          openViewer(blob, id, Date.now());
        });
        return true;
      }
      case 'exportPng': pngBlob(c).then((blob) => download(blob, 'marble.png')); return true;
      case 'exportSvg': download(svgBlob(c), 'marble.svg'); return true;
      case 'exportPrint': {
        if (latestUi.current.printing !== null) return true;
        const page = latestUi.current.page;
        setUi({ printing: 0 });
        printBlob(c, { pale: page.printPale, texture: page.printTexture, soft: page.printSoft }, (share) => setUi({ printing: share }))
          .then((blob) => { download(blob, 'marble-print.png'); openViewer(blob, null, Date.now()); })
          .catch((err) => c.notice(`Couldn't make the print: ${err.message}`))
          .finally(() => setUi({ printing: null }));
        return true;
      }
      case 'savePalette': {
        const now = latestUi.current;
        const saved = savePalette(c, { name: now.paletteName, current: now.palette, confirmReplace: (name) => window.confirm(`Replace the saved palette "${name}"?`) });
        if (saved.needsName) { c.notice('Type a name for the palette first.'); return true; }
        if (saved.cancelled) return true;
        if (saved.error) { c.notice(saved.error); return true; }
        setUi({ palette: saved.name, palettes: paletteChoices() });
        return true;
      }
      case 'deletePalette': {
        if (!deletePalette(latestUi.current.palette, (name) => window.confirm(`Delete the saved palette "${name}"?`))) return true;
        setUi({ palettes: paletteChoices() });
        dispatch({ type: 'set', patch: { palette: START.palette } });
        return true;
      }
      case 'copySession': setUi({ script: c.marble.toScript(), example: '', drawer: true, view: 'advanced' }); return true;
      default: return false;
    }
  }, [c, refresh, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    controller: c,
    state,
    dispatch,
    palette: paletteView,
    act: () => {},
    applyTool: () => c.applyTool(),
    perform,
    sendChat,
    clearChat: () => setUi({ chat: [] }),
    setView,
    onStats,
    settingsSpec: SETTINGS,
  };
}
