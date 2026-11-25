// Runs the jarvis-voice edge function under Node with a fake Deno + fake ElevenLabs, and checks
// the exact request it sends (voice, model, output format, settings, key header) and the streamed reply.
//   node --experimental-strip-types tests/jarvis-voice-fn.mjs
import { pathToFileURL } from 'node:url';
import path from 'node:path';

let handler, sent;
globalThis.Deno = { env: { get: k => ({ ELEVENLABS_API_KEY: 'test-key' })[k] }, serve: fn => { handler = fn; } };
globalThis.fetch = async (url, init) => { sent = { url, init }; return new Response(new Uint8Array([0xff, 0xf3, 0x44, 0xc4]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }); };
await import(pathToFileURL(path.resolve('supabase/functions/jarvis-voice/index.ts')).href);

const line = 'Good morning, Sir. The command centre is online. I’ve taken the liberty of putting your priorities in order.';
const res = await handler(new Request('http://x/jarvis-voice', { method: 'POST', body: JSON.stringify({ text: line }) }));
const body = JSON.parse(sent.init.body);
const checks = [
  ['endpoint', sent.url === 'https://api.elevenlabs.io/v1/text-to-speech/fONmGZvf9jMdFhjqnd2L/stream?output_format=mp3_44100_128'],
  ['key header from env', sent.init.headers['xi-api-key'] === 'test-key'],
  ['model', body.model_id === 'eleven_flash_v2_5'],
  ['settings', JSON.stringify(body.voice_settings) === JSON.stringify({ stability: 0.62, similarity_boost: 0.8, style: 0.05, speed: 0.96, use_speaker_boost: true })],
  ['test line passed through', body.text === line],
  ['streams audio/mpeg back', res.status === 200 && res.headers.get('Content-Type') === 'audio/mpeg' && (await res.arrayBuffer()).byteLength === 4],
];
const noKey = (globalThis.Deno.env.get = () => undefined, await handler(new Request('http://x', { method: 'POST', body: JSON.stringify({ text: 'hi' }) })));
checks.push(['refuses cleanly without a key', noKey.status === 500]);
checks.forEach(([n, ok]) => console.log(ok ? 'PASS' : 'FAIL', n));
process.exit(checks.every(c => c[1]) ? 0 : 1);
