# User guide

## Sign in

Open the dashboard at `http://<gateway-ip>:4000` on the PC.

- **Local admin** is the default. Use the account created with `npm run admin:create`.
- **Supabase** only appears when the gateway can verify roles (see [supabase.md](supabase.md)).

The session uses an HttpOnly cookie. Mutating requests also send a CSRF token. Sessions
expire after `ADMIN_SESSION_TTL_HOURS` (12 hours by default).

## Headsets

The Headsets page shows one card per paired device.

- The status dot is green when the device has a live WebSocket. Amber means it is buffering.
- **Browser** badge means the headset is running the built-in browser player.
- Battery is shown when the browser exposes the Battery Status API.
- **Free** storage shows `--` for browser players because the browser cannot report the
  headset's real free disk.
- **Reload Player** sends a real reload command to the headset tab.
- **Unpair** revokes credentials and disconnects the device.
- **Delete Record** removes the device and its history.

### Independent playback

Use a single card to:

1. Choose a video from **Load video onto headset…**.
2. Press play, pause, stop, seek ±10 seconds, or drag the timeline.
3. Change volume with the slider or mute button.
4. Open **Live View** for a snapshot preview (the player tab must be open and visible).

Commands are addressed to that device UUID only. A device-specific command is never
broadcast to the fleet.

**Pause All** and **Stop All** are explicit fleet controls in the toolbar. Stop All asks for
confirmation. Instant "Play All" is intentionally absent; use Group Playback instead.

## Video Library

Upload MP4, M4V, MOV, MKV, or WebM files. The source stays in `storage/videos` on the PC;
headset downloads are stored in the Quest browser's local site storage.

- **Send to Headsets** downloads a verified offline copy to the connected Quest browser player.
  The headset opens **Downloads** and shows progress; use **Play offline** when the transfer
  finishes. Keep the player tab open during the transfer.
- **Group Play** opens Group Playback with that video preselected.
- Native Quest clients can also receive downloads and verify their checksums.
- **Preview** plays the file in the admin browser.
- H.264 video + AAC audio in MP4 is the safest combination for Meta Quest Browser.
- If FFmpeg is missing, duration/codec metadata and thumbnails may be unavailable and the
  video is marked **Unverified**. It can still stream.

## Group Playback

1. Select the headsets (online devices only).
2. Choose **Same video** or **Per headset**.
3. Choose a lead time. 4–5 seconds is a good starting point on Wi-Fi.
4. Press **Load and schedule group start**.

The gateway loads each video, waits for a confirmed `ready`, then sends a single future
start timestamp to every ready headset. Each player converts that timestamp with its
measured clock offset. During playback the gateway compares confirmed positions with the
expected timeline and may issue a corrective seek when drift exceeds 2.5 seconds (with a
10-second cooldown).

The run table shows phase, position, drift, and sync health:

- **good**: within ±250 ms
- **fair**: within ±1 s
- **poor**: beyond ±1 s

This is best-effort LAN synchronization, **not frame-perfect genlock**. Browser scheduling,
decoder startup, and Wi-Fi jitter all affect the result.

## Playback History

Shows sessions opened when playback starts, with final status and last position. Sessions
close on stop, end, error, or disconnect.

## Audit Log

Records administrative actions such as pairing, unpairing, deployments, group starts, and
settings changes.

## Settings

- **Stale after** controls when a device is considered stale.
- **Seek step** changes the UI seek increment.
- **Preview max FPS** controls snapshot preview cadence.
- **Default volume** applies to new sessions.
- **Confirm destructive actions** toggles confirmation prompts.
- **Administrator password** changes the local account password.

## Pairing multiple headsets

Each headset must be paired separately, even though they open the same player URL. The
pairing code is single-use and expires after `PAIRING_TTL_SECONDS` (3 minutes by default).
See [quest-setup.md](quest-setup.md) for the exact two-headset sequence.

## Player controls

In Meta Quest Browser:

- Tap the screen to show controls.
- **Library** lists every uploaded video.
- **Enter VR** requests an immersive WebXR session for 180°/360°/stereo content.
- **Fullscreen** uses the browser fullscreen API.
- Keyboard shortcuts on desktop: Space play/pause, arrows seek, `F` fullscreen, `L` library.
- If autoplay blocks audio, playback continues muted and a tap restores sound.

The player keeps retrying the WebSocket after a network drop. Reloading the page restores
the paired identity from `localStorage`.
