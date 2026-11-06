// Small shared controls. Each setting can carry an (i) that opens its explanation from info.js.
import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { INFO } from './controls.js';

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

export function InfoTip({ text, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
  }, [open]);
  if (!text) return null;
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full p-0.5 text-ink-400 hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-gilt"
      >
        <Info size={12} />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-6 z-50 w-64 -translate-x-1/2 rounded-lg border border-ink-600 bg-ink-850 p-3 text-xs leading-relaxed text-ink-300 shadow-xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}

export function Slider({ label, value, min, max, step, onChange, info, compact = false, className }) {
  const id = useId();
  const fill = `${((Number(value) - min) / (max - min)) * 100}%`;
  const digits = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return (
    <div className={cx('flex min-w-0 flex-col gap-1', className)}>
      <div className="flex items-center gap-1 text-xs text-ink-300">
        <label htmlFor={id} className={cx('truncate', compact && 'max-w-28')}>{label}</label>
        <InfoTip text={info} label={label} />
        <span className="ml-auto pl-2 font-mono tabular-nums text-ink-100">{Number(value).toFixed(digits)}</span>
      </div>
      <input
        id={id}
        type="range"
        className="slider w-full"
        style={{ '--fill': fill }}
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Choice({ label, value, options, onChange, info }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1 text-xs text-ink-300">
        <label htmlFor={id}>{label}</label>
        <InfoTip text={info} label={label} />
      </div>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded-md border border-ink-600 bg-ink-800 px-2 text-xs text-ink-100 focus-visible:outline-2 focus-visible:outline-gilt"
      >
        {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
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
export function Swatches({ palette, ink, onPick, size = 'md' }) {
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
    </div>
  );
}

export const info = (key) => INFO[key];
