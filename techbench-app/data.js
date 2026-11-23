// Tech Bench data layer: every record lives in IndexedDB first, then syncs.
//  - Records: job, seg (AX segment), entry (timeline line), photo. Client-made UUIDs.
//  - Each record tracks which fields changed locally (dirty) and the last synced value (base),
//    so a push only sends changed fields and the server can spot a field both devices edited.
//  - Photos stay as blobs on the device until uploaded; upload uses a fixed path + upsert,
//    so a retry can never create a second copy.

const DB_NAME = 'techbench', DB_VER = 1;
let idb = null;
const mem = new Map();           // id -> record
const blobs = new Map();         // id -> {blob, uploaded}
const meta = {};
const listeners = new Set();

function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function tx(store, mode = 'readonly') { return idb.transaction(store, mode).objectStore(store); }
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

function emit(what) { listeners.forEach(f => { try { f(what); } catch (e) { console.error(e); } }); }

export const store = {
  async open() {
    idb = await new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('records', { keyPath: 'id' });
        d.createObjectStore('blobs', { keyPath: 'id' });
        d.createObjectStore('meta');
      };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    (await req(tx('records').getAll())).forEach(r => mem.set(r.id, r));
    (await req(tx('blobs').getAll())).forEach(b => blobs.set(b.id, { blob: b.blob, uploaded: b.uploaded }));
    const keys = await req(tx('meta').getAllKeys()), vals = await req(tx('meta').getAll());
    keys.forEach((k, i) => meta[k] = vals[i]);
    if (!meta.deviceId) await this.setMeta('deviceId', uuid());
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  getMeta(k) { return meta[k]; },
  async setMeta(k, v) { meta[k] = v; await req(tx('meta', 'readwrite').put(v, k)); },

  get(id) { return mem.get(id); },
  list(kind, parent) {
    return [...mem.values()].filter(r => r.kind === kind && !r.deleted && (parent === undefined || r.parent === parent));
  },
  all() { return [...mem.values()]; },

  async save(rec) { mem.set(rec.id, rec); await req(tx('records', 'readwrite').put(rec)); },

  /** create a record on this device; resolves once it is safely in IndexedDB */
  async create(kind, parent, fields, id) {
    const rec = { id: id || uuid(), kind, parent: parent || null, fields: clone(fields) || {}, base: {}, dirty: {}, ver: {}, remote: false, deleted: false, delDirty: false, conflicts: {}, createdAt: Date.now(), localAt: Date.now() };
    Object.keys(rec.fields).forEach(k => { rec.dirty[k] = 1; rec.ver[k] = 1; });
    await this.save(rec); emit({ type: 'local', id: rec.id });
    return rec;
  },
  /** change fields on this device */
  async update(id, patch) {
    const rec = mem.get(id); if (!rec) return;
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      if (same(rec.fields[k], v)) continue;
      rec.fields[k] = clone(v); rec.ver[k] = (rec.ver[k] || 0) + 1; rec.dirty[k] = rec.ver[k]; changed = true;
    }
    if (!changed) return;
    rec.localAt = Date.now();
    await this.save(rec); emit({ type: 'local', id });
  },
  async remove(id) {
    const rec = mem.get(id); if (!rec) return;
    rec.deleted = true; rec.delDirty = true; rec.localAt = Date.now();
    await this.save(rec); emit({ type: 'local', id });
  },
  /** pick a side for a field both devices changed */
  async resolve(id, field, keep) {
    const rec = mem.get(id); if (!rec || !rec.conflicts[field]) return;
    const c = rec.conflicts[field];
    rec.base[field] = clone(c.theirs);
    if (keep === 'mine') { rec.fields[field] = clone(c.mine); rec.ver[field] = (rec.ver[field] || 0) + 1; rec.dirty[field] = rec.ver[field]; }
    else { rec.fields[field] = clone(c.theirs); delete rec.dirty[field]; }
    delete rec.conflicts[field];
    await this.save(rec); emit({ type: 'local', id });
  },

  async putBlob(id, blob, uploaded = false) {
    blobs.set(id, { blob, uploaded });
    await req(tx('blobs', 'readwrite').put({ id, blob, uploaded }));
  },
  getBlob(id) { return blobs.get(id); },
  async markUploaded(id) { const b = blobs.get(id); if (!b) return; b.uploaded = true; await req(tx('blobs', 'readwrite').put({ id, blob: b.blob, uploaded: true })); },

  /** 'conflict' | 'pending' | 'synced' — pending means saved here, not yet on the server */
  state(rec) {
    if (!rec) return 'pending';
    if (Object.keys(rec.conflicts || {}).length) return 'conflict';
    const b = rec.kind === 'photo' ? blobs.get(rec.id) : null;
    if (!rec.remote || rec.delDirty || Object.keys(rec.dirty).length || (b && !b.uploaded)) return 'pending';
    return 'synced';
  },
  // job data only: the parts library has its own status on the Parts page
  pendingCount() { return [...mem.values()].filter(r => r.kind !== 'part' && this.state(r) === 'pending').length; },
  conflictsFor(ids) { return [...mem.values()].filter(r => ids.has(r.id) && Object.keys(r.conflicts || {}).length); },
  async wipe() {
    mem.clear(); blobs.clear(); Object.keys(meta).forEach(k => k !== 'deviceId' && delete meta[k]);
    for (const s of ['records', 'blobs']) await req(tx(s, 'readwrite').clear());
    const devId = meta.deviceId; await req(tx('meta', 'readwrite').clear()); await this.setMeta('deviceId', devId);
    emit({ type: 'wipe' });
  },
  emit,
  uuid,
  same
};

/* ---------------- Supabase over plain HTTP (Auth, PostgREST, Storage, Functions) ---------------- */
export function makeBackend(cfg) {
  const url = (cfg.supabaseUrl || '').replace(/\/$/, ''), anon = cfg.supabaseAnonKey || '';
  const ready = !!(url && anon);
  const sess = () => store.getMeta('session');
  const H = (extra = {}) => ({ apikey: anon, Authorization: 'Bearer ' + ((sess() && sess().access_token) || anon), ...extra });

  async function call(path, opts = {}, retryAuth = true) {
    const r = await fetch(url + path, { ...opts, headers: H(opts.headers) });
    if (r.status === 401 && retryAuth && sess() && sess().refresh_token) { if (await refresh()) return call(path, opts, false); }
    return r;
  }
  async function asJson(r) { let b = null; try { b = await r.json(); } catch (e) {} if (!r.ok) { const err = new Error((b && (b.msg || b.message || b.error_description || b.error)) || ('HTTP ' + r.status)); err.status = r.status; throw err; } return b; }
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
    ready,
    session: sess,
    async signIn(email, password) {
      const r = await fetch(url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      return keep(await asJson(r));
    },
    async signUp(email, password) {
      const r = await fetch(url + '/auth/v1/signup', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const b = await asJson(r);
      if (b && b.access_token) return keep(b);
      return null;   // email confirmation required
    },
    async ensureFresh() { const s = sess(); if (s && s.expires_at * 1000 - Date.now() < 120000) await refresh(); },
    async push(rec, patch, expected, deleted) {
      const r = await call('/rest/v1/rpc/push_record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: rec.id, p_kind: rec.kind, p_parent: rec.parent, p_patch: patch, p_expected: expected, p_deleted: deleted }) });
      return asJson(r);
    },
    async pull(cursor) {
      const r = await call(`/rest/v1/records?select=id,kind,parent_id,fields,deleted,seq&seq=gt.${cursor || 0}&order=seq.asc&limit=500`);
      return asJson(r);
    },
    async upload(path, blob) {
      const r = await call('/storage/v1/object/photos/' + path.split('/').map(encodeURIComponent).join('/'), { method: 'POST', headers: { 'x-upsert': 'true', 'Content-Type': blob.type || 'image/jpeg' }, body: blob });
      if (!r.ok) await asJson(r);
    },
    async download(path) {
      const r = await call('/storage/v1/object/authenticated/photos/' + path.split('/').map(encodeURIComponent).join('/'));
      if (!r.ok) await asJson(r);
      return r.blob();
    },
    async report(prompt) {
      const r = await call('/functions/v1/' + (cfg.reportFunction || 'report'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
      return asJson(r);
    }
  };
}

/* ---------------- sync engine ---------------- */
export function makeSync(backend) {
  let running = false, again = false, timer = null, retryT = null, last = { at: 0, error: '' };
  const status = { phase: 'idle' };   // idle | syncing | offline | error | signed-out | local
  const set = (phase, error) => { status.phase = phase; status.error = error || ''; store.emit({ type: 'sync', phase }); };

  async function pushRecord(rec) {
    const patch = {}, expected = {}, sent = {};
    for (const k of Object.keys(rec.dirty)) { patch[k] = rec.fields[k] === undefined ? null : rec.fields[k]; sent[k] = rec.ver[k]; if (rec.remote) expected[k] = rec.base[k] === undefined ? null : rec.base[k]; }
    const delSent = rec.delDirty;
    if (rec.remote && !Object.keys(patch).length && !delSent) return;
    const out = await backend.push(rec, patch, rec.remote ? expected : {}, delSent ? true : null);
    if (!out || out.seq === null) throw new Error('The server refused this record.');
    const cur = store.get(rec.id);
    cur.remote = true;
    if (delSent && cur.delDirty) cur.delDirty = false;
    for (const k of Object.keys(patch)) {
      if (out.conflicts && k in out.conflicts) {
        cur.conflicts[k] = { mine: clone(cur.fields[k]), theirs: clone(out.conflicts[k]), at: Date.now() };
        cur.base[k] = clone(out.conflicts[k]); delete cur.dirty[k]; changed++;
      } else {
        cur.base[k] = clone(patch[k]);
        if (cur.ver[k] === sent[k]) delete cur.dirty[k];
      }
    }
    // pick up other fields the server holds that this device hasn't touched
    for (const [k, v] of Object.entries(out.fields || {})) {
      if (k in patch || k in cur.dirty || k in cur.conflicts) continue;
      cur.fields[k] = clone(v); cur.base[k] = clone(v);
    }
    await store.save(cur);
  }

  function mergeRow(row) {
    let rec = store.get(row.id);
    if (!rec) {
      rec = { id: row.id, kind: row.kind, parent: row.parent_id, fields: clone(row.fields), base: clone(row.fields), dirty: {}, ver: {}, remote: true, deleted: !!row.deleted, delDirty: false, conflicts: {}, createdAt: Date.now(), localAt: 0 };
      return rec;
    }
    rec.remote = true;
    for (const [k, v] of Object.entries(row.fields || {})) {
      if (k in rec.dirty) {
        if (same(v, rec.base[k])) continue;                                  // server unchanged, ours still to send
        if (same(v, rec.fields[k])) { rec.base[k] = clone(v); delete rec.dirty[k]; continue; }
        rec.conflicts[k] = { mine: clone(rec.fields[k]), theirs: clone(v), at: Date.now() };
        rec.base[k] = clone(v); delete rec.dirty[k];
      } else if (k in rec.conflicts) {
        rec.conflicts[k].theirs = clone(v); rec.base[k] = clone(v);
      } else { rec.fields[k] = clone(v); rec.base[k] = clone(v); }
    }
    if (row.deleted && !rec.delDirty) rec.deleted = true;
    return rec;
  }

  let changed = 0;
  async function run() {
    if (!backend.ready) return set('local');
    if (!backend.session()) return set('signed-out');
    if (!navigator.onLine) return set('offline');
    if (running) { again = true; return; }
    running = true; set('syncing'); changed = 0;
    try {
      do {
        again = false;
        await backend.ensureFresh();
        const uid = backend.session().user.id;
        // 1. photos first, so another device never sees a photo record without its file
        for (const rec of store.all().filter(r => r.kind === 'photo')) {
          const b = store.getBlob(rec.id);
          if (b && !b.uploaded) {
            const path = rec.fields.path || (uid + '/' + rec.id + '.jpg');
            if (!rec.fields.path) await store.update(rec.id, { path });
            await backend.upload(path, b.blob);
            await store.markUploaded(rec.id);
          }
        }
        // 2. records: parents before children so links resolve on the other side
        const order = { job: 0, seg: 1, entry: 2, photo: 3 };
        const dirty = store.all().filter(r => !r.remote || r.delDirty || Object.keys(r.dirty).length);
        const todo = dirty.filter(r => r.kind !== 'part').sort((a, b) => order[a.kind] - order[b.kind] || a.createdAt - b.createdAt);
        for (const rec of todo) await pushRecord(rec);
        // 2b. parts library rows: a server without migration 002 refuses them; that must never hold up jobs
        const ptodo = dirty.filter(r => r.kind === 'part');
        if (ptodo.length) {
          try { for (const rec of ptodo) await pushRecord(rec); await store.setMeta('partsSync', { ok: true, at: Date.now() }); }
          catch (e) { if (!navigator.onLine) throw e; await store.setMeta('partsSync', { ok: false, error: e.message || String(e), at: Date.now() }); }
        }
        // 3. pull everything newer than our cursor
        let cursor = store.getMeta('cursor') || 0, rows;
        do {
          rows = await backend.pull(cursor);
          for (const row of rows) {
            const before = JSON.stringify(store.get(row.id) || null), rec = mergeRow(row);
            if (JSON.stringify(rec) !== before) changed++;
            await store.save(rec); cursor = Math.max(cursor, row.seq);
          }
          await store.setMeta('cursor', cursor);
        } while (rows.length === 500);
      } while (again);
      last = { at: Date.now(), error: '' }; await store.setMeta('lastSync', last.at);
      set('idle');
    } catch (e) {
      last.error = e.message || String(e);
      set(navigator.onLine ? 'error' : 'offline', last.error);
      if (navigator.onLine) { clearTimeout(retryT); retryT = setTimeout(run, 4000); }   // a lost reply is safe to resend
    } finally { running = false; store.emit({ type: 'remote', changed }); }
  }

  return {
    status, run,
    start() {
      addEventListener('online', run);
      addEventListener('offline', () => set('offline'));
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
      store.on(e => { if (e.type === 'local') { clearTimeout(timer); timer = setTimeout(run, 800); } });
      setInterval(run, 20000);
      run();
    },
    lastSync: () => store.getMeta('lastSync')
  };
}
const clone2 = clone; export { clone2 as clone };
