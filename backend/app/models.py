from dataclasses import dataclass, field
import chess
from typing import Optional


@dataclass
class GameSession:
    game_id: str
    board: chess.Board
    difficulty: int  # 1, 2, 3
    status: str = "playing"  # playing, check, checkmate, stalemate, draw
    last_move: Optional[str] = None
    created_at: float = 0.0
