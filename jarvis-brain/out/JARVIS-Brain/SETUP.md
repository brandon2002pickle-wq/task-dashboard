# JARVIS-Brain setup (about 15 minutes)

Your notes stay on your PC. Claude reads and writes them through the Obsidian **Local REST API** plugin, which has an MCP server built in.

## 1. Put the vault in place (2 min)
1. Unzip **JARVIS-Brain** to `Documents\JARVIS-Brain`. Keep your existing J.A.R.V.I.S. vault where it is; this one sits beside it.
2. Obsidian → vault switcher (bottom left) → **Open folder as vault** → choose `Documents\JARVIS-Brain`.
3. If asked, choose **Trust author and enable plugins** (there are no community plugins in it yet).

## 2. Install the connector plugin (4 min)
1. Settings → **Community plugins** → **Turn on community plugins** → **Browse**.
2. Search **Local REST API** (by Adam Coddington) → **Install** → **Enable**. If it's already installed, **Update** it: the MCP server is in current versions.
3. Settings → **Local REST API**:
   - Copy the **API Key**.
   - Turn on **Enable Non-encrypted (HTTP) Server** (port **27123**). This avoids certificate errors; it only listens on this PC.

## 3. Connect Claude (3 min)
1. Install **Node.js LTS** from nodejs.org if you don't have it (Claude Desktop needs `npx` for the bridge).
2. In File Explorer, open `Documents\JARVIS-Brain\scripts`, right-click **Connect-Claude.ps1** → **Run with PowerShell**.
   If Windows blocks it: open PowerShell in that folder and run
   `powershell -ExecutionPolicy Bypass -File .\Connect-Claude.ps1`
3. Paste the API key when asked. The script:
   - checks Obsidian answers and accepts the key,
   - checks the MCP endpoint answers,
   - adds **jarvis-brain** to Claude Code (if installed),
   - backs up `%APPDATA%\Claude\claude_desktop_config.json` and adds **jarvis-brain** to Claude Desktop.
4. Quit Claude Desktop fully (right-click its tray icon → Quit) and reopen it.

## 4. Check it works (2 min)
- **Claude Desktop:** new chat → "Read Home in my vault and give me a brief."
- **Claude Code:** `cd Documents\JARVIS-Brain` then `claude` and type `/brief`. The slash commands (/brief, /capture, /triage, /log, /case, /report, /link) live in `.claude/commands`.
- **Phone / web:** reach the vault through Desktop Commander while the PC is on and Desktop Commander shows **Online**.

## 5. Bring your old notes over (4 min)
1. In Obsidian, open your old J.A.R.V.I.S. vault in a second window.
2. Drag the notes you want into **JARVIS-Brain › 00-Inbox** (from inside Obsidian, so links update).
3. In Claude Code in the vault: `/triage`. Claude proposes where each one goes; nothing moves until you approve.

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
| Want to undo | Restore the `claude_desktop_config.json.bak-…` file the script made; `claude mcp remove jarvis-brain --scope user`. |

Your API key is written into Claude's own config files on this PC (that's how they authenticate). Anyone with access to your Windows account can read those files, so don't share them.
