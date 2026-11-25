// A saved case and its "needs syncing" mark must commit in one IndexedDB transaction. If they were
// separate, closing the app between them leaves a case that never uploads while the app says
// "synced" (seen in e2e: telematics imported, app reloaded at once, never pushed).
//   node tests/atomic-save.js
const { chromium } = require('playwright');
require('../dev/mock.js');
(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  await p.addInitScript(() => {
    window.__tx = [];
    const orig = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode) {
      if (mode === 'readwrite') window.__tx.push([].concat(stores).sort().join('+'));
      return orig.apply(this, arguments);
    };
  });
  await p.goto('http://localhost:8797/psr/'); await p.waitForSelector('#store b');
  await p.evaluate(() => { window.__tx = []; });
  // a telematics import and a deletion: both go through the save path
  await p.click('nav [data-tab=telem]'); await p.click('#v-telem details summary');
  await p.fill('#tm-paste', 'Serial Number,Fault Code\nFTL01234,168-4'); await p.click('#tm-pgo');
  await p.waitForSelector('#tm-imp'); await p.click('#tm-imp');
  await p.click('#tm-list [data-tid]'); await p.click('#tm-del'); await p.click('#tm-del');
  await p.waitForTimeout(300);
  const tx = await p.evaluate(() => window.__tx);
  const docsAlone = tx.filter(t => t === 'docs').length, both = tx.filter(t => t === 'docs+meta').length;
  console.log('readwrite transactions:', JSON.stringify(tx));
  const ok = both >= 2 && docsAlone === 0;
  console.log(ok ? 'PASS save and sync mark commit together' : 'FAIL a case was written without its sync mark in the same transaction');
  await b.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
