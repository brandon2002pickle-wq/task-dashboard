# Tech Bench app

An installable web app for service calls. It runs on an Android phone, an iPhone or a Windows 11 laptop, keeps working with no signal, and syncs everything to one account.

It reuses the Tech Bench page's design, job timeline, AX segment layout, part-number rules and service-report instructions (`report.js`).

## What's in version 1

| Area | What it does |
|---|---|
| Jobs | Start or resume a job; work order #, date, hours, status, make/model/serial, customer, record type |
| Timeline | Step done, finding, part (ordered → received → installed), next step, waiting on (oil sample, part, TC Help Desk ticket, customer approval), note |
| Resume card | Last completed step, next action, everything waiting on someone else |
| Photos | Camera photo with caption, pinned to a step; the original file is kept |
| Report | AX segments (D435, G/49, 0000000/7595 unless warranty part), each segment written with Claude using your report instructions; shop-assist notes stay internal |
| Offline | Every save goes to the device first; the app opens with no signal; nothing is lost if it's closed |
| Sync | One sign-in on both devices; each entry shows *Saved on phone*, *Waiting to sync* or *Synced* |
| Conflicts | If both devices change the same field before syncing, both versions are kept and you choose |

Not in version 1 yet (still in the original Tech Bench page): PSR reading, photo reading, machine register, parts list, checklists, shift handoff, Gmail sending.

## How sync works

- Records (`job`, `seg`, `entry`, `photo`) get their id on the device, so a retry after a lost reply re-sends the same id and the server's `push_record` function applies it once.
- Only changed fields are sent, together with the value the device last saw. If the server's value moved in between, that field comes back as a conflict instead of being overwritten.
- Photos upload to `photos/<your user id>/<job id>/<photo id>.jpg` with upsert, before their record is sent, so the other device never sees a photo record without its file.
- Row-level security and storage policies limit every record and file to the signed-in account.

## Set it up (one time)

You need two free accounts: **Supabase** (database, sign-in, photo storage) and **Cloudflare Pages** (hosting, from this private repository). The report writer also needs an **Anthropic API key**.

1. **Supabase project.** At supabase.com create a project. Then:
   - SQL Editor → paste `supabase/migrations/001_techbench.sql` → Run.
   - Authentication → Sign In / Providers → Email: on. Either keep "Confirm email" on (you'll click a link once) or turn it off for a one-person app.
   - Project Settings → API: copy the **Project URL** and the **anon public** key.
2. **Report writer (optional).** With the Supabase CLI:
   ```
   supabase functions deploy report --project-ref <your-ref>
   supabase secrets set ANTHROPIC_API_KEY=<your key> --project-ref <your-ref>
   ```
   It uses Claude Opus 5.5 at medium effort, with automatic fallback if a request is declined. Without it, the app still works: **Write this segment with Claude** shows a **Copy prompt for Claude** box, you paste the prompt into Claude, and paste the reply back.
3. **Hosting on Cloudflare Pages** (dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git):
   - Repository: `task-dashboard`. Production branch: `main`.
   - Framework preset: **None**. Build command: `bash techbench-app/dev/build-site.sh`. Build output directory: `site`.
   - Environment variables (Production): `SUPABASE_URL` = your project URL, `SUPABASE_ANON_KEY` = the anon public key.
   - Save and deploy. Tech Bench is at `https://<project>.pages.dev/`, J.A.R.V.I.S. at `https://<project>.pages.dev/jarvis/`. Every push to `main` redeploys.

The anon key is designed to be public; the security rules above are what protect the data.

## J.A.R.V.I.S. command centre with the ElevenLabs voice

`jarvis/` is the hosted copy of the J.A.R.V.I.S. command centre (the same page as the claude.ai artifact, built by `node dev/build-jarvis.js <artifact html>`). Hosted, it can do what the claude.ai frame blocks: Claude writes each reply through `supabase/functions/jarvis-chat`, and ElevenLabs speaks it through `supabase/functions/jarvis-voice`, while the browser keeps listening for "Hey Jarvis".

| Setting | Value |
|---|---|
| Voice ID | `fONmGZvf9jMdFhjqnd2L` (override with secret `JARVIS_VOICE_ID`) |
| Model | `eleven_flash_v2_5` |
| Endpoint | `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream?output_format=mp3_44100_128` |
| Voice settings | stability 0.62, similarity_boost 0.80, style 0.05, speed 0.96, use_speaker_boost true |
| Key | `ELEVENLABS_API_KEY`, read from the Supabase function secrets, never sent to the page |

Deploy (once Supabase is set up as above):
```
supabase functions deploy jarvis-voice --project-ref <ref>
supabase functions deploy jarvis-chat --project-ref <ref>
supabase secrets set ELEVENLABS_API_KEY=<key from the workspace that holds the jarvis voice> --project-ref <ref>
supabase secrets set ANTHROPIC_API_KEY=<key> --project-ref <ref>
```
Optionally lock the functions to your site: `supabase secrets set JARVIS_ALLOWED_ORIGIN=https://<project>.pages.dev`. Then open `https://<project>.pages.dev/jarvis/` and sign in with your Tech Bench account. Use Edge or Chrome for "Hey Jarvis" hands-free.

Tests: `node --experimental-strip-types tests/jarvis-voice-fn.mjs` (exact ElevenLabs request), `MOCK_TONE=<mp3> node tests/jarvis-hosted.js` (sign-in, Claude tool call, spoken reply).

## Install

- **Android (Chrome):** open the app link → ⋮ → *Add to Home screen* → *Install*.
- **iPhone (Safari):** Share → *Add to Home Screen*.
- **Windows 11 (Edge or Chrome):** open the link → install icon at the right of the address bar (or ⋯ → *Apps* → *Install Tech Bench*). It gets a Start menu entry and its own window.

Sign in with the same email on both.

## Bring existing jobs over

In the original Tech Bench page: **Settings → Export backup**. In the app: **Settings → Bring jobs over** → choose the file. Jobs, machine details, segments and timeline come across; importing twice doesn't duplicate anything. Photos stay in the original page (a note on each job says how many).

## Develop and test

```
node dev/mock-supabase.js          # Supabase-shaped mock on :8788, app on :8787
node tests/e2e-299d3.js A          # phone + laptop + offline + sync + duplicates + conflicts
node tests/e2e-299d3.js B reply.json   # apply a report reply on the laptop and check it
node tests/import-backup.js        # old-page backup import, twice
node dev/make-icons.js             # regenerate icons
```

Bump `VERSION` in `sw.js` when you change app files so installed copies pick up the update.
