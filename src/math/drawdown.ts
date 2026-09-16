import type { DrawdownEpisode, DrawdownPoint } from '../types/analytics';
import { validDate } from './statistics';
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export function drawdowns(series: DrawdownPoint[]) {
  if (!series.length || series.some((p, i) => !validDate(p.date) || !Number.isFinite(p.value) || p.value < 0 || (i > 0 && p.date <= series[i - 1].date)) || series[0].value <= 0) return null;
  let peak = series[0]; let episode: DrawdownEpisode | null = null;
  const episodes: DrawdownEpisode[] = []; const points: DrawdownPoint[] = [];
  for (const p of series) {
    const dd = p.value / peak.value - 1;
    points.push({ date: p.date, value: Math.min(0, dd) });
    if (p.value >= peak.value) {
      if (episode) { episode.recoveryDate = p.date; episode.duration = days(episode.startDate, p.date); episode.recoveryDuration = days(episode.bottomDate, p.date); episodes.push(episode); episode = null; }
      peak = p;
    } else {
      if (!episode) episode = { startDate: p.date, bottomDate: p.date, recoveryDate: null, duration: 0, recoveryDuration: null, depth: dd };
      if (dd < episode.depth) { episode.depth = dd; episode.bottomDate = p.date; }
      episode.duration = days(episode.startDate, p.date);
    }
  }
  if (episode) episodes.push(episode);
  return { points, episodes, max: Math.min(...points.map(p => p.value)), current: points.at(-1)!.value,
    longest: episodes.length ? Math.max(...episodes.map(e => e.duration)) : 0,
    currentDuration: episode?.duration ?? 0, recoveryTime: episodes.filter(e => e.recoveryDuration !== null).at(-1)?.recoveryDuration ?? null };
}
