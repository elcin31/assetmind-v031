import { useState } from 'react';
import { demoPresets } from '../../data/demoPortfolios';
import './growth.css';

export function XRayHero({ empty, onOpenXray, onDemo }: { empty: boolean; onOpenXray: () => void; onDemo: (presetId: string) => void }) {
  const [preset, setPreset] = useState('balanced-tech');
  return <section className="growth-hero">
    <div className="growth-hero-copy"><span className="eyebrow">PORTFOLIO X-RAY</span>
      <h2>Поймите, что на самом деле происходит внутри вашего портфеля.</h2>
      <p>Performance, риск, просадка, корреляции, benchmark и вклад позиций — в одном месте.</p>
      {empty && <p className="growth-empty-note">Добавьте позиции или откройте демонстрационный портфель, чтобы изучить аналитику.</p>}
    </div>
    <div className="growth-hero-actions"><button className="btn btn-primary" onClick={onOpenXray}>Открыть Portfolio X-Ray</button>
      <label className="growth-demo-action"><span>Готовый пример для изучения</span><select className="input" value={preset} aria-label="Выберите демонстрационный портфель" onChange={event => setPreset(event.target.value)}>
        {demoPresets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select><button className="btn btn-ghost" onClick={() => onDemo(preset)}>Попробовать демо-портфель</button></label>
    </div>
  </section>;
}
