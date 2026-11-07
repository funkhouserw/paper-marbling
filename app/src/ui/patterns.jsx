// Traditional patterns (roadmap F21), from Help: each pattern's names, a checked definition, how
// well the sources support it, a link to a real sheet we may reuse, and, where Marbler has one, an
// example to make it. Everything comes from patterns.js, so the FAQ and this window agree.
import { useEffect } from 'react';
import { Play, X } from 'lucide-react';
import { PATTERNS, SOURCES } from '../../../patterns.js';
import { Button, IconButton } from './widgets.jsx';

const FAMILIES = [
  ['base', 'Base patterns: colours thrown and left'],
  ['combed', 'Combed and drawn patterns'],
  ['ebru', 'Ebru (Turkish)'],
  ['suminagashi', 'Suminagashi (Japanese)'],
];
// A Wikimedia Commons file page's picture, as a small thumbnail Commons serves itself (nothing is
// copied into Marbler). Other sources (a book scan, a museum page) stay as links.
const COMMONS = 'https://commons.wikimedia.org/wiki/File:';
const thumbOf = (url) => (url?.startsWith(COMMONS) ? `https://commons.wikimedia.org/wiki/Special:FilePath/${url.slice(COMMONS.length)}?width=360` : null);

const STATUS = {
  verified: null,
  partly: 'Sources agree on the outline; details vary.',
  unverifiable: 'No historical definition found; this is how marblers use the name today.',
};

export function PatternsDialog({ tank, onClose }) {
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });
  const make = (name) => { tank.dispatch({ type: 'example', name }); onClose(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Traditional patterns" className="flex max-h-full w-full max-w-2xl flex-col rounded-xl border border-ink-600 bg-ink-900 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-ink-700 px-4 py-2.5">
          <span className="text-sm font-medium">Traditional patterns</span>
          <span className="flex-1" />
          <IconButton size="sm" label="Close" onClick={onClose}><X size={14} /></IconButton>
        </div>
        <div className="scroll-thin overflow-y-auto px-5 pb-6 pt-3 text-sm text-ink-300">
          <p className="text-xs leading-relaxed text-ink-400">
            The names marblers have used, checked against the sources below. Pictures link to real sheets that are free to reuse.
          </p>
          {FAMILIES.map(([family, title]) => (
            <section key={family} className="mt-5">
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-ink-400">{title}</h3>
              <ul className="mt-2 space-y-3">
                {PATTERNS.filter((p) => p.family === family).map((p) => {
                  const [first, ...others] = [p.names.en, p.names.tr, p.names.de, p.names.ja].filter(Boolean);
                  return (
                    <li key={p.id} className="flow-root rounded-lg border border-ink-700 bg-ink-850 p-3">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium text-ink-100">{first[0].toUpperCase() + first.slice(1)}</span>
                        {others.length > 0 && <span className="text-xs text-ink-400">{others.join(' · ')}</span>}
                      </div>
                      {thumbOf(p.image?.url) && (
                        <a href={p.image.url} target="_blank" rel="noopener noreferrer" className="float-right ml-3 mt-1 block w-32 shrink-0">
                          {/* If Commons can't be reached the picture goes, leaving the link below as before. */}
                          <img src={thumbOf(p.image.url)} alt={`${first}: a real sheet, ${p.image.title}`} loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.closest('a').hidden = true; }} className="h-24 w-32 rounded border border-ink-700 object-cover" />
                          <span className="mt-0.5 block text-[10px] leading-tight text-ink-500">Wikimedia Commons, {p.image.licence}</span>
                        </a>
                      )}
                      <p className="mt-1 text-xs leading-relaxed">{p.summary}</p>
                      {STATUS[p.status] && <p className="mt-1 text-[11px] italic text-ink-400">{STATUS[p.status]}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-400">
                        {p.example && <Button primary className="h-7" onClick={() => make(p.example)}><Play size={11} /> Make this</Button>}
                        {[p.alsoExample ?? []].flat().map((name) => <Button key={name} className="h-7" onClick={() => make(name)}><Play size={11} /> {name}</Button>)}
                        {p.image && (
                          <a href={p.image.url} target="_blank" rel="noopener noreferrer" className="text-gilt-soft underline decoration-ink-600 underline-offset-2">
                            {p.image.title} ↗
                          </a>
                        )}
                        {p.image && <span>{p.image.licence}</span>}
                        {p.sources.length > 0 && <span>Sources: {p.sources.map((s) => SOURCES[s]).join('; ')}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
