#!/bin/zsh
# vihara-dasd-watchdog.sh: runs on the Mac Mini every 2 minutes, as root (launchd).
#
# On macOS 26/27 the system's `dasd` service can deadlock. Replies keep landing in the Messages database, but
# BlueBubbles stops noticing them, so Vtext never gets them (BlueBubbles issue #890; seen on our macOS 27 test Mac).
# `killall dasd` un-sticks it at once (launchd restarts dasd by itself, so killing it is safe).
#
# Each run:
#   1. asks the local BlueBubbles for replies that arrived 3-15 minutes ago (one REST call, read-only);
#   2. asks our backend which of those it never received (POST .../missing, read-only);
#   3. if any are missing, or the backend's own catch-up recently found missed replies, runs `killall dasd`
#      (at most once every 10 minutes) and logs it. The backend then picks the replies up on its own.
# It never kills dasd when BlueBubbles or the backend cannot be reached: that is a network problem, not a stall.
#
# Settings: /usr/local/etc/vihara-dasd-watchdog.conf (root only, see vihara-dasd-watchdog.conf.example).
set -u

CONF="${VIHARA_WATCHDOG_CONF:-/usr/local/etc/vihara-dasd-watchdog.conf}"
STATE="${VIHARA_WATCHDOG_STATE:-/var/db/vihara-dasd-watchdog.last-restart}"
KILL_CMD="${VIHARA_WATCHDOG_KILL_CMD:-/usr/bin/killall dasd}" # tests swap this for an echo

log() { print -r -- "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

if [[ ! -r "$CONF" ]]; then log "ERROR settings file $CONF not found"; exit 0; fi
source "$CONF"
: "${BB_URL:=http://localhost:1234}" "${WINDOW_MIN:=15}" "${SETTLE_MIN:=3}" "${COOLDOWN_MIN:=10}"
if [[ -z "${BB_PASSWORD:-}" || -z "${BACKEND_MISSING_URL:-}" ]]; then log "ERROR BB_PASSWORD and BACKEND_MISSING_URL must be set in $CONF"; exit 0; fi
JQ="$(command -v jq || true)"
if [[ -z "$JQ" ]]; then log "ERROR jq not found (it ships with macOS 15 and newer at /usr/bin/jq)"; exit 0; fi

now=$(date +%s)
after_ms=$(( (now - WINDOW_MIN * 60) * 1000 ))
before_ms=$(( (now - SETTLE_MIN * 60) * 1000 ))

# The password goes to curl on stdin (-K -), so it never shows in the process list.
pw_enc=$("$JQ" -rn --arg p "$BB_PASSWORD" '$p|@uri')
bb_reply=$(printf 'url = "%s/api/v1/message/query?password=%s"\n' "$BB_URL" "$pw_enc" | /usr/bin/curl -sS -m 20 -K - \
  -X POST -H 'Content-Type: application/json' \
  -d "{\"after\":$after_ms,\"before\":$before_ms,\"limit\":200,\"sort\":\"ASC\"}" 2>&1) || { log "SKIP BlueBubbles did not answer: $bb_reply"; exit 0; }
guids=$(print -r -- "$bb_reply" | "$JQ" -c '[.data[]? | select(.isFromMe == false) | .guid]' 2>/dev/null) || { log "SKIP BlueBubbles answer was not JSON"; exit 0; }

backend_reply=$(/usr/bin/curl -sS -m 20 -f -X POST -H 'Content-Type: application/json' -d "{\"guids\":$guids}" "$BACKEND_MISSING_URL" 2>&1) \
  || { log "SKIP backend did not answer: $backend_reply"; exit 0; }
missing=$(print -r -- "$backend_reply" | "$JQ" -r '.missing | length' 2>/dev/null) || { log "SKIP backend answer was not JSON"; exit 0; }
found_at=$(print -r -- "$backend_reply" | "$JQ" -r '.missedRepliesFoundAt // empty')

last_restart=0
[[ -r "$STATE" ]] && last_restart=$(<"$STATE")
[[ "$last_restart" == <-> ]] || last_restart=0

# The backend's 10-minute catch-up found replies the webhook never brought: the same stall, noticed later.
caught_up_recently=0
if [[ -n "$found_at" ]]; then
  found_epoch=$(TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%S" "${found_at%%.*}" +%s 2>/dev/null || echo 0)
  if (( found_epoch > last_restart && now - found_epoch < 30 * 60 )); then caught_up_recently=1; fi
fi

if (( missing == 0 && caught_up_recently == 0 )); then exit 0; fi # all good: stay quiet, keep the log short

why="$missing reply(s) on the Mac never reached Vtext"
(( missing == 0 )) && why="the backend caught up missed replies at $found_at"
if (( now - last_restart < COOLDOWN_MIN * 60 )); then
  log "WAIT $why, but dasd was restarted $(( (now - last_restart) / 60 )) min ago"
  exit 0
fi

log "RESTART $why: running '$KILL_CMD'"
if eval "$KILL_CMD"; then
  print -r -- "$now" > "$STATE"
  log "RESTART done. Vtext will pick the replies up within 10 minutes."
else
  log "ERROR '$KILL_CMD' failed"
fi
