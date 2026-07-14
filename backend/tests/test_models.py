"""GameSession data model tests — covers all edge cases"""
import pytest
import chess
from app.models import GameSession


class TestGameSession:
    """Tests for GameSession dataclass creation and defaults"""

    def test_create_with_minimal_args(self):
        """Edge case: provide only required args, verify defaults are correct"""
        session = GameSession(game_id="g001", board=chess.Board(), difficulty=2)
        assert session.game_id == "g001"
        assert isinstance(session.board, chess.Board)
        assert session.difficulty == 2
        # Default value verification
        assert session.status == "playing"
        assert session.last_move is None
        assert session.created_at == 0.0

    def test_create_with_all_args(self):
        """Basic function: create GameSession with all parameters"""
        board = chess.Board()
        session = GameSession(
            game_id="g002",
            board=board,
            difficulty=1,
            status="checkmate",
            last_move="e2e4",
            created_at=1234567890.0,
        )
        assert session.game_id == "g002"
        assert session.board == board
        assert session.difficulty == 1
        assert session.status == "checkmate"
        assert session.last_move == "e2e4"
        assert session.created_at == 1234567890.0

    def test_create_with_empty_string_game_id(self):
        """Edge case: game_id is empty string"""
        session = GameSession(game_id="", board=chess.Board(), difficulty=1)
        assert session.game_id == ""

    def test_create_with_none_last_move(self):
        """Edge case: last_move is None (default)"""
        session = GameSession(game_id="g003", board=chess.Board(), difficulty=2)
        assert session.last_move is None

    def test_create_with_unusual_difficulty_values(self):
        """Edge case: difficulty boundary values — although business only allows 1/2/3, the model itself should not restrict"""
        board = chess.Board()
        # Boundary value: minimum integer
        s1 = GameSession(game_id="g004", board=board, difficulty=0)
        assert s1.difficulty == 0
        # Boundary value: negative (model does not validate business rules)
        s2 = GameSession(game_id="g005", board=board, difficulty=-1)
        assert s2.difficulty == -1
        # Boundary value: very large
        s3 = GameSession(game_id="g006", board=board, difficulty=9999)
        assert s3.difficulty == 9999

    def test_create_with_various_status_values(self):
        """Edge case: status with various possible values"""
        board = chess.Board()
        for status in ["playing", "check", "checkmate", "stalemate", "draw"]:
            session = GameSession(game_id=f"g_{status}", board=board, difficulty=1, status=status)
            assert session.status == status

    def test_create_with_empty_status(self):
        """Edge case: status is empty string"""
        session = GameSession(game_id="g_empty", board=chess.Board(), difficulty=1, status="")
        assert session.status == ""

    def test_create_with_zero_created_at(self):
        """Edge case: created_at is 0.0 (default)"""
        session = GameSession(game_id="g007", board=chess.Board(), difficulty=1)
        assert session.created_at == 0.0

    def test_create_with_negative_created_at(self):
        """Edge case: created_at is negative"""
        session = GameSession(
            game_id="g008", board=chess.Board(), difficulty=1, created_at=-1.0
        )
        assert session.created_at == -1.0

    def test_game_session_mutability(self):
        """Basic function: dataclass fields are mutable by default (not frozen)"""
        session = GameSession(game_id="g009", board=chess.Board(), difficulty=1)
        session.status = "checkmate"
        assert session.status == "checkmate"

    def test_board_mutation_reflects(self):
        """Edge case: modifying the board object should reflect in the session (reference type)"""
        board = chess.Board()
        session = GameSession(game_id="g010", board=board, difficulty=1)
        board.push_san("e4")
        assert session.board.fen() != chess.Board().fen()
