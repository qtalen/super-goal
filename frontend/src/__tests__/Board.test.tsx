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

  // 渲染有棋子的 Board
  it('renders pieces from FEN string', () => {
    render(<Board {...defaultProps} />);
    // 初始局面：白方有 16 颗棋子，黑方有 16 颗棋子
    const whitePieces = screen.getAllByLabelText(/white/);
    const blackPieces = screen.getAllByLabelText(/black/);
    expect(whitePieces).toHaveLength(16);
    expect(blackPieces).toHaveLength(16);
  });

  // 渲染空棋盘
  it('renders empty board with no pieces', () => {
    render(<Board {...defaultProps} fen={EMPTY_FEN} />);
    const whitePieces = screen.queryAllByLabelText(/white/);
    const blackPieces = screen.queryAllByLabelText(/black/);
    expect(whitePieces).toHaveLength(0);
    expect(blackPieces).toHaveLength(0);
  });

  // 渲染行列坐标标注
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
    // 点击 a1（最后一个格子的行，第一个文件）
    const a1Index = 7 * 8 + 0; // row index 7 (rank 1), file index 0 (a)
    squares[a1Index].click();
    expect(onSquareClick).toHaveBeenCalledWith('a1');
  });

  // 选中格子高亮
  it('highlights selected square', () => {
    render(<Board {...defaultProps} selectedSquare="e4" />);
    const squares = screen.getAllByRole('button');
    const e4Index = 4 * 8 + 4;
    expect(squares[e4Index].className).toContain('square--selected');
  });

  // 合法走法标记
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

  // UCI 上一步走法高亮（from 和 to 都应高亮）
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

  // 将军高亮
  it('highlights check square', () => {
    render(<Board {...defaultProps} checkSquare="e1" fen={EMPTY_FEN} />);
    const squares = screen.getAllByRole('button');
    // e1: rank 1 = row index 7, file e = idx 4 → 7*8+4 = 60
    const e1Index = 7 * 8 + 4;
    expect(squares[e1Index].className).toContain('square--check');
  });

  // 边界情况：selectedSquare 为 null 时没有高亮
  it('does not highlight any square when selectedSquare is null', () => {
    render(<Board {...defaultProps} selectedSquare={null} fen={EMPTY_FEN} />);
    const squares = screen.getAllByRole('button');
    const selected = squares.filter((s) =>
      s.className.includes('square--selected'),
    );
    expect(selected).toHaveLength(0);
  });

  // 边界情况：legalMoves 为空数组
  it('does not mark legal moves when array is empty', () => {
    render(<Board {...defaultProps} legalMoves={[]} fen={EMPTY_FEN} />);
    const squares = screen.getAllByRole('button');
    const legalMoves = squares.filter((s) =>
      s.className.includes('square--legal-move'),
    );
    expect(legalMoves).toHaveLength(0);
  });

  // 边界情况：lastMove 为 null 时没有高亮
  it('does not highlight last move when lastMove is null', () => {
    render(<Board {...defaultProps} lastMove={null} fen={EMPTY_FEN} />);
    const squares = screen.getAllByRole('button');
    const lastMoves = squares.filter((s) =>
      s.className.includes('square--last-move'),
    );
    expect(lastMoves).toHaveLength(0);
  });

  // 边界情况：checkSquare 为 null 时没有将军高亮
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

  // 边缘情况：null 输入
  it('returns null for null input', () => {
    expect(parseUci(null)).toBeNull();
  });

  // 边缘情况：空字符串
  it('returns null for empty string', () => {
    expect(parseUci('')).toBeNull();
  });

  // 边缘情况：太短的字符串
  it('returns null for short string', () => {
    expect(parseUci('e2')).toBeNull();
  });
});

describe('parseFen', () => {
  // 正常情况：初始局面
  it('parses initial position correctly', () => {
    const result = parseFen(INITIAL_FEN);
    expect(result).toHaveLength(8);
    result.forEach((row) => expect(row).toHaveLength(8));

    // 第一行（第8排）：黑方棋子
    expect(result[0]).toEqual([
      'r', 'n', 'b', 'q', 'k', 'b', 'n', 'r',
    ]);
    // 第二行（第7排）：黑方兵
    expect(result[1]).toEqual([
      'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p',
    ]);
    // 中间四行：空
    for (let i = 2; i <= 5; i++) {
      expect(result[i]).toEqual([null, null, null, null, null, null, null, null]);
    }
    // 第七行（第2排）：白方兵
    expect(result[6]).toEqual([
      'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P',
    ]);
    // 第八行（第1排）：白方棋子
    expect(result[7]).toEqual([
      'R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R',
    ]);
  });

  // 正常情况：空棋盘
  it('parses empty board correctly', () => {
    const result = parseFen(EMPTY_FEN);
    expect(result).toHaveLength(8);
    result.forEach((row) => {
      expect(row).toHaveLength(8);
      row.forEach((cell) => expect(cell).toBeNull());
    });
  });

  // 边缘情况：仅有一行
  it('parses a single rank', () => {
    const result = parseFen('8/8/8/8/8/8/8/8 w - - 0 1');
    expect(result).toHaveLength(8);
    result.forEach((row) => {
      expect(row).toHaveLength(8);
      row.forEach((cell) => expect(cell).toBeNull());
    });
  });

  // 边界情况：所有棋子在一行
  it('parses rank with all pieces', () => {
    const result = parseFen('KQkq w - - 0 1');
    // KQkq 是 4 个字符，扩展为 4 列
    expect(result[0]).toEqual(['K', 'Q', 'k', 'q']);
  });

  // 边界情况：混合数字和字母
  it('parses mixed digits and letters', () => {
    const result = parseFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(result[0]).toEqual([null, null, null, null, 'k', null, null, null]);
    expect(result[7]).toEqual([null, null, null, null, 'K', null, null, null]);
  });

  // 异常情况：FEN 没有空格分割
  it('handles FEN without any spaces', () => {
    const result = parseFen('8/8/8/8/8/8/8/8');
    expect(result).toHaveLength(8);
    result.forEach((row) => {
      row.forEach((cell) => expect(cell).toBeNull());
    });
  });

  // 异常情况：空字符串
  it('returns empty structure for empty string', () => {
    const result = parseFen('');
    expect(result).toEqual([[]]);
  });
});
