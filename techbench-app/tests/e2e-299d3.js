// End-to-end check: a Cat 299D3 job started on a phone, worked offline, synced, finished on a laptop.
// Runs against dev/mock-supabase.js (same endpoints as Supabase). Two browser profiles stand in for
// the two devices; each keeps its own IndexedDB and service worker between launches.
//   node tests/e2e-299d3.js A          phone + laptop + sync + duplicates + conflicts, saves the report prompt
//   node tests/e2e-299d3.js B reply.json   laptop applies Claude's report reply and verifies it
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const PHASE = process.argv[2] || 'A';
const TMP = process.env.TB_TMP || path.join(os.tmpdir(), 'tb-e2e');
const APP = 'http://localhost:8787/', API = 'http://localhost:8788';
const EMAIL = 'tech@example.com', PW = 'bench-test-1';
const log = (...a) => console.log('·', ...a);
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok }); console.log(ok ? 'PASS' : 'FAIL', name, detail); }
const ctl = body => fetch(API + '/__test/control', { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
const state = () => fetch(API + '/__test/state').then(r => r.json());

async function startMock() {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'dev', 'mock-supabase.js')], { env: { ...process.env, MOCK_DB: path.join(TMP, 'mockdb.json') }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => p.stdout.on('data', d => String(d).includes('mock api') && r()));
  return p;
}
const phoneCtx = (offline = false) => chromium.launchPersistentContext(path.join(TMP, 'phone'), { ...devices['Pixel 7'], offline, serviceWorkers: 'allow' });
const laptopCtx = () => chromium.launchPersistentContext(path.join(TMP, 'laptop'), { viewport: { width: 1280, height: 900 }, serviceWorkers: 'allow' });
const syncText = p => p.textContent('#sync');
async function waitSynced(p, ms = 40000) { await p.waitForFunction(() => document.querySelector('#sync')?.textContent.includes('All synced'), null, { timeout: ms }); }
async function setField(p, k, v) { const el = p.locator(`[data-k="${k}"]`).first(); await el.fill(v); await p.waitForTimeout(450); }
async function logEntry(p, kind, text, extra = {}) {
  await p.click(`[data-kind="${kind}"]`);
  await p.fill('#q-text', text);
  for (const [sel, v] of Object.entries(extra)) { if (sel === '#q-wtype') await p.selectOption(sel, v); else await p.fill(sel, v); }
  await p.click('#q-add');
  await p.waitForFunction(t => [...document.querySelectorAll('.tle .x')].some(x => x.textContent === t), text);
}
async function signIn(p, up) {
  await p.fill('#au-email', EMAIL); await p.fill('#au-pw', PW);
  await p.click(up ? '#au-up' : '#au-in');
  await p.waitForSelector('#h-new');
}

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const mock = await startMock();
  const b = await chromium.launch(); await b.close();   // warm the browser binary
  try {
    if (PHASE === 'A') await phaseA(); else await phaseB(process.argv[3]);
  } catch (e) { check('no unexpected error', false, e.stack); }
  finally {
    mock.kill();
    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
  }
})();

async function phaseA() {
  // a photo to attach
  const photo = path.join(TMP, 'strainer.jpg');
  { const br = await chromium.launch(), pg = await br.newPage({ viewport: { width: 640, height: 480 } });
    await pg.setContent('<div style="width:640px;height:480px;background:linear-gradient(135deg,#6b5a3a,#2b2b2b);color:#fff;font:40px sans-serif;display:grid;place-items:center">tank strainer debris</div>');
    await pg.screenshot({ path: photo, type: 'jpeg', quality: 80 }); await br.close(); }

  // ---------- PHONE: start the job online ----------
  let phone = await phoneCtx(), p = phone.pages()[0] || await phone.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(APP);
  await signIn(p, true);
  log('phone signed up and signed in');
  await p.click('#h-new');
  await p.waitForSelector('[data-k="wo"]');
  const jobId = p.url().match(/job\/([0-9a-f-]{36})/)[1];
  await setField(p, 'wo', '4512345');
  await p.selectOption('[data-k="make"]', 'cat');
  await setField(p, 'model', '299D3');
  await setField(p, 'serial', 'TEST299D3');
  await setField(p, 'smu', '1834');
  await setField(p, 'customer', 'Sample customer');
  await logEntry(p, 'step', 'Pulled PSR with Cat ET before repair. Drained hydraulic tank for cleanout.');
  await waitSynced(p);
  check('phone: job created and synced online', true, 'job ' + jobId);
  // service worker must be controlling before we go offline
  await p.reload(); await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller);

  // ---------- PHONE: offline cleanout cycle + photo ----------
  await phone.setOffline(true);
  await p.waitForFunction(() => !navigator.onLine);
  const STEP = 'Cleanout cycle 1: replaced hydraulic tank strainer and return filter, operated machine 30 min through all functions, collected oil sample 1 from the hydraulic tank sample port.';
  await logEntry(p, 'step', STEP);
  await logEntry(p, 'pending', 'S·O·S oil sample 1 results', { '#q-wtype': 'sample', '#q-who': 'S·O·S lab', '#q-ref': 'SOS-0001', '#q-resume': 'Review sample 1 results and decide on cleanout cycle 2' });
  await p.setInputFiles('#q-photo', photo);
  await p.fill('#q-cap', 'Debris on tank strainer after cleanout cycle 1');
  await p.click('#q-psave');
  await p.waitForSelector('.pin img[data-photo]');
  const offBadges = await p.$$eval('.tle .badge', els => els.map(e => e.textContent));
  check('phone offline: entries show "Saved on phone"', offBadges.filter(t => t === 'Saved on phone').length >= 3, JSON.stringify(offBadges));
  check('phone offline: header shows offline with items saved', (await syncText(p)).includes('Offline'), await syncText(p));
  await phone.close();
  log('phone app closed while offline');

  // ---------- PHONE: reopen offline ----------
  phone = await phoneCtx(true); p = phone.pages()[0] || await phone.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(APP).catch(() => {});
  await p.waitForSelector('#h-resume', { timeout: 15000 });
  check('phone reopened offline: app loads from the service worker', true);
  await p.click('#h-resume');
  await p.waitForSelector('.tle');
  const reopened = await p.$$eval('.tle .x', els => els.map(e => e.textContent));
  check('phone reopened offline: cleanout entry kept', reopened.filter(t => t === STEP).length === 1);
  check('phone reopened offline: photo kept', await p.$eval('.pin img[data-photo]', i => i.naturalWidth > 0));
  check('phone reopened offline: still marked saved on phone', (await p.$$eval('.tle .badge', els => els.map(e => e.textContent))).includes('Saved on phone'));

  // ---------- reconnect, with the first two server replies lost (forces retries) ----------
  await ctl({ dropPushResponses: 2 });
  await phone.setOffline(false);
  await waitSynced(p, 60000);
  const tlBadges = await p.$$eval('.tle .badge', els => els.map(e => e.textContent));
  check('phone online: every entry shows Synced', tlBadges.length > 0 && tlBadges.every(t => t === 'Synced'), JSON.stringify(tlBadges));
  let s = await state();
  const kids = s.records.filter(r => r.parent_id === jobId);
  check('server: cleanout entry stored exactly once despite lost replies', kids.filter(r => r.kind === 'entry' && r.fields.text === STEP).length === 1, 'push calls ' + s.pushCalls);
  check('server: photo record stored exactly once', kids.filter(r => r.kind === 'photo').length === 1);
  check('server: photo file stored once, in the user folder', s.objects.length === 1 && s.objects[0].split('/').length === 3, JSON.stringify(s.objects));

  // ---------- LAPTOP: same account, same job ----------
  const laptop = await laptopCtx(); const l = laptop.pages()[0] || await laptop.newPage(); l.on('pageerror', e => errs.push(e.message));
  await l.goto(APP); await signIn(l, false); await waitSynced(l);
  await l.click(`[data-open="${jobId}"]`); await l.waitForSelector('.tle');
  const lt = await l.$$eval('.tle .x', els => els.map(e => e.textContent));
  check('laptop: cleanout note appears once', lt.filter(t => t === STEP).length === 1, lt.length + ' entries');
  await l.waitForFunction(() => [...document.querySelectorAll('img[data-photo]')].some(i => i.naturalWidth > 0), null, { timeout: 15000 });
  check('laptop: photo appears once and loads from private storage', (await l.$$('img[data-photo]')).length === 1);
  const resume = await l.textContent('.resume');
  check('laptop: resume card shows last step and the sample waiting', resume.includes('Cleanout cycle 1') && resume.includes('S·O·S oil sample 1 results'), resume.replace(/\s+/g, ' ').slice(0, 200));
  check('laptop: work order + machine came across', (await l.inputValue('[data-k="wo"]')) === '4512345' && (await l.inputValue('[data-k="model"]')) === '299D3');

  // ---------- laptop keeps editing: shop-assist note (internal) ----------
  await l.click('details[data-det="codes"] summary');
  await setField(l, 'support', 'Paused work on this unit to assist another technician with hydraulic diagnostics on a separate job, about 1 hr.');
  await waitSynced(l);

  // ---------- conflict: both devices change hours before syncing ----------
  await phone.setOffline(true); await p.waitForFunction(() => !navigator.onLine);
  if (!(await p.isVisible('[data-k="smu"]'))) await p.click('details[data-det="wo"] summary');
  await setField(p, 'smu', '1840'); await p.locator('[data-k="smu"]').blur();
  if (!(await l.isVisible('[data-k="smu"]'))) await l.click('details[data-det="wo"] summary');
  await setField(l, 'smu', '1841'); await waitSynced(l);
  await phone.setOffline(false);
  await p.waitForSelector('.conflicts', { timeout: 30000 });
  const ctext = await p.textContent('.conflicts');
  check('conflict: phone shows both edits to choose from', ctext.includes('1840') && ctext.includes('1841'));
  await p.click('.conflicts [data-keep="theirs"]');
  await waitSynced(p);
  s = await state();
  check('conflict: resolved value saved on server', s.records.find(r => r.id === jobId).fields.smu === '1841');
  await p.blur?.('body').catch(() => {});

  // ---------- laptop: generate the report ----------
  await l.reload(); await l.waitForSelector('#r-gen');
  await l.click('#r-gen');
  await l.waitForSelector('#r-prompt');
  const prompt = await l.inputValue('#r-prompt');
  fs.writeFileSync(path.join(TMP, 'prompt.txt'), prompt);
  check('report: prompt built with the existing instructions + timeline', prompt.includes('Thompson Tractor CCE') && prompt.includes(STEP) && prompt.includes('S·O·S oil sample 1 results') && prompt.includes('(OPEN)'));
  check('report: shop-assist note goes in as internal-only input', prompt.includes('SHOP SUPPORT, TRAINING & TIME:\nPaused work on this unit'));
  check('report: report service unavailable in mock, so the copy-prompt path is offered', (await l.textContent('#r-msg')).length > 0, await l.textContent('#r-msg'));
  await l.screenshot({ path: path.join(TMP, 'laptop-job.png'), fullPage: false });
  await p.screenshot({ path: path.join(TMP, 'phone-job.png') });
  check('no page errors on either device', errs.length === 0, errs.join(' | '));
  await phone.close(); await laptop.close();
  fs.writeFileSync(path.join(TMP, 'job-id.txt'), jobId);
  log('prompt saved to', path.join(TMP, 'prompt.txt'));
}

async function phaseB(replyFile) {
  const jobId = fs.readFileSync(path.join(TMP, 'job-id.txt'), 'utf8').trim();
  const reply = fs.readFileSync(replyFile, 'utf8');
  const laptop = await laptopCtx(); const l = laptop.pages()[0] || await laptop.newPage();
  const errs = []; l.on('pageerror', e => errs.push(e.message));
  await l.goto(APP + '#/job/' + jobId); await l.waitForSelector('#r-gen'); await waitSynced(l);
  await l.click('#r-gen'); await l.waitForSelector('#r-paste');
  await l.fill('#r-paste', reply); await l.click('#r-apply');
  await l.waitForFunction(() => (document.querySelector('[data-k="repair"]') || {}).value);
  const repair = await l.inputValue('[data-k="repair"]'), internal = await l.inputValue('[data-k="internal"]');
  check('report: repair process filled in', repair.length > 100);
  check('report: oil sample result shown as pending', /sample[^.]*pending|pending[^.]*sample/i.test(repair), repair.match(/[^.]*pending[^.]*\./i)?.[0]);
  check('report: no first person', !/\b(I|we|my|our)\b/.test(repair));
  check('report: shop assist kept out of customer copy, in internal notes', !/assist another technician/i.test(repair) && /assist/i.test(internal));
  await waitSynced(l);
  const s = await state();
  const seg = s.records.find(r => r.kind === 'seg' && r.parent_id === jobId);
  check('report: written segment synced to the server', seg && seg.fields.repair === repair);
  await l.screenshot({ path: path.join(TMP, 'laptop-report.png'), fullPage: false });
  check('no page errors', errs.length === 0, errs.join(' | '));
  await laptop.close();
}
