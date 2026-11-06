// The desktop layout: Photoshop's arrangement with a quieter look. Menus on top, the current
// tool's settings under them, a tool rail on the left, panels on the right, transport below.
import { useEffect, useRef, useState } from 'react';
import {
  Bookmark, Code, FastForward, History, Image, Palette as PaletteIcon, Pause, Play, Printer, Redo2, Trash2, Undo2, X,
} from 'lucide-react';
import {
  DETAIL_PRESETS, FLOW_PRESETS, GROUPS, ICONS, INFO, MENUS, PALETTES, QUEUE_MODES, SIMULATORS, SPEEDS, toolDef,
} from '../ui/controls.js';
import { Button, Choice, IconButton, Slider, Swatches, Toggle, cx } from '../ui/widgets.jsx';
import { CreatureChat, InkDrop, ScriptBody, Tank, ToolHint, ToolSettings } from '../ui/parts.jsx';

export function ViewSwitch({ view, onChange }) {
  return (
    <div role="radiogroup" aria-label="View" className="flex rounded-md bg-ink-800 p-0.5 text-xs">
      {['simple', 'advanced'].map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          onClick={() => onChange(v)}
          className={cx(
            'rounded px-2.5 py-1 capitalize transition-colors focus-visible:outline-2 focus-visible:outline-gilt',
            view === v ? 'bg-ink-600 text-ink-100' : 'text-ink-400 hover:text-ink-100',
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

export function MenuBar({ tank }) {
  const { state, dispatch } = tank;
  const [open, setOpen] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (open === null) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(null); };
    const key = (e) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
  }, [open]);
  const pick = (item) => {
    setOpen(null);
    if (item === 'Simple' || item === 'Advanced') dispatch({ type: 'set', patch: { view: item.toLowerCase() } });
    else if (item === 'Script drawer') dispatch({ type: 'set', patch: { drawer: !state.drawer, view: 'advanced' } });
    else if (item === 'Undo') dispatch({ type: 'undo' });
    else if (item === 'Redo') dispatch({ type: 'redo' });
    else if (item === 'Clear tank') dispatch({ type: 'clear' });
    else if (item === 'Ask the drop') dispatch({ type: 'set', patch: { creature: true } });
  };
  return (
    <header className="flex h-10 shrink-0 items-center gap-1 border-b border-ink-700 bg-ink-900 px-2">
      <span className="mr-3 flex items-center gap-1.5 pl-1 text-sm font-semibold tracking-tight">
        <InkDrop size={18} /> Marbler
      </span>
      <nav ref={ref} aria-label="Menus" className="flex">
        {MENUS.map((m, i) => (
          <div key={m.label} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={open === i}
              onClick={() => setOpen(open === i ? null : i)}
              onPointerEnter={() => open !== null && setOpen(i)}
              className={cx('rounded px-2.5 py-1 text-xs', open === i ? 'bg-ink-700 text-ink-100' : 'text-ink-300 hover:text-ink-100')}
            >
              {m.label}
            </button>
            {open === i && (
              <div role="menu" className="absolute left-0 top-8 z-50 min-w-48 rounded-lg border border-ink-600 bg-ink-850 py-1 shadow-2xl">
                {m.items.map((item, j) => (item === '—'
                  ? <div key={j} className="my-1 h-px bg-ink-700" />
                  : (
                    <button
                      key={item} type="button" role="menuitem" onClick={() => pick(item)}
                      className="block w-full px-3 py-1.5 text-left text-xs text-ink-100 hover:bg-ink-700"
                    >
                      {item}
                    </button>
                  )))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <span className="flex-1" />
      {state.view === 'advanced' && (
        <Button onClick={() => dispatch({ type: 'set', patch: { drawer: !state.drawer } })} className={state.drawer ? 'border-gilt' : ''}>
          <Code size={13} /> Script
        </Button>
      )}
      <ViewSwitch view={state.view} onChange={(view) => dispatch({ type: 'set', patch: { view, drawer: view === 'advanced' && state.drawer } })} />
    </header>
  );
}

export function OptionsBar({ tank }) {
  const { state, palette, dispatch } = tank;
  const def = toolDef(state.tool);
  const Icon = ICONS[state.tool];
  return (
    <div className="flex min-h-14 shrink-0 items-center gap-5 border-b border-ink-700 bg-ink-900/70 px-4 py-2">
      <span className="flex shrink-0 items-center gap-2 text-sm font-medium">
        <Icon size={16} className="text-gilt" /> {def.label}
      </span>
      {def.color && (
        <Swatches palette={palette} ink={state.ink} onPick={(ink) => dispatch({ type: 'set', patch: { ink } })} />
      )}
      <div className="min-w-0 flex-1"><ToolSettings tank={tank} /></div>
    </div>
  );
}

export function ToolRail({ tank }) {
  const { state, dispatch } = tank;
  return (
    <nav aria-label="Tools" className="scroll-thin flex w-14 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-ink-700 bg-ink-900 py-2">
      {GROUPS.map((g, gi) => (
        <div key={g.id} className={cx('flex flex-col items-center gap-0.5', gi > 0 && 'mt-1 border-t border-ink-700 pt-1.5')}>
          <span className="mb-0.5 text-[10px] uppercase tracking-wider text-ink-400">{g.label}</span>
          {g.tools.map((t) => {
            const Icon = ICONS[t];
            return (
              <IconButton key={t} label={toolDef(t).label} active={state.tool === t} onClick={() => dispatch({ type: 'tool', tool: t })} size="rail">
                <Icon size={17} />
              </IconButton>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Panel({ title, info, children, right }) {
  return (
    <section className="border-b border-ink-700 px-3 py-3">
      <h2 className="mb-2.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
        {title}{info}<span className="flex-1" />{right}
      </h2>
      {children}
    </section>
  );
}

export function PalettePanel({ tank }) {
  const { state, palette, dispatch } = tank;
  return (
    <div className="flex flex-col gap-3">
      <Choice
        label="Palette" value={state.palette} info={INFO.palette}
        options={Object.fromEntries(PALETTES.map((p) => [p.name, p.name]))}
        onChange={(name) => dispatch({ type: 'set', patch: { palette: name, ink: 0 } })}
      />
      <Swatches palette={palette} ink={state.ink} onPick={(ink) => dispatch({ type: 'set', patch: { ink } })} />
      {state.view === 'advanced' && <Button className="self-start">Edit inks…</Button>}
    </div>
  );
}

function HistoryPanel({ tank }) {
  const { state } = tank;
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

function TankPanel({ tank }) {
  const { state, dispatch } = tank;
  const s = state.settings;
  const set = (key) => (value) => dispatch({ type: 'setting', key, value });
  const flowing = ['wake', 'wakefast', 'gridink'].includes(s.simulator);
  return (
    <div className="flex flex-col gap-3">
      <Choice label="Simulator" value={s.simulator} info={INFO.simulator} options={Object.fromEntries(SIMULATORS.map((m) => [m.id, m.label]))} onChange={set('simulator')} />
      <div className="grid grid-cols-2 gap-2">
        <Choice label="Width (mm)" value={s.tankW} options={{ 1000: '1000', 700: '700', 500: '500' }} info={INFO.tankSize} onChange={set('tankW')} />
        <Choice label="Height (mm)" value={s.tankH} options={{ 700: '700', 1000: '1000', 500: '500' }} onChange={set('tankH')} />
      </div>
      <Toggle label="Walls" checked={s.walls} info={INFO.walls} onChange={set('walls')} />
      <Toggle label="Repeating" checked={s.tile} info={INFO.tile} onChange={set('tile')} />
      <Toggle label="Base colour" checked={s.useBath} info={INFO.baseColour} onChange={set('useBath')} />
      <Toggle label="Tools wait for ink" checked={s.toolsWait} info={INFO.toolsWait} onChange={set('toolsWait')} />
      <Choice label="While paused, add" value={s.queueMode} options={QUEUE_MODES} info={INFO.queueMode} onChange={set('queueMode')} />
      {flowing && (
        <>
          <Choice label="Moving bath" value={s.flowPreset} options={FLOW_PRESETS} info={INFO.flowPreset} onChange={set('flowPreset')} />
          <Slider label="Push" value={s.flowPush} min={0} max={10} step={0.1} info={INFO.flowPush} onChange={set('flowPush')} />
          <Slider label="Friction" value={s.flowFriction} min={0} max={1} step={0.01} info={INFO.flowFriction} onChange={set('flowFriction')} />
          <Slider label="Coast (s)" value={s.flowCoast} min={0} max={200} step={1} info={INFO.flowCoast} onChange={set('flowCoast')} />
        </>
      )}
      <Choice label="Detail" value={s.pointLimit} options={DETAIL_PRESETS} info={INFO.pointLimit} onChange={set('pointLimit')} />
    </div>
  );
}

const PANELS = [
  { id: 'palette', label: 'Palette', Icon: PaletteIcon, Body: PalettePanel, info: INFO.palette },
  { id: 'history', label: 'History', Icon: History, Body: HistoryPanel },
  { id: 'saved', label: 'Saved', Icon: Bookmark, Body: () => <p className="text-xs text-ink-400">Keep the tank as it is now, to come back to.<br /><Button className="mt-2">Save state</Button></p>, info: INFO.savedStates },
  { id: 'prints', label: 'Prints', Icon: Image, Body: () => <p className="text-xs text-ink-400">Pull a print to lay paper on the tank. Prints collect here.<br /><Button className="mt-2"><Printer size={12} /> Pull a print</Button></p>, info: INFO.pull },
  { id: 'tank', label: 'Tank', Icon: null, Body: TankPanel, advanced: true },
];

export function Panels({ tank }) {
  const { state } = tank;
  return (
    <aside aria-label="Panels" className="scroll-thin w-64 shrink-0 overflow-y-auto border-l border-ink-700 bg-ink-900">
      {PANELS.filter((p) => !p.advanced || state.view === 'advanced').map(({ id, label, Icon, Body }) => (
        <Panel key={id} title={<span className="flex items-center gap-1.5">{Icon && <Icon size={12} />}{label}</span>}>
          <Body tank={tank} />
        </Panel>
      ))}
    </aside>
  );
}

export function TransportBar({ tank }) {
  const { state, dispatch } = tank;
  const s = state.settings;
  const set = (key) => (value) => dispatch({ type: 'setting', key, value });
  return (
    <footer className="flex h-12 shrink-0 items-center gap-2 border-t border-ink-700 bg-ink-900 px-3">
      <IconButton label={state.playing ? 'Pause' : 'Play'} onClick={() => dispatch({ type: 'set', patch: { playing: !state.playing } })}>
        {state.playing ? <Pause size={18} /> : <Play size={18} />}
      </IconButton>
      <IconButton label="Finish now" title={INFO.finish}><FastForward size={18} /></IconButton>
      <div role="radiogroup" aria-label="Speed" className="flex rounded-md bg-ink-800 p-0.5 text-xs">
        {SPEEDS.map((v) => (
          <button
            key={v} type="button" role="radio" aria-checked={s.speed === v} onClick={() => set('speed')(v)}
            className={cx('rounded px-2 py-0.5 font-mono', s.speed === v ? 'bg-ink-600 text-ink-100' : 'text-ink-400 hover:text-ink-100')}
          >
            {v}×
          </button>
        ))}
      </div>
      <span className="mx-1 h-6 w-px bg-ink-700" />
      <IconButton label="Undo" onClick={() => dispatch({ type: 'undo' })} disabled={state.historyAt === 0}><Undo2 size={17} /></IconButton>
      <IconButton label="Redo" onClick={() => dispatch({ type: 'redo' })} disabled={state.historyAt === state.history.length}><Redo2 size={17} /></IconButton>
      <IconButton label="Clear tank" onClick={() => dispatch({ type: 'clear' })}><Trash2 size={17} /></IconButton>
      <span className="mx-1 h-6 w-px bg-ink-700" />
      <Slider label="Viscosity" value={s.visc} min={5} max={1000} step={1} info={INFO.viscosity} onChange={set('visc')} className="w-48" />
      <span className="flex-1" />
      <ToolHint tool={state.tool} />
      <span className="shrink-0 pl-3 font-mono text-xs tabular-nums text-ink-400">
        t {state.time.toFixed(1)} s · {state.shapes} shapes
      </span>
      <Button primary className="ml-2"><Printer size={13} /> Pull</Button>
    </footer>
  );
}

// Slides in from the right, resizable by its left edge. The tank shrinks to sit beside it.
export function ScriptDrawer({ tank }) {
  const { dispatch } = tank;
  const [width, setWidth] = useState(440);
  const drag = (e) => {
    const start = e.clientX;
    const was = width;
    const move = (ev) => setWidth(Math.min(900, Math.max(320, was + start - ev.clientX)));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <aside aria-label="Script" style={{ width }} className="relative flex shrink-0 flex-col gap-3 border-l border-ink-700 bg-ink-900 p-3">
      <div
        role="separator" aria-orientation="vertical" aria-label="Resize script drawer"
        onPointerDown={drag}
        className="absolute inset-y-0 -left-1 w-2 cursor-col-resize hover:bg-gilt/30"
      />
      <div className="flex items-center gap-2">
        <Code size={14} className="text-gilt" />
        <h2 className="text-sm font-medium">Script</h2>
        <span className="flex-1" />
        <IconButton size="sm" label="Close script" onClick={() => dispatch({ type: 'set', patch: { drawer: false } })}><X size={14} /></IconButton>
      </div>
      <ScriptBody tank={tank} />
    </aside>
  );
}

export function Creature({ tank, canWriteScripts }) {
  const { state, dispatch } = tank;
  const set = (creature) => dispatch({ type: 'set', patch: { creature } });
  return (
    <div className="absolute bottom-4 left-4 z-40">
      {state.creature
        ? (
          <div className="h-96 w-80 overflow-hidden rounded-xl border border-ink-600 bg-ink-900 shadow-2xl">
            <CreatureChat onClose={() => set(false)} canWriteScripts={canWriteScripts} />
          </div>
        )
        : (
          <button type="button" aria-label="Ask the drop" title="Ask the drop" onClick={() => set(true)} className="rounded-full p-1 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-gilt">
            <InkDrop size={44} />
          </button>
        )}
    </div>
  );
}

export function Desktop({ tank, canWriteScripts = true }) {
  const { state, applyTool } = tank;
  return (
    <div className="flex h-full min-h-[600px] flex-col overflow-hidden bg-ink-950">
      <MenuBar tank={tank} />
      <OptionsBar tank={tank} />
      <div className="flex min-h-0 flex-1">
        <ToolRail tank={tank} />
        <main className="relative flex min-w-0 flex-1 p-6">
          <Tank state={state} palette={tank.palette} className="flex-1" onUse={applyTool} />
          <Creature tank={tank} canWriteScripts={canWriteScripts} />
        </main>
        {state.drawer && state.view === 'advanced' ? <ScriptDrawer tank={tank} /> : <Panels tank={tank} />}
      </div>
      <TransportBar tank={tank} />
    </div>
  );
}
