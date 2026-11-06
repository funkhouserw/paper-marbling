// The desktop layout: Photoshop's arrangement with a quieter look. Menus on top, the current
// tool's settings under them, a tool rail on the left, panels on the right, transport below.
// Menus, panels and the tank's right-click menu are all drawn from features.js.
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Code, FastForward, Pause, Play, Printer, Redo2, Trash2, Undo2, X } from 'lucide-react';
import { FreezeIcon, GROUPS, INFO, NEEDS, SPEEDS, iconFor, toolDef } from '../ui/controls.js';
import { ACTIONS, FIXED, MENU_ORDER } from '../ui/features.js';
import { Button, IconButton, Swatches, cx } from '../ui/widgets.jsx';
import { CreatureChat, InkDrop, ScriptBody, TankArea, ToolHint, ToolSettings } from '../ui/parts.jsx';
import { SECTION_ICONS, SectionBody, ViscositySlider, applies, sectionsFor } from '../ui/sections.jsx';
import { CommandPalette, ContextMenu, Notice, useCommands, useShortcuts } from '../ui/commands.jsx';

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

function useDismiss(open, close) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const out = (e) => { if (!ref.current?.contains(e.target)) close(); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', out);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', key); };
  }, [open, close]);
  return ref;
}

export function MenuBar({ tank, commands }) {
  const { state } = tank;
  const [open, setOpen] = useState(null);
  const ref = useDismiss(open !== null, () => setOpen(null));
  const menus = MENU_ORDER.map((m) => ({ label: m, items: ACTIONS.filter((a) => a.menu === m && commands.available(a)) }));
  return (
    <header className="flex h-10 shrink-0 items-center gap-1 border-b border-ink-700 bg-ink-900 px-2">
      <span className="mr-3 flex items-center gap-1.5 pl-1 text-sm font-semibold tracking-tight">
        <InkDrop size={18} /> Marbler
      </span>
      <nav ref={ref} aria-label="Menus" className="flex">
        {menus.map((m, i) => (
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
              <div role="menu" className="absolute left-0 top-8 z-50 min-w-56 rounded-lg border border-ink-600 bg-ink-850 py-1 shadow-2xl">
                {m.items.map((a) => (
                  <button
                    key={a.id} type="button" role="menuitem"
                    onClick={() => { setOpen(null); commands.run(a.id); }}
                    className="flex w-full items-center gap-6 px-3 py-1.5 text-left text-xs text-ink-100 hover:bg-ink-700"
                  >
                    {a.menuLabel ?? a.label}
                    {a.shortcut && <span className="ml-auto font-mono text-ink-400">{a.shortcut}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <span className="mx-2 h-5 w-px bg-ink-700" />
      <IconButton size="sm" label="Undo (⌘Z)" onClick={() => commands.run('undo')} disabled={state.historyAt === 0}><Undo2 size={15} /></IconButton>
      <IconButton size="sm" label="Redo (⇧⌘Z)" onClick={() => commands.run('redo')} disabled={state.historyAt === state.history.length}><Redo2 size={15} /></IconButton>
      <span className="flex-1" />
      <button
        type="button" onClick={() => commands.run('commandPalette')}
        className="mr-2 flex h-7 items-center gap-6 rounded-md border border-ink-700 px-2 text-xs text-ink-400 hover:text-ink-100"
      >
        Find a command <span className="font-mono">⌘K</span>
      </button>
      {state.view === 'advanced' && (
        <Button onClick={() => commands.run('toggleScript')} className={state.drawer ? 'border-gilt' : ''}>
          <Code size={13} /> Script
        </Button>
      )}
      <ViewSwitch view={state.view} onChange={(view) => commands.run(view === 'simple' ? 'viewSimple' : 'viewAdvanced')} />
    </header>
  );
}

export function OptionsBar({ tank }) {
  const { state, palette, dispatch } = tank;
  const def = toolDef(state.tool);
  const Icon = iconFor(state.tool);
  return (
    <div className="flex min-h-14 shrink-0 items-start gap-5 border-b border-ink-700 bg-ink-900/70 px-4 py-2">
      <span className="flex shrink-0 items-center gap-2 pt-1.5 text-sm font-medium">
        <Icon size={16} className="text-gilt" /> {def.label}
      </span>
      {def.color && (
        <div className="pt-1"><Swatches palette={palette} ink={state.ink} onPick={(ink) => dispatch({ type: 'set', patch: { ink } })} /></div>
      )}
      <div className="min-w-0 flex-1"><ToolSettings tank={tank} /></div>
    </div>
  );
}

// Tools by group. Tools the simulator can't use are hidden. Freeze sits under Lift as a mode,
// since it works alongside whichever tool is chosen.
export function ToolRail({ tank, local }) {
  const { state, dispatch } = tank;
  const usable = (t) => !NEEDS[t] || applies({ when: NEEDS[t] }, state, local);
  const freezing = state.freezeMode !== 'off';
  return (
    <nav aria-label="Tools" className="scroll-thin flex w-14 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-ink-700 bg-ink-900 py-2">
      {GROUPS.map((g, gi) => (
        <div key={g.id} className={cx('flex flex-col items-center gap-0.5', gi > 0 && 'mt-1 border-t border-ink-700 pt-1.5')}>
          <span className="mb-0.5 text-[10px] uppercase tracking-wider text-ink-400">{g.label}</span>
          {g.tools.filter(usable).map((t) => {
            const Icon = iconFor(t);
            return (
              <IconButton key={t} size="rail" label={toolDef(t).label} active={state.tool === t} onClick={() => dispatch({ type: 'tool', tool: t })}>
                <Icon size={17} />
              </IconButton>
            );
          })}
          {g.id === 'lift' && applies({ when: 'freeze' }, state, local) && (
            <IconButton
              size="rail" label={freezing ? 'Stop freezing' : 'Freeze ink'} active={freezing}
              onClick={() => dispatch({ type: 'set', patch: { freezeMode: freezing ? 'off' : 'freeze' } })}
              className={freezing ? 'text-sky-200' : ''}
            >
              <FreezeIcon size={17} />
            </IconButton>
          )}
        </div>
      ))}
    </nav>
  );
}

// The right-hand panels: every section features.js places there, each one collapsible.
export function Panels({ tank, commands, local }) {
  const { state } = tank;
  const [shut, setShut] = useState(() => new Set(['detail', 'export']));
  const toggle = (id) => setShut((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <aside aria-label="Panels" className="scroll-thin w-72 shrink-0 overflow-y-auto border-l border-ink-700 bg-ink-900">
      {sectionsFor('panel', 'desktop', state, local).map((section) => {
        const Icon = SECTION_ICONS[section.icon];
        const open = !shut.has(section.id);
        return (
          <section key={section.id} className="border-b border-ink-700">
            <h2>
              <button
                type="button" aria-expanded={open} onClick={() => toggle(section.id)}
                className="flex w-full items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400 hover:text-ink-100"
              >
                <ChevronRight size={12} className={cx('transition-transform', open && 'rotate-90')} />
                {Icon && <Icon size={12} />}{section.label}
              </button>
            </h2>
            {open && <div className="px-3 pb-3"><SectionBody section={section} tank={tank} run={commands.run} local={local} /></div>}
          </section>
        );
      })}
    </aside>
  );
}

const visc = FIXED.find((c) => c.id === 'visc');

export function TransportBar({ tank, commands }) {
  const { state, dispatch } = tank;
  const s = state.settings;
  return (
    <footer className="flex h-12 shrink-0 items-center gap-2 border-t border-ink-700 bg-ink-900 px-3">
      <IconButton label={state.playing ? 'Pause (Space)' : 'Play (Space)'} onClick={() => commands.run('play')}>
        {state.playing ? <Pause size={18} /> : <Play size={18} />}
      </IconButton>
      <IconButton label="Finish now" onClick={() => commands.run('finish')}><FastForward size={18} /></IconButton>
      <div role="radiogroup" aria-label="Speed" className="flex rounded-md bg-ink-800 p-0.5 text-xs">
        {SPEEDS.map((v) => (
          <button
            key={v} type="button" role="radio" aria-checked={s.speed === v} onClick={() => dispatch({ type: 'setting', key: 'speed', value: v })}
            className={cx('rounded px-2 py-0.5 font-mono', s.speed === v ? 'bg-ink-600 text-ink-100' : 'text-ink-400 hover:text-ink-100')}
          >
            {v}×
          </button>
        ))}
      </div>
      <span className="mx-1 h-6 w-px bg-ink-700" />
      <IconButton label="Undo (⌘Z)" onClick={() => commands.run('undo')} disabled={state.historyAt === 0}><Undo2 size={17} /></IconButton>
      <IconButton label="Redo (⇧⌘Z)" onClick={() => commands.run('redo')} disabled={state.historyAt === state.history.length}><Redo2 size={17} /></IconButton>
      <IconButton label="Clear tank" onClick={() => commands.run('clear')}><Trash2 size={17} /></IconButton>
      <span className="mx-1 h-6 w-px bg-ink-700" />
      <ViscositySlider c={visc} value={s.visc} info={INFO.viscosity} onChange={(value) => dispatch({ type: 'setting', key: 'visc', value })} />
      <span className="flex-1" />
      <ToolHint tool={state.tool} />
      <span className="shrink-0 pl-3 font-mono text-xs tabular-nums text-ink-400">
        t {state.time.toFixed(1)} s · {state.shapes} shapes
      </span>
      <Button primary className="ml-2" onClick={() => commands.run('pull')}><Printer size={13} /> Pull</Button>
    </footer>
  );
}

// Slides in from the right, resizable by its left edge. The tank shrinks to sit beside it.
export function ScriptDrawer({ tank, commands }) {
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
        <span className="text-xs text-ink-400">⌘↵ runs it</span>
        <span className="flex-1" />
        <IconButton size="sm" label="Close script" onClick={() => commands.run('toggleScript')}><X size={14} /></IconButton>
      </div>
      <ScriptBody tank={tank} onRun={() => commands.run('runScript')} onCapture={() => commands.run('copySession')} />
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

// What every layout needs on top: shortcuts, the right-click menu, ⌘K and notices.
export function useOverlays(tank, local) {
  const commands = useCommands(tank, local);
  useShortcuts(tank, commands);
  const [menu, setMenu] = useState(null);
  const overlays = (
    <>
      {menu && <ContextMenu at={menu} commands={commands} onClose={() => setMenu(null)} />}
      {tank.state.commandOpen && <CommandPalette tank={tank} commands={commands} onClose={() => tank.dispatch({ type: 'set', patch: { commandOpen: false } })} />}
      <Notice tank={tank} />
    </>
  );
  return { commands, openMenu: setMenu, overlays };
}

export function Desktop({ tank, local = true }) {
  const { state } = tank;
  const { commands, openMenu, overlays } = useOverlays(tank, local);
  return (
    <div className="flex h-full min-h-[600px] flex-col overflow-hidden bg-ink-950">
      <MenuBar tank={tank} commands={commands} />
      <OptionsBar tank={tank} />
      <div className="flex min-h-0 flex-1">
        <ToolRail tank={tank} local={local} />
        <main className="relative flex min-w-0 flex-1 p-6">
          <TankArea tank={tank} className="flex-1" onMenu={openMenu} />
          <Creature tank={tank} canWriteScripts={local} />
        </main>
        {state.drawer && state.view === 'advanced' ? <ScriptDrawer tank={tank} commands={commands} /> : <Panels tank={tank} commands={commands} local={local} />}
      </div>
      <TransportBar tank={tank} commands={commands} />
      {overlays}
    </div>
  );
}
