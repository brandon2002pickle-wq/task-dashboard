// The galaxy home: planets per mode, drawer boards, shop galaxy on clock-in, J.A.R.V.I.S. at the centre opens chat (laptop + phone).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = []; const out = [];
  for (const [name, vp] of [['desk', { width: 1600, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const p = await b.newPage({ viewport: vp }); p.on('pageerror', e => errs.push(name + ': ' + e.message));
    await p.addInitScript(() => { window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } }; speechSynthesis.speak = u => setTimeout(() => u.onend && u.onend(), 10); });
    await p.goto('file://' + require('path').join(__dirname, '..', 'jarvis', 'command-centre.src.html')); await p.waitForTimeout(500);
    await p.evaluate(() => document.querySelector('#starter').click()); await p.waitForTimeout(1200);
    await p.screenshot({ path: `${process.env.SHOTS || require('os').tmpdir()}/cos-${name}-off.png` });
    out.push(name + ' off planets: ' + await p.evaluate(() => [...document.querySelectorAll('.planet b')].map(x => x.textContent).join(', ')));
    out.push(name + ' h-overflow: ' + await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
    // open a planet -> drawer with that board
    await p.click('.planet[data-v="prints"]', { force: true }); await p.waitForTimeout(900);
    out.push(name + ' drawer: ' + await p.evaluate(() => document.body.classList.contains('drawer-open') + ' view=' + location.hash + ' fab=' + getComputedStyle(document.querySelector('#jvfab')).display));
    await p.screenshot({ path: `${process.env.SHOTS || require('os').tmpdir()}/cos-${name}-drawer.png` });
    await p.click('#drawerx'); await p.waitForTimeout(600);
    out.push(name + ' closed: ' + await p.evaluate(() => !document.body.classList.contains('drawer-open') && getComputedStyle(document.querySelector('#jvfab')).display === 'none'));
    // clock in -> shop galaxy
    await p.click('#ct-shift'); await p.waitForTimeout(2600);
    out.push(name + ' shop planets: ' + await p.evaluate(() => document.documentElement.dataset.mode + ' | ' + [...document.querySelectorAll('.planet b')].map(x => x.textContent).join(', ')));
    await p.screenshot({ path: `${process.env.SHOTS || require('os').tmpdir()}/cos-${name}-shop.png` });
    await p.click('.planet[data-v="checks"]', { force: true }); await p.waitForTimeout(1300);
    out.push(name + ' checks planet opens checklist: ' + await p.evaluate(() => { const c = document.querySelector('.shell .checks'); const r = c && c.getBoundingClientRect(); return !!(r && r.top < innerHeight && r.bottom > 0); }));
    await p.click('#drawerx'); await p.waitForTimeout(400);
    // tap J.A.R.V.I.S. at the centre
    await p.click('#cosmos-core', { force: true }); await p.waitForTimeout(300);
    out.push(name + ' centre opens chat: ' + await p.evaluate(() => !document.querySelector('#jvpanel').hidden));
    await p.close();
  }
  console.log(out.join('\n')); console.log('errors:', errs.join(' | ') || 'none'); await b.close();
  const bad = out.filter(l => (/: false/.test(l) && !/h-overflow/.test(l)) || /h-overflow: true/.test(l) || /fab=none/.test(l));
  console.log(bad.length || errs.length ? 'FAIL ' + bad.join(' | ') : 'PASS all galaxy checks'); process.exit(bad.length || errs.length ? 1 : 0);
})();
