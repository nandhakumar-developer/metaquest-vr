# Network and HTTPS

## LAN basics

The gateway listens on `0.0.0.0:4000` so headsets can reach it. The browser player uses the
same host for REST and WebSocket:

```text
http://<gateway-ip>:4000/player/
ws://<gateway-ip>:4000/ws?role=device
```

### Set the public URL explicitly

Set `PUBLIC_GATEWAY_URL` in `.env` to the PC's LAN address:

```dotenv
PUBLIC_GATEWAY_URL=http://192.168.1.125:4000
```

If it is blank, the gateway picks the first non-loopback IPv4 address. On systems with
VirtualBox, WSL, Hyper-V, or VPN adapters, that may be the wrong interface.

Find addresses:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Format-Table InterfaceAlias, IPAddress
```

Prefer the Wi-Fi/Ethernet address used by the headsets.

### Windows Firewall

Allow Node.js on **Private** networks, or add a rule:

```powershell
New-NetFirewallRule -DisplayName "VR Control Center (TCP 4000)" `
  -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private
```

If you serve over HTTPS, keep the same port or update `GATEWAY_PORT` and the firewall rule.

### Changing the IP

If DHCP gives the PC a new address:

1. Update `PUBLIC_GATEWAY_URL` (and any extra origin) in `.env`.
2. Restart the gateway.
3. Reload the player on each headset.

A DHCP reservation for the PC avoids this. Note that pairing survives an IP change because
the device identity is stored in the browser, not tied to the old URL.

## HTTP vs HTTPS

| Feature | HTTP | HTTPS |
| --- | --- | --- |
| Dashboard | Yes | Yes |
| Pairing and WebSocket control | Yes | Yes |
| Media streaming with Range | Yes | Yes |
| Flat 2D playback | Yes | Yes |
| Immersive WebXR (180/360/stereo) | No | Yes |
| Head pose / preview | Yes | Yes |

Meta Quest Browser only grants WebXR in a **secure context**. Localhost is treated as
secure; a plain LAN IP is not. Over HTTP the player shows `HTTP · flat only` and explains
when **Enter VR** fails.

## Quick local HTTPS (recommended for VR)

The repository includes a certificate generator that covers localhost, the PC hostname,
and every current LAN IPv4 address:

```powershell
npm run https:setup
```

The gateway detects these files automatically and enables HTTPS on the next start, so you do
not need to add `TLS_*` entries to `.env`. Restart the gateway and the startup banner should
show `https://…`; the player uses `wss://` automatically. `PUBLIC_GATEWAY_URL` can stay
blank because the gateway picks the physical Wi-Fi/Ethernet address and prefixes it with
`https://`.

On the headset:

1. Open the **HTTPS** player URL shown in the dashboard (for example
   `https://192.168.1.122:4000/player/`).
2. Accept the certificate warning once. This is the normal local-development warning.
3. Pair the headset again and tap **Enter VR**. Pairing and offline downloads are stored
   per browser origin, so they do not carry over from the old `http://` URL.

The generated certificate is self-signed. Meta Quest Browser normally lets you proceed
past the warning and then exposes WebXR. Some firmware versions still block immersive mode
on an untrusted certificate; if yours does, use one of the trusted-certificate options
below. Re-run `npm run https:setup` whenever the PC's LAN address changes.

### Option A: local CA trusted by the headset

1. Install [mkcert](https://github.com/FiloSottile/mkcert) on the PC.
2. Create a local CA and a certificate for the PC's LAN IP or hostname:

   ```powershell
   mkcert -install
   mkcert -cert-file certs/gateway.crt -key-file certs/gateway.key 192.168.1.125
   ```

3. Install the mkcert root CA (`mkcert -CAROOT`) on the headset if your Quest firmware
   exposes **Settings → Security → Install CA certificate**. Not all firmware versions do.
4. Set `TLS_CERT_PATH` and `TLS_KEY_PATH` as above and restart.

If the headset cannot install a CA, use Option B or accept HTTP flat playback.

### Option B: publicly trusted certificate

Use a real DNS name that resolves to the LAN address, obtain a certificate with a DNS-01
challenge (Let's Encrypt, ZeroSSL, etc.), and point `PUBLIC_GATEWAY_URL` at that hostname.
The certificate must match the hostname, and the headset must resolve it. A local DNS entry
or router DNS override can map the name to `192.168.1.125`.

### Option C: reverse proxy

You can terminate TLS in Caddy, nginx, or IIS and proxy to the gateway. Keep WebSocket
upgrade headers and long-lived Range requests intact. If the proxy is on another machine,
set `TRUST_PROXY=true` only when the proxy is trusted, and set `PUBLIC_GATEWAY_URL` to the
proxy's public HTTPS origin.

Example Caddyfile:

```text
vrcc.example.lan {
  reverse_proxy 192.168.1.125:4000
}
```

Caddy handles WebSocket upgrades and certificates automatically.

## CORS and origins

- Production: the admin SPA is served by the gateway, so requests are same-origin.
- Development: Vite runs on `:3000` and proxies `/api`, `/ws`, and `/player` to `:4000`.
- If you open the Vite dev server from another device, add its origin to
  `EXTRA_ALLOWED_ORIGINS`, for example `http://192.168.1.125:3000`.

Only allowed origins can call the API. This protects the local gateway from cross-site
requests by other pages on the LAN.

## Performance tips

- Prefer 5 GHz Wi-Fi or Ethernet for the PC.
- Keep video bitrate reasonable for Quest 2 (often 20–60 Mbps for 4K 360°).
- Use H.264/AAC MP4 for the broadest browser support.
- A 4–5 second group lead time is usually enough on a healthy LAN.
- Large files stream; they are not copied to the headset in browser mode.
