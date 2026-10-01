import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Chess } from 'chess.js';
import { getBoardFen, getMoveHistory } from './chess-fen-reader.mjs';
import { askJevMove, fetchStockfishMove, getGameStatusInChrome, uciToCoords } from './play-chess-bot.mjs';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const SPEED_PRESETS = {
  snappy: { steps: 6, delayMs: 8, dwellMs: 60, name: 'Snappy (~50ms)' },
  fast: { steps: 10, delayMs: 10, dwellMs: 80, name: 'Fast (~100ms)' },
  normal: { steps: 18, delayMs: 14, dwellMs: 120, name: 'Normal (~250ms)' },
  smooth: { steps: 28, delayMs: 16, dwellMs: 160, name: 'Smooth cinematic (~450ms)' },
};

export function getBoardGeometry() {
  const script = `
tell application "Google Chrome"
    activate
    tell active tab of front window
        return execute javascript "(function() {
            const board = document.querySelector('wc-chess-board, chess-board');
            if (!board) return JSON.stringify({ error: 'no board' });
            const r = board.getBoundingClientRect();
            return JSON.stringify({
                boardRect: { left: r.left, top: r.top, width: r.width, height: r.height },
                window: { screenX: window.screenX, screenY: window.screenY, outerHeight: window.outerHeight, innerHeight: window.innerHeight },
                devicePixelRatio: window.devicePixelRatio
            });
        })()"
    end tell
end tell`;

  const data = JSON.parse(execFileSync('osascript', ['-e', script], { encoding: 'utf8' }));
  const dpr = data.devicePixelRatio || 2;
  const toolbarH = data.window.outerHeight - data.window.innerHeight;
  const originX = (data.window.screenX + data.boardRect.left) * dpr;
  const originY = (data.window.screenY + toolbarH + data.boardRect.top) * dpr;
  const sqSize = (data.boardRect.width / 8) * dpr;
  return { originX, originY, sqSize, dpr };
}

export function sqToPixels(file, rank, geom) {
  return {
    x: Math.round(geom.originX + (file - 0.5) * geom.sqSize),
    y: Math.round(geom.originY + (8 - rank + 0.5) * geom.sqSize),
  };
}

export async function glideCursor(fromX, fromY, toX, toY, config = SPEED_PRESETS.normal) {
  const { steps, delayMs } = config;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // Ease-in-out curve
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const curX = Math.round(fromX + (toX - fromX) * ease);
    const curY = Math.round(fromY + (toY - fromY) * ease);

    execFileSync('cua-driver', ['call', 'move_cursor', JSON.stringify({
      target: { kind: 'desktop', display_id: 'primary' },
      x: curX,
      y: curY,
    })]);

    if (delayMs > 0) await sleep(delayMs);
  }
}

export function clickDesktop(x, y) {
  execFileSync('cua-driver', ['call', 'click', JSON.stringify({
    target: { kind: 'desktop', display_id: 'primary' },
    x,
    y,
  })]);
}

export async function executePhysicalChessMove(fromFile, fromRank, toFile, toRank, speedConfig = SPEED_PRESETS.normal) {
  // Ensure Chrome is active and focused
  execFileSync('osascript', ['-e', 'tell application "Google Chrome" to activate']);
  await sleep(100);

  const geom = getBoardGeometry();
  const from = sqToPixels(fromFile, fromRank, geom);
  const to = sqToPixels(toFile, toRank, geom);

  // 1. Move cursor to source square
  clickDesktop(from.x, from.y);
  await sleep(speedConfig.dwellMs);

  // 2. Visibly glide cursor across board to destination square
  await glideCursor(from.x, from.y, to.x, to.y, speedConfig);

  // 3. Click destination square
  clickDesktop(to.x, to.y);
  await sleep(speedConfig.dwellMs);

  // Check for promotion dialog
  const checkPromotionScript = `
tell application "Google Chrome"
    tell active tab of front window
        execute javascript "(function() {
            const queen = document.querySelector('.promotion-piece.wq, [data-type=queen], .promotion-menu .queen');
            if (queen) queen.click();
        })()"
    end tell
end tell`;
  try {
    execFileSync('osascript', ['-e', checkPromotionScript]);
  } catch {}
}

export async function playMatchPhysical(speedPresetKey = 'normal') {
  const speedConfig = SPEED_PRESETS[speedPresetKey] || SPEED_PRESETS.normal;
  console.log(`=== Physical Chess Match vs Bot Sabo ===`);
  console.log(`Configured Cursor Speed: ${speedConfig.name} (${speedConfig.steps} steps @ ${speedConfig.delayMs}ms)\n`);

  let moveCount = 0;
  const maxMoves = 80;

  while (moveCount < maxMoves) {
    // 1. Check if game is over in DOM
    const status = getGameStatusInChrome();
    if (status.isOver && status.text) {
      console.log('Game Over detected in Chrome:', status.text);
      break;
    }

    // 2. Read live moves from board
    const moves = getMoveHistory();
    const liveFen = getBoardFen();

    const chess = new Chess();
    for (const m of moves) {
      try {
        chess.move(m);
      } catch (err) {}
    }

    if (chess.isGameOver()) {
      console.log('Game Over detected by chess.js:', {
        isCheckmate: chess.isCheckmate(),
        isDraw: chess.isDraw(),
        turn: chess.turn(),
      });
      break;
    }

    // Is it White's turn?
    if (chess.turn() !== 'w') {
      console.log(`Waiting for Sabo (Black) to move... (ply ${moves.length})`);
      await sleep(1000);
      continue;
    }

    const currentFen = chess.fen();
    const moveNum = Math.floor(moves.length / 2) + 1;
    console.log(`\n--- [Move ${moveNum}] Physical White Turn ---`);
    console.log(`Board FEN: ${liveFen}`);

    // 3. Engine evaluation + candidate generation
    const engineRes = await fetchStockfishMove(currentFen, 12);
    const legalMoves = chess.moves({ verbose: true });
    if (legalMoves.length === 0) break;

    let chosenUci = null;
    let chosenSan = null;

    if (engineRes && engineRes.bestmove) {
      chosenUci = engineRes.bestmove;
      const matched = legalMoves.find(m => `${m.from}${m.to}${m.promotion || ''}` === chosenUci);
      chosenSan = matched ? matched.san : chosenUci;

      console.log(`Engine Evaluation: ${engineRes.evaluation ?? ('Mate in ' + engineRes.mate)} (Best: ${chosenSan})`);

      // 4. JEV System-1 choice routing
      try {
        const topCandidates = {};
        topCandidates[chosenSan] = `Primary line (${chosenSan}): ${engineRes.continuation || 'Optimal tactics'}`;
        for (const alt of legalMoves) {
          if (alt.san !== chosenSan && Object.keys(topCandidates).length < 3) {
            topCandidates[alt.san] = `Alternative candidate ${alt.san}`;
          }
        }
        const jevGoal = engineRes.mate ? `Mate in ${engineRes.mate}` : 'Outplay Sabo with physical moves';
        const jevDecision = await askJevMove(jevGoal, topCandidates);
        console.log(`JEV System-1 Choice: ${jevDecision.choice} (confidence: ${jevDecision.confidence}, latency: ${jevDecision.latencyMs}ms)`);
      } catch (e) {
        console.warn('JEV info:', e.message);
      }
    } else {
      const fallback = legalMoves[0];
      chosenUci = `${fallback.from}${fallback.to}${fallback.promotion || ''}`;
      chosenSan = fallback.san;
    }

    // 5. Physical mouse execution
    const coords = uciToCoords(chosenUci);
    console.log(`Moving physical mouse: ${chosenSan} (${coords.fromFile},${coords.fromRank} -> ${coords.toFile},${coords.toRank})`);
    
    await executePhysicalChessMove(coords.fromFile, coords.fromRank, coords.toFile, coords.toRank, speedConfig);

    // 6. Verify move was made
    const targetPly = moves.length + 1;
    let registered = false;
    for (let i = 0; i < 6; i++) {
      await sleep(500);
      const cur = getMoveHistory();
      if (cur.length >= targetPly) {
        registered = true;
        break;
      }
      if (i === 2) {
        console.log('Retrying physical click on destination...');
        const geom = getBoardGeometry();
        const to = sqToPixels(coords.toFile, coords.toRank, geom);
        clickDesktop(to.x, to.y);
      }
    }

    if (registered) {
      console.log(`Move ${chosenSan} successfully placed on board.`);
    }

    await sleep(600);
    moveCount++;
  }

  console.log('\n=============================================');
  console.log('=== Physical Match Completed Successfully ===');
  console.log('=============================================');
  const finalStatus = getGameStatusInChrome();
  console.log('Final Status:', finalStatus);
  const finalMoves = getMoveHistory();
  console.log('Total Plies:', finalMoves.length);
  console.log('Move Sequence:\n', finalMoves.join(' '));
}

// Allow CLI speed selection
const argSpeed = process.argv[2] || 'fast';
playMatchPhysical(argSpeed).catch(err => {
  console.error('Physical match failed:', err);
  process.exit(1);
});
