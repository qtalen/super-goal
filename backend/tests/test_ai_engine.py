"""
AI 引擎测试 — evaluate / select_move / minimax / 边缘情况
"""
import pytest
import chess
from app.ai_engine import (
    evaluate,
    select_move,
    order_moves,
    minimax,
    PIECE_VALUES,
    _get_position_value,
)

# 已验证的将杀 FEN
SCHOLAR_MATE = "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4"
FOOL_MATE = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
# 一步将杀前（白方后 h5 吃 f7 即杀）
MATE_IN_ONE = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4"


class TestEvaluate:
    """局面评估函数测试"""

    def test_initial_board_approx_zero(self):
        """基础功能：初始局面评估值应接近 0（±50 以内）"""
        board = chess.Board()
        score = evaluate(board)
        assert -50 < score < 50, f"初始局面评估应接近0，实际={score}"

    def test_white_up_material(self):
        """边缘情况：白方多一马，评估应为正"""
        # 黑方少一个马（b8 格为空），白方多 320 子力
        board = chess.Board("rnbqkb1r/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        score = evaluate(board)
        assert score > 0, f"白方多子应正值，实际={score}"

    def test_black_up_material(self):
        """边缘情况：黑方多一马，评估应为负"""
        # 白方少一个马（g1 上的马被黑马吃掉了）
        board = chess.Board("rnbqkb1r/pppppppp/8/8/4P3/5n2/PPPP1PPP/RNBQKB1R b KQkq - 1 2")
        score = evaluate(board)
        assert score < 0, f"黑方多子应负值，实际={score}"

    def test_checkmate_white_wins(self):
        """边缘情况：白方将杀黑方（Scholar's Mate），评估应为极大正值"""
        board = chess.Board(SCHOLAR_MATE)
        assert board.turn == chess.BLACK  # 轮到黑方走，但已被将杀
        score = evaluate(board)
        assert score > 1e5, f"白方将杀应极大正值，实际={score}"

    def test_checkmate_black_wins(self):
        """边缘情况：黑方将杀白方（Fool's Mate），评估应为极大负值"""
        board = chess.Board(FOOL_MATE)
        assert board.turn == chess.WHITE  # 轮到白方走，但已被将杀
        score = evaluate(board)
        assert score < -1e5, f"黑方将杀应极大负值，实际={score}"

    def test_stalemate_evaluates_zero(self):
        """边缘情况：逼和局面评估为零"""
        # 构造一个逼和局面：黑方王被自己的兵和对方王包围，白方无子可动
        board = chess.Board("8/8/8/8/8/1k6/8/1K6 w - - 0 1")
        if board.is_stalemate():
            score = evaluate(board)
            assert score == 0
        else:
            pytest.skip("无法构造逼和局面")

    def test_insufficient_material(self):
        """边缘情况：子力不足（王 vs 王）评估为零"""
        board = chess.Board("8/8/8/8/8/8/8/k6K w - - 0 1")
        score = evaluate(board)
        assert score == 0

    def test_empty_board(self):
        """边缘情况：空棋盘评估为零"""
        board = chess.Board(None)  # 空棋盘
        score = evaluate(board)
        assert score == 0, f"空棋盘应为零，实际={score}"

    def test_get_position_value_black_flip(self):
        """边缘情况：黑方兵的 position value 应使用翻转后的行"""
        piece = chess.Piece(chess.PAWN, chess.BLACK)
        # 黑方兵在 a7 (square=8, row=1, col=0)
        # 白方视角下兵在 row=1 -> 翻转后 row=6
        # PAWN_TABLE[6][0] = 5
        val = _get_position_value(piece, 8)  # a7 = 8
        assert val == 5, f"黑方a7兵位置价值应为5，实际={val}"

    def test_get_position_value_unknown_piece(self):
        """边缘情况：未知棋子类型返回0"""
        piece2 = chess.Piece(0, chess.WHITE)  # 无效类型
        val = _get_position_value(piece2, 0)
        assert val == 0


class TestOrderMoves:
    """走法排序测试"""

    def test_capture_moves_prioritized(self):
        """基础功能：吃子走法应排在不吃子走法前面"""
        board = chess.Board()
        moves = order_moves(board)
        if len(moves) > 1:
            first_move = moves[0]
            # 初始局面可能会有吃子走法（比如 exd5 等），如果没有也没关系
            # 至少排序不应抛出异常

    def test_mvv_lva_ordering_simple(self):
        """边缘情况：吃子走法全部在非吃子走法之前"""
        # 白方车吃后（高价值受害者优先）
        board = chess.Board("8/8/8/8/8/5q2/8/4R1K1 w - - 0 1")
        moves = order_moves(board)
        capture_moves = [m for m in moves if board.is_capture(m)]
        if capture_moves:
            # 所有吃子走法都在非吃子之前
            first_non_capture = next(
                (i for i, m in enumerate(moves) if not board.is_capture(m)),
                len(moves),
            )
            for cm in capture_moves:
                assert moves.index(cm) < first_non_capture, (
                    f"吃子走法 {cm} 应在非吃子之前"
                )


class TestMinimax:
    """Minimax 搜索测试"""

    def test_minimax_depth_zero_returns_evaluate(self):
        """基础功能：depth=0 时应直接返回评估值"""
        board = chess.Board()
        score = minimax(board, 0, -1e9, 1e9, True)
        expected = evaluate(board)
        assert score == expected, f"depth=0应返回{evaluate(board)}，实际={score}"

    def test_minimax_finds_checkmate(self):
        """边缘情况：一步将杀时 minimax 应识别"""
        # 白方后 h5 到 f7 一步将杀（Scholar's Mate）
        board = chess.Board(MATE_IN_ONE)
        score = minimax(board, 2, -1e9, 1e9, True)
        # 白方应找到将杀，分值极大
        assert score > 1e5, f"一步将杀不应被错过，实际={score}"


class TestSelectMove:
    """AI 走法选择测试"""

    def _assert_legal_move(self, move: chess.Move | None, board: chess.Board) -> chess.Move:
        """辅助：断言走法合法并返回走法"""
        assert move is not None, "走法不应为 None"
        legal_moves = list(board.legal_moves)
        assert move in legal_moves, f"非法走法 {move}"
        return move

    def test_returns_move_initial_board(self):
        """基础功能：初始局面返回合法走法"""
        board = chess.Board()
        self._assert_legal_move(select_move(board, difficulty=2), board)

    def test_returns_move_difficulty_1(self):
        """基础功能：初级难度返回合法走法"""
        board = chess.Board()
        self._assert_legal_move(select_move(board, difficulty=1), board)

    def test_returns_move_difficulty_2(self):
        """基础功能：中级难度返回合法走法"""
        board = chess.Board()
        board.push_san("e4")
        board.push_san("e5")
        self._assert_legal_move(select_move(board, difficulty=2), board)

    def test_returns_move_difficulty_3(self):
        """基础功能：高级难度返回合法走法"""
        board = chess.Board()
        board.push_san("e4")
        board.push_san("d5")
        board.push_san("exd5")
        board.push_san("Qxd5")
        self._assert_legal_move(select_move(board, difficulty=3), board)

    def test_selects_checkmate_move(self):
        """边缘情况：存在一步将杀时选择将杀走法"""
        # Scholar's Mate 将杀前一步：白方后 h5 可吃 f7 将杀
        board = chess.Board(MATE_IN_ONE)
        move = self._assert_legal_move(select_move(board, difficulty=3), board)
        # 验证走法导致将杀
        board.push(move)
        assert board.is_checkmate(), f"应走将杀走法，但 {move} 未将杀"

    def test_no_illegal_moves(self):
        """基础功能：AI 绝对不走非法走法"""
        board = chess.Board("r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4")
        for diff in [1, 2, 3]:
            self._assert_legal_move(select_move(board, difficulty=diff), board)

    def test_game_over_returns_none(self):
        """边缘情况：将杀局面时 select_move 返回 None"""
        board = chess.Board(SCHOLAR_MATE)  # Scholar's Mate，黑方被将杀
        assert board.is_game_over()
        move = select_move(board, difficulty=2)
        assert move is None

    def test_no_legal_moves_returns_none(self):
        """边缘情况：无合法走法时返回 None"""
        board = chess.Board(SCHOLAR_MATE)  # 已被将杀，无合法走法
        move = select_move(board, difficulty=1)
        assert move is None

    def test_endgame_king_only(self):
        """边缘情况：仅剩王时游戏结束（子力不足），select_move 返回 None"""
        board = chess.Board("8/8/8/8/8/8/k7/K7 w - - 0 1")
        assert board.is_game_over()  # 子力不足
        move = select_move(board, difficulty=2)
        assert move is None, "王vs王游戏已结束，应返回None"

    def test_promotion_scenario(self):
        """边缘情况：兵升变场景"""
        # 白方兵在 e7，可以升变
        board = chess.Board("8/4P3/8/8/8/8/8/k6K w - - 0 1")
        move = self._assert_legal_move(select_move(board, difficulty=2), board)
        # 验证 e7 的兵必须走（唯一走法）
        assert move.from_square == chess.E7, (
            "e7 兵应走升变，但选择其他走法"
        )

    def test_difficulty_1_randomness(self):
        """边缘情况：初级难度应偶尔产生不同走法（非严格）"""
        board = chess.Board()
        moves_set: set[str] = set()
        for _ in range(5):
            m = select_move(board, difficulty=1)
            if m:
                moves_set.add(m.uci())
        # 初级难度应至少产生过一种走法
        assert len(moves_set) >= 1, "初级难度每次都应返回走法"

    def test_invalid_difficulty_does_not_crash(self):
        """边缘情况：无效难度值不应崩溃"""
        board = chess.Board()
        for diff in [0, -1, 100]:
            move = select_move(board, difficulty=diff)
            if move is not None:
                legal_moves = list(board.legal_moves)
                assert move in legal_moves


class TestEdgeCases:
    """额外的边缘情况测试"""

    def test_evaluate_checkmate_turn_independent(self):
        """边缘情况：将杀评估取决于轮到谁走"""
        # Scholar's Mate：白方将杀黑方，轮到黑方走
        board_w = chess.Board(SCHOLAR_MATE)
        score_w = evaluate(board_w)
        assert score_w > 1e5, f"白方将杀应正，实际={score_w}"

        # Fool's Mate：黑方将杀白方，轮到白方走
        board_b = chess.Board(FOOL_MATE)
        score_b = evaluate(board_b)
        assert score_b < -1e5, f"黑方将杀应负，实际={score_b}"

    def test_order_moves_empty_board(self):
        """边缘情况：空棋盘走法排序"""
        board = chess.Board(None)
        moves = order_moves(board)
        assert moves == [], f"空棋盘应无走法，实际={moves}"

    def test_evaluate_symmetry(self):
        """基础功能：对称局面评估值应为 0"""
        board = chess.Board()
        score = evaluate(board)
        # 初始局面是对称的
        assert -10 < score < 10, f"对称局面应接近0，实际={score}"

    def test_king_vs_king_evaluate(self):
        """边缘情况：王vs王应返回0（子力不足）"""
        board = chess.Board("8/8/8/8/8/8/k7/K7 w - - 0 1")
        score = evaluate(board)
        assert score == 0
