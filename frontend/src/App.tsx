import { useState, useCallback, useMemo } from 'react';
import { Chess, type Square } from 'chess.js';
import { chessApi } from './api/chessApi';
import { useGame } from './context/GameContext';
import Board from './components/Board';
import ControlPanel from './components/ControlPanel';
import GameStatus from './components/GameStatus';
import PromotionDialog from './components/PromotionDialog';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * 根据 chess.js 实例推导游戏状态
 */
function deriveStatus(chess: Chess): string {
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isDraw()) return 'draw';
  if (chess.isCheck()) return 'check';
  return 'playing';
}

/**
 * 查找当前走子方的王所在格子
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
 * 从 FEN 推导回合
 */
function fenTurn(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

function App() {
  const { state, dispatch } = useGame();

  // 升变对话框状态
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);

  // 根据当前棋局派生被将军格子
  const checkSquare = useMemo(() => {
    if (state.status !== 'check') return null;
    try {
      const chess = new Chess(state.fen);
      return findKingSquare(chess);
    } catch {
      return null;
    }
  }, [state.fen, state.status]);

  // 根据当前选中格派生合法走法目标（用于高亮显示）
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

  /**
   * 执行走子（本地模式走 chess.js，API 模式调用后端）
   */
  const executeMove = useCallback(
    (from: Square, to: Square, promotion?: string) => {
      if (state.gameId) {
        // ── API 模式 ──────────────────────────────────────────────
        dispatch({ type: 'SET_THINKING', payload: true });
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
        // ── 本地模式 ──────────────────────────────────────────────
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
          // 非法走子：取消选中
          dispatch({ type: 'SELECT_SQUARE', payload: null });
          setPendingPromotion(null);
        }
      }
    },
    [state.gameId, state.fen, state.difficulty, dispatch],
  );

  /**
   * 处理格子点击
   */
  const handleSquareClick = useCallback(
    (square: string) => {
      if (state.isThinking || pendingPromotion) return;

      const sq = square as Square;
      const chess = new Chess(state.fen);
      const piece = chess.get(sq);

      // Case 1: 无选中 + 点击己方棋子 → 选中
      if (!state.selectedSquare && piece && piece.color === state.turn) {
        dispatch({ type: 'SELECT_SQUARE', payload: square });
        return;
      }

      // Case 2: 有选中 + 点击同一格子 → 取消选中
      if (state.selectedSquare === square) {
        dispatch({ type: 'SELECT_SQUARE', payload: null });
        return;
      }

      // Case 3: 有选中 + 点击另一个己方棋子 → 切换选中
      if (state.selectedSquare && piece && piece.color === state.turn) {
        dispatch({ type: 'SELECT_SQUARE', payload: square });
        return;
      }

      // Case 4: 有选中 + 点击目标格子 → 尝试走子
      if (state.selectedSquare) {
        const from = state.selectedSquare as Square;
        const to = sq;

        // 检测升变条件：兵到达第 1 或第 8 横排
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
   * 处理升变选择
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
   * 取消升变
   */
  const cancelPromotion = useCallback(() => {
    setPendingPromotion(null);
    dispatch({ type: 'SELECT_SQUARE', payload: null });
  }, [dispatch]);

  /**
   * 新游戏：通过 API 创建
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
   * 悔棋：从 history 回溯两步
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
      <h1>国际象棋</h1>
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
