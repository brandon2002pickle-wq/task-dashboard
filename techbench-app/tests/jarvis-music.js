// Background music: Pickle's Shop Mix · After Dark. 13 tracks in order, Apple Music player per track,
// own copies matched to tracks by file name, next/prev, remembered on the device, ducked under J.A.R.V.I.S.; no beat-driven pulsing.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), os = require('os');
const PAGE = 'file://' + path.join(__dirname, '..', 'jarvis', 'command-centre.src.html');
function wav() {   // 6 s of a pulsing 55 Hz bass tone
  const sr = 22050, n = sr * 6, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const t = i / sr, env = .5 + .5 * Math.sin(t * Math.PI * 2 * 1.65); b.writeInt16LE(Math.round(Math.sin(t * Math.PI * 2 * 55) * env * 28000), 44 + i * 2); }
  return b;
}
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-')), w = wav();
  const names = ['01 addiction - LONOWN, Asenssia.wav', 'Kerosene.wav', 'snowfall (Slowed + Reverb) - Oneheart.wav', 'After Dark (Mr.Kitty).wav', 'random voice memo.wav'];
  names.forEach(n => fs.writeFileSync(path.join(dir, n), w));
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, d); };
  await p.addInitScript(() => { window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    speechSynthesis.getVoices = () => [{ name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB', voiceURI: 'r' }];
    speechSynthesis.speak = u => { setTimeout(() => u.onstart && u.onstart(), 20); setTimeout(() => u.onend && u.onend(), 3500); }; });
  const embeds = []; await p.route('https://embed.music.apple.com/**', r => { embeds.push(r.request().url()); r.fulfill({ contentType: 'text/html', body: 'stub' }); });
  await p.goto(PAGE); await p.waitForTimeout(500); await p.click('#ct-music'); await p.waitForTimeout(300);
  check('13 tracks in mix order', await p.evaluate(() => [...document.querySelectorAll('#mu-list b')].map(b => b.textContent).join('|')) === 'addiction|worry|starly & jessie (Mashup)|Sleepwalker|Kerosene|Goth|snowfall (Slowed + Reverb)|QKThr|Resonance|After Dark|Genesis|Vanished|Memory Reboot (Ambient Remix)');
  await p.click('#mu-list button[data-i="9"]'); await p.waitForTimeout(300);
  check('a track loads its own Apple Music player', embeds.some(u => u.includes('i=1176303886')));
  await p.setInputFiles('#mu-file', names.map(n => path.join(dir, n))); await p.waitForTimeout(1500);
  let st = await p.evaluate(() => window.__ccMusic());
  check('own copies matched by title; stray file ignored', JSON.stringify(st.own) === '[0,4,6,9]', JSON.stringify(st.own));
  check('plays from the first matched track', st.playing && st.cur === 0, st.title);
  await p.click('#mu-next'); await p.waitForTimeout(500); st = await p.evaluate(() => window.__ccMusic());
  check('next goes to the next owned track in order', st.cur === 4 && st.playing, st.title);
  let peak = 0; for (let i = 0; i < 15; i++) { await p.waitForTimeout(100); peak = Math.max(peak, (await p.evaluate(() => window.__ccMusic())).beat); }
  check('no beat: the galaxy does not pulse to the music', peak === 0, String(peak));
  await p.click('#ct-music'); await p.click('#cosmos-core', { force: true }); await p.waitForTimeout(1600);
  st = await p.evaluate(() => window.__ccMusic());
  check('ducks while J.A.R.V.I.S. talks', st.state === 'speak' && st.volume < st.set * .45, JSON.stringify(st));
  await p.waitForTimeout(3500); st = await p.evaluate(() => window.__ccMusic());
  check('comes back up after', st.volume > st.set * .8, String(st.volume));
  await p.reload(); await p.waitForTimeout(900); st = await p.evaluate(() => window.__ccMusic());
  check('files remembered on this device', JSON.stringify(st.own) === '[0,4,6,9]', JSON.stringify(st.own));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(results.every(Boolean) ? 0 : 1);
})();
