#!/usr/bin/env bash
set -euo pipefail

MODEL_PATH="$HOME/.local/share/goose/models/Qwen3.6-14B-A3B-VibeForged-v2-Q4_K_M.gguf"
PORT=8080

if [ ! -f "$MODEL_PATH" ]; then
  echo "Error: Model file not found at $MODEL_PATH"
  exit 1
fi

echo "Starting llama-server with Apple Metal offloading for Qwen3.6-14B-A3B-VibeForged-v2..."
echo "Setting JEV low thinking effort: reasoning-budget=150 tokens"
echo "Endpoint: http://127.0.0.1:$PORT/v1"

exec /opt/homebrew/bin/llama-server \
  -m "$MODEL_PATH" \
  -c 32768 \
  --cache-type-k q8_0 \
  --cache-type-v q8_0 \
  -ngl 99 \
  --parallel 1 \
  --threads 8 \
  --reasoning-effort low \
  --reasoning-budget 150 \
  --reasoning-format deepseek \
  --host 127.0.0.1 \
  --port "$PORT" \
  --alias "qwen3.6-14b-vibeforged" \
  --jinja
