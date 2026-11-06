// Pieces both layouts share: the tank, a tool's settings, the script editor and the creature.
import { useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Play, Send, Snowflake, X } from 'lucide-react';
import { dialToValue, valueToDial } from '../../../api.js';
import tankImage from '../../../docs/images/teal-copper-swirls.jpg';
import { EXAMPLES, FONTS, INFO, WEAVE_ICONS, shownChoices, shownParams, toolDef } from './controls.js';
import { Button, Choice, IconButton, InfoTip, Slider, Swatches, Toggle, cx } from './widgets.jsx';

// The tank. In the mockup it's a finished print; connected, tankview.js mounts its canvases here.
// Right-click, or a long press on a touch screen, opens the tank's menu at that point.
export function Tank({ state, palette, className, onUse, onMenu }) {
  const { tankW, tankH, bath, useBath } = state.settings;
  const hold = useRef(null);
  const at = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX, y: e.clientY, point: [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100] };
  };
  const cancelHold = () => clearTimeout(hold.current);
  return (
    <div className={cx('flex min-h-0 min-w-0 items-center justify-center', className)} style={{ containerType: 'size' }}>
      <button
        type="button"
        aria-label={`The tank, ${tankW} by ${tankH} mm. ${toolDef(state.tool).hint}`}
        onClick={onUse}
        onContextMenu={(e) => { e.preventDefault(); onMenu?.(at(e)); }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch' || !onMenu) return;
          const where = at(e);
          hold.current = setTimeout(() => onMenu(where), 550);
        }}
        onPointerUp={cancelHold} onPointerMove={cancelHold} onPointerCancel={cancelHold}
        className={cx(
          'relative shrink-0 cursor-crosshair touch-none select-none overflow-hidden rounded-sm shadow-2xl ring-1 focus-visible:outline-2 focus-visible:outline-gilt',
          state.freezeMode !== 'off' ? 'ring-2 ring-sky-300/70' : 'ring-black/40',
        )}
        // As large as fits, keeping the tank's shape.
        style={{
          aspectRatio: `${tankW} / ${tankH}`,
          width: `min(100cqw, 100cqh * ${tankW / tankH})`,
          background: useBath ? bath : palette.bath,
        }}
      >
        <img src={tankImage} alt="" draggable={false} className="size-full object-cover" />
        {!state.playing && (
          <span className="absolute left-3 top-3 rounded bg-black/60 px-2 py-0.5 text-[11px] font-medium tracking-wide text-ink-100">
            PAUSED · Space to play
          </span>
        )}
        {state.freezeMode !== 'off' && (
          <span className="absolute right-3 top-3 rounded bg-sky-950/80 px-2 py-0.5 text-[11px] font-medium text-sky-100">
            {state.freezeMode === 'freeze' ? 'Click ink to freeze it' : 'Click frozen ink to free it'}
          </span>
        )}
      </button>
    </div>
  );
}

const DIRECTIONS = [
  { angle: 0, label: 'Right', Icon: ArrowRight }, { angle: 90, label: 'Up', Icon: ArrowUp },
  { angle: 180, label: 'Left', Icon: ArrowLeft }, { angle: 270, label: 'Down', Icon: ArrowDown },
];

// Lines under a setting that say what its number means. The mock values are rough; connected,
// these come from the tank (drop size uses the film's real spread).
const HINTS = {
  'drop.quantity': (v) => `About ${Math.round(9 * Math.sqrt(v))}% of the tank's width across`,
  'fullRake.angle': (v) => ({ 0: 'Travels right', 90: 'Travels up', 180: 'Travels left', 270: 'Travels down' }[v] ?? `Travels at ${v}°`),
};

// Two repeats of a weave, from the same curve the rake follows.
export function WeaveIcon({ shape, className }) {
  return (
    <svg viewBox="0 0 48 22" aria-hidden="true" className={cx('h-[22px] w-12', className)}>
      <polyline points={WEAVE_ICONS[shape]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Weave shape as pictures. In a row it's a button that opens the grid; in a column, the grid itself.
export function WeavePicker({ label, value, options, onChange, info, inline }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
  }, [open]);
  const grid = (
    <div role="radiogroup" aria-label={label} className={cx('grid gap-1', inline ? 'grid-cols-4' : 'w-80 grid-cols-4')}>
      {Object.entries(options).map(([shape, text]) => (
        <button
          key={shape} type="button" role="radio" aria-checked={value === shape} title={text}
          onClick={() => { onChange(shape); setOpen(false); }}
          className={cx(
            'flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] focus-visible:outline-2 focus-visible:outline-gilt',
            value === shape ? 'bg-ink-700 text-gilt-soft ring-1 ring-gilt' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
          )}
        >
          <WeaveIcon shape={shape} />{text}
        </button>
      ))}
    </div>
  );
  return (
    <div ref={ref} className="relative flex flex-col gap-1">
      <div className="flex items-center gap-1 text-xs text-ink-300">{label}<InfoTip text={info} label={label} /></div>
      {inline ? grid : (
        <>
          <button
            type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}
            className="flex h-7 items-center gap-2 rounded-md border border-ink-600 bg-ink-800 px-2 text-xs text-ink-100 hover:bg-ink-700 focus-visible:outline-2 focus-visible:outline-gilt"
          >
            <WeaveIcon shape={value} className="h-4 w-9 text-gilt-soft" />{options[value]}<ChevronDown size={12} className="text-ink-400" />
          </button>
          {open && <div className="absolute left-0 top-14 z-50 rounded-lg border border-ink-600 bg-ink-850 p-2 shadow-2xl">{grid}</div>}
        </>
      )}
    </div>
  );
}

// One tool setting from tools.js. Size-like ones show the old page's 0 to 100 dial.
export function ParamSlider({ tool, p, value, onChange, className, compact }) {
  return (
    <Slider
      className={className} compact={compact}
      label={p.label} value={value} min={p.min} max={p.max} step={p.step}
      info={INFO[`${tool}.${p.key}`]}
      hint={HINTS[`${tool}.${p.key}`]?.(value)}
      {...(p.dial && {
        toDial: (v) => valueToDial(v, p.min, p.max, p.over),
        fromDial: (d) => dialToValue(d, p.min, p.max, p.over),
        dialTop: p.over?.top ?? 100,
      })}
      onChange={onChange}
    />
  );
}

// Freeze holds chosen ink still for the tools that work on the whole tank's loops.
function FreezeRow({ tank }) {
  const { state, dispatch } = tank;
  const mode = state.freezeMode ?? 'off';
  const pick = (m) => dispatch({ type: 'set', patch: { freezeMode: mode === m ? 'off' : m } });
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 text-xs text-ink-300">Freeze ink<InfoTip text={INFO.freeze} label="Freeze ink" /></div>
      <div className="flex gap-1">
        <Button className={mode === 'freeze' ? 'border-gilt text-gilt-soft' : ''} onClick={() => pick('freeze')}><Snowflake size={12} /> Freeze</Button>
        <Button className={mode === 'unfreeze' ? 'border-gilt text-gilt-soft' : ''} onClick={() => pick('unfreeze')}>Unfreeze</Button>
        <Button onClick={() => tank.act('Unfreeze all')}>Unfreeze all</Button>
      </div>
    </div>
  );
}

const FREEZE_TOOLS = ['fullRake', 'hearts'];
const DEFAULT_WEAVE_HEIGHT = 30;

// A tool's settings, laid out in a row (desktop's settings bar) or a column (panels, phone sheet).
// Every tool's settings come from tools.js, so a new tool or setting appears here by itself.
export function ToolSettings({ tank, layout = 'row', limit }) {
  const { state, dispatch, applyTool } = tank;
  const id = state.tool;
  const def = toolDef(id);
  const values = state.values[id] ?? {};
  const params = shownParams(id, state.view).slice(0, limit);
  const choices = shownChoices(id, state.view);
  const set = (key) => (value) => dispatch({ type: 'value', tool: id, key, value });
  const row = layout === 'row';
  // The old page's two weave rules: a shape needs height to show, and height on a straight rake means a weave.
  const setWeave = (shape) => {
    set('waveShape')(shape);
    if (shape === 'straight') set('waveAmp')(0);
    else if (!values.waveAmp) set('waveAmp')(DEFAULT_WEAVE_HEIGHT);
  };
  const setParam = (key) => (value) => {
    set(key)(value);
    if (key === 'waveAmp' && value > 0 && values.waveShape === 'straight') set('waveShape')('sine');
  };
  return (
    <div className={cx('flex', row ? 'flex-wrap items-start gap-x-5 gap-y-2' : 'flex-col gap-4')}>
      {def.text && (
        <>
          <label className="flex flex-col gap-1 text-xs text-ink-300">
            Text
            <textarea
              rows={row ? 1 : 3}
              value={values.string ?? ''}
              onChange={(e) => set('string')(e.target.value)}
              className="w-44 resize-y rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-ink-100"
            />
          </label>
          <Choice label="Font" value={values.font ?? 'serif'} options={FONTS} onChange={set('font')} />
        </>
      )}
      {params.map((p) => (
        <ParamSlider key={p.key} tool={id} p={p} value={values[p.key]} compact={row} className={row ? 'w-40' : 'w-full'} onChange={setParam(p.key)} />
      ))}
      {choices.map((c) => (c.key === 'waveShape'
        ? <WeavePicker key={c.key} inline={!row} label={c.label} value={values[c.key]} options={c.options} info={INFO[`${id}.${c.key}`]} onChange={setWeave} />
        : <Choice key={c.key} label={c.label} value={values[c.key]} options={c.options} info={INFO[`${id}.${c.key}`]} onChange={set(c.key)} />
      ))}
      {def.directions && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ink-300">Direction</span>
          <div className="flex gap-0.5">
            {DIRECTIONS.map(({ angle, label, Icon }) => (
              <IconButton
                key={angle} size="sm" label={label}
                active={Number(values.angle) === angle}
                onClick={() => set('angle')(angle)}
              >
                <Icon size={14} />
              </IconButton>
            ))}
          </div>
        </div>
      )}
      {FREEZE_TOOLS.includes(id) && state.view === 'advanced' && <FreezeRow tank={tank} />}
      {def.whole && (
        <Button primary onClick={applyTool} className={cx('self-end', row ? '' : 'w-full')}>
          <Play size={12} /> {def.label}
        </Button>
      )}
    </div>
  );
}

// The script editor, with line numbers and colouring from CodeMirror.
export function ScriptEditor({ value, onChange, onRun, className }) {
  const host = useRef(null);
  const view = useRef(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  const running = useRef(onRun);
  running.current = onRun;
  useEffect(() => {
    view.current = new EditorView({
      parent: host.current,
      doc: value,
      extensions: [
        Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { running.current?.(); return true; } }])),
        basicSetup, javascript(), oneDark,
        EditorView.lineWrapping,
        EditorView.theme({ '&': { height: '100%', fontSize: '12px' }, '.cm-scroller': { fontFamily: 'var(--font-mono)' } }),
        EditorView.updateListener.of((u) => { if (u.docChanged) latest.current(u.state.doc.toString()); }),
      ],
    });
    return () => view.current.destroy();
    // The editor owns its text after it starts; outside changes come through the effect below.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);
  return <div ref={host} className={cx('min-h-0 overflow-hidden rounded-md border border-ink-600', className)} />;
}

// Everything the script drawer holds, for the desktop side drawer and the phone sheet.
export function ScriptBody({ tank, onRun, onCapture }) {
  const { state, dispatch } = tank;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Choice
          label="Examples"
          value={state.example}
          options={Object.fromEntries(Object.keys(EXAMPLES).map((k) => [k, k]))}
          info={INFO.script}
          onChange={(k) => dispatch({ type: 'set', patch: { example: k, script: EXAMPLES[k], scriptError: null } })}
        />
        <Choice label="My scripts" value="" options={{ '': 'None saved yet' }} info={INFO.myScripts} onChange={() => {}} />
      </div>
      <ScriptEditor
        className="flex-1"
        value={state.script}
        onRun={onRun}
        onChange={(script) => dispatch({ type: 'set', patch: { script, example: '' } })}
      />
      {state.scriptError && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-300">
          {state.scriptError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button primary onClick={onRun} title="⌘↵"><Play size={12} /> Run</Button>
        <Toggle
          label="Clear tank first"
          checked={state.settings.clearFirst}
          info={INFO.clearFirst}
          onChange={(v) => dispatch({ type: 'setting', key: 'clearFirst', value: v })}
        />
        <span className="flex-1" />
        <Button onClick={onCapture}>Copy session to script</Button>
        <Button>Save script</Button>
      </div>
    </div>
  );
}

// The assistant as a small ink drop. It wobbles gently, and keeps still for "reduce motion".
export function InkDrop({ size = 40, color = '#2a6f66', shine = '#43b3a0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="creature-bob">
      <defs>
        <radialGradient id="drop-body" cx="38%" cy="40%" r="70%">
          <stop offset="0" stopColor={shine} />
          <stop offset="1" stopColor={color} />
        </radialGradient>
      </defs>
      <path d="M20 3 C 27 13, 34 19, 34 26 a 14 14 0 0 1 -28 0 C 6 19, 13 13, 20 3 Z" fill="url(#drop-body)" />
      <ellipse cx="15.5" cy="25" rx="2" ry="2.6" fill="#0e0f11" />
      <ellipse cx="24.5" cy="25" rx="2" ry="2.6" fill="#0e0f11" />
      <circle cx="16.2" cy="24.1" r="0.7" fill="#fff" />
      <circle cx="25.2" cy="24.1" r="0.7" fill="#fff" />
      <path d="M17.5 30.5 q 2.5 2 5 0" stroke="#0e0f11" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <ellipse cx="13" cy="17" rx="2.4" ry="1.2" fill="#fff" opacity="0.35" transform="rotate(-35 13 17)" />
    </svg>
  );
}

const FAQ = [
  { q: 'How do I make feathers?', a: 'Put drops down, let them settle, then use Full rake one way and back again with an offset. In Wake, a thin bath (viscosity 5 to 60) and a fast rake curl the feathers.' },
  { q: 'Why does my ink stop moving?', a: 'Only the Wake simulators keep the bath moving after a tool. Lower viscosity, or choose Curling or Whorls under Moving bath, to keep it going longer.' },
  { q: 'What does Repeating do?', a: INFO.tile },
];

// What the drop says. Questions search an FAQ in the browser, so it works on the demo without a key.
export function CreatureChat({ onClose, canWriteScripts }) {
  const [text, setText] = useState('');
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ink-700 px-3 py-2">
        <InkDrop size={24} />
        <span className="text-sm font-medium">Ask the drop</span>
        <span className="flex-1" />
        <IconButton size="sm" label="Close" onClick={onClose}><X size={14} /></IconButton>
      </div>
      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        <p className="rounded-lg bg-ink-800 px-3 py-2 text-ink-300">
          Hi! Ask me how anything works.{canWriteScripts && ' I can also write and change scripts for you.'}
        </p>
        {FAQ.map((f) => (
          <details key={f.q} className="rounded-lg border border-ink-700 px-3 py-2">
            <summary className="cursor-pointer text-ink-100">{f.q}</summary>
            <p className="mt-2 text-xs leading-relaxed text-ink-300">{f.a}</p>
          </details>
        ))}
      </div>
      <form className="flex gap-2 border-t border-ink-700 p-2" onSubmit={(e) => { e.preventDefault(); setText(''); }}>
        <input
          aria-label="Your question"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={canWriteScripts ? 'Ask, or describe a pattern…' : 'Ask a question…'}
          className="h-8 min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-800 px-2 text-sm"
        />
        <IconButton label="Send" type="submit"><Send size={14} /></IconButton>
      </form>
    </div>
  );
}

export function ToolHint({ tool }) {
  const def = toolDef(tool);
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs text-ink-400">
      <span className="truncate">{def.hint}</span>
      <InfoTip text={INFO[`tool.${tool}`] ?? INFO[tool]} label={def.label} />
    </span>
  );
}

export { Swatches };
