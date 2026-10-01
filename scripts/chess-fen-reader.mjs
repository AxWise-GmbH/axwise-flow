import { execFileSync } from 'node:child_process';

/**
 * Reads the current FEN directly from the live Chess.com <wc-chess-board> DOM in Google Chrome.
 * Parses piece classes like `piece wp square-54` into standard Forsyth-Edwards Notation.
 */
export function getBoardFen() {
  const script = `
tell application "Google Chrome"
    repeat with w in windows
        repeat with t in tabs of w
            if URL of t contains "chess.com" then
                tell t
                    return execute javascript "(function() {
                        const board = document.querySelector('wc-chess-board, chess-board');
                        if (!board) return 'NO_BOARD';
                        
                        const grid = Array(8).fill(null).map(() => Array(8).fill(null));
                        const pieces = board.querySelectorAll('.piece');
                        
                        pieces.forEach(p => {
                            const classes = p.className.split(' ');
                            const pClass = classes.find(c => c.length === 2 && (c[0] === 'w' || c[0] === 'b'));
                            const sqClass = classes.find(c => c.startsWith('square-'));
                            if (pClass && sqClass) {
                                const coords = sqClass.replace('square-', '');
                                const file = parseInt(coords[0], 10) - 1;
                                const rank = parseInt(coords[1], 10) - 1;
                                const color = pClass[0];
                                const type = pClass[1].toUpperCase();
                                grid[7 - rank][file] = color === 'w' ? type : type.toLowerCase();
                            }
                        });

                        const fenRanks = grid.map(row => {
                            let empty = 0;
                            let s = '';
                            row.forEach(cell => {
                                if (!cell) {
                                    empty++;
                                } else {
                                    if (empty > 0) {
                                        s += empty;
                                        empty = 0;
                                    }
                                    s += cell;
                                }
                            });
                            if (empty > 0) s += empty;
                            return s;
                        });

                        return fenRanks.join('/');
                    })()"
                end tell
            end if
        end repeat
    end repeat
    return "CHESS_TAB_NOT_FOUND"
end tell`;

  return execFileSync('osascript', ['-e', script], { encoding: 'utf8' }).trim();
}

/**
 * Gets the current move history from the Chess.com move list container.
 */
export function getMoveHistory() {
  const script = `
tell application "Google Chrome"
    repeat with w in windows
        repeat with t in tabs of w
            if URL of t contains "chess.com" then
                tell t
                    return execute javascript "(function() {
                        const nodes = Array.from(document.querySelectorAll('.node.white-move, .node.black-move'))
                            .map(n => n.innerText.trim()).filter(Boolean);
                        return JSON.stringify(nodes);
                    })()"
                end tell
            end if
        end repeat
    end repeat
    return "[]"
end tell`;

  const output = execFileSync('osascript', ['-e', script], { encoding: 'utf8' }).trim();
  try {
    return JSON.parse(output);
  } catch {
    return [];
  }
}
