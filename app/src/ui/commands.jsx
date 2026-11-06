// Every action in features.js runs through here, whether it came from a menu, a button, a key, the
// right-click menu or the command palette. A new action needs its entry in features.js and a line in
// `perform`; the menus, palette, shortcuts and context menu pick it up by themselves.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { ACTIONS } from './features.js';
import { applies, visible } from './sections.jsx';
import { TOOLS } from './controls.js';
import { cx } from './widgets.jsx';

// What each action does to the mock tank. Connected, these call TankController and pageactions.js.
function perform(id, tank, ctx) {
  if (tank.perform?.(id, ctx)) return undefined; // the real tank handles it
  const { state, dispatch, act } = tank;
  const set = (patch) => dispatch({ type: 'set', patch });
  const say = (text) => dispatch({ type: 'notice', text });
  switch (id) {
    case 'undo': return dispatch({ type: 'undo' });
    case 'redo': return dispatch({ type: 'redo' });
    case 'clear': return dispatch({ type: 'clear' });
    case 'play': return set({ playing: !state.playing });
    case 'finish': return say('Skipping ahead until everything stops moving.');
    case 'savePalette': return say('Palettes are saved once pageactions.js is connected.');
    case 'deletePalette': return say('Palettes are deleted once pageactions.js is connected.');
    case 'copySession': return set({ script: '// Your session so far\nviscosity({ value: 1000 });\n', example: '', drawer: true, view: 'advanced' });
    case 'freezeHere': return act(ctx?.point ? `Freeze ink at ${ctx.point.map(Math.round).join(', ')}` : 'Freeze ink');
    case 'unfreezeHere': return act('Unfreeze ink');
    case 'unfreezeAll': return act('Unfreeze all');
    case 'seeRepeat': return say('Showing four copies of the tank.');
    case 'saveState': return say('Saved the tank.');
    case 'pull': return act('Pull a print');
    case 'exportPng': return say('Downloading marbler.png');
    case 'exportSvg': return say('Downloading marbler.svg');
    case 'exportPrint': return say('Printing at high resolution…');
    case 'runScript': return dispatch({ type: 'run' });
    case 'viewSimple': return set({ view: 'simple', drawer: false });
    case 'viewAdvanced': return set({ view: 'advanced' });
    case 'toggleScript': return set({ view: 'advanced', drawer: !state.drawer });
    case 'commandPalette': return set({ commandOpen: true });
    case 'askDrop': return set({ creature: true });
    case 'howItWorks': return window.open('../how-it-works.html', '_blank');
    default: throw new Error(`No handler for action ${id}`);
  }
}

export function useCommands(tank, local) {
  const run = useCallback((id, ctx) => perform(id, tank, ctx), [tank]);
  const available = useCallback((a) => visible(a, tank.state, local) && applies(a, tank.state, local), [tank.state, local]);
  return { run, available };
}

// "⌘Z" style shortcuts to a test on a keydown.
function matches(shortcut, e) {
  const parts = shortcut.split('');
  const shift = parts.includes('⇧');
  const meta = parts.includes('⌘');
  const key = shortcut.replace(/[⇧⌘]/g, '');
  if (meta !== (e.metaKey || e.ctrlKey) || shift !== e.shiftKey) return false;
  if (key === 'Space') return e.code === 'Space';
  if (key === '↵') return e.key === 'Enter';
  return e.key.toLowerCase() === key.toLowerCase();
}

// Keys for every action with a shortcut, plus 1 to 9 for the palette's inks on colour tools.
// Typing in a text box keeps its keys, except ⌘↵ (run) and ⌘K (find).
export function useShortcuts(tank, { run, available }) {
  const latest = useRef({ tank, run, available });
  latest.current = { tank, run, available };
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return; // the script editor already handled it, as with ⌘↵
      const { tank: t, run: r, available: ok } = latest.current;
      const typing = e.target.closest?.('textarea, input:not([type=range]):not([type=checkbox]), select, [contenteditable=true], .cm-editor');
      if (!typing && /^[1-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && TOOLS[t.state.tool]?.color) {
        const i = Number(e.key) - 1;
        if (i < t.palette.inks.length) t.dispatch({ type: 'set', patch: { ink: i } });
        return;
      }
      for (const a of ACTIONS) {
        if (!a.shortcut || !matches(a.shortcut, e) || !ok(a)) continue;
        if (typing && !['runScript', 'commandPalette'].includes(a.id)) return;
        if (e.repeat) return;
        e.preventDefault(); // ⌘S and ⌘P would otherwise open the browser's own dialogs
        r(a.id);
        return;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

// Right-click (or long-press on a phone) on the tank.
export function ContextMenu({ at, onClose, commands }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    ref.current?.querySelector('button')?.focus();
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
  }, [onClose]);
  const items = ACTIONS.filter((a) => a.context && commands.available(a));
  return (
    <div
      ref={ref} role="menu" aria-label="Tank actions"
      className="fixed z-50 min-w-52 rounded-lg border border-ink-600 bg-ink-850 py-1 shadow-2xl"
      style={{ left: at.x, top: at.y }}
    >
      {items.map((a) => (
        <button
          key={a.id} type="button" role="menuitem"
          onClick={() => { commands.run(a.id, { point: at.point }); onClose(); }}
          className="flex w-full items-center gap-6 px-3 py-1.5 text-left text-xs text-ink-100 hover:bg-ink-700 focus:bg-ink-700 focus:outline-none"
        >
          {a.menuLabel ?? a.label}
          {a.shortcut && <span className="ml-auto font-mono text-ink-400">{a.shortcut}</span>}
        </button>
      ))}
    </div>
  );
}

// ⌘K: every command and tool by name.
export function CommandPalette({ tank, commands, onClose }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const items = [
    ...ACTIONS.filter((a) => commands.available(a) && a.id !== 'commandPalette')
      .map((a) => ({ key: a.id, label: a.menuLabel ?? a.label, hint: a.menu, shortcut: a.shortcut, go: () => commands.run(a.id) })),
    ...Object.entries(TOOLS).map(([id, t]) => ({ key: `tool:${id}`, label: t.label, hint: 'Tool', go: () => tank.dispatch({ type: 'tool', tool: id }) })),
  ].filter((it) => it.label.toLowerCase().includes(q.toLowerCase()));
  const pick = (it) => { onClose(); it?.go(); };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Find a command" className="w-[28rem] max-w-[92vw] overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-ink-700 px-3">
          <Search size={14} className="text-ink-400" />
          <input
            autoFocus value={q} placeholder="Find a command or tool…" aria-label="Find a command or tool"
            onChange={(e) => { setQ(e.target.value); setI(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((n) => Math.min(items.length - 1, n + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
              if (e.key === 'Enter') pick(items[i]);
            }}
            className="h-11 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <ul className="scroll-thin max-h-80 overflow-y-auto py-1">
          {items.map((it, n) => (
            <li key={it.key}>
              <button
                type="button" onClick={() => pick(it)} onPointerEnter={() => setI(n)}
                className={cx('flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm', n === i ? 'bg-ink-700' : '')}
              >
                {it.label}<span className="text-xs text-ink-400">{it.hint}</span>
                {it.shortcut && <span className="ml-auto font-mono text-xs text-ink-400">{it.shortcut}</span>}
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="px-3 py-2 text-sm text-ink-400">Nothing matches.</li>}
        </ul>
      </div>
    </div>
  );
}

// One place for messages, from saving, scripts, the assistant or the tank. Clears itself.
export function Notice({ tank }) {
  const { notice } = tank.state;
  const { dispatch } = tank;
  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => dispatch({ type: 'notice', text: null }), 3500);
    return () => clearTimeout(id);
  }, [notice, dispatch]);
  if (!notice) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center">
      <span className="rounded-full border border-ink-600 bg-ink-850 px-4 py-1.5 text-xs text-ink-100 shadow-xl">{notice}</span>
    </div>
  );
}
