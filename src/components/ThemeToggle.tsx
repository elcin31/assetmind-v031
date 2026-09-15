import { useEffect, useState } from 'react';
import { applyTheme, readTheme, THEME_KEY } from '../theme/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const sync = () => { const next = readTheme(); applyTheme(next); setTheme(next); };
    const storage = (event: StorageEvent) => { if (event.key === THEME_KEY || event.key === null) sync(); };
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    window.addEventListener('storage', storage);
    system.addEventListener('change', sync);
    return () => { window.removeEventListener('storage', storage); system.removeEventListener('change', sync); };
  }, []);
  return <button type="button" className="btn btn-ghost theme-toggle" aria-label="Тёмная тема" aria-pressed={theme === 'dark'} onClick={() => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next); applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* Keep the in-memory setting. */ }
  }}><span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>{theme === 'dark' ? 'Светлая' : 'Тёмная'}</button>;
}
