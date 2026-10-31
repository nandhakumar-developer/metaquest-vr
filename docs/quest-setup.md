# Meta Quest 2 setup (two headsets)

This is the exact sequence for two headsets. The player runs in **Meta Quest Browser**; no
APK, Developer Mode, or sideloading is needed.

## Before you start

- Gateway PC and both headsets on the same Wi-Fi/LAN.
- The gateway is running (`npm start`) and the dashboard is open on the PC.
- Headsets have enough battery or are charging.
- Disable "sleep" interruptions during the test; keep the browser tab in the foreground.
- Know the player URL. The dashboard shows it in **Headsets → Pair Headset**, for example:

```text
http://192.168.1.125:4000/player/
```

## Headset 1

1. Put on Quest 2 #1.
2. Open **Meta Quest Browser**.
3. Enter the player URL, or scan the QR code from the dashboard pairing dialog.
4. Confirm the page shows **VR Control Center** and the gateway address.
5. Tap **Start pairing**. A 6-digit code appears with a countdown.
6. On the PC, open **Headsets → Pair Headset**.
7. The pending headset appears automatically. Press **Select PIN**, or type the 6 digits.
8. Enter a name such as `Quest 2 — Booth A`.
9. Press **Pair Headset**.
10. The headset shows "Headset paired successfully" and connects. The dashboard card turns
    online within a few seconds.

## Headset 2

1. Keep Headset 1 connected and return it to the player screen.
2. On Quest 2 #2, open the **same player URL** in Meta Quest Browser.
3. Tap **Start pairing** to generate a **new** 6-digit code.
4. On the PC, pair it with a different name, for example `Quest 2 — Booth B`.

Do not reuse the first code. Each code is single-use and bound to one device secret. Both
headsets now have independent identities, playback state, and command channels.

## Verify both are online

The Headsets page should show two cards with green status and the **Browser** badge. If a
card shows offline:

1. Check the player tab is still open and the headset is awake.
2. Check the gateway address in the player header.
3. Reload the player page; it reconnects with its stored credentials.
4. Check Windows Firewall for TCP 4000.

## Independent playback test

1. On Headset 1's card, choose a video and press play.
2. Confirm only Headset 1 plays.
3. Pause Headset 1. Confirm Headset 2 is unaffected.
4. Load a different video on Headset 2 and play it. Both cards should report different
   videos and positions.

## Group playback test

1. Open **Group Playback**.
2. Select both online headsets.
3. Choose **Same video** and a short clip.
4. Choose a 4-second lead time.
5. Press **Load and schedule group start**.
6. Watch both headsets load, show **Scheduled**, then start together.
7. Check the run table's drift and sync health after a few heartbeats.

Expect small differences. Sync is network-coordinated and not frame-perfect.

## Immersive / WebXR

- Open the player over **HTTPS** (or localhost) for WebXR.
- Load a 180° or 360° video.
- Press **Enter VR** in the player.
- Approve the immersive session if the browser asks.
- Exit through the Quest browser menu or the player's **Exit VR** button.

Over plain HTTP the **Enter VR** button will fail with an explanation; flat 2D playback and
all remote controls still work.

## Reconnect and identity

The headset identity (device UUID + 64-hex secret) is stored in the browser's
`localStorage`. After a reload, browser restart, or gateway restart:

- The player reconnects automatically.
- The dashboard recognizes the same device.
- No new pairing code is needed.

If the headset was unpaired, deleted, or browser storage was cleared, pair it again.

## Physical hardware checklist

This workspace was verified with automated tests and the native-protocol simulator, not with
physical Quest 2 units. On real hardware, confirm:

- [ ] Both headsets reach `/player/` over the LAN.
- [ ] Both complete pairing with separate codes.
- [ ] Both stay online through a 5-minute idle period.
- [ ] Independent load/play/pause/seek works on each headset.
- [ ] A 360° H.264/AAC MP4 plays in flat mode.
- [ ] WebXR enters and exits cleanly over HTTPS.
- [ ] Group Play starts both headsets within the expected drift band.
- [ ] Reloading a player restores the same device card.
- [ ] Unpairing one headset does not affect the other.

## Troubleshooting

See [troubleshooting.md](troubleshooting.md). The most common causes are the wrong
`PUBLIC_GATEWAY_URL`, a firewall block, an expired pairing code, or an unsupported codec.
