// The phone layout, after Lightroom and CapCut: the tank on top, a thumb strip at the bottom,
// and settings that rise from the strip. The ☰ sheet holds the same sections as the desktop
// panels, from features.js, as tabs. A long press on the tank opens its menu.
import { useState } from 'react';
import { Code, Menu, Pause, Play, Redo2, Search, Undo2, X } from 'lucide-react';
import { FreezeIcon, GROUPS, INFO, NEEDS, groupOf, iconFor, shownChoices, shownParams, toolDef } from '../ui/controls.js';
import { FIXED } from '../ui/features.js';
import { Button, Choice, IconButton, Swatches, cx } from '../ui/widgets.jsx';
import { CreatureChat, InkDrop, ParamSlider, ScriptBody, Tank, ToolSettings } from '../ui/parts.jsx';
import { SECTION_ICONS, SectionBody, ViscositySlider, applies, sectionsFor } from '../ui/sections.jsx';
import { ViewSwitch, useOverlays } from '../desktop/Desktop.jsx';

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

const visc = FIXED.find((c) => c.id === 'visc');

// The ☰ sheet: view, viscosity, then each section as a tab.
function MenuSheet({ tank, commands, local, onClose, onScript }) {
  const { state, dispatch } = tank;
  const sections = sectionsFor('menu', 'phone', state, local);
  const [tab, setTab] = useState(sections[0]?.id);
  const section = sections.find((s) => s.id === tab) ?? sections[0];
  return (
    <Sheet title="Marbler" height="full" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ViewSwitch view={state.view} onChange={(v) => commands.run(v === 'simple' ? 'viewSimple' : 'viewAdvanced')} />
          <span className="flex-1" />
          <IconButton label="Find a command" onClick={() => { onClose(); commands.run('commandPalette'); }}><Search size={18} /></IconButton>
          {state.view === 'advanced' && <Button onClick={onScript}><Code size={13} /> Script</Button>}
        </div>
        <ViscositySlider c={visc} value={state.settings.visc} info={INFO.viscosity} className="w-full" onChange={(value) => dispatch({ type: 'setting', key: 'visc', value })} />
        <div role="tablist" aria-label="Sections" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4">
          {sections.map((s) => {
            const Icon = SECTION_ICONS[s.icon];
            return (
              <button
                key={s.id} type="button" role="tab" aria-selected={section?.id === s.id} onClick={() => setTab(s.id)}
                className={cx('flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs', section?.id === s.id ? 'bg-ink-700 text-ink-100' : 'text-ink-400')}
              >
                {Icon && <Icon size={12} />}{s.label}
              </button>
            );
          })}
        </div>
        {section && <SectionBody section={section} tank={tank} run={commands.run} local={local} />}
      </div>
    </Sheet>
  );
}

export function Phone({ tank, local = false, landscape = false }) {
  const { state, dispatch, palette, applyTool } = tank;
  const { commands, openMenu, overlays } = useOverlays(tank, local);
  const [group, setGroup] = useState(groupOf(state.tool).id);
  const [sheet, setSheet] = useState(null); // 'menu' | 'more' | 'script' | 'creature'
  const def = toolDef(state.tool);
  const params = shownParams(state.tool, 'simple');
  const choices = shownChoices(state.tool, 'simple').filter((c) => c.key !== 'waveShape');
  const values = state.values[state.tool] ?? {};
  const set = (patch) => dispatch({ type: 'set', patch });
  const Icon = iconFor(state.tool);
  const usable = (t) => !NEEDS[t] || applies({ when: NEEDS[t] }, state, local);
  const freezing = state.freezeMode !== 'off';

  return (
    <div className={cx('relative flex h-full flex-col overflow-hidden bg-ink-950 text-ink-100', landscape && 'flex-row')}>
      {/* Top bar */}
      <header className={cx('flex shrink-0 items-center gap-1 px-2', landscape ? 'w-12 flex-col py-2' : 'h-12')}>
        <IconButton size="lg" label="Menu" onClick={() => setSheet('menu')}><Menu size={20} /></IconButton>
        <span className="flex-1" />
        <IconButton size="lg" label="Undo" onClick={() => commands.run('undo')} disabled={state.historyAt === 0}><Undo2 size={20} /></IconButton>
        <IconButton size="lg" label="Redo" onClick={() => commands.run('redo')} disabled={state.historyAt === state.history.length}><Redo2 size={20} /></IconButton>
        <span className="flex-1" />
        <IconButton size="lg" label={state.playing ? 'Pause' : 'Play'} onClick={() => commands.run('play')}>
          {state.playing ? <Pause size={20} /> : <Play size={20} />}
        </IconButton>
      </header>

      {/* Tank */}
      <main className="relative flex min-h-0 flex-1 items-center justify-center p-2">
        <Tank state={state} palette={palette} className="size-full" onUse={applyTool} onMenu={openMenu} />
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
          <div className="no-scrollbar flex items-center gap-3 overflow-x-auto px-4 pt-3">
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
            <ParamSlider
              key={p.key} tool={state.tool} p={p} value={values[p.key]}
              className="w-[calc(50%-10px)] shrink-0 snap-start"
              onChange={(value) => dispatch({ type: 'value', tool: state.tool, key: p.key, value })}
            />
          ))}
          {choices.map((c) => (
            <div key={c.key} className="w-[calc(50%-10px)] shrink-0 snap-start">
              <Choice label={c.label} value={values[c.key]} options={c.options} info={INFO[`${state.tool}.${c.key}`]} onChange={(value) => dispatch({ type: 'value', tool: state.tool, key: c.key, value })} />
            </div>
          ))}
          {def.whole && <Button primary className="h-11 shrink-0 snap-start self-center px-5" onClick={applyTool}>{def.label}</Button>}
        </div>
        {/* Tools in the chosen group */}
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-2">
          {GROUPS.find((g) => g.id === group).tools.filter(usable).map((t) => {
            const TIcon = iconFor(t);
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
          {group === 'lift' && applies({ when: 'freeze' }, state, local) && (
            <button
              type="button" aria-pressed={freezing} onClick={() => set({ freezeMode: freezing ? 'off' : 'freeze' })}
              className={cx('flex min-w-16 shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px]', freezing ? 'bg-ink-700 text-sky-200' : 'text-ink-300')}
            >
              <FreezeIcon size={20} />Freeze
            </button>
          )}
        </div>
        {/* Groups */}
        <nav aria-label="Tool groups" className="grid border-t border-ink-700 pb-[env(safe-area-inset-bottom)]" style={{ gridTemplateColumns: `repeat(${GROUPS.length}, 1fr)` }}>
          {GROUPS.map((g) => (
            <button
              key={g.id} type="button" onClick={() => { setGroup(g.id); dispatch({ type: 'tool', tool: g.tools.find(usable) ?? g.tools[0] }); }}
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
      {sheet === 'menu' && <MenuSheet tank={tank} commands={commands} local={local} onClose={() => setSheet(null)} onScript={() => setSheet('script')} />}
      {sheet === 'script' && (
        <Sheet title="Script" height="full" onClose={() => setSheet(null)}>
          <ScriptBody tank={tank} onRun={() => commands.run('runScript')} onCapture={() => commands.run('copySession')} />
        </Sheet>
      )}
      {sheet === 'creature' && (
        <div className="absolute inset-x-0 bottom-0 z-40 h-[60%] overflow-hidden rounded-t-2xl border-t border-ink-600 bg-ink-900 shadow-2xl">
          <CreatureChat onClose={() => setSheet(null)} canWriteScripts={local} />
        </div>
      )}
      {overlays}
    </div>
  );
}
