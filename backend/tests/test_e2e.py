"""End-to-end integration tests — verify backend API complete flow

Uses httpx.AsyncClient + ASGITransport to directly test the FastAPI app,
covering full scenarios: create game, make moves, AI response, status query, etc.
"""
import pytest
from httpx import AsyncClient
from app.game_manager import game_manager


# =============================================================================
# /health Health Check
# =============================================================================

class TestHealthEndpoint:
    """Health check endpoint tests"""

    async def test_health_returns_ok(self, async_client: AsyncClient):
        """Happy path: /health returns status: ok"""
        resp = await async_client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    async def test_root_returns_message(self, async_client: AsyncClient):
        """Happy path: / returns API info"""
        resp = await async_client.get("/")
        assert resp.status_code == 200
        assert "message" in resp.json()


# =============================================================================
# Full Game Flow
# =============================================================================

class TestFullGameFlow:
    """Full game flow integration tests"""

    @pytest.fixture(autouse=True)
    async def reset_games(self):
        """Clean up game state before each test"""
        game_manager._games.clear()
        game_manager._game_locks.clear()
        yield

    async def test_full_game_flow(self, async_client: AsyncClient):
        """Happy path: create game → move → AI response → move again → get status"""
        # Step 1: Create game
        resp = await async_client.post("/api/games", json={"difficulty": 2})
        assert resp.status_code == 201
        data = resp.json()
        game_id = data["game_id"]
        assert data["turn"] == "w"
        assert data["status"] == "playing"
        assert len(data["legal_moves"]) == 20  # Initial 20 legal moves

        # Step 2: Make move e2e4 — white plays e4, AI (black) responds
        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["turn"] == "w"  # Back to white's turn after AI moves
        assert data["ai_move"] is not None  # AI should have responded
        assert len(data["ai_move"]) in (4, 5)  # UCI format
        assert data["status"] in ("playing", "check")

        # Step 3: Make another move d2d4
        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "d2", "to_sq": "d4"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["turn"] == "w"
        assert data["ai_move"] is not None

        # Step 4: Get game state
        resp = await async_client.get(f"/api/games/{game_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["game_id"] == game_id
        assert data["status"] in ("playing", "check", "checkmate", "stalemate", "draw")
        assert "legal_moves" in data

        # Step 5: Get legal moves
        resp = await async_client.get(f"/api/games/{game_id}/legal-moves")
        assert resp.status_code == 200
        assert "legal_moves" in resp.json()
        assert len(resp.json()["legal_moves"]) > 0

    async def test_consecutive_moves(self, async_client: AsyncClient):
        """Happy path: three consecutive moves"""
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
        """Happy path: multiple GET requests return consistent game state"""
        resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = resp.json()["game_id"]

        # Two GETs before any move should be consistent
        state1 = (await async_client.get(f"/api/games/{game_id}")).json()
        state2 = (await async_client.get(f"/api/games/{game_id}")).json()
        assert state1["fen"] == state2["fen"]
        assert state1["turn"] == state2["turn"]

        # State should change after a move
        await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )
        state3 = (await async_client.get(f"/api/games/{game_id}")).json()
        assert state3["fen"] != state1["fen"]


# =============================================================================
# Swagger / OpenAPI Docs
# =============================================================================

class TestSwaggerDocs:
    """OpenAPI documentation tests"""

    async def test_swagger_docs_available(self, async_client: AsyncClient):
        """Happy path: Swagger docs are accessible"""
        resp = await async_client.get("/docs")
        assert resp.status_code == 200
        assert "text/html" in resp.headers.get("content-type", "")

    async def test_openapi_json(self, async_client: AsyncClient):
        """Happy path: OpenAPI JSON schema contains all endpoints"""
        resp = await async_client.get("/openapi.json")
        assert resp.status_code == 200
        schema = resp.json()
        paths = str(schema["paths"])
        assert "/api/games" in paths
        assert "/health" in paths
