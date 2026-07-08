import Square from './Square';

const ROWS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export interface BoardProps {
  fen: string;
  selectedSquare: string | null;
  legalMoves: string[];
  lastMove: string | null;
  isThinking: boolean;
  onSquareClick: (square: string) => void;
  checkSquare?: string | null;
}

/**
 * 解析 UCI 走法字符串（如 "e2e4"）为 from 和 to
 */
export function parseUci(uci: string | null): { from: string; to: string } | null {
  if (!uci || uci.length < 4) return null;
  return { from: uci.substring(0, 2), to: uci.substring(2, 4) };
}

/**
 * 解析 FEN 字符串为 8×8 棋子数组
 * 返回 (string | null)[][]，其中 string 为棋子字符（P/p/K/k 等），null 为空格子
 */
export function parseFen(fen: string): (string | null)[][] {
  const rows = fen.split(' ')[0].split('/');
  return rows.map((row) => {
    const result: (string | null)[] = [];
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        const empty = parseInt(ch, 10);
        for (let i = 0; i < empty; i++) result.push(null);
      } else {
        result.push(ch);
      }
    }
    return result;
  });
}

function Board({
  fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  selectedSquare = null,
  legalMoves = [],
  lastMove = null,
  isThinking = false,
  onSquareClick = () => {},
  checkSquare = null,
}: BoardProps) {
  const pieces = parseFen(fen);
  const lastMoveParsed = parseUci(lastMove);

  return (
    <div className="board" role="grid" aria-label="国际象棋棋盘">
      {ROWS.map((row) => (
        <div key={`row-${row}`} className="board__label board__label--row">
          {row}
        </div>
      ))}

      {ROWS.map((row, rowIdx) =>
        FILES.map((file) => {
          const square = `${file}${row}`;
          const piece = pieces[rowIdx][FILES.indexOf(file)];
          const isLight = (row + file.charCodeAt(0)) % 2 === 0;
          const isSelected = selectedSquare === square;
          const isLegalMove = legalMoves.includes(square);
          const isLastMove =
            lastMoveParsed !== null &&
            (lastMoveParsed.from === square || lastMoveParsed.to === square);
          const isCheck = checkSquare === square;

          return (
            <Square
              key={square}
              square={square}
              piece={piece}
              isLight={isLight}
              isSelected={isSelected}
              isLegalMove={isLegalMove}
              isLastMove={isLastMove}
              isCheck={isCheck}
              onClick={() => onSquareClick(square)}
            />
          );
        }),
      )}

      <div className="board__label board__label--corner" />
      {FILES.map((file) => (
        <div key={`col-${file}`} className="board__label board__label--col">
          {file}
        </div>
      ))}
    </div>
  );
}

export default Board;
