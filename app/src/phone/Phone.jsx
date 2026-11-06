// The phone layout, after Lightroom and CapCut: the tank on top, a thumb strip at the bottom,
// and settings that rise from the strip without covering the tank.
import { useState } from 'react';
import { Code, Menu, Pause, Play, Redo2, Undo2, X } from 'lucide-react';
import { GROUPS, ICONS, INFO, groupOf, shownParams, toolDef } from '../ui/controls.js';
import { Button, IconButton, Slider, Swatches, cx } from '../ui/widgets.jsx';
import { CreatureChat, InkDrop, ScriptBody, Tank, ToolSettings } from '../ui/parts.jsx';
import { PalettePanel, ViewSwitch } from '../desktop/Desktop.jsx';

function Sheet({ title, onClose, height = 'half', children }) {
  return (
    <div
      role="dialog" aria-label={title}
      className={cx(
        'absolute inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl border-t border-ink-600 bg-ink-900 shadow-2xl',
        height === 'full' ? 'top-10' : 'h-[55%]',
      )}
    >
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-ink-600" />
      <div className="flex items-center px-4 py-2">
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="flex-1" />
        <IconButton size="sm" label="Close" onClick={onClose}><X size={16} /></IconButton>
      </div>
      <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">{children}</div>
    </div>
  );
}

export function Phone({ tank, canWriteScripts = false, landscape = false }) {
  const { state, dispatch, palette, applyTool } = tank;
  const [group, setGroup] = useState(groupOf(state.tool).id);
  const [sheet, setSheet] = useState(null); // 'menu' | 'more' | 'script' | 'creature'
  const def = toolDef(state.tool);
  const params = shownParams(state.tool, 'simple');
  const values = state.values[state.tool] ?? {};
  const set = (patch) => dispatch({ type: 'set', patch });
  const Icon = ICONS[state.tool];

  return (
    <div className={cx('relative flex h-full flex-col overflow-hidden bg-ink-950 text-ink-100', landscape && 'flex-row')}>
      {/* Top bar */}
      <header className={cx('flex shrink-0 items-center gap-1 px-2', landscape ? 'w-12 flex-col py-2' : 'h-12')}>
        <IconButton size="lg" label="Menu" onClick={() => setSheet('menu')}><Menu size={20} /></IconButton>
        <span className="flex-1" />
        <IconButton size="lg" label="Undo" onClick={() => dispatch({ type: 'undo' })}><Undo2 size={20} /></IconButton>
        <IconButton size="lg" label="Redo" onClick={() => dispatch({ type: 'redo' })}><Redo2 size={20} /></IconButton>
        <span className="flex-1" />
        <IconButton size="lg" label={state.playing ? 'Pause' : 'Play'} onClick={() => set({ playing: !state.playing })}>
          {state.playing ? <Pause size={20} /> : <Play size={20} />}
        </IconButton>
      </header>

      {/* Tank */}
      <main className="relative flex min-h-0 flex-1 items-center justify-center p-2">
        <Tank state={state} palette={palette} className="size-full" onUse={applyTool} />
        <button
          type="button" aria-label="Ask the drop" onClick={() => setSheet('creature')}
          className="absolute bottom-3 right-3 rounded-full p-1 focus-visible:outline-2 focus-visible:outline-gilt"
        >
          <InkDrop size={36} />
        </button>
      </main>

      {/* Thumb strip */}
      <div className={cx('shrink-0 border-ink-700 bg-ink-900', landscape ? 'flex w-72 flex-col border-l' : 'border-t')}>
        {def.color && (
          <div className="flex items-center gap-3 px-4 pt-3">
            <Swatches palette={palette} ink={state.ink} size="lg" onPick={(ink) => set({ ink })} />
          </div>
        )}
        <div className="flex items-center gap-2 px-4 pt-3 text-sm">
          <Icon size={16} className="text-gilt" />
          <span className="font-medium">{def.label}</span>
          <span className="flex-1" />
          <button type="button" onClick={() => setSheet('more')} className="text-xs text-gilt-soft underline-offset-2 hover:underline">
            All settings
          </button>
        </div>
        {/* Settings: swipe sideways for more */}
        <div className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-5 overflow-x-auto px-4 py-3">
          {params.map((p) => (
            <Slider
              key={p.key}
              className="w-[calc(50%-10px)] shrink-0 snap-start"
              label={p.label} value={values[p.key]} min={p.min} max={p.max} step={p.step}
              info={INFO[`${state.tool}.${p.key}`]}
              onChange={(value) => dispatch({ type: 'value', tool: state.tool, key: p.key, value })}
            />
          ))}
          {def.whole && <Button primary className="h-11 shrink-0 snap-start self-center px-5" onClick={applyTool}>{def.label}</Button>}
          {params.length === 0 && !def.whole && <p className="text-xs text-ink-400">{def.hint}</p>}
        </div>
        {/* Tools in the chosen group */}
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-2">
          {GROUPS.find((g) => g.id === group).tools.map((t) => {
            const TIcon = ICONS[t];
            return (
              <button
                key={t} type="button" onClick={() => dispatch({ type: 'tool', tool: t })}
                aria-pressed={state.tool === t}
                className={cx(
                  'flex min-w-16 shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px]',
                  state.tool === t ? 'bg-ink-700 text-gilt-soft' : 'text-ink-300',
                )}
              >
                <TIcon size={20} />{toolDef(t).label}
              </button>
            );
          })}
        </div>
        {/* Groups */}
        <nav aria-label="Tool groups" className="grid grid-cols-4 border-t border-ink-700 pb-[env(safe-area-inset-bottom)]">
          {GROUPS.map((g) => (
            <button
              key={g.id} type="button" onClick={() => { setGroup(g.id); dispatch({ type: 'tool', tool: g.tools[0] }); }}
              aria-pressed={group === g.id}
              className={cx('h-12 text-sm', group === g.id ? 'font-semibold text-ink-100' : 'text-ink-400')}
            >
              {g.label}
            </button>
          ))}
        </nav>
      </div>

      {sheet === 'more' && (
        <Sheet title={`${def.label} settings`} onClose={() => setSheet(null)}>
          <ToolSettings tank={{ ...tank, state: { ...state, view: 'advanced' } }} layout="column" />
        </Sheet>
      )}
      {sheet === 'menu' && (
        <Sheet title="Marbler" onClose={() => setSheet(null)}>
          <div className="flex flex-col gap-4">
            <ViewSwitch view={state.view} onChange={(view) => set({ view })} />
            <PalettePanel tank={tank} />
            <div className="grid grid-cols-2 gap-2">
              <Button>Save state</Button>
              <Button>Saved states</Button>
              <Button primary>Pull a print</Button>
              <Button>Share image</Button>
              <Button onClick={() => dispatch({ type: 'clear' })}>Clear tank</Button>
              <Button>How it works</Button>
              {state.view === 'advanced' && <Button onClick={() => setSheet('script')}><Code size={13} /> Script</Button>}
            </div>
            <Slider label="Viscosity" value={state.settings.visc} min={5} max={1000} step={1} info={INFO.viscosity} onChange={(value) => dispatch({ type: 'setting', key: 'visc', value })} />
          </div>
        </Sheet>
      )}
      {sheet === 'script' && (
        <Sheet title="Script" height="full" onClose={() => setSheet(null)}>
          <ScriptBody tank={tank} />
        </Sheet>
      )}
      {sheet === 'creature' && (
        <div className="absolute inset-x-0 bottom-0 z-40 h-[60%] overflow-hidden rounded-t-2xl border-t border-ink-600 bg-ink-900 shadow-2xl">
          <CreatureChat onClose={() => setSheet(null)} canWriteScripts={canWriteScripts} />
        </div>
      )}
    </div>
  );
}
