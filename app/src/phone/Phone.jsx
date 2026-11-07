// The phone layout, after Lightroom and CapCut: the tank on top, a thumb strip at the bottom,
// and settings that rise from the strip. The ☰ sheet holds the same sections as the desktop
// panels, from features.js, as tabs. A long press on the tank opens its menu.
import { useEffect, useRef, useState } from 'react';
import { Bookmark, Code, FastForward, Menu, Pause, Play, Printer, Redo2, Search, Trash2, Undo2, X } from 'lucide-react';
import { FreezeIcon, GROUPS, INFO, NEEDS, groupOf, iconFor, shownChoices, shownParams, toolDef } from '../ui/controls.js';
import { FIXED } from '../ui/features.js';
import { Button, Choice, IconButton, Swatches, cx } from '../ui/widgets.jsx';
import { CreatureChat, InkDrop, ParamSlider, ScriptBody, TankArea, ToolSettings } from '../ui/parts.jsx';
import { SECTION_ICONS, SectionBody, ViscositySlider, applies, sectionsFor } from '../ui/sections.jsx';
import { ViewSwitch, useOverlays } from '../desktop/Desktop.jsx';

// A bottom sheet. Drag its top edge up to open it fully, down to shrink it or put it away; a tap
// on the handle toggles its height, and a tap outside closes it. The X stays for anyone who wants it.
// A bottom sheet. It slides up when it opens and down when it closes, so it's clear where it lives.
// While a finger drags it up from below (peek, in px), it follows the finger. Drag its top edge up
// to open it fully, down to shrink it or put it away; a tap on the handle toggles its height, and a
// tap outside closes it.
const SLIDE_MS = 220;
function Sheet({ title, onClose, height = 'half', peek = null, children }) {
  const [tall, setTall] = useState(height === 'full');
  const [drag, setDrag] = useState(0);
  const [entered, setEntered] = useState(peek !== null);
  const [leaving, setLeaving] = useState(false);
  const start = useRef(null);
  useEffect(() => {
    if (entered) return undefined;
    const f = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => cancelAnimationFrame(f);
  }, [entered]);
  const close = () => { setLeaving(true); setTimeout(onClose, SLIDE_MS); };
  const down = (e) => {
    if (e.target.closest('button:not([data-handle])')) return;
    start.current = { y: e.clientY, moved: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    if (!start.current) return;
    const dy = e.clientY - start.current.y;
    start.current.moved = Math.max(start.current.moved, Math.abs(dy));
    setDrag(dy);
  };
  const up = () => {
    if (!start.current) return;
    const { moved } = start.current;
    start.current = null;
    const dy = drag;
    setDrag(0);
    if (moved < 6) setTall((t) => !t);
    else if (dy > 80) { if (tall && height !== 'full') setTall(false); else close(); }
    else if (dy < -50) setTall(true);
  };
  const following = peek !== null || drag !== 0;
  const transform = peek !== null ? `translateY(max(0px, calc(100% - ${peek}px)))`
    : !entered || leaving ? 'translateY(100%)'
      : drag ? `translateY(${drag > 0 ? drag : drag / 3}px)` : undefined;
  return (
    <>
      <div
        className="absolute inset-0 z-30 bg-black/30" onClick={close} aria-hidden="true"
        style={{ opacity: entered && !leaving ? 1 : 0, transition: `opacity ${SLIDE_MS}ms` }}
      />
      <div
        role="dialog" aria-label={title}
        style={{ transform, transition: following ? 'none' : `transform ${SLIDE_MS}ms ease-out, top 0.2s, height 0.2s` }}
        className={cx(
          'absolute inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl border-t border-ink-600 bg-ink-900 shadow-2xl',
          tall ? 'top-10' : 'h-[55%]',
        )}
      >
        <div className="touch-none select-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <button type="button" data-handle aria-label={tall ? 'Make smaller' : 'Make taller'} className="mx-auto mt-1 block px-6 py-1.5">
            <span className="block h-1 w-10 rounded-full bg-ink-600" />
          </button>
          <div className="flex items-center px-4 pb-2">
            <h2 className="text-sm font-medium">{title}</h2>
            <span className="flex-1" />
            <IconButton size="sm" label="Close" onClick={close}><X size={16} /></IconButton>
          </div>
        </div>
        <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </>
  );
}

// A handle that pulls a sheet up: tap it, or drag up and the sheet follows the finger. The drag
// itself is dragOpen in Phone, which also goes on larger areas that keep their own taps.
function Handle({ label, onOpen, drag, tone = 'menu' }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onOpen} {...drag} className="flex w-full touch-none justify-center py-1.5">
      <span className={cx('block h-1 rounded-full', tone === 'tool' ? 'w-8 bg-gilt/60' : 'w-12 bg-ink-400')} />
    </button>
  );
}

const visc = FIXED.find((c) => c.id === 'visc');

// The ☰ sheet: view, viscosity, then each section as a tab.
function MenuSheet({ tank, commands, local, onClose, onScript, peek }) {
  const { state, dispatch } = tank;
  const sections = sectionsFor('menu', 'phone', state, local);
  const [tab, setTab] = useState(sections[0]?.id);
  const section = sections.find((s) => s.id === tab) ?? sections[0];
  return (
    <Sheet title="Marbler" height="full" peek={peek} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ViewSwitch view={state.view} onChange={(v) => commands.run(v === 'simple' ? 'viewSimple' : 'viewAdvanced')} />
          <span className="flex-1" />
          <IconButton label="Find a command" onClick={() => { onClose(); commands.run('commandPalette'); }}><Search size={18} /></IconButton>
          {state.view === 'advanced' && <Button onClick={onScript}><Code size={13} /> Script</Button>}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[['clear', 'Clear the tank', Trash2], ['pull', 'Pull a print', Printer], ['saveState', 'Save state', Bookmark], ['finish', 'Finish now', FastForward]].map(([id, label, Icon]) => (
            <Button key={id} className="h-10 justify-start" onClick={() => { commands.run(id); if (id === 'clear' || id === 'pull') onClose(); }}><Icon size={14} /> {label}</Button>
          ))}
        </div>
        <ViscositySlider c={visc} value={state.settings.visc} info={INFO.viscosity} className="w-full" onChange={(value) => dispatch({ type: 'setting', key: 'visc', value })} />
        <div role="tablist" aria-label="Sections" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4">
          {sections.map((s) => {
            const Icon = SECTION_ICONS[s.icon];
            return (
              <button
                key={s.id} type="button" role="tab" aria-selected={section?.id === s.id}
                onClick={(e) => { setTab(s.id); e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' }); }}
                className={cx('flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs', section?.id === s.id ? 'bg-ink-700 text-ink-100' : 'text-ink-400')}
              >
                {Icon && <Icon size={12} />}{s.label}
              </button>
            );
          })}
        </div>
        {section && <SectionBody section={section} tank={tank} run={commands.run} local={local} />}
        <button type="button" onClick={() => commands.run('resetAll')} className="mt-4 self-start text-xs text-red-300/80 underline-offset-2 hover:underline">
          Clear everything…
        </button>
      </div>
    </Sheet>
  );
}

export function Phone({ tank, local = false, landscape = false }) {
  const { state, dispatch, palette, applyTool } = tank;
  const { commands, openMenu, overlays } = useOverlays(tank, local);
  const [group, setGroup] = useState(groupOf(state.tool).id);
  const [sheet, setSheet] = useState(null); // 'menu' | 'more' | 'script' | 'creature'
  // While a finger drags a sheet up from below: how far, in px. The sheet follows it, then opens
  // fully past a short distance or drops back.
  const [peek, setPeek] = useState(null);
  const dragged = useRef(0);
  const dragOpen = (name) => ({
    onPointerDown: (e) => {
      const from = e.clientY;
      let opened = false;
      let last = 0;
      const move = (m) => {
        const px = from - m.clientY;
        last = px;
        if (!opened && px > 10) { opened = true; setSheet(name); }
        if (opened) setPeek(Math.max(0, px));
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (!opened) return;
        dragged.current = performance.now();
        setPeek(null);
        // By the last move seen: a cancelled touch has no useful position of its own.
        if (last < 60) setSheet(null);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
  });
  // The tool strip grows in place to show all of the tool's settings: drag its handle up (it follows
  // the finger) or tap it, and drag or tap again to fold it back. expand is the extra height in px.
  const [expand, setExpand] = useState(0);
  const [stretching, setStretching] = useState(false);
  const openHeight = () => Math.round(window.innerHeight * 0.5);
  const stripDrag = {
    onPointerDown: (e) => {
      const from = e.clientY;
      const base = expand;
      let last = base;
      let moved = false;
      const move = (m) => {
        const h = Math.max(0, Math.min(openHeight() + 60, base + (from - m.clientY)));
        if (Math.abs(h - base) > 6) moved = true;
        if (!moved) return;
        last = h;
        setStretching(true);
        setExpand(h);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        setStretching(false);
        if (!moved) return;
        dragged.current = performance.now();
        setExpand(base ? (last < openHeight() - 60 ? 0 : openHeight()) : (last > 60 ? openHeight() : 0));
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
  };
  const toggleStrip = () => { if (performance.now() - dragged.current > 300) setExpand((h) => (h ? 0 : openHeight())); };
  // A tap opens it too, but not the click that ends a drag.
  const tapOpen = (name) => () => { if (performance.now() - dragged.current > 300) setSheet(name); };
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
        <IconButton size="lg" label="Clear the tank" onClick={() => commands.run('clear')}><Trash2 size={20} /></IconButton>
        <IconButton size="lg" label={state.playing ? 'Pause' : 'Play'} onClick={() => commands.run('play')}>
          {state.playing ? <Pause size={20} /> : <Play size={20} />}
        </IconButton>
      </header>

      {/* Tank */}
      <main className="relative flex min-h-0 flex-1 items-center justify-center p-2">
        <TankArea tank={tank} className="size-full" onMenu={openMenu} />
        <button
          type="button" aria-label={state.stats?.moving || (state.stats?.held ?? 0) > 0 ? 'Ask Carra Jean. Ink is still moving' : 'Ask Carra Jean'} onClick={() => setSheet('creature')}
          className="absolute bottom-3 right-3 rounded-full p-1 focus-visible:outline-2 focus-visible:outline-gilt"
        >
          <InkDrop size={36} waiting={Boolean(state.stats?.moving) || (state.stats?.held ?? 0) > 0} />
        </button>
      </main>

      {/* Thumb strip */}
      <div className={cx('shrink-0 border-ink-700 bg-ink-900', landscape ? 'flex w-72 flex-col border-l' : 'border-t')}>
        {!landscape && <Handle tone="tool" label={expand ? `Fewer ${def.label} settings` : `All ${def.label} settings`} onOpen={toggleStrip} drag={stripDrag} />}
        {def.color && (
          <div className="no-scrollbar flex items-center gap-3 overflow-x-auto px-4 pt-3">
            <Swatches palette={palette} ink={state.ink} size="lg" onPick={(ink) => set({ ink })} />
          </div>
        )}
        <div className="flex items-center gap-2 px-4 pt-3 text-sm">
          <Icon size={16} className="text-gilt" />
          <span className="font-medium">{def.label}</span>
          {def.whole && <Button primary className="ml-1 h-8" onClick={applyTool}><Play size={12} /> {def.label}</Button>}
          <span className="flex-1" />
          <button type="button" onClick={landscape ? () => setSheet('more') : toggleStrip} className="text-xs text-gilt-soft underline-offset-2 hover:underline">
            {expand && !landscape ? 'Fewer settings' : 'All settings'}
          </button>
        </div>
        {/* All the tool's settings, when the strip has been pulled up */}
        {!landscape && expand > 0 && (
          <div
            className="scroll-thin overflow-y-auto px-4 py-3"
            style={{ height: expand, transition: stretching ? 'none' : 'height 0.22s ease-out' }}
          >
            <ToolSettings tank={{ ...tank, state: { ...state, view: 'advanced' } }} layout="column" />
          </div>
        )}
        {/* Settings: swipe sideways for more */}
        <div className={cx('no-scrollbar flex gap-5 px-4 py-3', !landscape && expand > 0 && 'hidden', landscape ? 'flex-col gap-3 overflow-y-auto' : 'snap-x snap-mandatory scroll-px-4 overflow-x-auto')}>
          {params.map((p) => (
            <ParamSlider
              key={p.key} tool={state.tool} p={p} value={values[p.key]}
              className={landscape ? 'w-full' : 'w-[calc(50%-10px)] shrink-0 snap-start'}
              onChange={(value) => dispatch({ type: 'value', tool: state.tool, key: p.key, value })}
            />
          ))}
          {choices.map((c) => (
            <div key={c.key} className={landscape ? 'w-full' : 'w-[calc(50%-10px)] shrink-0 snap-start'}>
              <Choice label={c.label} value={values[c.key]} options={c.options} info={INFO[`${state.tool}.${c.key}`]} onChange={(value) => dispatch({ type: 'value', tool: state.tool, key: c.key, value })} />
            </div>
          ))}
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
        <nav aria-label="Tool groups" {...dragOpen('menu')} className="grid touch-none border-t border-ink-700" style={{ gridTemplateColumns: `repeat(${GROUPS.length}, 1fr)` }}>
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
        {!landscape && <div className="pb-[env(safe-area-inset-bottom)]"><Handle label="Open the menu" onOpen={tapOpen('menu')} drag={dragOpen('menu')} /></div>}
      </div>

      {sheet === 'more' && (
        <Sheet title={`${def.label} settings`} peek={peek} onClose={() => setSheet(null)}>
          <ToolSettings tank={{ ...tank, state: { ...state, view: 'advanced' } }} layout="column" />
        </Sheet>
      )}
      {sheet === 'menu' && <MenuSheet tank={tank} commands={commands} local={local} peek={peek} onClose={() => setSheet(null)} onScript={() => setSheet('script')} />}
      {sheet === 'script' && (
        <Sheet title="Script" height="full" onClose={() => setSheet(null)}>
          <ScriptBody tank={tank} onRun={() => commands.run('runScript')} onCapture={() => commands.run('copySession')} />
        </Sheet>
      )}
      {sheet === 'creature' && (
        <div className="absolute inset-x-0 bottom-0 z-40 h-[60%] overflow-hidden rounded-t-2xl border-t border-ink-600 bg-ink-900 shadow-2xl">
          <CreatureChat onClose={() => setSheet(null)} tank={tank} local={local} />
        </div>
      )}
      {overlays}
    </div>
  );
}
