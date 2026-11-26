// Three galaxies: home (Today, Garage, Prints), creator (ideas, projects, DEAD RECKONING), shop (Thompson Tractor work only, work-only dock), laptop + phone.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, d); };
  for (const [vpn, vp] of [['desk', { width: 1600, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const p = await b.newPage({ viewport: vp }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return {}; }; window.__asked = 0;
      window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } }; speechSynthesis.speak = u => setTimeout(() => u.onend && u.onend(), 10);
      window.claude = { use: n => Promise.resolve(n === 'sample' ? async () => { window.__asked++; return { text: 'ok' }; } : null) }; });
    await p.goto('file://' + require('path').join(__dirname, '..', 'jarvis', 'command-centre.src.html')); await p.waitForTimeout(400);
    await p.evaluate(() => document.querySelector('#starter').click()); await p.waitForTimeout(4000);
    const view = async () => p.evaluate(() => ({ mode: document.documentElement.dataset.mode || 'home', planets: [...document.querySelectorAll('.planet b')].map(b => b.textContent).join(', '), dock: [...document.querySelectorAll('.dock .app[data-id] span:last-child')].map(s => s.textContent).join(', '), name: document.querySelector('#ct-name').textContent }));
    let v = await view();
    check(vpn + ' home: Today, Garage, Prints', v.planets === 'Today, Garage, Prints', v.planets);
    await p.screenshot({ path: `${require('os').tmpdir()}/mode-${vpn}-home.png` });
    await p.click('#ct-creator'); await p.waitForTimeout(1500); v = await view();
    check(vpn + ' creator: Projects, Ideas, Dead Reckoning, New idea', v.mode === 'creator' && v.planets === 'Projects, Ideas, Dead Reckoning, New idea', JSON.stringify(v));
    check(vpn + ' creator dock has no Steam/Settings', !/Steam|Settings|Cat SIS/.test(v.dock), v.dock);
    await p.screenshot({ path: `${require('os').tmpdir()}/mode-${vpn}-creator.png` });
    await p.click('.planet[data-v="newidea"]', { force: true }); await p.waitForTimeout(1200);
    check(vpn + ' New idea opens the ideas board', await p.evaluate(() => location.hash === '#ideas' && document.body.classList.contains('drawer-open')));
    await p.click('#drawerx'); await p.waitForTimeout(400);
    await p.click('#ct-shift'); await p.waitForTimeout(2800); v = await view();
    check(vpn + ' shop is work only: checks, shift clock, notes, SIS, Deere, Bobcat', v.mode === 'shop' && v.planets === 'Pre-job checks, Shift clock, Shop notes, Cat SIS 2.0, Deere parts, Bobcat parts', v.planets);
    check(vpn + ' shop dock is work apps only', v.dock.split(', ').every(n => ['Cat SIS 2.0', 'Claude', 'Deere Parts', 'Bobcat Parts'].includes(n)) && /Deere Parts/.test(v.dock), v.dock);
    check(vpn + ' creator button hidden on shift', await p.isHidden('#ct-creator'));
    await p.screenshot({ path: `${require('os').tmpdir()}/mode-${vpn}-shop.png` });
    await p.click('#ct-shift'); await p.waitForTimeout(2800); v = await view();
    check(vpn + ' ending the shift returns to creator mode', v.mode === 'creator', v.mode);
    await p.click('#cosmos-core', { force: true }); await p.waitForTimeout(300);
    await p.fill('#jvtext', 'Jarvis, creator mode off'); await p.press('#jvtext', 'Enter'); await p.waitForTimeout(500);
    v = await view(); check(vpn + ' "creator mode off" by voice, no model call', v.mode === 'home' && await p.evaluate(() => window.__asked) === 0, v.mode);
    check(vpn + ' no page errors', errs.length === 0, errs.join(' | '));
    check(vpn + ' no sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await p.close();
  }
  await b.close(); process.exit(results.every(Boolean) ? 0 : 1);
})();
