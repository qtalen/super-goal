import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { GameState } from '../types';

/* ------------------------------------------------------------------ */
/*  Extended frontend state (includes UI-only fields)                  */
/* ------------------------------------------------------------------ */

export interface FrontendGameState extends GameState {
  history: string[];
  selectedSquare: string | null;
  boardOrientation: 'w';
  isThinking: boolean;
  error: string | null;
}

export type GameAction =
  | { type: 'CREATE_GAME'; payload: GameState }
  | { type: 'SELECT_SQUARE'; payload: string | null }
  | { type: 'MAKE_MOVE'; payload: Partial<GameState> }
  | { type: 'SET_THINKING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'UNDO_MOVE'; payload: Partial<GameState> }
  | { type: 'SET_DIFFICULTY'; payload: 1 | 2 | 3 }
  | { type: 'RESET' };

/* ------------------------------------------------------------------ */
/*  Initial state                                                      */
/* ------------------------------------------------------------------ */

export const initialState: FrontendGameState = {
  gameId: null,
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  turn: 'w',
  status: 'playing',
  difficulty: 2,
  legalMoves: [],
  lastMove: null,
  history: [],
  selectedSquare: null,
  boardOrientation: 'w',
  isThinking: false,
  error: null,
};

/* ------------------------------------------------------------------ */
/*  Reducer                                                            */
/* ------------------------------------------------------------------ */

export function gameReducer(
  state: FrontendGameState,
  action: GameAction,
): FrontendGameState {
  switch (action.type) {
    case 'CREATE_GAME':
      return {
        ...state,
        ...action.payload,
        history: [action.payload.fen],
        selectedSquare: null,
        isThinking: false,
        error: null,
      };

    case 'SELECT_SQUARE':
      return { ...state, selectedSquare: action.payload };

    case 'MAKE_MOVE': {
      const newFen = action.payload.fen ?? state.fen;
      return {
        ...state,
        ...action.payload,
        history: [...state.history, newFen],
        selectedSquare: null,
        isThinking: false,
        error: null,
      };
    }

    case 'SET_THINKING':
      return { ...state, isThinking: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isThinking: false };

    case 'UNDO_MOVE': {
      const newHistory = state.history.slice(0, -2);
      return {
        ...state,
        ...action.payload,
        history: newHistory,
        selectedSquare: null,
        isThinking: false,
        error: null,
      };
    }

    case 'SET_DIFFICULTY':
      return { ...state, difficulty: action.payload };

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/*  Context + Provider + Hook                                          */
/* ------------------------------------------------------------------ */

interface GameContextValue {
  state: FrontendGameState;
  dispatch: Dispatch<GameAction>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame(): GameContextValue {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}
