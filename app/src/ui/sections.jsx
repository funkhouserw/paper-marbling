// Draws the sections in features.js, so both layouts show the same controls with the same rules.
import {
  Bookmark, Code, Download, Droplet, FastForward, Gauge, Grid2x2, History, Palette, Pause, Play, Printer, Redo2,
  Square, Trash2, Undo2, Waves,
} from 'lucide-react';
import { ACTIONS, SECTIONS } from './features.js';
import { SETTINGS } from '../../../controller.js';
import { TINTS as PAPER_TINTS } from '../../../paper.js';
import { INFO, PALETTES, SIMULATORS } from './controls.js';
import { Button, Choice, NumberField, Slider, Swatches, Toggle, cx } from './widgets.jsx';

export const SECTION_ICONS = {
  palette: Palette, history: History, bookmark: Bookmark, printer: Printer, download: Download, square: Square,
  grid: Grid2x2, waves: Waves, gauge: Gauge, code: Code, drop: Droplet,
};
export const ACTION_ICONS = { undo: Undo2, redo: Redo2, trash: Trash2, play: Play, pause: Pause, finish: FastForward, printer: Printer };

export const action = (id) => ACTIONS.find((a) => a.id === id);
// What the mock tank can do, shaped like TankController.capabilities().
export function capabilities(simulator) {
  const film = ['film', 'wake', 'wakefast'].includes(simulator);
  return {
    erase: simulator !== 'gridink',
    hearts: simulator !== 'gridink',
    freeze: simulator !== 'gridink',
    tile: !['spreading', 'thinfilm'].includes(simulator),
    tileOffset: ['classic', 'film', 'wake', 'wakefast'].includes(simulator),
    walls: simulator !== 'gridink',
    flow: ['wake', 'wakefast', 'gridink'].includes(simulator),
    film,
  };
}

// Whether something with a `when` applies to this tank right now.
export function applies(item, state, local) {
  if (item.when === undefined) return true;
  if (item.when === 'local') return local;
  if (item.when === 'gridink') return state.settings.simulator === 'gridink';
  const caps = capabilities(state.settings.simulator);
  if (!(item.when in caps)) throw new Error(`Unknown when: ${item.when}`);
  return item.when === 'tileOffset' ? caps.tileOffset && Boolean(state.settings.tile) : caps[item.when];
}
export const visible = (item, state, local) => (item.view !== 'advanced' || state.view === 'advanced')
  && applies(item, state, local)
  && Object.entries(item.showIf ?? {}).every(([k, v]) => state.settings[k] === v);

export function sectionsFor(where, layout, state, local) {
  return SECTIONS.filter((s) => s[layout] === where && visible(s, state, local));
}

function History_({ state }) {
  return (
    <ol className="scroll-thin max-h-44 space-y-0.5 overflow-y-auto text-xs">
      {state.history.length === 0 && <li className="text-ink-400">Nothing yet.</li>}
      {state.history.map((h, i) => (
        <li key={i} className={cx('rounded px-2 py-1', i === state.historyAt - 1 ? 'bg-ink-700 text-ink-100' : i >= state.historyAt ? 'text-ink-600 line-through' : 'text-ink-300')}>
          {h}
        </li>
      ))}
    </ol>
  );
}

// Viscosity runs from 5 to 20000, so its slider is logarithmic. The box takes any typed value.
export function ViscositySlider({ c, value, info, onChange, className = 'w-52' }) {
  const lo = Math.log(c.min);
  const span = Math.log(c.max) - lo;
  return (
    <Slider
      className={className} label={c.label} value={value} min={c.min} max={c.max} step={1} info={info}
      toDial={(v) => Math.round(((Math.log(Math.max(c.min, v)) - lo) / span) * 100)}
      fromDial={(d) => Math.round(Math.exp(lo + (d / 100) * span))}
      showValue={(v) => v}
      onChange={(v) => onChange(String(v))}
    />
  );
}


// One control from features.js.
export function Control({ c: placed, tank, run }) {
  // Ranges and steps come from the controller's own list where it has the setting, so they can't drift.
  const spec = SETTINGS[placed.id];
  const c = spec ? { ...placed, min: spec.min ?? placed.min, max: spec.max ?? placed.max, step: spec.step ?? placed.step } : placed;
  const { state, dispatch, palette } = tank;
  const s = state.settings;
  const set = (value) => dispatch({ type: 'setting', key: c.id, value });
  const info = INFO[c.info];
  switch (c.kind) {
    case 'slider': return <Slider label={c.label} value={s[c.id]} min={c.min} max={c.max} step={c.step} info={info} onChange={set} />;
    case 'viscosity': return <ViscositySlider c={c} value={s.visc} info={info} onChange={set} />;
    case 'toggle': return <Toggle label={c.label} checked={Boolean(s[c.id])} info={info} onChange={set} />;
    case 'choice': return <Choice label={c.label} value={s[c.id]} options={c.options} info={info} onChange={set} />;
    case 'number': return <NumberField label={c.label} value={s[c.id]} min={c.min} max={c.max} step={c.step} info={info} onChange={set} />;
    case 'action': {
      const a = action(c.action);
      return <Button primary={c.primary} className="self-start" onClick={() => run(a.id)}>{a.label}</Button>;
    }
    case 'actions':
      return <div className="flex gap-1.5">{c.actions.map((id) => <Button key={id} onClick={() => run(id)}>{action(id).label}</Button>)}</div>;
    case 'status':
      if (c.id === 'printProgress' && state.printing != null) {
        return (
          <div className="flex items-center gap-2 text-xs text-ink-300">
            Printing
            <progress value={state.printing} max={1} className="h-1.5 flex-1 accent-gilt" />
          </div>
        );
      }
      return null;
    case 'history': return <History_ state={state} />;
    case 'gallery': {
      if (c.id === 'saves') {
        if (!state.saves?.length) return <p className="text-xs text-ink-400">{c.empty}</p>;
        return (
          <ul className="flex flex-col gap-1.5">
            {state.saves.map((save) => (
              <li key={save.id} className="flex items-center gap-2 text-xs text-ink-300">
                <img src={save.thumb} alt="" className="h-9 w-12 rounded-sm object-cover ring-1 ring-ink-600" />
                {new Date(save.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                <span className="flex-1" />
                <Button onClick={() => dispatch({ type: 'restoreSave', save })}>Restore</Button>
                <button type="button" aria-label="Delete this save" onClick={() => dispatch({ type: 'deleteSave', id: save.id })} className="px-1 text-ink-400 hover:text-ink-100">×</button>
              </li>
            ))}
          </ul>
        );
      }
      if (!state.pulls?.length) return <p className="text-xs text-ink-400">{c.empty}</p>;
      return (
        <div className="grid grid-cols-3 gap-1.5">
          {state.pulls.map((pull) => (
            <button key={pull.id} type="button" title={new Date(pull.date).toLocaleString()} onClick={() => dispatch({ type: 'openPull', pull })} className="overflow-hidden rounded-sm ring-1 ring-ink-600 hover:ring-gilt">
              <img src={pull.url} alt={`Print from ${new Date(pull.date).toLocaleString()}`} className="aspect-[10/7] w-full object-cover" />
            </button>
          ))}
        </div>
      );
    }
    case 'palette':
      return (
        <div className="flex flex-col gap-2.5">
          <Choice
            label="Palette" value={state.palette} info={info}
            options={Object.fromEntries([
              ...(state.palettes?.saved ?? []).map((p) => [p.name, `${p.name} (mine)`]),
              ...(state.palettes?.builtIn ?? PALETTES).map((p) => [p.name, p.name]),
            ])}
            onChange={(name) => dispatch({ type: 'set', patch: { palette: name, ink: 0 } })}
          />
          <Swatches palette={palette} ink={state.ink} onPick={(ink) => dispatch({ type: 'set', patch: { ink } })} />
        </div>
      );
    case 'inkEditor': {
      // The ink the next drop uses: any colour, not only the palette's, with opacity and shimmer.
      const ink = state.inkNow ?? { rgb: (palette.inks[state.ink] ?? palette.inks[0]).color.slice(0, 7), alpha: 1, shimmer: (palette.inks[state.ink] ?? palette.inks[0]).shimmer };
      const setInk = (patch) => dispatch({ type: 'ink', ...patch });
      return (
        <div className="flex flex-col gap-2 rounded-md border border-ink-700 p-2">
          <label className="flex items-center gap-2 text-xs text-ink-300">
            Colour
            <input type="color" value={ink.rgb} onChange={(e) => setInk({ rgb: e.target.value })} className="h-6 w-10 cursor-pointer rounded border border-ink-600 bg-transparent" />
            <span className="font-mono text-ink-400">{ink.rgb}</span>
          </label>
          <Slider label="Opacity (%)" value={Math.round(ink.alpha * 100)} min={0} max={100} step={1} info={INFO['color.alpha']} onChange={(v) => setInk({ alpha: v / 100 })} />
          <Slider label="Shimmer (%)" value={Math.round(ink.shimmer * 100)} min={0} max={100} step={1} info={INFO['color.shimmer']} onChange={(v) => setInk({ shimmer: v / 100 })} />
        </div>
      );
    }
    case 'paletteEditor':
      // Changing the palette's inks recolours the swatches, not ink already in the tank. Saving and
      // deleting named palettes keep them in this browser.
      return (
        <details className="text-xs text-ink-300">
          <summary className="cursor-pointer">{c.label}</summary>
          <div className="mt-2 flex flex-col gap-2">
            {palette.inks.map((k, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="color" aria-label={`Ink ${i + 1} colour`} value={k.color.slice(0, 7)} onChange={(e) => dispatch({ type: 'paletteInk', i, rgb: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-ink-600 bg-transparent" />
                <Slider className="flex-1" label={`Ink ${i + 1} shimmer`} value={Math.round(k.shimmer * 100)} min={0} max={100} step={1} onChange={(v) => dispatch({ type: 'paletteInk', i, shimmer: v / 100 })} />
                <button type="button" aria-label={`Remove ink ${i + 1}`} disabled={palette.inks.length < 2} onClick={() => dispatch({ type: 'paletteInk', i, remove: true })} className="text-ink-400 hover:text-ink-100 disabled:opacity-30">×</button>
              </div>
            ))}
            <Button className="self-start" disabled={palette.inks.length >= 12} onClick={() => dispatch({ type: 'paletteInk', add: true })}>Add ink</Button>
            <input placeholder="Palette name" value={state.paletteName ?? ''} onChange={(e) => dispatch({ type: 'set', patch: { paletteName: e.target.value } })} className="h-7 rounded-md border border-ink-600 bg-ink-800 px-2" />
            <div className="flex gap-1.5">
              <Button onClick={() => run('savePalette')}>Save palette</Button>
              <Button onClick={() => run('deletePalette')}>Delete</Button>
            </div>
          </div>
        </details>
      );
    case 'tints':
      return (
        <div role="radiogroup" aria-label={c.label} className="flex items-center gap-1.5 text-xs text-ink-300">
          {c.label}
          {Object.entries(PAPER_TINTS).map(([name, color]) => (
            <button
              key={name} type="button" role="radio" aria-checked={state.tint === color} aria-label={name} title={name}
              onClick={() => dispatch({ type: 'tint', color })}
              className={cx('size-5 rounded border', state.tint === color ? 'border-gilt ring-1 ring-gilt' : 'border-ink-600')}
              style={{ background: color }}
            />
          ))}
        </div>
      );
    case 'simulator':
      return <Choice label={c.label} value={s.simulator} info={info} options={Object.fromEntries(SIMULATORS.map((m) => [m.id, m.label]))} onChange={(v) => dispatch({ type: 'setting', key: 'simulator', value: v })} />;
    case 'tankSize':
      return (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="W" value={s.tankW} min={100} max={4000} step={10} info={info} onChange={(v) => dispatch({ type: 'setting', key: 'tankW', value: String(v) })} />
            <NumberField label="H" value={s.tankH} min={100} max={4000} step={10} onChange={(v) => dispatch({ type: 'setting', key: 'tankH', value: String(v) })} />
          </div>
          <div className="flex flex-wrap gap-1">
            {[['1000', '700', 'Landscape'], ['700', '1000', 'Portrait'], ['800', '800', 'Square']].map(([w, h, name]) => (
              <Button key={name} onClick={() => dispatch({ type: 'set', patch: { settings: { ...s, tankW: w, tankH: h } } })}>{name}</Button>
            ))}
            <Button primary onClick={() => run('clear')}>Apply (clears tank)</Button>
          </div>
        </div>
      );
    case 'colourToggle':
      return (
        <div className="flex items-center gap-2">
          <Toggle label={c.label} checked={Boolean(s[c.id])} info={info} onChange={set} />
          <input type="color" aria-label="Base colour" value={s.bath} onChange={(e) => dispatch({ type: 'setting', key: 'bath', value: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-ink-600 bg-transparent" />
        </div>
      );
    case 'custom': return null; // drawn by its own section (script drawer, assistant)
    default: throw new Error(`Unknown control kind ${c.kind}`);
  }
}

export function SectionBody({ section, tank, run, local }) {
  return (
    <div className="flex flex-col gap-3">
      {section.controls.filter((c) => visible(c, tank.state, local)).map((c) => <Control key={c.id} c={c} tank={tank} run={run} />)}
    </div>
  );
}
