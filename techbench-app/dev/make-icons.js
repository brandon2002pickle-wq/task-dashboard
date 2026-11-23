// Renders the app icons (stencil "TB" on a hazard-striped plate) with the pre-installed Chromium.
//   node dev/make-icons.js
const { chromium } = require('playwright');
const path = require('path');

const svg = (size, maskable) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs><pattern id="h" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
    <rect width="28" height="56" fill="#d9501a"/><rect x="28" width="28" height="56" fill="#1f2328"/></pattern></defs>
  <rect width="512" height="512" rx="${maskable ? 0 : 96}" fill="#1c1f23"/>
  <rect x="0" y="${maskable ? 400 : 420}" width="512" height="${maskable ? 112 : 92}" fill="url(#h)" ${maskable ? '' : 'clip-path="inset(0 round 0 0 96px 96px)"'}/>
  <g transform="${maskable ? 'translate(56 40) scale(.78)' : ''}">
    <rect x="76" y="96" width="360" height="250" rx="22" fill="#2a2f35" stroke="#8a939b" stroke-width="6"/>
    <circle cx="106" cy="221" r="9" fill="#8a939b"/><circle cx="406" cy="221" r="9" fill="#8a939b"/>
    <text x="256" y="292" text-anchor="middle" font-family="Impact, 'Arial Black', sans-serif" font-size="190" fill="#f3f1ea" letter-spacing="6">TB</text>
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
