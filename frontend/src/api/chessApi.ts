import type { GameState, MoveResponse } from '../types';

const BASE_URL = '/api';
const REQUEST_TIMEOUT = 10000;

/** 将后端返回的 snake_case 字段名递归转换为 camelCase */
function toCamelCase(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj as Record<string, unknown>).reduce((acc, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      (acc as Record<string, unknown>)[camelKey] = toCamelCase(
        (obj as Record<string, unknown>)[key],
      );
      return acc;
    }, {} as Record<string, unknown>);
  }
  return obj;
}

export class ChessApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ChessApiError';
    this.status = status;
  }
}

interface ApiErrorBody {
  detail?: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorBody: ApiErrorBody = {};
      try {
        errorBody = (await response.json()) as ApiErrorBody;
      } catch {
        // Response body is not JSON
      }
      throw new ChessApiError(
        errorBody.detail ?? `HTTP ${response.status}: ${response.statusText}`,
        response.status,
      );
    }

    const raw = (await response.json()) as Record<string, unknown>;
    return toCamelCase(raw) as T;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ChessApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ChessApiError('Request timeout', 408);
    }

    throw new ChessApiError(
      error instanceof Error ? error.message : 'Unknown network error',
      0,
    );
  }
}

export const chessApi = {
  createGame(difficulty: 1 | 2 | 3): Promise<GameState> {
    return request<GameState>(`${BASE_URL}/games`, {
      method: 'POST',
      body: JSON.stringify({ difficulty }),
    });
  },

  getGame(gameId: string): Promise<GameState> {
    if (!gameId) {
      return Promise.reject(new ChessApiError('gameId is empty', 400));
    }
    return request<GameState>(`${BASE_URL}/games/${encodeURIComponent(gameId)}`);
  },

  makeMove(
    gameId: string,
    from: string,
    to: string,
    promotion?: string,
  ): Promise<MoveResponse> {
    if (!gameId || !from || !to) {
      return Promise.reject(new ChessApiError('gameId, from, to cannot be empty', 400));
    }
    return request<MoveResponse>(`${BASE_URL}/games/${encodeURIComponent(gameId)}/move`, {
      method: 'POST',
      body: JSON.stringify({ from_sq: from, to_sq: to, promotion: promotion ?? null }),
    });
  },

  getLegalMoves(gameId: string): Promise<{ legalMoves: string[] }> {
    if (!gameId) {
      return Promise.reject(new ChessApiError('gameId is empty', 400));
    }
    return request<{ legalMoves: string[] }>(
      `${BASE_URL}/games/${encodeURIComponent(gameId)}/legal-moves`,
    );
  },
};
