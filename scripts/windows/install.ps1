[CmdletBinding()]
param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root

Write-Host '=== VR Control Center installer ===' -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js was not found on PATH. Install Node.js 24 or newer from https://nodejs.org/ and try again.'
}

$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 24) {
  throw "Node.js 24 or newer is required; found $(node --version)."
}
Write-Host "Node.js $(node --version) / npm $(npm --version)" -ForegroundColor Green

if (-not (Test-Path (Join-Path $root '.env'))) {
  Write-Host 'No .env yet; the first dev/start run will create it automatically.' -ForegroundColor Yellow
} else {
  Write-Host '.env already exists; leaving it unchanged.' -ForegroundColor DarkGray
}

Write-Host 'Installing workspace dependencies...'
npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }

if (-not $SkipBuild) {
  Write-Host 'Building packages, admin dashboard, and gateway...'
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build failed.' }
}

Write-Host ''
Write-Host 'Install complete.' -ForegroundColor Green
Write-Host 'Next steps:' -ForegroundColor Cyan
Write-Host '  1. Start the gateway: .\scripts\windows\start.ps1  (or -Dev)'
Write-Host '  2. Open https://localhost:5000/admin and sign in as admin2026 / Ndurance@2026.'
Write-Host '  3. Allow Node.js through Windows Firewall (TCP 5000).'
Write-Host '  4. To change credentials or the port, edit .env after the first run.'
