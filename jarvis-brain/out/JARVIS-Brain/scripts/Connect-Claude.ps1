<#
  Connect-Claude.ps1: connect Claude to the JARVIS-Brain vault through the Obsidian "Local REST API" plugin's built-in MCP server.
  1. Checks the plugin answers and accepts your API key.
  2. Checks its MCP endpoint answers.
  3. Registers it with Claude Code (if installed).
  4. Adds it to Claude Desktop's settings, after backing up the existing file.
  Your key is typed in here, never sent anywhere except to Obsidian on this PC and written into Claude's own config files.
  Run:  right-click > Run with PowerShell,  or:  powershell -ExecutionPolicy Bypass -File .\scripts\Connect-Claude.ps1
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
    args    = @('-y', 'mcp-remote', $mcp, '--header', 'Authorization:${OBSIDIAN_AUTH}')
    env     = [pscustomobject]@{ OBSIDIAN_AUTH = "Bearer $key" }
  }
  if ($json.mcpServers.PSObject.Properties.Name -contains $Name) { $json.mcpServers.$Name = $server } else { $json.mcpServers | Add-Member -NotePropertyName $Name -NotePropertyValue $server }
  $text = $json | ConvertTo-Json -Depth 20
  [IO.File]::WriteAllText($cfg, $text, (New-Object Text.UTF8Encoding($false)))   # no BOM: Claude Desktop won't read a BOM
  Say "Claude Desktop: '$Name' added. Quit Claude Desktop fully (system tray) and reopen it." 'Green'
  if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { Say 'Node.js (npx) not found: install Node.js LTS from nodejs.org, or Claude Desktop cannot start the bridge.' 'Yellow' }
}
Say 'Done. In Claude, ask: "Read Home in my vault and give me a /brief".' 'Cyan'
