// Renders the PSR Tool icons (yellow trace on a black monitor plate) with the pre-installed Chromium.
//   node dev/make-icons.js
const { chromium } = require('playwright');
const path = require('path');

const svg = (size, maskable) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs><pattern id="g" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#24241f" stroke-width="2"/></pattern></defs>
  <rect width="512" height="512" rx="${maskable ? 0 : 96}" fill="#141414"/>
  <g transform="${maskable ? 'translate(51 51) scale(.8)' : ''}">
    <rect x="40" y="70" width="432" height="250" rx="18" fill="url(#g)" stroke="#ffcd11" stroke-width="10"/>
    <path d="M52 210 H150 l14-10 14 10 H220 l12 12 18-96 20 150 14-66 H360 l18-16 18 16 H460" fill="none" stroke="#ffcd11" stroke-width="16" stroke-linejoin="round" stroke-linecap="round"/>
    <text x="256" y="452" text-anchor="middle" font-family="Impact, 'Arial Black', sans-serif" font-size="128" fill="#f5f3ee" letter-spacing="10">PSR</text>
  </g>
</svg>`;

(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  for (const [name, size, mask] of [['icon-192', 192, false], ['icon-512', 512, false], ['maskable-512', 512, true], ['icon-180', 180, true]]) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg(size, mask)}`);
    await p.screenshot({ path: path.join(__dirname, '..', 'icons', name + '.png'), omitBackground: !mask });
  }
  await b.close();
  console.log('icons written');
})();
