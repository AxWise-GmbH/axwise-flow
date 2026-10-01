import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Chess } from 'chess.js';
import { getBoardFen, getMoveHistory } from './chess-fen-reader.mjs';

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [k, ...rest] = trimmed.split('=');
      const val = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[k.trim()]) process.env[k.trim()] = val;
    }
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');

const TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const TYPESAFE_API_KEY = process.env.TYPESAFE_API_KEY;

/**
 * Ask TypeSafe AI JEV System-1 to evaluate candidate moves
 */
export async function askJevMove(positionGoal, candidates) {
  const started = performance.now();
  
  // Format criteria object
  const criteria = {};
  if (Array.isArray(candidates)) {
    for (const c of candidates) {
      criteria[c.id || c.move] = c.description || c.text || c.id || c.move;
    }
  } else if (typeof candidates === 'object') {
    Object.assign(criteria, candidates);
  }

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
          criteria,
        },
      },
    }),
  });

  const latencyMs = Math.round(performance.now() - started);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`JEV Error HTTP ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const ans = data.answers?.action;
  return {
    choice: ans?.choice,
    confidence: ans?.confidence,
    probabilities: ans?.probabilities,
    latencyMs,
  };
}

/**
 * Dispatches a move to the Chess.com <wc-chess-board> DOM element via synthetic PointerEvents.
 */
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
                        setTimeout(() => { 
                            clickPoint(toX, toY); 
                            // In case of promotion dialog, click the queen
                            setTimeout(() => {
                                const queen = document.querySelector('.promotion-piece.wq, [data-type=queen], .promotion-menu .queen');
                                if (queen) queen.click();
                            }, 150);
                        }, 250);
                        return 'OK';
                    })()"
                end tell
                return "DISPATCHED"
            end if
        end repeat
    end repeat
    return "CHESS_TAB_NOT_FOUND"
end tell`;

  return execFileSync('osascript', ['-e', script], { encoding: 'utf8' }).trim();
}

/**
 * Fetch engine evaluation from Stockfish API
 */
export async function fetchStockfishMove(fen, depth = 12) {
  try {
    const url = `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(fen)}&depth=${depth}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.success && data.bestmove) {
      const match = data.bestmove.match(/bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
      if (match) {
        return {
          bestmove: match[1],
          evaluation: data.evaluation,
          mate: data.mate,
          continuation: data.continuation,
        };
      }
    }
  } catch (err) {
    console.warn('Stockfish online fetch warning:', err.message);
  }
  return null;
}

/**
 * Helper to check game over status in Chrome
 */
export function getGameStatusInChrome() {
  const script = `
tell application "Google Chrome"
    repeat with w in windows
        repeat with t in tabs of w
            if URL of t contains "chess.com" then
                tell t
                    return execute javascript "(function() {
                        const modal = document.querySelector('.game-over-modal-content, .board-modal-container, .game-over-dialog, .game-over-header-component');
                        const text = modal ? modal.innerText.trim() : '';
                        const hasRematch = !!Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Rematch'));
                        return JSON.stringify({ isOver: hasRematch || text.length > 0, text });
                    })()"
                end tell
            end if
        end repeat
    end repeat
    return "{\\"isOver\\":false,\\"text\\":\\"\\"}"
end tell`;
  try {
    return JSON.parse(execFileSync('osascript', ['-e', script], { encoding: 'utf8' }).trim());
  } catch {
    return { isOver: false, text: '' };
  }
}

/**
 * Convert uci move (e.g. 'e2e4') to file/rank numbers
 */
export function uciToCoords(uci) {
  const fromFile = 'abcdefgh'.indexOf(uci[0]) + 1;
  const fromRank = parseInt(uci[1], 10);
  const toFile = 'abcdefgh'.indexOf(uci[2]) + 1;
  const toRank = parseInt(uci[3], 10);
  return { fromFile, fromRank, toFile, toRank };
}
