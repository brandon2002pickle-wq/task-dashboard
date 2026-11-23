// Parts lookup end to end on a phone: job -> parts for that machine -> log a part -> import SIS CSV,
// with a server that hasn't run migration 002 (jobs must still sync), then after it has.
//   node tests/parts-e2e.js
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const TMP = path.join(os.tmpdir(), 'tb-parts'); fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
const APP = 'http://localhost:8795/', API = 'http://localhost:8796';
let ok = true; const check = (n, c, d = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : d); ok = ok && c; };
const state = () => fetch(API + '/__test/state').then(r => r.json());
async function mock(env) {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'dev', 'mock-supabase.js'), '8796', '8795'], { env: { ...process.env, MOCK_DB: path.join(TMP, 'db.json'), ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => p.stdout.on('data', d => String(d).includes('mock api') && r())); return p;
}
const CSV = `family,model,serial_prefix,serial_start,serial_end,group_number,group_name,item_number,part_number,part_description,quantity,related_seal,source_type,source_reference,source_page,verified_on,fitment_status
CTL,299D3,DY9,00001,99999,345-4581,"Tank Gp-Hydraulic",8,262-5689,"Strainer As (Hydraulic Tank)",1,135-7940,SIS 2.0,M0000000 test extract,p. 12,2026-11-23,serial-range
`;

(async () => {
  let m = await mock({ MOCK_KINDS: 'job,seg,entry,photo' });
  const ctx = await chromium.launchPersistentContext(path.join(TMP, 'phone'), { ...devices['Pixel 7'], serviceWorkers: 'allow' });
  const p = ctx.pages()[0] || await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(APP);
    await p.fill('#au-email', 'parts@example.com'); await p.fill('#au-pw', 'bench-test-1'); await p.click('#au-up'); await p.waitForSelector('#h-new');
    await p.click('#h-new'); await p.waitForSelector('#f-wo');
    await p.fill('#f-wo', '4400123'); await p.fill('[data-k="model"]', '299D3'); await p.fill('[data-k="serial"]', 'CAT0299DCDY901234');
    await p.click('#j-parts'); await p.waitForSelector('#p-q');
    check('model and PIN carried from the job', (await p.inputValue('#p-model')) === '299D3' && (await p.inputValue('#p-pin')) === 'CAT0299DCDY901234', [await p.inputValue('#p-model'), await p.inputValue('#p-pin')].join('/'));
    check('PIN read as prefix DY9 and mapped to 299D3', /prefix DY9/.test(await p.textContent('#p-pinnote')) && /under 299D3/.test(await p.textContent('#p-pinnote')));
    await p.fill('#p-q', 'suction screen');
    const pn = await p.$$eval('.pcard .pn', a => a.map(x => x.textContent));
    check('suction screen gives strainer + seal for 299D3', pn.includes('262-5689') && pn.includes('135-7940'), pn.join());
    check('missing fields shown as unverified', (await p.$$('.pcard .uv')).length > 0);
    check('not order-ready warning shown', /Not order-ready/.test(await p.textContent('#p-results')));
    await p.fill('#p-model', '299D3 XE');
    check('wrong suffix for prefix is flagged', /not 299D3 XE/.test(await p.textContent('#p-pinnote')));
    await p.fill('#p-model', '299D3');
    await p.click('[data-padd]'); await p.waitForTimeout(200);
    // import twice
    await p.click('details[data-det="pimport"] summary');
    await p.fill('#p-paste', CSV); await p.fill('#p-name', '299D3_DY9_Hydraulic_345-4581.csv'); await p.click('#p-import');
    await p.waitForFunction(() => /added/.test(document.querySelector('#p-imsg').textContent));
    check('first import adds 1', /1 added/.test(await p.textContent('#p-imsg')));
    await p.fill('#p-paste', CSV); await p.fill('#p-name', '299D3_DY9_Hydraulic_345-4581.csv'); await p.click('#p-import');
    await p.waitForFunction(() => /already on file/.test(document.querySelector('#p-imsg').textContent) && /1 already/.test(document.querySelector('#p-imsg').textContent));
    check('second import duplicates nothing', /0 added, 0 updated, 1 already/.test(await p.textContent('#p-imsg')));
    await p.fill('#p-q', '262-5689');
    const ev = await p.$$eval('.pcard .ev', a => a.map(x => x.textContent));
    check('imported SIS row ranks first as SIS verified', ev[0] === 'SIS verified · serial range', ev.join());
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check('no sideways scroll on the phone', over <= 0, over);
    await p.screenshot({ path: path.join(TMP, 'parts-phone.png'), fullPage: true });
    // before migration: jobs sync, parts wait
    await p.waitForFunction(() => /All synced/.test(document.querySelector('#sync').textContent), null, { timeout: 30000 });
    let s = await state();
    const kinds = s.records.map(r => r.kind);
    check('job + logged part entry reached the server', kinds.includes('job') && kinds.filter(k => k === 'entry').length >= 1 && s.records.some(r => r.kind === 'entry' && /262-5689|135-7940/.test(r.fields.text || '')));
    check('part rows refused without migration', !kinds.includes('part'));
    await p.goto(APP + '#/parts'); await p.click('details[data-det="pimport"] summary');
    check('page tells you to run 002_parts.sql', /002_parts\.sql/.test(await p.textContent('details[data-det="pimport"]')));
    // after migration
    m.kill(); m = await mock({});
    await p.click('#sync'); await p.evaluate(() => dispatchEvent(new Event('online')));
    await p.waitForFunction(() => true); await p.waitForTimeout(3000);
    s = await state();
    check('part rows sync once the migration is in', s.records.some(r => r.kind === 'part' && r.fields.part_number === '262-5689'));
    check('no page errors', errs.length === 0, errs.join('; '));
  } catch (e) { check('no unexpected error', false, e.stack); }
  finally { await ctx.close(); m.kill(); process.exit(ok ? 0 : 1); }
})();
