"""端到端集成测试 — 验证后端 API 完整流程

通过 httpx.AsyncClient + ASGITransport 直接测试 FastAPI 应用，
覆盖创建游戏、走子、AI 应答、状态查询等完整场景。
"""
import pytest
from httpx import AsyncClient
from app.game_manager import game_manager


# =============================================================================
# /health 健康检查
# =============================================================================

class TestHealthEndpoint:
    """健康检查端点测试"""

    async def test_health_returns_ok(self, async_client: AsyncClient):
        """正常路径：/health 返回 status: ok"""
        resp = await async_client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    async def test_root_returns_message(self, async_client: AsyncClient):
        """正常路径：/ 返回 API 信息"""
        resp = await async_client.get("/")
        assert resp.status_code == 200
        assert "message" in resp.json()


# =============================================================================
# 完整对局流程
# =============================================================================

class TestFullGameFlow:
    """完整对局流程集成测试"""

    @pytest.fixture(autouse=True)
    async def reset_games(self):
        """每个测试前清理游戏状态"""
        game_manager._games.clear()
        game_manager._game_locks.clear()
        yield

    async def test_full_game_flow(self, async_client: AsyncClient):
        """正常路径：创建游戏 → 走子 → AI 应答 → 再走子 → 获取状态"""
        # Step 1: 创建游戏
        resp = await async_client.post("/api/games", json={"difficulty": 2})
        assert resp.status_code == 201
        data = resp.json()
        game_id = data["game_id"]
        assert data["turn"] == "w"
        assert data["status"] == "playing"
        assert len(data["legal_moves"]) == 20  # 初始 20 种走法

        # Step 2: 走子 e2e4 — 白方走 e4，AI（黑方）应答
        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["turn"] == "w"  # AI 走后回到白方回合
        assert data["ai_move"] is not None  # AI 应有应答
        assert len(data["ai_move"]) in (4, 5)  # UCI 格式
        assert data["status"] in ("playing", "check")

        # Step 3: 再走子 d2d4
        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "d2", "to_sq": "d4"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["turn"] == "w"
        assert data["ai_move"] is not None

        # Step 4: 获取游戏状态
        resp = await async_client.get(f"/api/games/{game_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["game_id"] == game_id
        assert data["status"] in ("playing", "check", "checkmate", "stalemate", "draw")
        assert "legal_moves" in data

        # Step 5: 获取合法走法
        resp = await async_client.get(f"/api/games/{game_id}/legal-moves")
        assert resp.status_code == 200
        assert "legal_moves" in resp.json()
        assert len(resp.json()["legal_moves"]) > 0

    async def test_consecutive_moves(self, async_client: AsyncClient):
        """正常路径：连续三步走子"""
        resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = resp.json()["game_id"]

        for from_sq, to_sq in [("e2", "e4"), ("d2", "d4"), ("g1", "f3")]:
            resp = await async_client.post(
                f"/api/games/{game_id}/move",
                json={"from_sq": from_sq, "to_sq": to_sq},
            )
            assert resp.status_code == 200
            assert resp.json()["ai_move"] is not None

    async def test_game_state_consistency(self, async_client: AsyncClient):
        """正常路径：多次 GET 返回一致的游戏状态"""
        resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = resp.json()["game_id"]

        # 走子前两次获取应该一致
        state1 = (await async_client.get(f"/api/games/{game_id}")).json()
        state2 = (await async_client.get(f"/api/games/{game_id}")).json()
        assert state1["fen"] == state2["fen"]
        assert state1["turn"] == state2["turn"]

        # 走子后状态应变化
        await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )
        state3 = (await async_client.get(f"/api/games/{game_id}")).json()
        assert state3["fen"] != state1["fen"]


# =============================================================================
# Swagger / OpenAPI 文档
# =============================================================================

class TestSwaggerDocs:
    """OpenAPI 文档测试"""

    async def test_swagger_docs_available(self, async_client: AsyncClient):
        """正常路径：Swagger 文档可访问"""
        resp = await async_client.get("/docs")
        assert resp.status_code == 200
        assert "text/html" in resp.headers.get("content-type", "")

    async def test_openapi_json(self, async_client: AsyncClient):
        """正常路径：OpenAPI JSON schema 包含全部端点"""
        resp = await async_client.get("/openapi.json")
        assert resp.status_code == 200
        schema = resp.json()
        paths = str(schema["paths"])
        assert "/api/games" in paths
        assert "/health" in paths
