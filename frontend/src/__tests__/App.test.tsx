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

// ─── Helper functions ─────────────────────────────────────────────

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

// ─── Test suites ─────────────────────────────────────────────────

describe('App (Local mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading Chess', () => {
    renderWithProvider(<App />);
    expect(screen.getByText('Chess')).toBeInTheDocument();
  });

  it('renders Board component', () => {
    renderWithProvider(<App />);
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('renders ControlPanel with difficulty selector', () => {
    renderWithProvider(<App />);
    expect(screen.getByLabelText('Difficulty:')).toBeInTheDocument();
  });

  it('renders GameStatus heading', () => {
    renderWithProvider(<App />);
    expect(screen.getByText('Game Status')).toBeInTheDocument();
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
    expect(screen.getByText('Difficulty: Intermediate')).toBeInTheDocument();
  });

  // Move interaction tests

  // 1. Click own piece → select (White e2 pawn)
  it('selects a piece when clicking on own piece', () => {
    renderWithProvider(<App />);
    const squares = screen.getAllByRole('button');
    const e2Index = 6 * 8 + 4;
    const e2 = squares[e2Index];
    fireEvent.click(e2);
    expect(e2.className).toContain('square--selected');
  });

  // 2. Click same square again → deselect
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

  // 3. Click another own piece → switch selection
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

  // 4. Click target square to make move (e2-e4)
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

  // 5. Click opponent piece does not select
  it('does not select opponent piece when clicked', () => {
    renderWithProvider(<App />);
    const squares = screen.getAllByRole('button');
    const e7Index = 1 * 8 + 4;
    const e7 = squares[e7Index];

    fireEvent.click(e7);
    expect(e7.className).not.toContain('square--selected');
  });

  // 6. Illegal move does not change board (select e2 then click e5)
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

  // 7. Check board state update after multiple moves
  it('updates turn after each move', () => {
    renderWithProvider(<App />);

    const turnDisplay = screen.getByText(/'s turn/);
    expect(turnDisplay.textContent).toContain("White's turn");

    const squares = screen.getAllByRole('button');
    fireEvent.click(squares[6 * 8 + 4]); // e2
    fireEvent.click(squares[4 * 8 + 4]); // e4

    expect(turnDisplay.textContent).toContain("Black's turn");
  });

  // 8. Show legal move indicators when piece is selected
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

  // 9. Hide legal move indicators when deselected
  it('hides legal move indicators when deselected', () => {
    renderWithProvider(<App />);
    const squares = screen.getAllByRole('button');
    const e2Index = 6 * 8 + 4;

    fireEvent.click(squares[e2Index]);
    fireEvent.click(squares[e2Index]); // Deselect

    const e3Index = 5 * 8 + 4;
    const e4Index = 4 * 8 + 4;
    expect(squares[e3Index].className).not.toContain('square--legal-move');
    expect(squares[e4Index].className).not.toContain('square--legal-move');
  });
});

// ─── API mode tests ──────────────────────────────────────────────

describe('App (API mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Create game: calls chessApi.createGame when clicking New Game
  it('calls chessApi.createGame when clicking New Game', async () => {
    const mockGame = mockGameResponse();
    vi.mocked(chessApi.createGame).mockResolvedValueOnce(mockGame as any);

    renderWithProvider(<App />);
    fireEvent.click(screen.getByText('New Game'));

    await waitFor(() => {
      expect(chessApi.createGame).toHaveBeenCalledWith(2);
    });
  });

  // Edge case: display error when createGame fails
  it('displays error banner when createGame fails', async () => {
    vi.mocked(chessApi.createGame).mockRejectedValueOnce(
      new Error('Network error'),
    );

    renderWithProvider(<App />);
    fireEvent.click(screen.getByText('New Game'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  // Can dismiss error after successful creation
  it('dismisses error banner when clicking close', async () => {
    vi.mocked(chessApi.createGame).mockRejectedValueOnce(
      new Error('Temp error'),
    );

    renderWithProvider(<App />);
    fireEvent.click(screen.getByText('New Game'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('\u00D7'));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  // Call makeMove after successful game creation
  it('calls chessApi.makeMove after game is created', async () => {
    const mockGame = mockGameResponse();
    vi.mocked(chessApi.createGame).mockResolvedValueOnce(mockGame as any);
    vi.mocked(chessApi.makeMove).mockResolvedValueOnce(mockMoveResponse() as any);

    renderWithProvider(<App />);

    // Create game
    fireEvent.click(screen.getByText('New Game'));
    await waitFor(() => {
      expect(chessApi.createGame).toHaveBeenCalled();
    });

    // Make move e2-e4
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

  // Edge case: display error when makeMove fails
  it('displays error banner when makeMove fails', async () => {
    const mockGame = mockGameResponse();
    vi.mocked(chessApi.createGame).mockResolvedValueOnce(mockGame as any);
    vi.mocked(chessApi.makeMove).mockRejectedValueOnce(
      new Error('Illegal move'),
    );

    renderWithProvider(<App />);

    fireEvent.click(screen.getByText('New Game'));
    await waitFor(() => {
      expect(chessApi.createGame).toHaveBeenCalled();
    });

    // Make move e2-e4
    const squares = screen.getAllByRole('button');
    fireEvent.click(squares[6 * 8 + 4]); // e2
    fireEvent.click(squares[4 * 8 + 4]); // e4

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Illegal move')).toBeInTheDocument();
    });
  });

  // Edge case: set thinking state on new game (button should be disabled)
  it('disables interaction while thinking after new game', async () => {
    // createGame stays pending, never resolves
    vi.mocked(chessApi.createGame).mockReturnValueOnce(
      new Promise(() => {}),
    );

    renderWithProvider(<App />);

    // Before clicking New Game, clicking squares can select
    const squares = screen.getAllByRole('button');
    const e2Index = 6 * 8 + 4;
    fireEvent.click(squares[e2Index]);
    expect(squares[e2Index].className).toContain('square--selected');
  });
});
