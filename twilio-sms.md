# Twilio SMS fallback for Vtext

Branch: `twilio-integration-text` (backend and `vihara-next`). Status: built and tested against a fake Twilio client;
**not yet run against a real Twilio account**. Section 6 lists what only the real account can confirm.

## 1. What it does

Vtext sends texts by iMessage (BlueBubbles on a Mac). iMessage only reaches iPhones, so a text to an Android number never
gets a receipt. When an iMessage cannot be delivered, this sends the **same words once by SMS** through a Twilio
Messaging Service that carries our approved 10DLC campaign.

- It is a **fallback only**. The `twilio-sms` channel is marked `fallbackOnly`, so default routing never uses it. A text goes
  out through Twilio only when the fallback asks for it by name, or when a person types a reply on an SMS thread.
- It is **off** until `VTEXT_SMS_FALLBACK_ENABLED=true`.
- The rule behind every choice: **never text a person twice.**

## 2. When an SMS is sent

| What happened to the iMessage | Result |
|---|---|
| BlueBubbles could not send it (HTTP 500 "Message Send Error") | SMS right away |
| A receipt says not delivered with error code in `VTEXT_SMS_FALLBACK_IMESSAGE_CODES` (default `22`) | SMS right away |
| No receipt after 10 minutes (status `unknown`, code `no-receipt`) | Depends on `VTEXT_SMS_FALLBACK_NO_RECEIPT_MODE`: `verify` (default) sends nothing and a person clicks **Send by SMS**; `auto` sends unless the number is a known iPhone; `off` does nothing |
| Other BlueBubbles errors | No SMS |
| Never sent (`stuck-assigned`) | No SMS |

A missing receipt does not prove failure: the iMessage may have arrived while the receipt was lost. That is why `verify` is
the default. Suggested rollout: run `verify` for about a week, then decide on `auto`.

## 3. How double texting is prevented

- The fallback is always a **new message** linked to the original (`fallbackOf` / `fallback.messageId`). Its key is
  `<original key or id>-sms`.
- The original is **claimed atomically** (`fallback.status` from unset to `pending`), so two triggers make one fallback.
- A late "delivered" receipt for the iMessage **cancels** a fallback that has not gone out. If the SMS already went out, it is
  flagged `fallback.duplicate` and a Slack alert is sent.
- A Twilio send that might have reached Twilio (timeout, 5xx) is never retried: Twilio has no idempotency key. It fails with
  code `UNCERTAIN` and shows in the failed-sends digest.
- Checked before the SMS is queued, and again just before it is sent: fallback switched on, consent switch, opt-out, US
  `+1` numbers only, original is not a system reply, original is under `VTEXT_SMS_FALLBACK_MAX_AGE_HOURS`, iMessage not
  delivered, the person has not replied since, hourly cap `VTEXT_SMS_FALLBACK_MAX_PER_HOUR`, and texting hours (8 AM to
  9 PM where the number is; otherwise held until 8 AM).
- After an explicit failure, later texts to that number go straight to SMS (iMessage reachability is cached as "no" for 30
  days), while the fallback is on. A missing receipt does not change reachability.

## 4. Settings

Twilio's keys are **not** env vars. They are entered per line (Vtext, Lines, Add line) and stored encrypted with
`VTEXT_SECRETS_KEY`. Env vars (all in `.env.example`):

| Variable | Default | Meaning |
|---|---|---|
| `VTEXT_SMS_FALLBACK_ENABLED` | `false` | Master switch for the whole fallback |
| `VTEXT_SMS_FALLBACK_NO_RECEIPT_MODE` | `verify` | `verify` / `auto` / `off` for the no-receipt case |
| `VTEXT_SMS_FALLBACK_IMESSAGE_CODES` | `22` | Receipt error codes that mean "not delivered" |
| `VTEXT_SMS_FALLBACK_MAX_AGE_HOURS` | `24` | Never send a fallback for an older iMessage |
| `VTEXT_SMS_FALLBACK_MAX_PER_HOUR` | `30` | Cap on fallback texts created per hour |
| `VTEXT_TWILIO_VALIDITY_SECONDS` | `14400` | How long Twilio keeps trying to deliver |
| `VTEXT_ENABLED`, `VTEXT_PUBLIC_BASE_URL`, `VTEXT_SECRETS_KEY` | existing | Vtext on, the public API address (Twilio posts receipts there), the encryption key |

Per line: `config.messagingServiceSid` (`MG…`), optional `config.manageServiceWebhooks`, credentials `accountSid` (`AC…`) and
`authToken` (needed even if an API key sends, because Twilio signs webhooks with the auth token), optional `apiKeySid` /
`apiKeySecret`.

## 5. Setting up the line (runbook)

1. **Vtext, Lines, Add line**, channel "SMS (Twilio, fallback)". Enter the Account SID, auth token, Messaging Service SID and
   the Twilio number. Format mistakes show before saving.
2. **Limits.** Enter perMinute, perDay and newRecipientsPerHour from the approved campaign and the carrier daily cap in the
   Twilio console. The adapter's defaults (10 a minute, 200 a day, 60 new people an hour) are placeholders and are
   not trusted: **"Activate line" is refused until all three are set on the line.** There is no warm-up ramp for SMS.
3. **Webhook.** Twilio must post to the line's webhook URL (shown on the line, `…/api/webhooks/vtext/twilio-sms/<key>`).
   Either paste it into the Twilio console (Messaging, Services, your service, Integration, "Send a webhook", POST), or tick
   "Let Vtext set this service's incoming-message URL" when the service is not shared with anything else (for example login
   codes). Delivery receipts need no console setup: each text carries its own receipt address.
4. **Advanced Opt-Out** must be on for the service, so Twilio answers STOP, START and HELP itself.
5. **Test send** to your own phone from the line, then **Activate line**.
6. Set `VTEXT_SMS_FALLBACK_ENABLED=true` and restart. Start with `verify` mode.

## 6. Needs the real Twilio account (not confirmable until then)

- Account SID, auth token, Messaging Service SID and the number.
- The campaign's throughput and daily cap (they differ by campaign type; low-volume senders can be capped hard).
- Whether Advanced Opt-Out is on, and its STOP/START/HELP wording.
- Whether the Messaging Service is shared (for example with login-code texts).
- Exact callback fields (`OptOutType`) and that Twilio signs the exact URL we expect (we build it from `VTEXT_PUBLIC_BASE_URL`).
- Delivery-receipt coverage by carrier (some carriers never report `delivered`).
- BlueBubbles' reply for a message by id (not built; "verify" mode currently just waits for a person).

### First live test (with a number you approve; send nothing without that)

1. Add the line with tiny limits (for example 5 a day), a test number, and activate it after a test send.
2. Check the receipt arrives: the text moves from `accepted` to `sent` to `delivered`, and the signature check passes.
3. Reply from that phone: the reply shows in the same person's thread, tagged SMS.
4. Reply STOP: the contact is opted out here, and **every** line is blocked. Reply START to undo.
5. Force a fallback with a known non-iMessage number you approve, and check that the original shows "Re-sent by SMS".

## 7. What carriers and Twilio can still do to us

- **Filtering (error 30007):** counts against the line's health. Keep the wording close to the campaign's approved samples,
  avoid public link shorteners, and use full `vihara.ai` links.
- **Opt-outs:** a send refused with `21610` means the person texted STOP to the Twilio number. We record that on the contact
  (method "provider") so no line texts them. `21614` (not a mobile number) marks the number a landline. `30005` and `30006` are
  left unmarked on purpose: they can be temporary.
- **Long messages:** nothing caps segments yet. A message over 160 characters is billed per segment (the segment count is saved
  on the message). Smart encoding swaps curly quotes for plain ones to stay in cheaper segments.
- **No MMS:** images never fall back. The plain text body is what is sent.
- **Cost:** a fallback is one SMS. The hourly cap and max age bound the worst case.

## 8. Where the code is

Backend (`src/services/vtext/` unless noted):

| Area | Files |
|---|---|
| Channel | `channels/twilioSms/{adapter,client,mapErrors}.js`, `channels/registry.js`, `model/vtext/vtextLineModel.js` |
| Webhooks | `routes/vtext/vtextWebhookRoutes.js`, `controller/vtext/vtextWebhookController.js`, `vtextWebhookUrl.js`, `workers/inboundWorker.js` |
| Fallback | `vtextSmsFallbackService.js`, `workers/lineSendWorker.js`, `workers/maintenanceWorker.js`, `vtextRouter.js`, `utils/textingWindow.js` |
| Opt-outs | `vtextOptOutService.js`, `workers/inboundWorker.js` |
| Limits | `vtextCapacityService.js`, `controller/vtext/vtextLineController.js` (activation guard) |
| Inbox | `controller/vtext/vtextConversationController.js` (`?scope=contact`), `vtextDraftReplyService.js`, `vtextLeadMessagesService.js` |
| Manual button | `POST /api/v1/vtext/messages/:id/sms-fallback` in `controller/vtext/vtextMessageController.js` |

Tests (`npm test`): `vtextTwilioSmsAdapter`, `vtextTwilioWebhook`, `vtextSmsFallback`, `vtextTwilioOptOut`, `vtextTwilioLimits`,
`vtextTwilioInbox`. The database tests use a throwaway local Mongo and skip when none is running.

Frontend (`vihara-next/components/admin/Vtext/`): `AddLineModal`, `LinesTable`, `LineDetail`, `FailedMessages`, `ThreadView`,
`Composer`, `channels.ts`.
