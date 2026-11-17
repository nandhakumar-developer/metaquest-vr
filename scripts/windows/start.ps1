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

$publicUrl = $null
$gatewayPort = '5000'
$envPath = Join-Path $root '.env'
$envExists = Test-Path $envPath
if ($envExists) {
  Get-Content $envPath | ForEach-Object {
    if ($_ -match '^\s*PUBLIC_GATEWAY_URL\s*=\s*(.+?)\s*$') {
      $publicUrl = $Matches[1].Trim('"', "'")
    }
    if ($_ -match '^\s*GATEWAY_PORT\s*=\s*(\d+)') {
      $gatewayPort = $Matches[1]
    }
  }
} else {
  Write-Host 'No .env yet; the first run will create it, generate HTTPS, and build the dashboard.' -ForegroundColor Yellow
}

$hasTls = (
  (Test-Path (Join-Path $root 'storage\certs\gateway.crt')) -and
  (Test-Path (Join-Path $root 'storage\certs\gateway.key'))
) -or (
  (Test-Path (Join-Path $root 'certs\gateway.crt')) -and
  (Test-Path (Join-Path $root 'certs\gateway.key'))
)
$scheme = if ($hasTls) { 'https' } else { 'http' }

Write-Host '=== VR Control Center ===' -ForegroundColor Cyan
if ($Dev) {
  if ($envExists) {
    Write-Host "Development mode: Vite ${scheme}://localhost:3000 + gateway ${scheme}://localhost:$gatewayPort"
  } else {
    Write-Host "Development mode: Vite :3000 + gateway :$gatewayPort (first run creates HTTPS)"
  }
  Write-Host 'Live dashboard: Vite:3000; gateway-served dashboard: /admin on the gateway port.' -ForegroundColor DarkGray
  Write-Host 'Press Ctrl+C to stop both processes.' -ForegroundColor DarkGray
  npm run dev
} else {
  if ($publicUrl) {
    Write-Host "Dashboard:      $publicUrl/admin"
    Write-Host "Quest player:   $publicUrl/player/"
  } elseif (-not $envExists) {
    Write-Host 'Dashboard:      see the gateway banner after the first-run setup.'
    Write-Host 'Quest player:   see the gateway banner after the first-run setup.'
  } else {
    Write-Host "Dashboard:      $scheme`://localhost:$gatewayPort/admin"
    Write-Host "Quest player:   $scheme`://localhost:$gatewayPort/player/"
  }
  if (-not (Test-Path (Join-Path $root 'apps\gateway\dist\index.js'))) {
    Write-Host 'Production build missing; npm start will build it first.' -ForegroundColor Yellow
  }
  Write-Host "Allow Node.js through Windows Firewall (TCP $gatewayPort)." -ForegroundColor DarkGray
  Write-Host 'Press Ctrl+C to stop.' -ForegroundColor DarkGray
  npm start
}
