// A small stand-in for the Supabase endpoints Tech Bench uses, for local testing only.
// Same paths and payloads as Supabase Auth, PostgREST (records table + push_record RPC),
// Storage (private "photos" bucket) and Functions. Data lives in memory (optionally a JSON file).
//   node dev/mock-supabase.js [apiPort] [appPort]
// It also serves the app on appPort with config.js pointed at this API.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API_PORT = +(process.argv[2] || 8788), APP_PORT = +(process.argv[3] || 8787);
const APP_DIR = path.join(__dirname, '..');
const ANON = 'mock-anon-key';

const db = { users: new Map(), tokens: new Map(), records: new Map(), objects: new Map(), seq: 0 };
// optional persistence between runs: MOCK_DB=/path/file.json
const DBF = process.env.MOCK_DB;
if (DBF && fs.existsSync(DBF)) {
  const d = JSON.parse(fs.readFileSync(DBF, 'utf8'));
  d.users.forEach(u => db.users.set(u.id, u)); d.tokens.forEach(([k, v]) => db.tokens.set(k, v));
  d.records.forEach(r => db.records.set(r.id, r)); d.objects.forEach(([k, o]) => db.objects.set(k, { data: Buffer.from(o.data, 'base64'), type: o.type }));
  db.seq = d.seq;
}
function persist() {
  if (!DBF) return;
  fs.writeFileSync(DBF, JSON.stringify({ users: [...db.users.values()], tokens: [...db.tokens], records: [...db.records.values()], objects: [...db.objects].map(([k, o]) => [k, { data: o.data.toString('base64'), type: o.type }]), seq: db.seq }));
}
const ctl = { dropPushResponses: 0, pushCalls: 0, reportStatus: 503 };

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
const send = (res, status, body, headers = {}) => {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, { ...cors, 'Content-Type': isBuf ? (headers['Content-Type'] || 'application/octet-stream') : 'application/json', ...headers });
  res.end(isBuf ? body : JSON.stringify(body));
};
const readBody = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const eq = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

function session(user) {
  const access = 'tok_' + crypto.randomBytes(12).toString('hex'), refresh = 'ref_' + crypto.randomBytes(12).toString('hex');
  db.tokens.set(access, user.id); db.tokens.set(refresh, user.id);
  return { access_token: access, refresh_token: refresh, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: user.id, email: user.email } };
}
function authUser(req) {
  if (req.headers.apikey !== ANON) return null;
  const t = (req.headers.authorization || '').replace(/^Bearer /, '');
  return db.tokens.get(t) || null;
}

function pushRecord(uid, a) {
  let cur = db.records.get(a.p_id);
  if (cur && cur.user_id !== uid) return { conflicts: {}, seq: null, fields: null };  // RLS: invisible, insert ignored
  if (!cur) {
    cur = { id: a.p_id, user_id: uid, kind: a.p_kind, parent_id: a.p_parent, fields: a.p_patch || {}, deleted: !!a.p_deleted, seq: ++db.seq, updated_at: new Date().toISOString() };
    db.records.set(cur.id, cur);
    return { conflicts: {}, seq: cur.seq, fields: cur.fields };
  }
  const conflicts = {}, merged = { ...cur.fields }, exp = a.p_expected || {};
  for (const k of Object.keys(a.p_patch || {})) {
    if (k in exp && !eq(cur.fields[k], exp[k]) && !eq(cur.fields[k], a.p_patch[k])) conflicts[k] = cur.fields[k] === undefined ? null : cur.fields[k];
    else merged[k] = a.p_patch[k];
  }
  const del = a.p_deleted === null || a.p_deleted === undefined ? cur.deleted : a.p_deleted;
  if (!eq(merged, cur.fields) || del !== cur.deleted) { cur.fields = merged; cur.deleted = del; cur.seq = ++db.seq; cur.updated_at = new Date().toISOString(); }
  return { conflicts, seq: cur.seq, fields: cur.fields };
}

const api = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  const body = await readBody(req);
  if (req.method !== 'GET') res.on('finish', persist).on('close', persist);
  const j = () => { try { return JSON.parse(body.toString() || '{}'); } catch { return {}; } };

  // ---- test controls
  if (p === '/__test/control') { Object.assign(ctl, j()); return send(res, 200, ctl); }
  if (p === '/__test/state') return send(res, 200, { records: [...db.records.values()], objects: [...db.objects.keys()], pushCalls: ctl.pushCalls });

  // ---- auth
  if (p === '/auth/v1/signup' && req.method === 'POST') {
    if (req.headers.apikey !== ANON) return send(res, 401, { msg: 'Invalid API key' });
    const { email, password } = j();
    if (!email || !password || password.length < 6) return send(res, 422, { msg: 'Password should be at least 6 characters.' });
    if ([...db.users.values()].some(u => u.email === email)) return send(res, 422, { msg: 'User already registered' });
    const user = { id: crypto.randomUUID(), email, password }; db.users.set(user.id, user);
    return send(res, 200, session(user));
  }
  if (p === '/auth/v1/token' && req.method === 'POST') {
    if (req.headers.apikey !== ANON) return send(res, 401, { msg: 'Invalid API key' });
    const g = url.searchParams.get('grant_type'), b = j();
    if (g === 'password') {
      const user = [...db.users.values()].find(u => u.email === b.email && u.password === b.password);
      return user ? send(res, 200, session(user)) : send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
    }
    if (g === 'refresh_token') {
      const uid = db.tokens.get(b.refresh_token);
      return uid ? send(res, 200, session(db.users.get(uid))) : send(res, 400, { error: 'invalid_grant' });
    }
    return send(res, 400, { error: 'unsupported_grant_type' });
  }

  const uid = authUser(req);
  if (p.startsWith('/rest/') || p.startsWith('/storage/') || p.startsWith('/functions/')) {
    if (!uid) return send(res, 401, { message: 'JWT expired or missing' });
  }

  // ---- PostgREST
  if (p === '/rest/v1/rpc/push_record' && req.method === 'POST') {
    ctl.pushCalls++;
    const out = pushRecord(uid, j());
    if (ctl.dropPushResponses > 0) { ctl.dropPushResponses--; req.socket.destroy(); return; }   // applied, but the reply is lost
    return send(res, 200, out);
  }
  if (p === '/rest/v1/records' && req.method === 'GET') {
    const gt = +((url.searchParams.get('seq') || 'gt.0').split('.')[1]), lim = +(url.searchParams.get('limit') || 1000);
    const rows = [...db.records.values()].filter(r => r.user_id === uid && r.seq > gt).sort((a, b) => a.seq - b.seq).slice(0, lim)
      .map(({ user_id, ...r }) => r);
    return send(res, 200, rows);
  }

  // ---- Storage (private bucket "photos": path must start with the user's id)
  let m = p.match(/^\/storage\/v1\/object\/(?:authenticated\/)?photos\/(.+)$/);
  if (m) {
    const key = decodeURIComponent(m[1]);
    if (key.split('/')[0] !== uid) return send(res, 403, { message: 'new row violates row-level security policy' });
    if (req.method === 'POST' || req.method === 'PUT') {
      if (db.objects.has(key) && req.headers['x-upsert'] !== 'true') return send(res, 409, { message: 'The resource already exists' });
      db.objects.set(key, { data: body, type: req.headers['content-type'] || 'application/octet-stream' });
      return send(res, 200, { Key: 'photos/' + key });
    }
    if (req.method === 'GET') {
      const o = db.objects.get(key);
      return o ? send(res, 200, o.data, { 'Content-Type': o.type }) : send(res, 404, { message: 'Object not found' });
    }
  }

  // ---- Functions
  if (p === '/functions/v1/jarvis-chat' && req.method === 'POST') {
    const b = j(); ctl.chatCalls = (ctl.chatCalls || []).concat([{ system: (b.system || '').slice(0, 60), n: b.messages.length, tools: (b.tools || []).map(t => t.name) }]);
    const last = b.messages[b.messages.length - 1];
    if (Array.isArray(last.content) && last.content[0] && last.content[0].type === 'tool_result') return send(res, 200, { content: [{ type: 'text', text: 'Shift started, Sir. Shop mode is yours.' }], stop_reason: 'end_turn' });
    if (/shift/i.test(String(last.content))) return send(res, 200, { content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 'tu_1', name: 'set_shift', input: { on: true } }], stop_reason: 'tool_use' });
    return send(res, 200, { content: [{ type: 'text', text: 'Good morning, Sir. The command centre is online.' }], stop_reason: 'end_turn' });
  }
  if (p === '/functions/v1/jarvis-voice' && req.method === 'POST') {
    const b = j(); ctl.voiceTexts = (ctl.voiceTexts || []).concat([b.text]);
    const f = process.env.MOCK_TONE; if (!f || !fs.existsSync(f)) return send(res, 500, { error: 'no tone' });
    return send(res, 200, fs.readFileSync(f), { 'Content-Type': 'audio/mpeg' });
  }
  if (p === '/functions/v1/report' && req.method === 'POST') {
    return send(res, ctl.reportStatus, { error: 'Report function is not deployed in the mock. Use "Copy prompt for Claude".' });
  }
  send(res, 404, { message: 'not found: ' + p });
});

// ---- static app server (config.js points the app at this mock)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const app = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); return res.end(`window.TB_CONFIG = { supabaseUrl: 'http://localhost:${API_PORT}', supabaseAnonKey: '${ANON}', reportFunction: 'report' };`); }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(APP_DIR, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(APP_DIR) || f.includes(path.sep + 'dev' + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
});

api.listen(API_PORT, () => app.listen(APP_PORT, () => console.log(`mock api :${API_PORT}  app :${APP_PORT}`)));
