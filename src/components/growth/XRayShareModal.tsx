import { useEffect, useRef, useState } from 'react';
import { trackEvent } from '../../analytics/events';
import { sanitizeShareData, type ShareMetric } from './shareData';
import './growth.css';

interface Props {
  metrics: ShareMetric[];
  insights: string[];
  onClose: () => void;
  userId: string;
}

export function XRayShareModal({ metrics, insights, onClose, userId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);
  const safe = sanitizeShareData(metrics, insights);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const size = 1080;
    canvas.width = size;
    canvas.height = size;
    const dark = document.documentElement.dataset.theme === 'dark';
    const bg = dark ? '#101318' : '#f5f6f8';
    const card = dark ? '#191e25' : '#ffffff';
    const ink = dark ? '#f1f3f6' : '#151920';
    const muted = dark ? '#9aa4b2' : '#667080';
    context.fillStyle = bg; context.fillRect(0, 0, size, size);
    context.fillStyle = card; context.beginPath(); context.roundRect(56, 56, 968, 968, 36); context.fill();
    context.fillStyle = '#5d7ff2'; context.beginPath(); context.roundRect(104, 112, 52, 52, 14); context.fill();
    context.fillStyle = '#fff'; context.font = '700 34px system-ui'; context.fillText('a', 122, 150);
    context.fillStyle = ink; context.font = '600 38px system-ui'; context.fillText('assetmind', 176, 151);
    context.fillStyle = muted; context.font = '600 22px system-ui'; context.fillText('PORTFOLIO X-RAY', 104, 236);
    context.fillStyle = ink; context.font = '700 46px system-ui'; context.fillText('Внутри портфеля', 104, 300);
    context.fillStyle = muted; context.font = '22px system-ui';
    context.fillText(`Анализ на ${new Intl.DateTimeFormat('ru-RU').format(new Date())}`, 104, 342);
    const columns = 2;
    const cellW = 414, cellH = 116, startY = 390;
    safe.metrics.slice(0, 6).forEach((metric, index) => {
      const x = 104 + (index % columns) * 438;
      const y = startY + Math.floor(index / columns) * (cellH + 18);
      context.fillStyle = dark ? '#222832' : '#f0f2f5'; context.beginPath(); context.roundRect(x, y, cellW, cellH, 18); context.fill();
      context.fillStyle = muted; context.font = '20px system-ui'; context.fillText(metric.label, x + 22, y + 38);
      context.fillStyle = ink; context.font = '700 32px system-ui'; context.fillText(metric.value, x + 22, y + 82);
    });
    const insightsY = startY + Math.ceil(Math.min(safe.metrics.length, 6) / 2) * (cellH + 18) + 22;
    context.fillStyle = ink; context.font = '700 22px system-ui'; context.fillText('Наблюдения', 104, insightsY + 16);
    context.fillStyle = muted; context.font = '20px system-ui';
    safe.insights.forEach((line, index) => context.fillText(`• ${line}`.slice(0, 84), 104, insightsY + 60 + index * 34));
    context.fillStyle = muted; context.font = '18px system-ui'; context.fillText('Portfolio analytics by AssetMind', 104, 968);
    context.fillText('Иллюстративный анализ, не инвестиционная рекомендация', 104, 994);
  }, [safe.insights, safe.metrics]);

  const download = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Image unavailable');
      const file = new File([blob], 'assetmind-portfolio-xray.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: 'Portfolio X-Ray · AssetMind' });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
        URL.revokeObjectURL(url);
      }
      trackEvent('share_xray_completed', { metricCount: safe.metrics.length }, userId);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      const canvas = canvasRef.current;
      if (canvas) {
        const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = 'assetmind-portfolio-xray.png'; link.click();
        trackEvent('share_xray_completed', { metricCount: safe.metrics.length }, userId);
      }
    } finally { setBusy(false); }
  };

  return <div className="growth-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="growth-share-modal" role="dialog" aria-modal="true" aria-labelledby="xray-share-title">
      <header><div><span className="eyebrow">PORTFOLIO X-RAY</span><h2 id="xray-share-title">Поделиться карточкой</h2></div><button className="btn btn-ghost" aria-label="Закрыть" onClick={onClose}>×</button></header>
      <p className="caption">Публикуются только процентные показатели и обезличенные наблюдения. Стоимость и операции исключены.</p>
      <div className="growth-share-preview"><canvas ref={canvasRef} aria-label="Предпросмотр карточки Portfolio X-Ray" /></div>
      <div className="growth-share-actions"><button className="btn btn-primary" disabled={busy} onClick={() => void download()}>{busy ? 'Подготовка…' : 'Сохранить или отправить PNG'}</button><button className="btn btn-ghost" onClick={onClose}>Закрыть</button></div>
    </section>
  </div>;
}
