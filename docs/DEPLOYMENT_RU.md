# Production deployment — AssetMind

## Единственная production-цель

- Репозиторий: `elcin31/assetmind-v031`
- Production branch: `main`
- Vercel project: `assetmind-v031-mpsk`
- Vercel project ID: `prj_0OQTvpMdNFAJFm2Ty0o536nHR7Qx`
- Постоянный URL: `https://assetmind-v031-mpsk.vercel.app`
- Runtime/build Node major: `24`

Не создавайте новый Vercel project, не деплойте в `assetmind-v031` и не создавайте копии вида `assetmind-v031-xxxx`. Production должен обновляться только в существующем `assetmind-v031-mpsk`.

## Хранение и авторизация

Supabase используется для Auth и как каноническое cloud-хранилище пользовательского портфеля, когда он настроен. Валидированный `localStorage` остаётся локальным кэшем/offline fallback и используется для безопасной миграции старых данных. Это не localStorage-only архитектура.

Обязательные browser env:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

`service_role` и другие секретные Supabase-ключи нельзя публиковать через `VITE_*`.

Server-only market-data env:

- `FINNHUB_API_KEY`

Finnhub используется для поиска и текущих котировок. Исторические данные для аналитики в текущей реализации загружаются через server-side market-data abstraction и нормализуются перед расчётами.

## Проверка перед merge/deploy

```bash
npm ci
npm run verify
```

`verify` обязан пройти typecheck, unit tests, lint без warnings и production build. CI должен использовать тот же major Node, что и production.

После preview/deploy проверьте минимум:

```text
GET /
GET /api/search?q=AAPL
GET /api/quote?symbol=AAPL
GET /api/history?symbol=AAPL&period=1m
```

Ожидается HTTP 200 для доступного провайдера/тикера. Для history дополнительно проверьте `meta.sorted = true`, `duplicateDates = 0` и непустой массив `bars`.

## Пользовательский smoke test

1. Войти существующим аккаунтом.
2. Обновить страницу и убедиться, что session восстановилась.
3. Найти тикер и выбрать результат.
4. Добавить BUY-транзакцию.
5. Обновить страницу и убедиться, что сделка сохранилась.
6. Проверить Overview, Holdings, Laboratory и переключение risk horizon `20D / 60D / 1Y`.
7. Выйти и войти повторно: cloud-портфель должен восстановиться.
8. Проверить Export backup и отсутствие ошибок в browser console/Vercel runtime logs.

## Правила данных

- Не подставлять `0` вместо unavailable.
- Не выдавать `Current Holdings Historical Risk Proxy` за фактическую историю портфеля.
- Performance-метрики должны строиться на transaction-aware истории.
- При недостатке данных UI должен показывать unavailable/причину, а не выдуманное число.
