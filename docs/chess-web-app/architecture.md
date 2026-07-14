# Chess Web App — Architecture Design Document

**Task Slug**: `chess-web-app`
**Written**: 2026-07-07
**Status**: Locked

---

## 1. Project Directory Structure

```
super-loop/
│
├── backend/                          # Python FastAPI Backend
│   ├── main.py                       # FastAPI application entry + CORS configuration
│   ├── pyproject.toml                # Dependency management (uv)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── models.py                 # Data models (GameSession, GameState)
│   │   ├── game_manager.py           # Game session manager (thread-safe)
│   │   ├── ai_engine.py              # AI engine (Minimax + Alpha-Beta)
│   │   └── routers/
│   │       ├── __init__.py
│   │       └── games.py              # API route definitions
│
├── frontend/                         # React + TypeScript + Vite Frontend
│   ├── package.json                  # Dependency management (pnpm)
│   ├── tsconfig.json
│   ├── vite.config.ts                # Vite configuration (with dev proxy)
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx                  # React entry point
│   │   ├── App.tsx                   # Root component, composes all child components
│   │   ├── types/
│   │   │   └── index.ts              # TypeScript type definitions
│   │   ├── components/
│   │   │   ├── Board.tsx             # Board component (8×8 grid)
│   │   │   ├── Square.tsx            # Single square rendering
│   │   │   ├── Piece.tsx             # Piece Unicode display
│   │   │   ├── ControlPanel.tsx      # Control panel (difficulty/new game/undo)
│   │   │   └── GameStatus.tsx        # Game status display
│   │   ├── api/
│   │   │   └── chessApi.ts           # API client wrapper
│   │   ├── context/
│   │   │   └── GameContext.tsx        # Global game state (Context + useReducer)
│   │   └── styles/
│   │       ├── global.scss           # Global styles + CSS variables
│   │       ├── Board.scss            # Board styles
│   │       └── ControlPanel.scss     # Control panel styles
│
└── docs/
    └── chess-web-app/
        ├── reqs-manifest.md          # Requirements manifest (locked)
        └── architecture.md           # This file
```

### Directory Design Principles

| Principle | Description |
|-----------|-------------|
| **Separation of concerns** | Frontend/Backend completely independent, communicating via REST API |
| **Flat routing layer** | routers/ only handles request routing and parameter validation, business logic delegated to game_manager |
| **Single responsibility** | models/game_manager/ai_engine each have their own role, no mutual coupling |
| **No persistence** | All data in memory, lost on process restart |

---

## 2. Backend Architecture

### 2.1 Layer Responsibilities

```
HTTP Request
    │
    ▼
routers/games.py          ← Routing layer: parameter parsing, request validation, status codes
    │
    ▼
game_manager.py           ← Business layer: session lifecycle management, move validation delegation
    │
    ├── models.py          ← Data layer: GameSession data class
    └── ai_engine.py       ← Algorithm layer: AI move computation
```

### 2.2 models.py — Data Models

```python
@dataclass
class GameSession:
    game_id: str                    # UUID string
    board: chess.Board              # python-chess Board instance
    difficulty: int                 # 1|2|3
    status: str                     # "playing" | "check" | "checkmate" | "stalemate" | "draw"
    last_move: str | None           # UCI representation of last move (e.g. "e2e4")
    created_at: float               # time.time() timestamp
```

Key design decisions:

- **Do not store move history list**: python-chess Board retains complete history internally via `board.move_stack`, derivable when needed
- **status derived from Board in real time**: call `board.is_checkmate()`, `board.is_stalemate()`, etc. after each move
- **Immutable returns**: API returns a snapshot copy of the board, never exposes internal references directly

### 2.3 game_manager.py — Game Session Manager

```python
class GameManager:
    _games: dict[str, GameSession]   # game_id → GameSession
    _lock: asyncio.Lock              # Async lock for thread safety

    async def create_game(difficulty: int) -> GameSession
    async def get_game(game_id: str) -> GameSession | None
    async def delete_game(game_id: str) -> bool
    async def make_move(game_id: str, from_sq: str, to_sq: str, promotion: str | None) -> GameSession
    async def get_legal_moves(game_id: str) -> list[str]
```

Design points:

- **Singleton pattern**: module-level global instance `game_manager = GameManager()`
- **asyncio.Lock ensures atomicity**: all read/write operations protected by `async with self._lock`
- **Lifetime**: sessions never expire (prototype stage); idle timeout cleanup can be added later
- **Move flow**: `make_move()` internally executes sequentially — validate legality → execute move → check game status → call AI → check status again → return

### 2.4 ai_engine.py — AI Engine

Core algorithm: Minimax + Alpha-Beta Pruning

```python
def select_move(board: chess.Board, difficulty: int) -> chess.Move | None:
    """
    Main entry point:
    1. Select search depth based on difficulty
    2. Move ordering (MVV-LVA heuristic)
    3. Call minimax search
    4. Add random perturbation at beginner difficulty
    5. Async timeout protection (5-second cap)
    """

def minimax(board: chess.Board, depth: int, alpha: int, beta: int,
            is_maximizing: bool) -> float

def evaluate(board: chess.Board) -> float:
    """
    Evaluation function (positive value = white advantage when AI plays white):
    + Piece base value
    + Position value table (center control)
    + Mobility adjustment (number of legal moves)
    """
```

#### Evaluation Function Design

| Piece | Base Value | Position Strategy |
|-------|-----------|-------------------|
| Pawn (P) | 100 | Center pawns (+10), advanced pawns (+5), edge pawns (-5) |
| Knight (N) | 320 | Center knights (+15), edge/corner knights (-10) |
| Bishop (B) | 330 | Bishop square table (center diagonal bonus) |
| Rook (R) | 500 | Bonus on open files, bonus on 7th rank |
| Queen (Q) | 900 | Center control bonus, but avoid early development |
| King (K) | 20000 | Safe position in middlegame, centralization in endgame |

#### Search Difficulty Configuration

| Difficulty | Search Depth | Characteristics |
|------------|-------------|-----------------|
| 1 (Beginner) | 1~2 | Random perturbation added to moves (randomly pick from top-3 moves) |
| 2 (Intermediate) | 2~3 | Full alpha-beta, no perturbation |
| 3 (Advanced) | 3~4 | Finer evaluation + extended search (increased depth on checks) |

#### Performance Optimization

1. **Move ordering (MVV-LVA)**: search captures first (most promising for pruning), improving pruning efficiency
2. **Alpha-Beta pruning**: strictly implemented, prunes branches not worth searching
3. **Timeout protection**: `asyncio.wait_for(..., timeout=5.0)` fallback, returns current best move on timeout
4. **Iterative deepening (optional)**: can complete shallow search within 1 second, continue deeper with remaining time

---

## 3. API Design

### 3.1 Endpoint Overview

| Method | Path | Description | Request Body | Response Body |
|--------|------|-------------|-------------|---------------|
| POST | `/api/games` | Create new game | `{ "difficulty": 1\|2\|3 }` | `GameState` |
| GET | `/api/games/{game_id}` | Query game state | — | `GameState` |
| POST | `/api/games/{game_id}/move` | Player move + AI response | `{ "from": "e2", "to": "e4", "promotion": "q"\|null }` | `MoveResponse` |
| GET | `/api/games/{game_id}/legal-moves` | Get legal moves | — | `{ "legal_moves": [...] }` |

### 3.2 Unified Response Format — GameState

```json
{
  "game_id": "550e8400-e29b-41d4-a716-446655440000",
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "turn": "w",
  "status": "playing",
  "legal_moves": ["e2e4", "d2d4", "g1f3", ...],
  "last_move": null,
  "difficulty": 2
}
```

### 3.3 POST /api/games/{game_id}/move — MoveResponse

```json
{
  "game_id": "550e8400-e29b-41d4-a716-446655440000",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "turn": "b",
  "status": "playing",
  "legal_moves": ["e7e5", "e7e6", "d7d5", ...],
  "last_move": "e2e4",
  "ai_move": "e7e5",
  "difficulty": 2
}
```

### 3.4 Error Handling

| Scenario | HTTP Status | Response Body |
|----------|------------|---------------|
| game_id does not exist | 404 | `{ "detail": "Game not found" }` |
| Illegal move | 400 | `{ "detail": "Illegal move: e2e5" }` |
| Game already over | 400 | `{ "detail": "Game is already over" }` |
| Not white's turn | 400 | `{ "detail": "It's not your turn" }` |
| Invalid difficulty parameter | 422 | Pydantic auto-validation error |

### 3.5 CORS Configuration

Configured in `main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 3.6 Vite Development Proxy

`vite.config.ts` proxies `/api` to backend to avoid cross-origin issues during development:

```typescript
server: {
  proxy: {
    '/api': 'http://localhost:8000'
  }
}
```

---

## 4. Frontend Architecture

### 4.1 Component Tree

```
App
├── ControlPanel
│   ├── Difficulty dropdown (Beginner/Intermediate/Advanced)
│   ├── New Game button
│   └── Undo Move button (back_arrow)
│
├── Board
│   └── Square × 64 (8 rows × 8 cols)
│       ├── Rank/file labels (a-h, 1-8)
│       ├── Alternating light/dark background
│       ├── Selected highlight (yellow)
│       ├── Legal move markers (green dots)
│       └── Piece (rendered when piece present)
│           └── Unicode chess piece character
│
└── GameStatus
    ├── Turn indicator (White to move / Black to move)
    ├── Status (Check / Checkmate / Draw / Stalemate)
    └── Move history display (notation)
```

### 4.2 State Management — GameContext

Uses React Context + useReducer pattern:

```typescript
// types/index.ts
interface GameState {
  gameId: string | null;
  fen: string;
  turn: 'w' | 'b';
  status: 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw';
  difficulty: 1 | 2 | 3;
  legalMoves: string[];
  lastMove: string | null;
  history: string[];        // FEN history snapshots (for undo)
  selectedSquare: string | null;  // Currently selected square
  boardOrientation: 'w';    // Always from white's perspective (extensible)
  isThinking: boolean;      // AI computing indicator
  error: string | null;
}

type GameAction =
  | { type: 'CREATE_GAME'; payload: GameState }
  | { type: 'SELECT_SQUARE'; payload: string | null }
  | { type: 'MAKE_MOVE'; payload: Partial<GameState> }
  | { type: 'SET_THINKING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'UNDO_MOVE'; payload: Partial<GameState> }
  | { type: 'RESET' };
```

### 4.3 Move Interaction Flow

```
User clicks a square
    │
    ▼
Board.onSquareClick(square)
    │
    ├── No square selected + square has own piece
    │   └── dispatch SELECT_SQUARE(square) → highlight + show legal moves
    │
    ├── Square selected + click same square
    │   └── dispatch SELECT_SQUARE(null) → deselect
    │
    ├── Square selected + click another own piece
    │   └── dispatch SELECT_SQUARE(newSquare) → switch selection
    │
    └── Square selected + click target square
        ├── If promotion move → show promotion dialog → choose piece
        └── Call chessApi.makeMove(gameId, from, to, promotion)
            ├── Success → dispatch MAKE_MOVE(response) → update board
            └── Failure → dispatch SET_ERROR(errorMsg)
```

### 4.4 API Client — chessApi.ts

```typescript
// Wraps all fetch calls
export const chessApi = {
  createGame(difficulty: 1 | 2 | 3): Promise<GameState>,
  getGame(gameId: string): Promise<GameState>,
  makeMove(gameId: string, from: string, to: string, promotion?: string): Promise<MoveResponse>,
  getLegalMoves(gameId: string): Promise<{ legal_moves: string[] }>,
};
```

Design points:

- **Unified error handling**: all methods catch network errors internally, throw structured error objects `{ status, message }`
- **Request timeout**: uses `AbortController` with 10-second timeout
- **Fully typed TypeScript**: request/response bodies all have corresponding interfaces

### 4.5 Board Rendering Logic

```typescript
// Board.tsx
function Board({ fen, ... }: Props) {
  const rows = [8, 7, 6, 5, 4, 3, 2, 1];  // Start from rank 8 (white at bottom)
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  // Parse FEN → 2D array
  const board = parseFen(fen);

  return (
    <div className="board">
      {rows.map(row =>
        files.map(file => {
          const square = `${file}${row}`;
          const piece = board[row][file];
          return (
            <Square
              key={square}
              square={square}
              piece={piece}
              isLight={(row + file.charCodeAt(0)) % 2 === 0}
              isSelected={selectedSquare === square}
              isLegalMove={legalMoveSquares.has(square)}
              isLastMove={lastMoveFrom === square || lastMoveTo === square}
              onClick={() => onSquareClick(square)}
            />
          );
        })
      )}
    </div>
  );
}
```

### 4.6 Visual Feedback Scheme

| State | Color | Implementation |
|-------|-------|----------------|
| Selected square | Yellow semi-transparent overlay | `box-shadow: inset 0 0 0 3px gold` |
| Legal move (no capture) | Green dot | Pseudo-element `:after` centered |
| Legal move (with capture) | Red border | `outline: 3px solid red` |
| Previous move | Blue semi-transparent | `background: rgba(0,0,255,0.1)` |
| Check status | Red pulse | Pulse animation on king's square |

### 4.7 Promotion Handling

Promotion is handled on the frontend via a modal dialog:

1. User intends to move a pawn to rank 1 or rank 8 (promotion condition)
2. Frontend detects promotion condition, shows selection dialog before `makeMove` call
3. User chooses: Queen (q) / Rook (r) / Bishop (b) / Knight (n)
4. `promotion` parameter passed to API
5. Backend python-chess handles `board.push(chess.Move(from, to, promotion=piece))`

---

## 5. AI Engine Key Design (Detailed)

### 5.1 Piece Base Value Table

```
P (Pawn)   = 100
N (Knight) = 320
B (Bishop) = 330
R (Rook)   = 500
Q (Queen)  = 900
K (King)   = 20000  (ensures king is never "captured")
```

### 5.2 Position Value Tables

Each piece type maintains an 8×8 position value table (from white's perspective). Key patterns:

- **Center control**: d4, d5, e4, e5 are the four central squares, all pieces receive bonuses here
- **Pawn positions**: central pawns > edge pawns, connected pawns get extra bonus, isolated pawns get penalty
- **Knight positions**: center > edges, d4/d5/e4/e5 are optimal
- **Bishop positions**: long diagonals > short diagonals, centralization bonus
- **Rook positions**: open files (no pawn blocking) bonus, 7th rank (attacking opponent's back rank) bonus
- **Queen positions**: avoid early development in middlegame, centralize in endgame

### 5.3 Mobility Evaluation

```
mobility_score = len(board.legal_moves) * MOBILITY_WEIGHT
MOBILITY_WEIGHT ≈ 5  (empirically tuned value)
```

Mobility differences typically range ±50~200 points, helping the AI choose moves with more open positions and more active pieces.

### 5.4 Search Optimization

```
function minimax(board, depth, alpha, beta, is_maximizing):
    if depth == 0 or game_over:
        return quiescence_search(board, alpha, beta, 3)
        // Quiescence search: continue searching captures to resolve "horizon effect"

    moves = order_moves(board.legal_moves, board)
    // MVV-LVA ordering: search most promising branches first

    for move in moves:
        board.push(move)
        score = minimax(board, depth-1, alpha, beta, not is_maximizing)
        board.pop()
        // alpha-beta pruning...

    return best_score
```

### 5.5 AI Invocation Flow (Complete Backend make_move Flow)

```
POST /api/games/{id}/move request received
    │
    ▼
1. Validate game_id exists
    │
    ▼
2. Validate move legality (board.is_legal(move))
    │  └─ Illegal → return 400
    ▼
3. Execute move board.push(move)
    │
    ▼
4. Check game status
    │  ├─ Checkmate/Stalemate/Draw → set status, return (AI does not move)
    │  └─ Normal, continue
    ▼
5. Call AI: ai_engine.select_move(board, difficulty)
    │  └─ Timeout → return current best move
    ▼
6. AI move board.push(ai_move)
    │
    ▼
7. Check game status again
    │
    ▼
8. Return complete GameState (including ai_move field)
```

---

## 6. Frontend-Backend Interaction Flow

### 6.1 Complete User Session Flow

```
Player Action                       Frontend State                     Backend
─────────                           ────────                           ────
1. Select difficulty (Beginner/Intermediate/Advanced)
    ↓
2. Click "New Game"                 dispatch(CREATE_GAME)
    →                               fetch POST /api/games              → Create GameSession
    ← receive game_id, fen                                             ← Return GameState
    →                               dispatch({type: 'CREATE_GAME', ...})
    ↓
3. Update board rendering           Board reads fen, renders pieces
    ↓
4. Click own piece                  dispatch(SELECT_SQUARE)
    →                               Highlight selected + show legal moves
    ↓
5. Click target square              dispatch(SET_THINKING, true)
    →                               (Show promotion dialog if applicable)
    →                               fetch POST /api/games/{id}/move    → Validate move
    →                                                                  → AI compute response
    ← receive new state                                                ← Return MoveResponse
    →                               dispatch(MAKE_MOVE, ...)
    →                               dispatch(SET_THINKING, false)
    ↓
6. Update board rendering           Board + GameStatus sync update
    ↓
7. Repeat 4-6 until game over       status !== 'playing'
    ↓
8. Game over display                GameStatus shows checkmate/draw etc.
    ↓
9. Click "New Game" → back to step 2
```

### 6.2 Undo Move Flow

```
1. Player clicks "Undo Move" button
2. Backend pops two moves (AI move + player move):
   - board.pop()  // Undo AI move
   - board.pop()  // Undo player move
3. Return new state (player's turn)
4. Frontend updates state

Note: If the game is already over, undo needs extra handling (reset status to "playing" first)
```

---

## 7. Security and Edge Case Handling

### 7.1 Input Validation

| Layer | Validation | Handling |
|-------|-----------|----------|
| HTTP (Pydantic) | difficulty range 1-3, FEN format, square format | 422 Unprocessable Entity |
| Business (game_manager) | game_id existence, move legality, turn correctness | 400/404 with detailed error |
| AI Engine | board not None, depth positive integer | Defensive assertions |

### 7.2 Concurrency Safety

- All `GameManager` methods protected by `asyncio.Lock`
- Lock is not released during AI computation (computation may take time, but games don't interfere — is the lock per-session or global?)
  - **Decision**: use **per-game locks** (nested dictionary of locks), not a global lock, to avoid different games blocking each other
  - Implementation: `locks: dict[str, asyncio.Lock]` + a lightweight lock protecting the locks dict itself

### 7.3 Resource Limits

| Limit | Value | Description |
|-------|-------|-------------|
| Max active sessions | 100 | Prevent memory exhaustion, reject new games at limit |
| AI search timeout | 5 sec | asyncio.wait_for hard limit |
| API timeout | 10 sec | Frontend AbortController control |
| Session idle cleanup | 1 hour (optional) | Background task scanning and cleanup |

---

## 8. Testing Strategy

### 8.1 Backend Testing

| Test Type | Tool | Coverage |
|-----------|------|----------|
| Unit tests | pytest | ai_engine.evaluate, minimax at each search depth |
| Integration tests | pytest + httpx.AsyncClient | API endpoints: create game, make move, game status |
| Edge cases | pytest | Checkmate/Stalemate/Promotion/Castling/En passant |

### 8.2 Frontend Testing

| Test Type | Tool | Coverage |
|-----------|------|----------|
| Component tests | vitest + @testing-library/react | Board rendering, Square click, GameStatus display |
| Context tests | vitest | GameContext reducer for each action |
| API tests | vitest + MSW | chessApi normal/error responses |

### 8.3 Key Edge Cases

- Empty input: empty FEN, empty square name
- Boundary values: difficulty=0, difficulty=4, depth=0
- Invalid input: illegal square names "z9", "a0", "e2e4" (not a square)
- Failure paths: moving to a square protected by opponent, making a move after game over
- Special moves: Castling (both sides, both directions), Promotion (4 piece types), En passant
- Concurrency: two games not interfering, race condition with two requests to same game

---

## 9. Dependency List

### 9.1 Backend (pyproject.toml)

```toml
[project]
name = "chess-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "python-chess>=1.999",
    "pydantic>=2.0",
]
```

### 9.2 Frontend (package.json — pnpm)

```json
{
  "name": "chess-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "sass": "^1.77.0",
    "vitest": "^1.6.0",
    "@testing-library/react": "^16.0.0",
    "jsdom": "^24.0.0"
  }
}
```

---

## 10. Implementation Plan (Suggested Order)

Organized by topological dependencies in 5 rounds:

| Round | Requirements | Content | Depends On |
|-------|-------------|---------|------------|
| 1 | R1, R5 | Backend/Frontend project initialization, basic skeleton | — |
| 2 | R2, R3, R6 | Game session management + AI engine + Board rendering | R1, R5 |
| 3 | R4, R7 | REST API endpoints + Move interaction | R2, R3, R5, R6 |
| 4 | R8, R9 | Control panel + API client + State management | R4, R5, R7 |
| 5 | R10 | Frontend-backend integration verification | R4, R7, R8, R9 |

---

===SUMMARY===

## Key Design Decision Summary

1. **REST API communication**: Frontend and backend fully decoupled, communicate via JSON over HTTP, no WebSocket, no server-side rendering.

2. **Pure in-memory, no persistence**: All GameSessions stored in memory dict, lost on process restart, suitable for prototype validation stage.

3. **Per-game lock design**: Uses per-game `asyncio.Lock` instead of global lock, ensuring concurrent safety across different game sessions without mutual interference.

4. **AI engine 3 difficulty levels**: Differentiated by search depth (1-2/2-3/3-4), beginner adds random perturbation, advanced adds extended search.

5. **Three-layer evaluation function**: Piece base value + position value tables + mobility scoring, balancing deterministic strategy with positional awareness.

6. **React Context + useReducer**: No external state libraries like Redux/Zustand; Context with native hooks suffices for single-page application needs.

7. **Promotion handled via frontend dialog**: Frontend detects promotion condition, shows 4-piece selection dialog, passes to backend for standardized processing.

8. **python-chess as core dependency**: All backend board logic (rule validation, FEN encoding/decoding, move legality) relies on python-chess — no reinventing the wheel.

9. **MVV-LVA move ordering**: Moves sorted by "most promising first" before AI search, significantly improving Alpha-Beta pruning efficiency.

10. **5-second AI search timeout**: Unified 5-second cap across all difficulties, asyncio.wait_for fallback, ensuring API never hangs.

11. **CORS + Vite Proxy dual protection**: Backend configured with CORS middleware, frontend Vite configured with dev proxy — only one layer needed in production deployment.

12. **Frontend toolchain**: pnpm (package manager) + Vite (build) + vitest (testing) + SCSS (styling), unified modern tooling ecosystem.
