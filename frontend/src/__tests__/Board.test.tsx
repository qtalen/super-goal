import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Board, { parseFen, parseUci } from '../components/Board';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

const defaultProps = {
  fen: INITIAL_FEN,
  selectedSquare: null,
  legalMoves: [] as string[],
  lastMove: null,
  isThinking: false,
  onSquareClick: vi.fn(),
};

describe('Board', () => {
  it('renders 64 squares (8x8 grid)', () => {
    render(<Board {...defaultProps} />);
    const squares = screen.getAllByRole('button');
    expect(squares).toHaveLength(64);
  });

  it('renders with grid role', () => {
    render(<Board {...defaultProps} />);
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('has accessible aria-label', () => {
    render(<Board {...defaultProps} />);
    expect(screen.getByLabelText('Chess board')).toBeInTheDocument();
  });

  it('alternates light and dark squares', () => {
    render(<Board {...defaultProps} />);
    const squares = screen.getAllByRole('button');

    // a8 (ri=0, fi=0 → 0+0=0, even → light)
    expect(squares[0].className).toContain('square--light');
    // b8 (ri=0, fi=1 → 0+1=1, odd → dark)
    expect(squares[1].className).toContain('square--dark');
  });

  it('renders consistent number of light squares (32)', () => {
    render(<Board {...defaultProps} />);
    const squares = screen.getAllByRole('button');
    const lightCount = squares.filter((s) =>
      s.className.includes('square--light'),
    ).length;
    expect(lightCount).toBe(32);
  });

  it('renders consistent number of dark squares (32)', () => {
    render(<Board {...defaultProps} />);
    const squares = screen.getAllByRole('button');
    const darkCount = squares.filter((s) =>
      s.className.includes('square--dark'),
    ).length;
    expect(darkCount).toBe(32);
  });

  // Render Board with pieces
  it('renders pieces from FEN string', () => {
    render(<Board {...defaultProps} />);
    // Initial position: White has 16 pieces, Black has 16 pieces
    const whitePieces = screen.getAllByLabelText(/white/);
    const blackPieces = screen.getAllByLabelText(/black/);
    expect(whitePieces).toHaveLength(16);
    expect(blackPieces).toHaveLength(16);
  });

  // Render empty board
  it('renders empty board with no pieces', () => {
    render(<Board {...defaultProps} fen={EMPTY_FEN} />);
    const whitePieces = screen.queryAllByLabelText(/white/);
    const blackPieces = screen.queryAllByLabelText(/black/);
    expect(whitePieces).toHaveLength(0);
    expect(blackPieces).toHaveLength(0);
  });

  // Render row and column labels
  it('renders row labels (1-8)', () => {
    render(<Board {...defaultProps} />);
    for (let i = 1; i <= 8; i++) {
      expect(screen.getByText(String(i))).toBeInTheDocument();
    }
  });

  it('renders column labels (a-h)', () => {
    render(<Board {...defaultProps} />);
    for (const file of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      expect(screen.getByText(file)).toBeInTheDocument();
    }
  });

  it('calls onSquareClick with correct square', () => {
    const onSquareClick = vi.fn();
    render(<Board {...defaultProps} onSquareClick={onSquareClick} />);
    const squares = screen.getAllByRole('button');
    // Click a1 (last row, first file)
    const a1Index = 7 * 8 + 0; // row index 7 (rank 1), file index 0 (a)
    squares[a1Index].click();
    expect(onSquareClick).toHaveBeenCalledWith('a1');
  });

  // Highlight selected square
  it('highlights selected square', () => {
    render(<Board {...defaultProps} selectedSquare="e4" />);
    const squares = screen.getAllByRole('button');
    const e4Index = 4 * 8 + 4;
    expect(squares[e4Index].className).toContain('square--selected');
  });

  // Mark legal moves
  it('marks legal move squares', () => {
    render(
      <Board
        {...defaultProps}
        fen={EMPTY_FEN}
        legalMoves={['e4', 'd4']}
        selectedSquare="e2"
      />,
    );
    const squares = screen.getAllByRole('button');
    expect(squares[36].className).toContain('square--legal-move');
    expect(squares[35].className).toContain('square--legal-move');
  });

  // UCI last move highlight (both from and to should be highlighted)
  it('highlights both from and to squares for UCI lastMove', () => {
    render(<Board {...defaultProps} lastMove="e2e4" fen={EMPTY_FEN} />);
    const squares = screen.getAllByRole('button');
    // e2: rank 2 = row index 6, file e = idx 4 → 6*8+4 = 52
    const e2Index = 6 * 8 + 4;
    // e4: rank 4 = row index 4, file e = idx 4 → 4*8+4 = 36
    const e4Index = 4 * 8 + 4;
    expect(squares[e2Index].className).toContain('square--last-move');
    expect(squares[e4Index].className).toContain('square--last-move');
  });

  // Check highlight
  it('highlights check square', () => {
    render(<Board {...defaultProps} checkSquare="e1" fen={EMPTY_FEN} />);
    const squares = screen.getAllByRole('button');
    // e1: rank 1 = row index 7, file e = idx 4 → 7*8+4 = 60
    const e1Index = 7 * 8 + 4;
    expect(squares[e1Index].className).toContain('square--check');
  });

  // Edge case: no highlight when selectedSquare is null
  it('does not highlight any square when selectedSquare is null', () => {
    render(<Board {...defaultProps} selectedSquare={null} fen={EMPTY_FEN} />);
    const squares = screen.getAllByRole('button');
    const selected = squares.filter((s) =>
      s.className.includes('square--selected'),
    );
    expect(selected).toHaveLength(0);
  });

  // Edge case: legalMoves is empty array
  it('does not mark legal moves when array is empty', () => {
    render(<Board {...defaultProps} legalMoves={[]} fen={EMPTY_FEN} />);
    const squares = screen.getAllByRole('button');
    const legalMoves = squares.filter((s) =>
      s.className.includes('square--legal-move'),
    );
    expect(legalMoves).toHaveLength(0);
  });

  // Edge case: no highlight when lastMove is null
  it('does not highlight last move when lastMove is null', () => {
    render(<Board {...defaultProps} lastMove={null} fen={EMPTY_FEN} />);
    const squares = screen.getAllByRole('button');
    const lastMoves = squares.filter((s) =>
      s.className.includes('square--last-move'),
    );
    expect(lastMoves).toHaveLength(0);
  });

  // Edge case: no check highlight when checkSquare is null
  it('does not highlight check when checkSquare is null', () => {
    render(<Board {...defaultProps} checkSquare={null} fen={EMPTY_FEN} />);
    const squares = screen.getAllByRole('button');
    const checkSquares = squares.filter((s) =>
      s.className.includes('square--check'),
    );
    expect(checkSquares).toHaveLength(0);
  });
});

describe('parseUci', () => {
  it('parses valid UCI string', () => {
    expect(parseUci('e2e4')).toEqual({ from: 'e2', to: 'e4' });
  });

  it('parses promotion UCI string', () => {
    expect(parseUci('e7e8q')).toEqual({ from: 'e7', to: 'e8' });
  });

  // Edge case: null input
  it('returns null for null input', () => {
    expect(parseUci(null)).toBeNull();
  });

  // Edge case: empty string
  it('returns null for empty string', () => {
    expect(parseUci('')).toBeNull();
  });

  // Edge case: string too short
  it('returns null for short string', () => {
    expect(parseUci('e2')).toBeNull();
  });
});

describe('parseFen', () => {
  // Normal case: initial position
  it('parses initial position correctly', () => {
    const result = parseFen(INITIAL_FEN);
    expect(result).toHaveLength(8);
    result.forEach((row) => expect(row).toHaveLength(8));

    // Row 0 (rank 8): Black pieces
    expect(result[0]).toEqual([
      'r', 'n', 'b', 'q', 'k', 'b', 'n', 'r',
    ]);
    // Row 1 (rank 7): Black pawns
    expect(result[1]).toEqual([
      'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p',
    ]);
    // Rows 2-5: empty
    for (let i = 2; i <= 5; i++) {
      expect(result[i]).toEqual([null, null, null, null, null, null, null, null]);
    }
    // Row 6 (rank 2): White pawns
    expect(result[6]).toEqual([
      'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P',
    ]);
    // Row 7 (rank 1): White pieces
    expect(result[7]).toEqual([
      'R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R',
    ]);
  });

  // Normal case: empty board
  it('parses empty board correctly', () => {
    const result = parseFen(EMPTY_FEN);
    expect(result).toHaveLength(8);
    result.forEach((row) => {
      expect(row).toHaveLength(8);
      row.forEach((cell) => expect(cell).toBeNull());
    });
  });

  // Edge case: single rank
  it('parses a single rank', () => {
    const result = parseFen('8/8/8/8/8/8/8/8 w - - 0 1');
    expect(result).toHaveLength(8);
    result.forEach((row) => {
      expect(row).toHaveLength(8);
      row.forEach((cell) => expect(cell).toBeNull());
    });
  });

  // Edge case: all pieces in one rank
  it('parses rank with all pieces', () => {
    const result = parseFen('KQkq w - - 0 1');
    // KQkq is 4 characters, expands to 4 columns
    expect(result[0]).toEqual(['K', 'Q', 'k', 'q']);
  });

  // Edge case: mixed digits and letters
  it('parses mixed digits and letters', () => {
    const result = parseFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(result[0]).toEqual([null, null, null, null, 'k', null, null, null]);
    expect(result[7]).toEqual([null, null, null, null, 'K', null, null, null]);
  });

  // Edge case: FEN without space delimiters
  it('handles FEN without any spaces', () => {
    const result = parseFen('8/8/8/8/8/8/8/8');
    expect(result).toHaveLength(8);
    result.forEach((row) => {
      row.forEach((cell) => expect(cell).toBeNull());
    });
  });

  // Edge case: empty string
  it('returns empty structure for empty string', () => {
    const result = parseFen('');
    expect(result).toEqual([[]]);
  });
});
