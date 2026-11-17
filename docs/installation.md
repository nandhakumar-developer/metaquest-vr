# Installation

## Prerequisites

- Windows 10 or 11 (the helper scripts are PowerShell).
- Node.js **24 or newer** and npm 10 or newer.
  Check with `node --version` and `npm --version`.
- A PC and the two Quest 2 headsets on the same Wi-Fi/LAN.
- Optional: FFmpeg and FFprobe on `PATH` for duration, codec, and thumbnail probing.
- A local TLS certificate is generated automatically on first run for immersive WebXR over HTTPS.

No paid account, cloud video host, or Android tooling is required.

## 1. Install dependencies

From the repository root:

```powershell
.\scripts\windows\install.ps1
```

Or manually:

```powershell
npm install
npm run dev
```

The script checks the Node version, installs workspaces, and the first `npm run dev` / `npm start`
creates `.env`, generates local TLS files, builds the shared packages, and builds the admin SPA
once so `https://localhost:5000/admin` works.

## 2. Configure `.env`

On a fresh clone, `.env` is created automatically at the repository root (it is ignored by Git)
with these defaults:

```dotenv
GATEWAY_HOST=0.0.0.0
GATEWAY_PORT=5000
PUBLIC_GATEWAY_URL=
ADMIN_ORIGIN=https://localhost:3000
EXTRA_ALLOWED_ORIGINS=
BOOTSTRAP_ADMIN_EMAIL=admin2026
BOOTSTRAP_ADMIN_PASSWORD=Ndurance@2026
BOOTSTRAP_ADMIN_NAME=VR Admin
```

Existing `.env` files are never overwritten. Edit the file to change the administrator, port,
or public URL. A blank `PUBLIC_GATEWAY_URL` auto-detects the current LAN address.

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

### Default administrator

The generated `.env` creates `admin2026` with password `Ndurance@2026` the first time the
gateway opens an empty database. Change those values before sharing the gateway with other
users. The workspace runs fully locally: there are no cloud credentials to configure, and the
dashboard only accepts accounts stored in the local SQLite database.

## 3. Change the administrator

A fresh clone already has the default administrator. To create a different account or reset
the password, use one of these commands.

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

`npm start` performs the first-run bootstrap, builds first if `apps/gateway/dist/index.js` is
missing, then runs the gateway in production mode. Open:

```text
https://localhost:5000/admin
```

Sign in with the administrator email and password (`admin2026` / `Ndurance@2026` for a fresh
clone). Accept the self-signed certificate warning once.

## 5. Allow the LAN through Windows Firewall

When Windows prompts, allow Node.js on the active network profile (Private or Public). If no
prompt appeared, add a rule as an administrator:

```powershell
New-NetFirewallRule -DisplayName "VR Control Center (TCP 5000)" `
  -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Profile Private,Public
```

Test from another device on the LAN:

```text
https://192.168.1.125:5000/api/health
```

## 6. Verify

```powershell
curl.exe -k https://localhost:5000/api/health
npm run typecheck
npm test
```

Expected health values include `"status":"ok"` and `"database":"ok"`. `ffmpeg.available`
will be `false` if FFmpeg is not installed; that is not fatal.

## 7. Next steps

- [Pair both headsets](quest-setup.md)
- [Learn the dashboard](user-guide.md)
- [Enable HTTPS for WebXR](network-https.md)
