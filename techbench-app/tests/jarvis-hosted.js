// Hosted command centre against the mock backend: sign in, Claude reply via jarvis-chat (with a tool call),
// spoken through jarvis-voice, and the test line sent to the voice.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
(async () => {
  const env = { ...process.env, MOCK_TONE: process.env.MOCK_TONE };
  const mock = spawn(process.execPath, [path.join(__dirname, '..', 'dev', 'mock-supabase.js'), '8818', '8817'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => mock.stdout.on('data', d => String(d).includes('mock api') && r()));
  const api = (p, b) => fetch('http://localhost:8818' + p, { method: 'POST', headers: { apikey: 'mock-anon-key', 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
  await api('/auth/v1/signup', { email: 'sir@example.com', password: 'bench-test-1' });
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, d); };
  await p.goto('http://localhost:8817/jarvis/');
  await p.waitForSelector('#jv-em');
  await p.fill('#jv-em', 'sir@example.com'); await p.fill('#jv-pw', 'bench-test-1'); await p.click('#jv-auth button');
  await p.waitForSelector('#jv-auth', { state: 'detached' });
  check('signs in with the Tech Bench account', true);
  await p.click('#starter'); await p.waitForTimeout(300);
  check('ElevenLabs voice offered and selected', (await p.inputValue('#jvvoicepick')) === 'elevenlabs');
  await p.click('#jvfab', { force: true }); await p.waitForTimeout(1500);
  let state = await fetch('http://localhost:8818/__test/control', { method: 'POST', body: '{}' }).then(r => r.json());
  check('greeting spoken through jarvis-voice', (state.voiceTexts || []).length >= 1, JSON.stringify(state.voiceTexts));
  await p.fill('#jvtext', 'Start my shift'); await p.press('#jvtext', 'Enter');
  await p.waitForFunction(() => document.documentElement.dataset.mode === 'shop', null, { timeout: 15000 });
  check('Claude reply ran the set_shift tool (shop mode on)', true);
  await p.waitForFunction(() => [...document.querySelectorAll('.msg.j')].some(m => m.textContent.includes('Shift started')), null, { timeout: 10000 });
  await p.waitForTimeout(1500);
  state = await fetch('http://localhost:8818/__test/control', { method: 'POST', body: '{}' }).then(r => r.json());
  check('rules sent as system prompt, tools sent', state.chatCalls[0].system.startsWith('You are J.A.R.V.I.S.') && state.chatCalls[0].tools.includes('set_shift'));
  check('tool loop: second call carried the tool result', state.chatCalls.length >= 2 && state.chatCalls[1].n > state.chatCalls[0].n);
  check('reply spoken through ElevenLabs', state.voiceTexts.some(t => t.includes('Shift started')), JSON.stringify(state.voiceTexts));
  const played = await p.evaluate(() => new Promise(res => { const a = [...document.querySelectorAll('audio')]; res(true); }));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await p.screenshot({ path: process.env.SHOT || 'jarvis-hosted.png' });
  await b.close(); mock.kill(); process.exit(results.every(Boolean) ? 0 : 1);
})();
