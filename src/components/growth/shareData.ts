export interface ShareMetric { label: string; value: string | null | undefined }

function safeText(value: string, max = 120): string {
  const printable = [...value].filter(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join('');
  return printable.replace(/\s+/g, ' ').trim().slice(0, max);
}

const privateContent = /[@$€£]|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i;

export function sanitizeShareData(metrics: ShareMetric[], insights: string[]) {
  const safeMetrics = metrics
    .filter(item => item.value && item.value !== '—' && item.value !== 'Недостаточно данных')
    .map(item => ({ label: safeText(item.label, 32), value: safeText(item.value!, 28) }))
    .filter(item => !privateContent.test(`${item.label} ${item.value}`));
  const safeInsights = insights.map(text => safeText(text, 110)).filter(text => text && !privateContent.test(text)).slice(0, 3);
  return { metrics: safeMetrics, insights: safeInsights };
}
