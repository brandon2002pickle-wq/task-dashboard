// Local stand-in for the Supabase endpoints PSR Tool uses (Auth password grant, psr_docs +
// psr_put RPC, the psr Function). Testing only. Serves the app on appPort pointed at it.
//   node dev/mock.js [apiPort] [appPort]        PSR_FN=off  -> function returns 404
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const API = +(process.argv[2] || 8798), APP = +(process.argv[3] || 8797), DIR = path.join(__dirname, '..');
const db = { users: new Map(), tokens: new Map(), docs: new Map(), seq: 0, asks: [] };
const ctl = { fn: process.env.PSR_FN !== 'off' };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const send = (res, s, b) => { res.writeHead(s, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
const body = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c).toString())); });
const sess = u => { const t = 'tok_' + crypto.randomBytes(8).toString('hex'); db.tokens.set(t, u.id); return { access_token: t, refresh_token: 'r' + t, expires_in: 3600, user: { id: u.id, email: u.email } }; };
const who = req => db.tokens.get(String(req.headers.authorization || '').replace('Bearer ', ''));

// canned Claude replies, picked by what the prompt asks for
function reply(prompt) {
  if (/Write the diagnosis portion/.test(prompt)) return { text: 'Customer reported intermittent loss of power. Pulled a Product Status Report (PSR) with Cat ET; 168-4 active. Checked charging voltage at high idle and found it low.', questions: ['Alternator part number?'] };
  if (/one check at a time/.test(prompt)) return { hyp: [{ cause: 'Alternator not charging', conf: 'likely', basis: 'Charging voltage low at high idle' }, { cause: 'Main ground fault', conf: 'unlikely', basis: 'Voltage drop normal' }], next: null, concl: { cause: 'Alternator not charging', basis: 'Low output at high idle with good belt and grounds', repair: 'Replace alternator', verify: 'Clear codes, run 2 h, pull after-repair PSR' }, comment: 'Low output confirms the alternator.' };
  return { machine: { model: '259D3', serial: 'FTL01234', smu: '1288', other: '' }, ecms: [{ name: 'Engine', software: '1.2' }], active: [{ code: '168-4', desc: 'System voltage low', count: '3', first: '1210', last: '1288' }], logged: [{ code: '41-3', desc: '8 V supply above normal', count: '1', first: '1100', last: '1100' }], events: [], summary: 'Low system voltage is active with three occurrences.', hyp: [{ cause: 'Alternator not charging', conf: 'likely', basis: '168-4 active, count 3' }, { cause: 'Main ground fault', conf: 'possible', basis: 'Low voltage can come from a poor ground' }], next: { check: 'Measure charging voltage at high idle', why: 'Splits alternator from grounds', how: 'Meter across battery posts with engine at high idle', pass: 'Voltage per SIS: look at grounds', fail: 'Low: alternator or excitation' }, questions: [], notes: '' };
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__ctl') { if (u.searchParams.has('fn')) ctl.fn = u.searchParams.get('fn') === 'on'; return send(res, 200, { ...ctl, asks: db.asks.length, docs: [...db.docs.values()].map(d => ({ id: d.id, upd: d.upd, deleted: d.deleted })) }); }
  if (u.pathname === '/auth/v1/signup') { const { email, password } = JSON.parse(await body(req)); const user = { id: crypto.randomUUID(), email, password }; db.users.set(email, user); return send(res, 200, sess(user)); }
  if (u.pathname === '/auth/v1/token') {
    const b = JSON.parse(await body(req));
    if (u.searchParams.get('grant_type') === 'password') { const user = db.users.get(b.email); if (!user || user.password !== b.password) return send(res, 400, { error_description: 'Invalid login credentials' }); return send(res, 200, sess(user)); }
    return send(res, 400, { error: 'unsupported' });
  }
  const uid = who(req);
  if (u.pathname === '/rest/v1/rpc/psr_put') {
    if (!uid) return send(res, 401, { message: 'JWT' });
    const b = JSON.parse(await body(req)), k = uid + '|' + b.p_id, cur = db.docs.get(k);
    if (cur && cur.upd > b.p_upd) return send(res, 200, null);
    const row = { uid, id: b.p_id, doc: b.p_deleted ? null : b.p_doc, upd: b.p_upd, deleted: !!b.p_deleted, seq: ++db.seq };
    db.docs.set(k, row); return send(res, 200, row.seq);
  }
  if (u.pathname === '/rest/v1/psr_docs') {
    if (!uid) return send(res, 401, { message: 'JWT' });
    const gt = +(u.searchParams.get('seq') || 'gt.0').slice(3);
    return send(res, 200, [...db.docs.values()].filter(d => d.uid === uid && d.seq > gt).sort((a, b) => a.seq - b.seq).slice(0, 200).map(({ id, doc, upd, deleted, seq }) => ({ id, doc, upd, deleted, seq })));
  }
  if (u.pathname === '/functions/v1/psr') {
    if (!ctl.fn) return send(res, 404, { message: 'Function not found' });
    if (!uid) return send(res, 401, { message: 'JWT' });
    const b = JSON.parse(await body(req)); db.asks.push({ tier: b.tier, images: (b.images || []).length });
    return send(res, 200, { text: '```json\n' + JSON.stringify(reply(b.prompt)) + '\n```', model: 'mock' });
  }
  send(res, 404, { message: 'not found' });
}).listen(API);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/psr\//, '/');
  if (p === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(`window.PSR_CONFIG = { supabaseUrl: 'http://localhost:${API}', supabaseAnonKey: 'mock-anon', psrFunction: 'psr' };`); }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIR, path.normalize(p));
  if (!f.startsWith(DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(APP, () => console.log(`PSR Tool on http://localhost:${APP}/psr/  (mock API :${API})`));
module.exports = { reply };
