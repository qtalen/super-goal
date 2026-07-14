import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Chess, type Square } from 'chess.js';
import { chessApi } from './api/chessApi';
import { useGame } from './context/GameContext';
import Board from './components/Board';
import ControlPanel from './components/ControlPanel';
import GameStatus from './components/GameStatus';
import PromotionDialog from './components/PromotionDialog';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Derive game status from chess.js instance
 */
function deriveStatus(chess: Chess): string {
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isDraw()) return 'draw';
  if (chess.isCheck()) return 'check';
  return 'playing';
}

/**
 * Find the king square of the current player
 */
function findKingSquare(chess: Chess): Square | null {
  const turn = chess.turn();
  const board = chess.board();
  for (const row of board) {
    for (const cell of row) {
      if (cell && cell.type === 'k' && cell.color === turn) {
        return cell.square;
      }
    }
  }
  return null;
}

/**
 * Derive turn from FEN
 */
function fenTurn(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

function App() {
  const { state, dispatch } = useGame();

  // Promotion dialog state
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);

  // Derive check square from current position
  const checkSquare = useMemo(() => {
    if (state.status !== 'check') return null;
    try {
      const chess = new Chess(state.fen);
      return findKingSquare(chess);
    } catch {
      return null;
    }
  }, [state.fen, state.status]);

  // Derive legal move targets from selected square (for highlighting)
  const displayLegalMoves = useMemo(() => {
    if (!state.selectedSquare) return [];
    try {
      const chess = new Chess(state.fen);
      const moves = chess.moves({ square: state.selectedSquare as Square, verbose: true });
      return moves.map((m) => m.to);
    } catch {
      return [];
    }
  }, [state.fen, state.selectedSquare]);

  // Auto-create a new game on page load (enter API mode, activate AI)
  // Skip in test environment (chessApi is mocked in vitest, auto-creation is meaningless)
  const autoStartRef = useRef(false);
  useEffect(() => {
    if (import.meta.env.MODE === 'test') return; // Skip in test environment (mock has no backend)
    if (!autoStartRef.current) {
      autoStartRef.current = true;
      dispatch({ type: 'SET_THINKING', payload: true });
      chessApi.createGame(state.difficulty)
        .then((response) => dispatch({ type: 'CREATE_GAME', payload: response }))
        .catch((err) => dispatch({ type: 'SET_ERROR', payload: err.message }));
    }
  }, []);

  /**
   * Execute a move (local mode uses chess.js, API mode calls backend)
   */
  const executeMove = useCallback(
    (from: Square, to: Square, promotion?: string) => {
      if (state.gameId) {
        // ── API mode ──────────────────────────────────────────────
        // 1. Immediately show player's move (local move, don't update history)
        try {
          const chess = new Chess(state.fen);
          chess.move({ from, to, promotion } as { from: Square; to: Square; promotion?: string });
          const uci = `${from}${to}`;

          dispatch({
            type: 'VISUAL_MOVE',
            payload: {
              fen: chess.fen(),
              turn: chess.turn(),
              status: deriveStatus(chess),
              lastMove: uci,
            },
          });
        } catch {
          dispatch({ type: 'SELECT_SQUARE', payload: null });
          setPendingPromotion(null);
          return;
        }

        // 2. Request AI response asynchronously
        setPendingPromotion(null);
        chessApi
          .makeMove(state.gameId, from, to, promotion)
          .then((response) => {
            dispatch({ type: 'MAKE_MOVE', payload: response });
          })
          .catch((err) => {
            dispatch({ type: 'SET_ERROR', payload: err.message });
          });
      } else {
        // ── Local mode ──────────────────────────────────────────────
        try {
          const chess = new Chess(state.fen);
          chess.move({ from, to, promotion } as { from: Square; to: Square; promotion?: string });
          const uci = `${from}${to}`;

          dispatch({
            type: 'MAKE_MOVE',
            payload: {
              fen: chess.fen(),
              turn: chess.turn(),
              status: deriveStatus(chess),
              legalMoves: [],
              lastMove: uci,
              difficulty: state.difficulty,
              gameId: null,
            },
          });
          setPendingPromotion(null);
        } catch {
          dispatch({ type: 'SELECT_SQUARE', payload: null });
          setPendingPromotion(null);
        }
      }
    },
    [state.gameId, state.fen, state.difficulty, dispatch],
  );

  /**
   * Handle square click
   */
  const handleSquareClick = useCallback(
    (square: string) => {
      if (state.isThinking || pendingPromotion) return;

      const sq = square as Square;
      const chess = new Chess(state.fen);
      const piece = chess.get(sq);

      // Case 1: No selection + click own piece → select
      if (!state.selectedSquare && piece && piece.color === state.turn) {
        dispatch({ type: 'SELECT_SQUARE', payload: square });
        return;
      }

      // Case 2: Has selection + click same square → deselect
      if (state.selectedSquare === square) {
        dispatch({ type: 'SELECT_SQUARE', payload: null });
        return;
      }

      // Case 3: Has selection + click another own piece → switch selection
      if (state.selectedSquare && piece && piece.color === state.turn) {
        dispatch({ type: 'SELECT_SQUARE', payload: square });
        return;
      }

      // Case 4: Has selection + click target square → attempt move
      if (state.selectedSquare) {
        const from = state.selectedSquare as Square;
        const to = sq;

        // Check promotion condition: pawn reaches rank 1 or rank 8
        const pieceType = chess.get(from);
        if (pieceType && pieceType.type === 'p') {
          const rank = square.charAt(1);
          if (rank === '8' || rank === '1') {
            setPendingPromotion({ from, to });
            return;
          }
        }

        executeMove(from, to);
      }
    },
    [state.fen, state.selectedSquare, state.turn, state.isThinking, pendingPromotion, executeMove, dispatch],
  );

  /**
   * Handle promotion selection
   */
  const handlePromotion = useCallback(
    (piece: 'q' | 'r' | 'b' | 'n') => {
      if (pendingPromotion) {
        executeMove(pendingPromotion.from, pendingPromotion.to, piece);
      }
    },
    [pendingPromotion, executeMove],
  );

  /**
   * Cancel promotion
   */
  const cancelPromotion = useCallback(() => {
    setPendingPromotion(null);
    dispatch({ type: 'SELECT_SQUARE', payload: null });
  }, [dispatch]);

  /**
   * New game: create via API
   */
  const handleNewGame = useCallback(
    (difficulty: 1 | 2 | 3) => {
      dispatch({ type: 'SET_THINKING', payload: true });
      chessApi
        .createGame(difficulty)
        .then((response) => {
          dispatch({ type: 'CREATE_GAME', payload: response });
        })
        .catch((err) => {
          dispatch({ type: 'SET_ERROR', payload: err.message });
        });
    },
    [dispatch],
  );

  /**
   * Undo: rewind history by two steps
   */
  const handleUndo = useCallback(() => {
    if (state.history.length < 2) return;

    const newHistory = state.history.slice(0, -2);
    const prevFen = newHistory.length > 0 ? newHistory[newHistory.length - 1] : INITIAL_FEN;
    const prevTurn = fenTurn(prevFen);

    dispatch({
      type: 'UNDO_MOVE',
      payload: {
        fen: prevFen,
        turn: prevTurn,
        lastMove: null,
        legalMoves: [],
        status: 'playing',
        difficulty: state.difficulty,
        gameId: state.gameId,
      },
    });
    setPendingPromotion(null);
  }, [state.history, state.difficulty, state.gameId, dispatch]);

  const canUndo = state.history.length >= 2 && !state.isThinking;

  return (
    <div className="app">
      <h1>Chess</h1>
      <div className="app-layout">
        <div className="app-board-section">
          <Board
            fen={state.fen}
            selectedSquare={state.selectedSquare}
            legalMoves={displayLegalMoves}
            lastMove={state.lastMove}
            isThinking={state.isThinking}
            onSquareClick={handleSquareClick}
            checkSquare={checkSquare}
          />
        </div>
        <div className="app-sidebar">
          <ControlPanel
            difficulty={state.difficulty}
            onNewGame={handleNewGame}
            onUndo={handleUndo}
            canUndo={canUndo}
            isThinking={state.isThinking}
          />
          <GameStatus turn={state.turn} status={state.status} difficulty={state.difficulty} />
          {state.error && (
            <div className="error-banner" role="alert">
              <span>{state.error}</span>
              <button
                className="error-banner__close"
                type="button"
                onClick={() => dispatch({ type: 'SET_ERROR', payload: null })}
              >
                &times;
              </button>
            </div>
          )}
        </div>
      </div>

      {pendingPromotion && (
        <PromotionDialog
          color={state.turn}
          onSelect={handlePromotion}
          onCancel={cancelPromotion}
        />
      )}
    </div>
  );
}

export default App;
