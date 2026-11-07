// Pieces both layouts share: the tank, a tool's settings, the script editor and the creature.
import { useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Mic, Play, Send, Snowflake, X } from 'lucide-react';
import { dialToValue, valueToDial } from '../../../api.js';
import { LiveTank } from '../tank/LiveTank.jsx';
import tankImage from '../../../docs/images/teal-copper-swirls.jpg';
import { EXAMPLES, FONTS, INFO, WEAVE_ICONS, shortLabel, shownChoices, shownParams, toolDef } from './controls.js';
import { Button, Choice, IconButton, InfoTip, Slider, Swatches, Toggle, cx } from './widgets.jsx';
import { FAQ, search, wantsScript } from './faq.js';

// The real tank when there is one, or the mockup's picture.
export function TankArea({ tank, className, onMenu }) {
  return tank.controller
    ? <LiveTank tank={tank} className={className} onMenu={onMenu} />
    : <Tank state={tank.state} palette={tank.palette} className={className} onUse={tank.applyTool} onMenu={onMenu} />;
}

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
      label={p.label} shortLabel={shortLabel(p.label)} value={value} min={p.min} max={p.max} step={p.step}
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
        <Button onClick={() => tank.perform?.('unfreezeAll') || tank.act('Unfreeze all')}>Unfreeze all</Button>
      </div>
    </div>
  );
}

const FREEZE_TOOLS = ['fullRake', 'hearts'];
const DEFAULT_WEAVE_HEIGHT = 30;

// A tool's settings, laid out in a row (desktop's settings bar) or a column (panels, phone sheet).
// Every tool's settings come from tools.js, so a new tool or setting appears here by itself.
// In the desktop settings bar ('row') every setting has the same width, in at most two rows that
// fill top then bottom, so the bar never changes height; the tool's button sits under its name
// (OptionsBar), so it isn't repeated here.
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
    <div className={cx(row ? 'grid grid-flow-col grid-rows-2 auto-cols-[10rem] items-start gap-x-5 gap-y-2' : 'flex flex-col gap-4')}>
      {def.text && (
        <>
          <label className="flex flex-col gap-1 text-xs text-ink-300">
            Text
            <textarea
              rows={row ? 1 : 3}
              value={values.string ?? ''}
              onChange={(e) => set('string')(e.target.value)}
              className={cx('resize-y rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-ink-100', row ? 'h-7 w-full resize-none' : 'w-44')}
            />
          </label>
          <Choice label="Font" value={values.font ?? 'serif'} options={FONTS} onChange={set('font')} />
        </>
      )}
      {params.map((p) => (
        <ParamSlider key={p.key} tool={id} p={p} value={values[p.key]} compact={row} className="w-full" onChange={setParam(p.key)} />
      ))}
      {choices.map((c) => (c.key === 'waveShape'
        ? <WeavePicker key={c.key} inline={!row} label={c.label} value={values[c.key]} options={c.options} info={INFO[`${id}.${c.key}`]} onChange={setWeave} />
        : <Choice key={c.key} label={c.label} shortLabel={row ? shortLabel(c.label) : undefined} value={values[c.key]} options={c.options} info={INFO[`${id}.${c.key}`]} onChange={set(c.key)} />
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
      {FREEZE_TOOLS.includes(id) && state.view === 'advanced' && <div className={row ? 'col-span-2' : ''}><FreezeRow tank={tank} /></div>}
      {def.whole && !row && (
        <Button primary onClick={applyTool} className="w-full">
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
        EditorView.updateListener.of((u) => {
          // Only edits by hand count; text set from outside (an example, the assistant) isn't one.
          if (u.docChanged && u.transactions.some((t) => t.isUserEvent('input') || t.isUserEvent('delete') || t.isUserEvent('move') || t.isUserEvent('undo') || t.isUserEvent('redo'))) latest.current(u.state.doc.toString());
        }),
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
          options={Object.fromEntries([['', 'Choose an example…'], ...Object.keys(EXAMPLES).map((k) => [k, k])])}
          info={INFO.script}
          onChange={(name) => dispatch({ type: 'example', name })}
        />
        <Choice
          label="My scripts" value={state.openScript ?? ''} info={INFO.myScripts}
          options={Object.fromEntries([['', state.scripts?.length ? 'Open a saved script…' : 'None saved yet'], ...(state.scripts ?? []).map((x) => [x.name, x.name])])}
          onChange={(name) => dispatch({ type: 'openScript', name })}
        />
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
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Script name" placeholder="Name to save as" value={state.scriptName ?? ''}
          onChange={(e) => dispatch({ type: 'set', patch: { scriptName: e.target.value } })}
          className="h-8 min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-800 px-2 text-xs"
        />
        <Button onClick={() => dispatch({ type: 'saveScript' })}>Save script</Button>
        {state.openScript && <Button onClick={() => dispatch({ type: 'deleteScript' })}>Delete</Button>}
      </div>
    </div>
  );
}

// Carra Jean, the assistant, as a small ink drop with big lashed eyes, named after carrageen, the seaweed that thickens a
// marbling bath. It wobbles gently, and keeps still for "reduce motion".
export function InkDrop({ size = 40, color = '#2a6f66', shine = '#43b3a0', waiting = false }) {
  if (waiting) return <WaitingDrop size={size} color={color} shine={shine} />;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="creature-bob">
      <defs>
        <radialGradient id="drop-body" cx="38%" cy="40%" r="70%">
          <stop offset="0" stopColor={shine} />
          <stop offset="1" stopColor={color} />
        </radialGradient>
      </defs>
      <path d="M20 2.5 C 26 12, 35 18.5, 35 26.5 a 15 13.5 0 0 1 -30 0 C 5 18.5, 14 12, 20 2.5 Z" fill="url(#drop-body)" />
      <ellipse cx="11.5" cy="15.5" rx="2.6" ry="1.2" fill="#fff" opacity="0.35" transform="rotate(-40 11.5 15.5)" />
      {/* Big eyes, each with two sparkles and two lashes */}
      <ellipse cx="14.8" cy="25.6" rx="2.5" ry="3.1" fill="#0e0f11" />
      <ellipse cx="25.2" cy="25.6" rx="2.5" ry="3.1" fill="#0e0f11" />
      <circle cx="15.7" cy="24.4" r="0.95" fill="#fff" />
      <circle cx="14.2" cy="26.9" r="0.45" fill="#fff" />
      <circle cx="26.1" cy="24.4" r="0.95" fill="#fff" />
      <circle cx="24.6" cy="26.9" r="0.45" fill="#fff" />
      <path d="M12.55 24 l-1.4 -0.7 M13.1 23.1 l-1 -1.1 M27.45 24 l1.4 -0.7 M26.9 23.1 l1 -1.1" stroke="#0e0f11" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M18.4 30.7 q 1.6 1.3 3.2 0" stroke="#0e0f11" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// Carra Jean as a droplet clock, while a tool is moving the ink or actions wait for it to settle: a clock face in place
// of hers, its hands ticking round, and the whole drop jiggling with each tick.
function WaitingDrop({ size, color, shine }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="carra-jiggle">
      <defs>
        <radialGradient id="drop-wait" cx="38%" cy="40%" r="70%">
          <stop offset="0" stopColor={shine} />
          <stop offset="1" stopColor={color} />
        </radialGradient>
      </defs>
      <path d="M20 2.5 C 26 12, 35 18.5, 35 26.5 a 15 13.5 0 0 1 -30 0 C 5 18.5, 14 12, 20 2.5 Z" fill="url(#drop-wait)" />
      <ellipse cx="11.5" cy="15.5" rx="2.6" ry="1.2" fill="#fff" opacity="0.35" transform="rotate(-40 11.5 15.5)" />
      <circle cx="20" cy="26.5" r="8.6" fill="#f4efe2" stroke="#0e0f11" strokeWidth="1" />
      {[0, 90, 180, 270].map((a) => <path key={a} d="M20 18.9 v1.6" stroke="#0e0f11" strokeWidth="0.9" strokeLinecap="round" transform={`rotate(${a} 20 26.5)`} />)}
      <path d="M20 26.5 v-4.2" stroke="#0e0f11" strokeWidth="1.3" strokeLinecap="round" className="carra-hour" />
      <path d="M20 26.5 v-6.4" stroke="#0e0f11" strokeWidth="0.9" strokeLinecap="round" className="carra-minute" />
      <circle cx="20" cy="26.5" r="0.9" fill="#0e0f11" />
    </svg>
  );
}

// Things to try saying to the script writer.
const SCRIPT_IDEAS = [
  'Five rows of drops in the palette colours, then a feather rake',
  'Make the bath curl more after each rake',
  'Change the script to use gold ink for the last row',
];

// Carra Jean's chat, in two modes. Questions searches the FAQ in the browser (faq.js), so it
// works everywhere and costs nothing. Script asks the assistant, which writes the script; it needs
// the local server. Advanced view starts in Script, Simple in Questions, and either can switch.
export function CreatureChat({ onClose, tank, local }) {
  const canScript = Boolean(local && tank?.sendChat);
  const [mode, setMode] = useState(() => (canScript && tank?.state.view === 'advanced' ? 'script' : 'questions'));
  const [text, setText] = useState('');
  const [answers, setAnswers] = useState([]);
  const [listening, setListening] = useState(null);
  const log = useRef(null);
  const scripting = mode === 'script';
  const chat = scripting ? tank.state.chat : answers;
  const busy = scripting && tank.state.chatBusy;
  // Follow the conversation to its newest line; an empty chat starts at the top of its questions.
  useEffect(() => { log.current?.scrollTo(0, chat.length || busy ? log.current.scrollHeight : 0); }, [chat.length, busy, mode]);
  const Speech = typeof window !== 'undefined' && window.webkitSpeechRecognition;

  const toScript = async (q) => {
    setMode('script');
    if (!(await tank.sendChat(q))) setText(q);
  };
  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setText('');
    if (scripting) { await toScript(q); return; }
    setAnswers((a) => [...a, { role: 'user', content: q }, { role: 'answer', question: q, found: search(q), offerScript: canScript && wantsScript(q) }]);
  };
  const listen = () => {
    if (listening) { listening.stop(); return; }
    const rec = new Speech();
    rec.interimResults = true;
    rec.onresult = (ev) => setText(Array.from(ev.results, (r) => r[0].transcript).join(' '));
    rec.onerror = (ev) => tank?.dispatch({ type: 'notice', text: `Microphone: ${ev.error}` });
    rec.onend = () => setListening(null);
    rec.start();
    setListening(rec);
  };
  const openScript = () => tank.dispatch({ type: 'set', patch: { view: 'advanced', drawer: true } });
  const topics = [...new Set(FAQ.map((f) => f.topic))];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ink-700 px-3 py-2">
        <InkDrop size={24} />
        <span className="text-sm font-medium">Carra Jean</span>
        <span className="flex-1" />
        {chat.length > 0 && (
          <button type="button" className="text-xs text-ink-400 hover:text-ink-100" disabled={busy} onClick={() => (scripting ? tank.clearChat() : setAnswers([]))}>Clear</button>
        )}
        <IconButton size="sm" label="Close" onClick={onClose}><X size={14} /></IconButton>
      </div>
      <div role="radiogroup" aria-label="What Carra Jean does" className="mx-3 mt-2 flex rounded-md border border-ink-700 p-0.5 text-xs">
        {[['questions', 'Questions'], ['script', 'Script']].map(([id, label]) => (
          <button
            key={id} type="button" role="radio" aria-checked={mode === id}
            disabled={id === 'script' && !canScript}
            title={id === 'script' && !canScript ? 'Writing scripts needs Marbler running on your own computer' : undefined}
            onClick={() => setMode(id)}
            className={cx('flex-1 rounded px-2 py-1', mode === id ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-100', id === 'script' && !canScript && 'cursor-not-allowed opacity-50')}
          >
            {label}
          </button>
        ))}
      </div>
      <div ref={log} className="scroll-thin flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        <p className="rounded-lg bg-ink-800 px-3 py-2 text-ink-300">
          {scripting
            ? 'Hi, I\'m Carra Jean! Describe a pattern or a change and I\'ll write it into the script. Nothing happens in the tank until you run it.'
            : 'Hi, I\'m Carra Jean! Ask me how anything works, or browse the questions below.'}
        </p>
        {chat.length === 0 && scripting && SCRIPT_IDEAS.map((idea) => (
          <button key={idea} type="button" onClick={() => setText(idea)} className="block w-full rounded-lg border border-ink-700 px-3 py-2 text-left text-ink-100 hover:border-ink-400">
            {idea}
          </button>
        ))}
        {chat.length === 0 && !scripting && topics.map((topic) => (
          <section key={topic} className="space-y-1.5">
            <h3 className="text-[11px] uppercase tracking-wider text-ink-400">{topic}</h3>
            {FAQ.filter((f) => f.topic === topic).map((f) => (
              <details key={f.q} className="rounded-lg border border-ink-700 px-3 py-2">
                <summary className="cursor-pointer text-ink-100">{f.q}</summary>
                <p className="mt-2 text-xs leading-relaxed text-ink-300">{f.a}</p>
              </details>
            ))}
          </section>
        ))}
        {chat.map((m, i) => {
          if (m.role === 'user') return <p key={i} className="ml-6 whitespace-pre-line rounded-lg bg-ink-700 px-3 py-2 text-ink-100">{m.content}</p>;
          if (m.role === 'answer') {
            return (
              <div key={i} className="mr-6 space-y-2">
                {m.found.length === 0 && <p className="rounded-lg bg-ink-800 px-3 py-2 text-ink-300">I don&apos;t have an answer for that yet. Try other words, or browse the questions after Clear.</p>}
                {m.found.map((d) => (
                  <div key={d.title} className="rounded-lg bg-ink-800 px-3 py-2">
                    <p className="font-medium text-ink-100">{d.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-300">{d.text}</p>
                  </div>
                ))}
                {m.offerScript && (
                  <Button onClick={() => toScript(m.question)}>Write this as a script instead</Button>
                )}
              </div>
            );
          }
          const last = i === chat.length - 1;
          return (
            <div key={i} className="mr-6 space-y-2">
              <p className="whitespace-pre-line rounded-lg bg-ink-800 px-3 py-2 text-ink-300">{m.content}</p>
              {last && m.role === 'assistant' && !busy && (
                <div className="flex gap-1.5">
                  <Button primary onClick={() => tank.dispatch({ type: 'run' })}><Play size={12} /> Run it</Button>
                  {tank.state.view !== 'advanced' || !tank.state.drawer ? <Button onClick={openScript}>Show the script</Button> : null}
                </div>
              )}
            </div>
          );
        })}
        {busy && <p className="mr-6 animate-pulse rounded-lg bg-ink-800 px-3 py-2 text-ink-400">Writing…</p>}
      </div>
      <form className="flex gap-2 border-t border-ink-700 p-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input
          aria-label={scripting ? 'Describe a pattern or change' : 'Your question'}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          placeholder={scripting ? 'Describe a pattern or a change…' : 'Ask how anything works…'}
          className="h-8 min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-800 px-2 text-sm"
        />
        {Speech && local && (
          <IconButton label={listening ? 'Stop listening' : 'Speak'} active={Boolean(listening)} onClick={listen}><Mic size={14} /></IconButton>
        )}
        <IconButton label="Send" type="submit" disabled={busy}><Send size={14} /></IconButton>
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
