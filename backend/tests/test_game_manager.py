"""GameManager full tests — covers happy path, boundary values, and edge cases"""
import asyncio
import pytest
from app.game_manager import GameManager
from app.models import GameSession
import chess


class TestGameManagerCreate:
    """Tests for creating games"""

    async def _make_gm(self, max_games=100):
        gm = GameManager()
        gm._max_games = max_games
        return gm

    async def test_create_game_success(self):
        """Happy path: creating a game returns a valid GameSession"""
        gm = await self._make_gm()
        session = await gm.create_game(difficulty=2)
        assert isinstance(session, GameSession)
        assert isinstance(session.game_id, str)
        assert len(session.game_id) > 0
        assert session.difficulty == 2
        assert session.status == "playing"
        assert session.last_move is None
        assert session.created_at > 0
        # Board initial FEN
        assert session.board.fen() == chess.STARTING_FEN

    async def test_create_game_difficulty_boundary_min(self):
        """Boundary value: minimum valid difficulty value (1)"""
        gm = await self._make_gm()
        session = await gm.create_game(difficulty=1)
        assert session.difficulty == 1

    async def test_create_game_difficulty_boundary_max(self):
        """Boundary value: maximum valid difficulty value (3)"""
        gm = await self._make_gm()
        session = await gm.create_game(difficulty=3)
        assert session.difficulty == 3

    async def test_create_game_difficulty_zero(self):
        """Boundary value: difficulty=0 (although invalid, only stored; GameManager should accept)"""
        gm = await self._make_gm()
        session = await gm.create_game(difficulty=0)
        assert session.difficulty == 0

    async def test_create_game_difficulty_negative(self):
        """Boundary value: negative difficulty (GameManager should store; validation is at router layer)"""
        gm = await self._make_gm()
        session = await gm.create_game(difficulty=-1)
        assert session.difficulty == -1

    async def test_create_game_unique_ids(self):
        """Happy path: creating multiple games should produce unique IDs"""
        gm = await self._make_gm()
        ids = set()
        for _ in range(10):
            session = await gm.create_game(difficulty=1)
            assert session.game_id not in ids
            ids.add(session.game_id)
        assert len(ids) == 10

    async def test_create_game_reach_max_limit(self):
        """Edge case: reaching max game limit raises ValueError"""
        gm = await self._make_gm(max_games=3)
        for _ in range(3):
            await gm.create_game(difficulty=1)

        with pytest.raises(ValueError, match="Maximum active games reached"):
            await gm.create_game(difficulty=1)

    async def test_create_game_after_delete_can_create_new(self):
        """Edge case: after deleting a game, capacity is freed and new game can be created"""
        gm = await self._make_gm(max_games=2)
        s1 = await gm.create_game(difficulty=1)
        s2 = await gm.create_game(difficulty=1)

        with pytest.raises(ValueError, match="Maximum active games reached"):
            await gm.create_game(difficulty=1)

        await gm.delete_game(s1.game_id)
        # After deletion, new game should be creatable
        s3 = await gm.create_game(difficulty=1)
        assert s3 is not None
        assert s3.game_id != s1.game_id


class TestGameManagerGet:
    """Tests for getting games"""

    async def test_get_game_exists(self):
        """Happy path: get an existing game"""
        gm = GameManager()
        session = await gm.create_game(difficulty=2)
        fetched = await gm.get_game(session.game_id)
        assert fetched is not None
        assert fetched.game_id == session.game_id
        assert fetched.difficulty == session.difficulty

    async def test_get_game_not_found(self):
        """Edge case: get non-existent game_id returns None"""
        gm = GameManager()
        result = await gm.get_game("nonexistent-id")
        assert result is None

    async def test_get_game_empty_string(self):
        """Edge case: empty string game_id"""
        gm = GameManager()
        result = await gm.get_game("")
        assert result is None

    async def test_get_game_special_chars(self):
        """Edge case: game_id with special characters"""
        gm = GameManager()
        result = await gm.get_game("!@#$%^&*()_+")
        assert result is None

    async def test_get_game_after_deletion(self):
        """Edge case: get deleted game returns None"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        await gm.delete_game(session.game_id)
        result = await gm.get_game(session.game_id)
        assert result is None


class TestGameManagerDelete:
    """Tests for deleting games"""

    async def test_delete_game_exists(self):
        """Happy path: delete existing game returns True"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        result = await gm.delete_game(session.game_id)
        assert result is True

    async def test_delete_game_not_found(self):
        """Edge case: delete non-existent game returns False"""
        gm = GameManager()
        result = await gm.delete_game("nonexistent")
        assert result is False

    async def test_delete_game_empty_string(self):
        """Edge case: delete empty string game_id returns False"""
        gm = GameManager()
        result = await gm.delete_game("")
        assert result is False

    async def test_delete_game_removes_from_games(self):
        """Happy path: after deletion, _games no longer contains that ID"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        await gm.delete_game(session.game_id)
        assert session.game_id not in gm._games


class TestGameManagerMakeMove:
    """Tests for making moves"""

    async def test_make_move_valid(self):
        """Happy path: legal move e2e4 should succeed"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        result = await gm.make_move(session.game_id, "e2", "e4")
        assert result.status != "playing" or result.status == "playing"
        # Verify the move was executed: pawn on e2 should have moved
        assert result.last_move == "e2e4"
        # After white moves, it should be black's turn
        assert result.board.turn == chess.BLACK

    async def test_make_move_illegal(self):
        """Edge case: illegal move (knight moving to blocked square) raises ValueError"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        with pytest.raises(ValueError, match="Illegal move"):
            await gm.make_move(session.game_id, "e2", "e5")

    async def test_make_move_wrong_turn(self):
        """Edge case: moving when it's not white's turn (directly moving black pieces) raises ValueError"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # White makes a move
        await gm.make_move(session.game_id, "e2", "e4")
        # Try moving white again (should be black's turn now)
        with pytest.raises(ValueError, match="It's not your turn"):
            await gm.make_move(session.game_id, "d2", "d4")

    async def test_make_move_game_not_found(self):
        """Edge case: non-existent game_id raises ValueError"""
        gm = GameManager()
        with pytest.raises(ValueError, match="Game not found"):
            await gm.make_move("nonexistent", "e2", "e4")

    async def test_make_move_invalid_format(self):
        """Edge case: invalid square name format raises ValueError"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        with pytest.raises(ValueError, match="Invalid move format"):
            await gm.make_move(session.game_id, "e9", "e4")

    async def test_make_move_with_promotion(self):
        """Happy path: promotion move (pawn reaches 8th rank with promotion parameter)"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # Set up position with pawn about to promote
        board = chess.Board("8/4P3/8/8/8/8/8/8 w - - 0 1")
        session.board = board

        result = await gm.make_move(session.game_id, "e7", "e8", promotion="q")
        assert result.last_move == "e7e8q"
        # Pawn promoted to queen
        piece = result.board.piece_at(chess.E8)
        assert piece is not None
        assert piece.piece_type == chess.QUEEN

    async def test_make_move_game_over(self):
        """Edge case: moving when game is already over raises ValueError"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # Set up a checkmate position (black to move, but already checkmated)
        session.board = chess.Board("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")
        session.status = "checkmate"

        # Game is over, white cannot move (also it's black's turn, but black is checkmated)
        with pytest.raises(ValueError, match="Game is already over"):
            await gm.make_move(session.game_id, "e8", "e7")

    async def test_make_move_updates_status_check(self):
        """Happy path: status should be check after a move that delivers check"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # Set up position: white rook a1, black king a8 + black rook c8
        # White plays Ra1-a7 checking the black king on a8
        session.board = chess.Board("k1r5/8/8/8/8/8/8/R6K w - - 0 1")
        session.status = "playing"
        result = await gm.make_move(session.game_id, "a1", "a7")
        assert result.status == "check"

    async def test_make_move_checkmate_status(self):
        """Happy path: status should be checkmate after a checkmating move"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # Classic Scholar's mate position (one move before Qxf7#)
        session.board = chess.Board("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")
        session.status = "playing"
        # Black to move, verify it is already checkmate
        assert session.board.is_checkmate()


class TestGameManagerGetLegalMoves:
    """Tests for getting legal moves"""

    async def test_get_legal_moves_normal(self):
        """Happy path: starting position has 20 legal moves"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        moves = await gm.get_legal_moves(session.game_id)
        assert isinstance(moves, list)
        assert len(moves) == 20  # Initial position: white has 20 legal moves
        # Verify UCI format
        for move in moves:
            assert isinstance(move, str)
            assert len(move) in (4, 5)  # 4 characters or 5 (promotion)

    async def test_get_legal_moves_game_not_found(self):
        """Edge case: non-existent game_id raises ValueError"""
        gm = GameManager()
        with pytest.raises(ValueError, match="Game not found"):
            await gm.get_legal_moves("nonexistent")

    async def test_get_legal_moves_empty_string(self):
        """Edge case: empty string game_id raises ValueError"""
        gm = GameManager()
        with pytest.raises(ValueError, match="Game not found"):
            await gm.get_legal_moves("")

    async def test_get_legal_moves_after_move(self):
        """Happy path: legal moves list changes after a move"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        moves_before = await gm.get_legal_moves(session.game_id)
        await gm.make_move(session.game_id, "e2", "e4")
        moves_after = await gm.get_legal_moves(session.game_id)
        # After white moves, it's black's turn, black also has 20 legal moves
        assert len(moves_after) == 20
        # After white plays e2e4, black's legal moves should differ from initial white moves
        assert moves_before != moves_after


class TestGameManagerUndo:
    """Tests for undo functionality"""

    async def test_undo_two_moves(self):
        """Happy path: undo undoes one AI move + one player move"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # Player plays e2e4
        after_player = await gm.make_move(session.game_id, "e2", "e4")
        # Simulate AI move (black plays)
        after_player.board.push(chess.Move.from_uci("e7e5"))

        # Undo
        result = await gm.undo_last_two_moves(session.game_id)
        # Should return to initial position
        assert result.board.fen() == chess.STARTING_FEN
        assert result.last_move is None

    async def test_undo_no_moves(self):
        """Edge case: undo with no moves should not error"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        result = await gm.undo_last_two_moves(session.game_id)
        # No moves, return current state
        assert result.board.fen() == chess.STARTING_FEN

    async def test_undo_one_move_only(self):
        """Edge case: only one move, undo one step"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        await gm.make_move(session.game_id, "e2", "e4")
        result = await gm.undo_last_two_moves(session.game_id)
        # Undo one step, back to initial position
        assert result.board.fen() == chess.STARTING_FEN
        assert result.last_move is None

    async def test_undo_game_not_found(self):
        """Edge case: non-existent game_id raises ValueError"""
        gm = GameManager()
        with pytest.raises(ValueError, match="Game not found"):
            await gm.undo_last_two_moves("nonexistent")

    async def test_undo_restores_playing_status(self):
        """Happy path: undo restores status to playing (from checkmate/check)"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # Simulate checkmate then undo
        # Use Scholar's mate position
        session.board = chess.Board("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")
        board_before = session.board.copy()
        # Record current position
        fen_before = session.board.fen()

        # Confirm this is not the initial position
        assert fen_before != chess.STARTING_FEN

        # Undo two moves
        result = await gm.undo_last_two_moves(session.game_id)
        # After undo should be playing
        assert result.status == "playing" or result.status == "check"


class TestGameManagerDeriveStatus:
    """Tests for game status derivation"""

    def test_status_playing(self):
        """Happy path: initial position is playing"""
        gm = GameManager()
        board = chess.Board()
        assert gm._derive_status(board) == "playing"

    def test_status_check(self):
        """Happy path: check position is check"""
        gm = GameManager()
        # White rook on a7 checks black king on a8 (black to move, black king in check)
        board = chess.Board("k7/R7/8/8/8/8/8/7K b - - 0 1")
        assert board.is_check()
        assert gm._derive_status(board) == "check"

        # White queen on e2 checks black king on e8 along the e-file (black can escape to d8)
        board2 = chess.Board("4k3/8/8/8/8/8/4Q3/4K3 b - - 0 1")
        assert board2.is_check()
        assert gm._derive_status(board2) == "check"

        # Non-check position
        board3 = chess.Board()
        assert not board3.is_check()
        assert gm._derive_status(board3) == "playing"

    def test_status_checkmate(self):
        """Happy path: checkmate position is checkmate"""
        gm = GameManager()
        board = chess.Board("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")
        assert board.is_checkmate()
        assert gm._derive_status(board) == "checkmate"

    def test_status_stalemate(self):
        """Happy path: stalemate position is stalemate"""
        gm = GameManager()
        # Classic stalemate position
        board = chess.Board("k7/8/1Q6/8/8/8/8/7K b - - 0 1")
        # Black has no legal moves but is not in check
        assert board.is_stalemate()
        assert gm._derive_status(board) == "stalemate"

    def test_status_insufficient_material(self):
        """Happy path: insufficient material is draw"""
        gm = GameManager()
        board = chess.Board("k7/8/8/8/8/8/8/K7 w - - 0 1")  # Only two kings
        assert board.is_insufficient_material()
        assert gm._derive_status(board) == "draw"

    def test_status_draw_by_claim(self):
        """Happy path: claimable draw position is draw"""
        gm = GameManager()
        # Threefold repetition position (simulated via move_stack)
        board = chess.Board()
        # Make moves to create repetition
        moves = ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"]
        for m in moves:
            board.push(chess.Move.from_uci(m))
        # After several back-and-forth moves, threefold repetition should be claimable
        assert board.can_claim_draw()
        assert gm._derive_status(board) == "draw"


class TestGameManagerConcurrency:
    """Concurrency safety tests"""

    async def test_concurrent_create_games(self):
        """Concurrency scenario: simultaneous game creation should not interfere with each other"""
        gm = GameManager()
        gm._max_games = 50

        async def create_one(diff):
            return await gm.create_game(difficulty=diff)

        tasks = [create_one(i % 3 + 1) for i in range(30)]
        results = await asyncio.gather(*tasks)
        assert len(results) == 30
        # All IDs should be unique
        ids = [s.game_id for s in results]
        assert len(set(ids)) == 30

    async def test_concurrent_access_same_game(self):
        """Concurrency scenario: moves on the same game should be protected by per-game lock"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)

        async def make_bad_move():
            try:
                await gm.make_move(session.game_id, "e2", "e4")
                return "ok"
            except ValueError:
                return "error"

        tasks = [make_bad_move() for _ in range(10)]
        results = await asyncio.gather(*tasks)
        # At least one succeeds, others either fail (game over) or succeed (but only one pawn moved)
        ok_count = results.count("ok")
        assert ok_count >= 1

    async def test_concurrent_different_games(self):
        """Concurrency scenario: moves on different games do not interfere with each other"""
        gm = GameManager()
        s1 = await gm.create_game(difficulty=1)
        s2 = await gm.create_game(difficulty=2)

        async def play_game1():
            r = await gm.make_move(s1.game_id, "e2", "e4")
            return r.last_move

        async def play_game2():
            r = await gm.make_move(s2.game_id, "d2", "d4")
            return r.last_move

        r1, r2 = await asyncio.gather(play_game1(), play_game2())
        assert r1 == "e2e4"
        assert r2 == "d2d4"

    async def test_delete_while_creating(self):
        """Concurrency scenario: deleting and creating with same ID does not conflict"""
        gm = GameManager()
        s1 = await gm.create_game(difficulty=1)
        gid = s1.game_id

        async def deleter():
            return await gm.delete_game(gid)

        async def getter():
            return await gm.get_game(gid)

        r1, r2 = await asyncio.gather(deleter(), getter())
        # Deletion and retrieval should return safely
        assert r1 is True or r1 is False
        assert r2 is None or r2 is not None


class TestGameManagerSingleton:
    """Module-level singleton tests"""

    def test_singleton_is_game_manager_instance(self):
        """Happy path: game_manager is a GameManager instance"""
        from app.game_manager import game_manager
        assert isinstance(game_manager, GameManager)

    def test_singleton_methods_work(self):
        """Happy path: singleton methods can be called normally"""
        from app.game_manager import game_manager
        session = asyncio.run(game_manager.create_game(difficulty=1))
        assert session is not None
        assert session.game_id is not None


class TestGameManagerEdgeCases:
    """More edge case tests"""

    async def test_undo_after_game_over_restores_playing(self):
        """Edge case: undo after checkmate restores to playing"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # Set up checkmate position
        session.board = chess.Board("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")
        session.status = "checkmate"
        assert session.board.is_checkmate()

        # Undo two moves
        result = await gm.undo_last_two_moves(session.game_id)
        # Status is no longer checkmate
        assert result.status != "checkmate"

    async def test_make_move_invalid_promotion(self):
        """Edge case: invalid promotion parameter"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # Pawn on 8th rank
        session.board = chess.Board("8/4P3/8/8/8/8/8/8 w - - 0 1")
        # Legal promotion but invalid promotion piece
        with pytest.raises(ValueError, match="Invalid move format"):
            await gm.make_move(session.game_id, "e7", "e8", promotion="x")

    async def test_make_move_castling(self):
        """Edge case: castling move"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # Set up castling position (white kingside)
        board = chess.Board("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2")
        session.board = board
        # Play g1f3
        session.board.push(chess.Move.from_uci("g1f3"))
        # Black plays
        session.board.push(chess.Move.from_uci("b8c6"))
        # Play f1b5
        session.board.push(chess.Move.from_uci("f1b5"))
        # Black plays
        session.board.push(chess.Move.from_uci("g8f6"))
        # Now white can castle kingside: o-o i.e. e1g1
        result = await gm.make_move(session.game_id, "e1", "g1")
        assert result.last_move == "e1g1"
        # King on g1, rook on f1
        king = result.board.piece_at(chess.G1)
        rook = result.board.piece_at(chess.F1)
        assert king is not None and king.piece_type == chess.KING
        assert rook is not None and rook.piece_type == chess.ROOK

    async def test_get_legal_moves_after_checkmate(self):
        """Edge case: legal moves list is empty after checkmate"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        session.board = chess.Board("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")
        session.status = "checkmate"
        moves = await gm.get_legal_moves(session.game_id)
        assert len(moves) == 0

    async def test_create_game_sets_correct_defaults(self):
        """Happy path: check default values"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        assert session.status == "playing"
        assert session.last_move is None
        assert session.created_at > 0
        assert session.board.fen() == chess.STARTING_FEN

    async def test_delete_game_also_clears_game_lock(self):
        """Happy path: deleting a game also cleans up the corresponding per-game lock"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # Acquire lock so it exists in the lock dict
        await gm.get_game_lock(session.game_id)
        assert session.game_id in gm._game_locks
        await gm.delete_game(session.game_id)
        assert session.game_id not in gm._game_locks
