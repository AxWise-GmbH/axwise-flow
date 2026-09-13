#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dev-bot.sh — Run the Orqaly Telegram bot against your laptop.
#
# Workflow:
#   1. Assumes `npm run dev:local` is already running in another terminal
#      (Express API on :3001 + Vite on :5176 + worker loop).
#   2. Spawns ngrok to expose :3001 to a public HTTPS URL.
#   3. Reads the URL from ngrok's local inspector API (:4040).
#   4. Calls Telegram setWebhook to point the shared bot at that URL.
#   5. On Ctrl+C: calls deleteWebhook (so prod doesn't accidentally hit
#      the dead tunnel later) and kills ngrok.
#
# Requirements (one-time):
#   - ngrok installed:        brew install ngrok        # or download
#   - ngrok account + token:  ngrok config add-authtoken <YOUR_TOKEN>
#   - .env.local must contain:
#       TELEGRAM_SHARED_BOT_TOKEN=...
#       TELEGRAM_SHARED_SECRET_TOKEN=...
#       TELEGRAM_SHARED_BOT_USERNAME=orchestratori_bot   (optional, cosmetic)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."

LOCAL_PORT="${LOCAL_API_PORT:-3001}"
NGROK_INSPECTOR="http://127.0.0.1:4040/api/tunnels"

# ── 0. Sanity checks ────────────────────────────────────────────────────────
if ! command -v ngrok >/dev/null 2>&1; then
  echo "[dev-bot] ERROR: ngrok not installed."
  echo "         Install: brew install ngrok    (or https://ngrok.com/download)"
  echo "         Then:    ngrok config add-authtoken <YOUR_TOKEN>"
  exit 1
fi

if [ ! -f .env.local ]; then
  echo "[dev-bot] ERROR: .env.local not found in $(pwd)"
  exit 1
fi

# Load env vars from .env.local (only the ones we need).
TG_TOKEN="$(grep -E '^TELEGRAM_SHARED_BOT_TOKEN=' .env.local | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
TG_SECRET="$(grep -E '^TELEGRAM_SHARED_SECRET_TOKEN=' .env.local | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
TG_USERNAME="$(grep -E '^TELEGRAM_SHARED_BOT_USERNAME=' .env.local | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"

if [ -z "${TG_TOKEN}" ]; then
  echo "[dev-bot] ERROR: TELEGRAM_SHARED_BOT_TOKEN missing from .env.local"
  echo "         Get a token from @BotFather on Telegram and paste it there."
  exit 1
fi
if [ -z "${TG_SECRET}" ]; then
  echo "[dev-bot] WARNING: TELEGRAM_SHARED_SECRET_TOKEN not set — generating one."
  echo "         For a stable setup, add it to .env.local:"
  TG_SECRET="$(LC_ALL=C tr -dc 'A-Za-z0-9_-' </dev/urandom | head -c 48)"
  echo "         TELEGRAM_SHARED_SECRET_TOKEN=${TG_SECRET}"
fi

# Quick liveness check for the local API server.
if ! curl -fs "http://localhost:${LOCAL_PORT}/" >/dev/null 2>&1; then
  echo "[dev-bot] ERROR: local API server not responding on :${LOCAL_PORT}"
  echo "         Run 'npm run dev:local' in another terminal first."
  exit 1
fi

# ── 1. Trap Ctrl+C — clean up webhook + ngrok ───────────────────────────────
NGROK_PID=""
cleanup() {
  echo ""
  echo "[dev-bot] Cleaning up..."
  # Tell Telegram to stop sending updates anywhere — prevents a stale ngrok
  # URL from being held in Telegram's webhook registry.
  curl -sS -X POST "https://api.telegram.org/bot${TG_TOKEN}/deleteWebhook" \
    -H 'Content-Type: application/json' \
    -d '{"drop_pending_updates":false}' \
    | sed 's/^/[dev-bot] deleteWebhook: /'
  echo ""
  if [ -n "${NGROK_PID}" ] && kill -0 "${NGROK_PID}" 2>/dev/null; then
    kill "${NGROK_PID}" 2>/dev/null || true
    echo "[dev-bot] ngrok stopped."
  fi
  exit 0
}
trap cleanup INT TERM

# ── 2. Start ngrok ──────────────────────────────────────────────────────────
echo "[dev-bot] Starting ngrok tunnel to localhost:${LOCAL_PORT}..."
ngrok http "${LOCAL_PORT}" --log=stdout --log-format=logfmt >/tmp/orchestratori-ngrok.log 2>&1 &
NGROK_PID=$!

# ── 3. Wait for the public URL ──────────────────────────────────────────────
PUBLIC_URL=""
for i in $(seq 1 30); do
  sleep 1
  PUBLIC_URL="$(curl -fs "${NGROK_INSPECTOR}" 2>/dev/null \
    | grep -oE '"public_url":"https://[^"]+"' \
    | head -n1 \
    | sed -E 's/.*"https:\/\/([^"]+)".*/https:\/\/\1/')"
  if [ -n "${PUBLIC_URL}" ]; then break; fi
done

if [ -z "${PUBLIC_URL}" ]; then
  echo "[dev-bot] ERROR: ngrok didn't produce a public URL after 30s. Logs:"
  tail -n 20 /tmp/orchestratori-ngrok.log
  cleanup
  exit 1
fi

WEBHOOK_URL="${PUBLIC_URL}/api/communicator/webhook/telegram"
echo "[dev-bot] ngrok tunnel: ${PUBLIC_URL}"

# ── 4. Register the webhook with Telegram ───────────────────────────────────
echo "[dev-bot] Registering webhook with Telegram..."
SET_RESP="$(curl -sS -X POST "https://api.telegram.org/bot${TG_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "$(cat <<EOF
{
  "url": "${WEBHOOK_URL}",
  "secret_token": "${TG_SECRET}",
  "allowed_updates": ["message", "callback_query"],
  "drop_pending_updates": false
}
EOF
)")"
echo "[dev-bot] setWebhook response: ${SET_RESP}"

if ! echo "${SET_RESP}" | grep -q '"ok":true'; then
  echo "[dev-bot] ERROR: setWebhook failed. See response above."
  cleanup
  exit 1
fi

# ── 5. Status banner + idle loop ────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
printf "║  🤖  BOT LIVE  —  DM @%-44s ║\n" "${TG_USERNAME:-your_bot}"
echo "║                                                                      ║"
printf "║  Webhook: %-58s ║\n" "${WEBHOOK_URL:0:58}"
echo "║                                                                      ║"
echo "║  Open the app:  http://localhost:5176/communicator/connect-telegram  ║"
echo "║                                                                      ║"
echo "║  Press Ctrl+C to stop (cleans up webhook + ngrok automatically)      ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""

# Tail ngrok in the foreground so user sees inbound requests live.
tail -f /tmp/orchestratori-ngrok.log
