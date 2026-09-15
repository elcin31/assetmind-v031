import { useEffect, useId, useRef, useState } from 'react';
import type { SearchResult } from '../types';
import { searchInstruments } from '../data/instruments';
import { searchAssets } from '../utils/searchAssets';

interface Props { onSelect: (r: SearchResult) => void }
export function SearchPanel({ onSelect }: Props) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLElement>(null);
  const press = useRef<{ id: number; symbol: string; x: number; y: number; moved: boolean } | null>(null);
  const selectionApplied = useRef(false);
  const suppressClick = useRef(false);
  const resultsId = useId();
  const query = q.trim();
  const [remote, setRemote] = useState<{ query: string; results: SearchResult[]; offline: boolean } | null>(null);
  const current = remote?.query === query ? remote : null;
  const results = current?.results ?? searchInstruments(query);
  const expanded = open && Boolean(query) && !selected;
  const loading = Boolean(expanded && !current);
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      const result = await searchAssets(query, controller.signal);
      if (!controller.signal.aborted) setRemote({ query, ...result });
    }, 300);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [query, expanded]);

  useEffect(() => {
    if (!expanded) return;
    const dismissOutside = (event: Event) => {
      if (event.type === 'focusin' && press.current) return;
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    // Safari can blur the input without focusing the tapped button. Waiting for
    // the actual outside interaction keeps results clickable until selection.
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('focusin', dismissOutside, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('focusin', dismissOutside, true);
    };
  }, [expanded]);

  function select(result: SearchResult) {
    if (selectionApplied.current) return;
    selectionApplied.current = true;
    press.current = null;
    setSelected(result);
    setQ(result.symbol);
    setOpen(false);
    onSelect(result);
    // Return focus from a now-hidden result; collapse the mobile keyboard.
    input.current?.focus();
    input.current?.blur();
  }

  return <section ref={container} className="card asset-search" onKeyDown={event => {
    if (event.key === 'Escape') { input.current?.focus(); setOpen(false); }
  }}>
    <h2>Найти актив</h2>
    <input ref={input} className="input" type="search" placeholder="Palantir, PLTR, AAPL, …" value={q}
      onFocus={() => { if (!selected) setOpen(true); }}
      onChange={e => { selectionApplied.current = false; setQ(e.target.value); setRemote(null); setSelected(null); setOpen(true); }}
      autoComplete="off" aria-label="Search asset" aria-expanded={expanded} aria-controls={resultsId} />
    <div className={`search-collapse ${expanded ? 'is-open' : ''}`} inert={!expanded} aria-hidden={!expanded} id={resultsId}>
      <div className="search-collapse-inner">
        {loading && <p className="empty compact-empty" role="status">Ищем дополнительные активы…</p>}
        {current?.offline && <p className="empty compact-empty" role="status">Показан встроенный каталог. Расширенный поиск временно недоступен.</p>}
        {query && !loading && results.length === 0 && <p className="empty compact-empty">Не найдено. Введите тикер и цену в форме сделки.</p>}
        {results.length > 0 && <ul className="search-results" aria-label="Найденные активы">
          {results.map(r => <li key={r.symbol}><button type="button"
            onPointerDown={event => {
              if (!event.isPrimary || event.button !== 0) return;
              suppressClick.current = false;
              press.current = { id: event.pointerId, symbol: r.symbol, x: event.clientX, y: event.clientY, moved: false };
              // Keep delivery on this result even if the keyboard or remote
              // search results change the layout before the finger is lifted.
              event.currentTarget.setPointerCapture(event.pointerId);
              if (event.pointerType === 'mouse') event.preventDefault();
            }}
            onPointerMove={event => {
              const start = press.current;
              if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) start.moved = true;
            }}
            onPointerCancel={() => { press.current = null; suppressClick.current = true; }}
            onLostPointerCapture={() => { press.current = null; }}
            onPointerUp={event => {
              const start = press.current;
              press.current = null;
              suppressClick.current = true;
              if (start?.id !== event.pointerId || start.symbol !== r.symbol || start.moved) return;
              if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
              // Apply selection before Safari's optional/delayed click event.
              select(r);
            }}
            onClick={event => {
              if (event.detail === 0 || !suppressClick.current) select(r);
            }}>
            <span className="sym">{r.symbol}</span><span className="name">{r.name}</span>
          </button></li>)}
        </ul>}
      </div>
    </div>
    {selected && <div className="selected-asset" key={selected.symbol}>
      <span className="selection-check" aria-hidden="true">✓</span>
      <div role="status"><strong>{selected.symbol} выбран</strong><span>{selected.name}</span></div>
      <button type="button" className="selection-change" onClick={() => {
        selectionApplied.current = false; suppressClick.current = false;
        setSelected(null); setQ(''); setRemote(null); setOpen(true); input.current?.focus();
      }}>Изменить</button>
    </div>}
  </section>;
}
