// Builds the JARVIS-Brain starter vault into ./out/JARVIS-Brain (then zipped by the caller).
// Everything Claude reads or writes lives in plain Markdown in this folder on Brandon's PC.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out', 'JARVIS-Brain');
fs.rmSync(path.dirname(ROOT), { recursive: true, force: true });
const w = (rel, text) => { const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text.replace(/^\n/, '')); };
const json = (rel, obj) => w(rel, JSON.stringify(obj, null, 2) + '\n');
const today = '2026-11-25';

/* ---------------- rules ---------------- */
w('CLAUDE.md', `
# J.A.R.V.I.S. brain: rules for Claude

This folder is Brandon's second brain, an Obsidian vault on his own PC. You read and write it through the Obsidian MCP connection (or directly when you run inside this folder).

## Start of every session
1. Read [[Home]].
2. Read the newest note in \`20-Sessions/\`.
3. Say in one or two lines what you picked up, then get on with the request.

## Hard rules
- **Never invent** readings, measurements, specifications, torque values, part numbers, codes, test results or outcomes. If it isn't in a note or in Brandon's message, ask, or write \`TBD\`.
- **Never delete** a note or a block of text. To retire something, move it to \`90-Archive/\` or mark it \`status: archived\`.
- **Never overwrite** Brandon's words. Add below them, or put suggestions in a \`> [!note] Claude\` callout.
- Safety-critical repair content (hydraulics under pressure, lifting, lockout/tagout, high voltage): be direct and exact, cite the source note or SIS/OEM manual, and never fill gaps from memory.
- Address him as "Sir" naturally. Concise, composed, lightly dry.

## Where things go
| Folder | What |
|---|---|
| \`00-Inbox/\` | Anything not yet sorted. \`/capture\` drops here; \`/triage\` empties it. |
| \`10-Projects/\` | One note per project (frontmatter \`type: project\`). |
| \`20-Sessions/\` | One log per working session: \`YYYY-MM-DD HHmm Session.md\`. |
| \`30-Cases/\` | Machine diagnostic cases (\`/case\`): one per machine fault. |
| \`40-Reports/\` | Service report drafts (\`/report\`). |
| \`50-Reference/\` | Specs, procedures and notes copied from SIS/OEM sources, with the source named. |
| \`60-People/\` | People notes, only what Brandon tells you. |
| \`90-Archive/\` | Retired notes. |
| \`99-Templates/\` | Templates. Don't edit without being asked. |

Frontmatter on every note: \`type\` (project, session, case, report, reference, person, inbox), \`status\` (active, waiting, done, archived), \`created\`, and \`tags\`.

## End of every session
Write a log with \`/log\`: what was asked, what changed (with links to every note touched), decisions, open questions, next actions. Never skip it.

## Linking
Link generously with \`[[wikilinks]]\`: every case links its machine and project, every log links what it touched. \`/link\` finds notes with no links and suggests where they belong.
`);

/* ---------------- home + dashboards ---------------- */
w('Home.md', `
---
type: home
created: ${today}
tags: [home]
---
# J.A.R.V.I.S.

Brandon · Technician B · Cat CCE · Thompson Tractor (D435)

- [[Command Centre]]: what's live right now
- [[Projects Board]]: projects by stage
- [[CLAUDE]]: how Claude behaves in this vault

## Projects
- [[J.A.R.V.I.S.]]
- [[Tech Bench]]
- [[Shop Log to AX]]
- [[PSR Diagnostics]]
- [[DEAD RECKONING]]
- [[Brine Jack]]
- [[Dealer Shop Level]]
- [[AI Knowledge Hub]]
`);

w('Command Centre.md', `
---
type: dashboard
created: ${today}
tags: [dashboard]
cssclasses: [hud]
---
# ◉ COMMAND CENTRE

> [!hud] Systems
> Live views below use Obsidian's built-in search, so no extra plugins are needed.

## Active projects
\`\`\`query
path:"10-Projects" line:("status: active")
\`\`\`

## Recent session logs
\`\`\`query
path:"20-Sessions"
\`\`\`

## Inbox
\`\`\`query
path:"00-Inbox"
\`\`\`

## Open questions
\`\`\`query
tag:#question OR line:("- [ ] ?")
\`\`\`

## Open cases
\`\`\`query
path:"30-Cases" line:("status: active")
\`\`\`

## Notes with no links
Claude keeps this list current with \`/link\`.
<!-- orphans:start -->
- (run /link)
<!-- orphans:end -->
`);

w('Projects Board.md', `
---

kanban-plugin: basic

---

## Ideas

- [ ] [[Brine Jack]]
- [ ] [[AI Knowledge Hub]]


## Active

- [ ] [[J.A.R.V.I.S.]]
- [ ] [[Tech Bench]]
- [ ] [[PSR Diagnostics]]
- [ ] [[DEAD RECKONING]]


## Waiting

- [ ] [[Shop Log to AX]]
- [ ] [[Dealer Shop Level]]


## Done



%% kanban:settings
\`\`\`
{"kanban-plugin":"basic"}
\`\`\`
%%
`);

/* ---------------- projects: only what Brandon has said; the rest blank ---------------- */
const projects = [
  ['J.A.R.V.I.S.', 'active', 'Personal command centre with a talking AI assistant: galaxy home screen, shop mode, voice, background music.'],
  ['Tech Bench', 'active', 'Service report and job tool for Cat CCE work: reports in AX order (D435, G/49), PSR before and after every repair.'],
  ['Shop Log to AX', 'waiting', ''],
  ['PSR Diagnostics', 'active', 'Pickle\'s PSR Tool: read Product Status Reports and troubleshoot machines from their faults and machine information.'],
  ['DEAD RECKONING', 'active', 'First-person zombie survival game.'],
  ['Brine Jack', 'idea', ''],
  ['Dealer Shop Level', 'waiting', ''],
  ['AI Knowledge Hub', 'idea', '']
];
for (const [name, status, line] of projects) w(`10-Projects/${name}.md`, `
---
type: project
status: ${status}
created: ${today}
tags: [project]
---
# ${name}

${line || '_One-line description: TBD (Brandon to add)._'}

## Goal
TBD

## Next actions
- [ ] TBD

## Log
Links to session logs that touched this project.
`);

/* ---------------- folders ---------------- */
for (const d of ['00-Inbox', '20-Sessions', '30-Cases', '40-Reports', '50-Reference', '60-People', '90-Archive']) w(`${d}/.keep.md`, `Folder for ${d.slice(3)}. See [[CLAUDE]].\n`);
w(`20-Sessions/${today} 0000 Vault created.md`, `
---
type: session
status: done
created: ${today}
tags: [session]
---
# ${today}: vault created

- **Asked:** set up the J.A.R.V.I.S. brain vault.
- **Changed:** created [[Home]], [[Command Centre]], [[Projects Board]] and the project notes.
- **Open questions:** one-line descriptions for [[Shop Log to AX]], [[Brine Jack]], [[Dealer Shop Level]], [[AI Knowledge Hub]].
- **Next:** move old notes into \`00-Inbox\` and run \`/triage\`.
`);

/* ---------------- templates ---------------- */
w('99-Templates/Session.md', `---\ntype: session\nstatus: done\ncreated: {{date}}\ntags: [session]\n---\n# {{date}} {{time}}: \n\n- **Asked:** \n- **Changed:** \n- **Decisions:** \n- **Open questions:** \n- **Next:** \n`);
w('99-Templates/Case.md', `---\ntype: case\nstatus: active\ncreated: {{date}}\nmachine: \nserial: \nsmu: \ntags: [case]\n---\n# Case: \n\n## Complaint\n\n## Codes (PSR before)\n\n## Checks and findings\n| Step | Result | Source |\n|---|---|---|\n\n## Cause\nTBD\n\n## Repair\nTBD\n\n## PSR after\nTBD\n`);
w('99-Templates/Project.md', `---\ntype: project\nstatus: idea\ncreated: {{date}}\ntags: [project]\n---\n# \n\n## Goal\nTBD\n\n## Next actions\n- [ ] \n`);

/* ---------------- Claude Code commands ---------------- */
const cmd = (name, desc, body) => w(`.claude/commands/${name}.md`, `---\ndescription: ${desc}\n---\n${body.trim()}\n`);
cmd('brief', 'Morning brief from the vault', `
Read [[Home]], the newest note in 20-Sessions/, every project with status active, open cases and the inbox.
Give Brandon a brief he could read in 30 seconds: what's in flight, what's waiting on someone, the three most useful next actions, and anything unanswered. Lead with the answer. Don't invent anything that isn't in the notes.`);
cmd('capture', 'Drop a thought into the inbox', `
Create a note in 00-Inbox/ named with today's date and a short title from: $ARGUMENTS
Frontmatter: type inbox, status active, created today. Keep his words exactly; add suggested links below in a "> [!note] Claude" callout. Confirm in one line.`);
cmd('triage', 'Sort the inbox', `
For each note in 00-Inbox/: decide where it belongs (project, case, reference, person, or archive), propose the move and the links in a single table, and wait for Brandon to approve. Then move the notes (never delete), add the links, and record it all in a session log.`);
cmd('log', 'Write the session log', `
Write 20-Sessions/YYYY-MM-DD HHmm Session.md from the template: what was asked, what changed (link every note touched), decisions, open questions, next actions. Add a link to it under "## Log" in each project it touched.`);
cmd('case', 'Open or update a machine diagnostic case', `
Open or update a case in 30-Cases/ for: $ARGUMENTS
Record only what Brandon gives you: model, serial, SMU, complaint, codes from the PSR (before), each check with its actual result and source. Suggest the next checks from SIS/OEM procedure, labelled as suggestions. Never fill in readings, specs or outcomes yourself; use TBD and ask.`);
cmd('report', 'Write a service report in his work-order style', `
Write a service report for: $ARGUMENTS (use the linked case if there is one).
Style: one concise, continuous professional paragraph per segment, no first person ("I"), describing the work performed and a clear final repair result.
Order for AX: dealer D435, customer complaint, repair process, causing failure, resultant damage, internal notes, cause code G, second code 49, part number, group number, group name.
Every repair segment states that a Product Status Report was pulled before and after the repair.
Non-warranty segments, or segments with no specific part: part 0000000, group 7595.
Include only actions and findings Brandon supplied. If the final outcome is missing, ask for it instead of inventing it.
Save the draft in 40-Reports/ and link it from the case.`);
cmd('link', 'Find notes with no links and connect them', `
Find notes with no incoming or outgoing [[links]] (ignore templates and .keep files). For each, suggest where it belongs and the links to add. Update the list between <!-- orphans:start --> and <!-- orphans:end --> in [[Command Centre]]. Ask before changing other notes.`);

/* ---------------- Obsidian settings: dark HUD look, graph coloured by type ---------------- */
const rgb = h => parseInt(h.slice(1), 16);
json('.obsidian/appearance.json', { theme: 'obsidian', cssTheme: '', enabledCssSnippets: ['jarvis-hud'], accentColor: '#8577ff' });
json('.obsidian/graph.json', {
  'collapse-filter': false, search: 'path:"" -path:"99-Templates" -file:.keep', showTags: false, showAttachments: false, hideUnresolved: false, showOrphans: true,
  'collapse-color-groups': false,
  colorGroups: [
    { query: 'path:"10-Projects"', color: { a: 1, rgb: rgb('#8577ff') } },
    { query: 'path:"20-Sessions"', color: { a: 1, rgb: rgb('#5cd6ff') } },
    { query: 'path:"30-Cases"', color: { a: 1, rgb: rgb('#ffc44a') } },
    { query: 'path:"40-Reports"', color: { a: 1, rgb: rgb('#ff7a45') } },
    { query: 'path:"50-Reference"', color: { a: 1, rgb: rgb('#9fe8ac') } },
    { query: 'path:"00-Inbox"', color: { a: 1, rgb: rgb('#ff5c74') } },
    { query: 'file:Home OR file:"Command Centre"', color: { a: 1, rgb: rgb('#ffffff') } }
  ],
  'collapse-display': false, showArrow: false, textFadeMultiplier: -1, nodeSizeMultiplier: 1.3, lineSizeMultiplier: 1, 'collapse-forces': true,
  centerStrength: 0.5, repelStrength: 12, linkStrength: 1, linkDistance: 220
});
json('.obsidian/app.json', { newFileLocation: 'folder', newFileFolderPath: '00-Inbox', attachmentFolderPath: '50-Reference/attachments', alwaysUpdateLinks: true });
json('.obsidian/templates.json', { folder: '99-Templates' });
json('.obsidian/core-plugins.json', ['file-explorer', 'global-search', 'graph', 'backlink', 'outgoing-link', 'tag-pane', 'page-preview', 'templates', 'note-composer', 'command-palette', 'outline', 'switcher']);
w('.obsidian/snippets/jarvis-hud.css', `
/* J.A.R.V.I.S. HUD: dark, ultraviolet accents, scanline-free so it stays readable */
.theme-dark {
  --background-primary: #07061a; --background-secondary: #0b0a24; --background-secondary-alt: #0e0c2c;
  --text-normal: #e8e7ff; --text-muted: #9a97c9; --text-accent: #8577ff; --interactive-accent: #6a5cff;
  --h1-color: #ffffff; --h2-color: #c9c3ff; --link-color: #9d8cff; --link-unresolved-color: #ff5c74;
  --graph-line: rgba(133,119,255,.28); --graph-node: #c9c3ff; --graph-node-focused: #ffffff;
}
.theme-dark .markdown-rendered h1, .theme-dark .cm-header-1 { font-family: 'Orbitron', var(--font-interface); letter-spacing: .08em; text-shadow: 0 0 18px rgba(133,119,255,.6); }
.hud .callout[data-callout="hud"] { --callout-color: 133, 119, 255; border: 1px solid rgba(133,119,255,.4); box-shadow: 0 0 24px -10px rgba(133,119,255,.8); }
.hud .internal-query { border: 1px solid rgba(133,119,255,.25); border-radius: 12px; box-shadow: inset 0 0 22px -14px rgba(133,119,255,.9); }
.graph-view.color-fill { color: #c9c3ff; }
`);
/* the one community plugin the connection needs; Obsidian asks before enabling it */
json('.obsidian/community-plugins.json', []);

/* ---------------- connection script ---------------- */
w('scripts/Connect-Claude.ps1', `
<#
  Connect-Claude.ps1: connect Claude to the JARVIS-Brain vault through the Obsidian "Local REST API" plugin's built-in MCP server.
  1. Checks the plugin answers and accepts your API key.
  2. Checks its MCP endpoint answers.
  3. Registers it with Claude Code (if installed).
  4. Adds it to Claude Desktop's settings, after backing up the existing file.
  Your key is typed in here, never sent anywhere except to Obsidian on this PC and written into Claude's own config files.
  Run:  right-click > Run with PowerShell,  or:  powershell -ExecutionPolicy Bypass -File .\\scripts\\Connect-Claude.ps1
#>
param(
  [int]$Port = 27123,                 # Obsidian > Settings > Local REST API > Non-encrypted (HTTP) server port
  [string]$Name = 'jarvis-brain',
  [switch]$SkipDesktop,
  [switch]$SkipCode
)
$ErrorActionPreference = 'Stop'
$base = "http://127.0.0.1:$Port"
function Say($msg, $color = 'Gray') { Write-Host $msg -ForegroundColor $color }

Say "J.A.R.V.I.S. brain: connecting Claude to Obsidian" 'Cyan'
$secure = Read-Host -AsSecureString 'Paste the API key from Obsidian > Settings > Local REST API'
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
$key = $key.Trim()
if (-not $key) { Say 'No key entered. Nothing changed.' 'Yellow'; exit 1 }
$auth = @{ Authorization = "Bearer $key" }

# 1. plugin answers and accepts the key
try { $status = Invoke-RestMethod -Uri "$base/" -Headers $auth -TimeoutSec 6 }
catch {
  Say "Obsidian didn't answer on $base." 'Red'
  Say '  - Is Obsidian open with the JARVIS-Brain vault?'
  Say '  - Settings > Community plugins: is "Local REST API" installed and enabled?'
  Say "  - Settings > Local REST API: turn on the Non-encrypted (HTTP) server (port $Port)."
  exit 1
}
if ($status.authenticated -ne $true) { Say 'Obsidian answered but rejected the key. Copy it again from Settings > Local REST API.' 'Red'; exit 1 }
Say ("Plugin OK" + $(if ($status.versions.self) { " (v$($status.versions.self))" } else { '' }) + ', key accepted.') 'Green'

# 2. MCP endpoint answers
$mcp = "$base/mcp/"
$init = @{ jsonrpc = '2.0'; id = 1; method = 'initialize'; params = @{ protocolVersion = '2025-06-18'; capabilities = @{}; clientInfo = @{ name = 'connect-claude'; version = '1.0' } } } | ConvertTo-Json -Depth 6 -Compress
try {
  $r = Invoke-WebRequest -Uri $mcp -Method Post -Body $init -ContentType 'application/json' -Headers @{ Authorization = "Bearer $key"; Accept = 'application/json, text/event-stream' } -UseBasicParsing -TimeoutSec 8
  Say "MCP endpoint answered ($($r.StatusCode))." 'Green'
} catch {
  Say "The MCP endpoint at $mcp didn't answer: $($_.Exception.Message)" 'Red'
  Say '  Update the Local REST API plugin to the latest version (its MCP server is built in), restart Obsidian, and run this again.'
  exit 1
}

# 3. Claude Code
if (-not $SkipCode) {
  $claude = Get-Command claude -ErrorAction SilentlyContinue
  if ($claude) {
    & claude mcp remove $Name --scope user 2>$null | Out-Null
    & claude mcp add --transport http --scope user $Name $mcp --header "Authorization: Bearer $key"
    if ($LASTEXITCODE -eq 0) { Say "Claude Code: '$Name' added (all folders)." 'Green' } else { Say 'Claude Code: adding the server failed (see above).' 'Yellow' }
  } else { Say 'Claude Code not found on PATH; skipped. Install it, then run this again.' 'Yellow' }
}

# 4. Claude Desktop (through the mcp-remote bridge; needs Node.js for npx)
if (-not $SkipDesktop) {
  $dir = Join-Path $env:APPDATA 'Claude'
  $cfg = Join-Path $dir 'claude_desktop_config.json'
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  if (Test-Path $cfg) {
    $backup = "$cfg.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Copy-Item $cfg $backup
    Say "Backed up Claude Desktop settings to $backup"
    $raw = Get-Content $cfg -Raw
    $json = if ($raw.Trim()) { $raw | ConvertFrom-Json } else { [pscustomobject]@{} }
  } else { $json = [pscustomobject]@{} }
  if (-not ($json.PSObject.Properties.Name -contains 'mcpServers')) { $json | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{}) }
  $server = [pscustomobject]@{
    command = 'npx'
    args    = @('-y', 'mcp-remote', $mcp, '--header', 'Authorization:\${OBSIDIAN_AUTH}')
    env     = [pscustomobject]@{ OBSIDIAN_AUTH = "Bearer $key" }
  }
  if ($json.mcpServers.PSObject.Properties.Name -contains $Name) { $json.mcpServers.$Name = $server } else { $json.mcpServers | Add-Member -NotePropertyName $Name -NotePropertyValue $server }
  $text = $json | ConvertTo-Json -Depth 20
  [IO.File]::WriteAllText($cfg, $text, (New-Object Text.UTF8Encoding($false)))   # no BOM: Claude Desktop won't read a BOM
  Say "Claude Desktop: '$Name' added. Quit Claude Desktop fully (system tray) and reopen it." 'Green'
  if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { Say 'Node.js (npx) not found: install Node.js LTS from nodejs.org, or Claude Desktop cannot start the bridge.' 'Yellow' }
}
Say 'Done. In Claude, ask: "Read Home in my vault and give me a /brief".' 'Cyan'
`);

/* ---------------- setup guide ---------------- */
w('SETUP.md', `
# JARVIS-Brain setup (about 15 minutes)

Your notes stay on your PC. Claude reads and writes them through the Obsidian **Local REST API** plugin, which has an MCP server built in.

## 1. Put the vault in place (2 min)
1. Unzip **JARVIS-Brain** to \`Documents\\JARVIS-Brain\`. Keep your existing J.A.R.V.I.S. vault where it is; this one sits beside it.
2. Obsidian → vault switcher (bottom left) → **Open folder as vault** → choose \`Documents\\JARVIS-Brain\`.
3. If asked, choose **Trust author and enable plugins** (there are no community plugins in it yet).

## 2. Install the connector plugin (4 min)
1. Settings → **Community plugins** → **Turn on community plugins** → **Browse**.
2. Search **Local REST API** (by Adam Coddington) → **Install** → **Enable**. If it's already installed, **Update** it: the MCP server is in current versions.
3. Settings → **Local REST API**:
   - Copy the **API Key**.
   - Turn on **Enable Non-encrypted (HTTP) Server** (port **27123**). This avoids certificate errors; it only listens on this PC.

## 3. Connect Claude (3 min)
1. Install **Node.js LTS** from nodejs.org if you don't have it (Claude Desktop needs \`npx\` for the bridge).
2. In File Explorer, open \`Documents\\JARVIS-Brain\\scripts\`, right-click **Connect-Claude.ps1** → **Run with PowerShell**.
   If Windows blocks it: open PowerShell in that folder and run
   \`powershell -ExecutionPolicy Bypass -File .\\Connect-Claude.ps1\`
3. Paste the API key when asked. The script:
   - checks Obsidian answers and accepts the key,
   - checks the MCP endpoint answers,
   - adds **jarvis-brain** to Claude Code (if installed),
   - backs up \`%APPDATA%\\Claude\\claude_desktop_config.json\` and adds **jarvis-brain** to Claude Desktop.
4. Quit Claude Desktop fully (right-click its tray icon → Quit) and reopen it.

## 4. Check it works (2 min)
- **Claude Desktop:** new chat → "Read Home in my vault and give me a brief."
- **Claude Code:** \`cd Documents\\JARVIS-Brain\` then \`claude\` and type \`/brief\`. The slash commands (/brief, /capture, /triage, /log, /case, /report, /link) live in \`.claude/commands\`.
- **Phone / web:** reach the vault through Desktop Commander while the PC is on and Desktop Commander shows **Online**.

## 5. Bring your old notes over (4 min)
1. In Obsidian, open your old J.A.R.V.I.S. vault in a second window.
2. Drag the notes you want into **JARVIS-Brain › 00-Inbox** (from inside Obsidian, so links update).
3. In Claude Code in the vault: \`/triage\`. Claude proposes where each one goes; nothing moves until you approve.

## Look and feel
- Dark HUD theme: Settings → Appearance → CSS snippets → **jarvis-hud** should be on.
- Graph (Ctrl+G) is coloured by type: projects violet, sessions cyan, cases amber, reports orange, reference green, inbox red.
- **Projects Board** shows as a board if you install the community **Kanban** plugin; without it, it's a plain list.

## If something fails
| Message | Fix |
|---|---|
| Obsidian didn't answer | Obsidian open on this vault? Plugin enabled? HTTP server on, port 27123? |
| Rejected the key | Copy the key again from Settings → Local REST API. |
| MCP endpoint didn't answer | Update the plugin, restart Obsidian, rerun the script. |
| Claude Desktop shows no tools | Quit it from the tray and reopen; check Node.js is installed. |
| Want to undo | Restore the \`claude_desktop_config.json.bak-…\` file the script made; \`claude mcp remove jarvis-brain --scope user\`. |

Your API key is written into Claude's own config files on this PC (that's how they authenticate). Anyone with access to your Windows account can read those files, so don't share them.
`);

console.log('built', ROOT);
