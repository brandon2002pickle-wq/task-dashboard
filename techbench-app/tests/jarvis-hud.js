// J.A.R.V.I.S. display: voice command opens the diagram with an instant 'Of course, Sir.', lanes light up live, core/close commands, phone layout.
const PAGE = 'file://' + require('path').join(__dirname, '..', 'jarvis', 'command-centre.src.html');
const OUT = process.env.SHOTS || require('os').tmpdir();
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, d); };
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.__said = []; window.__asked = 0; window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    speechSynthesis.getVoices = () => [{ name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB', voiceURI: 'ryan' }];
    speechSynthesis.speak = u => { window.__said.push(u.text); setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); }, 30); };
    const sample = async (msgs, o) => { window.__asked++; const tool = o.tools.find(t => t.name === 'add_print'); await tool.execute({ title: 'Bracket for the 299D3 cab light', hours: '3' }); return { text: 'Queued, Sir.' }; };
    window.claude = { use: n => Promise.resolve(n === 'sample' ? sample : null) };
  });
  await p.goto(PAGE); await p.waitForTimeout(600);
  await p.click('#starter'); await p.waitForTimeout(300);
  await p.click('#jvfab', { force: true }); await p.waitForTimeout(400);
  await p.fill('#jvtext', 'Hey Jarvis, can you pull up that diagram of how everything works'); await p.press('#jvtext', 'Enter');
  await p.waitForTimeout(700);
  const st = await p.evaluate(() => ({ hud: !document.querySelector('#hud').hidden, map: !document.querySelector('#hudmap').hidden, said: window.__said.slice(-1)[0], asked: window.__asked,
    lanes: [...document.querySelectorAll('#ul-lanes li b')].map(x => x.textContent), wires: document.querySelectorAll('#hudwires path').length }));
  check('voice command opens the diagram', st.hud && st.map, JSON.stringify(st));
  check('answers "Of course, Sir." aloud, instantly (no model call)', st.said === 'Of course, Sir.' && st.asked === 0, st.said + ' / model calls ' + st.asked);
  check('diagram shows real lanes and animated wires', st.lanes.length === 6 && st.wires >= 3, st.lanes.join(', '));
  await p.evaluate(() => document.querySelector('#jvpanel').hidden = true);
  await p.screenshot({ path: OUT + '/hud-diagram.png' });
  // a real request while the diagram is up: Maker lane + board connection light up
  await p.evaluate(() => { document.querySelector('#jvpanel').hidden = false; });
  await p.fill('#jvtext', 'Queue a print for the cab light bracket, three hours'); await p.press('#jvtext', 'Enter');
  await p.waitForTimeout(500);
  const hot = await p.evaluate(() => [...document.querySelectorAll('.hud .hot')].map(e => e.dataset.k || e.id));
  check('the lane he works in lights up live', hot.includes('maker') && hot.includes('board'), JSON.stringify(hot));
  const maker = await p.evaluate(() => document.querySelector('#ul-lanes li[data-k="maker"] em').textContent);
  check('lane counts update', /queued/.test(maker), maker);
  await p.fill('#jvtext', 'show the core'); await p.press('#jvtext', 'Enter'); await p.waitForTimeout(900);
  check('"show the core" switches screens', await p.evaluate(() => !document.querySelector('#hudcore').hidden && document.querySelector('#hudmap').hidden));
  await p.evaluate(() => document.querySelector('#jvpanel').hidden = true);
  await p.screenshot({ path: OUT + '/hud-core.png' });
  await p.evaluate(() => document.querySelector('#jvpanel').hidden = false);
  await p.fill('#jvtext', 'close the display'); await p.press('#jvtext', 'Enter'); await p.waitForTimeout(300);
  check('"close the display" closes it', await p.evaluate(() => document.querySelector('#hud').hidden));
  await p.click('#hudbtn'); await p.waitForTimeout(200); await p.keyboard.press('Escape');
  check('rail button opens, Esc closes', await p.evaluate(() => document.querySelector('#hud').hidden));
  // phone
  const m = await b.newPage({ viewport: { width: 390, height: 844 } }); m.on('pageerror', e => errs.push(e.message));
  await m.goto(PAGE); await m.waitForTimeout(500); await m.click('#starter');
  await m.evaluate(() => document.querySelector('#hudbtn').click()); await m.waitForTimeout(800); await m.screenshot({ path: OUT + '/hud-phone-core.png' });
  await m.keyboard.press('Escape'); await m.evaluate(() => { document.querySelector('#hudbtn').click(); }); 
  await m.evaluate(() => { document.querySelector('#hudcore').hidden = true; document.querySelector('#hudmap').hidden = false; }); await m.waitForTimeout(900);
  await m.screenshot({ path: OUT + '/hud-phone-map.png' });
  check('phone: no sideways scroll', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('#hud').scrollWidth <= innerWidth));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); process.exit(results.every(Boolean) ? 0 : 1);
})();
