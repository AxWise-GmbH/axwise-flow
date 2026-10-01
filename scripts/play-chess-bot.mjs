import fs from 'node:fs';
import { execSync } from 'node:child_process';

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [k, ...rest] = trimmed.split('=');
      process.env[k.trim()] = rest.join('=').trim().replace(/^['\"]|['\"]$/g, '');
    }
  }
}
loadEnvFile('.env.local');

const TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const TYPESAFE_API_KEY = process.env.TYPESAFE_API_KEY;

export async function askJevMove(positionGoal, candidates) {
  const started = performance.now();
  const res = await fetch(TYPESAFE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TYPESAFE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'jev-latest',
      state: { goal: positionGoal },
      questions: {
        action: {
          type: 'choice',
          instructions: 'Choose the most powerful, principled move for White.',
          criteria: candidates,
        },
      },
    }),
  });

  const latencyMs = Math.round(performance.now() - started);
  if (!res.ok) throw new Error(`JEV Error: HTTP ${res.status}`);
  const data = await res.json();
  const ans = data.answers?.action;
  return {
    choice: ans?.choice,
    confidence: ans?.confidence,
    probabilities: ans?.probabilities,
    latencyMs,
  };
}

export function dispatchChessMove(fromFile, fromRank, toFile, toRank) {
  const script = `
tell application "Google Chrome"
    repeat with w in windows
        repeat with t in tabs of w
            if URL of t contains "chess.com" then
                tell t
                    execute javascript "(function() {
                        const board = document.querySelector('wc-chess-board, chess-board');
                        if (!board) return 'NO_BOARD';
                        const rect = board.getBoundingClientRect();
                        const sq = rect.width / 8;
                        const fromX = rect.left + (${fromFile} - 0.5) * sq;
                        const fromY = rect.top + (8 - ${fromRank} + 0.5) * sq;
                        const toX = rect.left + (${toFile} - 0.5) * sq;
                        const toY = rect.top + (8 - ${toRank} + 0.5) * sq;
                        function clickPoint(x, y) {
                            const el = document.elementFromPoint(x, y) || board;
                            ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evtType => {
                                el.dispatchEvent(new PointerEvent(evtType, {
                                    bubbles: true, cancelable: true, view: window,
                                    clientX: x, clientY: y, button: 0, buttons: evtType.includes('down') ? 1 : 0
                                }));
                            });
                        }
                        clickPoint(fromX, fromY);
                        setTimeout(() => { clickPoint(toX, toY); }, 250);
                        return 'OK';
                    })()"
                end tell
                return "DISPATCHED"
            end if
        end repeat
    end repeat
    return "CHESS_TAB_NOT_FOUND"
end tell`;

  return execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { encoding: 'utf8' }).trim();
}
