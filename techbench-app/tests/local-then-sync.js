// Jobs saved in "this device only" mode (no Supabase config) must survive turning sync on,
// upload on first sign-in, and show up on a second device. Runs the app from a copy whose
// config.js is swapped from blank to the mock API between launches, like a redeploy would.
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

const TMP = path.join(os.tmpdir(), 'tb-localsync'); fs.rmSync(TMP, { recursive: true, force: true });
const SITE = path.join(TMP, 'site'), API = 'http://localhost:8788', APP = 'http://localhost:8791/task-dashboard/';
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, d); };
const ROOT = path.join(__dirname, '..');

function copySite() {
  const d = path.join(SITE, 'task-dashboard'); fs.mkdirSync(path.join(d, 'icons'), { recursive: true });
  for (const f of ['index.html', 'app.css', 'app.js', 'data.js', 'report.js', 'sw.js', 'manifest.webmanifest', 'config.js']) fs.copyFileSync(path.join(ROOT, f), path.join(d, f));
  for (const f of fs.readdirSync(path.join(ROOT, 'icons'))) fs.copyFileSync(path.join(ROOT, 'icons', f), path.join(d, 'icons', f));
  fs.writeFileSync(path.join(d, 'config.js'), "window.TB_CONFIG = { supabaseUrl: '', supabaseAnonKey: '', reportFunction: 'report' };\n");
}
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SITE, p); if (!f.startsWith(SITE) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
const state = () => fetch(API + '/__test/state').then(r => r.json());
const ctx = (name, dev) => chromium.launchPersistentContext(path.join(TMP, name), { ...(dev || { viewport: { width: 1280, height: 900 } }), serviceWorkers: 'allow' });

(async () => {
  copySite(); await new Promise(r => server.listen(8791, r));
  const mock = spawn(process.execPath, [path.join(ROOT, 'dev', 'mock-supabase.js')], { env: { ...process.env, MOCK_DB: path.join(TMP, 'mockdb.json') }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => mock.stdout.on('data', d => String(d).includes('mock api') && r()));
  const errs = [];
  try {
    // 1. phone, no sync configured
    let c = await ctx('phone', devices['Pixel 7']), p = c.pages()[0] || await c.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto(APP); await p.waitForSelector('#h-new');
    check('device-only mode shown', (await p.textContent('#sync')).includes('This device only'));
    await p.click('#h-new'); await p.waitForSelector('[data-k="wo"]');
    const jobId = p.url().match(/job\/([0-9a-f-]{36})/)[1];
    await p.fill('[data-k="wo"]', 'LOCAL-001'); await p.waitForTimeout(500);
    await p.click('[data-kind="step"]'); await p.fill('#q-text', 'Logged before sync existed'); await p.click('#q-add');
    await p.waitForFunction(() => [...document.querySelectorAll('.tle .x')].some(x => x.textContent === 'Logged before sync existed'));
    await c.close();

    // 2. redeploy with sync configured
    fs.writeFileSync(path.join(SITE, 'task-dashboard', 'config.js'), `window.TB_CONFIG = { supabaseUrl: '${API}', supabaseAnonKey: 'mock-anon-key', reportFunction: 'report' };\n`);
    c = await ctx('phone', devices['Pixel 7']); p = c.pages()[0] || await c.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto(APP); await p.waitForTimeout(1500);
    if (!(await p.$('#au-email'))) { await p.reload(); await p.waitForTimeout(1500); }
    check('new config picked up: sign-in offered', !!(await p.$('#au-email')));
    await p.fill('#au-email', 'tech@example.com'); await p.fill('#au-pw', 'bench-test-1'); await p.click('#au-up');
    await p.waitForSelector('#h-new');
    await p.waitForFunction(() => document.querySelector('#sync')?.textContent.includes('All synced'), null, { timeout: 40000 });
    check('local job still on phone after sign-in', (await p.textContent('body')).includes('LOCAL-001'));
    const s = await state(), all = JSON.stringify(s);
    check('server has the local job', all.includes(jobId) && all.includes('LOCAL-001'));
    check('server has the local timeline step once', (all.match(/Logged before sync existed/g) || []).length === 1);
    await c.close();

    // 3. laptop signs in and sees it
    c = await ctx('laptop'); p = c.pages()[0] || await c.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto(APP); await p.waitForSelector('#au-email');
    await p.fill('#au-email', 'tech@example.com'); await p.fill('#au-pw', 'bench-test-1'); await p.click('#au-in');
    await p.waitForSelector('#h-new');
    await p.waitForFunction(() => document.body.textContent.includes('LOCAL-001'), null, { timeout: 30000 }).catch(() => {});
    check('laptop sees the job', (await p.textContent('body')).includes('LOCAL-001'));
    await p.goto(APP + '#/job/' + jobId); await p.waitForTimeout(1500);
    check('laptop sees the step', (await p.textContent('body')).includes('Logged before sync existed'));
    await c.close();
  } catch (e) { check('no unexpected error', false, e.stack); }
  check('no page errors', errs.length === 0, JSON.stringify(errs));
  mock.kill(); server.close();
  const f = results.filter(x => !x).length; console.log(`\n${results.length - f}/${results.length} checks passed`); process.exit(f ? 1 : 0);
})();
