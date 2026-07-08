import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../context/GameContext';
import type { FrontendGameState, GameAction } from '../context/GameContext';

function createMockGameState(overrides?: Partial<FrontendGameState>): FrontendGameState {
  return {
    ...initialState,
    ...overrides,
  };
}

describe('gameReducer', () => {
  // ─── CREATE_GAME ───────────────────────────────────────────────────
  describe('CREATE_GAME', () => {
    it('sets game state and initializes history', () => {
      const payload = {
        gameId: 'abc-123',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        turn: 'b' as const,
        status: 'playing',
        difficulty: 2 as const,
        legalMoves: ['e7e5', 'd7d5'],
        lastMove: 'e2e4',
      };
      const state = gameReducer(initialState, { type: 'CREATE_GAME', payload });
      expect(state.gameId).toBe('abc-123');
      expect(state.fen).toBe(payload.fen);
      expect(state.turn).toBe('b');
      expect(state.history).toEqual([payload.fen]);
      expect(state.selectedSquare).toBeNull();
      expect(state.isThinking).toBe(false);
      expect(state.error).toBeNull();
    });

    it('overwrites previous game state', () => {
      const prev = createMockGameState({ gameId: 'old-game', fen: 'initial' });
      const state = gameReducer(prev, {
        type: 'CREATE_GAME',
        payload: {
          gameId: 'new-game',
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          turn: 'w',
          status: 'playing',
          difficulty: 2,
          legalMoves: [],
          lastMove: null,
        },
      });
      expect(state.gameId).toBe('new-game');
      expect(state.history).toHaveLength(1);
    });
  });

  // ─── SELECT_SQUARE ─────────────────────────────────────────────────
  describe('SELECT_SQUARE', () => {
    it('sets selectedSquare', () => {
      const state = gameReducer(initialState, { type: 'SELECT_SQUARE', payload: 'e2' });
      expect(state.selectedSquare).toBe('e2');
    });

    // 边缘情况：取消选中
    it('sets selectedSquare to null (deselect)', () => {
      const prev = createMockGameState({ selectedSquare: 'e2' });
      const state = gameReducer(prev, { type: 'SELECT_SQUARE', payload: null });
      expect(state.selectedSquare).toBeNull();
    });

    // 边缘情况：空字符串
    it('allows empty string as selection', () => {
      const state = gameReducer(initialState, { type: 'SELECT_SQUARE', payload: '' });
      expect(state.selectedSquare).toBe('');
    });
  });

  // ─── MAKE_MOVE ──────────────────────────────────────────────────────
  describe('MAKE_MOVE', () => {
    it('updates state and appends to history', () => {
      const prev = createMockGameState({ fen: 'fen-before' });
      const state = gameReducer(prev, {
        type: 'MAKE_MOVE',
        payload: {
          fen: 'fen-after',
          turn: 'b',
          lastMove: 'e2e4',
          legalMoves: ['e7e5'],
        },
      });
      expect(state.fen).toBe('fen-after');
      expect(state.turn).toBe('b');
      expect(state.lastMove).toBe('e2e4');
      expect(state.history).toEqual(['fen-after']);
      expect(state.selectedSquare).toBeNull();
      expect(state.isThinking).toBe(false);
      expect(state.error).toBeNull();
    });

    // 边缘情况：payload 中的 fen 为 undefined，应使用当前 state.fen
    it('uses current fen when payload fen is undefined', () => {
      const prev = createMockGameState({ fen: 'current-fen', history: ['old-fen'] });
      const state = gameReducer(prev, {
        type: 'MAKE_MOVE',
        payload: { turn: 'b', lastMove: null, legalMoves: [], status: 'playing', difficulty: 2, gameId: null },
      });
      expect(state.fen).toBe('current-fen');
      expect(state.history).toEqual(['old-fen', 'current-fen']);
    });

    // 边缘情况：清空 error
    it('clears error on successful move', () => {
      const prev = createMockGameState({ error: 'something went wrong' });
      const state = gameReducer(prev, {
        type: 'MAKE_MOVE',
        payload: {
          fen: 'new-fen', turn: 'b', lastMove: null, legalMoves: [],
          status: 'playing', difficulty: 2, gameId: null,
        },
      });
      expect(state.error).toBeNull();
    });
  });

  // ─── SET_THINKING ──────────────────────────────────────────────────
  describe('SET_THINKING', () => {
    it('sets isThinking to true', () => {
      const state = gameReducer(initialState, { type: 'SET_THINKING', payload: true });
      expect(state.isThinking).toBe(true);
    });

    it('sets isThinking to false', () => {
      const prev = createMockGameState({ isThinking: true });
      const state = gameReducer(prev, { type: 'SET_THINKING', payload: false });
      expect(state.isThinking).toBe(false);
    });
  });

  // ─── SET_ERROR ─────────────────────────────────────────────────────
  describe('SET_ERROR', () => {
    it('sets error message', () => {
      const state = gameReducer(initialState, { type: 'SET_ERROR', payload: '网络错误' });
      expect(state.error).toBe('网络错误');
    });

    // 边缘情况：设置 error 时自动清空 isThinking
    it('clears isThinking when error is set', () => {
      const prev = createMockGameState({ isThinking: true });
      const state = gameReducer(prev, { type: 'SET_ERROR', payload: 'error' });
      expect(state.error).toBe('error');
      expect(state.isThinking).toBe(false);
    });

    // 边缘情况：清空 error
    it('clears error to null', () => {
      const prev = createMockGameState({ error: 'some error' });
      const state = gameReducer(prev, { type: 'SET_ERROR', payload: null });
      expect(state.error).toBeNull();
    });

    // 边缘情况：空字符串 error
    it('allows empty string as error', () => {
      const state = gameReducer(initialState, { type: 'SET_ERROR', payload: '' });
      expect(state.error).toBe('');
    });
  });

  // ─── UNDO_MOVE ────────────────────────────────────────────────────
  describe('UNDO_MOVE', () => {
    it('removes last two history entries', () => {
      const prev = createMockGameState({
        history: ['fen0', 'fen1', 'fen2', 'fen3'],
      });
      const state = gameReducer(prev, {
        type: 'UNDO_MOVE',
        payload: {
          fen: 'fen1', turn: 'w', lastMove: null, legalMoves: [],
          status: 'playing', difficulty: 2, gameId: 'abc',
        },
      });
      expect(state.history).toEqual(['fen0', 'fen1']);
      expect(state.selectedSquare).toBeNull();
      expect(state.isThinking).toBe(false);
      expect(state.error).toBeNull();
    });

    // 边缘情况：history 不足 2 条
    it('handles history with 0 entries gracefully (slice to empty)', () => {
      const prev = createMockGameState({ history: [] });
      const state = gameReducer(prev, {
        type: 'UNDO_MOVE',
        payload: {
          fen: 'starting-fen', turn: 'w', lastMove: null, legalMoves: [],
          status: 'playing', difficulty: 2, gameId: null,
        },
      });
      expect(state.history).toEqual([]);
    });

    // 边缘情况：history 只有 1 条
    it('handles history with 1 entry gracefully (slice to empty)', () => {
      const prev = createMockGameState({ history: ['only-fen'] });
      const state = gameReducer(prev, {
        type: 'UNDO_MOVE',
        payload: {
          fen: 'only-fen', turn: 'w', lastMove: null, legalMoves: [],
          status: 'playing', difficulty: 2, gameId: null,
        },
      });
      expect(state.history).toEqual([]);
    });
  });

  // ─── RESET ─────────────────────────────────────────────────────────
  describe('RESET', () => {
    it('resets to initial state', () => {
      const prev = createMockGameState({
        gameId: 'some-game',
        fen: 'some-fen',
        history: ['a', 'b'],
        selectedSquare: 'e2',
        isThinking: true,
        error: 'error',
      });
      const state = gameReducer(prev, { type: 'RESET' });
      expect(state).toEqual(initialState);
    });
  });

  // ─── Default（未知 action）──────────────────────────────────────────
  describe('unknown action type', () => {
    it('returns state unchanged for unknown action', () => {
      const prev = createMockGameState({ gameId: 'test' });
      const state = gameReducer(prev, { type: 'UNKNOWN' } as unknown as GameAction);
      expect(state).toBe(prev);
      expect(state.gameId).toBe('test');
    });
  });

  // ─── 综合：action 不修改未在 payload 中的字段 ─────────────────────────
  it('preserves boardOrientation across actions', () => {
    const state = gameReducer(initialState, {
      type: 'CREATE_GAME',
      payload: {
        gameId: 'g1', fen: 'fen', turn: 'w', status: 'playing',
        difficulty: 2, legalMoves: [], lastMove: null,
      },
    });
    expect(state.boardOrientation).toBe('w');
  });
});
