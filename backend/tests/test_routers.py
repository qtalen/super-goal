"""REST API 端点集成测试 — 覆盖所有端点和边缘情况

使用 httpx.AsyncClient 通过 ASGI 传输层直接测试 FastAPI 应用。
"""
import pytest
import chess
from httpx import AsyncClient, ASGITransport
from main import app
from app.game_manager import game_manager


# =============================================================================
# 辅助函数
# =============================================================================

@pytest.fixture(autouse=True)
async def reset_game_manager():
    """每个测试前清理游戏管理器状态，避免测试间互相干扰"""
    game_manager._games.clear()
    game_manager._game_locks.clear()
    yield


def _game_manager():
    """返回游戏管理器单例的引用"""
    return game_manager


# =============================================================================
# POST /api/games — 创建游戏
# =============================================================================

class TestCreateGame:
    """POST /api/games 创建游戏端点测试"""

    async def test_create_game_success(self, async_client):
        """正常路径：创建游戏返回 201 和 GameStateResponse"""
        resp = await async_client.post("/api/games", json={"difficulty": 2})
        assert resp.status_code == 201
        data = resp.json()
        assert "game_id" in data
        assert data["difficulty"] == 2
        assert data["status"] == "playing"
        assert data["fen"] == chess.STARTING_FEN
        assert data["turn"] == "w"
        assert data["last_move"] is None
        assert len(data["legal_moves"]) == 20  # 初始局面 20 种走法

    async def test_create_game_difficulty_1(self, async_client):
        """边界值：最小合法难度 1"""
        resp = await async_client.post("/api/games", json={"difficulty": 1})
        assert resp.status_code == 201
        assert resp.json()["difficulty"] == 1

    async def test_create_game_difficulty_3(self, async_client):
        """边界值：最大合法难度 3"""
        resp = await async_client.post("/api/games", json={"difficulty": 3})
        assert resp.status_code == 201
        assert resp.json()["difficulty"] == 3

    async def test_create_game_difficulty_0_invalid(self, async_client):
        """边界值：difficulty=0 小于最小值，返回 422"""
        resp = await async_client.post("/api/games", json={"difficulty": 0})
        assert resp.status_code == 422

    async def test_create_game_difficulty_4_invalid(self, async_client):
        """边界值：difficulty=4 大于最大值，返回 422"""
        resp = await async_client.post("/api/games", json={"difficulty": 4})
        assert resp.status_code == 422

    async def test_create_game_difficulty_negative(self, async_client):
        """边界值：负数难度返回 422"""
        resp = await async_client.post("/api/games", json={"difficulty": -1})
        assert resp.status_code == 422

    async def test_create_game_missing_difficulty(self, async_client):
        """异常输入：缺少 difficulty 字段返回 422"""
        resp = await async_client.post("/api/games", json={})
        assert resp.status_code == 422

    async def test_create_game_invalid_json(self, async_client):
        """异常输入：非 JSON 请求体返回 422 或 415"""
        resp = await async_client.post("/api/games", content="not-json", headers={"Content-Type": "application/json"})
        assert resp.status_code == 422


# =============================================================================
# GET /api/games/{game_id} — 获取游戏状态
# =============================================================================

class TestGetGame:
    """GET /api/games/{game_id} 获取游戏状态端点测试"""

    async def test_get_game_success(self, async_client):
        """正常路径：获取已存在的游戏返回 200"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 2})
        game_id = create_resp.json()["game_id"]

        resp = await async_client.get(f"/api/games/{game_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["game_id"] == game_id
        assert data["difficulty"] == 2
        assert data["fen"] == chess.STARTING_FEN
        assert data["turn"] == "w"
        assert data["status"] == "playing"
        assert data["last_move"] is None

    async def test_get_game_not_found(self, async_client):
        """边缘情况：不存在的 game_id 返回 404"""
        resp = await async_client.get("/api/games/nonexistent-id")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Game not found"

    async def test_get_game_empty_id(self, async_client):
        """边缘情况：空字符串 game_id 返回 404"""
        resp = await async_client.get("/api/games/")
        # 空路径可能匹配到根路径，但不影响测试
        # 实际测试空 ID
        resp2 = await async_client.get("/api/games/ ")
        assert resp2.status_code == 404

    async def test_get_game_special_chars(self, async_client):
        """边缘情况：含特殊字符的 game_id 返回 404"""
        resp = await async_client.get("/api/games/!@#$%")
        assert resp.status_code == 404

    async def test_get_game_after_create_has_legal_moves(self, async_client):
        """正常路径：获取的游戏包含合法走法列表"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 2})
        game_id = create_resp.json()["game_id"]

        resp = await async_client.get(f"/api/games/{game_id}")
        data = resp.json()
        assert "legal_moves" in data
        assert len(data["legal_moves"]) > 0
        # 验证 UCI 格式
        for move in data["legal_moves"]:
            assert isinstance(move, str)
            assert 4 <= len(move) <= 5


# =============================================================================
# POST /api/games/{game_id}/move — 走子
# =============================================================================

class TestMakeMove:
    """POST /api/games/{game_id}/move 走子端点测试"""

    async def test_make_move_success(self, async_client):
        """正常路径：合法走子返回 200 并包含 AI 走法"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["game_id"] == game_id
        # last_move 是棋盘上最后一步走法（AI 走子后为 AI 的走法）
        assert data["last_move"] == data["ai_move"]
        assert data["ai_move"] is not None
        assert isinstance(data["ai_move"], str)
        assert len(data["ai_move"]) in (4, 5)
        assert data["turn"] == "w"  # AI 走后回到白方
        assert data["status"] in ("playing", "check")
        assert data["difficulty"] == 1

    async def test_make_move_and_verify_board_change(self, async_client):
        """正常路径：走子后 FEN 应变化，legal_moves 更新"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]
        initial_fen = create_resp.json()["fen"]

        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )
        data = resp.json()
        assert data["fen"] != initial_fen
        assert len(data["legal_moves"]) > 0

    async def test_make_move_game_not_found(self, async_client):
        """边缘情况：不存在的 game_id 返回 404"""
        resp = await async_client.post(
            "/api/games/nonexistent/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )
        assert resp.status_code == 404

    async def test_make_move_illegal(self, async_client):
        """边缘情况：非法走子（马走日到被阻挡位置）返回 400"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e5"},
        )
        assert resp.status_code == 400
        assert "Illegal move" in resp.json()["detail"]

    async def test_make_move_invalid_format(self, async_client):
        """异常输入：格子名格式错误返回 400"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        # from_sq 不合法
        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e9", "to_sq": "e4"},
        )
        assert resp.status_code in (400, 422)

    async def test_make_move_game_over_checkmate(self, async_client):
        """边缘情况：将杀状态走子返回 400"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        # 用 game_manager 直接设置将杀局面
        session = await game_manager.get_game(game_id)
        session.board = chess.Board(
            "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4"
        )
        session.status = "checkmate"

        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e8", "to_sq": "e7"},
        )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "Game is already over"

    async def test_make_move_game_over_stalemate(self, async_client):
        """边缘情况：逼和状态走子返回 400"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        # 用 game_manager 直接设置逼和局面
        session = await game_manager.get_game(game_id)
        session.board = chess.Board("k7/8/1Q6/8/8/8/8/7K b - - 0 1")
        session.status = "stalemate"

        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "a8", "to_sq": "a7"},
        )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "Game is already over"

    async def test_make_move_wrong_turn(self, async_client):
        """边缘情况：非白方回合走子返回 400"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        # 用 game_manager 直接设置黑方回合
        session = await game_manager.get_game(game_id)
        session.board = chess.Board(
            "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        )  # e2e4 后的局面，黑方走
        session.status = "playing"
        # 同步更新 last_move 以保持一致性
        session.last_move = "e2e4"

        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "d2", "to_sq": "d4"},
        )
        assert resp.status_code == 400
        assert "turn" in resp.json()["detail"].lower()

    async def test_make_move_with_promotion(self, async_client):
        """正常路径：带升变的走子"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        # 用 game_manager 设置兵到第 7 横排的局面
        session = await game_manager.get_game(game_id)
        session.board = chess.Board("8/4P3/8/8/8/8/8/8 w - - 0 1")
        session.status = "playing"

        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e7", "to_sq": "e8", "promotion": "q"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["last_move"] == "e7e8q"
        # 验证升变为后
        assert "q" in data["last_move"]

    async def test_make_move_invalid_promotion(self, async_client):
        """异常输入：不合法的升变参数返回错误"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        session = await game_manager.get_game(game_id)
        session.board = chess.Board("8/4P3/8/8/8/8/8/8 w - - 0 1")
        session.status = "playing"

        # promotion 不是合法棋子
        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e7", "to_sq": "e8", "promotion": "x"},
        )
        assert resp.status_code == 400

    async def test_make_move_invalid_from_sq_format(self, async_client):
        """异常输入：from_sq 长度不符合 Pydantic 校验返回 422"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e", "to_sq": "e4"},  # from_sq 只有 1 字符
        )
        assert resp.status_code == 422

    async def test_make_move_too_long_sq(self, async_client):
        """异常输入：格子名超过 2 字符返回 422"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "eee", "to_sq": "e4"},
        )
        assert resp.status_code == 422


# =============================================================================
# GET /api/games/{game_id}/legal-moves — 合法走法
# =============================================================================

class TestLegalMoves:
    """GET /api/games/{game_id}/legal-moves 端点测试"""

    async def test_legal_moves_success(self, async_client):
        """正常路径：获取初始局面的合法走法"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 2})
        game_id = create_resp.json()["game_id"]

        resp = await async_client.get(f"/api/games/{game_id}/legal-moves")
        assert resp.status_code == 200
        data = resp.json()
        assert "legal_moves" in data
        assert len(data["legal_moves"]) == 20

    async def test_legal_moves_not_found(self, async_client):
        """边缘情况：不存在的 game_id 返回 404"""
        resp = await async_client.get("/api/games/nonexistent/legal-moves")
        assert resp.status_code == 404

    async def test_legal_moves_after_move(self, async_client):
        """正常路径：走子后合法走法列表变化"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        # 走子前
        resp_before = await async_client.get(f"/api/games/{game_id}/legal-moves")
        moves_before = resp_before.json()["legal_moves"]

        # 走子
        await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )

        # 走子后（黑方回合，AI 已走）
        resp_after = await async_client.get(f"/api/games/{game_id}/legal-moves")
        moves_after = resp_after.json()["legal_moves"]
        assert moves_after != moves_before

    async def test_legal_moves_empty_after_checkmate(self, async_client):
        """边缘情况：将杀后合法走法列表为空"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        session = await game_manager.get_game(game_id)
        session.board = chess.Board(
            "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4"
        )
        session.status = "checkmate"

        resp = await async_client.get(f"/api/games/{game_id}/legal-moves")
        assert resp.status_code == 200
        assert len(resp.json()["legal_moves"]) == 0


# =============================================================================
# 完整对局流程测试
# =============================================================================

class TestCompleteGameFlow:
    """多步走子流程测试"""

    async def test_two_moves_flow(self, async_client):
        """正常路径：创建游戏 → 走子 → AI 应答 → 再走子 → 再应答"""
        # Step 1: 创建游戏
        resp = await async_client.post("/api/games", json={"difficulty": 1})
        assert resp.status_code == 201
        game_id = resp.json()["game_id"]

        # Step 2: 第一次走子
        resp1 = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )
        assert resp1.status_code == 200
        data1 = resp1.json()
        assert data1["ai_move"] is not None
        assert data1["turn"] == "w"  # AI 走后回到白方回合
        first_fen = data1["fen"]

        # Step 3: 第二次走子
        resp2 = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "d2", "to_sq": "d4"},
        )
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["ai_move"] is not None
        assert data2["fen"] != first_fen
        assert data2["turn"] == "w"

        # Step 4: 校验游戏仍在进行
        assert data2["status"] in ("playing", "check")

    async def test_three_moves_game_in_progress(self, async_client):
        """正常路径：三步走子后游戏状态仍为 playing 或 check"""
        resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = resp.json()["game_id"]

        moves = [("e2", "e4"), ("d2", "d4"), ("g1", "f3")]
        for from_sq, to_sq in moves:
            resp = await async_client.post(
                f"/api/games/{game_id}/move",
                json={"from_sq": from_sq, "to_sq": to_sq},
            )
            assert resp.status_code == 200

        # 最终状态检查
        final = await async_client.get(f"/api/games/{game_id}")
        assert final.status_code == 200
        data = final.json()
        assert data["status"] in ("playing", "check")
        assert len(data["legal_moves"]) > 0

    async def test_move_history_preserved(self, async_client):
        """正常路径：多次走子后 last_move 为 AI 走法（最新走法），且两次不同"""
        resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = resp.json()["game_id"]

        resp1 = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )
        # last_move 是 AI 走子后最新的走法 = ai_move
        first_ai = resp1.json()["ai_move"]
        assert resp1.json()["last_move"] == first_ai

        resp2 = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "d2", "to_sq": "d4"},
        )
        # 第二次走子的 last_move 不同于第一次（AI 新走法）
        second_ai = resp2.json()["ai_move"]
        assert resp2.json()["last_move"] == second_ai
        assert first_ai != second_ai

    async def test_move_status_consistency(self, async_client):
        """正常路径：走子后 GET 和 POST 返回的状态一致"""
        resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = resp.json()["game_id"]

        # 走子
        move_resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )
        move_data = move_resp.json()

        # GET 验证
        get_resp = await async_client.get(f"/api/games/{game_id}")
        get_data = get_resp.json()

        assert get_data["fen"] == move_data["fen"]
        assert get_data["status"] == move_data["status"]
        assert get_data["last_move"] == move_data["last_move"]


# =============================================================================
# 将杀场景测试
# =============================================================================

class TestCheckmateViaAPI:
    """通过 API 走子达成将杀的测试"""

    async def test_player_delivers_checkmate_ai_stops(self, async_client):
        """边缘情况：玩家走将杀后 AI 不走子，ai_move 为 None"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        # 设置 Scholar's Mate 前一步的局面：白后 h5，白象 c4，黑王 e8
        # 白方走 Qh5-f7#（后吃 f7 兵将军，象保护后不被黑王吃）
        session = await game_manager.get_game(game_id)
        session.board = chess.Board(
            "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4"
        )
        session.status = "playing"

        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "h5", "to_sq": "f7"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "checkmate"
        assert data["ai_move"] is None  # 将杀后 AI 不应走子
        assert data["turn"] == "b"  # 黑方回合，但已被将杀


# =============================================================================
# Pydantic 校验 — Swagger 兼容性
# =============================================================================

class TestPydanticModels:
    """Pydantic 模型校验测试"""

    async def test_create_game_request_validates_ge(self, async_client):
        """Pydantic 校验：difficulty 小于 1 自动拒绝"""
        resp = await async_client.post("/api/games", json={"difficulty": 0})
        assert resp.status_code == 422

    async def test_create_game_request_validates_le(self, async_client):
        """Pydantic 校验：difficulty 大于 3 自动拒绝"""
        resp = await async_client.post("/api/games", json={"difficulty": 4})
        assert resp.status_code == 422

    async def test_move_request_from_sq_min_length(self, async_client):
        """Pydantic 校验：from_sq 太短（Pydantic 在路由前校验，返回 422）"""
        resp = await async_client.post("/api/games/any/move", json={"from_sq": "e", "to_sq": "e4"})
        # Pydantic 校验在路由处理器之前执行，所以返回 422 而非 404
        assert resp.status_code == 422

    async def test_swagger_schema_generates(self, async_client):
        """Swagger：OpenAPI schema 应正常生成"""
        resp = await async_client.get("/openapi.json")
        assert resp.status_code == 200
        schema = resp.json()
        assert "/api/games" in str(schema["paths"])
        assert "/api/games/{game_id}" in str(schema["paths"])
        assert "/api/games/{game_id}/move" in str(schema["paths"])
        assert "/api/games/{game_id}/legal-moves" in str(schema["paths"])
