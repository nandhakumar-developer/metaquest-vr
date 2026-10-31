[CmdletBinding()]
param(
  [string]$Email,
  [string]$Name = 'VRCC Administrator',
  [ValidateSet('admin', 'operator', 'viewer')]
  [string]$Role = 'admin'
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root

Write-Host '=== Create or update a local administrator ===' -ForegroundColor Cyan

if (-not $Email) {
  $Email = (Read-Host 'Admin email').Trim()
}
$secure = Read-Host 'Password (min 12 chars, letter and number)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if (-not $Email -or -not $Password) {
  throw 'Email and password are required.'
}
if ($Password.Length -lt 12 -or $Password -notmatch '[A-Za-z]' -or $Password -notmatch '[0-9]') {
  throw 'Password must be at least 12 characters and include a letter and a number.'
}

try {
  # Keep the password out of the child process command line and shell history.
  $env:BOOTSTRAP_ADMIN_EMAIL = $Email
  $env:BOOTSTRAP_ADMIN_PASSWORD = $Password
  npm run admin:create -- "--name=$Name" "--role=$Role"
  if ($LASTEXITCODE -ne 0) { throw 'admin:create failed.' }
} finally {
  Remove-Item Env:BOOTSTRAP_ADMIN_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Done. Sign in to the dashboard with that email and password.' -ForegroundColor Green
