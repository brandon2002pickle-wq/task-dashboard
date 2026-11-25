// Free neural voice (Kokoro) on the hosted command centre, with a stand-in model so the test runs offline:
//   default voice is the free one; first reply uses the device voice while the model loads;
//   after that replies are synthesised sentence by sentence; ElevenLabs is never called; load failure falls back.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const STUB = `
const wav = () => { const n = 800, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0,'RIFF'); v.setUint32(4,36+n*2,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,8000,true); v.setUint32(28,16000,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true); return new Blob([b], { type: 'audio/wav' }); };
export class KokoroTTS { static async from_pretrained(model, o) { window.__kload = { model, ...o }; await new Promise(r => setTimeout(r, 300));
  return { generate: async (t, o) => { (window.__kgen = window.__kgen || []).push({ t, voice: o.voice }); return { toBlob: wav }; } }; } }`;
(async () => {
  const mock = spawn(process.execPath, [path.join(__dirname, '..', 'dev', 'mock-supabase.js'), '8838', '8837'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => mock.stdout.on('data', d => String(d).includes('mock api') && r()));
  const ctl = b => fetch('http://localhost:8838/__test/control', { method: 'POST', body: JSON.stringify(b || {}) }).then(r => r.json());
  await fetch('http://localhost:8838/auth/v1/signup', { method: 'POST', headers: { apikey: 'mock-anon-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'sir@example.com', password: 'bench-test-1' }) });
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, d); };

  async function open(lib) {
    const p = await b.newPage({ viewport: { width: 1280, height: 860 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => { window.__dev = []; window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
      speechSynthesis.speak = u => { window.__dev.push(u.text); setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); }, 20); }; });
    await p.goto('http://localhost:8837/jarvis/');
    await p.evaluate(l => { window.JV_KOKORO.lib = l; }, lib);
    await p.waitForSelector('#jv-em'); await p.fill('#jv-em', 'sir@example.com'); await p.fill('#jv-pw', 'bench-test-1'); await p.click('#jv-auth button');
    await p.waitForSelector('#jv-auth', { state: 'detached' });
    return { p, errs };
  }

  // 1. working model
  const { p, errs } = await open('data:text/javascript;base64,' + Buffer.from(STUB).toString('base64'));
  check('free neural voice is the default', (await p.inputValue('#jvvoicepick')) === 'kokoro');
  await p.evaluate(() => document.querySelector('#starter').click()); await p.click('#cosmos-core', { force: true }); await p.waitForTimeout(1500);
  const first = await p.evaluate(() => ({ dev: window.__dev.length, load: window.__kload }));
  check('first reply spoken at once in the device voice while the model loads', first.dev >= 1, JSON.stringify(first));
  check('model requested: Kokoro-82M, q8 on WASM without WebGPU', first.load && first.load.model === 'onnx-community/Kokoro-82M-v1.0-ONNX' && first.load.dtype === 'q8' && first.load.device === 'wasm', JSON.stringify(first.load));
  await ctl({ voiceTexts: [] });
  await p.fill('#jvtext', 'Start my shift'); await p.press('#jvtext', 'Enter');
  await p.waitForFunction(() => (window.__kgen || []).some(g => /Shift started/.test(g.t)), null, { timeout: 15000 });
  await p.waitForTimeout(1200);
  const gen = await p.evaluate(() => window.__kgen);
  check('reply synthesised by the free model in British voice bm_george', gen.every(g => g.voice === 'bm_george'), JSON.stringify(gen));
  check('long reply split into sentences', gen.filter(g => /Shift started|Shop mode/.test(g.t)).length >= 2, JSON.stringify(gen.map(g => g.t)));
  check('ElevenLabs not called', ((await ctl()).voiceTexts || []).length === 0);
  check('no page errors', errs.length === 0, errs.join(' | '));
  await p.close();

  // 2. model can't load (offline, blocked): device voice keeps talking
  const bad = await open('data:text/javascript,throw new Error("offline")');
  await bad.p.evaluate(() => document.querySelector('#starter').click()); await bad.p.click('#cosmos-core', { force: true }); await bad.p.waitForTimeout(1500);
  await bad.p.fill('#jvtext', 'Start my shift'); await bad.p.press('#jvtext', 'Enter');
  await bad.p.waitForFunction(() => window.__dev.some(t => /Shift started/.test(t)), null, { timeout: 15000 }).catch(() => {});
  check('model unavailable: replies continue in the device voice', await bad.p.evaluate(() => window.__dev.some(t => /Shift started/.test(t))), JSON.stringify(await bad.p.evaluate(() => window.__dev)));
  check('no page errors (fallback)', bad.errs.length === 0, bad.errs.join(' | '));

  await b.close(); mock.kill(); process.exit(results.every(Boolean) ? 0 : 1);
})();
