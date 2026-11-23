// Imports a backup in the old Tech Bench page's format twice and checks nothing duplicates.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const TMP = process.env.TB_TMP || path.join(os.tmpdir(), 'tb-import');
fs.mkdirSync(TMP, { recursive: true });
const backup = { app: 'techbench-artifact', version: 1, jobs: [{ id: 'lx1abc', machineId: 'm1', wo: '4400001', date: '2026-11-20', smu: '', status: 'open', dtcs: 'CID 168 FMI 04', notes: 'Old notes', support: '', psrBefore: true, psrAfter: false, created: 1,
  segs: [{ id: 's1', title: 'Main repair', notes: '', warranty: false, hasPart: false, f: { dealer: 'D435', complaint: 'Low voltage code', repair: '', cause: 'G', second: '49', part: '0000000', group: '7595' } }],
  log: [{ id: 'e1', at: 1000, kind: 'step', text: 'Load tested batteries' }, { id: 'e2', at: 2000, kind: 'next', text: 'Check alternator output', open: true }], photos: [{ id: 'p1' }] }],
  machines: [{ id: 'm1', make: 'deere', model: '333G', serial: '1T0333GXXX', category: 'customer', customer: 'Example', smu: '2140' }], parts: [], specs: [] };
const f = path.join(TMP, 'backup.json'); fs.writeFileSync(f, JSON.stringify(backup));
(async () => {
  const mock = spawn(process.execPath, [path.join(__dirname, '..', 'dev', 'mock-supabase.js'), '8798', '8797'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => mock.stdout.on('data', d => String(d).includes('mock api') && r()));
  const b = await chromium.launch(), p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  let ok = true; const check = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); ok = ok && c; };
  await p.goto('http://localhost:8797/');
  await p.fill('#au-email', 'imp@example.com'); await p.fill('#au-pw', 'bench-test-1'); await p.click('#au-up'); await p.waitForSelector('#h-new');
  await p.goto('http://localhost:8797/#/settings');
  for (let i = 0; i < 2; i++) { await p.setInputFiles('#s-import', f); await p.waitForFunction(() => /Imported/.test(document.querySelector('#s-imsg').textContent)); }
  await p.goto('http://localhost:8797/#/'); await p.waitForSelector('[data-open]');
  check('one job after importing twice', (await p.$$('[data-open]')).length === 1);
  await p.click('[data-open]'); await p.waitForSelector('.resume');
  const t = await p.textContent('.resume');
  check('timeline + next step carried over', t.includes('Load tested batteries') && t.includes('Check alternator output'));
  check('machine details carried over', (await p.inputValue('[data-k="model"]')) === '333G' && (await p.inputValue('[data-k="serial"]')) === '1T0333GXXX');
  check('no page errors', errs.length === 0);
  await b.close(); mock.kill(); process.exit(ok ? 0 : 1);
})();
