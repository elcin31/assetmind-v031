// Optional browser verification. Run against npm run dev -- --port 5184.
// PLAYWRIGHT_MODULE_PATH and BROWSER_EXECUTABLE may point at runtime-owned tools.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
if (server)
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (d) => {
      if (d.toString().includes("Local:")) resolve();
    });
    server.on("exit", (code) => reject(Error("Vite exited " + code)));
  });
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH || "playwright"
);
const browser = await chromium.launch({
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : {}),
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const base = process.env.ANALYTICS_TEST_URL || "http://127.0.0.1:5184";
const histories = new Map();
for (const [j, symbol] of [
  "AAPL",
  "MSFT",
  "NVDA",
  "SPY",
  "QQQ",
  "DIA",
  "IWM",
].entries()) {
  const bars = [];
  let close = 100 + j * 20;
  for (let day = 0; day < 1000; day++) {
    const date = new Date(Date.UTC(2024, 0, 2 + day));
    if (date.toISOString().slice(0, 10) > "2026-09-15") break;
    if (![0, 6].includes(date.getUTCDay())) {
      close *= 1 + Math.sin(day * 0.43 + j) * 0.016 + 0.0005;
      bars.push({ date: date.toISOString().slice(0, 10), close });
    }
  }
  histories.set(symbol, bars);
}
async function open(mode = "", failure = false) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  const requests = new Map();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error" && !e.text().includes("Failed to load resource"))
      errors.push(e.text());
  });
  await page.route("**/api/history?*", async (route) => {
    const q = new URL(route.request().url()).searchParams;
    const symbol = q.get("symbol");
    const period = q.get("period");
    const key = `${symbol}:${period}`;
    requests.set(key, (requests.get(key) || 0) + 1);
    if (failure && symbol === "MSFT")
      return route.fulfill({
        status: 502,
        json: { error: "Provider unavailable" },
      });
    return route.fulfill({
      json: { symbol, period, bars: histories.get(symbol) || [] },
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
  await page.goto(`${base}/tests/browser/analytics-fixture.html?mode=${mode}`);
  await page
    .getByRole("heading", {
      name: "Историческая стоимость активов",
      exact: true,
    })
    .waitFor();
  await page.waitForFunction(
    () => !document.body.innerText.includes("Загружаем историю"),
  );
  return { context, page, errors, requests };
}
async function healthy(page, label) {
  assert.equal(
    await page.locator("vite-error-overlay").count(),
    0,
    `${label}: no overlay`,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
    `${label}: no horizontal page overflow`,
  );
  assert.equal(
    await page
      .locator("body")
      .innerText()
      .then((t) => /NaN|Infinity/.test(t)),
    false,
    `${label}: finite metrics`,
  );
}
try {
  const { page, context, errors, requests } = await open();
  await page.locator(".portfolio-history svg").waitFor();
  for (const width of [320, 375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await healthy(page, `overview ${width}`);
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
    ]) {
      await page.getByRole("button", { name, exact: true }).click();
      await healthy(page, `${name} ${width}`);
    }
    await page.getByRole("button", { name: "Обзор", exact: true }).click();
  }
  assert.equal(requests.size, 4);
  assert(
    [...requests.values()].every((n) => n === 1),
    "all analytics reuse one request per symbol",
  );
  for (const period of ["1M", "3M", "6M", "YTD", "1Y", "ALL"]) {
    await page.getByRole("button", { name: period, exact: true }).click();
    await healthy(page, period);
  }
  assert.equal(requests.size, 4, "period switches reuse history");
  await page
    .getByLabel("Историческая стоимость активов: дата", { exact: true })
    .fill("20");
  await page.getByLabel("Эталон сравнения").selectOption("QQQ");
  await page.waitForFunction(
    () => !document.body.innerText.includes("Загружаем историю"),
  );
  assert.equal(requests.get("QQQ:5y"), 1);
  await page.getByRole("button", { name: "Активы", exact: true }).click();
  await page.locator(".holding-toggle").first().click();
  await page
    .locator(".holding-detail")
    .getByRole("heading", { name: "Цена · AAPL", exact: true })
    .waitFor();
  await healthy(page, "holding detail");
  await page.getByRole("button", { name: "Лаборатория", exact: true }).click();
  await page.getByRole("button", { name: "Сценарии", exact: true }).click();
  await page.getByLabel("Заполнить шоки сценарием").selectOption("broad");
  assert.equal(await page.getByLabel("Шок AAPL, %").inputValue(), "-15");
  await page.getByLabel("Шок AAPL, %").fill("-30");
  await healthy(page, "custom scenario");
  await page
    .getByRole("button", { name: "Диверсификация", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/assetmind-diversification-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  await page.screenshot({
    path: "/tmp/assetmind-overview-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "/tmp/assetmind-overview-desktop.png",
    fullPage: true,
  });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({
    path: "/tmp/assetmind-overview-dark.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "PASS 6 widths, all tabs, all periods, benchmark switch, shared requests, touch scrubber, holdings, scenarios, finite UI, no console exceptions",
  );
  for (const [mode, failure] of [
    ["empty", false],
    ["trades", false],
    ["", true],
  ]) {
    const current = await open(mode, failure);
    await healthy(current.page, mode || "provider error");
    if (mode === "trades")
      assert(
        (await current.page.locator("body").innerText()).includes(
          "BUY/SELL не определяют",
        ),
      );
    if (failure)
      assert(
        (await current.page.locator("body").innerText()).includes(
          "MSFT: Ошибка поставщика",
        ),
      );
    assert.deepEqual(current.errors, []);
    await current.context.close();
  }
  console.log("PASS empty, unknown flows, partial data and provider error");
} finally {
  await browser.close();
  server?.kill();
}
