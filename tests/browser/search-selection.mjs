// Optional browser regression: install Playwright, then run from the repo root:
// npm install --no-save --package-lock=false playwright && npx playwright install chromium
// node tests/browser/search-selection.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5183','--strictPort'],{stdio:['ignore','pipe','pipe']});
await new Promise((r,j)=>{server.stdout.on('data',d=>{if(d.toString().includes('Local:'))r()});server.on('exit',c=>j(Error('Server exited '+c)))});
const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),args:['--no-sandbox','--disable-gpu'],headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/search?*',r=>r.fulfill({json:{results:[{symbol:'XYZ',name:'Remote-only asset'}]}}));
 await page.route('**/api/quote?*',r=>r.fulfill({json:{symbol:new URL(r.request().url()).searchParams.get('symbol'),price:123.45}}));
 await page.route('**/api/history?*',r=>{const q=new URL(r.request().url()).searchParams;return r.fulfill({json:{symbol:q.get('symbol'),period:q.get('period'),bars:[{date:'2026-09-01',close:100},{date:'2026-09-02',close:110}]}})});
 await page.goto('http://127.0.0.1:5183/tests/browser/fixture.html');
 await page.getByRole('button',{name:'Сделки',exact:true}).click();
 const search=page.getByRole('searchbox');
 for(const [query,symbol] of [['p','PLTR'],['apple','AAPL'],['micro','MSFT'],['nvid','NVDA'],['berk','BRK.B'],['xyz','XYZ']]){
  if(await page.getByRole('button',{name:'Изменить',exact:true}).count())await page.getByRole('button',{name:'Изменить',exact:true}).click();
  await search.fill(query);
  const result=page.locator('.search-results button').filter({has:page.locator('.sym',{hasText:new RegExp('^'+symbol.replace('.','\\.')+'$')})});
  await result.waitFor();await page.waitForTimeout(400);
  // Reproduce touch focus leaving the input plus a missing synthesized click.
  await page.evaluate(()=>{
   document.addEventListener('click',event=>{if(event.target.closest('.search-results'))event.stopImmediatePropagation()}, {capture:true,once:true});
   document.querySelector('.search-results').addEventListener('pointerdown',()=>{
    document.querySelector('input[type=search]').blur();
    const body=document.body;body.tabIndex=-1;body.focus();
   },{once:true});
  });
  await result.tap();
  assert.equal(await search.inputValue(),symbol,`query must become ${symbol}`);
  assert.equal(await page.locator('form input').first().inputValue(),symbol);
  await page.getByRole('heading',{name:`Цена · ${symbol}`,exact:true}).waitFor();
  await page.locator('.price-plot').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('form input')].some(input => input.value === '123.45'));
  assert.equal(await search.getAttribute('aria-expanded'),'false');
  console.log(`PASS ${query} -> ${symbol}: selection, form ticker and chart`);
 }
 await page.getByRole('button',{name:'Изменить',exact:true}).click();await search.fill('p');await page.waitForTimeout(450);
 const first=page.locator('.search-results button').first();const box=await first.boundingBox();
 await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.mouse.move(box.x+20,box.y+65);await page.mouse.up();
 assert.equal(await page.locator('.selected-asset').count(),0,'drag must not select');
 await first.focus();await page.keyboard.press('Enter');await page.locator('.selected-asset').waitFor();
 assert.deepEqual(errors,[]);console.log('PASS drag cancellation, keyboard selection, no uncaught errors');
}finally{await browser.close();server.kill();}
