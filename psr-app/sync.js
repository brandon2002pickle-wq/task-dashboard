// PSR Tool data layer: everything is saved on the device first (IndexedDB), then synced to the
// signed-in Supabase account when there is one. It replaces the Claude page runtime the tool
// used as an artifact (db, user, sample, dictation).
//
//  - Docs are whole JSON objects (a PSR case or one machine's telematics) keyed by id, with an
//    `upd` timestamp. The newest `upd` wins on every device; the server applies the same rule.
//  - Deletes are kept as tombstones until the server has them, so other devices hear about them.
//  - AI reads go to the `psr` Edge Function (Claude on your Anthropic key). Without an account or
//    the function, the same prompt is shown to copy into Claude and the reply is pasted back.

const DB_NAME = 'psrtool', DB_VER = 1;
let idb = null;
const meta = {};
const docs = new Map();          // id -> doc
const listeners = new Set();
const emit = what => listeners.forEach(f => { try { f(what); } catch (e) { console.error(e); } });
const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const os = (s, mode = 'readonly') => idb.transaction(s, mode).objectStore(s);
const clone = o => JSON.parse(JSON.stringify(o));

export const store = {
  async open() {
    idb = await new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => { r.result.createObjectStore('docs', { keyPath: 'id' }); r.result.createObjectStore('meta'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    (await rq(os('docs').getAll())).forEach(d => docs.set(d.id, d));
    const ks = await rq(os('meta').getAllKeys()), vs = await rq(os('meta').getAll());
    ks.forEach((k, i) => meta[k] = vs[i]);
    if (!meta.dirty) meta.dirty = {};
    // one-time carry-over from the artifact's browser storage, if this browser ever had it
    if (!meta.migrated) {
      for (const key of ['psrdiag.v1', 'psrdiag.telem.v1']) {
        try { JSON.parse(localStorage.getItem(key) || '[]').forEach(d => { if (d && d.id && !docs.has(d.id)) this.put(d, true); }); } catch (e) {}
      }
      await this.setMeta('migrated', true);
    }
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit,
  getMeta: k => meta[k],
  async setMeta(k, v) { meta[k] = v; await rq(os('meta', 'readwrite').put(v, k)); },
  list: () => [...docs.values()].filter(d => !d._deleted),
  /** save a doc on this device and queue it for sync; keepUpd keeps an imported doc's own time */
  async put(doc, keepUpd) {
    if (!keepUpd || !doc.upd) doc.upd = Date.now();
    const copy = clone(doc);
    docs.set(doc.id, copy);
    meta.dirty[doc.id] = copy.upd;
    await rq(os('docs', 'readwrite').put(copy));
    await this.setMeta('dirty', meta.dirty);
    emit({ type: 'local', id: doc.id });
  },
  async remove(id) {
    const t = { id, _deleted: true, upd: Date.now() };
    docs.set(id, t); meta.dirty[id] = t.upd;
    await rq(os('docs', 'readwrite').put(t));
    await this.setMeta('dirty', meta.dirty);
    emit({ type: 'local', id });
  },
  /** apply a doc that came from the server (newer upd wins) */
  async applyRemote(id, doc, upd, deleted) {
    const cur = docs.get(id);
    if (cur && (cur.upd || 0) > upd) return false;
    if (cur && (cur.upd || 0) === upd && !!cur._deleted === !!deleted) return false;
    const v = deleted ? { id, _deleted: true, upd } : { ...doc, id, upd };
    docs.set(id, v); await rq(os('docs', 'readwrite').put(v));
    if (meta.dirty[id] && meta.dirty[id] <= upd) { delete meta.dirty[id]; await this.setMeta('dirty', meta.dirty); }
    return true;
  },
  get: id => docs.get(id),
  dirtyCount: () => Object.keys(meta.dirty).length,
  async markClean(id, upd) { if (meta.dirty[id] === upd) { delete meta.dirty[id]; await this.setMeta('dirty', meta.dirty); } },
  /** everything except tombstones, for a backup file */
  exportAll: () => ({ app: 'psr-tool', version: 1, exported: new Date().toISOString(), docs: [...docs.values()].filter(d => !d._deleted) })
};

/* ---------------- Supabase over plain HTTP: Auth, PostgREST, Functions ---------------- */
export function makeBackend(cfg) {
  const url = (cfg.supabaseUrl || '').replace(/\/$/, ''), anon = cfg.supabaseAnonKey || '';
  const ready = !!(url && anon);
  const sess = () => store.getMeta('session');
  const H = (extra = {}) => ({ apikey: anon, Authorization: 'Bearer ' + ((sess() && sess().access_token) || anon), ...extra });
  async function call(path, opts = {}, retry = true) {
    const r = await fetch(url + path, { ...opts, headers: H(opts.headers) });
    if (r.status === 401 && retry && sess() && sess().refresh_token && await refresh()) return call(path, opts, false);
    return r;
  }
  async function asJson(r) {
    let b = null; try { b = await r.json(); } catch (e) {}
    if (!r.ok) { const e = new Error((b && (b.msg || b.message || b.error_description || b.error)) || ('HTTP ' + r.status)); e.status = r.status; e.body = b; throw e; }
    return b;
  }
  async function keep(s) {
    if (!s || !s.access_token) return null;
    const v = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), user: { id: s.user.id, email: s.user.email } };
    await store.setMeta('session', v); return v;
  }
  async function refresh() {
    const s = sess(); if (!s) return false;
    try {
      const r = await fetch(url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
      if (!r.ok) return false;
      await keep(await r.json()); return true;
    } catch (e) { return false; }
  }
  return {
    ready, session: sess,
    async signIn(email, password) {
      return keep(await asJson(await fetch(url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })));
    },
    async signUp(email, password) {
      const b = await asJson(await fetch(url + '/auth/v1/signup', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }));
      return b && b.access_token ? keep(b) : null;   // null: confirm the email first
    },
    async signOut() { await store.setMeta('session', null); await store.setMeta('cursor', 0); },
    async ensureFresh() { const s = sess(); if (s && s.expires_at * 1000 - Date.now() < 120000) await refresh(); },
    async put(id, doc, upd, deleted) {
      return asJson(await call('/rest/v1/rpc/psr_put', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: id, p_doc: deleted ? null : doc, p_upd: upd, p_deleted: !!deleted }) }));
    },
    async pull(cursor) {
      return asJson(await call(`/rest/v1/psr_docs?select=id,doc,upd,deleted,seq&seq=gt.${cursor || 0}&order=seq.asc&limit=200`));
    },
    async ask(body) {
      return asJson(await call('/functions/v1/' + (cfg.psrFunction || 'psr'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    }
  };
}

/* ---------------- sync engine ---------------- */
export function makeSync(backend) {
  let running = false, again = false, timer = null, retryT = null;
  const status = { phase: 'local', error: '' };   // local | signed-out | syncing | synced | offline | setup | error
  const set = (phase, error = '') => { status.phase = phase; status.error = error; emit({ type: 'sync', phase }); };
  async function run() {
    if (!backend.ready) return set('local');
    if (!backend.session()) return set('signed-out');
    // No navigator.onLine gate: it lags after the signal returns and iPhone Safari misreports it.
    // Just try; a failed fetch is what marks the device offline.
    if (running) { again = true; return; }
    clearTimeout(retryT);
    running = true; set('syncing');
    try {
      await backend.ensureFresh();
      // push every changed or deleted doc
      for (const [id, upd] of Object.entries(store.getMeta('dirty') || {})) {
        const d = store.get(id); if (!d) { await store.markClean(id, upd); continue; }
        const { upd: u, _deleted, ...body } = d;
        await backend.put(id, body, u, !!_deleted);
        await store.markClean(id, upd);
      }
      // pull what changed elsewhere
      let cursor = store.getMeta('cursor') || 0, changed = false;
      for (;;) {
        const rows = await backend.pull(cursor);
        for (const r of rows) { if (await store.applyRemote(r.id, r.doc, Number(r.upd), r.deleted)) changed = true; cursor = Math.max(cursor, Number(r.seq)); }
        await store.setMeta('cursor', cursor);
        if (rows.length < 200) break;
      }
      if (changed) emit({ type: 'remote' });
      set('synced');
    } catch (e) {
      const missing = e.status === 404 || /psr_docs|psr_put|schema cache/i.test(e.message || '');
      if (e.status === 401) { await backend.signOut(); set('signed-out', 'Signed out: sign in again.'); }
      else if (missing) set('setup', 'Sync table not set up yet (run supabase/migrations/003_psr.sql).');
      else {
        const net = !e.status;   // fetch itself failed: no signal, or the server unreachable
        set(net ? 'offline' : 'error', e.message || String(e));
        retryT = setTimeout(run, net ? 15000 : 30000);
      }
    } finally {
      running = false;
      if (again) { again = false; setTimeout(run, 50); }
    }
  }
  const soon = () => { clearTimeout(timer); timer = setTimeout(run, 800); };
  store.on(w => { if (w.type === 'local') soon(); });
  addEventListener('online', run);
  addEventListener('offline', () => set('offline'));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
  setInterval(() => { if (document.visibilityState === 'visible') run(); }, 60000);
  return { run, status };
}

/* ---------------- images: shrink photos before they leave the device ---------------- */
export async function shrinkImage(file, max = 1568) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const data = c.toDataURL('image/jpeg', 0.85).split(',')[1];
  return { media_type: 'image/jpeg', data };
}

/** pull the JSON object out of a model reply (tolerates ```json fences and stray text) */
export function parseJsonReply(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  const err = new Error('That reply is not valid JSON. Copy Claude\'s whole answer, including the { } braces.'); err.code = 'invalid_json'; throw err;
}

/* ---------------- dictation: the browser's own speech recognition ---------------- */
export function makeDictation() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  let rec = null, h = { partial: () => {}, final: () => {}, state: () => {}, error: () => {} };
  return {
    onPartial(f) { h.partial = f; }, onFinal(f) { h.final = f; }, onState(f) { h.state = f; }, onError(f) { h.error = f; },
    async start() {
      rec = new SR(); rec.lang = navigator.language || 'en-US'; rec.continuous = true; rec.interimResults = true;
      rec.onstart = () => h.state({ state: 'listening' });
      rec.onend = () => { h.state({ state: 'idle' }); rec = null; };
      // iPhone: speech recognition needs Siri & Dictation on, and can be unavailable in a Home Screen app
      rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') h.error({ code: 'not_granted', reason: e.error }); };
      rec.onresult = e => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) h.final({ text: r[0].transcript.trim() }); else interim += r[0].transcript; }
        h.partial({ text: interim });
      };
      rec.start();
    },
    async stop() { if (rec) rec.stop(); }
  };
}
