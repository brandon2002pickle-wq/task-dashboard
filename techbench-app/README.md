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
| Report | AX segments matching the service call (SC1431949_03: seq, job code, component, AX description; D435, G/49, 0000000/7595 unless warranty part), each segment written with Claude using your report instructions; shop-assist notes stay internal |
| Offline | Every save goes to the device first; the app opens with no signal; nothing is lost if it's closed |
| Sync | One sign-in on both devices; each entry shows *Saved on phone*, *Waiting to sync* or *Synced* |
| Conflicts | If both devices change the same field before syncing, both versions are kept and you choose |
| Parts | Cat CCE parts lookup by exact model, serial/PIN, part number, group or alias; SIS 2.0 extracts imported as CSV; log a result straight onto the job |

Not in version 1 yet (still in the original Tech Bench page): photo reading, machine register, checklists, shift handoff, Gmail sending.

PSR reading lives in its own installable app, **Pickle's PSR Tool** (`../psr-app`), published at `/psr/` beside this one and signed in with the same account.

## Parts lookup

Open **Parts**, or **Look up parts for this machine** on a Cat job, which fills in the model and serial.

- **Exact model.** Case and spacing don't matter, but suffixes do: 299D3 and 299D3 XE never mix.
- **Serial / PIN.** Takes a 17-character PIN (prefix = characters 10–12) or an 8-character serial. The app shows how it read the PIN. It hides rows for other prefixes or outside a row's serial range and says how many it hid. It also warns when the public D3 guide lists that prefix under a different model.
- **Each result** follows the reference's answer format: applicability, part and description, group, item, quantity per group, associated parts, and source. Any field the source doesn't support shows *unverified*. An evidence strip ranks it: exact PIN → serial range → model/guide-level → cross-model. A row only shows **SIS verified** when it was imported with `source_type` SIS and a `verified_on` date.
- **Starter index.** The nine public-reference rows from *Cat CCE Parts Reference for Claude* (`parts.js`, 299D3/XE and 272D3/XE), with sources A–G graded *Cat* or *third-party copy*. None of it is SIS data.
- **Adding SIS 2.0 records.** *Add SIS 2.0 records → Copy extraction prompt*. Give Claude the group pages with that prompt, check the CSV against the diagram, then import it as a file or by pasting. Rows are keyed on model, prefix, serial range, configuration, group, item, part, parent and side, so re-importing updates rows instead of duplicating them. Imports can be removed by file or exported back to CSV.
- **Sync.** Imported rows sync like jobs once `supabase/migrations/002_parts.sql` has been run. Before that they stay on the device, the Parts page says so, and jobs sync as normal.

## How sync works

- Records (`job`, `seg`, `entry`, `photo`) get their id on the device, so a retry after a lost reply re-sends the same id and the server's `push_record` function applies it once.
- Only changed fields are sent, together with the value the device last saw. If the server's value moved in between, that field comes back as a conflict instead of being overwritten.
- Photos upload to `photos/<your user id>/<job id>/<photo id>.jpg` with upsert, before their record is sent, so the other device never sees a photo record without its file.
- Row-level security and storage policies limit every record and file to the signed-in account.

## Set it up (one time)

You need two free accounts: **Supabase** (database, sign-in, photo storage) and **GitHub Pages** (hosting, on this repository). The report writer also needs an **Anthropic API key**.

1. **Supabase project.** At supabase.com create a project. Then:
   - SQL Editor → paste `supabase/migrations/001_techbench.sql` → Run, then the same for `002_parts.sql` (lets imported parts rows sync).
   - Authentication → Sign In / Providers → Email: on. Either keep "Confirm email" on (you'll click a link once) or turn it off for a one-person app.
   - Project Settings → API: copy the **Project URL** and the **anon public** key.
2. **Report writer (optional).** With the Supabase CLI:
   ```
   supabase functions deploy report --project-ref <your-ref>
   supabase secrets set ANTHROPIC_API_KEY=<your key> --project-ref <your-ref>
   ```
   It uses Claude Opus 5.5 at medium effort, with automatic fallback if a request is declined. Without it, the app still works: **Write this segment with Claude** shows a **Copy prompt for Claude** box, you paste the prompt into Claude, and paste the reply back.
3. **Hosting.** In this GitHub repository:
   - Settings → Secrets and variables → Actions → **Variables**: add `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
   - Settings → Pages → Source: **GitHub Actions**.
   - Merge this branch into `main` (or run the *Deploy Tech Bench app* workflow). The app is published at `https://<github-user>.github.io/task-dashboard/`.

The anon key is designed to be public; the security rules above are what protect the data.

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
node tests/local-then-sync.js      # jobs saved before sync was set up upload on first sign-in
node tests/parts.mjs               # parts rules: suffixes, PIN reading, serial ranges, CSV, evidence
node tests/parts-e2e.js            # parts on a phone: job -> lookup -> log part -> import, before/after migration 002
node tests/ax-segments.js          # AX layout: SC call #, seq, job/component codes, segment ids, 8-char serial
node dev/make-icons.js             # regenerate icons
```

Bump `VERSION` in `sw.js` when you change app files so installed copies pick up the update.
