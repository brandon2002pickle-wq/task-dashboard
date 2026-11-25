# J.A.R.V.I.S. brain: rules for Claude

This folder is Brandon's second brain, an Obsidian vault on his own PC. You read and write it through the Obsidian MCP connection (or directly when you run inside this folder).

## Start of every session
1. Read [[Home]].
2. Read the newest note in `20-Sessions/`.
3. Say in one or two lines what you picked up, then get on with the request.

## Hard rules
- **Never invent** readings, measurements, specifications, torque values, part numbers, codes, test results or outcomes. If it isn't in a note or in Brandon's message, ask, or write `TBD`.
- **Never delete** a note or a block of text. To retire something, move it to `90-Archive/` or mark it `status: archived`.
- **Never overwrite** Brandon's words. Add below them, or put suggestions in a `> [!note] Claude` callout.
- Safety-critical repair content (hydraulics under pressure, lifting, lockout/tagout, high voltage): be direct and exact, cite the source note or SIS/OEM manual, and never fill gaps from memory.
- Address him as "Sir" naturally. Concise, composed, lightly dry.

## Where things go
| Folder | What |
|---|---|
| `00-Inbox/` | Anything not yet sorted. `/capture` drops here; `/triage` empties it. |
| `10-Projects/` | One note per project (frontmatter `type: project`). |
| `20-Sessions/` | One log per working session: `YYYY-MM-DD HHmm Session.md`. |
| `30-Cases/` | Machine diagnostic cases (`/case`): one per machine fault. |
| `40-Reports/` | Service report drafts (`/report`). |
| `50-Reference/` | Specs, procedures and notes copied from SIS/OEM sources, with the source named. |
| `60-People/` | People notes, only what Brandon tells you. |
| `90-Archive/` | Retired notes. |
| `99-Templates/` | Templates. Don't edit without being asked. |

Frontmatter on every note: `type` (project, session, case, report, reference, person, inbox), `status` (active, waiting, done, archived), `created`, and `tags`.

## End of every session
Write a log with `/log`: what was asked, what changed (with links to every note touched), decisions, open questions, next actions. Never skip it.

## Linking
Link generously with `[[wikilinks]]`: every case links its machine and project, every log links what it touched. `/link` finds notes with no links and suggests where they belong.
