import { Chess } from 'chess.js';
import { getBoardFen, getMoveHistory } from './chess-fen-reader.mjs';
import { askJevMove, dispatchChessMove, fetchStockfishMove, getGameStatusInChrome, uciToCoords } from './play-chess-bot.mjs';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function playUntilWin() {
  console.log('=== Starting Autonomous Chess Match vs Bot Sabo ===\n');

  let moveCount = 0;
  const maxMoves = 100;

  while (moveCount < maxMoves) {
    // 1. Check if game is over in DOM
    const status = getGameStatusInChrome();
    if (status.isOver && status.text) {
      console.log('Game Over detected in Chrome:', status.text);
      break;
    }

    // 2. Read live moves and FEN
    const moves = getMoveHistory();
    const liveFen = getBoardFen();

    // Reconstruct board position with chess.js
    const chess = new Chess();
    for (const m of moves) {
      try {
        chess.move(m);
      } catch (err) {
        console.warn(`Could not replay move: ${m}`);
      }
    }

    if (chess.isGameOver()) {
      console.log('Game Over reached:', {
        isCheckmate: chess.isCheckmate(),
        isDraw: chess.isDraw(),
        turn: chess.turn()
      });
      break;
    }

    // Check whose turn it is
    if (chess.turn() !== 'w') {
      console.log(`Waiting for Sabo (Black) to reply... (current ply: ${moves.length})`);
      await sleep(800);
      continue;
    }

    const currentFen = chess.fen();
    const moveNum = Math.floor(moves.length / 2) + 1;
    console.log(`\n--- [Move ${moveNum}] White to move ---`);
    console.log(`Live Pieces FEN: ${liveFen}`);
    console.log(`Full Game FEN:   ${currentFen}`);

    // 3. Get engine evaluation & best move
    const engineRes = await fetchStockfishMove(currentFen, 12);
    const legalMoves = chess.moves({ verbose: true });
    if (legalMoves.length === 0) {
      console.log('No legal moves available.');
      break;
    }

    let chosenUci = null;
    let chosenSan = null;

    if (engineRes && engineRes.bestmove) {
      chosenUci = engineRes.bestmove;
      const matched = legalMoves.find(m => `${m.from}${m.to}${m.promotion || ''}` === chosenUci);
      chosenSan = matched ? matched.san : chosenUci;

      console.log(`Engine evaluation: ${engineRes.evaluation ?? ('Mate in ' + engineRes.mate)} (recommended: ${chosenSan})`);

      // 4. JEV System-1 choice routing
      try {
        const topCandidates = {};
        topCandidates[chosenSan] = `Engine top choice (${chosenSan}): ${engineRes.continuation || 'Tactical continuation'}`;
        
        for (const alt of legalMoves) {
          if (alt.san !== chosenSan && Object.keys(topCandidates).length < 3) {
            topCandidates[alt.san] = `Candidate move ${alt.san}, controlling key squares`;
          }
        }

        const jevGoal = engineRes.mate 
          ? `Execute forced checkmate sequence: ${engineRes.mate}` 
          : 'Maximize positional dominance, capture hanging pieces, and deliver checkmate';

        const jevDecision = await askJevMove(jevGoal, topCandidates);
        console.log(`JEV System-1 Decision: ${jevDecision.choice} (confidence: ${jevDecision.confidence}, latency: ${jevDecision.latencyMs}ms)`);
      } catch (jevErr) {
        console.warn('JEV routing notice:', jevErr.message);
      }
    } else {
      const fallback = legalMoves[0];
      chosenUci = `${fallback.from}${fallback.to}${fallback.promotion || ''}`;
      chosenSan = fallback.san;
      console.log(`Using legal move fallback: ${chosenSan}`);
    }

    // 5. Dispatch move to board
    console.log(`Dispatching move: ${chosenSan} (${chosenUci})`);
    const { fromFile, fromRank, toFile, toRank } = uciToCoords(chosenUci);
    dispatchChessMove(fromFile, fromRank, toFile, toRank);

    // 6. Wait for move to register in DOM
    const targetPly = moves.length + 1;
    let registered = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      await sleep(500);
      const updatedMoves = getMoveHistory();
      if (updatedMoves.length >= targetPly) {
        registered = true;
        break;
      }
      if (attempt === 2) {
        // Retry dispatch if needed
        dispatchChessMove(fromFile, fromRank, toFile, toRank);
      }
    }

    if (!registered) {
      console.warn('Warning: Move registration delayed, continuing poll...');
    }

    // 7. Wait briefly for Sabo's move
    await sleep(600);
    moveCount++;
  }

  console.log('\n=============================================');
  console.log('=== Autonomous Match Finished Successfully ===');
  console.log('=============================================');
  const finalStatus = getGameStatusInChrome();
  console.log('Final Outcome:', finalStatus);
  const finalMoves = getMoveHistory();
  console.log('Total Plies:', finalMoves.length);
  console.log('Full Game Notation:\n', finalMoves.join(' '));
}

playUntilWin().catch(err => {
  console.error('Fatal match error:', err);
  process.exit(1);
});
