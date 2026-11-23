import { store, makeBackend, makeSync } from './data.js';
import * as R from './report.js';
import * as P from './parts.js';

const cfg = window.TB_CONFIG || {};
const backend = makeBackend(cfg);
const sync = makeSync(backend);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const when = t => t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const isPhone = matchMedia('(pointer: coarse)').matches;
const here = isPhone ? 'phone' : 'this device';
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2400); }
async function copy(text, field) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch (e) { if (field) { field.focus(); field.select(); } toast('Select and copy'); }
}

const ui = { kind: 'step', seg: null, pendingRender: false, prompt: '', newPhoto: null, draft: '', open: {}, parts: { q: '', model: '', pin: '', job: null } };

/* ---------------- sync labels ---------------- */
function entryBadge(rec) {
  const s = store.state(rec);
  if (s === 'conflict') return '<span class="badge conflict" data-badge="' + rec.id + '">Edits differ</span>';
  if (s === 'synced') return '<span class="badge synced" data-badge="' + rec.id + '">Synced</span>';
  const offline = !navigator.onLine || !backend.ready || !backend.session();
  return offline ? '<span class="badge pending" data-badge="' + rec.id + '">Saved on ' + here + '</span>'
    : '<span class="badge wait" data-badge="' + rec.id + '">Waiting to sync</span>';
}
function refreshBadges() {
  $$('[data-badge]').forEach(el => { const r = store.get(el.dataset.badge); if (!r) return; const t = document.createElement('span'); t.innerHTML = entryBadge(r); el.replaceWith(t.firstChild); });
  const s = $('#sync'), n = store.pendingCount(), ph = sync.status.phase;
  let cls = 'ok', txt = 'All synced';
  if (!backend.ready) { cls = 'wait'; txt = 'This device only (sync not set up)'; }
  else if (ph === 'signed-out') { cls = 'off'; txt = 'Signed out'; }
  else if (ph === 'offline' || !navigator.onLine) { cls = 'off'; txt = 'Offline' + (n ? ' · ' + n + ' saved on ' + here : ''); }
  else if (ph === 'syncing') { cls = 'busy'; txt = 'Syncing…'; }
  else if (ph === 'error') { cls = 'off'; txt = 'Sync problem · retrying'; }
  else if (n) { cls = 'wait'; txt = n + ' waiting to sync'; }
  const nc = store.all().filter(r => Object.keys(r.conflicts || {}).length).length;
  if (nc) { cls = 'off'; txt = nc + ' edit' + (nc > 1 ? 's' : '') + ' to choose'; }
  s.className = 'sync ' + cls; s.innerHTML = '<i></i><span>' + esc(txt) + '</span>';
  s.title = sync.status.error || '';
}

/* ---------------- data helpers ---------------- */
const jobs = () => store.list('job').sort((a, b) => (b.fields.date || '').localeCompare(a.fields.date || '') || (b.fields.createdAt || 0) - (a.fields.createdAt || 0));
const segsOf = id => store.list('seg', id).sort((a, b) => a.fields.order - b.fields.order);
const entriesOf = id => store.list('entry', id).sort((a, b) => a.fields.at - b.fields.at);
const photosOf = id => store.list('photo', id).sort((a, b) => a.fields.at - b.fields.at);
const jobTitle = j => (j.fields.wo ? 'Call ' + j.fields.wo : 'New job');
const machineLine = j => [(R.MAKES[j.fields.make] || R.MAKES.other).name, j.fields.model, j.fields.serial && 'S/N ' + j.fields.serial, j.fields.smu && j.fields.smu + ' h'].filter(Boolean).join(' · ');

async function newJob() {
  const s = backend.session();
  const job = await store.create('job', null, { wo: '', date: today(), smu: '', status: 'open', make: 'cat', model: '', serial: '', customer: '', category: 'customer', stockNo: '', dtcs: '', procedure: '', notes: '', support: '', psrBefore: true, psrAfter: false, createdAt: Date.now(), owner: s ? s.user.id : '' });
  await store.create('seg', job.id, R.segDefaults('Main repair', '', 1));
  await store.setMeta('lastJob', job.id);
  location.hash = '#/job/' + job.id + '/details';
}

/* ---------------- photos ---------------- */
const urls = new Map();
async function photoUrl(rec) {
  if (urls.has(rec.id)) return urls.get(rec.id);
  let b = store.getBlob(rec.id);
  if (!b && backend.ready && backend.session() && navigator.onLine && rec.fields.path) {
    try { const blob = await backend.download(rec.fields.path); await store.putBlob(rec.id, blob, true); b = store.getBlob(rec.id); } catch (e) { return null; }
  }
  if (!b) return null;
  const u = URL.createObjectURL(b.blob); urls.set(rec.id, u); return u;
}
function hydratePhotos(root) {
  $$('img[data-photo]', root).forEach(async img => {
    const rec = store.get(img.dataset.photo); if (!rec) return;
    const u = await photoUrl(rec);
    if (u) { img.src = u; img.closest('[data-photowrap]')?.classList.remove('nofile'); }
    else img.alt = navigator.onLine ? 'Photo not uploaded yet from the other device' : 'Photo will load when online';
  });
}

/* ---------------- views ---------------- */
function nav(hash) {
  const tab = hash.startsWith('#/settings') ? '#/settings' : hash.startsWith('#/parts') ? '#/parts' : '#/';
  $$('nav.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.go === tab)));
}
$$('nav.tabs button').forEach(b => b.onclick = () => location.hash = b.dataset.go);

function render() {
  const h = location.hash || '#/';
  nav(h);
  const v = $('#view');
  if (backend.ready && !backend.session()) return renderAuth(v);
  if (h === '#/new') { newJob(); return; }
  const m = h.match(/^#\/job\/([0-9a-f-]{36})(\/details)?/);
  if (m && store.get(m[1]) && !store.get(m[1]).deleted) return renderJob(v, m[1], !!m[2]);
  if (h.startsWith('#/settings')) return renderSettings(v);
  if (h.startsWith('#/parts')) return renderParts(v, new URLSearchParams(h.split('?')[1] || ''));
  renderHome(v);
}
function softRender() {
  // remote changes: re-render unless the user is typing in a field
  const a = document.activeElement;
  if (a && a.matches('input, textarea, select') && a.closest('#view')) { ui.pendingRender = true; refreshBadges(); return; }
  const y = scrollY; render(); scrollTo(0, y);
}
document.addEventListener('focusout', () => setTimeout(() => { if (ui.pendingRender && !(document.activeElement && document.activeElement.matches('input, textarea, select'))) { ui.pendingRender = false; softRender(); } }, 50));

function renderAuth(v) {
  v.innerHTML = `<div class="panel auth">
    <h2>Sign in</h2>
    <p class="note">One account for your phone and laptop. Your jobs and photos are private to it.</p>
    <label class="f"><span>Email</span><input id="au-email" type="email" autocomplete="username" inputmode="email"></label>
    <label class="f"><span>Password</span><input id="au-pw" type="password" autocomplete="current-password"></label>
    <div class="row"><button class="btn pri" type="button" id="au-in">Sign in</button><button class="btn" type="button" id="au-up">Create account</button></div>
    <p class="note" id="au-msg">${navigator.onLine ? '' : 'You\'re offline. Signing in needs a connection the first time.'}</p>
  </div>`;
  const go = async up => {
    const e = $('#au-email').value.trim(), p = $('#au-pw').value, msg = $('#au-msg');
    if (!e || !p) { msg.textContent = 'Enter your email and password.'; return; }
    msg.textContent = up ? 'Creating account…' : 'Signing in…';
    try {
      const s = up ? await backend.signUp(e, p) : await backend.signIn(e, p);
      if (!s) { msg.textContent = 'Account created. Open the confirmation email, then sign in here.'; return; }
      // a different account than the data on this device: start clean
      const prev = store.getMeta('owner');
      if (prev && prev !== s.user.id) await store.wipe();
      await store.setMeta('owner', s.user.id);
      toast('Signed in'); sync.run(); render();
    } catch (err) { msg.textContent = (up ? 'Couldn\'t create the account: ' : 'Couldn\'t sign in: ') + err.message; }
  };
  $('#au-in').onclick = () => go(false); $('#au-up').onclick = () => go(true);
}

function renderHome(v) {
  const all = jobs(), open = all.filter(j => j.fields.status !== 'done');
  const lastId = store.getMeta('lastJob'), last = (lastId && store.get(lastId) && !store.get(lastId).deleted) ? store.get(lastId) : open[0];
  const h = new Date().getHours();
  const greet = h < 5 ? 'Late one, Sir.' : h < 12 ? 'Morning, Sir.' : h < 17 ? 'Afternoon, Sir.' : 'Evening, Sir.';
  const rs = last ? R.resumeOf(entriesOf(last.id)) : null;
  v.innerHTML = `
  <section class="board" aria-label="Shift board" style="margin-top:14px">
    <div class="hello"><b>${greet}</b><span>${open.length ? open.length + ' open job' + (open.length > 1 ? 's' : '') + '.' : 'Nothing open. Start one.'}</span></div>
    <div class="stat o"><span class="n">${open.length}</span><span class="l">Open jobs</span></div>
    <div class="stat p"><span class="n">${all.reduce((n, j) => n + R.resumeOf(entriesOf(j.id)).waiting.length, 0)}</span><span class="l">Waiting on others</span></div>
    <div class="stat m"><span class="n">${store.pendingCount()}</span><span class="l">Not synced</span></div>
  </section>
  <div class="homebtns" style="margin-top:12px">
    ${last ? `<button class="btn big" type="button" id="h-resume" style="text-align:left"><b>Resume ${esc(jobTitle(last))}</b><br><span class="note">${esc(machineLine(last) || 'No machine yet')}${rs && rs.next ? ' · Next: ' + esc(rs.next.fields.text) : ''}</span></button>` : ''}
    <button class="btn pri big" type="button" id="h-new">Start new job</button>
  </div>
  <div class="list" style="margin-top:12px" id="h-list">${all.length ? all.map(j => {
    const r = R.resumeOf(entriesOf(j.id));
    return `<button class="item" type="button" data-open="${j.id}"><span class="t"><span>${esc(jobTitle(j))}</span><span class="row" style="gap:6px"><span class="pill ${j.fields.status}">${R.STATUS[j.fields.status] || ''}</span>${entryBadge(j)}</span></span>
      <span class="s">${esc(machineLine(j) || 'No machine yet')}${j.fields.customer ? ' · ' + esc(j.fields.customer) : ''}</span>
      ${j.fields.status !== 'done' && r.next ? '<span class="s" style="color:var(--accent)">Next: ' + esc(r.next.fields.text) + '</span>' : ''}
      ${r.waiting.length ? '<span class="s">Waiting on: ' + r.waiting.map(e => esc(e.fields.text)).join(' · ') + '</span>' : ''}</button>`;
  }).join('') : '<div class="empty"><b>No jobs yet.</b><span>Start a job for each service call. Log steps, findings, photos and the next step as you go, and the report is built from them.</span></div>'}</div>`;
  $('#h-new').onclick = newJob;
  if ($('#h-resume')) $('#h-resume').onclick = () => location.hash = '#/job/' + last.id;
  $$('[data-open]', v).forEach(b => b.onclick = () => location.hash = '#/job/' + b.dataset.open);
}

/* bind every [data-rec][data-k] control to the store, debounced */
const timers = {};
function bindFields(root) {
  $$('[data-rec][data-k]', root).forEach(el => {
    const ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      const id = el.dataset.rec, k = el.dataset.k, v = el.type === 'checkbox' ? el.checked : el.value;
      clearTimeout(timers[id + k]);
      timers[id + k] = setTimeout(() => store.update(id, { [k]: v }).then(refreshBadges), el.type === 'checkbox' || el.tagName === 'SELECT' ? 0 : 350);
      const cc = root.querySelector('[data-cc="' + id + k + '"]'); if (cc) cc.textContent = String(v).length + ' ch';
    });
  });
}
const fld = (rec, k, label, attrs = '') => `<label class="f"><span>${label}</span><input data-rec="${rec.id}" data-k="${k}" value="${esc(rec.fields[k])}" ${attrs}></label>`;
const area = (rec, k, label, ph = '', rows = 3) => `<label class="f"><span>${label}</span><textarea data-rec="${rec.id}" data-k="${k}" rows="${rows}" placeholder="${esc(ph)}">${esc(rec.fields[k])}</textarea></label>`;
const sel = (rec, k, label, opts) => `<label class="f"><span>${label}</span><select data-rec="${rec.id}" data-k="${k}">${Object.entries(opts).map(([v, n]) => `<option value="${v}"${rec.fields[k] === v ? ' selected' : ''}>${esc(typeof n === 'string' ? n : n.name)}</option>`).join('')}</select></label>`;
const LABELS = { wo: 'Service call #', date: 'Date', smu: 'Hours', status: 'Status', make: 'Make', model: 'Model', serial: 'Serial', customer: 'Customer', notes: 'Findings', support: 'Shop support notes', dtcs: 'Codes', text: 'Entry text', caption: 'Photo caption', title: 'Segment title', repair: 'Repair process', complaint: 'Customer complaint', causing: 'Causing failure', damage: 'Resultant damage', internal: 'Internal notes' };

function renderJob(v, id, openDetails) {
  const job = store.get(id), j = job.fields, mk = R.MAKES[j.make] || R.MAKES.cat;
  store.setMeta('lastJob', id);
  const segs = segsOf(id), entries = entriesOf(id), photos = photosOf(id);
  if (!segs.find(s => s.id === ui.seg)) ui.seg = segs[0] ? segs[0].id : null;
  const seg = store.get(ui.seg);
  const rs = R.resumeOf(entries);
  const ids = new Set([id, ...segs.map(s => s.id), ...entries.map(e => e.id), ...photos.map(p => p.id)]);
  const conflicts = store.conflictsFor(ids);
  const pinOpts = '<option value="">Not pinned</option>' + [...entries].reverse().filter(e => ['step', 'finding', 'part', 'next', 'pending'].includes(e.fields.kind)).map(e => `<option value="${e.id}">${esc((R.TL[e.fields.kind] || R.TL.note).name + ': ' + e.fields.text.slice(0, 60))}</option>`).join('');

  // timeline: newest first, photos pinned under their step
  const pinned = id2 => photos.filter(p => p.fields.pin === id2);
  const photoHtml = p => `<div class="pin" data-photowrap><img data-photo="${p.id}" alt="${esc(p.fields.caption || 'Photo')}" style="width:96px;height:96px;object-fit:cover;border-radius:6px"><span>${esc(p.fields.caption || 'Photo')}<br>${entryBadge(p)} <span class="note">${esc(when(p.fields.at))}</span></span></div>`;
  const items = [...entries.map(e => ({ t: 'e', at: e.fields.at, r: e })), ...photos.filter(p => !p.fields.pin || !store.get(p.fields.pin) || store.get(p.fields.pin).deleted).map(p => ({ t: 'p', at: p.fields.at, r: p }))].sort((a, b) => b.at - a.at);
  const tl = items.map(({ t, r }) => {
    if (t === 'p') return `<div class="tle" style="--kc:var(--teal)"><div class="h"><b>Photo</b><span>${esc(when(r.fields.at))}</span></div><div class="pins">${photoHtml(r)}</div></div>`;
    const f = r.fields, k = R.TL[f.kind] || R.TL.note, open = f.open || (f.kind === 'part' && (f.pstate || 'ordered') !== 'installed');
    let act = '';
    if ((f.kind === 'next' || f.kind === 'pending') && f.open) act = `<button class="btn sm" type="button" data-close="${r.id}">${f.kind === 'next' ? 'Done' : 'Cleared'}</button>`;
    if (f.kind === 'part' && (f.pstate || 'ordered') !== 'installed') act = `<button class="btn sm" type="button" data-adv="${r.id}">Mark ${f.pstate === 'received' ? 'installed' : 'received'}</button>`;
    const pins = pinned(r.id);
    return `<div class="tle ${open ? 'open' : (f.kind === 'next' || f.kind === 'pending') ? 'closed' : ''}" style="--kc:${k.c}"><div class="h"><b>${k.name}</b><span>${esc(when(f.at))}</span>${f.kind === 'part' ? '<span>[' + esc(f.pstate || 'ordered') + ']</span>' : ''}${entryBadge(r)}<button class="tdel" type="button" data-del="${r.id}">delete</button></div>
      <div class="x">${esc(f.text)}</div>
      ${f.wtype ? `<div class="note">Waiting on ${esc(f.who || R.WAIT[f.wtype].who || R.WAIT[f.wtype].name)}${f.ref ? ' · ref ' + esc(f.ref) : ''}${f.resume ? ' · then: ' + esc(f.resume) : ''}</div>` : ''}
      ${pins.length ? '<div class="pins">' + pins.map(photoHtml).join('') + '</div>' : ''}
      ${act ? '<div class="row">' + act + '</div>' : ''}</div>`;
  }).join('');

  v.innerHTML = `
  <div class="view-top" style="margin-top:14px"><a href="#/" class="btn sm">‹ Jobs</a><span class="row" style="gap:8px">${entryBadge(job)}</span></div>
  <div class="panel" style="margin-top:10px">
    <div class="axh"><h3>${esc(jobTitle(job))}</h3><span class="pill ${j.status}">${R.STATUS[j.status] || ''}</span></div>
    <div class="note">${esc(machineLine(job) || 'Add the machine details below')}${j.customer ? ' · ' + esc(j.customer) : ''}</div>
  </div>

  ${conflicts.length ? `<div class="conflicts" style="margin-top:10px"><h2>Choose which edit to keep</h2><p class="note" style="margin:0">Both devices changed the same thing before syncing. Nothing is lost until you choose.</p>
    ${conflicts.flatMap(r => Object.entries(r.conflicts).map(([k, c]) => `<div><b>${esc(LABELS[k] || k)}</b> <span class="note">(${esc(r.kind === 'job' ? 'job' : r.kind === 'seg' ? 'segment ' + r.fields.title : r.kind)})</span>
      <div class="conf-row"><div><span class="note">This ${here}</span><span>${esc(String(c.mine ?? ''))}</span><button class="btn sm pri" type="button" data-keep="mine" data-cid="${r.id}" data-ck="${k}">Keep this one</button></div>
      <div><span class="note">Other device</span><span>${esc(String(c.theirs ?? ''))}</span><button class="btn sm" type="button" data-keep="theirs" data-cid="${r.id}" data-ck="${k}">Keep this one</button></div></div></div>`)).join('')}</div>` : ''}

  ${entries.length ? `<div class="resume" style="margin-top:10px"><div><span class="k">Last completed step</span><span class="v">${rs.last ? esc(rs.last.fields.text) : '<span class="note">None logged</span>'}</span></div>
    <div><span class="k">Next action</span><span class="v next">${rs.next ? esc(rs.next.fields.text) : '<span class="note" style="font-size:14px">Not set</span>'}</span>${rs.next ? `<span><button class="btn sm pri" type="button" data-close="${rs.next.id}">Done, log as step</button></span>` : ''}</div>
    <div><span class="k">Waiting on (${rs.waiting.length})</span>${rs.waiting.length ? '<ul>' + rs.waiting.map(e => '<li>' + esc(e.fields.text) + (e.fields.who ? ' <span class="note">· ' + esc(e.fields.who) + '</span>' : '') + '</li>').join('') + '</ul>' : '<span class="note">Nothing</span>'}</div></div>` : ''}

  <div class="panel" style="margin-top:10px" id="q-panel">
    <h2>Log it</h2>
    <div class="tlchips">${Object.entries(R.TL).filter(([k]) => k !== 'photo').map(([k, t]) => `<button class="chip" type="button" data-kind="${k}" aria-pressed="${k === ui.kind}">${t.name}</button>`).join('')}</div>
    <textarea id="q-text" rows="3" placeholder="${esc(R.TL[ui.kind].ph)}" aria-label="What happened">${esc(ui.draft)}</textarea>
    <div class="hint">${isPhone ? 'Tap the microphone on your keyboard to dictate.' : 'Type or dictate (Windows: Win + H).'}</div>
    <div class="grid2" id="q-wait" ${ui.kind === 'pending' || ui.kind === 'part' ? '' : 'hidden'}>
      <label class="f"><span>Waiting on</span><select id="q-wtype">${Object.entries(R.WAIT).map(([k, w]) => `<option value="${k}"${k === (ui.kind === 'part' ? 'part' : 'other') ? ' selected' : ''}>${w.name}</option>`).join('')}</select></label>
      <label class="f"><span>Who has the next action</span><input id="q-who"></label>
      <label class="f"><span>Ref # (sample, ticket, PO)</span><input id="q-ref"></label>
      <label class="f"><span>Once it clears, you can…</span><input id="q-resume"></label>
    </div>
    <div class="row"><button class="btn pri" type="button" id="q-add">Log it</button>
      <label class="btn" for="q-photo" style="cursor:pointer">Add photo</label><input id="q-photo" type="file" accept="image/*" capture="environment" hidden></div>
    <div class="psr" id="q-photoform" hidden>
      <img id="q-prev" class="photo-img" alt="New photo">
      <label class="f"><span>What it shows</span><textarea id="q-cap" rows="2" placeholder="e.g. Hose rubbed through on frame bracket, LH side"></textarea></label>
      <label class="f"><span>Pin to step</span><select id="q-pin">${pinOpts}</select></label>
      <div class="row"><button class="btn pri" type="button" id="q-psave">Save photo</button><button class="btn" type="button" id="q-pcancel">Cancel</button></div>
    </div>
  </div>

  <div class="panel" style="margin-top:10px"><h2>Timeline</h2><div class="tl">${tl || '<span class="note">Nothing logged yet.</span>'}</div></div>

  <details class="panel" data-det="wo" style="margin-top:10px" ${openDetails || !j.wo || ui.open.wo ? 'open' : ''}><summary><h2 style="display:inline-block">Work order &amp; machine</h2></summary>
    <div class="grid2">${fld(job, 'wo', 'Service call #', 'inputmode="numeric" id="f-wo"')}${fld(job, 'date', 'Date', 'type="date"')}${fld(job, 'smu', 'Hours (SMU)', 'inputmode="decimal"')}${sel(job, 'status', 'Status', R.STATUS)}</div>
    <div class="grid2">${sel(job, 'make', 'Make', R.MAKES)}${fld(job, 'model', 'Model', 'list="dl-models"')}${fld(job, 'serial', 'Serial / PIN', 'style="text-transform:uppercase"')}</div>
    <div class="grid2">${sel(job, 'category', 'Record type', R.CATS)}${fld(job, 'customer', 'Customer')}${fld(job, 'stockNo', 'Stock / unit #')}</div>
    <datalist id="dl-models">${(R.MODELS[j.make] || []).map(m => `<option value="${m}">`).join('')}</datalist>
    ${j.make === 'cat' ? `<div class="row"><a class="btn sm" href="#/parts?job=${id}" id="j-parts">Look up parts for this machine</a></div>` : ''}
  </details>

  <details class="panel" data-det="codes" style="margin-top:10px" ${ui.open.codes ? 'open' : ''}><summary><h2 style="display:inline-block">Codes, findings &amp; shop notes</h2></summary>
    ${area(job, 'dtcs', 'Codes (' + mk.tool + '): one per line', mk.code)}
    <div class="cl"><label><input type="checkbox" data-rec="${id}" data-k="psrBefore" ${j.psrBefore ? 'checked' : ''}><span>Pulled ${esc(mk.psr.split(' with ')[0])} before repair</span></label><label><input type="checkbox" data-rec="${id}" data-k="psrAfter" ${j.psrAfter ? 'checked' : ''}><span>Pulled ${esc(mk.psr.split(' with ')[0])} after repair</span></label></div>
    ${area(job, 'procedure', 'Procedure followed (' + mk.info + ')', 'Title or media number', 2)}
    ${area(job, 'notes', 'Findings & work done (rough notes are fine)', '', 4)}
    ${area(job, 'support', 'Shop assist & time (internal only, kept out of the customer copy)', 'e.g. Helped another tech with diag on a separate job, 1.5 hr', 3)}
  </details>

  <div class="panel" style="margin-top:10px" id="rep">
    <div class="axh"><h2>Service report (AX)</h2><button class="btn sm" type="button" id="r-copyall">Copy all segments</button></div>
    <div class="chips">${segs.map((s, i) => `<button class="chip" type="button" data-seg="${s.id}" aria-pressed="${s.id === ui.seg}">${i + 1} · ${esc(s.fields.title)}</button>`).join('')}</div>
    <select id="r-segadd" aria-label="Add a segment"><option value="">+ Add segment…</option>${R.SEG_TPL.map((t, i) => `<option value="${i}">${t[0]}</option>`).join('')}</select>
    ${seg ? renderSeg(job, seg, segs, mk) : ''}
  </div>

  <div class="panel" style="margin-top:10px"><div class="row"><button class="btn danger" type="button" id="j-del">Delete job</button><span id="j-delc" hidden><button class="btn sm danger" type="button" id="j-dely">Delete for good</button> <button class="btn sm" type="button" id="j-deln">Keep</button></span></div></div>`;

  bindFields(v);
  hydratePhotos(v);
  $$('details[data-det]', v).forEach(d => d.addEventListener('toggle', () => ui.open[d.dataset.det] = d.open));
  $('#q-text').addEventListener('input', e => ui.draft = e.target.value);
  if (ui.newPhoto) { $('#q-prev').src = URL.createObjectURL(ui.newPhoto); $('#q-photoform').hidden = false; }
  if (openDetails && !j.wo) setTimeout(() => $('#f-wo') && $('#f-wo').focus(), 50);

  // quick log
  $$('[data-kind]', v).forEach(b => b.onclick = () => { ui.kind = b.dataset.kind; $$('[data-kind]', v).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.kind === ui.kind))); $('#q-text').placeholder = R.TL[ui.kind].ph; $('#q-wait').hidden = !(ui.kind === 'pending' || ui.kind === 'part'); if (ui.kind === 'part') $('#q-wtype').value = 'part'; });
  $('#q-add').onclick = async () => {
    const text = $('#q-text').value.trim(); if (!text) { $('#q-text').focus(); return; }
    const f = { kind: ui.kind, text, at: Date.now() };
    if (ui.kind === 'next' || ui.kind === 'pending') f.open = true;
    if (ui.kind === 'part') f.pstate = 'ordered';
    if (ui.kind === 'pending' || ui.kind === 'part') { const wt = $('#q-wtype').value; Object.assign(f, { wtype: wt, who: $('#q-who').value.trim() || R.WAIT[wt].who, ref: $('#q-ref').value.trim(), resume: $('#q-resume').value.trim() }); }
    if (ui.kind === 'next') for (const e of entriesOf(id)) if (e.fields.kind === 'next' && e.fields.open) await store.update(e.id, { open: false });
    $('#q-add').disabled = true;
    await store.create('entry', id, f); ui.draft = '';
    toast('Saved on ' + here); render();
    setTimeout(() => { const t = $('#q-text'); if (t) t.focus(); }, 30);
  };
  $('#q-photo').onchange = () => {
    const file = $('#q-photo').files[0]; $('#q-photo').value = '';
    if (!file) return;
    ui.newPhoto = file; $('#q-prev').src = URL.createObjectURL(file); $('#q-photoform').hidden = false;
    const r2 = R.resumeOf(entriesOf(id)); if (r2.last) $('#q-pin').value = r2.last.id;
  };
  $('#q-pcancel').onclick = () => { ui.newPhoto = null; $('#q-photoform').hidden = true; };
  $('#q-psave').onclick = async () => {
    if (!ui.newPhoto) return;
    $('#q-psave').disabled = true;
    const pid = store.uuid(), s = backend.session();
    await store.putBlob(pid, ui.newPhoto, false);                     // file first, then the record that points at it
    await store.create('photo', id, { path: (s ? s.user.id : 'local') + '/' + id + '/' + pid + '.jpg', caption: $('#q-cap').value.trim(), pin: $('#q-pin').value, at: Date.now(), type: ui.newPhoto.type || 'image/jpeg', size: ui.newPhoto.size }, pid);
    ui.newPhoto = null; toast('Photo saved on ' + here); render();
  };
  // timeline actions
  $$('[data-close]', v).forEach(b => b.onclick = async () => {
    const e = store.get(b.dataset.close); await store.update(e.id, { open: false });
    if (e.fields.kind === 'next') await store.create('entry', id, { kind: 'step', text: e.fields.text, at: Date.now() });
    else await store.create('entry', id, { kind: 'note', text: 'Cleared: ' + e.fields.text, at: Date.now() });
    if (e.fields.resume) { for (const x of entriesOf(id)) if (x.fields.kind === 'next' && x.fields.open) await store.update(x.id, { open: false }); await store.create('entry', id, { kind: 'next', text: e.fields.resume, open: true, at: Date.now() + 1 }); }
    render();
  });
  $$('[data-adv]', v).forEach(b => b.onclick = async () => {
    const e = store.get(b.dataset.adv), next = (e.fields.pstate || 'ordered') === 'ordered' ? 'received' : 'installed';
    await store.update(e.id, { pstate: next });
    await store.create('entry', id, { kind: 'note', text: 'Part ' + next + ': ' + e.fields.text, at: Date.now() });
    if (next === 'received' && e.fields.resume) await store.create('entry', id, { kind: 'next', text: e.fields.resume, open: true, at: Date.now() + 1 });
    render();
  });
  $$('[data-del]', v).forEach(b => b.onclick = async () => { if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'tap again'; return; } await store.remove(b.dataset.del); render(); });
  $$('[data-keep]', v).forEach(b => b.onclick = async () => { await store.resolve(b.dataset.cid, b.dataset.ck, b.dataset.keep); toast('Kept'); render(); });
  // job delete
  $('#j-del').onclick = () => $('#j-delc').hidden = false;
  $('#j-deln').onclick = () => $('#j-delc').hidden = true;
  $('#j-dely').onclick = async () => { await store.remove(id); for (const r of [...segs, ...entries, ...photos]) await store.remove(r.id); location.hash = '#/'; };
  // report editor
  $$('[data-seg]', v).forEach(b => b.onclick = () => { ui.seg = b.dataset.seg; render(); setTimeout(() => $('#rep').scrollIntoView(), 0); });
  $('#r-segadd').onchange = async e => { const t = R.SEG_TPL[+e.target.value]; if (!t) return; const s = await store.create('seg', id, R.segDefaults(t[0] === 'Custom segment' ? 'New segment' : t[0], t[1], segs.length + 1)); ui.seg = s.id; render(); };
  $('#r-copyall').onclick = () => copy(segsOf(id).map((s, i) => '--- Segment ' + (i + 1) + ': ' + s.fields.title + ' ---\n' + R.AXF.map(([k, n]) => n + ': ' + (s.fields[k] || '')).join('\n')).join('\n\n'));
  if (seg) wireSeg(v, job, seg);
  // save model/serial typed in the last moment (fields save 350 ms after typing stops) before leaving
  if ($('#j-parts')) $('#j-parts').onclick = async e => {
    e.preventDefault();
    const patch = {}; for (const k of ['model', 'serial']) { const el = $(`[data-rec="${id}"][data-k="${k}"]`, v); if (el) { clearTimeout(timers[id + k]); patch[k] = el.value; } }
    await store.update(id, patch); location.hash = '#/parts?job=' + id;
  };
}

function renderSeg(job, seg, segs, mk) {
  const s = seg.fields, locked = R.partLocked(s);
  return `<div class="grid2" style="margin-top:4px">${fld(seg, 'title', 'Segment title')}</div>
    ${area(seg, 'notes', 'Notes for this segment only', '', 2)}
    <div class="cl"><label><input type="checkbox" id="s-warr" ${s.warranty ? 'checked' : ''}><span><b>Warranty segment</b></span></label><label><input type="checkbox" id="s-part" ${s.hasPart ? 'checked' : ''}><span><b>Replaced or repaired a specific part</b></span></label></div>
    <p class="note">${locked ? 'Not warranty with a specific part: part number 0000000, group 7595.' : 'Warranty part: enter the part and group from ' + esc(mk.parts) + '.'}</p>
    <div class="row"><button class="btn pri" type="button" id="r-gen">Write this segment with Claude</button><span class="note" id="r-msg"></span></div>
    ${Array.isArray(s.questions) && s.questions.length ? '<div class="warnbox"><b>Questions:</b> ' + s.questions.map(esc).join(' · ') + '</div>' : ''}
    <div class="psr" id="r-manual" ${ui.prompt ? '' : 'hidden'}>
      <p class="note" style="margin:0">If the report service isn't set up, copy this prompt into Claude, then paste Claude's reply below.</p>
      <div class="row"><button class="btn sm" type="button" id="r-copyp">Copy prompt for Claude</button></div>
      <textarea id="r-prompt" rows="4" readonly>${esc(ui.prompt)}</textarea>
      <label class="f"><span>Paste Claude's reply</span><textarea id="r-paste" rows="4"></textarea></label>
      <div class="row"><button class="btn pri sm" type="button" id="r-apply">Apply to segment</button></div>
    </div>
    <div class="ax">${R.AXF.map(([k, n, t], i) => `<div class="axf"><div class="axn">${i + 1}</div><div class="axb">
      <div class="axh"><span>${n}</span><small data-cc="${seg.id + k}">${String(s[k] || '').length} ch</small><button class="btn sm" type="button" data-copy="${k}">Copy</button></div>
      ${t === 'ta' ? `<textarea data-rec="${seg.id}" data-k="${k}" rows="${k === 'repair' ? 7 : 2}">${esc(s[k])}</textarea>` : `<input data-rec="${seg.id}" data-k="${k}" value="${esc(s[k])}"${(k === 'part' || k === 'group') && locked ? ' readonly' : ''}>`}
    </div></div>`).join('')}</div>
    ${segs.length > 1 ? `<div class="row"><button class="btn sm danger" type="button" id="s-del">Remove segment</button></div>` : ''}`;
}
function wireSeg(v, job, seg) {
  const id = job.id;
  const partRule = async () => {
    const s = store.get(seg.id).fields;
    if (R.partLocked(s)) await store.update(seg.id, R.NO_PART);
    else if (s.part === R.NO_PART.part) await store.update(seg.id, { part: '', group: '' });
    render();
  };
  $('#s-warr').onchange = async e => { await store.update(seg.id, { warranty: e.target.checked }); partRule(); };
  $('#s-part').onchange = async e => { await store.update(seg.id, { hasPart: e.target.checked }); partRule(); };
  $$('[data-copy]', v).forEach(b => b.onclick = () => { const f = $(`[data-rec="${seg.id}"][data-k="${b.dataset.copy}"]`, v); copy(f.value, f); });
  if ($('#s-del')) $('#s-del').onclick = async () => { await store.remove(seg.id); ui.seg = null; render(); };
  const build = () => R.draftPrompt(store.get(id), store.get(seg.id), segsOf(id), entriesOf(id), photosOf(id));
  const apply = async out => {
    const patch = {};
    ['complaint', 'repair', 'causing', 'damage', 'internal'].forEach(k => { if (typeof out[k] === 'string') patch[k] = out[k].trim(); });
    patch.questions = Array.isArray(out.questions) ? out.questions : [];
    await store.update(seg.id, patch);
    ui.prompt = ''; render(); toast(patch.questions.length ? 'Written. Answer the questions, then write again.' : 'Segment written. Check it before posting to AX.');
  };
  $('#r-gen').onclick = async () => {
    const msg = $('#r-msg'), b = $('#r-gen');
    const prompt = build();
    if (!backend.ready || !backend.session() || !navigator.onLine) { ui.prompt = prompt; render(); $('#r-msg').textContent = navigator.onLine ? 'Report service not set up.' : 'Offline. Copy the prompt to Claude, or try again when online.'; return; }
    b.disabled = true; msg.textContent = 'Writing… up to a minute.';
    try { const r = await backend.report(prompt); await apply(R.parseReply(r.text)); }
    catch (e) { ui.prompt = prompt; render(); $('#r-msg').textContent = 'The report service didn\'t answer (' + e.message + '). Use the prompt below.'; }
  };
  if ($('#r-copyp')) $('#r-copyp').onclick = () => copy($('#r-prompt').value, $('#r-prompt'));
  if ($('#r-apply')) $('#r-apply').onclick = async () => {
    try { await apply(R.parseReply($('#r-paste').value)); }
    catch (e) { toast('That reply isn\'t the JSON Claude was asked for. Paste the whole reply.'); }
  };
}

/* ---------------- parts lookup ---------------- */
const partRecs = () => store.list('part');
const partRows = () => [...partRecs().map(r => ({ ...Object.fromEntries(P.COLS.map(c => [c, ''])), ...r.fields, _id: r.id })), ...P.SEED];
const EVC = { pin: 'var(--good)', serial: 'var(--good)', model: 'var(--amber)', cross: 'var(--bad)', none: 'var(--bad)' };
const uv = v => (String(v ?? '').trim() ? esc(v) : '<span class="uv">unverified</span>');

function renderParts(v, qs) {
  const pp = ui.parts, jobId = qs.get('job'), job = jobId && store.get(jobId) && !store.get(jobId).deleted ? store.get(jobId) : null;
  if (job && pp.job !== job.id) { pp.job = job.id; pp.model = job.fields.model || ''; pp.pin = job.fields.serial || ''; pp.q = ''; }
  if (!job) pp.job = null;
  const models = [...new Set([...partRows().map(r => r.model), ...(R.MODELS.cat || [])].filter(Boolean))].sort();
  const files = Object.entries(partRecs().reduce((m, r) => { const f = r.fields.import_file || 'Imported'; m[f] = (m[f] || 0) + 1; return m; }, {}));
  const pState = store.getMeta('partsSync'), pPending = partRecs().filter(r => store.state(r) === 'pending').length;
  v.innerHTML = `
  ${job ? `<div class="view-top" style="margin-top:14px"><a href="#/job/${job.id}" class="btn sm">‹ ${esc(jobTitle(job))}</a><span class="note">${esc(machineLine(job))}</span></div>` : ''}
  <div class="panel" style="margin-top:${job ? 10 : 14}px">
    <h2>Find a part</h2>
    <div class="grid2">
      <label class="f"><span>Part, name, group or alias</span><input id="p-q" value="${esc(pp.q)}" placeholder="e.g. suction screen, 262-5689, breather" autocomplete="off" enterkeyhint="search"></label>
      <label class="f"><span>Exact model</span><input id="p-model" value="${esc(pp.model)}" list="dl-pmodels" placeholder="e.g. 299D3 XE" autocomplete="off" style="text-transform:uppercase"></label>
      <label class="f"><span>Serial / PIN</span><input id="p-pin" value="${esc(pp.pin)}" placeholder="Full PIN or serial" autocomplete="off" style="text-transform:uppercase"></label>
    </div>
    <datalist id="dl-pmodels">${models.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
    <div class="note" id="p-pinnote"></div>
  </div>
  <div id="p-results" class="list" style="margin-top:10px"></div>

  <details class="panel" data-det="pimport" style="margin-top:10px" ${ui.open.pimport ? 'open' : ''}><summary><h2 style="display:inline-block">Add SIS 2.0 records</h2></summary>
    <ol class="steps">
      <li>In SIS 2.0, select the exact PIN, open Parts, and capture the group illustration and BOM with the group header and serial applicability.</li>
      <li>Give Claude the pages with this prompt: <button class="btn sm" type="button" id="p-prompt">Copy extraction prompt</button></li>
      <li>Check the CSV against the diagram, then import it here. Importing the same file again updates rows instead of duplicating them.</li>
    </ol>
    <div class="row"><label class="btn" for="p-file" style="cursor:pointer">Choose CSV file</label><input id="p-file" type="file" accept=".csv,text/csv,text/plain" hidden></div>
    <label class="f"><span>Or paste the CSV</span><textarea id="p-paste" rows="4" placeholder="${esc(P.COLS.slice(0, 6).join(','))},…"></textarea></label>
    <label class="f"><span>Name for this import</span><input id="p-name" placeholder="e.g. 299D3_DY9_Hydraulic_345-4581.csv"></label>
    <div class="row"><button class="btn pri" type="button" id="p-import">Import pasted CSV</button></div>
    <div id="p-imsg" class="note" role="status"></div>
    ${files.length ? `<div class="psr"><h4>On file (${partRecs().length} rows)</h4>${files.map(([f, n]) => `<div class="row" style="justify-content:space-between"><span><b>${esc(f)}</b> <span class="note">${n} row${n > 1 ? 's' : ''}</span></span><button class="btn sm danger" type="button" data-pfile="${esc(f)}">Remove</button></div>`).join('')}
      <div class="row"><button class="btn sm" type="button" id="p-export">Export imported rows as CSV</button></div></div>` : ''}
    <p class="note" style="margin:0">${!backend.ready ? 'Imported rows stay on this device (sync not set up).' : pState && pState.ok === false ? (/check constraint|kind/i.test(pState.error || '') ? `<b style="color:var(--bad)">Imported rows aren't syncing yet.</b> Run <code>supabase/migrations/002_parts.sql</code> once in the Supabase SQL Editor. Until then they stay on this ${here}; jobs sync as normal.` : `<b style="color:var(--bad)">Imported rows didn't sync</b> (${esc(pState.error)}). They're safe on this ${here} and will retry; jobs sync as normal.`) : pPending ? pPending + ' imported row(s) waiting to sync.' : partRecs().length ? 'Imported rows sync to your other devices.' : ''}</p>
  </details>

  <details class="panel" data-det="psrc" style="margin-top:10px" ${ui.open.psrc ? 'open' : ''}><summary><h2 style="display:inline-block">Sources &amp; rules</h2></summary>
    <ul class="srcs">${P.LINKS.map(([n, u, d]) => `<li><a href="${u}" target="_blank" rel="noopener">${esc(n)}</a>${d ? ' <span class="note">· ' + esc(d) + '</span>' : ''}</li>`).join('')}</ul>
    <h4 class="sub">Starter index references</h4>
    <ul class="srcs">${Object.entries(P.SOURCES).map(([k, s]) => `<li><b>${k}.</b> <a href="${s.url}" target="_blank" rel="noopener">${esc(s.name)}</a> <span class="pill ${s.grade === 'cat' ? 'done' : 'parts'}">${s.grade === 'cat' ? 'Cat' : 'third-party copy'}</span></li>`).join('')}</ul>
    <p class="note" style="margin:0">The starter index comes from public references, not SIS 2.0. Only rows imported from SIS with a verified date show as SIS verified. A drawing quantity isn't an order quantity, and a current substitution is unknown until it's documented.</p>
  </details>`;

  const draw = () => {
    const res = P.search(partRows(), pp), note = $('#p-pinnote');
    const fromPrefix = res.pin ? P.modelsForPrefix(res.pin.prefix) : [];
    const bits = [];
    if (pp.pin && !res.pin) bits.push('<span style="color:var(--bad)">Couldn\'t read that serial. Enter the 17-character PIN or the 8-character serial (prefix + 5 digits).</span>');
    if (res.pin) bits.push(`Read as ${esc(res.pin.form)}: prefix <b>${esc(res.pin.prefix)}</b>${res.pin.seq ? ', serial ' + esc(res.pin.seq) : ''}.`);
    if (fromPrefix.length) bits.push(`The public D3 guide lists ${esc(res.pin.prefix)} under ${fromPrefix.map(esc).join(', ')} (not SIS coverage).`);
    if (fromPrefix.length && pp.model && !fromPrefix.some(m => P.normModel(m) === P.normModel(pp.model))) bits.push(`<b style="color:var(--bad)">That prefix is listed for ${fromPrefix.map(esc).join(', ')}, not ${esc(pp.model.toUpperCase())}. Check the model suffix.</b>`);
    note.innerHTML = bits.join(' ');
    const cards = res.rows.map(r => {
      const ev = P.evidence(r), rec = r._seed ? null : store.get(r._id);
      return `<article class="pcard" style="--ev:${EVC[ev.key]}">
        <div class="pchead"><span class="pn">${esc(r.part_number)}</span><span class="pd">${esc(r.part_description) || '<span class="uv">no description</span>'}</span><span class="ev">${esc(ev.label)}</span></div>
        <dl class="pdl">
          <div><dt>Machine &amp; applicability</dt><dd>${uv(P.applicability(r))}</dd></div>
          <div><dt>Group</dt><dd>${r.group_number || r.group_name ? esc((r.group_number + ' ' + r.group_name).trim()) : '<span class="uv">unverified</span>'}</dd></div>
          <div><dt>Item</dt><dd>${uv(r.item_number)}</dd></div>
          <div><dt>Qty per group</dt><dd>${uv(r.quantity)}</dd></div>
          <div><dt>Associated</dt><dd>${[r.related_seal && 'Seal ' + esc(r.related_seal), r.parent_part_number && 'Parent ' + esc(r.parent_part_number), r.replaced_by && 'Replaced by ' + esc(r.replaced_by)].filter(Boolean).join(' · ') || '<span class="note">None listed</span>'}</dd></div>
          <div><dt>Source</dt><dd>${r._seed ? 'Starter index · ' + r.source_reference.split(/,\s*/).map(k => P.SOURCES[k] ? `<a href="${P.SOURCES[k].url}" target="_blank" rel="noopener" title="${esc(P.SOURCES[k].name)}">${k}</a>` : esc(k)).join(', ') : esc([r.source_type, r.source_reference, r.diagram_id].filter(Boolean).join(' · ')) || '<span class="uv">unverified</span>'}${r.source_page ? ' · ' + esc(r.source_page) : ''}${r.verified_on ? ' · checked ' + esc(r.verified_on) : ''}</dd></div>
        </dl>
        ${r.notes ? `<p class="note" style="margin:0">${esc(r.notes)}</p>` : ''}
        <div class="row"><button class="btn sm" type="button" data-pcopy="${esc(r._id)}">Copy line</button>${job ? `<button class="btn sm pri" type="button" data-padd="${esc(r._id)}">Log as part on ${esc(jobTitle(job))}</button>` : ''}${rec ? `<span class="row" style="margin-left:auto;gap:6px">${entryBadge(rec)}<button class="tdel" type="button" data-pdel="${rec.id}">delete</button></span>` : ''}</div>
      </article>`;
    }).join('');
    const hid = res.hidden.map(h => h.n + ' hidden for ' + h.reason).join(' · ');
    const need = [];
    if (res.rows.length && !res.pin) need.push('Serial breaks can change fitment: add the full PIN.');
    if (res.rows.length && !pp.model) need.push('Add the exact model, suffix included (299D3 and 299D3 XE are different machines).');
    if (res.rows.some(r => P.evidence(r).key !== 'pin')) need.push('Not order-ready until checked in SIS 2.0 against the exact PIN, with the illustrated parent group and item.');
    $('#p-results').innerHTML = (cards || `<div class="empty"><b>No matching records.</b><span>The index only holds what has been imported. Look it up in SIS 2.0 for the exact PIN and import the group here, or check the model suffix.</span></div>`)
      + (hid || need.length ? `<div class="warnbox">${hid ? '<div>' + esc(hid) + '.</div>' : ''}${need.map(n => '<div>' + esc(n) + '</div>').join('')}</div>` : '');
    const byId = id => res.rows.find(r => r._id === id);
    $$('[data-pcopy]', v).forEach(b => b.onclick = () => copy(P.answerLine(byId(b.dataset.pcopy))));
    $$('[data-padd]', v).forEach(b => b.onclick = async () => {
      const r = byId(b.dataset.padd), ev = P.evidence(r);
      await store.create('entry', job.id, { kind: 'part', text: `${r.part_number} ${r.part_description}`.trim() + ` (${ev.label}${r.group_number ? ', group ' + r.group_number : ''}; verify in SIS for this PIN)`, at: Date.now(), pstate: 'ordered', wtype: 'part', who: R.WAIT.part.who, ref: '', resume: '' });
      b.disabled = true; b.textContent = 'Logged on ' + jobTitle(job); toast('Part logged on the job');
    });
    $$('[data-pdel]', v).forEach(b => b.onclick = async () => { if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'tap again'; return; } await store.remove(b.dataset.pdel); draw(); });
  };
  const bindIn = (sel, k) => $(sel).addEventListener('input', e => { pp[k] = e.target.value; draw(); });
  bindIn('#p-q', 'q'); bindIn('#p-model', 'model'); bindIn('#p-pin', 'pin');
  $$('details[data-det]', v).forEach(d => d.addEventListener('toggle', () => ui.open[d.dataset.det] = d.open));
  draw();

  $('#p-prompt').onclick = () => copy(P.EXTRACT_PROMPT);
  const doImport = async (text, name) => {
    const msg = $('#p-imsg'), res = P.readImport(text);
    if (res.error) { msg.innerHTML = '<span style="color:var(--bad)">' + esc(res.error) + '</span>'; return; }
    if (!res.rows.length) { msg.textContent = 'No rows with a model and part number found.'; return; }
    msg.textContent = 'Importing…';
    let added = 0, updated = 0;
    const file = name || 'Pasted ' + today();
    for (const r of res.rows) {
      const fields = { ...r, import_file: file };
      let id = await uid5('part:' + P.rowKey(r)), cur = store.get(id);
      if (cur && cur.deleted) { id = store.uuid(); cur = null; }
      if (cur) { if (P.COLS.some(c => (cur.fields[c] || '') !== r[c]) || cur.fields.import_file !== file) { await store.update(id, fields); updated++; } }
      else { await store.create('part', null, fields, id); added++; }
    }
    ui.open.pimport = true; render();
    $('#p-imsg').innerHTML = esc(`${added} added, ${updated} updated, ${res.rows.length - added - updated} already on file.`)
      + (res.skipped.length ? '<br>Skipped: ' + res.skipped.map(s => 'line ' + s.line + ' (' + esc(s.why) + ')').join(', ') : '')
      + (res.unknown.length ? '<br>Columns not in the header, ignored: ' + res.unknown.map(esc).join(', ') : '');
  };
  $('#p-file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await doImport(await f.text(), f.name); };
  $('#p-import').onclick = () => { const t = $('#p-paste').value; if (!t.trim()) { $('#p-paste').focus(); return; } doImport(t, $('#p-name').value.trim()); };
  $$('[data-pfile]', v).forEach(b => b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Remove ' + b.closest('.row').querySelector('.note').textContent + '?'; return; }
    for (const r of partRecs().filter(r => (r.fields.import_file || 'Imported') === b.dataset.pfile)) await store.remove(r.id);
    ui.open.pimport = true; render(); toast('Removed');
  });
  if ($('#p-export')) $('#p-export').onclick = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([P.toCSV(partRecs().map(r => r.fields))], { type: 'text/csv' })); a.download = 'tech-bench-parts-' + today() + '.csv'; a.click();
  };
}

/* ---------------- settings ---------------- */
function renderSettings(v) {
  const s = backend.session(), last = sync.lastSync();
  v.innerHTML = `
  <div class="panel" style="margin-top:14px"><h2>Account &amp; sync</h2>
    ${backend.ready ? (s ? `<p style="margin:0">Signed in as <b>${esc(s.user.email)}</b>.</p>` : '<p>Not signed in.</p>') : '<div class="warnbox"><b>Sync isn\'t set up.</b> Everything stays on this device until config.js has your Supabase details.</div>'}
    <p class="note" style="margin:0">Last synced: ${last ? esc(when(last)) : 'never'} · ${store.pendingCount()} item(s) waiting · ${navigator.onLine ? 'online' : 'offline'}</p>
    <div class="row"><button class="btn" type="button" id="s-sync">Sync now</button>${s ? '<button class="btn" type="button" id="s-out">Sign out</button>' : ''}</div>
    <p class="note" id="s-msg"></p>
  </div>
  <div class="panel" style="margin-top:10px"><h2>Install on your devices</h2>
    <div class="installtip"><b>Android phone (Chrome):</b> open this page, tap ⋮ → <i>Add to Home screen</i> → <i>Install</i>.</div>
    <div class="installtip"><b>iPhone (Safari):</b> tap Share → <i>Add to Home Screen</i>.</div>
    <div class="installtip"><b>Windows 11 laptop (Edge or Chrome):</b> click the install icon at the right of the address bar, or ⋯ → <i>Apps</i> → <i>Install Tech Bench</i>. It gets a Start menu entry and its own window.</div>
    <button class="btn" type="button" id="s-install" hidden>Install now</button>
  </div>
  <div class="panel" style="margin-top:10px"><h2>Bring jobs over</h2>
    <p class="note">From the old Tech Bench page: Settings → <i>Export backup</i>, then choose that file here. Running it twice won't duplicate anything.</p>
    <input type="file" id="s-import" accept="application/json,.json">
    <div class="row"><button class="btn" type="button" id="s-export">Export backup from this app</button></div>
    <p class="note" id="s-imsg"></p>
  </div>`;
  $('#s-sync').onclick = async () => { $('#s-msg').textContent = 'Syncing…'; await sync.run(); $('#s-msg').textContent = sync.status.error ? 'Problem: ' + sync.status.error : 'Done.'; };
  if ($('#s-out')) $('#s-out').onclick = async () => {
    if (store.pendingCount() && !confirmTwice($('#s-out'))) { $('#s-msg').textContent = store.pendingCount() + ' item(s) haven\'t synced. Signing out keeps them on this device; tap again to sign out anyway.'; return; }
    await store.setMeta('session', null); render();
  };
  if (deferredInstall) { $('#s-install').hidden = false; $('#s-install').onclick = () => deferredInstall.prompt(); }
  $('#s-import').onchange = async e => { const f = e.target.files[0]; if (!f) return; $('#s-imsg').textContent = 'Importing…'; try { const n = await importBackup(JSON.parse(await f.text())); $('#s-imsg').textContent = 'Imported ' + n + ' job(s).'; } catch (err) { $('#s-imsg').textContent = 'Couldn\'t read that file: ' + err.message; } };
  $('#s-export').onclick = () => {
    const data = { app: 'techbench-app', version: 1, exportedAt: new Date().toISOString(), records: store.all().filter(r => !r.deleted).map(r => ({ id: r.id, kind: r.kind, parent: r.parent, fields: r.fields })) };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })); a.download = 'tech-bench-backup-' + today() + '.json'; a.click();
  };
}
function confirmTwice(btn) { if (btn.dataset.armed === '1') return true; btn.dataset.armed = '1'; return false; }

/* old Tech Bench (artifact) backup -> records; ids derived from the old ids so a second import is a no-op */
async function uid5(s) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode('techbench:' + s)));
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = [...h.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}
async function importBackup(d) {
  if (d.app === 'techbench-app') { let n = 0; for (const r of d.records) if (!store.get(r.id)) { await store.create(r.kind, r.parent, r.fields, r.id); if (r.kind === 'job') n++; } return n; }
  const machines = Object.fromEntries((d.machines || []).map(m => [m.id, m]));
  let n = 0;
  for (const oj of d.jobs || []) {
    const jid = await uid5('job:' + oj.id); if (store.get(jid)) continue;
    const m = machines[oj.machineId] || {};
    await store.create('job', null, { wo: oj.wo || '', date: oj.date || today(), smu: oj.smu || m.smu || '', status: oj.status || 'open', make: m.make || 'cat', model: m.model || '', serial: m.serial || '', customer: m.customer || '', category: m.category || 'customer', stockNo: m.stockNo || '', dtcs: oj.dtcs || '', procedure: oj.procedure || '', notes: oj.notes || '', support: oj.support || '', psrBefore: oj.psrBefore !== false, psrAfter: oj.psrAfter !== false, createdAt: oj.created || Date.now(), imported: true }, jid);
    const segs = oj.segs && oj.segs.length ? oj.segs : [{ id: 's', title: 'Main repair', f: { ...R.AX_DEFAULT, ...(oj.f || {}) } }];
    let i = 0;
    for (const s of segs) { i++; await store.create('seg', jid, { ...R.segDefaults(s.title || 'Main repair', '', i), ...(s.f || {}), notes: s.notes || '', warranty: !!s.warranty, hasPart: !!s.hasPart, order: i }, await uid5('seg:' + oj.id + ':' + (s.id || i))); }
    for (const e of oj.log || []) {
      const f = { kind: e.kind === 'photo' ? 'note' : e.kind, text: e.kind === 'photo' ? 'Photo in old Tech Bench: ' + (e.text || '') : e.text, at: e.at };
      ['open', 'pstate', 'wtype', 'who', 'ref', 'resume'].forEach(k => { if (e[k] !== undefined) f[k] = e[k]; });
      await store.create('entry', jid, f, await uid5('entry:' + oj.id + ':' + e.id));
    }
    if ((oj.photos || []).length) await store.create('entry', jid, { kind: 'note', text: oj.photos.length + ' photo(s) are in the old Tech Bench page for this job.', at: Date.now() }, await uid5('photos:' + oj.id));
    n++;
  }
  return n;
}

/* ---------------- boot ---------------- */
let deferredInstall = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
addEventListener('hashchange', () => { ui.prompt = ''; ui.draft = ''; ui.newPhoto = null; render(); scrollTo(0, 0); });
addEventListener('online', refreshBadges); addEventListener('offline', refreshBadges);

(async () => {
  await store.open();
  store.on(e => { if (e.type === 'remote' && e.changed) softRender(); else refreshBadges(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  render(); refreshBadges();
  sync.start();
})();
