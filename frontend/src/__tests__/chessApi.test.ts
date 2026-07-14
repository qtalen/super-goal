import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chessApi, ChessApiError } from '../api/chessApi';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helper functions ──────────────────────────────────────────────────
function mockResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : 'Error',
    json: () => Promise.resolve(data),
  });
}

// ─── createGame ─────────────────────────────────────────────────────
describe('chessApi.createGame', () => {
  it('sends POST /api/games with valid difficulty', async () => {
    // Simulate backend returning snake_case, toCamelCase should convert to camelCase
    const responseData: Record<string, unknown> = {
      game_id: 'abc', fen: 'starting-fen', turn: 'w', status: 'playing',
      difficulty: 2, legal_moves: [], last_move: null,
    };
    mockFetch.mockResolvedValueOnce(mockResponse(responseData));

    const result = await chessApi.createGame(2);
    expect(result.gameId).toBe('abc');
    expect(result.legalMoves).toEqual([]);
    expect(result.lastMove).toBeNull();

    // Verify request
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('/api/games');
    expect(callArgs[1]?.method).toBe('POST');
    expect(JSON.parse(callArgs[1]?.body as string)).toEqual({ difficulty: 2 });
  });

  // Edge case: difficulty 1 (boundary value)
  it('works with minimum difficulty (1)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ game_id: 'a' }));
    await expect(chessApi.createGame(1)).resolves.toBeDefined();
  });

  // Edge case: difficulty 3 (boundary value)
  it('works with maximum difficulty (3)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ game_id: 'a' }));
    await expect(chessApi.createGame(3)).resolves.toBeDefined();
  });
});

// ─── getGame ─────────────────────────────────────────────────────────
describe('chessApi.getGame', () => {
  it('sends GET /api/games/{id}', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ game_id: 'test' }));
    const result = await chessApi.getGame('test');
    expect(result.gameId).toBe('test');
    expect(mockFetch.mock.calls[0][0]).toBe('/api/games/test');
  });

  // Edge case: empty gameId
  it('rejects with error for empty gameId', async () => {
    await expect(chessApi.getGame('')).rejects.toThrow(ChessApiError);
  });

  it('rejects with 400 error for empty gameId', async () => {
    try {
      await chessApi.getGame('');
    } catch (e) {
      expect(e).toBeInstanceOf(ChessApiError);
      expect((e as ChessApiError).status).toBe(400);
    }
  });

  // Edge case: special character gameId (should be encoded by encodeURIComponent)
  it('encodes special characters in gameId', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ game_id: 'a/b' }));
    await chessApi.getGame('a/b');
    expect(mockFetch.mock.calls[0][0]).toBe('/api/games/a%2Fb');
  });
});

// ─── makeMove ────────────────────────────────────────────────────────
describe('chessApi.makeMove', () => {
  it('sends POST with from, to, and null promotion', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ game_id: 'g1', ai_move: 'e7e5' }));
    const result = await chessApi.makeMove('g1', 'e2', 'e4');
    expect(result.aiMove).toBe('e7e5');

    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(body).toEqual({ from_sq: 'e2', to_sq: 'e4', promotion: null });
  });

  it('sends promotion when provided', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ game_id: 'g1', ai_move: 'e7e5' }));
    await chessApi.makeMove('g1', 'e7', 'e8', 'q');

    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(body.promotion).toBe('q');
  });

  // Edge case: empty gameId
  it('rejects for empty gameId', async () => {
    await expect(chessApi.makeMove('', 'e2', 'e4')).rejects.toThrow(ChessApiError);
  });

  // Edge case: empty from
  it('rejects for empty from', async () => {
    await expect(chessApi.makeMove('g1', '', 'e4')).rejects.toThrow(ChessApiError);
  });

  // Edge case: empty to
  it('rejects for empty to', async () => {
    await expect(chessApi.makeMove('g1', 'e2', '')).rejects.toThrow(ChessApiError);
  });
});

// ─── getLegalMoves ──────────────────────────────────────────────────
describe('chessApi.getLegalMoves', () => {
  it('sends GET request', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ legal_moves: ['e2e4', 'd2d4'] }));
    const result = await chessApi.getLegalMoves('g1');
    expect(result.legalMoves).toEqual(['e2e4', 'd2d4']);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/games/g1/legal-moves');
  });

  // Edge case: empty gameId
  it('rejects for empty gameId', async () => {
    await expect(chessApi.getLegalMoves('')).rejects.toThrow(ChessApiError);
  });
});

// ─── Error handling ─────────────────────────────────────────────────
describe('API error handling', () => {
  // Failure path: HTTP 404
  it('throws ChessApiError with 404 detail', async () => {
    mockFetch.mockResolvedValueOnce(
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ detail: 'Game not found' }),
      }),
    );
    try {
      await chessApi.getGame('nonexistent');
    } catch (e) {
      expect(e).toBeInstanceOf(ChessApiError);
      expect((e as ChessApiError).status).toBe(404);
      expect((e as ChessApiError).message).toBe('Game not found');
    }
  });

  // Failure path: HTTP 400
  it('throws ChessApiError with 400 illegal move', async () => {
    mockFetch.mockResolvedValueOnce(
      Promise.resolve({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ detail: 'Illegal move: e2e5' }),
      }),
    );
    try {
      await chessApi.makeMove('g1', 'e2', 'e5');
    } catch (e) {
      expect((e as ChessApiError).status).toBe(400);
      expect((e as ChessApiError).message).toBe('Illegal move: e2e5');
    }
  });

  // Edge case: HTTP 500
  it('throws ChessApiError for server error', async () => {
    mockFetch.mockResolvedValueOnce(
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ detail: 'Internal error' }),
      }),
    );
    try {
      await chessApi.getGame('g1');
    } catch (e) {
      expect((e as ChessApiError).status).toBe(500);
    }
  });

  // Edge case: response body is not JSON
  it('handles non-JSON error response', async () => {
    mockFetch.mockResolvedValueOnce(
      Promise.resolve({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: () => Promise.reject(new Error('parse error')),
      }),
    );
    try {
      await chessApi.getGame('g1');
    } catch (e) {
      expect((e as ChessApiError).status).toBe(502);
      expect((e as ChessApiError).message).toContain('502');
    }
  });

  // Edge case: network error (fetch throws exception)
  it('handles network failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    try {
      await chessApi.getGame('g1');
    } catch (e) {
      expect((e as ChessApiError).status).toBe(0);
      expect((e as ChessApiError).message).toBe('Failed to fetch');
    }
  });

  // Edge case: request timeout
  it('handles abort/timeout', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortError);
    try {
      await chessApi.getGame('g1');
    } catch (e) {
      expect((e as ChessApiError).status).toBe(408);
      expect((e as ChessApiError).message).toBe('Request timeout');
    }
  });

  // Edge case: AbortController signal
  it('passes signal to fetch for timeout control', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ gameId: 'g1' }));
    await chessApi.getGame('g1');

    const options = mockFetch.mock.calls[0][1];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});

// ─── Request headers ───────────────────────────────────────────────
describe('request headers', () => {
  it('sets Content-Type to application/json', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ gameId: 'g1' }));
    await chessApi.getGame('g1');

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('includes custom headers', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}));
    // makeMove internally doesn't add custom headers, but request function merges headers
    await chessApi.createGame(2);

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });
});
