// End-to-end: phone with no account (copy & paste Claude, offline, telematics), then sign-in sync
// to a laptop that reads through the psr function, deletes sync back, and a missing function
// falls back to copy & paste.   node tests/e2e.js
const { chromium } = require('playwright');
const { reply } = require('../dev/mock.js');
const APP = 'http://localhost:8797/psr/', CTL = 'http://localhost:8798/__ctl';
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('  ok -', m); };
const ctl = q => fetch(CTL + (q || '')).then(r => r.json());

async function answer(page) {          // copy & paste dialog: paste the canned Claude reply back
  await page.waitForSelector('#ask[open]');
  const prompt = await page.inputValue('#ask-prompt');
  await page.fill('#ask-reply', 'Here you go:\n```json\n' + JSON.stringify(reply(prompt)) + '\n```');
  await page.click('#ask-use');
  await page.waitForSelector('#ask[open]', { state: 'detached' });
  return prompt;
}
async function signIn(page, up) {
  await page.click('nav [data-tab=set]');
  await page.fill('#a-email', 'tech@example.com'); await page.fill('#a-pass', 'pickle-pass-1');
  await page.click(up ? '#a-up' : '#a-in');
  await page.waitForSelector('#a-out');
}
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };

(async () => {
  const b = await chromium.launch();
  console.log('Phone, no account');
  const phone = await b.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });
  const p = await phone.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(APP); await p.waitForSelector('#store b');
  ok(/Saved on this device/.test(await p.textContent('#store')), 'starts saving on the device');
  await p.fill('#t-comp', 'Loses power intermittently, worse when hot');
  await p.fill('#t-text', '168-4 active, count 3, first 1210 h, last 1288 h');
  await p.click('#t-go');
  const prompt = await answer(p);
  ok(/168-4/.test(prompt) && /SHOP DIAGNOSTIC REFERENCE/.test(prompt) && /Product Status Report/.test(prompt), 'prompt carries codes, reference and PSR wording');
  await p.waitForSelector('#v-diag:not([hidden]) .next');
  ok(/259D3/.test(await p.textContent('#d-ed h3')), 'model filled from the reading');
  ok(/Measure charging voltage at high idle/.test(await p.textContent('.next .q')), 'ordered check shown');
  ok(await p.locator('.gz').count() === 2, 'hypothesis readouts shown');
  await p.click('[data-res=fail]'); await p.fill('#s-val', '12.1 V at the battery'); await p.click('#s-go');
  await answer(p);
  await p.waitForSelector('.concl');
  ok(/Alternator not charging/.test(await p.textContent('.concl')), 'step result isolates the cause');

  // a saved PSR as PDF: text is pulled on the device and sent with the prompt
  const pdfPage = await b.newPage(); await pdfPage.setContent('<h1>Product Status Report</h1><p>Serial FTL01234 SMU 1288</p><table><tr><td>168-4</td><td>System Voltage Low</td><td>Active</td></tr><tr><td>E0360</td><td>Low Engine Oil Pressure</td><td>Logged</td></tr></table>');
  const pdf = await pdfPage.pdf(); await pdfPage.close();
  await p.click('nav [data-tab=triage]');
  await p.setInputFiles('#t-file', { name: 'FTL01234-psr.pdf', mimeType: 'application/pdf', buffer: pdf });
  await p.click('#t-go');
  const pprompt = await answer(p);
  ok(/E0360/.test(pprompt) && /System Voltage Low/.test(pprompt), 'PDF report read on the device into the prompt');
  await p.click('#d-del'); await p.click('#d-del');
  await p.click('nav [data-tab=telem]');
  await p.click('#v-telem details summary');
  await p.fill('#tm-paste', 'Serial Number,Fault Code,Description,Date,Hour Meter\nFTL01234,168-4,System voltage low,2026-11-01,1250\nFTL01234,168-4,System voltage low,2026-11-03,1270');
  await p.click('#tm-pgo'); await p.waitForSelector('#tm-imp'); await p.click('#tm-imp');
  ok(/2 new fault events across 1 machine/.test(await p.textContent('#tm-msg')), 'telematics CSV imported');

  await p.reload(); await p.waitForSelector('#t-recent .item');
  ok(/259D3/.test(await p.textContent('#t-recent')), 'case survives a reload (IndexedDB)');
  ok(await p.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active)), 'service worker active');
  const man = await p.evaluate(() => fetch('manifest.webmanifest').then(r => r.json()));
  ok(man.display === 'standalone' && man.icons.some(i => i.purpose === 'maskable'), 'manifest is installable');
  await phone.setOffline(true); await p.reload(); await p.waitForSelector('#t-recent .item');
  ok(/Offline|Saved on this device/.test(await p.textContent('#store')), 'opens with no signal');
  await phone.setOffline(false);

  console.log('Phone signs in, uploads');
  // iPhone Safari can report offline while connected: sync must not trust navigator.onLine
  await p.evaluate(() => Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false, configurable: true }));
  await signIn(p, true);
  const pushed = await until(async () => (await ctl()).docs.filter(d => !d.deleted).length === 2 && (await ctl()).docs.length === 3);
  if (!pushed) console.log('    DIAG server', JSON.stringify((await ctl()).docs), '| store:', await p.textContent('#store'), '| title:', await p.getAttribute('#store', 'title'), '| set:', (await p.textContent('#set-ed')).replace(/\s+/g, ' ').slice(0, 300));
  ok(pushed, 'case, telematics and one deletion pushed to the account');
  ok(await until(async () => /Synced/.test(await p.textContent('#store'))), 'status says synced');

  console.log('Laptop, same account, Claude through the function');
  const lap = await b.newContext({ viewport: { width: 1366, height: 820 } });
  const l = await lap.newPage(); l.on('pageerror', e => errs.push(e.message));
  await l.goto(APP); await signIn(l, false);
  await l.click('nav [data-tab=triage]');
  ok(await until(async () => /259D3/.test(await l.textContent('#t-recent'))), 'phone case appears on the laptop');
  await l.click('nav [data-tab=hist]'); await l.click('#h-list [data-ser]');
  ok(/Telematics/.test(await l.textContent('#h-ed')), 'machine record shows synced telematics');
  await l.click('nav [data-tab=triage]');
  await l.fill('#t-model', '299D3'); await l.fill('#t-text', 'E0360 level 2 low oil pressure');
  await l.click('#t-go'); await l.waitForSelector('#v-diag:not([hidden]) .next');
  ok(!(await l.isVisible('#ask')), 'no copy & paste when the function answers');
  let s = await ctl(); ok(s.asks === 1, 'read went through the psr function');
  await l.click('#d-draft'); await l.waitForSelector('#dr-out');
  ok(/Product Status Report/.test(await l.textContent('#dr-out')), 'work order entry drafted');
  ok((await ctl()).asks === 2, 'draft went through the function');

  console.log('Delete on laptop reaches the phone');
  await l.click('#d-del'); await l.click('#d-del');
  await p.evaluate(() => dispatchEvent(new Event('online')));
  ok(await until(async () => { await p.evaluate(() => dispatchEvent(new Event('online'))); await p.click('nav [data-tab=triage]'); return (await p.locator('#t-recent .item').count()) === 1; }, 10000), 'deleted case leaves the phone, the other stays');

  console.log('Key not added yet: copy & paste, then automatic once it is');
  await ctl('?key=off');
  await l.click('nav [data-tab=triage]'); await l.fill('#t-text', '168-4 active'); await l.click('#t-go');
  await l.waitForSelector('#ask[open]');
  ok(/Claude key not added/.test(await l.textContent('#ask-why')), 'missing key explained in the copy & paste box');
  await answer(l); await l.waitForSelector('#v-diag:not([hidden]) .next');
  ok(true, 'read still completes by copy & paste');
  await l.click('#d-del'); await l.click('#d-del');
  await ctl('?key=on'); const before = (await ctl()).asks;
  await l.click('nav [data-tab=triage]'); await l.fill('#t-text', '168-4 active'); await l.click('#t-go');
  await l.waitForSelector('#v-diag:not([hidden]) .next');
  ok((await ctl()).asks === before + 1 && !(await l.isVisible('#ask')), 'switches back to automatic once the key exists, no setting to change');
  await l.click('#d-del'); await l.click('#d-del');
  console.log('Function missing falls back to copy & paste');
  await ctl('?fn=off');
  await l.click('nav [data-tab=triage]'); await l.fill('#t-text', '41-3 logged'); await l.click('#t-go');
  await answer(l);
  ok(/Copy &amp; paste|Copy & paste/.test(await (async () => { await l.click('nav [data-tab=set]'); return l.innerHTML('#set-ed'); })()), 'settings explain the fallback');

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); console.log('ALL PASSED'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
