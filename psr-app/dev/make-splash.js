// Renders iPhone launch screens (apple-touch-startup-image) so the Home Screen app opens on the
// dark plate instead of a white flash. Portrait, one per current screen size.   node dev/make-splash.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
// [css width, css height, pixel ratio]  (covers iPhone SE 2/3 through iPhone 17 Pro Max)
const SIZES = [[375, 667, 2], [414, 896, 2], [375, 812, 3], [414, 896, 3], [390, 844, 3], [428, 926, 3],
  [393, 852, 3], [430, 932, 3], [402, 874, 3], [420, 912, 3], [440, 956, 3]];
const page = `<html><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;background:#141414;font-family:'Arial Black',Impact,sans-serif;font-weight:900">
  <svg width="150" height="150" viewBox="0 0 512 512"><rect x="40" y="70" width="432" height="250" rx="18" fill="none" stroke="#ffcd11" stroke-width="12"/>
  <path d="M52 210 H150 l14-10 14 10 H220 l12 12 18-96 20 150 14-66 H360 l18-16 18 16 H460" fill="none" stroke="#ffcd11" stroke-width="18" stroke-linejoin="round" stroke-linecap="round"/></svg>
  <div style="text-align:center;line-height:1;font-size:30px;letter-spacing:.02em;color:#f5f3ee">PICKLE'S<br><span style="color:#ffcd11">PSR TOOL</span></div></body></html>`;
(async () => {
  const out = path.join(__dirname, '..', 'splash'); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(), tags = [];
  for (const [w, h, r] of SIZES) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: r });
    await p.setContent(page); const name = `${w * r}x${h * r}.png`;
    await p.screenshot({ path: path.join(out, name) }); await p.close();
    tags.push(`<link rel="apple-touch-startup-image" media="screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)" href="splash/${name}">`);
  }
  await b.close();
  fs.writeFileSync(path.join(out, 'tags.html'), tags.join('\n') + '\n');
  console.log(SIZES.length + ' launch screens written; <link> tags in splash/tags.html');
})();
