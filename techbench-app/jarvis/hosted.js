// Hosted J.A.R.V.I.S.: stands in for the claude.ai page features when the command centre runs as its own site.
//   sample    -> Supabase function jarvis-chat (Claude), with the page's board tools run here in a loop
//   tts       -> Supabase function jarvis-voice (ElevenLabs voice fONmGZvf9jMdFhjqnd2L, eleven_flash_v2_5)
//   dictation -> the browser's own speech recognition (keeps listening while he talks)
//   db / user -> not used: the board is kept in this browser
(() => {
  const cfg = window.TB_CONFIG || {};
  const URL0 = (cfg.supabaseUrl || '').replace(/\/$/, ''), ANON = cfg.supabaseAnonKey || '';
  const SKEY = 'jv.session';
  const getS = () => { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } };
  const setS = s => { try { s ? localStorage.setItem(SKEY, JSON.stringify(s)) : localStorage.removeItem(SKEY); } catch (e) {} };

  async function authFetch(path, body, raw) {
    const go = () => { const s = getS(); return fetch(URL0 + path, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + (s ? s.access_token : ANON), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); };
    let r = await go();
    if (r.status === 401 && getS()) {                    // token expired: refresh once
      const rr = await fetch(URL0 + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: getS().refresh_token }) });
      if (rr.ok) { setS(await rr.json()); r = await go(); } else { setS(null); showSignIn(); }
    }
    if (!r.ok) { let m = 'HTTP ' + r.status; try { const j = await r.json(); m = j.error || j.message || m; } catch (e) {} const e = new Error(m); e.code = r.status === 429 ? 'rate_limited' : r.status === 401 ? 'not_granted' : 'upstream_error'; throw e; }
    return raw ? r : r.json();
  }

  /* ---- sign-in (same account as the Tech Bench app) ---- */
  function showSignIn() {
    if (document.getElementById('jv-auth')) return;
    const d = document.createElement('div'); d.id = 'jv-auth';
    d.innerHTML = `<form style="position:fixed;inset:0;z-index:99;display:grid;place-items:center;background:rgba(4,8,16,.88);font-family:system-ui,sans-serif">
      <div style="background:#0b1424;color:#dff6ff;border:1px solid rgba(62,200,255,.35);border-radius:16px;padding:22px;width:min(360px,92vw);display:flex;flex-direction:column;gap:10px">
        <b style="font-size:18px">Sign in to J.A.R.V.I.S.</b><span style="font-size:13px;color:#8fb4c8">Same account as your Tech Bench app.</span>
        <input id="jv-em" type="email" placeholder="Email" autocomplete="username" style="padding:10px;border-radius:10px;border:1px solid #23405e;background:#07101d;color:#dff6ff;font-size:16px">
        <input id="jv-pw" type="password" placeholder="Password" autocomplete="current-password" style="padding:10px;border-radius:10px;border:1px solid #23405e;background:#07101d;color:#dff6ff;font-size:16px">
        <button style="padding:10px;border-radius:999px;border:0;background:#3ee6ff;color:#00141c;font-weight:700;font-size:15px;cursor:pointer">Sign in</button>
        <span id="jv-am" style="font-size:13px;color:#ffb3b3"></span></div></form>`;
    document.body.appendChild(d);
    d.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const r = await fetch(URL0 + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: d.querySelector('#jv-em').value.trim(), password: d.querySelector('#jv-pw').value }) });
      if (!r.ok) { d.querySelector('#jv-am').textContent = 'Couldn\'t sign in. Check the email and password.'; return; }
      setS(await r.json()); d.remove();
    };
  }

  /* ---- sample: Claude through jarvis-chat, tools run here ---- */
  async function sample(input, opts = {}) {
    const turns = typeof input === 'string' ? [{ role: 'user', content: input }] : input.slice();
    // the page sends its rules as the first user turn; send them as the system prompt instead
    let system = '';
    if (turns.length > 2 && turns[0].role === 'user' && turns[1].role === 'assistant' && /J\.A\.R\.V\.I\.S\./.test(turns[0].content)) { system = turns[0].content; turns.splice(0, 2); }
    while (turns.length && turns[0].role !== 'user') turns.shift();
    const merged = []; for (const t of turns) { const last = merged[merged.length - 1]; if (last && last.role === t.role && typeof last.content === 'string') last.content += '\n' + t.content; else merged.push({ role: t.role, content: t.content }); }
    const tools = (opts.tools || []).map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema || { type: 'object', properties: {} } }));
    let text = '';
    for (let round = 0; round < 6; round++) {
      const out = await authFetch('/functions/v1/jarvis-chat', { system, messages: merged, tools });
      const said = out.content.filter(b => b.type === 'text').map(b => b.text).join('');
      if (said) { text = said; if (opts.onText) opts.onText({ text, delta: said }); }
      if (out.stop_reason !== 'tool_use') break;
      merged.push({ role: 'assistant', content: out.content });
      const results = [];
      for (const b of out.content.filter(x => x.type === 'tool_use')) {
        const tool = (opts.tools || []).find(t => t.name === b.name);
        let res, isErr = false;
        try { res = tool ? await tool.execute(b.input || {}, { signal: new AbortController().signal }) : 'Unknown tool'; } catch (e) { res = 'Error: ' + e.message; isErr = true; }
        results.push({ type: 'tool_result', tool_use_id: b.id, content: typeof res === 'string' ? res : JSON.stringify(res ?? 'ok'), is_error: isErr });
      }
      merged.push({ role: 'user', content: results });
    }
    return { text, truncated: false };
  }
  sample.json = async (i, o) => JSON.parse((await sample(i, o)).text);
  sample.limits = async () => ({ maxPromptBytes: 150000 });

  /* ---- tts: ElevenLabs through jarvis-voice ---- */
  const ttsHandlers = new Set(); let audio = null, current = null;
  const emit = (state, reason) => ttsHandlers.forEach(h => { try { h({ state, reason }); } catch (e) {} });
  const tts = {
    async speak(text) {
      tts.stop();
      emit('starting');
      const r = await authFetch('/functions/v1/jarvis-voice', { text: String(text).slice(0, 1200) }, true);
      const url = URL.createObjectURL(await r.blob());
      return new Promise((res, rej) => {
        audio = new Audio(url); current = { res, rej };
        audio.onplaying = () => emit('speaking');
        audio.onended = () => { emit('idle', 'completed'); URL.revokeObjectURL(url); current = null; res({ playedMs: (audio.duration || 0) * 1000 }); };
        audio.onerror = () => { emit('idle', 'upstream_error'); current = null; rej({ code: 'upstream_error' }); };
        audio.play().catch(() => { emit('idle', 'no_gesture'); current = null; rej({ code: 'no_gesture' }); });
      });
    },
    async stop() { if (audio) { audio.pause(); audio = null; } if (current) { emit('idle', 'stopped'); current.rej({ code: 'stopped' }); current = null; } },
    onState(h) { ttsHandlers.add(h); return () => ttsHandlers.delete(h); }
  };

  /* ---- dictation: browser speech recognition, restarted until stopped ---- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let dictation = null;
  if (SR) {
    const H = { partial: new Set(), final: new Set(), state: new Set() };
    let rec = null, want = false, state = 'idle';
    const set = (s, reason) => { state = s; H.state.forEach(h => h({ state: s, reason })); };
    const make = () => {
      rec = new SR(); rec.lang = 'en-GB'; rec.continuous = true; rec.interimResults = true;
      rec.onstart = () => set('listening');
      rec.onresult = e => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i], t = r[0].transcript;
          if (r.isFinal) { H.partial.forEach(h => h({ text: '' })); H.final.forEach(h => h({ text: ' ' + t.trim() })); }
          else H.partial.forEach(h => h({ text: t }));
        }
      };
      rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { want = false; set('idle', 'not_granted'); } };
      rec.onend = () => { if (want) { try { rec.start(); } catch (e) { setTimeout(() => want && rec.start(), 300); } } else set('idle', 'stopped'); };
    };
    dictation = {
      start() { want = true; if (!rec) make(); set('starting'); try { rec.start(); } catch (e) {} return Promise.resolve(); },
      async stop() { want = false; if (rec) rec.stop(); },
      active: () => state !== 'idle',
      onPartial(h) { H.partial.add(h); return () => H.partial.delete(h); },
      onFinal(h) { H.final.add(h); return () => H.final.delete(h); },
      onState(h) { H.state.add(h); return () => H.state.delete(h); }
    };
  }

  window.JV_HOSTED = true;
  window.claude = {
    use(name) {
      const ok = !!(URL0 && ANON);
      const map = { sample: ok ? sample : null, tts: ok ? tts : null, dictation, db: null, user: null };
      return Promise.resolve(name in map ? map[name] : null);
    }
  };
  addEventListener('DOMContentLoaded', () => {
    if (!URL0 || !ANON) return;
    if (!getS()) showSignIn();
    // offer the ElevenLabs voice first
    const sel = document.getElementById('jvvoicepick');
    if (sel && !sel.querySelector('[value="elevenlabs"]')) { const o = new Option('J.A.R.V.I.S. (ElevenLabs)', 'elevenlabs'); sel.insertBefore(o, sel.firstChild); }
    try { if (!localStorage.getItem('cc.voice')) localStorage.setItem('cc.voice', 'elevenlabs'); } catch (e) {}
    if (sel) sel.value = (localStorage.getItem('cc.voice') || 'elevenlabs');
  });
})();
