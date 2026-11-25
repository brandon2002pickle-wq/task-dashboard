# Pickle's PSR Tool (installable app)

The PSR Tool artifact, rebuilt as its own installable web app. It runs on an Android phone, an iPhone or a Windows 11 laptop, opens with no signal, and syncs to the same account as Tech Bench.

Same four tabs as the artifact: **Intake** (paste codes, attach the PSR as PDF / saved .htm / text / photos), **Diagnose** (ranked causes, one ordered check at a time, pass/fail/reading, conclusion, work order paragraph, actual fix), **Telematics** (VisionLink CSV/XLSX or ISO 15143-3 JSON) and **Machines** (every PSR per serial, recurring codes, compare two reports). Diagnostic reference, prompts and rules are carried over unchanged. New: **Settings** (account, Claude mode, backup, install).

## What changed from the artifact

| Artifact (inside Claude) | Installed app |
|---|---|
| Claude page runtime reads the report | `psr` Supabase Edge Function on your Anthropic key; or **copy & paste**: the app shows the prompt, you paste Claude's reply back |
| Per-user storage in Claude | IndexedDB on the device first, then your Supabase account (newest change wins, deletes sync) |
| Claude dictation | The browser's speech recognition (Chrome/Edge/Safari); the Dictate button hides where there is none |
| PDF and spreadsheet readers from cdnjs | Bundled in `vendor/` so they work offline |
| Cases saved in the artifact's browser storage | Carried over automatically if this browser has them; otherwise use **Settings → Export/Import backup** |

Photos sent to Claude are shrunk on the device (longest side 1568 px, JPEG) before upload. Nothing else leaves the device except to your own Supabase project.

## Set it up (one time, same Supabase project as Tech Bench)

1. **Sync table.** Supabase → SQL Editor → paste `supabase/migrations/003_psr.sql` → Run. Until then the app saves on each device and Settings says sync isn't set up.
2. **Claude function.** From `psr-app/`:
   ```
   supabase functions deploy psr --project-ref msbkremdhfexxrziejrm
   ```
   It reuses the `ANTHROPIC_API_KEY` secret Tech Bench's `report` function uses (set it with `supabase secrets set ANTHROPIC_API_KEY=...` if that was never done). Claude Opus 5.5, high effort for reads and step updates, medium for the work order paragraph, automatic fallback if a request is declined. Until it's deployed the app uses copy & paste on its own.
3. **Hosting.** Already wired into *Deploy Tech Bench and PSR Tool apps* (`.github/workflows/techbench-pages.yml`). Merge to `main` and it publishes at `https://brandon2002pickle-wq.github.io/task-dashboard/psr/` beside Tech Bench.

## Install

- **Android (Chrome):** open the link → ⋮ → *Add to Home screen* → *Install* (or Settings → *Install PSR Tool*).
- **iPhone (Safari):** Share → *Add to Home Screen*.
- **Windows 11 (Edge/Chrome):** install icon at the right of the address bar.

Sign in under **Settings** with your Tech Bench email.

### On iPhone

- Install from **Safari** (Chrome on iPhone can't add web apps to the Home Screen). Intake shows a one-time reminder until it's installed.
- The Home Screen app keeps its **own storage, separate from Safari**. Sign in before you rely on it, or move cases across with Settings → Export / Import backup.
- Opens on a dark launch screen (`splash/`, made by `node dev/make-splash.js`) instead of a white flash.
- Tabs sit along the bottom within thumb reach, clear of the home indicator. The header scrolls away, and a strip keeps the status bar readable.
- Code, model, serial and reply fields have autocorrect and auto-capitalisation tuned so iOS doesn't "fix" `168-4` or `E0360`.
- **Dictate** uses Siri's speech recognition (Siri & Dictation must be on). If iOS won't allow it in the Home Screen app, the buttons hide and the keyboard's mic works instead.
- The app asks iOS to keep its storage, so Safari's clean-up of unused site data doesn't clear your cases.
 It installs as a separate app with its own icon; Tech Bench's service worker ignores `/psr/`.

## Develop and test

```
node dev/mock.js            # Supabase-shaped mock on :8798, app on http://localhost:8797/psr/
node tests/e2e.js           # phone (copy & paste, PDF, telematics, offline) -> sign-in sync -> laptop via function -> delete sync -> function missing
node tests/atomic-save.js   # a case and its sync mark are saved in one transaction (closing the app mid-save can't strand a case)
node dev/make-icons.js      # regenerate icons
node dev/make-splash.js     # regenerate iPhone launch screens
```

Bump `VERSION` in `sw.js` when app files change so installed copies update.
