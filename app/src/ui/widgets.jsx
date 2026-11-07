// Small shared controls. Each setting can carry an (i) that opens its explanation from info.js.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Info } from 'lucide-react';
import { INFO } from './controls.js';

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

// Where a popover goes: under its anchor, or above when there's more room there, kept on screen.
// Popovers render in a portal with fixed positions, so a scrolling panel or rail can't clip them.
export function usePlace(anchor, open, { width, align = 'start', gap = 4 } = {}) {
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const w = width ?? r.width;
      const want = align === 'center' ? r.left + r.width / 2 - w / 2 : r.left;
      const left = Math.max(8, Math.min(want, window.innerWidth - w - 8));
      const below = window.innerHeight - r.bottom - gap - 8;
      const above = r.top - gap - 8;
      const up = below < 220 && above > below;
      setPos({
        position: 'fixed', left, [width ? 'width' : 'minWidth']: w, maxWidth: Math.max(w, 340),
        ...(up ? { bottom: window.innerHeight - r.top + gap, maxHeight: above } : { top: r.bottom + gap, maxHeight: below }),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, anchor, width, align, gap]);
  return pos;
}

// Closes a popover on a press outside both its anchor and itself, or on Escape.
export function useDismiss(open, setOpen, refs, onEscape) {
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!refs.some((r) => r.current?.contains(e.target))) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') { setOpen(false); onEscape?.(); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}

// An (i) that explains a setting. A mouse shows it on hover; a click or tap pins it open until
// the next press elsewhere. The touch target reaches well past the small icon.
export function InfoTip({ text, label }) {
  const [shown, setShown] = useState(false);   // hovering
  const [pinned, setPinned] = useState(false); // clicked or tapped
  const open = shown || pinned;
  const button = useRef(null);
  const tip = useRef(null);
  const id = useId();
  const hoverTimer = useRef(null);
  useDismiss(pinned, (v) => { setPinned(v); if (!v) setShown(false); }, [button, tip]);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const hover = (on) => (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setShown(on), on ? 250 : 150);
  };
  const pos = usePlace(button, open, { width: 256, align: 'center' });
  if (!text) return null;
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => { clearTimeout(hoverTimer.current); setPinned((p) => !p); setShown(false); }}
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
        className="relative inline-flex shrink-0 rounded-full p-0.5 text-ink-400 before:absolute before:-inset-2 before:content-[''] hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-gilt"
      >
        <Info size={12} />
      </button>
      {open && pos && createPortal(
        <div
          ref={tip}
          id={id}
          role="tooltip"
          style={pos}
          onPointerEnter={hover(true)}
          onPointerLeave={hover(false)}
          className="z-[60] overflow-y-auto rounded-lg border border-ink-600 bg-ink-850 p-3 text-xs font-normal normal-case leading-relaxed tracking-normal text-ink-300 shadow-xl"
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}

// The number beside a slider, which you can also type into, as in the old page. Typing past the
// slider's end is allowed when `loose`, since a script can use any value.
function ValueBox({ value, digits, onCommit, label, min, max, loose }) {
  const [text, setText] = useState(null);
  const shown = text ?? Number(value).toFixed(digits);
  const commit = () => {
    if (text === null) return;
    const n = Number(text);
    setText(null);
    if (text.trim() === '' || !Number.isFinite(n)) return;
    onCommit(loose ? n : Math.min(max, Math.max(min, n)));
  };
  return (
    <input
      aria-label={`${label} value`}
      inputMode="decimal"
      value={shown}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setText(null); e.currentTarget.blur(); } }}
      className="ml-auto w-14 rounded bg-transparent px-1 text-right font-mono tabular-nums text-ink-100 hover:bg-ink-800 focus:bg-ink-800 focus:outline-1 focus:outline-gilt"
    />
  );
}

// `toDial`/`fromDial` turn a value into a 0-100 slider position and back, for size-like settings.
// `showValue` makes the box show and take the real value instead of the slider position.
export function Slider({ label, shortLabel, value, min, max, step, onChange, info, compact = false, className, hint, toDial, fromDial, dialTop = 100, showValue, headerExtra, hideValue = false }) {
  const id = useId();
  const dial = Boolean(toDial);
  const pos = dial ? toDial(Number(value)) : Number(value);
  const lo = dial ? 0 : min;
  const hi = dial ? dialTop : max;
  const fill = `${((pos - lo) / (hi - lo)) * 100}%`;
  const digits = dial ? 0 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return (
    <div className={cx('flex min-w-0 flex-col gap-1', className)}>
      <div className="flex items-center gap-1 text-xs text-ink-300">
        <label htmlFor={id} title={compact ? [label, hint].filter(Boolean).join(': ') : undefined} className={cx('truncate', compact && 'max-w-28')}>{compact ? (shortLabel ?? label) : label}</label>
        <InfoTip text={info} label={label} />
        {headerExtra}
        {hideValue ? <span className="ml-auto" /> : showValue
          ? <ValueBox label={label} digits={0} min={min} max={max} value={Number(value)} onCommit={(n) => onChange(Math.min(max, Math.max(min, n)))} />
          : (
            <ValueBox
              label={label} digits={digits} min={lo} max={hi} loose={!dial}
              value={pos}
              onCommit={(n) => onChange(dial ? fromDial(Math.round(n)) : n)}
            />
          )}
      </div>
      <input
        id={id}
        type="range"
        className="slider w-full"
        style={{ '--fill': fill }}
        min={lo} max={hi} step={dial ? 1 : step} value={pos}
        onChange={(e) => onChange(dial ? fromDial(Number(e.target.value)) : Number(e.target.value))}
      />
      {hint && !compact && <small className="text-[11px] text-ink-400">{hint}</small>}
    </div>
  );
}

// A typed number, kept here while it's typed and handed over once, on Enter or leaving the box,
// as the old page's fields did. The spinner's arrows hand it over straight away. An empty box or
// something that isn't a number puts the last value back.
// placeholder shows the automatic value when the field is empty; such a field can be cleared back to it.
export function NumberField({ label, value, min, max, step, onChange, info, placeholder }) {
  const id = useId();
  const [text, setText] = useState(null);
  const commit = (raw) => {
    setText(null);
    const n = Number(raw);
    if (String(raw).trim() === '') { if (placeholder !== undefined && value !== '') onChange(''); return; }
    if (!Number.isFinite(n) || n === Number(value)) return;
    onChange(n);
  };
  return (
    <div className="flex items-center gap-2 text-xs text-ink-300">
      <label htmlFor={id}>{label}</label>
      <InfoTip text={info} label={label} />
      <input
        id={id} type="number" min={min} max={max} step={step} placeholder={placeholder}
        value={text ?? value}
        onChange={(e) => {
          // Typing says what kind of input it was; the spinner arrows don't.
          if (e.nativeEvent.inputType) setText(e.target.value);
          else commit(e.target.value);
        }}
        onBlur={(e) => { if (text !== null) commit(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(e.currentTarget.value);
          if (e.key === 'Escape') setText(null);
        }}
        className="h-7 w-24 rounded-md border border-ink-600 bg-ink-800 px-2 font-mono text-xs text-ink-100"
      />
    </div>
  );
}

// A dropdown, drawn by us rather than the browser so it matches everywhere. Keyboard: arrows, Home,
// End, Enter or Space to pick, Escape to close, and typing jumps to an option by its first letters.
export function Choice({ label, shortLabel, value, options, onChange, info, hideLabel = false }) {
  const id = useId();
  const entries = Object.entries(options);
  const at = Math.max(0, entries.findIndex(([k]) => String(k) === String(value)));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(at);
  const button = useRef(null);
  const list = useRef(null);
  const typed = useRef({ text: '', time: 0 });
  useDismiss(open, setOpen, [button, list], () => button.current?.focus());
  const pos = usePlace(button, open);
  useEffect(() => {
    if (!open) return;
    list.current?.focus({ preventScroll: true });
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, pos]);
  const show = () => { setActive(at); setOpen(true); };
  const pick = (i) => {
    setOpen(false);
    button.current?.focus();
    if (entries[i] && String(entries[i][0]) !== String(value)) onChange(entries[i][0]);
  };
  const onListKey = (e) => {
    const last = entries.length - 1;
    const go = { ArrowDown: Math.min(last, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: last, PageDown: Math.min(last, active + 8), PageUp: Math.max(0, active - 8) }[e.key];
    if (go !== undefined) { e.preventDefault(); setActive(go); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(active); return; }
    if (e.key === 'Tab') { setOpen(false); return; }
    if (e.key.length === 1 && /\S/.test(e.key)) {
      const now = performance.now();
      const t = typed.current;
      t.text = (now - t.time < 700 ? t.text : '') + e.key.toLowerCase();
      t.time = now;
      const from = t.text.length === 1 ? active + 1 : active;
      const found = [...entries.slice(from), ...entries.slice(0, from)].findIndex(([, v]) => String(v).toLowerCase().startsWith(t.text));
      if (found >= 0) setActive((from + found) % entries.length);
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {!hideLabel && (
        <div className="flex items-center gap-1 text-xs text-ink-300">
          <span id={`${id}-label`} title={shortLabel && shortLabel !== label ? label : undefined} className="truncate">{shortLabel ?? label}</span>
          <InfoTip text={info} label={label} />
        </div>
      )}
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={hideLabel ? label : undefined}
        aria-labelledby={hideLabel ? undefined : `${id}-label ${id}-value`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); } }}
        className={cx('flex h-7 min-w-0 items-center gap-1.5 rounded-md border bg-ink-800 pl-2 pr-1.5 text-left text-xs text-ink-100 hover:border-ink-400 focus-visible:outline-2 focus-visible:outline-gilt', open ? 'border-gilt' : 'border-ink-600')}
      >
        <span id={`${id}-value`} className="min-w-0 flex-1 truncate">{entries[at]?.[1]}</span>
        <ChevronDown size={13} className={cx('shrink-0 text-ink-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && pos && createPortal(
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-o${active}`}
          onKeyDown={onListKey}
          style={pos}
          className="scroll-thin z-[60] overflow-y-auto rounded-lg border border-ink-600 bg-ink-850 py-1 text-xs shadow-xl outline-none"
        >
          {entries.map(([k, v], i) => (
            <li
              key={k}
              id={`${id}-o${i}`}
              data-i={i}
              role="option"
              aria-selected={i === at}
              onPointerMove={() => setActive(i)}
              onClick={() => pick(i)}
              className={cx('flex cursor-pointer items-center gap-2 px-2.5 py-1.5 [@media(pointer:coarse)]:py-2.5', i === active ? 'bg-ink-700 text-ink-100' : 'text-ink-100')}
            >
              <Check size={12} className={cx('shrink-0', i === at ? 'text-gilt' : 'invisible')} />
              <span className="min-w-0">{v}</span>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}

export function Toggle({ label, checked, onChange, info }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2 text-xs text-ink-300">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-4 w-7 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-gilt',
          checked ? 'bg-gilt' : 'bg-ink-600',
        )}
      >
        <span className={cx('absolute top-0.5 size-3 rounded-full bg-ink-950 transition-all', checked ? 'left-3.5' : 'left-0.5')} />
      </button>
      <label htmlFor={id} className="cursor-pointer select-none">{label}</label>
      <InfoTip text={info} label={label} />
    </div>
  );
}

export function IconButton({ label, children, active, onClick, className, size = 'md', ...rest }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-gilt disabled:opacity-40',
        { lg: 'size-11', md: 'size-9', rail: 'size-8', sm: 'size-7' }[size],
        active ? 'bg-ink-700 text-gilt-soft' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Button({ children, primary, className, ...rest }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-gilt disabled:opacity-40',
        primary ? 'bg-gilt text-ink-950 hover:bg-gilt-soft' : 'border border-ink-600 bg-ink-800 text-ink-100 hover:bg-ink-700',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// The palette's inks. Shimmering inks get a sheen so metallic reads at a glance.
// Three kinds of "clear" a marbler throws to open holes and veins: gall water (no colour: a real
// hole showing the bath), white paint (opaque), and a translucent tint of the current colour. How far
// each opens is the gall's job (the tool's Gall setting, or the bath's), not the swatch's.
const CLEARS = [
  ['clear', 'Gall water', 'No colour: cuts real holes showing the bath'],
  ['white', 'White', 'Opaque white paint'],
  ['tint', 'Translucent tint', 'The current colour, see-through; give it more gall to open over other ink'],
];

function ClearSwatch({ s, ink, bath, onPick }) {
  const [open, setOpen] = useState(false);
  const button = useRef(null);
  const menu = useRef(null);
  const pos = usePlace(button, open, { width: 236 });
  useDismiss(open, setOpen, [button, menu]);
  const kind = CLEARS.find(([k]) => k === ink);
  return (
    <>
      <button
        ref={button}
        type="button" role="radio" aria-checked={Boolean(kind)} aria-haspopup="menu" aria-expanded={open}
        aria-label={kind ? `Clear: ${kind[1]}` : 'Clear (gall water, white or a translucent tint)'}
        title={kind ? `Clear: ${kind[1]}. Click for the other kinds` : 'Clear: gall water, white, or a translucent tint'}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          s, 'relative overflow-hidden rounded-full border border-dashed transition-transform focus-visible:outline-2 focus-visible:outline-gilt',
          kind ? 'scale-110 border-ink-100 ring-2 ring-gilt' : 'border-ink-400 hover:scale-105',
        )}
        style={{ background: ink === 'white' ? '#ffffff' : bath }}
      >
        <span className="absolute inset-0 grid place-items-center text-[9px] font-semibold text-ink-900/60">{ink === 'tint' ? 'T' : ink === 'white' ? 'W' : 'C'}</span>
      </button>
      {open && pos && (
        <div ref={menu} role="menu" style={pos} className="z-50 overflow-auto rounded-lg border border-ink-600 bg-ink-900 p-1 shadow-xl">
          {CLEARS.map(([k, label, note]) => (
            <button
              key={k} type="button" role="menuitemradio" aria-checked={ink === k}
              onClick={() => { onPick(k); setOpen(false); }}
              className={cx('flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left hover:bg-ink-800', ink === k && 'bg-ink-800')}
            >
              <span className="text-xs text-ink-100">{label}</span>
              <span className="text-[11px] leading-snug text-ink-400">{note}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// custom is the next drop's colour, for the + swatch, which picks any colour outside the palette.
export function Swatches({ palette, ink, onPick, custom, size = 'md' }) {
  const s = size === 'lg' ? 'size-9' : 'size-6';
  return (
    <div role="radiogroup" aria-label={`${palette.name} inks`} className="flex flex-wrap items-center gap-1.5">
      {palette.inks.map((k, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={ink === i}
          aria-label={`Ink ${i + 1}: ${k.color}${k.shimmer ? ', metallic' : ''}`}
          title={`Ink ${i + 1}${i < 9 ? ` (key ${i + 1})` : ''}`}
          onClick={() => onPick(i)}
          className={cx(
            s, 'relative overflow-hidden rounded-full border transition-transform focus-visible:outline-2 focus-visible:outline-gilt',
            ink === i ? 'scale-110 border-ink-100 ring-2 ring-gilt' : 'border-ink-600 hover:scale-105',
          )}
          style={{ background: k.color }}
        >
          {k.shimmer > 0 && (
            <span
              className="absolute inset-0"
              style={{ background: `linear-gradient(135deg, transparent 30%, rgba(255,255,255,${0.45 * k.shimmer}) 50%, transparent 70%)` }}
            />
          )}
        </button>
      ))}
      {palette.bath && <ClearSwatch s={s} ink={ink} bath={palette.bath} onPick={onPick} />}
      {/* Any colour: the system colour picker, over a + swatch that shows the colour once chosen. */}
      <label
        title="Any colour: pick one outside the palette for the next drops"
        className={cx(
          s, 'relative cursor-pointer overflow-hidden rounded-full border transition-transform focus-within:outline-2 focus-within:outline-gilt',
          ink === 'custom' ? 'scale-110 border-ink-100 ring-2 ring-gilt' : 'border-ink-500 hover:scale-105',
        )}
        style={{ background: ink === 'custom' && custom ? custom : 'conic-gradient(#e66, #ec6, #6c6, #6ce, #66e, #c6e, #e66)' }}
      >
        {ink !== 'custom' && <span className="absolute inset-[3px] grid place-items-center rounded-full bg-ink-900 text-[12px] font-semibold leading-none text-ink-100">+</span>}
        <input
          type="color"
          role="radio"
          aria-checked={ink === 'custom'}
          aria-label="Any colour"
          value={custom && /^#[0-9a-f]{6}$/i.test(custom) ? custom : '#3fa7d6'}
          onChange={(e) => onPick({ custom: e.target.value })}
          onClick={() => { if (ink !== 'custom' && custom) onPick({ custom }); }}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

export const info = (key) => INFO[key];
