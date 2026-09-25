export const definitions = {
  totalReturn: [
    'Доходность за период',
    'Π(1 + rₜ) − 1',
    'Связанная доходность только по непрерывной performance-серии. Исторические цены используют adjusted close, поэтому корпоративные действия и dividend adjustments отражаются в рыночном ряду; cash ledger портфеля при этом не выдумывается.',
  ],
  twr: [
    'TWR',
    'Π(1 + r_subperiod) − 1',
    'Без внешних потоков совпадает с накопленной доходностью. BUY/SELL без отдельного cash ledger загрязняют соответствующий интервал, поэтому TWR через такой разрыв недоступен.',
  ],
  cagr: [
    'CAGR',
    '(1 + R)^(365.25 / days) − 1',
    'Геометрическая годовая доходность только из непрерывной cumulative performance series. Минимум 30 календарных дней.',
  ],
  sharpe: [
    'Sharpe',
    'Rf_d=(1+Rf_ann)^(1/252)−1; 252×mean(r−Rf_d)/σ_ann',
    'Средняя дневная excess return относительно эквивалентной дневной безрисковой ставки на единицу годовой волатильности. Минимум 20 чистых return-интервалов.',
  ],
  sortino: [
    'Sortino',
    'MAR_d=(1+MAR_ann)^(1/252)−1; 252×mean(r−MAR_d)/σ_down_ann',
    'Excess return относительно дневного MAR на единицу downside-риска. Нужно минимум 20 чистых return-интервалов и достаточная downside-выборка.',
  ],
  calmar: [
    'Calmar',
    'CAGR / |Max DD|',
    'Доходность относительно максимальной просадки actual performance index. Если CAGR недоступен из-за trade/gap разрыва, Calmar тоже недоступен.',
  ],
  volatility: [
    'Волатильность · год',
    'stdev_sample(r) × √252',
    'Выборочное стандартное отклонение чистых однодневных return-интервалов. Минимум 20 наблюдений; загрязнённые интервалы не заменяются нулём.',
  ],
  downside: [
    'Downside deviation',
    '√mean_{r<MAR_d}((r−MAR_d)²) × √252',
    'RMS только по downside-наблюдениям относительно эквивалентного дневного MAR. Требуются минимум 20 общих returns и достаточная downside-выборка.',
  ],
  var95: [
    'VaR 95% · день',
    'max(0, −r₍ceil(.05n)₎)',
    'Эмпирический порог дневного убытка по чистым наблюдаемым returns. Минимум 20 наблюдений; хвост малой выборки нестабилен.',
  ],
  es95: [
    'Expected Shortfall · день',
    'max(0, −mean(worst ceil(.05n) returns))',
    'Средняя потеря в худшем историческом 5% хвосте чистых наблюдений. Не ограничивает будущие потери.',
  ],
  maxDrawdown: [
    'Максимальная просадка',
    'minₜ(Wₜ / maxₛ≤ₜ Wₛ − 1)',
    'Просадка рассчитывается по источнику, указанному в подписи метрики: actual transaction-aware performance или отдельному historical current-holdings proxy. Эти ряды не смешиваются.',
  ],
  currentDrawdown: [
    'Текущая просадка',
    'W_last / max(W) − 1',
    'Отклонение последнего значения ряда от максимума. Источник и период явно указаны в подписи метрики.',
  ],
  bestDay: [
    'Лучший день',
    'max(r_daily)',
    'Максимальная чистая дневная рыночная доходность. Trade/gap интервалы исключены.',
  ],
  worstDay: [
    'Худший день',
    'min(r_daily)',
    'Минимальная чистая дневная рыночная доходность. Trade/gap интервалы исключены.',
  ],
  positiveDays: [
    'Положительных дней',
    'count(r > 0) / n',
    'Доля чистых return-интервалов с положительной доходностью. Нулевые returns входят в знаменатель, пропуски нет.',
  ],
  negativeDays: [
    'Отрицательных дней',
    'count(r < 0) / n',
    'Доля чистых return-интервалов с отрицательной доходностью.',
  ],
  beta: [
    'Beta',
    'Cov(Rp, Rm) / Var(Rm)',
    'Чувствительность к benchmark только на интервалах, совпавших по startDate и endDate. Минимум 20 общих наблюдений и ненулевая variance benchmark.',
  ],
  alpha: [
    'Alpha · год',
    '252×[(mean(Rp)−Rf_d) − β(mean(Rm)−Rf_d)]',
    'Jensen Alpha с одной effective-annual → daily convention для Rf во всём приложении.',
  ],
  trackingError: [
    'Tracking Error · год',
    'stdev_sample(Rp − Rm) × √252',
    'Изменчивость активной доходности на строго совпавших return-интервалах. Минимум 20 общих интервалов.',
  ],
  informationRatio: [
    'Information Ratio',
    '252mean(Rp − Rm) / Tracking Error',
    'Избыточная доходность на единицу tracking error. При нулевом tracking error не определён.',
  ],
  portfolioReturn: [
    'Доходность портфеля',
    'Π(1 + Rp) − 1',
    'Только непрерывная общая performance-история с benchmark. Разрозненные чистые интервалы не compounding-уются искусственно.',
  ],
  benchmarkReturn: [
    'Доходность benchmark',
    'Π(1 + Rm) − 1',
    'Adjusted-close return benchmark на той же непрерывной цепочке интервалов.',
  ],
  activeReturn: [
    'Active Return',
    'Rₚ − Rᵦ',
    'Разница между доходностью портфеля и benchmark за один общий непрерывный период. Не annualized; не является прогнозом будущего результата.',
  ],
  benchmarkCorrelation: [
    'Correlation with Benchmark',
    'Corr(Rₚ, Rᵦ)',
    'Pearson correlation на строго общих интервалах доходности портфеля и выбранного benchmark.',
  ],
  upsideCapture: [
    'Upside Capture',
    'Rₚ | Rᵦ > 0 / Rᵦ | Rᵦ > 0',
    'Накопленная доходность портфеля относительно benchmark только на общих интервалах с положительной benchmark доходностью. Требуются минимум 20 таких интервалов.',
  ],
  downsideCapture: [
    'Downside Capture',
    'Rₚ | Rᵦ < 0 / Rᵦ | Rᵦ < 0',
    'Накопленная доходность портфеля относительно benchmark только на общих интервалах с отрицательной benchmark доходностью. Требуются минимум 20 таких интервалов.',
  ],
  diversificationRatio: [
    'Коэффициент диверсификации',
    'Σ(wᵢσᵢ) / √(wᵀΣw)',
    'Отношение взвешенного риска активов к совместному риску. Текущие рыночные веса и общая covariance sample.',
  ],
  averageCorrelation: [
    'Средняя корреляция',
    'mean(ρᵢⱼ), i < j',
    'Невзвешенное среднее уникальных пар. Минимум два актива и 20 строго общих return-интервалов.',
  ],
  hhi: [
    'Концентрация HHI',
    'Σwᵢ²',
    'Концентрация текущих рыночных весов; не учитывает корреляцию. Нужны текущие котировки всех позиций.',
  ],
  effectivePositions: [
    'Эффективных позиций',
    '1 / HHI',
    'Число равновесных позиций с той же концентрацией. Не число независимых источников риска.',
  ],
  covarianceVol: [
    'Риск текущего состава · год',
    'σp = √(wᵀΣ_ann w)',
    'Ковариационная модель с текущими рыночными весами и минимум 20 общими return-интервалами; не фактическая transaction-aware доходность.',
  ],
  pnlContribution: [
    'P&L contribution',
    'Realized P&L + Unrealized P&L',
    'Денежный результат позиции за всё время операций на существующей Weighted Average Cost модели. Не равен процентному return contribution.',
  ],
  returnContribution: [
    'Return Contribution',
    'Cᵢ = Σₜ Wₜ₋₁wᵢ,ₜ₋₁rᵢ,ₜ',
    'Связанный вклад позиции в доходность выбранного периода. Доступен только при восстановимых начальных весах и непрерывных общих позиционных returns; неизвестные сделки и cash flows не моделируются.',
  ],
  stressImpact: [
    'Stress Impact',
    'ΔV = Σᵢ(Vᵢ × shockᵢ); Impact% = Σᵢ(wᵢ × shockᵢ)',
    'Линейная гипотетическая переоценка текущих позиций. Не прогнозирует рынок и не учитывает ликвидность, динамику весов или изменение корреляций.',
  ],
  historicalReplay: [
    'Current Holdings Historical Scenario Replay',
    'Rₚ,ₜ = Σᵢ(wᵢ,today × rᵢ,ₜ)',
    'Текущие веса применяются к общим историческим доходностям активов; реальные исторические transaction quantities игнорируются. Это сценарный proxy, а не фактическая доходность transaction-aware портфеля.',
  ],
  whatIfVolatility: [
    'What-if volatility',
    '√(w_scenarioᵀΣ_window w_scenario)',
    'Текущая общая covariance matrix переоценивается с временными long-only scenario weights. Корреляции и историческая выборка при редактировании весов не изменяются.',
  ],
  efficientFrontier: [
    'Efficient Frontier · historical',
    'min wᵀΣw − λμᵀw; wᵢ≥0; Σwᵢ=1',
    'Детерминированная численная аппроксимация feasible long-only портфелей по историческим mean returns и covariance. Для near-singular Σ применяется минимальный diagonal ε, начиная с max(1e−12, max(diag(Σ))×1e−8). Maximum Historical Sharpe выбирается среди рассчитанных точек/вершин; это не непрерывная глобальная гарантия и не прогноз доходности.',
  ],
} as const;

export type MetricKey = keyof typeof definitions;
