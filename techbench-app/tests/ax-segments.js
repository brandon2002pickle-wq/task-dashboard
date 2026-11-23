// AX segment layout, modelled on service call SC1431949 (299D3, serial DY900892):
//   _01 070/7000 Clean - Machine, _02 540/7535 TA1, _03 035/0113 Troubleshoot - Fluids & Hydraulics.
//   node tests/ax-segments.js
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const TMP = path.join(os.tmpdir(), 'tb-ax'); fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
let ok = true; const check = (n, c, d = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : d); ok = ok && c; };

(async () => {
  const m = spawn(process.execPath, [path.join(__dirname, '..', 'dev', 'mock-supabase.js'), '8794', '8793'], { env: { ...process.env, MOCK_DB: path.join(TMP, 'db.json') }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => m.stdout.on('data', d => String(d).includes('mock api') && r()));
  const b = await chromium.launch(), p = await b.newPage({ ...devices['Pixel 7'] }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto('http://localhost:8793/');
    await p.fill('#au-email', 'ax@example.com'); await p.fill('#au-pw', 'bench-test-1'); await p.click('#au-up'); await p.waitForSelector('#h-new');
    await p.click('#h-new'); await p.waitForSelector('#f-wo');
    await p.fill('#f-wo', 'sc1431949'); await p.fill('[data-k="model"]', '299D3'); await p.fill('[data-k="serial"]', 'DY900892');
    await p.locator('[data-k="serial"]').blur(); await p.waitForTimeout(900);
    const t1 = await p.textContent('.panel h3'); check('title shows the AX service call', t1 === 'SC1431949', t1);
    // main segment becomes 070/7000 Clean - Machine
    await p.fill('[data-k="jobCode"]', '070'); await p.fill('[data-k="compCode"]', '7000'); await p.locator('[data-k="compCode"]').blur(); await p.waitForTimeout(1200);
    check('known job + component fills the AX description', (await p.inputValue('[data-k="title"]')) === 'Clean - Machine');
    check('segment id SC1431949_01', /SC1431949_01/.test(await p.textContent('.axseg')));
    check('clean is non-repair', /non-repair/.test(await p.textContent('.axseg')));
    // add the TA1 and troubleshoot lines from the picker
    await p.selectOption('#r-segadd', { label: '540 / 7535 · Perform - Technical Analysis 1 Inspection' }); await p.waitForSelector('text=SC1431949_02');
    await p.selectOption('#r-segadd', { label: '035 / 0113 · Troubleshoot - Fluids & Hydraulics' }); await p.waitForSelector('text=SC1431949_03');
    const ax = await p.textContent('.axseg');
    check('troubleshoot segment is _03 and a repair segment', /SC1431949_03/.test(ax) && !/non-repair/.test(ax) && /Troubleshoot/.test(ax));
    check('chips read 01 · 02 · 03', (await p.$$eval('[data-seg]', a => a.map(x => x.textContent.slice(0, 2)))).join() === '01,02,03');
    await p.click('#r-gen'); await p.waitForTimeout(800);
    const prompt = await p.evaluate(() => document.querySelector('#r-prompt') ? document.querySelector('#r-prompt').value : '');
    check('report prompt names the AX segment', /AX segment: SC1431949_03, job code 035, component 0113, "Troubleshoot - Fluids & Hydraulics"/.test(prompt) && /REPAIR segment/.test(prompt), prompt.slice(0, 200));
    // parts lookup reads the 8-character AX serial
    await p.click('[data-det="wo"] summary').catch(() => {});
    await p.goto(p.url().replace(/#.*/, '') + '#/');
    await p.click('[data-open]'); await p.click('details[data-det="wo"] summary').catch(() => {});
    await p.click('#j-parts'); await p.waitForSelector('#p-pinnote');
    check('parts lookup reads DY900892 as prefix DY9 → 299D3', /prefix DY9, serial 00892/.test(await p.textContent('#p-pinnote')) && /under 299D3/.test(await p.textContent('#p-pinnote')));
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check('no sideways scroll', over <= 0, over);
    check('no page errors', errs.length === 0, errs.join('; '));
  } catch (e) { check('no unexpected error', false, e.stack); }
  finally { await b.close(); m.kill(); process.exit(ok ? 0 : 1); }
})();
