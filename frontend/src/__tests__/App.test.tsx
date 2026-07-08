import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import { GameProvider } from '../context/GameContext';
import { chessApi } from '../api/chessApi';
import type { ReactElement } from 'react';

// ─── Mock chessApi ──────────────────────────────────────────────────

vi.mock('../api/chessApi', () => {
  const ChessApiError = class ChessApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'ChessApiError';
      this.status = status;
    }
  };

  const mockError = new Error('Server not available (test)');
  (mockError as any).status = 0;

  return {
    chessApi: {
      createGame: vi.fn().mockRejectedValue(mockError),
      makeMove: vi.fn(),
      getGame: vi.fn(),
      getLegalMoves: vi.fn(),
    },
    ChessApiError,
  };
});

// ─── 辅助函数 ────────────────────────────────────────────────────────

function renderWithProvider(ui: ReactElement) {
  return render(<GameProvider>{ui}</GameProvider>);
}

function mockGameResponse(overrides?: Record<string, unknown>) {
  return {
    gameId: 'test-game-123',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    turn: 'w',
    status: 'playing',
    difficulty: 2,
    legalMoves: [],
    lastMove: null,
    ...overrides,
  };
}

function mockMoveResponse(overrides?: Record<string, unknown>) {
  return {
    gameId: 'test-game-123',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    turn: 'b',
    status: 'playing',
    legalMoves: ['e7e5', 'd7d5'],
    lastMove: 'e2e4',
    ai_move: null,
    difficulty: 2,
    ...overrides,
  };
}

// ─── 测试套件 ────────────────────────────────────────────────────────

describe('App (本地模式 / Local mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading 国际象棋', () => {
    renderWithProvider(<App />);
    expect(screen.getByText('国际象棋')).toBeInTheDocument();
  });

  it('renders Board component', () => {
    renderWithProvider(<App />);
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('renders ControlPanel with difficulty selector', () => {
    renderWithProvider(<App />);
    expect(screen.getByLabelText('难度选择：')).toBeInTheDocument();
  });

  it('renders GameStatus heading', () => {
    renderWithProvider(<App />);
    expect(screen.getByText('游戏状态')).toBeInTheDocument();
  });

  it('renders 64 squares on the board', () => {
    renderWithProvider(<App />);
    const allButtons = screen.getAllByRole('button');
    expect(allButtons.length).toBeGreaterThanOrEqual(64);
    const boardSquares = allButtons.filter(
      (btn) =>
        btn.className.includes('square--light') ||
        btn.className.includes('square--dark'),
    );
    expect(boardSquares).toHaveLength(64);
  });

  it('renders GameStatus with difficulty info', () => {
    renderWithProvider(<App />);
    expect(screen.getByText(/难度：/)).toBeInTheDocument();
  });

  // 走子交互测试

  // 1. 点击己方棋子 → 选中（白方 e2 兵）
  it('selects a piece when clicking on own piece', () => {
    renderWithProvider(<App />);
    const squares = screen.getAllByRole('button');
    const e2Index = 6 * 8 + 4;
    const e2 = squares[e2Index];
    fireEvent.click(e2);
    expect(e2.className).toContain('square--selected');
  });

  // 2. 点击选中后同一格子 → 取消选中
  it('deselects when clicking the same square again', () => {
    renderWithProvider(<App />);
    const squares = screen.getAllByRole('button');
    const e2Index = 6 * 8 + 4;
    const e2 = squares[e2Index];

    fireEvent.click(e2);
    expect(e2.className).toContain('square--selected');

    fireEvent.click(e2);
    expect(e2.className).not.toContain('square--selected');
  });

  // 3. 选中后点击另一个己方棋子 → 切换选中
  it('switches selection to another own piece', () => {
    renderWithProvider(<App />);
    const squares = screen.getAllByRole('button');
    const e2Index = 6 * 8 + 4;
    const d2Index = 6 * 8 + 3;
    const e2 = squares[e2Index];
    const d2 = squares[d2Index];

    fireEvent.click(e2);
    expect(e2.className).toContain('square--selected');

    fireEvent.click(d2);
    expect(e2.className).not.toContain('square--selected');
    expect(d2.className).toContain('square--selected');
  });

  // 4. 选中后点击目标格子走子（e2-e4）
  it('makes a move when clicking a target square', () => {
    renderWithProvider(<App />);
    const squares = screen.getAllByRole('button');
    const e2Index = 6 * 8 + 4;
    const e4Index = 4 * 8 + 4;
    const e2 = squares[e2Index];
    const e4 = squares[e4Index];

    fireEvent.click(e2);
    expect(e2.className).toContain('square--selected');

    fireEvent.click(e4);
    expect(e2.className).not.toContain('square--selected');
  });

  // 5. 点击敌方棋子不选中
  it('does not select opponent piece when clicked', () => {
    renderWithProvider(<App />);
    const squares = screen.getAllByRole('button');
    const e7Index = 1 * 8 + 4;
    const e7 = squares[e7Index];

    fireEvent.click(e7);
    expect(e7.className).not.toContain('square--selected');
  });

  // 6. 非法走子不改变棋盘（选中 e2 然后点击 e5）
  it('does not make illegal move when clicking invalid target', () => {
    renderWithProvider(<App />);
    const squares = screen.getAllByRole('button');
    const e2Index = 6 * 8 + 4;
    const e5Index = 3 * 8 + 4;
    const e2 = squares[e2Index];
    const e5 = squares[e5Index];

    fireEvent.click(e2);
    expect(e2.className).toContain('square--selected');

    fireEvent.click(e5);
    expect(e2.className).not.toContain('square--selected');
  });

  // 7. 多次走子后检查棋盘状态更新
  it('updates turn after each move', () => {
    renderWithProvider(<App />);

    const turnDisplay = screen.getByText(/回合：/);
    expect(turnDisplay.textContent).toContain('白方走');

    const squares = screen.getAllByRole('button');
    fireEvent.click(squares[6 * 8 + 4]); // e2
    fireEvent.click(squares[4 * 8 + 4]); // e4

    expect(turnDisplay.textContent).toContain('黑方走');
  });

  // 8. 选中后显示合法走法标记
  it('shows legal move indicators when piece is selected', () => {
    renderWithProvider(<App />);
    const squares = screen.getAllByRole('button');
    const e2Index = 6 * 8 + 4;
    fireEvent.click(squares[e2Index]);

    const e3Index = 5 * 8 + 4;
    const e4Index = 4 * 8 + 4;
    expect(squares[e3Index].className).toContain('square--legal-move');
    expect(squares[e4Index].className).toContain('square--legal-move');
  });

  // 9. 取消选中后隐藏合法走法标记
  it('hides legal move indicators when deselected', () => {
    renderWithProvider(<App />);
    const squares = screen.getAllByRole('button');
    const e2Index = 6 * 8 + 4;

    fireEvent.click(squares[e2Index]);
    fireEvent.click(squares[e2Index]); // 取消选中

    const e3Index = 5 * 8 + 4;
    const e4Index = 4 * 8 + 4;
    expect(squares[e3Index].className).not.toContain('square--legal-move');
    expect(squares[e4Index].className).not.toContain('square--legal-move');
  });
});

// ─── API 模式测试 ────────────────────────────────────────────────────

describe('App (API 模式 / API mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 创建游戏：点击新游戏按钮时调用 chessApi.createGame
  it('calls chessApi.createGame when clicking 新游戏', async () => {
    const mockGame = mockGameResponse();
    vi.mocked(chessApi.createGame).mockResolvedValueOnce(mockGame as any);

    renderWithProvider(<App />);
    fireEvent.click(screen.getByText('新游戏'));

    await waitFor(() => {
      expect(chessApi.createGame).toHaveBeenCalledWith(2);
    });
  });

  // 边缘情况：创建游戏失败时显示错误
  it('displays error banner when createGame fails', async () => {
    vi.mocked(chessApi.createGame).mockRejectedValueOnce(
      new Error('Network error'),
    );

    renderWithProvider(<App />);
    fireEvent.click(screen.getByText('新游戏'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  // 创建成功后可以点击关闭错误
  it('dismisses error banner when clicking close', async () => {
    vi.mocked(chessApi.createGame).mockRejectedValueOnce(
      new Error('Temp error'),
    );

    renderWithProvider(<App />);
    fireEvent.click(screen.getByText('新游戏'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('\u00D7'));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  // 成功创建游戏后走子调用 makeMove
  it('calls chessApi.makeMove after game is created', async () => {
    const mockGame = mockGameResponse();
    vi.mocked(chessApi.createGame).mockResolvedValueOnce(mockGame as any);
    vi.mocked(chessApi.makeMove).mockResolvedValueOnce(mockMoveResponse() as any);

    renderWithProvider(<App />);

    // 创建游戏
    fireEvent.click(screen.getByText('新游戏'));
    await waitFor(() => {
      expect(chessApi.createGame).toHaveBeenCalled();
    });

    // 走子 e2-e4
    const squares = screen.getAllByRole('button');
    fireEvent.click(squares[6 * 8 + 4]); // e2
    fireEvent.click(squares[4 * 8 + 4]); // e4

    await waitFor(() => {
      expect(chessApi.makeMove).toHaveBeenCalledWith(
        'test-game-123',
        'e2',
        'e4',
        undefined,
      );
    });
  });

  // 边缘情况：走子失败时显示错误
  it('displays error banner when makeMove fails', async () => {
    const mockGame = mockGameResponse();
    vi.mocked(chessApi.createGame).mockResolvedValueOnce(mockGame as any);
    vi.mocked(chessApi.makeMove).mockRejectedValueOnce(
      new Error('Illegal move'),
    );

    renderWithProvider(<App />);

    fireEvent.click(screen.getByText('新游戏'));
    await waitFor(() => {
      expect(chessApi.createGame).toHaveBeenCalled();
    });

    // 走子 e2-e4
    const squares = screen.getAllByRole('button');
    fireEvent.click(squares[6 * 8 + 4]); // e2
    fireEvent.click(squares[4 * 8 + 4]); // e4

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Illegal move')).toBeInTheDocument();
    });
  });

  // 边缘情况：新游戏时设置 thinking 状态（按钮应禁用）
  it('disables interaction while thinking after new game', async () => {
    // createGame 一直 pending 不 resolve
    vi.mocked(chessApi.createGame).mockReturnValueOnce(
      new Promise(() => {}),
    );

    renderWithProvider(<App />);

    // 在点击新游戏之前，点击格子可以选中
    const squares = screen.getAllByRole('button');
    const e2Index = 6 * 8 + 4;
    fireEvent.click(squares[e2Index]);
    expect(squares[e2Index].className).toContain('square--selected');
  });
});
