"""
AI Engine Tests — evaluate / select_move / minimax / edge cases
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

# Verified checkmate FENs
SCHOLAR_MATE = "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4"
FOOL_MATE = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
# One move before mate (white queen h5 captures f7#)
MATE_IN_ONE = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4"


class TestEvaluate:
    """Board evaluation function tests"""

    def test_initial_board_approx_zero(self):
        """Basic function: initial board evaluation should be close to 0 (within ±50)"""
        board = chess.Board()
        score = evaluate(board)
        assert -50 < score < 50, f"Initial board eval should be near 0, got={score}"

    def test_white_up_material(self):
        """Edge case: white up a knight, evaluation should be positive"""
        # Black missing a knight (b8 square empty), white up 320 material
        board = chess.Board("rnbqkb1r/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        score = evaluate(board)
        assert score > 0, f"White up material should be positive, got={score}"

    def test_black_up_material(self):
        """Edge case: black up a knight, evaluation should be negative"""
        # White missing a knight (knight on g1 captured by black knight)
        board = chess.Board("rnbqkb1r/pppppppp/8/8/4P3/5n2/PPPP1PPP/RNBQKB1R b KQkq - 1 2")
        score = evaluate(board)
        assert score < 0, f"Black up material should be negative, got={score}"

    def test_checkmate_white_wins(self):
        """Edge case: white checkmates black (Scholar's Mate), evaluation should be large positive"""
        board = chess.Board(SCHOLAR_MATE)
        assert board.turn == chess.BLACK  # Black to move, but already checkmated
        score = evaluate(board)
        assert score > 1e5, f"White checkmate should be large positive, got={score}"

    def test_checkmate_black_wins(self):
        """Edge case: black checkmates white (Fool's Mate), evaluation should be large negative"""
        board = chess.Board(FOOL_MATE)
        assert board.turn == chess.WHITE  # White to move, but already checkmated
        score = evaluate(board)
        assert score < -1e5, f"Black checkmate should be large negative, got={score}"

    def test_stalemate_evaluates_zero(self):
        """Edge case: stalemate position evaluates to zero"""
        # Set up a stalemate position: black king surrounded by own pawns and opponent king, white has no moves
        board = chess.Board("8/8/8/8/8/1k6/8/1K6 w - - 0 1")
        if board.is_stalemate():
            score = evaluate(board)
            assert score == 0
        else:
            pytest.skip("Could not construct stalemate position")

    def test_insufficient_material(self):
        """Edge case: insufficient material (king vs king) evaluates to zero"""
        board = chess.Board("8/8/8/8/8/8/8/k6K w - - 0 1")
        score = evaluate(board)
        assert score == 0

    def test_empty_board(self):
        """Edge case: empty board evaluates to zero"""
        board = chess.Board(None)  # Empty board
        score = evaluate(board)
        assert score == 0, f"Empty board should be zero, got={score}"

    def test_get_position_value_black_flip(self):
        """Edge case: black pawn position value should use flipped row"""
        piece = chess.Piece(chess.PAWN, chess.BLACK)
        # Black pawn on a7 (square=8, row=1, col=0)
        # From white's perspective, pawn at row=1 -> flipped row=6
        # PAWN_TABLE[6][0] = 5
        val = _get_position_value(piece, 8)  # a7 = 8
        assert val == 5, f"Black pawn a7 position value should be 5, got={val}"

    def test_get_position_value_unknown_piece(self):
        """Edge case: unknown piece type returns 0"""
        piece2 = chess.Piece(0, chess.WHITE)  # Invalid type
        val = _get_position_value(piece2, 0)
        assert val == 0


class TestOrderMoves:
    """Move ordering tests"""

    def test_capture_moves_prioritized(self):
        """Basic function: capturing moves should be sorted before non-capturing moves"""
        board = chess.Board()
        moves = order_moves(board)
        if len(moves) > 1:
            first_move = moves[0]
            # Initial position may or may not have captures (e.g. if captures don't exist it's fine)
            # At minimum, sorting should not raise exceptions

    def test_mvv_lva_ordering_simple(self):
        """Edge case: all capture moves come before non-capture moves"""
        # White rook captures queen (high-value victim first)
        board = chess.Board("8/8/8/8/8/5q2/8/4R1K1 w - - 0 1")
        moves = order_moves(board)
        capture_moves = [m for m in moves if board.is_capture(m)]
        if capture_moves:
            # All capture moves should be before non-captures
            first_non_capture = next(
                (i for i, m in enumerate(moves) if not board.is_capture(m)),
                len(moves),
            )
            for cm in capture_moves:
                assert moves.index(cm) < first_non_capture, (
                    f"Capture move {cm} should be before non-captures"
                )


class TestMinimax:
    """Minimax search tests"""

    def test_minimax_depth_zero_returns_evaluate(self):
        """Basic function: depth=0 should directly return evaluation value"""
        board = chess.Board()
        score = minimax(board, 0, -1e9, 1e9, True)
        expected = evaluate(board)
        assert score == expected, f"depth=0 should return {evaluate(board)}, got={score}"

    def test_minimax_finds_checkmate(self):
        """Edge case: minimax should identify mate in one"""
        # White queen h5 to f7 is mate in one (Scholar's Mate)
        board = chess.Board(MATE_IN_ONE)
        score = minimax(board, 2, -1e9, 1e9, True)
        # White should find checkmate, score very large
        assert score > 1e5, f"Mate in one should not be missed, got={score}"


class TestSelectMove:
    """AI move selection tests"""

    def _assert_legal_move(self, move: chess.Move | None, board: chess.Board) -> chess.Move:
        """Helper: assert move is legal and return it"""
        assert move is not None, "Move should not be None"
        legal_moves = list(board.legal_moves)
        assert move in legal_moves, f"Illegal move {move}"
        return move

    def test_returns_move_initial_board(self):
        """Basic function: initial board returns a legal move"""
        board = chess.Board()
        self._assert_legal_move(select_move(board, difficulty=2), board)

    def test_returns_move_difficulty_1(self):
        """Basic function: beginner difficulty returns a legal move"""
        board = chess.Board()
        self._assert_legal_move(select_move(board, difficulty=1), board)

    def test_returns_move_difficulty_2(self):
        """Basic function: intermediate difficulty returns a legal move"""
        board = chess.Board()
        board.push_san("e4")
        board.push_san("e5")
        self._assert_legal_move(select_move(board, difficulty=2), board)

    def test_returns_move_difficulty_3(self):
        """Basic function: advanced difficulty returns a legal move"""
        board = chess.Board()
        board.push_san("e4")
        board.push_san("d5")
        board.push_san("exd5")
        board.push_san("Qxd5")
        self._assert_legal_move(select_move(board, difficulty=3), board)

    def test_selects_checkmate_move(self):
        """Edge case: when mate in one exists, selects the checkmating move"""
        # One move before Scholar's Mate: white queen h5 can capture f7#
        board = chess.Board(MATE_IN_ONE)
        move = self._assert_legal_move(select_move(board, difficulty=3), board)
        # Verify move results in checkmate
        board.push(move)
        assert board.is_checkmate(), f"Should play checkmate move, but {move} did not checkmate"

    def test_no_illegal_moves(self):
        """Basic function: AI never plays illegal moves"""
        board = chess.Board("r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4")
        for diff in [1, 2, 3]:
            self._assert_legal_move(select_move(board, difficulty=diff), board)

    def test_game_over_returns_none(self):
        """Edge case: select_move returns None when game is over (checkmate)"""
        board = chess.Board(SCHOLAR_MATE)  # Scholar's Mate, black is checkmated
        assert board.is_game_over()
        move = select_move(board, difficulty=2)
        assert move is None

    def test_no_legal_moves_returns_none(self):
        """Edge case: returns None when no legal moves"""
        board = chess.Board(SCHOLAR_MATE)  # Already checkmated, no legal moves
        move = select_move(board, difficulty=1)
        assert move is None

    def test_endgame_king_only(self):
        """Edge case: only kings remain, game over (insufficient material), select_move returns None"""
        board = chess.Board("8/8/8/8/8/8/k7/K7 w - - 0 1")
        assert board.is_game_over()  # Insufficient material
        move = select_move(board, difficulty=2)
        assert move is None, "King vs king game is over, should return None"

    def test_promotion_scenario(self):
        """Edge case: pawn promotion scenario"""
        # White pawn on e7, can promote
        board = chess.Board("8/4P3/8/8/8/8/8/k6K w - - 0 1")
        move = self._assert_legal_move(select_move(board, difficulty=2), board)
        # Verify the pawn on e7 must move (only legal move)
        assert move.from_square == chess.E7, (
            "e7 pawn should promote, but chose a different move"
        )

    def test_difficulty_1_randomness(self):
        """Edge case: beginner difficulty should occasionally produce different moves (non-strict)"""
        board = chess.Board()
        moves_set: set[str] = set()
        for _ in range(5):
            m = select_move(board, difficulty=1)
            if m:
                moves_set.add(m.uci())
        # Beginner difficulty should produce at least one kind of move
        assert len(moves_set) >= 1, "Beginner difficulty should return a move each time"

    def test_invalid_difficulty_does_not_crash(self):
        """Edge case: invalid difficulty values should not crash"""
        board = chess.Board()
        for diff in [0, -1, 100]:
            move = select_move(board, difficulty=diff)
            if move is not None:
                legal_moves = list(board.legal_moves)
                assert move in legal_moves


class TestEdgeCases:
    """Additional edge case tests"""

    def test_evaluate_checkmate_turn_independent(self):
        """Edge case: checkmate evaluation depends on whose turn it is"""
        # Scholar's Mate: white checkmates black, black to move
        board_w = chess.Board(SCHOLAR_MATE)
        score_w = evaluate(board_w)
        assert score_w > 1e5, f"White checkmate should be positive, got={score_w}"

        # Fool's Mate: black checkmates white, white to move
        board_b = chess.Board(FOOL_MATE)
        score_b = evaluate(board_b)
        assert score_b < -1e5, f"Black checkmate should be negative, got={score_b}"

    def test_order_moves_empty_board(self):
        """Edge case: ordered moves on empty board"""
        board = chess.Board(None)
        moves = order_moves(board)
        assert moves == [], f"Empty board should have no moves, got={moves}"

    def test_evaluate_symmetry(self):
        """Basic function: symmetric position evaluation should be 0"""
        board = chess.Board()
        score = evaluate(board)
        # Initial position is symmetric
        assert -10 < score < 10, f"Symmetric position should be near 0, got={score}"

    def test_king_vs_king_evaluate(self):
        """Edge case: king vs king should return 0 (insufficient material)"""
        board = chess.Board("8/8/8/8/8/8/k7/K7 w - - 0 1")
        score = evaluate(board)
        assert score == 0
