import { useEffect, useRef, useState } from 'react';
import { searchInstruments } from '../data/instruments';

/** Preserve qualified tickers; never strip an international listing suffix. */
function tradingViewSymbol(symbol: string): string {
  const known = searchInstruments(symbol).find(item => item.symbol === symbol);
  return known?.exchange ? `${known.exchange}:${symbol}` : symbol;
}

export function TradingViewChart({ symbol, period }: { symbol: string; period: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const ticker = tradingViewSymbol(symbol);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let cleanup = () => {};
    const render = () => {
      cleanup();
      const wrapper = document.createElement('div');
      wrapper.className = 'tradingview-widget-container';
      const target = document.createElement('div');
      target.className = 'tradingview-widget-container__widget';
      wrapper.append(target);
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      script.async = true;
      script.textContent = JSON.stringify({
        autosize: true, symbol: ticker, interval: 'D', timezone: 'Etc/UTC',
        theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
        style: '3', locale: 'ru', allow_symbol_change: false, calendar: false,
        hide_side_toolbar: true, hide_top_toolbar: true, save_image: false,
        range: ({ '1m': '1M', '3m': '3M', '6m': '6M', '1y': '12M', '5y': '60M' } as Record<string, string>)[period],
        support_host: 'https://www.tradingview.com',
      });
      let active = true;
      script.onerror = () => { if (active) setFailed(true); };
      const timer = window.setTimeout(() => { if (active && !wrapper.querySelector('iframe')) setFailed(true); }, 15000);
      wrapper.append(script);
      element.replaceChildren(wrapper);
      cleanup = () => { active = false; window.clearTimeout(timer); script.onerror = null; wrapper.remove(); };
    };
    render();
    const observer = new MutationObserver(render);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { observer.disconnect(); cleanup(); };
  }, [ticker, period]);
  return <div className="chart-fallback">
    <p className="caption">График TradingView · данные могут поступать с задержкой.</p>
    <div ref={host} className="tradingview-host" hidden={failed} aria-label={`График TradingView: ${symbol}`} />
    {failed && <p className="empty" role="status">Не удалось загрузить график. Проверьте соединение или откройте его по ссылке ниже.</p>}
    <a className="caption" href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(ticker)}`} target="_blank" rel="noopener noreferrer">{symbol} на TradingView ↗</a>
  </div>;
}
