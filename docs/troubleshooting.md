# Troubleshooting

## First checks

```powershell
curl http://localhost:4000/api/health
npm run typecheck
npm test
```

Look at the gateway terminal output. Startup prints the public URL, LAN addresses, data
directory, FFmpeg availability, and admin bootstrap state. Request errors are also logged
there.

## The dashboard will not load

**`EADDRINUSE` / port already in use**

Another process (or an older gateway) owns port 4000:

```powershell
Get-NetTCPConnection -LocalPort 4000 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
Get-Process -Id <OwningProcess>
```

Stop it, or change `GATEWAY_PORT` and update `PUBLIC_GATEWAY_URL`.

**Blank page after an update**

Rebuild the admin SPA:

```powershell
npm run build
```

The gateway serves `apps/admin/dist` only if it exists. In development, open
`http://localhost:3000`, not `:4000`, unless you built the SPA.

## I forgot the administrator password

Reset it from the repository root:

```powershell
.\scripts\windows\create-admin.ps1 -Email admin@vrcenter.local -Name "VRCC Administrator"
```

Enter a new password at the secure prompt. This updates the existing account and revokes its
active sessions. It also clears the one-time bootstrap token file.

## Sign-in fails

- Local account: email is case-insensitive? Use the exact address and password.
- Password rules apply only when creating/resetting: at least 12 characters, a letter and a
  number, and no leading/trailing spaces.
- Repeated failures lock the account temporarily. Wait or reset the password with
  `npm run admin:create`.
- If the page only shows local sign-in, Supabase role verification is not configured. See
  [supabase.md](supabase.md).

## Headset cannot open the player

1. Confirm the PC and headset are on the same network (not guest Wi-Fi / client isolation).
2. From the headset browser, try `http://<gateway-ip>:4000/api/health`.
3. Check `PUBLIC_GATEWAY_URL` in `.env` matches a reachable LAN IP.
4. Allow TCP 4000 through Windows Firewall on Private networks.
5. If using HTTPS, make sure the headset trusts the certificate; otherwise the browser may
   block the page before it loads.

The player header shows the gateway host. If it is a virtual adapter address, fix
`PUBLIC_GATEWAY_URL`.

## Pairing code does not appear or expires

- Codes are single-use and expire after 3 minutes by default (`PAIRING_TTL_SECONDS`).
- The player polls the gateway; if the gateway is unreachable it shows "Gateway unreachable.
  Retrying…". Fix connectivity, then start pairing again.
- If the code expired or was cancelled, tap **Start pairing** to generate a new one.
- Confirm the pending request in the dashboard with the matching 6 digits. A stale code
  from an earlier attempt will be rejected.
- Pair each headset separately; do not reuse the first code.

## Headset shows offline after pairing

- Keep the player tab open. Quest Browser may suspend background tabs aggressively; the
  device then appears offline until it resumes.
- The gateway marks a device offline after `OFFLINE_THRESHOLD_MS` (18 seconds by default)
  without a heartbeat.
- Reload the player. It reconnects with stored credentials.
- If the card says the device was unpaired, pair again.

## Player reconnects forever or shows "Not paired"

- Browser storage may be disabled or was cleared. Pair again.
- The device may have been unpaired/deleted from the dashboard. Pair again.
- Check the gateway protocol version matches the player build.
- Behind a proxy, make sure WebSocket upgrade headers are forwarded.

## Video will not load or play

| Symptom | Likely cause |
| --- | --- |
| "The browser does not support this video codec" | Unsupported codec/container. Use H.264 + AAC MP4. |
| "Network error while streaming" | Gateway stopped, firewall, or wrong public URL. |
| Stuck on "Preparing video…" | Range request blocked by a proxy, or the file is missing from `storage/videos`. |
| Video loads but no image in VR | Wrong projection metadata. Set 180° or 360° when uploading. |
| Audio is muted until tap | Browser autoplay policy; tap the screen to restore sound. |
| Stereo looks flat / doubled | Check the SBS/OU setting matches the file. |

Verify the file exists and has a matching size in the dashboard. Re-upload if the record and
file are out of sync.

## Group playback does not start

- Every selected headset must be online.
- All selected headsets must have the chosen video available in the shared library.
- The gateway waits for a confirmed `ready` event. If a player never reports ready, the run
  marks it as an error after 15 seconds and starts the ready headsets.
- If a player was already showing the same video, the fixed player emits a fresh `ready`
  event so the group does not time out.
- Long lead times help slow Wi-Fi; 4–5 seconds is typical.
- Check the run table for per-device errors such as "Headset disconnected during group
  playback" or "Video changed independently during group playback".
- Sync is best effort. Drift above 2.5 seconds triggers a corrective seek, at most once every
  10 seconds per headset.

## "Enter VR" fails

WebXR requires a secure context, so the player must be opened over `https://` (or
localhost, which is not applicable to a headset). Plain `http://<lan-ip>` always shows:

> Immersive VR needs HTTPS…

Fix it on the gateway PC:

1. Run `npm run https:setup` to create `certs/gateway.crt` and `certs/gateway.key`.
2. Set `TLS_CERT_PATH=./certs/gateway.crt` and `TLS_KEY_PATH=./certs/gateway.key` in `.env`.
3. Restart the gateway and open the new `https://<lan-ip>:4000/player/` URL on the headset.
4. Accept the certificate warning once, then tap **Enter VR**.

Pairing and offline downloads are stored per browser origin. After switching from HTTP to
HTTPS, pair the headset again and re-download any offline copies. See
[network-https.md](network-https.md) for trusted-certificate options if your Quest firmware
blocks WebXR on a self-signed certificate.

## Snapshot preview is blank

- The player tab must be open and visible; browsers throttle background tabs.
- The video must have loaded enough frames to draw.
- Over HTTP, preview still works; only WebXR is blocked.
- Head pose is only sent while a preview is active.

## Storage shows `--` for a headset

The browser player reports available quota for this site's local storage, not total headset
disk space. The browser may omit the estimate; in that case the dashboard shows `--`.

## Deployments stay pending

Browser-player downloads require the Quest player tab to be open and connected. Open **Downloads**
on the headset to watch progress. If the transfer reports a storage or checksum error, free space
by deleting an offline copy and send the video again.

## FFmpeg metadata is missing

`/api/health` reports `ffmpeg.available: false`. Install FFmpeg and ensure `ffprobe` and
`ffmpeg` are on `PATH` (or set `FFPROBE_PATH`/`FFMPEG_PATH`). Restart the gateway. Existing
uploads are not re-probed automatically; re-upload if you need metadata and thumbnails.

## Rate limiting

The global limit is 600 requests/minute per IP. The player pairing claim endpoint allows
1200 requests per 5 minutes, which is ample for 1.5-second polling. If you see HTTP 429,
wait for the retry window or check for a runaway client.

## Logs and reset

- Logs: `storage/logs` and the gateway terminal.
- SQLite: `storage/data/vrcc.sqlite`
- Media: `storage/videos`, thumbnails in `storage/thumbnails`
- Reset everything: stop the gateway, back up anything you need, then remove `storage/data`
  and re-run `npm run admin:create`. Removing media directories deletes uploaded videos.

## Harmless warnings

- `ExperimentalWarning: SQLite is an experimental feature` — `node:sqlite` in Node 24.
- `DEPRECATED test.poolOptions` — Vitest 4 migration warning from the test config.
- Fastify `maxParamLength` deprecation — upstream Fastify 5 warning.
- Rollup comments about `@__PURE__` in Zod — build-time warning only.
