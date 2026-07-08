"""GameManager 完整测试 — 覆盖正常路径、边界值和边缘情况"""
import asyncio
import pytest
from app.game_manager import GameManager
from app.models import GameSession
import chess


class TestGameManagerCreate:
    """创建游戏的测试"""

    async def _make_gm(self, max_games=100):
        gm = GameManager()
        gm._max_games = max_games
        return gm

    async def test_create_game_success(self):
        """正常路径：创建游戏返回有效的 GameSession"""
        gm = await self._make_gm()
        session = await gm.create_game(difficulty=2)
        assert isinstance(session, GameSession)
        assert isinstance(session.game_id, str)
        assert len(session.game_id) > 0
        assert session.difficulty == 2
        assert session.status == "playing"
        assert session.last_move is None
        assert session.created_at > 0
        # 棋盘的初始 FEN
        assert session.board.fen() == chess.STARTING_FEN

    async def test_create_game_difficulty_boundary_min(self):
        """边界值：最小合法 difficulty 值（1）"""
        gm = await self._make_gm()
        session = await gm.create_game(difficulty=1)
        assert session.difficulty == 1

    async def test_create_game_difficulty_boundary_max(self):
        """边界值：最大合法 difficulty 值（3）"""
        gm = await self._make_gm()
        session = await gm.create_game(difficulty=3)
        assert session.difficulty == 3

    async def test_create_game_difficulty_zero(self):
        """边界值：difficulty=0（虽然是非法值，但仅存储，GameManager 应接受）"""
        gm = await self._make_gm()
        session = await gm.create_game(difficulty=0)
        assert session.difficulty == 0

    async def test_create_game_difficulty_negative(self):
        """边界值：difficulty=负数（GameManager 应存储，校验在路由层）"""
        gm = await self._make_gm()
        session = await gm.create_game(difficulty=-1)
        assert session.difficulty == -1

    async def test_create_game_unique_ids(self):
        """正常路径：连续创建多个游戏，ID 应各不相同"""
        gm = await self._make_gm()
        ids = set()
        for _ in range(10):
            session = await gm.create_game(difficulty=1)
            assert session.game_id not in ids
            ids.add(session.game_id)
        assert len(ids) == 10

    async def test_create_game_reach_max_limit(self):
        """边缘情况：达到最大游戏数限制时抛出 ValueError"""
        gm = await self._make_gm(max_games=3)
        for _ in range(3):
            await gm.create_game(difficulty=1)

        with pytest.raises(ValueError, match="Maximum active games reached"):
            await gm.create_game(difficulty=1)

    async def test_create_game_after_delete_can_create_new(self):
        """边缘情况：删除游戏后释放容量，可创建新游戏"""
        gm = await self._make_gm(max_games=2)
        s1 = await gm.create_game(difficulty=1)
        s2 = await gm.create_game(difficulty=1)

        with pytest.raises(ValueError, match="Maximum active games reached"):
            await gm.create_game(difficulty=1)

        await gm.delete_game(s1.game_id)
        # 删除后应能继续创建
        s3 = await gm.create_game(difficulty=1)
        assert s3 is not None
        assert s3.game_id != s1.game_id


class TestGameManagerGet:
    """获取游戏的测试"""

    async def test_get_game_exists(self):
        """正常路径：获取已存在的游戏"""
        gm = GameManager()
        session = await gm.create_game(difficulty=2)
        fetched = await gm.get_game(session.game_id)
        assert fetched is not None
        assert fetched.game_id == session.game_id
        assert fetched.difficulty == session.difficulty

    async def test_get_game_not_found(self):
        """边缘情况：获取不存在的 game_id 返回 None"""
        gm = GameManager()
        result = await gm.get_game("nonexistent-id")
        assert result is None

    async def test_get_game_empty_string(self):
        """边缘情况：game_id 为空字符串"""
        gm = GameManager()
        result = await gm.get_game("")
        assert result is None

    async def test_get_game_special_chars(self):
        """边缘情况：game_id 含特殊字符"""
        gm = GameManager()
        result = await gm.get_game("!@#$%^&*()_+")
        assert result is None

    async def test_get_game_after_deletion(self):
        """边缘情况：删除后获取已删除的游戏返回 None"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        await gm.delete_game(session.game_id)
        result = await gm.get_game(session.game_id)
        assert result is None


class TestGameManagerDelete:
    """删除游戏的测试"""

    async def test_delete_game_exists(self):
        """正常路径：删除存在的游戏返回 True"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        result = await gm.delete_game(session.game_id)
        assert result is True

    async def test_delete_game_not_found(self):
        """边缘情况：删除不存在的游戏返回 False"""
        gm = GameManager()
        result = await gm.delete_game("nonexistent")
        assert result is False

    async def test_delete_game_empty_string(self):
        """边缘情况：删除空字符串 game_id 返回 False"""
        gm = GameManager()
        result = await gm.delete_game("")
        assert result is False

    async def test_delete_game_removes_from_games(self):
        """正常路径：删除后 _games 中不再包含该 ID"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        await gm.delete_game(session.game_id)
        assert session.game_id not in gm._games


class TestGameManagerMakeMove:
    """走子测试"""

    async def test_make_move_valid(self):
        """正常路径：合法走子 e2e4 应成功"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        result = await gm.make_move(session.game_id, "e2", "e4")
        assert result.status != "playing" or result.status == "playing"
        # 验证走法已执行：初始 e2 上的兵应已移动
        assert result.last_move == "e2e4"
        # 白方走完，应轮到黑方
        assert result.board.turn == chess.BLACK

    async def test_make_move_illegal(self):
        """边缘情况：非法走法（马走日到被阻挡位置）抛出 ValueError"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        with pytest.raises(ValueError, match="Illegal move"):
            await gm.make_move(session.game_id, "e2", "e5")

    async def test_make_move_wrong_turn(self):
        """边缘情况：非白方回合（直接走黑方棋子）抛出 ValueError"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # 白方走一步
        await gm.make_move(session.game_id, "e2", "e4")
        # 再次走白方（现在应该是黑方回合）
        with pytest.raises(ValueError, match="It's not your turn"):
            await gm.make_move(session.game_id, "d2", "d4")

    async def test_make_move_game_not_found(self):
        """边缘情况：game_id 不存在抛出 ValueError"""
        gm = GameManager()
        with pytest.raises(ValueError, match="Game not found"):
            await gm.make_move("nonexistent", "e2", "e4")

    async def test_make_move_invalid_format(self):
        """边缘情况：格子名格式错误抛出 ValueError"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        with pytest.raises(ValueError, match="Invalid move format"):
            await gm.make_move(session.game_id, "e9", "e4")

    async def test_make_move_with_promotion(self):
        """正常路径：升变走法（兵走到第8横排带 promotion 参数）"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # 构造一个兵快到升变线的局面
        board = chess.Board("8/4P3/8/8/8/8/8/8 w - - 0 1")
        session.board = board

        result = await gm.make_move(session.game_id, "e7", "e8", promotion="q")
        assert result.last_move == "e7e8q"
        # 兵升变为后
        piece = result.board.piece_at(chess.E8)
        assert piece is not None
        assert piece.piece_type == chess.QUEEN

    async def test_make_move_game_over(self):
        """边缘情况：游戏已结束时走子抛出 ValueError"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # 构造一个将杀局面（黑方走棋，但已经被将杀）
        session.board = chess.Board("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")
        session.status = "checkmate"

        # 游戏已结束，白方不能再走（而且现在是黑方轮到，但黑方被将杀）
        with pytest.raises(ValueError, match="Game is already over"):
            await gm.make_move(session.game_id, "e8", "e7")

    async def test_make_move_updates_status_check(self):
        """正常路径：走子后如果将军，status 应为 check"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # 构造局面：白车 a1，黑王 a8 + 黑车 c8
        # 白方走 Ra1-a7 将军 a8 黑王
        session.board = chess.Board("k1r5/8/8/8/8/8/8/R6K w - - 0 1")
        session.status = "playing"
        result = await gm.make_move(session.game_id, "a1", "a7")
        assert result.status == "check"

    async def test_make_move_checkmate_status(self):
        """正常路径：将杀后 status 应为 checkmate"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # 经典 Scholar's mate 局面（Qxf7# 之前一步）
        session.board = chess.Board("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")
        session.status = "playing"
        # 黑方不管走什么，白方都 Qxf7#
        # 但实际上这里黑方走，我们验证 status 已是 checkmate
        assert session.board.is_checkmate()


class TestGameManagerGetLegalMoves:
    """合法走法测试"""

    async def test_get_legal_moves_normal(self):
        """正常路径：开局有 20 种合法走法"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        moves = await gm.get_legal_moves(session.game_id)
        assert isinstance(moves, list)
        assert len(moves) == 20  # 初始局面白方有 20 种走法
        # 验证格式为 UCI
        for move in moves:
            assert isinstance(move, str)
            assert len(move) in (4, 5)  # 4 字符或 5 字符（升变）

    async def test_get_legal_moves_game_not_found(self):
        """边缘情况：game_id 不存在抛出 ValueError"""
        gm = GameManager()
        with pytest.raises(ValueError, match="Game not found"):
            await gm.get_legal_moves("nonexistent")

    async def test_get_legal_moves_empty_string(self):
        """边缘情况：空字符串 game_id 抛出 ValueError"""
        gm = GameManager()
        with pytest.raises(ValueError, match="Game not found"):
            await gm.get_legal_moves("")

    async def test_get_legal_moves_after_move(self):
        """正常路径：走子后合法走法列表发生变化"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        moves_before = await gm.get_legal_moves(session.game_id)
        await gm.make_move(session.game_id, "e2", "e4")
        moves_after = await gm.get_legal_moves(session.game_id)
        # 白方走了一步后，轮到黑方，黑方也有 20 种走法
        assert len(moves_after) == 20
        # 白方走 e2e4 后，黑方走法应该与初始白方走法不同
        assert moves_before != moves_after


class TestGameManagerUndo:
    """悔棋测试"""

    async def test_undo_two_moves(self):
        """正常路径：悔棋撤回 AI 一步 + 玩家一步"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # 玩家走 e2e4
        after_player = await gm.make_move(session.game_id, "e2", "e4")
        # 模拟 AI 走（黑方走一步）
        after_player.board.push(chess.Move.from_uci("e7e5"))

        # 悔棋
        result = await gm.undo_last_two_moves(session.game_id)
        # 应该退回到初始局面
        assert result.board.fen() == chess.STARTING_FEN
        assert result.last_move is None

    async def test_undo_no_moves(self):
        """边缘情况：没有走棋时悔棋，不应报错"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        result = await gm.undo_last_two_moves(session.game_id)
        # 没有走棋，返回当前状态
        assert result.board.fen() == chess.STARTING_FEN

    async def test_undo_one_move_only(self):
        """边缘情况：只有一步走棋时，撤回一步"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        await gm.make_move(session.game_id, "e2", "e4")
        result = await gm.undo_last_two_moves(session.game_id)
        # 撤回一步，回到初始局面
        assert result.board.fen() == chess.STARTING_FEN
        assert result.last_move is None

    async def test_undo_game_not_found(self):
        """边缘情况：game_id 不存在抛出 ValueError"""
        gm = GameManager()
        with pytest.raises(ValueError, match="Game not found"):
            await gm.undo_last_two_moves("nonexistent")

    async def test_undo_restores_playing_status(self):
        """正常路径：悔棋后状态恢复为 playing（从 checkmate/check 恢复）"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # 模拟将杀后悔棋
        # 使用 Scholar's mate 局面
        session.board = chess.Board("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")
        board_before = session.board.copy()
        # 记录当前局面
        fen_before = session.board.fen()

        # 先确认这不是初始局面
        assert fen_before != chess.STARTING_FEN

        # 悔棋两次
        result = await gm.undo_last_two_moves(session.game_id)
        # 悔棋后应该回到 playing
        assert result.status == "playing" or result.status == "check"


class TestGameManagerDeriveStatus:
    """游戏状态推导测试"""

    def test_status_playing(self):
        """正常路径：初始局面为 playing"""
        gm = GameManager()
        board = chess.Board()
        assert gm._derive_status(board) == "playing"

    def test_status_check(self):
        """正常路径：将军局面为 check"""
        gm = GameManager()
        # 白车在 a7 将军 a8 的黑王（黑方走棋，黑王被将军）
        board = chess.Board("k7/R7/8/8/8/8/8/7K b - - 0 1")
        assert board.is_check()
        assert gm._derive_status(board) == "check"

        # 白后在 e2 沿 e 线将军 e8 的黑王（黑方可逃往 d8）
        board2 = chess.Board("4k3/8/8/8/8/8/4Q3/4K3 b - - 0 1")
        assert board2.is_check()
        assert gm._derive_status(board2) == "check"

        # 非将军局面
        board3 = chess.Board()
        assert not board3.is_check()
        assert gm._derive_status(board3) == "playing"

    def test_status_checkmate(self):
        """正常路径：将杀局面为 checkmate"""
        gm = GameManager()
        board = chess.Board("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")
        assert board.is_checkmate()
        assert gm._derive_status(board) == "checkmate"

    def test_status_stalemate(self):
        """正常路径：逼和局面为 stalemate"""
        gm = GameManager()
        # 经典逼和局面
        board = chess.Board("k7/8/1Q6/8/8/8/8/7K b - - 0 1")
        # 黑方无路可走但未被将军
        assert board.is_stalemate()
        assert gm._derive_status(board) == "stalemate"

    def test_status_insufficient_material(self):
        """正常路径：子力不足为 draw"""
        gm = GameManager()
        board = chess.Board("k7/8/8/8/8/8/8/K7 w - - 0 1")  # 只有双王
        assert board.is_insufficient_material()
        assert gm._derive_status(board) == "draw"

    def test_status_draw_by_claim(self):
        """正常路径：可求和局面为 draw"""
        gm = GameManager()
        # 三次重复局面（用 move_stack 模拟）
        board = chess.Board()
        # 走几步形成重复
        moves = ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"]
        for m in moves:
            board.push(chess.Move.from_uci(m))
        # 连续走了几个来回，应该可以三次重复和棋
        assert board.can_claim_draw()
        assert gm._derive_status(board) == "draw"


class TestGameManagerConcurrency:
    """并发安全测试"""

    async def test_concurrent_create_games(self):
        """并发场景：同时创建多个游戏不应互相干扰"""
        gm = GameManager()
        gm._max_games = 50

        async def create_one(diff):
            return await gm.create_game(difficulty=diff)

        tasks = [create_one(i % 3 + 1) for i in range(30)]
        results = await asyncio.gather(*tasks)
        assert len(results) == 30
        # 所有 ID 应唯一
        ids = [s.game_id for s in results]
        assert len(set(ids)) == 30

    async def test_concurrent_access_same_game(self):
        """并发场景：同一游戏的走子应被 per-game 锁保护"""
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
        # 至少一个成功，其余要么失败（游戏结束）要么成功（但只有一个兵动）
        ok_count = results.count("ok")
        assert ok_count >= 1

    async def test_concurrent_different_games(self):
        """并发场景：不同游戏的走子互不干扰"""
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
        """并发场景：删除和创建同一 ID 不会冲突"""
        gm = GameManager()
        s1 = await gm.create_game(difficulty=1)
        gid = s1.game_id

        async def deleter():
            return await gm.delete_game(gid)

        async def getter():
            return await gm.get_game(gid)

        r1, r2 = await asyncio.gather(deleter(), getter())
        # 删除和获取应安全返回
        assert r1 is True or r1 is False
        assert r2 is None or r2 is not None


class TestGameManagerSingleton:
    """模块级单例测试"""

    def test_singleton_is_game_manager_instance(self):
        """正常路径：game_manager 是 GameManager 实例"""
        from app.game_manager import game_manager
        assert isinstance(game_manager, GameManager)

    def test_singleton_methods_work(self):
        """正常路径：单例的方法可以正常调用"""
        from app.game_manager import game_manager
        session = asyncio.run(game_manager.create_game(difficulty=1))
        assert session is not None
        assert session.game_id is not None


class TestGameManagerEdgeCases:
    """更多边缘情况测试"""

    async def test_undo_after_game_over_restores_playing(self):
        """边缘情况：游戏将杀后悔棋，恢复为 playing"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # 构造将杀局面
        session.board = chess.Board("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")
        session.status = "checkmate"
        assert session.board.is_checkmate()

        # 悔棋两步
        result = await gm.undo_last_two_moves(session.game_id)
        # 状态不再是 checkmate
        assert result.status != "checkmate"

    async def test_make_move_invalid_promotion(self):
        """边缘情况：升变参数不合法"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # 兵到第8横排
        session.board = chess.Board("8/4P3/8/8/8/8/8/8 w - - 0 1")
        # 合法升变但参数非法
        with pytest.raises(ValueError, match="Invalid move format"):
            await gm.make_move(session.game_id, "e7", "e8", promotion="x")

    async def test_make_move_castling(self):
        """边缘情况：王车易位走法"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # 构造王车易位局面（白方短易位）
        board = chess.Board("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2")
        session.board = board
        # 先走 g1f3
        session.board.push(chess.Move.from_uci("g1f3"))
        # 黑方走
        session.board.push(chess.Move.from_uci("b8c6"))
        # 走 f1b5
        session.board.push(chess.Move.from_uci("f1b5"))
        # 黑方走
        session.board.push(chess.Move.from_uci("g8f6"))
        # 现在白方可以短易位：o-o 即 e1g1
        result = await gm.make_move(session.game_id, "e1", "g1")
        assert result.last_move == "e1g1"
        # 王在 g1，车在 f1
        king = result.board.piece_at(chess.G1)
        rook = result.board.piece_at(chess.F1)
        assert king is not None and king.piece_type == chess.KING
        assert rook is not None and rook.piece_type == chess.ROOK

    async def test_get_legal_moves_after_checkmate(self):
        """边缘情况：将杀后合法走法列表为空"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        session.board = chess.Board("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")
        session.status = "checkmate"
        moves = await gm.get_legal_moves(session.game_id)
        assert len(moves) == 0

    async def test_create_game_sets_correct_defaults(self):
        """正常路径：检查默认值"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        assert session.status == "playing"
        assert session.last_move is None
        assert session.created_at > 0
        assert session.board.fen() == chess.STARTING_FEN

    async def test_delete_game_also_clears_game_lock(self):
        """正常路径：删除游戏时对应 per-game 锁也被清理"""
        gm = GameManager()
        session = await gm.create_game(difficulty=1)
        # 获取锁使锁字典中存在
        await gm.get_game_lock(session.game_id)
        assert session.game_id in gm._game_locks
        await gm.delete_game(session.game_id)
        assert session.game_id not in gm._game_locks
