// Hosted command centre when the backend keys are missing or wrong:
//   ElevenLabs rejected -> he keeps talking in the device voice (no silence)
//   Anthropic key missing -> he says exactly what to fix instead of "something went sideways"
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
(async () => {
  const mock = spawn(process.execPath, [path.join(__dirname, '..', 'dev', 'mock-supabase.js'), '8828', '8827'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => mock.stdout.on('data', d => String(d).includes('mock api') && r()));
  const ctl = b => fetch('http://localhost:8828/__test/control', { method: 'POST', body: JSON.stringify(b || {}) }).then(r => r.json());
  await fetch('http://localhost:8828/auth/v1/signup', { method: 'POST', headers: { apikey: 'mock-anon-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'sir@example.com', password: 'bench-test-1' }) });
  await ctl({ voiceFail: 'ElevenLabs 401: {"detail":{"status":"invalid_api_key"}}' });

  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  // record what the device voice is asked to say, and finish each utterance at once
  await p.addInitScript(() => {
    window.__spoken = [];
    const syn = window.speechSynthesis;
    syn.speak = u => { window.__spoken.push(u.text); setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); }, 20); };
  });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, d); };

  await p.goto('http://localhost:8827/jarvis/');
  await p.waitForSelector('#jv-em');
  await p.fill('#jv-em', 'sir@example.com'); await p.fill('#jv-pw', 'bench-test-1'); await p.click('#jv-auth button');
  await p.waitForSelector('#jv-auth', { state: 'detached' });
  await p.evaluate(() => document.querySelector('#starter').click()); await p.waitForTimeout(300);
  await p.evaluate(() => { document.querySelector('#jvvoicepick').value = 'elevenlabs'; try { localStorage.setItem('cc.voice', 'elevenlabs'); } catch (e) {} }); // ElevenLabs chosen, key rejected
  await p.click('#cosmos-core', { force: true }); await p.waitForTimeout(1500);

  let spoken = await p.evaluate(() => window.__spoken);
  check('ElevenLabs rejected: greeting still spoken in the device voice', spoken.length >= 1, JSON.stringify(spoken));

  await p.fill('#jvtext', 'Start my shift'); await p.press('#jvtext', 'Enter');
  await p.waitForFunction(() => [...document.querySelectorAll('.msg.j')].some(m => m.textContent.includes('Shift started')), null, { timeout: 15000 });
  await p.waitForTimeout(800);
  spoken = await p.evaluate(() => window.__spoken);
  check('Claude reply spoken in the device voice', spoken.some(t => /Shift started/.test(t)), JSON.stringify(spoken));
  const s1 = await ctl();
  check('ElevenLabs not retried after the first failure', s1.voiceTexts.length === 1, s1.voiceTexts.length + ' voice calls');

  await ctl({ chatFail: 'ANTHROPIC_API_KEY is not set on the backend.' });
  await p.fill('#jvtext', 'What is on today'); await p.press('#jvtext', 'Enter');
  await p.waitForFunction(() => [...document.querySelectorAll('.msg.j')].some(m => m.textContent.includes('ANTHROPIC_API_KEY')), null, { timeout: 10000 });
  check('missing Anthropic key explained in plain words', true);

  check('no page errors', errs.length === 0, errs.join(' | '));
  await p.screenshot({ path: process.env.SHOT || 'jarvis-fallback.png' });
  await b.close(); mock.kill(); process.exit(results.every(Boolean) ? 0 : 1);
})();
