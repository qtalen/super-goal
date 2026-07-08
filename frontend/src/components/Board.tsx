import Square from './Square';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const ROWS = [8, 7, 6, 5, 4, 3, 2, 1];

export interface BoardProps {
  fen: string;
  selectedSquare: string | null;
  legalMoves: string[];
  lastMove: string | null;
  isThinking: boolean;
  onSquareClick: (square: string) => void;
  checkSquare?: string | null;
}

export function parseUci(uci: string | null): { from: string; to: string } | null {
  if (!uci || uci.length < 4) return null;
  return { from: uci.substring(0, 2), to: uci.substring(2, 4) };
}

export function parseFen(fen: string): (string | null)[][] {
  const rows = fen.split(' ')[0].split('/');
  return rows.map((row) => {
    const result: (string | null)[] = [];
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        for (let i = 0; i < parseInt(ch, 10); i++) result.push(null);
      } else {
        result.push(ch);
      }
    }
    return result;
  });
}

const SQUARE_SIZE = 64;
const LABEL_SIZE = 28;
const BOARD_SIZE = LABEL_SIZE + 8 * SQUARE_SIZE;

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

  const cells: React.ReactNode[] = [];

  for (let ri = 0; ri < 8; ri++) {
    const row = ROWS[ri];
    const pieceRow = pieces[ri];

    cells.push(
      <div
        key={`rl-${row}`}
        style={{
          gridColumn: 1,
          gridRow: ri + 1,
          width: LABEL_SIZE,
          height: SQUARE_SIZE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: '#888',
          background: '#2a2a3e',
        }}
      >
        {row}
      </div>
    );

    for (let fi = 0; fi < 8; fi++) {
      const file = FILES[fi];
      const square = `${file}${row}`;
      const piece = pieceRow[fi];
      const isLight = (ri + fi) % 2 === 0;
      const isSel = selectedSquare === square;
      const isLegal = legalMoves.includes(square);
      const isLast =
        lastMoveParsed !== null &&
        (lastMoveParsed.from === square || lastMoveParsed.to === square);
      const isCheck = checkSquare === square;

      cells.push(
        <Square
          key={square}
          square={square}
          piece={piece}
          isLight={isLight}
          isSelected={isSel}
          isLegalMove={isLegal}
          isLastMove={isLast}
          isCheck={isCheck}
          onClick={() => onSquareClick(square)}
        />
      );
    }
  }

  cells.push(
    <div
      key="corner"
      style={{
        gridColumn: 1,
        gridRow: 9,
        width: LABEL_SIZE,
        height: LABEL_SIZE,
        background: '#2a2a3e',
      }}
    />
  );

  for (let fi = 0; fi < 8; fi++) {
    cells.push(
      <div
        key={`cl-${FILES[fi]}`}
        style={{
          gridColumn: fi + 2,
          gridRow: 9,
          width: SQUARE_SIZE,
          height: LABEL_SIZE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: '#888',
          background: '#2a2a3e',
        }}
      >
        {FILES[fi]}
      </div>
    );
  }

  return (
    <div
      role="grid"
      aria-label="Chess board"
      style={{
        display: 'grid',
        gridTemplateColumns: `${LABEL_SIZE}px repeat(8, ${SQUARE_SIZE}px)`,
        gridTemplateRows: `repeat(8, ${SQUARE_SIZE}px) ${LABEL_SIZE}px`,
        border: '2px solid #333',
        borderRadius: '4px',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {cells}
    </div>
  );
}

export default Board;
