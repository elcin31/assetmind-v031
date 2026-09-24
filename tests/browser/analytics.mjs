// Isolated fixtures only: no login, live accounts, or production writes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH || "playwright"
);
const server = process.env.ANALYTICS_TEST_URL
  ? null
  : spawn(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        "5184",
        "--strictPort",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
let browser;
try {
  if (server)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error("Vite startup timeout")),
        20000,
      );
      server.stdout.on("data", (d) => {
        if (d.toString().includes("Local:")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      server.on("exit", (code) => {
        clearTimeout(timeout);
        reject(Error(`Vite exited ${code}`));
      });
    });
  browser = await chromium.launch({
    ...(process.env.BROWSER_EXECUTABLE
      ? { executablePath: process.env.BROWSER_EXECUTABLE }
      : {}),
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const base = process.env.ANALYTICS_TEST_URL || "http://127.0.0.1:5184";
  const symbols = [
    "AAPL",
    "MSFT",
    "NVDA",
    "AMD",
    "GOOG",
    "META",
    "TSLA",
    "SPY",
    "QQQ",
    "DIA",
    "IWM",
  ];
  const histories = new Map(
    symbols.map((symbol, j) => {
      let close = 100 + j * 20;
      const bars = [];
      for (let day = 0; day < 1000; day++) {
        const date = new Date(Date.UTC(2024, 0, 2 + day));
        if (date.toISOString().slice(0, 10) > "2026-09-24") break;
        if (![0, 6].includes(date.getUTCDay())) {
          close *= 1 + Math.sin(day * 0.43 + j) * 0.016 + 0.0005;
          bars.push({ date: date.toISOString().slice(0, 10), close });
        }
      }
      return [symbol, bars];
    }),
  );
  async function open(mode = "") {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-09-24T12:00:00Z") });
    const errors = [];
    const requests = new Map();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (e) => {
      if (
        e.type() === "error" &&
        !e.text().includes("Failed to load resource") &&
        e.text() !==
          "[AssetMind Auth] Authentication is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
      )
        errors.push(e.text());
    });
    await page.route("**/api/history?*", (route) => {
      const query = new URL(route.request().url()).searchParams;
      const symbol = query.get("symbol");
      requests.set(symbol, (requests.get(symbol) || 0) + 1);
      if (
        (mode === "benchmark" && symbol === "SPY") ||
        (mode === "history" && symbol === "MSFT")
      )
        return route.fulfill({
          status: 502,
          json: { code: "PROVIDER_UNAVAILABLE" },
        });
      const bars = histories.get(symbol) || [];
      return route.fulfill({
        json: {
          symbol,
          period: query.get("period"),
          bars,
          valuationBars: bars,
          valuationPriceType: "raw_close",
          splits: [],
        },
      });
    });
    await page.route("**/api/quote?*", (route) =>
      route.fulfill({
        json: {
          symbol: new URL(route.request().url()).searchParams.get("symbol"),
          price: 150,
        },
      }),
    );
    await page.goto(
      `${base}/tests/browser/analytics-fixture.html?mode=${mode}`,
    );
    await page
      .getByRole("heading", { name: "Портфель и рынок", exact: true })
      .waitFor();
    await page.waitForFunction(
      () => !document.body.innerText.includes("Загружаем историю"),
    );
    return { page, context, errors, requests };
  }
  async function healthy(page, label) {
    assert.equal(await page.locator("vite-error-overlay").count(), 0, label);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `${label}: page overflow`,
    );
    assert(
      !/NaN|Infinity/.test(await page.locator("body").innerText()),
      `${label}: finite UI`,
    );
    assert(
      await page
        .locator(".overview-page")
        .evaluate((el) =>
          [...el.querySelectorAll(".overview-value,dd,strong,b")].every(
            (n) =>
              n.scrollWidth <= n.clientWidth + 1 ||
              getComputedStyle(n).display === "inline",
          ),
        ),
      `${label}: number overflow`,
    );
  }
  const current = await open();
  const { page, requests } = current;
  await page.locator(".overview-performance svg").waitFor();
  assert.equal(await page.locator(".overview-metric").count(), 4);
  assert.equal(await page.locator(".overview-holding").count(), 5);
  assert.equal(
    await page.locator(".overview-secondary .alloc-legend>span").count(),
    4,
  );
  assert.equal(await page.locator(".overview-contributor").count(), 3);
  await page.getByRole("button", { name: "Detractors", exact: true }).click();
  assert.equal(await page.locator(".overview-contributor").count(), 3);
  assert((await page.locator(".overview-insights li").count()) <= 3);
  assert(
    !/XIRR|MWR|Sortino|Current Holdings Historical Risk Proxy|Diversification Ratio/.test(
      await page.locator(".overview-page").innerText(),
    ),
  );
  assert.equal(await page.locator(".overview-page .formula").count(), 0);
  for (const width of [320, 375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await healthy(page, `Overview ${width}`);
    await page
      .getByRole("button", { name: "Лаборатория", exact: true })
      .click();
    for (const name of [
      "Доходность",
      "Риск",
      "Диверсификация",
      "Атрибуция",
      "Сценарии",
      "Рынок",
      "Данные",
    ]) {
      await page.getByRole("button", { name, exact: true }).click();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${name} ${width}: no overflow`,
      );
      assert(!/NaN|Infinity/.test(await page.locator("body").innerText()));
    }
    await page.getByRole("button", { name: "Обзор", exact: true }).click();
    await page
      .getByRole("button", { name: "Все активы →", exact: true })
      .scrollIntoViewIfNeeded();
    const button = await page
      .getByRole("button", { name: "Все активы →", exact: true })
      .boundingBox();
    const nav = await page.locator(".site-nav").boundingBox();
    if (width <= 760)
      assert(
        button.y + button.height <= nav.y,
        "navigation does not cover content",
      );
  }
  for (const period of ["1M", "3M", "6M", "YTD", "1Y", "ALL"]) {
    await page
      .getByRole("group", { name: "Период аналитики", exact: true })
      .getByRole("button", { name: period, exact: true })
      .click();
    await healthy(page, period);
  }
  assert.equal(requests.size, 8);
  assert(
    [...requests.values()].every((n) => n === 1),
    "shared history cache",
  );
  await page.getByLabel("Портфель и рынок: дата", { exact: true }).fill("20");
  for (const symbol of ["QQQ", "DIA", "IWM", "SPY"]) {
    await page.getByLabel("Эталон сравнения").selectOption(symbol);
    await page.locator(".overview-performance svg").waitFor();
    assert.equal(requests.get(symbol), 1);
  }
  for (const horizon of ["60D", "1Y", "20D"]) {
    await page
      .getByRole("group", { name: "Risk Horizon", exact: true })
      .getByRole("button", { name: horizon, exact: true })
      .click();
    assert(
      (await page.locator(".overview-metric").last().innerText()).includes(
        horizon,
      ),
    );
  }
  await page.getByRole("button", { name: "Все активы →", exact: true }).click();
  assert.equal(await page.locator(".holding-toggle").count(), 7);
  await page.locator(".holding-toggle").first().click();
  await page
    .locator(".holding-detail")
    .getByRole("heading", { name: "Цена · AAPL", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Лаборатория", exact: true }).click();
  await page
    .getByRole("heading", { name: "Capital & MWR", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Данные", exact: true }).click();
  assert.equal(await page.locator(".data-quality-card").count(), 1);
  await page.getByRole("button", { name: "Риск", exact: true }).click();
  assert((await page.locator("body").innerText()).includes("Sortino"));
  await page.getByRole("button", { name: "Сценарии", exact: true }).click();
  await page.getByLabel("Заполнить шоки сценарием").selectOption("broad");
  assert.equal(await page.getByLabel("Шок AAPL, %").inputValue(), "-15");
  await page.getByLabel("Шок AAPL, %").fill("-30");
  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  for (const [width, theme] of [
    [390, "light"],
    [1440, "light"],
    [390, "dark"],
  ]) {
    await page.setViewportSize({ width, height: 950 });
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    await page.screenshot({
      path: `/tmp/overview-${width}-${theme}.png`,
      fullPage: true,
    });
  }
  assert.deepEqual(current.errors, []);
  await current.context.close();
  for (const mode of [
    "empty",
    "incomplete",
    "benchmark",
    "history",
    "trades",
    "large",
  ]) {
    const test = await open(mode);
    for (const width of [320, 1440]) {
      await test.page.setViewportSize({ width, height: 950 });
      await healthy(test.page, `${mode} ${width}`);
    }
    if (mode === "empty") {
      assert.equal(await test.page.locator(".overview-holding").count(), 0);
      await test.page
        .getByRole("heading", { name: "Ваш портфель начинается здесь" })
        .waitFor();
    }
    if (mode === "incomplete")
      assert.equal(
        await test.page.getByTestId("portfolio-value").innerText(),
        "—",
      );
    if (["benchmark", "history", "trades"].includes(mode)) {
      assert.equal(
        await test.page.locator(".overview-performance svg").count(),
        0,
      );
      assert(
        await test.page
          .locator(".overview-performance .chart-placeholder")
          .innerText(),
      );
    }
    assert.deepEqual(test.errors, []);
    await test.context.close();
  }
  console.log(
    "PASS Overview: six widths, both themes, periods, benchmarks, risk horizons, navigation, limits, preserved analytics, empty/incomplete/unavailable states, large values, cache and no console exceptions",
  );
} finally {
  await browser?.close();
  server?.kill();
}
