// Thanks and credits, from Help. Ilse's thanks come first; everything after is BIBLIOGRAPHY.md
// itself, read at build time, so the window and the repository always say the same thing.
import { useEffect } from 'react';
import { X } from 'lucide-react';
import bibliography from '../../../BIBLIOGRAPHY.md?raw';
import { IconButton } from './widgets.jsx';

const LINK = 'text-gilt-soft underline decoration-ink-600 underline-offset-2 hover:decoration-gilt-soft';

// Just enough Markdown for the bibliography: headings, paragraphs, bullets, **bold**, `code`,
// [links](...) and bare URLs. Built as elements, never as HTML, so nothing in the file can inject.
function inline(text, key = 0) {
  const out = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+[^\s).,;])/g;
  let at = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > at) out.push(text.slice(at, m.index));
    const k = `${key}-${m.index}`;
    if (m[1] !== undefined) out.push(<strong key={k} className="font-semibold text-ink-100">{inline(m[1], k)}</strong>);
    else if (m[2] !== undefined) out.push(<code key={k} className="rounded bg-ink-800 px-1 font-mono text-[11px]">{m[2]}</code>);
    else {
      const href = m[4] ?? m[5];
      const external = /^https?:/.test(href);
      out.push(<a key={k} href={href} className={LINK} {...(external && { target: '_blank', rel: 'noopener noreferrer' })}>{m[3] ? inline(m[3], k) : href}</a>);
    }
    at = re.lastIndex;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

export function Markdown({ source }) {
  const blocks = [];
  let list = null;
  let para = [];
  const flushPara = () => { if (para.length) blocks.push({ type: 'p', text: para.join(' ') }); para = []; };
  const flushList = () => { if (list) blocks.push({ type: 'ul', items: list }); list = null; };
  for (const raw of source.split('\n')) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (heading) { flushPara(); flushList(); blocks.push({ type: `h${heading[1].length}`, text: heading[2] }); }
    else if (bullet) { flushPara(); (list ??= []).push({ depth: bullet[1].length >= 2 ? 1 : 0, text: bullet[2] }); }
    else if (!line.trim()) { flushPara(); flushList(); }
    else if (list && /^\s+/.test(raw)) list[list.length - 1].text += ` ${line.trim()}`;
    else { flushList(); para.push(line.trim()); }
  }
  flushPara();
  flushList();
  return blocks.map((b, i) => {
    if (b.type === 'h1') return null; // the window has its own title
    if (b.type === 'h2') return <h3 key={i} className="mt-6 text-[11px] font-medium uppercase tracking-wider text-ink-400">{inline(b.text, i)}</h3>;
    if (b.type === 'h3') return <h4 key={i} className="mt-4 text-sm font-medium text-ink-100">{inline(b.text, i)}</h4>;
    if (b.type === 'ul') {
      return (
        <ul key={i} className="mt-2 space-y-1.5">
          {b.items.map((it, j) => <li key={j} className={it.depth ? 'ml-5 list-[circle]' : 'ml-4 list-disc'}>{inline(it.text, `${i}-${j}`)}</li>)}
        </ul>
      );
    }
    return <p key={i} className="mt-3">{inline(b.text, i)}</p>;
  });
}

export function CreditsDialog({ onClose }) {
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Thanks and credits" className="flex max-h-full w-full max-w-2xl flex-col rounded-xl border border-ink-600 bg-ink-900 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-ink-700 px-4 py-2.5">
          <span className="text-sm font-medium">Thanks and credits</span>
          <span className="flex-1" />
          <IconButton size="sm" label="Close" onClick={onClose}><X size={14} /></IconButton>
        </div>
        <div className="scroll-thin overflow-y-auto px-5 pb-6 pt-4 text-xs leading-relaxed text-ink-300">
          <section className="space-y-3 rounded-lg border border-ink-700 bg-ink-850 p-4 text-sm text-ink-100">
            <p>
              First and foremost, thank you to <strong>Aubrey Jaffer</strong>, whose{' '}
              <a className={LINK} href="https://ctan.org/pkg/pst-marble" target="_blank" rel="noopener noreferrer">pst-marble</a>{' '}
              and mathematical marbling Marbler began from (with Jürgen Gilg and Manuel Luque, who maintain it), and to{' '}
              <strong>Amanda Ghassaei</strong>, whose{' '}
              <a className={LINK} href="https://blog.amandaghassaei.com/2022/10/25/digital-marbling/" target="_blank" rel="noopener noreferrer">Digital Marbling</a>{' '}
              showed what a simulated bath could look like.
            </p>
            <p>I have stood on the shoulders of giants and thrown Claude at it.</p>
            <p>
              Thank you also to every author below: the papers, code and pages Marbler learned from, and the ones worth reading next.
              Each entry says what was taken from it and where it shows up.
            </p>
            <p className="text-ink-400">— Ilse</p>
            <p className="text-xs text-ink-300">Marbler is open source: <a className={LINK} href="https://github.com/funkhouserw/paper-marbling" target="_blank" rel="noopener noreferrer">github.com/funkhouserw/paper-marbling</a>. Its licence and the conditions on the code derived from pst-marble are in <code>NOTICE</code>.</p>
          </section>
          <Markdown source={bibliography} />
        </div>
      </div>
    </div>
  );
}
