// Recorded ElevenLabs greeting: plays on the first tap of the morning (once a day), not in the evening, and from the Voice tuning button any time.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, d); };
  for (const [label, hour] of [['morning', 8], ['evening', 19]]) {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(h => { const D = Date; class FD extends D { constructor(...a) { if (a.length) super(...a); else { super(); this.setHours(h, 5, 0, 0); } } static now() { const d = new D(); d.setHours(h, 5, 0, 0); return d.getTime(); } } window.Date = FD;
      window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } }; window.__tts = []; speechSynthesis.speak = u => { window.__tts.push(u.text); setTimeout(() => u.onend && u.onend(), 10); };
      window.__clips = []; const P = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { if (/greeting|_blob/.test(this.src)) window.__clips.push(this.src); return P.call(this); }; }, hour);
    await p.route('**/_blob/75c98346f2e4ce9cb8664c289574fe5c', r => r.fulfill({ contentType: 'audio/mpeg', body: fs.readFileSync(require('path').join(__dirname, '..', 'jarvis', 'jarvis-greeting.mp3')) }));
    await p.goto('file://' + require('path').join(__dirname, '..', 'jarvis', 'command-centre.src.html')); await p.waitForTimeout(500);
    await p.mouse.click(200, 400); await p.waitForTimeout(1500);
    const r = await p.evaluate(() => ({ clips: window.__clips.length, tts: window.__tts.slice() }));
    if (label === 'morning') check('morning: first tap plays the recorded greeting (no robot voice)', r.clips === 1 && r.tts.length === 0, JSON.stringify(r));
    else check('evening: no "good morning" clip', r.clips === 0, JSON.stringify(r));
    await p.click('#cosmos-core', { force: true }); await p.waitForTimeout(800);
    const r2 = await p.evaluate(() => ({ clips: window.__clips.length, first: document.querySelector('.msg.j') && document.querySelector('.msg.j').textContent }));
    check(label + ': chat greeting does not repeat the clip the same day', r2.clips === r.clips && (label !== 'evening' || !/Good morning/.test(r2.first)), JSON.stringify(r2));
    await p.evaluate(() => document.querySelector('#vt-clip').click()); await p.waitForTimeout(400);
    check(label + ': "Hear J.A.R.V.I.S." plays it any time', (await p.evaluate(() => window.__clips.length)) === r2.clips + 1);
    check(label + ': no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await b.close(); process.exit(results.every(Boolean) ? 0 : 1);
})();
