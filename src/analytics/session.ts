const SESSION_KEY = 'assetmind.analytics.session.v1';

export function getAnalyticsSessionId(): string {
  try {
    const current = sessionStorage.getItem(SESSION_KEY);
    if (current) return current;
    const created = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return `session-${Date.now().toString(36)}`;
  }
}
