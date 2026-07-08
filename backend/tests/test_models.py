"""GameSession 数据模型测试 — 覆盖所有边缘情况"""
import pytest
import chess
from app.models import GameSession


class TestGameSession:
    """测试 GameSession dataclass 的创建和默认值"""

    def test_create_with_minimal_args(self):
        """边缘情况：仅提供必填参数，验证默认值正确"""
        session = GameSession(game_id="g001", board=chess.Board(), difficulty=2)
        assert session.game_id == "g001"
        assert isinstance(session.board, chess.Board)
        assert session.difficulty == 2
        # 默认值校验
        assert session.status == "playing"
        assert session.last_move is None
        assert session.created_at == 0.0

    def test_create_with_all_args(self):
        """基础功能：提供所有参数创建 GameSession"""
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
        """边缘情况：game_id 为空字符串"""
        session = GameSession(game_id="", board=chess.Board(), difficulty=1)
        assert session.game_id == ""

    def test_create_with_none_last_move(self):
        """边缘情况：last_move 为 None（默认值）"""
        session = GameSession(game_id="g003", board=chess.Board(), difficulty=2)
        assert session.last_move is None

    def test_create_with_unusual_difficulty_values(self):
        """边缘情况：difficulty 为边界值 — 虽然业务上只允许 1/2/3，但模型本身不应限制"""
        board = chess.Board()
        # 边界值：最小整数
        s1 = GameSession(game_id="g004", board=board, difficulty=0)
        assert s1.difficulty == 0
        # 边界值：负数（模型不验证业务规则）
        s2 = GameSession(game_id="g005", board=board, difficulty=-1)
        assert s2.difficulty == -1
        # 边界值：极大值
        s3 = GameSession(game_id="g006", board=board, difficulty=9999)
        assert s3.difficulty == 9999

    def test_create_with_various_status_values(self):
        """边缘情况：status 为各种可能值"""
        board = chess.Board()
        for status in ["playing", "check", "checkmate", "stalemate", "draw"]:
            session = GameSession(game_id=f"g_{status}", board=board, difficulty=1, status=status)
            assert session.status == status

    def test_create_with_empty_status(self):
        """边缘情况：status 为空字符串"""
        session = GameSession(game_id="g_empty", board=chess.Board(), difficulty=1, status="")
        assert session.status == ""

    def test_create_with_zero_created_at(self):
        """边缘情况：created_at 为 0.0（默认值）"""
        session = GameSession(game_id="g007", board=chess.Board(), difficulty=1)
        assert session.created_at == 0.0

    def test_create_with_negative_created_at(self):
        """边缘情况：created_at 为负值"""
        session = GameSession(
            game_id="g008", board=chess.Board(), difficulty=1, created_at=-1.0
        )
        assert session.created_at == -1.0

    def test_game_session_mutability(self):
        """基础功能：dataclass 字段默认可变（非 frozen）"""
        session = GameSession(game_id="g009", board=chess.Board(), difficulty=1)
        session.status = "checkmate"
        assert session.status == "checkmate"

    def test_board_mutation_reflects(self):
        """边缘情况：修改 board 对象应反映在 session 中（引用类型）"""
        board = chess.Board()
        session = GameSession(game_id="g010", board=board, difficulty=1)
        board.push_san("e4")
        assert session.board.fen() != chess.Board().fen()
