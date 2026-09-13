# Local Telegram Bot Testing

Run the Orqaly Telegram bot against your laptop with no Vercel
deployment required. Two terminals, one ngrok tunnel, real Telegram messages
flowing into your local code.

---

## One-time setup (~5 min)

### 1. Install ngrok
```bash
brew install ngrok          # macOS
# or download from https://ngrok.com/download
```

Create a free ngrok account, copy your auth token from the dashboard, then:
```bash
ngrok config add-authtoken <YOUR_NGROK_TOKEN>
```

### 2. Create the shared bot (one-time, ever)
1. Open Telegram, DM `@BotFather`, send `/newbot`.
2. Pick a name and a username (must end in `bot`, e.g. `orchestratori_bot`).
3. Copy the token BotFather gives you (looks like `7123:AAH...`).

### 3. Add three env vars to `.env.local`
```env
TELEGRAM_SHARED_BOT_TOKEN=7123:AAH...                # from BotFather
TELEGRAM_SHARED_BOT_USERNAME=orchestratori_bot       # without the @
TELEGRAM_SHARED_SECRET_TOKEN=<random-48-char-string> # any random string
```

Also add this so the frontend onboarding page can show the right bot handle:
```env
VITE_TELEGRAM_SHARED_BOT_USERNAME=orchestratori_bot
```

### 4. Apply the database migration
In the Supabase SQL Editor (or `supabase db push`), apply:
```
supabase/migrations/144_communicator_security.sql
```

### 5. Make yourself an admin
```sql
update public.users set role='admin' where id='<your-auth-user-uuid>';
```
(Get the UUID from Supabase → Authentication → Users → your email.)

---

## Every session (2 terminals)

### Terminal A — local stack
```bash
npm run dev:local
```
Starts three things in parallel:
- Express API on `http://localhost:3001`
- Vite frontend on `http://localhost:5176`
- Worker loop polling `process-next` every 15 s

### Terminal B — bot tunnel
```bash
npm run dev:bot
```
Starts ngrok, gets a public HTTPS URL, calls Telegram `setWebhook` to point
the bot at it, and prints:
```
🤖  BOT LIVE  —  DM @orchestratori_bot
   Webhook: https://abc123.ngrok-free.app/api/communicator/webhook/telegram
   Open the app:  http://localhost:5176/communicator/connect-telegram
   Press Ctrl+C to stop (cleans up webhook + ngrok automatically)
```

Now open `http://localhost:5176/communicator/connect-telegram` in your browser
and follow the wizard.

### When you're done
**Ctrl+C in Terminal B.** The script calls Telegram `deleteWebhook` so that a
stale ngrok URL isn't left registered. Then kill Terminal A.

---

## Smoke test (~2 min)

1. `http://localhost:5176/communicator/connect-telegram` → **Get code**
2. Tap **Open Telegram** → send the pre-filled `/start XXXXXX`
3. Expect "✓ Linked" reply within 2 s, and the page flips to **You're linked**
4. DM the bot: `list my goals` → real list within 5 s
5. DM the bot: `create a goal: local test, budget 5` → "✅ Created" + new row
   in Supabase `goals` table + queued `agent_jobs` row processed within 15 s
6. Send the same message twice quickly → only ONE goal appears (proves
   `update_id` idempotency works)
7. DM `/help` → command reference
8. Send a voice message → expect it transcribed and acted on (uses Groq Whisper)
9. DM `/style friendly` → bot acknowledges, future replies feel friendlier
10. DM `/audit` → last 50 logged actions

---

## Offline mode (no ngrok, no real Telegram)

Useful when iterating on worker logic, on a plane, or behind a hostile network.

```bash
# Send a fake "list goals" update
node scripts/simulate-telegram-update.mjs --text "list my goals"

# Send a fake "create goal" (the default if you pass no text)
node scripts/simulate-telegram-update.mjs

# Send a slash command
node scripts/simulate-telegram-update.mjs --text "/help"

# Simulate tapping an Approve button
node scripts/simulate-telegram-update.mjs --callback "confirm:approve:<pending_id>"

# Use a specific Telegram user id (must match an allowed_ids on a real channel)
node scripts/simulate-telegram-update.mjs --text "list goals" --from-id 123456789
```

The simulator POSTs at `http://localhost:3001/api/communicator/webhook/telegram`
with the right `X-Telegram-Bot-Api-Secret-Token` header. Watch Terminal A for
the worker logs.

**Note:** outbound `sendMessage` calls still hit the real Telegram API if your
`TELEGRAM_SHARED_BOT_TOKEN` is valid. If you use a `--from-id` that belongs to
a real Telegram user who has linked, they'll see the bot's reply. For totally
silent testing, use a fake bot token or accept that the reply will fail
silently.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ngrok not installed` | Missing dependency | `brew install ngrok` + `ngrok config add-authtoken …` |
| `setWebhook failed` with 401 | Token wrong | Re-check `TELEGRAM_SHARED_BOT_TOKEN` in `.env.local` |
| Bot doesn't reply to `/start ABC123` | Worker not running | Make sure `npm run dev:local` is up; check Terminal A for `process-next` lines |
| Bot replies "I don't know you yet" after `/start` | Code already used, or expired (>10 min) | Generate a fresh code via the wizard |
| "Already linked" but no replies | Old allowed_ids row from a prior test | Drop the old row: `delete from communication_channels where connected_by='<your uuid>' and status='inactive'` then re-link |
| ngrok URL changes each session | Free tier behavior | The `dev-bot.sh` script re-runs `setWebhook` automatically every time, so this is fine for dev |
| Telegram delivers nothing at all | Webhook was set in a previous session and ngrok URL changed | Run `npm run dev:bot` again — it overwrites the webhook |

---

## What deploys to production unchanged

The exact same code runs on Vercel when you eventually deploy. Only the
webhook URL differs:
- **Local:** `https://abc123.ngrok-free.app/api/communicator/webhook/telegram`
- **Prod:** `https://orchestratori.vercel.app/api/communicator/webhook/telegram`

To switch the bot back to prod after testing, just deploy and call
`setWebhook` once against the prod URL (see `lib/communicator-handlers/telegram-register.js`
or run a one-shot `curl`).
