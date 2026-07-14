import asyncio
import uuid
import time
from app.models import GameSession
import chess


class GameManager:
    def __init__(self):
        self._games: dict[str, GameSession] = {}
        self._lock = asyncio.Lock()
        self._game_locks: dict[str, asyncio.Lock] = {}
        self._lock_for_locks = asyncio.Lock()
        self._max_games = 100

    async def create_game(self, difficulty: int) -> GameSession:
        """Create a new game, returns GameSession"""
        async with self._lock:
            if len(self._games) >= self._max_games:
                raise ValueError("Maximum active games reached")
            game_id = str(uuid.uuid4())
            board = chess.Board()
            session = GameSession(
                game_id=game_id,
                board=board,
                difficulty=difficulty,
                status="playing",
                last_move=None,
                created_at=time.time()
            )
            self._games[game_id] = session
            return session

    async def get_game(self, game_id: str) -> GameSession | None:
        """Get a specific game session"""
        async with self._lock:
            return self._games.get(game_id)

    async def delete_game(self, game_id: str) -> bool:
        """Delete a game session, returns whether successful"""
        async with self._lock:
            if game_id in self._games:
                del self._games[game_id]
                # Also clean up per-game lock
                async with self._lock_for_locks:
                    self._game_locks.pop(game_id, None)
                return True
            return False

    async def get_game_lock(self, game_id: str) -> asyncio.Lock:
        """Get per-game lock"""
        async with self._lock_for_locks:
            if game_id not in self._game_locks:
                self._game_locks[game_id] = asyncio.Lock()
            return self._game_locks[game_id]

    async def make_move(self, game_id: str, from_sq: str, to_sq: str, promotion: str | None = None) -> GameSession:
        """
        Execute a player move (validate → execute → return new state)
        Note: This method only validates and updates moves; AI computation is invoked by the router layer
        """
        async with self._lock:
            session = self._games.get(game_id)
        if not session:
            raise ValueError("Game not found")

        async with await self.get_game_lock(game_id):
            board = session.board

            # Validate game not over (takes priority over turn validation)
            if self._derive_status(board) != "playing":
                raise ValueError("Game is already over")

            # Validate turn
            if board.turn != chess.WHITE:
                raise ValueError("It's not your turn")

            # Parse move
            uci_move = f"{from_sq}{to_sq}"
            if promotion:
                uci_move += promotion

            try:
                move = chess.Move.from_uci(uci_move)
            except ValueError:
                raise ValueError(f"Invalid move format: {uci_move}")

            if move not in board.legal_moves:
                raise ValueError(f"Illegal move: {uci_move}")

            # Execute move
            board.push(move)
            session.last_move = uci_move

            # Update status
            session.status = self._derive_status(board)

            return session

    async def get_legal_moves(self, game_id: str) -> list[str]:
        """Get all legal moves for the current position (UCI format)"""
        session = await self.get_game(game_id)
        if not session:
            raise ValueError("Game not found")
        return [move.uci() for move in session.board.legal_moves]

    async def undo_last_two_moves(self, game_id: str) -> GameSession:
        """Undo last two moves: one AI move + one player move"""
        session = await self.get_game(game_id)
        if not session:
            raise ValueError("Game not found")

        async with await self.get_game_lock(game_id):
            board = session.board
            # Undo two moves (AI move + player move)
            moves_to_undo = min(2, len(board.move_stack))
            for _ in range(moves_to_undo):
                board.pop()

            session.last_move = board.move_stack[-1].uci() if board.move_stack else None
            session.status = self._derive_status(board)

            # If game was over, restore to playing after undo
            if session.status in ("checkmate", "stalemate", "draw"):
                session.status = "playing"
                if board.is_check():
                    session.status = "check"

            return session

    def _derive_status(self, board: chess.Board) -> str:
        """Derive game status from the board"""
        if board.is_checkmate():
            return "checkmate"
        if board.is_stalemate():
            return "stalemate"
        if board.is_insufficient_material():
            return "draw"
        if board.can_claim_draw():
            return "draw"
        if board.is_check():
            return "check"
        return "playing"


# Module-level singleton
game_manager = GameManager()
