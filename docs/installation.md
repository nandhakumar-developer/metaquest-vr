# Installation

## Prerequisites

- Windows 10 or 11 (the helper scripts are PowerShell).
- Node.js **24 or newer** and npm 10 or newer.
  Check with `node --version` and `npm --version`.
- A PC and the two Quest 2 headsets on the same Wi-Fi/LAN.
- Optional: FFmpeg and FFprobe on `PATH` for duration, codec, and thumbnail probing.
- Optional: a TLS certificate if you want immersive WebXR over HTTPS.

No paid account, cloud video host, or Android tooling is required.

## 1. Install dependencies

From the repository root:

```powershell
.\scripts\windows\install.ps1
```

Or manually:

```powershell
npm install
npm run build
```

The script checks the Node version, installs workspaces, and builds the shared packages,
admin SPA, and gateway.

## 2. Configure `.env`

The repository ships `.env.example`. Copy it to `.env` and adjust these values:

```dotenv
GATEWAY_HOST=0.0.0.0
GATEWAY_PORT=4000
PUBLIC_GATEWAY_URL=http://192.168.1.125:4000
ADMIN_ORIGIN=http://localhost:3000
EXTRA_ALLOWED_ORIGINS=http://192.168.1.125:3000
```

Find the PC's LAN IPv4 address:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }
```

Set `PUBLIC_GATEWAY_URL` to the address the headsets can reach. If you leave it blank, the
gateway auto-detects a LAN address and prefers physical Wi-Fi/Ethernet adapters over
virtual ones (WSL, Hyper-V, VirtualBox, Docker, VPN). Explicit values are still useful
when a machine has several physical adapters.

If an explicit `PUBLIC_GATEWAY_URL` points at an IPv4 address this PC no longer owns (for
example after a DHCP change), the gateway logs a warning and falls back to the detected
LAN address so the player link and QR code keep working. Delete the value or leave it
blank to always follow the current address.

`ADMIN_ORIGIN` is the Vite dev-server origin. It does not affect the production build served
by the gateway. Add any extra LAN origins to `EXTRA_ALLOWED_ORIGINS`, comma separated.

### This workspace

`.env` is already populated for this PC:

```dotenv
# Blank means auto-detect the current Wi-Fi/Ethernet LAN address.
PUBLIC_GATEWAY_URL=
VITE_SUPABASE_URL=https://jlmvpzugvwwglpkqtcly.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_wXb9MCrLiSXMlSdpA38RGQ_SZSuWeel
CLOUD_SYNC_ENABLED=false
```

No `SUPABASE_SERVICE_ROLE_KEY` is present, so Supabase admin login stays disabled and the
local administrator is used.

## 3. Create the administrator

Interactive:

```powershell
npm run admin:create
```

On Windows, use the PowerShell helper to enter the password without putting it in shell
history or the child process command line:

```powershell
.\scripts\windows\create-admin.ps1 -Email admin@vrcenter.local -Name "VRCC Administrator"
```

Password rules: at least 12 characters, at least one letter and one number, and no leading
or trailing spaces. The command creates the account or resets the password of an existing
account with the same email and revokes that account's current sessions. Keep the password
outside the repository.

## 4. Start the gateway

```powershell
.\scripts\windows\start.ps1
```

or:

```powershell
npm start
```

`npm start` builds first if `apps/gateway/dist/index.js` is missing, then runs the gateway in
production mode. Open:

```text
http://localhost:4000
```

Sign in with the administrator email and password.

## 5. Allow the LAN through Windows Firewall

When Windows prompts, allow Node.js on **Private networks**. If no prompt appeared, add a
rule as an administrator:

```powershell
New-NetFirewallRule -DisplayName "VR Control Center (TCP 4000)" `
  -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private
```

Test from another device on the LAN:

```text
http://192.168.1.125:4000/api/health
```

## 6. Verify

```powershell
curl http://localhost:4000/api/health
npm run typecheck
npm test
```

Expected health values include `"status":"ok"` and `"database":"ok"`. `ffmpeg.available`
will be `false` if FFmpeg is not installed; that is not fatal.

## 7. Next steps

- [Pair both headsets](quest-setup.md)
- [Learn the dashboard](user-guide.md)
- [Enable HTTPS for WebXR](network-https.md)
- [Optional Supabase setup](supabase.md)
