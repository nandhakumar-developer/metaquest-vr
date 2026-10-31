[CmdletBinding()]
param(
  [switch]$Dev
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  throw 'Dependencies are missing. Run .\scripts\windows\install.ps1 first.'
}

if (-not (Test-Path (Join-Path $root '.env'))) {
  Write-Host 'No .env found; copying .env.example.' -ForegroundColor Yellow
  Copy-Item (Join-Path $root '.env.example') (Join-Path $root '.env')
}

$publicUrl = $null
Get-Content (Join-Path $root '.env') | ForEach-Object {
  if ($_ -match '^\s*PUBLIC_GATEWAY_URL\s*=\s*(.+?)\s*$') {
    $publicUrl = $Matches[1].Trim('"', "'")
  }
}

Write-Host '=== VR Control Center ===' -ForegroundColor Cyan
if ($Dev) {
  Write-Host 'Development mode: Vite http://localhost:3000 + gateway http://localhost:4000'
  Write-Host 'Press Ctrl+C to stop both processes.' -ForegroundColor DarkGray
  npm run dev
} else {
  if ($publicUrl) {
    Write-Host "Dashboard:      $publicUrl"
    Write-Host "Quest player:   $publicUrl/player/"
  } else {
    Write-Host 'Dashboard:      http://localhost:4000'
    Write-Host 'Quest player:   http://localhost:4000/player/'
  }
  if (-not (Test-Path (Join-Path $root 'apps\gateway\dist\index.js'))) {
    Write-Host 'Production build missing; npm start will build it first.' -ForegroundColor Yellow
  }
  Write-Host 'Allow Node.js through Windows Firewall on Private networks (TCP 4000).' -ForegroundColor DarkGray
  Write-Host 'Press Ctrl+C to stop.' -ForegroundColor DarkGray
  npm start
}
