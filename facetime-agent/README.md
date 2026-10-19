# FaceTime agent (FaceTime test)

Maya can call some leads over FaceTime audio instead of a normal phone call. This is a test only; Vapi phone calls stay the main way we call.

How it works: the backend puts a call job in a queue for a Mac. The agent on that Mac picks it up, dials over FaceTime, and reports each step. When the person answers, the backend opens a Vapi websocket call, and the agent connects the FaceTime audio to it. It is the same Maya, with the same prompt and memory as a phone call. If the Mac can't get the call ringing, the backend sends a normal phone call instead.

The agent runs on the Mac (or, for the mock, any computer), never on Render.

**Where things stand (Oct 17, 2026)**

- **Backend and the Vapi side are tested for real.** A test call through the mock agent on Windows queued, rang and was answered. Maya spoke, heard the caller, and ended the call, and the call log was saved. The phone fallback also worked.
- **First Mac run (Oct 19, macOS 15.3):** FaceTime dialed fine, but the agent could not read the call. On this macOS the call screen is a Notification Center banner (not the FaceTime window), and once the person picks up its text can't be read at all. The agent now reads all three call processes, and treats "FaceTime's Video → Mute menu item is enabled but the ringing screen is gone" as picked up.
- **The Mac-only parts had never run on a Mac before that run.** That means driving the FaceTime app (AppleScript), detecting that a call is ringing or answered, and the BlackHole audio. Their logic is tested on Windows with a fake FaceTime. If something breaks on the first Mac run, it will most likely be one of these, and the steps below are built to find out which one.

---

## Mac test: step by step

Follow the steps in order. Each step says what you should see. If you see something else, check **Troubleshooting** at the end before going on.

You need:
- A Mac that you can use for about an hour. While the agent runs, the Mac's own speaker and mic are switched off.
- An iPhone signed in to a **different** Apple ID than the Mac. Otherwise the Mac is calling itself.
- The backend `.env` file (ask Asad), and access to the backend repo.

### 1. Install the tools

Open the **Terminal** app (Applications → Utilities → Terminal). Use Terminal itself, not iTerm or the VS Code terminal, because the permissions in step 4 are given to the app you run the agent from.

If `brew -v` says "command not found", install Homebrew first and follow the two "Next steps" lines it prints at the end:

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then:

```
brew install node sox switchaudio-osx
brew install --cask blackhole-2ch blackhole-16ch
```

The BlackHole installs ask for your Mac password. **Restart the Mac** afterwards; BlackHole only appears after a restart.

Check:

```
node -v                          # v20 or higher
sox --version                    # SoX v14...
SwitchAudioSource -a -t output   # the list includes "BlackHole 16ch"
SwitchAudioSource -a -t input    # the list includes "BlackHole 2ch"
```

### 2. Get the code

```
cd ~/path/to/viharabackend       # your clone of the backend repo
git checkout main && git pull
npm install                      # backend packages, needed by the test script
cd facetime-agent && npm install # agent packages (ws, dotenv)
cd ..
```

Put the backend `.env` in the repo root (`viharabackend/.env`). The test script needs `DB_URI`, `VAPI_API_KEY`, `VAPI_ASSISTANT_ID` and the `VAPI_PHONE_NUMBER_ID(S)` from it.

> ⚠️ **Do not run `npm start` or `npm run dev` in the backend folder.** That starts the whole backend, including the call schedulers, which would phone real leads from your Mac. The test script in step 6 runs only the FaceTime parts.

### 3. Check FaceTime works by hand

1. Open the FaceTime app and sign in (FaceTime → Settings) if it asks.
2. Call the iPhone by hand: type its number, then choose the **audio** call (the phone icon), not video. The iPhone should ring with a FaceTime Audio call.
3. Hang up.

If this doesn't work by hand, the agent can't do it either. Fix FaceTime first.

### 4. Give Terminal its permissions

System Settings → **Privacy & Security**:

1. **Accessibility** → click **+** → Applications → Utilities → **Terminal** → turn it on.
2. **Quit Terminal completely (⌘Q) and open it again.** macOS only applies the permission after a restart of the app.

Two more permissions are asked for by popups the first time they are needed:
- "Terminal wants to control System Events / FaceTime": click **OK** (this is **Automation**)
- "Terminal would like to access the microphone": click **Allow**

If you clicked "Don't Allow" by mistake, turn it on under Privacy & Security → **Automation** or **Microphone**.

Keep the Mac awake for the whole test. In a spare Terminal tab, run this and leave it running:

```
caffeinate -dims
```

### 5. Calibrate: does the agent read FaceTime's screen right?

This step makes **no** calls through the backend. You place calls by hand while the agent watches.

Open the **FaceTime app** first and leave it on its normal screen. Then, in Terminal, from `facetime-agent/`:

```
npm run inspect -- --all
```

It prints `Watching FaceTime...`. Then, one at a time, each time waiting until FaceTime is back to normal:

1. **The Call prompt.** In a second Terminal tab, run `open facetime-audio://+1XXXXXXXXXX` (the iPhone's number). A prompt with a **Call** button should appear. Click **Call** yourself, then hang up on the Mac before the iPhone answers.
2. **Answered call.** Call the iPhone from FaceTime (audio), answer on the iPhone, talk for about 10 seconds, then **hang up on the iPhone**.
3. **Declined call.** Call again and press **decline** on the iPhone.
4. **Unanswered call.** Call again, don't touch the iPhone, and wait about 45 seconds, then hang up on the Mac.

Watch the `agent would read:` lines. For the answered call they should go roughly:

```
IDLE → RINGING → CONNECTED → IDLE
```

The declined call should show `DECLINED` or end back at `IDLE`. The unanswered call should stay `RINGING` until you hang up.

Press Ctrl+C to stop. Everything was also saved to `facetime-agent/inspect-log.txt`.

- **If all readings look right:** go on to step 6.
- **If any reading is wrong** (for example, it never says CONNECTED after you answered): stop here and send `inspect-log.txt` to Asad. We will make a `signals.json` from it that matches this Mac's macOS version and language. It's a small text file, and no code changes are needed. Then come back to this step.

### 6. Start the test server (Terminal tab 1)

From the backend root (`viharabackend/`), with the iPhone's number in international format:

```
node src/scripts/facetimeTestCall.js +1XXXXXXXXXX "Your Name"
```

You should see:

```
✅ FaceTime test is ON for 1XXXXXXXXXX on "vtext adarsh macbook".
   Agent API: http://localhost:8010
   ...
   BACKEND_URL=http://localhost:8010
   FACETIME_AGENT_KEY=ftk_...
Waiting for the agent to check in…
```

Leave it running.

> Don't press Enter in this tab until step 8. If you send a call with no agent running, the backend will (correctly) phone the iPhone with a normal phone call after about 60 seconds instead.

### 7. Start the agent (Terminal tab 2)

1. In `facetime-agent/`, create a file named `.env` (the name starts with a dot) containing the two lines tab 1 printed:
   ```
   BACKEND_URL=http://localhost:8010
   FACETIME_AGENT_KEY=ftk_...
   ```
   The key is new every time the test script starts. If you restart tab 1, update the key here.
2. Check the setup:
   ```
   npm run check
   ```
   Every line should be ✅. Fix any ❌ before going on (the line says how). Tab 1 may now say "Agent is connected"; that's expected.
3. Start the agent:
   ```
   npm start
   ```
   You should see:
   ```
   Audio: Mac mic → "BlackHole 2ch", Mac speaker → "BlackHole 16ch" ...
   Signed in as "vtext adarsh macbook". FaceTime is ON.
   ```
   From now on, the Mac's speaker is silent. That's expected.

### 8. Test calls

In **tab 1**, press **Enter** to send a call. Do these four, one at a time. After each one, wait for tab 1 to print the result and show `Press Enter to send a test call` again, then wait 10 more seconds before sending the next.

| # | On the iPhone | Tab 2 (agent) should show | Tab 1 should end with |
|---|---|---|---|
| 1 | Answer, talk to Maya, then **hang up on the iPhone** | 🔔 Ringing → ✅ Answered → 🎙️ Maya is on the call → transcript lines → 📴 Call over: the person hung up | `ended` and ✅ Call log saved |
| 2 | Answer, then tell Maya "please end the call" | ... → 📴 Call over (Maya ended it) | `ended` and ✅ Call log saved |
| 3 | **Decline** | 🙈 declined (or no-answer) | `declined` or `no-answer` |
| 4 | Don't touch it | 🙈 no-answer after about 45 seconds | `no-answer` |

On call 1 you should hear Maya on the iPhone within a couple of seconds of answering. She also hears you: her replies show up in tab 2 as `user:` and `assistant:` lines.

### 9. Finish

1. Tab 2: **Ctrl+C**. You should see "putting the Mac's own mic/speaker back".
2. Tab 1: **Ctrl+C**. You should see "FaceTime test switched off again".
3. Check that the Mac's sound works again (System Settings → Sound). If it doesn't, see Troubleshooting.
4. Stop `caffeinate` with Ctrl+C.

### 10. Send back

- The output of tab 1 and tab 2 (copy and paste is fine)
- `facetime-agent/inspect-log.txt`
- The macOS version (Apple menu → About This Mac) and the Mac's language
- For each of the 4 calls: did it work, and what did you hear on the iPhone?

---

## Troubleshooting

**`Could not connect to any servers in your MongoDB Atlas cluster`** (tab 1)
The database doesn't allow your Mac's internet address. In MongoDB Atlas → Network Access → Add IP Address → "Add Current IP Address". Or ask Asad to add it. Then start tab 1 again.

**`No Accessibility permission`** or **`No Automation permission`**
Redo step 4. After turning Accessibility on, **quit and reopen Terminal**. If Terminal is already in the list but it still fails, remove it with **−**, add it again with **+**, and reopen Terminal.

**`Audio device "BlackHole 2ch" not found`** (or 16ch)
BlackHole isn't installed, or the Mac hasn't restarted since. Run `brew install --cask blackhole-2ch blackhole-16ch`, then restart.

**`No Call prompt found to press`**
FaceTime's prompt looks different on this macOS version. Run `npm run inspect -- --all`, then in another tab `open facetime-audio://+1XXXXXXXXXX`, and send `inspect-log.txt`. The backend has already sent a normal phone call instead, so nothing is lost.

**`Pressed Call, but FaceTime never started ringing`**
The agent clicked something, but didn't recognise the ringing screen. Send `inspect-log.txt` from step 5.

**The iPhone answered, but the agent kept "Ringing" and then said no-answer**
The agent didn't recognise the "connected" screen: no End button or call timer was found. Send `inspect-log.txt` from step 5, call 2.

**The iPhone answered, but the agent said no-answer, or never connected Maya (macOS 15)**
The agent decides "answered" when a call is live (FaceTime's **Video → Mute** menu item is enabled) and the ringing screen is gone, twice in a row. The menu names are English; on another language that check always says "no call". Run `npm run inspect -- --all` during a call and send `inspect-log.txt`.

**Maya connects, but the iPhone hears nothing, or Maya hears nothing**
- While the agent runs, System Settings → Sound should show **Output: BlackHole 16ch** and **Input: BlackHole 2ch**.
- If FaceTime has its own microphone or speaker choice in its menu bar during a call, set the microphone to **BlackHole 2ch** and the output to **BlackHole 16ch**.
- Note what happened and send the tab 2 output.

**Maya talks to herself, or there's an echo**
The two BlackHole devices are swapped somewhere: check the Sound settings above. BlackHole 2ch must be the *input* (mic) and BlackHole 16ch the *output* (speaker).

**The Mac has no sound after the test** (the agent crashed or was force-closed)
System Settings → Sound → choose your normal Output (for example "MacBook Pro Speakers") and Input (for example "MacBook Pro Microphone"). Or in Terminal:

```
SwitchAudioSource -a                                     # see the names
SwitchAudioSource -t output -s "MacBook Pro Speakers"
SwitchAudioSource -t input  -s "MacBook Pro Microphone"
```

**Tab 1 says `It went out as a NORMAL phone call`**
The agent wasn't checked in (not running, or the wrong key in `.env`). Start or fix tab 2 and send again.

**`heartbeat failed: backend answered 500`** or `database hiccup` lines
The database connection dropped for a moment. These usually go away by themselves. If they keep coming, restart tab 1 (and put the new key in `.env`).

**FaceTime says Unavailable straight away**
The number isn't on FaceTime: an Android phone, or a number not registered with iMessage/FaceTime. Use an iPhone number.

---

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

## Using it with the deployed backend (later)

Once the Mac test passes, the agent can talk to the live backend instead of the test script:

1. On Render, set `FACETIME_ENABLED=true` on the backend.
2. Admin panel → **FaceTime Test**:
   - Macs → **Get agent key**. Put it in `facetime-agent/.env`, together with `BACKEND_URL=https://<backend address>`.
   - Turn FaceTime **on** for the Mac.
   - Add the test numbers, and switch the test **on**.
3. Run `npm start` on the Mac. Calls to the test numbers then go over FaceTime, and everyone else gets normal phone calls.

To start the agent at login and restart it if it stops, use launchd:

```
mkdir -p logs
# edit YOUR_USER and the paths inside the file first.
# On an Intel Mac, node is /usr/local/bin/node, not /opt/homebrew/bin/node (check with: which node).
cp launchd/com.vihara.facetime-agent.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.vihara.facetime-agent.plist
```

Logs go to `logs/agent.log`. When launchd starts the agent, Accessibility has to be given to the `node` binary itself (the path from `which node`).

## Mock agent (no Mac needed)

`npm run mock` does everything except FaceTime: it checks in, picks up jobs, and connects your computer's mic and speaker to Maya when you press `a` (answer). The other keys are `n` (no answer), `d` (decline) and `f` (fail before ringing, so a phone call goes out instead). Answer within about 30 seconds, or the backend counts it as never rang and sends a phone call.

- SoX is needed for mic and speaker. Without it, the mock runs silent and shows only Maya's events.
- `MOCK_AUDIO=silent` forces silent mode.
- `MOCK_AUTO=answer` (or `no-answer`, `declined`, `fail`) answers without asking.
- `MOCK_INPUT_DEVICE` and `MOCK_OUTPUT_DEVICE` pick the audio devices by name.

## Backend pieces

- `src/services/calling/facetime/` (backend repo): the router (whether a call goes over FaceTime, and on which Mac), the call service (job life cycle, Vapi websocket call, phone fallback), the sweep (timeouts and offline Macs), and iPhone learning (from iMessage "Delivered" / error 22).
- `src/routes/calling/facetimeRoutes.js`: `/api/v1/facetime/agent/*` for this agent, `/api/v1/facetime/admin/*` for the admin panel.
- `src/scripts/facetimeTestCall.js`: test calls without starting the call schedulers (used in the Mac test above).
- On the backend, nothing happens unless `FACETIME_ENABLED=true` is set and the admin switch is on.
