# FaceTime agent (FaceTime test)

Maya can call some leads over FaceTime audio instead of a normal phone call. This is a test only; Vapi phone calls stay the main way we call.

How it works: the backend puts a call job in a queue for a Mac. The agent on that Mac picks it up, dials over FaceTime, and reports each step. When the person answers, the backend opens a Vapi websocket call, and the agent connects the FaceTime audio to it. It is the same Maya, with the same prompt and memory as a phone call. If the Mac can't get the call ringing, the backend sends a normal phone call instead.

The agent runs on the Mac (or, for the mock, any computer), never on Render. It is the same Mac that vText's BlueBubbles uses; FaceTime and Messages are separate apps and don't get in each other's way.

## What's here

| Command | What it does |
|---|---|
| `npm start` | The real Mac agent (`src/macAgent.js`) |
| `npm run check` | Checks the Mac's setup and says what's missing |
| `npm run inspect` | Shows, live, what FaceTime's screen says and what the agent reads from it (for tuning `signals.json`) |
| `npm run mock` | Mock agent for any computer: you play the person being called |

The call flow (`src/callFlow.js`) is shared logic, tested on its own. The Mac-only parts are in `src/mac/`.

## How the Mac agent drives FaceTime

Apple has no API for FaceTime, so the agent works the app the way a person would:

1. Opens a `facetime-audio://+1…` link and presses **Call** on the prompt.
2. Reads FaceTime's screen through macOS accessibility, once a second:
   - an **End** button means a call is in progress
   - an End button plus a running **timer** (`0:07`) means the person picked up
   - "Declined", "Unavailable" and similar words mean it's over
   - Words already on screen before dialing (the Recents list) are ignored.
3. Moves the audio with two BlackHole virtual cables. While the agent runs, the Mac's default mic is `BlackHole 2ch` and its default speaker is `BlackHole 16ch`; both are put back when the agent stops.
   ```
   Maya ──► BlackHole 2ch  ──► FaceTime mic     ──► the person
   person ─► FaceTime speaker ─► BlackHole 16ch ──► Maya
   ```
4. Hangs up by pressing End, and quits FaceTime to be sure.

The words FaceTime shows differ between macOS versions and languages. Defaults are in `src/mac/signals.js`. To change any of them, copy `signals.example.json` to `signals.json` and edit it; no code change is needed.

## Mac setup (one time)

1. Install the tools:
   ```
   brew install node sox switchaudio-osx blackhole-2ch blackhole-16ch
   ```
   Restart the Mac after installing BlackHole.
2. Get the code onto the Mac (clone the backend repo), then:
   ```
   cd viharabackend/facetime-agent && npm install
   ```
3. Create `facetime-agent/.env`:
   ```
   BACKEND_URL=https://<backend address>
   FACETIME_AGENT_KEY=ftk_...
   ```
   Get the key from the admin panel: **FaceTime Test → Macs → Get agent key**. It is shown once.
4. Give permissions in **System Settings → Privacy & Security**, to the app that runs the agent (Terminal; or `node`, when started by launchd):
   - **Accessibility** (to read and press FaceTime's buttons)
   - **Automation** (to control System Events and FaceTime; macOS asks on first run)
   - **Microphone** (for SoX)
5. In FaceTime → Settings, make sure the Apple ID is signed in. For branding, give it the Vihara name and photo.
6. Keep the Mac awake: System Settings → Energy, never sleep.
7. Run `npm run check` until everything is ✅.

## Tune it before real calls (`npm run inspect`)

Run `npm run inspect -- --all` and, from this Mac, place FaceTime audio calls by hand to a team iPhone:

- one that is answered, then hung up from the iPhone
- one that is declined on the iPhone
- one that nobody answers

Watch the "agent would read:" line at each step. It should go IDLE → RINGING → CONNECTED → IDLE for the answered call. If any step reads wrong, the printout (also saved in `inspect-log.txt`) shows the words FaceTime used. Put them in `signals.json`.

## First real calls

1. Admin panel → FaceTime Test: turn FaceTime on for this Mac, put a team iPhone's number in the test list, and switch the test on.
2. On the Mac: `npm start`.
3. Send a call to that number, for example with the admin "call one person" form. The iPhone rings with a FaceTime audio call. Answer it, and Maya talks.
4. Check that the admin page shows the call as finished, and that the call log shows it as a FaceTime call.

The iPhone must not use the same Apple ID as the Mac.

**Shared Mac:** while the agent runs, the Mac's own speaker and mic are switched to BlackHole, so the person using the Mac hears nothing. For tests on a team member's Mac, start it with `npm start` only during the test, and stop it with Ctrl+C. That puts their speaker and mic back.

## Run it all the time (later)

Once it works, launchd can start the agent at login and restart it if it stops:

```
mkdir -p logs
# edit the paths and YOUR_USER inside the file first
cp launchd/com.vihara.facetime-agent.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.vihara.facetime-agent.plist
```

Logs go to `logs/agent.log`. When launchd starts it, the Accessibility permission has to be given to `/opt/homebrew/bin/node` itself.

## Mock agent (no Mac needed)

`npm run mock` does everything except FaceTime: it checks in, picks up jobs, and connects your computer's mic and speaker to Maya when you press `a` (answer). The other keys are `n` (no answer), `d` (decline) and `f` (fail before ringing, so a phone call goes out instead).

- SoX is needed for mic and speaker. Without it, the mock runs silent and shows only Maya's events.
- `MOCK_AUDIO=silent` forces silent mode.
- `MOCK_AUTO=answer` (or `no-answer`, `declined`, `fail`) answers without asking.
- `MOCK_INPUT_DEVICE` and `MOCK_OUTPUT_DEVICE` (Core Audio device names, Mac only) pick the audio devices.

## Backend pieces

- `src/services/calling/facetime/` (backend repo): the router (whether a call goes over FaceTime, and on which Mac), the call service (job life cycle, Vapi websocket call, phone fallback), the sweep (timeouts and offline Macs), and iPhone learning (from iMessage "Delivered" / error 22).
- `src/routes/calling/facetimeRoutes.js`: `/api/v1/facetime/agent/*` for this agent, `/api/v1/facetime/admin/*` for the admin panel.
- On the backend, nothing happens unless `FACETIME_ENABLED=true` is set and the admin switch is on.
