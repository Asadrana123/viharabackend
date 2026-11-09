# dasd watchdog (Mac Mini)

On macOS 26/27 the system service `dasd` can freeze. Replies still land in the Messages database, but BlueBubbles stops
noticing them, so Vtext never gets them (BlueBubbles issue #890; we saw it on our macOS 27 test Mac on 2026-11-03).
`sudo killall dasd` fixes it at once; macOS restarts dasd by itself.

This watchdog runs every 2 minutes as root:

1. asks BlueBubbles on this Mac for replies that arrived 3–15 minutes ago;
2. asks our backend which of them it never got (`POST /api/webhooks/vtext/imessage-bluebubbles/<line key>/missing`);
3. if any are missing, or the backend's own catch-up just found missed replies, runs `killall dasd`
   (at most once every 10 minutes) and writes a line to `/var/log/vihara-dasd-watchdog.log`.

It does nothing when BlueBubbles or the backend can't be reached, and writes nothing to the log while all is well.
The backend fills in the missed replies itself (its 10-minute catch-up) and posts "⚠️ Missed N replies" to Slack.

Needs the backend with the `/missing` check deployed first. Before that the check answers 404 and the watchdog only logs
"SKIP backend did not answer".

## Install (on the Mac Mini, in Terminal, as the admin user)

1. Check jq is there: `/usr/bin/jq --version` (it ships with macOS 15 and newer).
2. Copy the files to the Mac (for example in `~/Downloads/dasd-watchdog`), then:
   ```
   cd ~/Downloads/dasd-watchdog
   sudo install -m 755 -o root -g wheel vihara-dasd-watchdog.sh /usr/local/bin/
   sudo mkdir -p /usr/local/etc
   sudo install -m 600 -o root -g wheel vihara-dasd-watchdog.conf.example /usr/local/etc/vihara-dasd-watchdog.conf
   sudo install -m 644 -o root -g wheel com.vihara.dasd-watchdog.plist /Library/LaunchDaemons/
   ```
3. Fill in the settings: `sudo nano /usr/local/etc/vihara-dasd-watchdog.conf`
   - `BB_PASSWORD`: BlueBubbles → Settings → Server Password.
   - `BACKEND_MISSING_URL`: the webhook URL listed in BlueBubbles → API & Webhooks, with `/missing` added at the end.
   - If BlueBubbles doesn't use port 1234, set `BB_URL`.
4. Run it once by hand: `sudo /bin/zsh /usr/local/bin/vihara-dasd-watchdog.sh`
   No output means all good. A `SKIP` or `ERROR` line says what to fix.
5. Start it: `sudo launchctl bootstrap system /Library/LaunchDaemons/com.vihara.dasd-watchdog.plist`
6. Check it is loaded: `sudo launchctl print system/com.vihara.dasd-watchdog | grep -E "state|runs"`

It starts by itself after a reboot (it's a system LaunchDaemon, so it doesn't need anyone logged in).

## Everyday

- See what it did: `tail -n 20 /var/log/vihara-dasd-watchdog.log`
- Stop it: `sudo launchctl bootout system/com.vihara.dasd-watchdog`
- More lines on this Mac later (the 4-user test): each BlueBubbles needs its own settings file and its own copy of
  the plist (a different Label, and `VIHARA_WATCHDOG_CONF` / `VIHARA_WATCHDOG_STATE` set in EnvironmentVariables).
