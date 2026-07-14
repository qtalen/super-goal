"""REST API endpoint integration tests — covers all endpoints and edge cases

Uses httpx.AsyncClient via ASGI transport to directly test the FastAPI app.
"""
import pytest
import chess
from httpx import AsyncClient, ASGITransport
from main import app
from app.game_manager import game_manager


# =============================================================================
# Helper Functions
# =============================================================================

@pytest.fixture(autouse=True)
async def reset_game_manager():
    """Clean up game manager state before each test to avoid cross-test interference"""
    game_manager._games.clear()
    game_manager._game_locks.clear()
    yield


def _game_manager():
    """Return reference to the game manager singleton"""
    return game_manager


# =============================================================================
# POST /api/games — Create Game
# =============================================================================

class TestCreateGame:
    """POST /api/games create game endpoint tests"""

    async def test_create_game_success(self, async_client):
        """Happy path: creating a game returns 201 with GameStateResponse"""
        resp = await async_client.post("/api/games", json={"difficulty": 2})
        assert resp.status_code == 201
        data = resp.json()
        assert "game_id" in data
        assert data["difficulty"] == 2
        assert data["status"] == "playing"
        assert data["fen"] == chess.STARTING_FEN
        assert data["turn"] == "w"
        assert data["last_move"] is None
        assert len(data["legal_moves"]) == 20  # Initial position has 20 legal moves

    async def test_create_game_difficulty_1(self, async_client):
        """Boundary value: minimum valid difficulty 1"""
        resp = await async_client.post("/api/games", json={"difficulty": 1})
        assert resp.status_code == 201
        assert resp.json()["difficulty"] == 1

    async def test_create_game_difficulty_3(self, async_client):
        """Boundary value: maximum valid difficulty 3"""
        resp = await async_client.post("/api/games", json={"difficulty": 3})
        assert resp.status_code == 201
        assert resp.json()["difficulty"] == 3

    async def test_create_game_difficulty_0_invalid(self, async_client):
        """Boundary value: difficulty=0 below minimum, returns 422"""
        resp = await async_client.post("/api/games", json={"difficulty": 0})
        assert resp.status_code == 422

    async def test_create_game_difficulty_4_invalid(self, async_client):
        """Boundary value: difficulty=4 above maximum, returns 422"""
        resp = await async_client.post("/api/games", json={"difficulty": 4})
        assert resp.status_code == 422

    async def test_create_game_difficulty_negative(self, async_client):
        """Boundary value: negative difficulty returns 422"""
        resp = await async_client.post("/api/games", json={"difficulty": -1})
        assert resp.status_code == 422

    async def test_create_game_missing_difficulty(self, async_client):
        """Error input: missing difficulty field returns 422"""
        resp = await async_client.post("/api/games", json={})
        assert resp.status_code == 422

    async def test_create_game_invalid_json(self, async_client):
        """Error input: non-JSON body returns 422 or 415"""
        resp = await async_client.post("/api/games", content="not-json", headers={"Content-Type": "application/json"})
        assert resp.status_code == 422


# =============================================================================
# GET /api/games/{game_id} — Get Game State
# =============================================================================

class TestGetGame:
    """GET /api/games/{game_id} get game state endpoint tests"""

    async def test_get_game_success(self, async_client):
        """Happy path: get existing game returns 200"""
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
        """Edge case: non-existent game_id returns 404"""
        resp = await async_client.get("/api/games/nonexistent-id")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Game not found"

    async def test_get_game_empty_id(self, async_client):
        """Edge case: empty string game_id returns 404"""
        resp = await async_client.get("/api/games/")
        # Empty path may match root path, doesn't affect the test
        # Actually test empty ID
        resp2 = await async_client.get("/api/games/ ")
        assert resp2.status_code == 404

    async def test_get_game_special_chars(self, async_client):
        """Edge case: game_id with special characters returns 404"""
        resp = await async_client.get("/api/games/!@#$%")
        assert resp.status_code == 404

    async def test_get_game_after_create_has_legal_moves(self, async_client):
        """Happy path: retrieved game contains legal moves list"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 2})
        game_id = create_resp.json()["game_id"]

        resp = await async_client.get(f"/api/games/{game_id}")
        data = resp.json()
        assert "legal_moves" in data
        assert len(data["legal_moves"]) > 0
        # Verify UCI format
        for move in data["legal_moves"]:
            assert isinstance(move, str)
            assert 4 <= len(move) <= 5


# =============================================================================
# POST /api/games/{game_id}/move — Make Move
# =============================================================================

class TestMakeMove:
    """POST /api/games/{game_id}/move make move endpoint tests"""

    async def test_make_move_success(self, async_client):
        """Happy path: legal move returns 200 with AI move included"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["game_id"] == game_id
        # last_move is the latest move on the board (AI's move after it plays)
        assert data["last_move"] == data["ai_move"]
        assert data["ai_move"] is not None
        assert isinstance(data["ai_move"], str)
        assert len(data["ai_move"]) in (4, 5)
        assert data["turn"] == "w"  # Back to white after AI moves
        assert data["status"] in ("playing", "check")
        assert data["difficulty"] == 1

    async def test_make_move_and_verify_board_change(self, async_client):
        """Happy path: FEN should change after move, legal_moves updated"""
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
        """Edge case: non-existent game_id returns 404"""
        resp = await async_client.post(
            "/api/games/nonexistent/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )
        assert resp.status_code == 404

    async def test_make_move_illegal(self, async_client):
        """Edge case: illegal move (knight moving to blocked square) returns 400"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e5"},
        )
        assert resp.status_code == 400
        assert "Illegal move" in resp.json()["detail"]

    async def test_make_move_invalid_format(self, async_client):
        """Error input: invalid square name returns 400"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        # Invalid from_sq
        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e9", "to_sq": "e4"},
        )
        assert resp.status_code in (400, 422)

    async def test_make_move_game_over_checkmate(self, async_client):
        """Edge case: moving when checkmate returns 400"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        # Directly set checkmate position via game_manager
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
        """Edge case: moving when stalemate returns 400"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        # Directly set stalemate position via game_manager
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
        """Edge case: moving when it's not white's turn returns 400"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        # Directly set black's turn via game_manager
        session = await game_manager.get_game(game_id)
        session.board = chess.Board(
            "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        )  # Position after e2e4, black to move
        session.status = "playing"
        # Sync last_move for consistency
        session.last_move = "e2e4"

        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "d2", "to_sq": "d4"},
        )
        assert resp.status_code == 400
        assert "turn" in resp.json()["detail"].lower()

    async def test_make_move_with_promotion(self, async_client):
        """Happy path: move with promotion"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        # Set up position with pawn on 7th rank via game_manager
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
        # Verify promoted to queen
        assert "q" in data["last_move"]

    async def test_make_move_invalid_promotion(self, async_client):
        """Error input: invalid promotion parameter returns error"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        session = await game_manager.get_game(game_id)
        session.board = chess.Board("8/4P3/8/8/8/8/8/8 w - - 0 1")
        session.status = "playing"

        # Promotion piece is not a valid chess piece
        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e7", "to_sq": "e8", "promotion": "x"},
        )
        assert resp.status_code == 400

    async def test_make_move_invalid_from_sq_format(self, async_client):
        """Error input: from_sq length fails Pydantic validation, returns 422"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e", "to_sq": "e4"},  # from_sq only 1 character
        )
        assert resp.status_code == 422

    async def test_make_move_too_long_sq(self, async_client):
        """Error input: square name exceeds 2 characters, returns 422"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "eee", "to_sq": "e4"},
        )
        assert resp.status_code == 422


# =============================================================================
# GET /api/games/{game_id}/legal-moves — Legal Moves
# =============================================================================

class TestLegalMoves:
    """GET /api/games/{game_id}/legal-moves endpoint tests"""

    async def test_legal_moves_success(self, async_client):
        """Happy path: get legal moves for initial position"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 2})
        game_id = create_resp.json()["game_id"]

        resp = await async_client.get(f"/api/games/{game_id}/legal-moves")
        assert resp.status_code == 200
        data = resp.json()
        assert "legal_moves" in data
        assert len(data["legal_moves"]) == 20

    async def test_legal_moves_not_found(self, async_client):
        """Edge case: non-existent game_id returns 404"""
        resp = await async_client.get("/api/games/nonexistent/legal-moves")
        assert resp.status_code == 404

    async def test_legal_moves_after_move(self, async_client):
        """Happy path: legal moves list changes after a move"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        # Before move
        resp_before = await async_client.get(f"/api/games/{game_id}/legal-moves")
        moves_before = resp_before.json()["legal_moves"]

        # Make move
        await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )

        # After move (black's turn, AI already moved)
        resp_after = await async_client.get(f"/api/games/{game_id}/legal-moves")
        moves_after = resp_after.json()["legal_moves"]
        assert moves_after != moves_before

    async def test_legal_moves_empty_after_checkmate(self, async_client):
        """Edge case: legal moves list is empty after checkmate"""
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
# Complete Game Flow Tests
# =============================================================================

class TestCompleteGameFlow:
    """Multi-move game flow tests"""

    async def test_two_moves_flow(self, async_client):
        """Happy path: create game → move → AI response → move again → response again"""
        # Step 1: Create game
        resp = await async_client.post("/api/games", json={"difficulty": 1})
        assert resp.status_code == 201
        game_id = resp.json()["game_id"]

        # Step 2: First move
        resp1 = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )
        assert resp1.status_code == 200
        data1 = resp1.json()
        assert data1["ai_move"] is not None
        assert data1["turn"] == "w"  # Back to white after AI moves
        first_fen = data1["fen"]

        # Step 3: Second move
        resp2 = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "d2", "to_sq": "d4"},
        )
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["ai_move"] is not None
        assert data2["fen"] != first_fen
        assert data2["turn"] == "w"

        # Step 4: Verify game is still in progress
        assert data2["status"] in ("playing", "check")

    async def test_three_moves_game_in_progress(self, async_client):
        """Happy path: after three moves game status is still playing or check"""
        resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = resp.json()["game_id"]

        moves = [("e2", "e4"), ("d2", "d4"), ("g1", "f3")]
        for from_sq, to_sq in moves:
            resp = await async_client.post(
                f"/api/games/{game_id}/move",
                json={"from_sq": from_sq, "to_sq": to_sq},
            )
            assert resp.status_code == 200

        # Final state check
        final = await async_client.get(f"/api/games/{game_id}")
        assert final.status_code == 200
        data = final.json()
        assert data["status"] in ("playing", "check")
        assert len(data["legal_moves"]) > 0

    async def test_move_history_preserved(self, async_client):
        """Happy path: last_move is AI's move (latest move) after multiple moves, and differs between moves"""
        resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = resp.json()["game_id"]

        resp1 = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )
        # last_move is the latest move after AI plays = ai_move
        first_ai = resp1.json()["ai_move"]
        assert resp1.json()["last_move"] == first_ai

        resp2 = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "d2", "to_sq": "d4"},
        )
        # Second move's last_move differs from the first (new AI move)
        second_ai = resp2.json()["ai_move"]
        assert resp2.json()["last_move"] == second_ai
        assert first_ai != second_ai

    async def test_move_status_consistency(self, async_client):
        """Happy path: GET and POST return consistent state after a move"""
        resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = resp.json()["game_id"]

        # Make move
        move_resp = await async_client.post(
            f"/api/games/{game_id}/move",
            json={"from_sq": "e2", "to_sq": "e4"},
        )
        move_data = move_resp.json()

        # Verify via GET
        get_resp = await async_client.get(f"/api/games/{game_id}")
        get_data = get_resp.json()

        assert get_data["fen"] == move_data["fen"]
        assert get_data["status"] == move_data["status"]
        assert get_data["last_move"] == move_data["last_move"]


# =============================================================================
# Checkmate Scenario Tests
# =============================================================================

class TestCheckmateViaAPI:
    """Tests for achieving checkmate via API moves"""

    async def test_player_delivers_checkmate_ai_stops(self, async_client):
        """Edge case: after player delivers checkmate, AI does not move, ai_move is None"""
        create_resp = await async_client.post("/api/games", json={"difficulty": 1})
        game_id = create_resp.json()["game_id"]

        # Set up position one move before Scholar's Mate: white queen h5, bishop c4, black king e8
        # White plays Qh5-f7# (queen captures f7 pawn with check, bishop protects queen from black king)
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
        assert data["ai_move"] is None  # AI should not move after checkmate
        assert data["turn"] == "b"  # Black's turn, but checkmated


# =============================================================================
# Pydantic Validation — Swagger Compatibility
# =============================================================================

class TestPydanticModels:
    """Pydantic model validation tests"""

    async def test_create_game_request_validates_ge(self, async_client):
        """Pydantic validation: difficulty < 1 is auto-rejected"""
        resp = await async_client.post("/api/games", json={"difficulty": 0})
        assert resp.status_code == 422

    async def test_create_game_request_validates_le(self, async_client):
        """Pydantic validation: difficulty > 3 is auto-rejected"""
        resp = await async_client.post("/api/games", json={"difficulty": 4})
        assert resp.status_code == 422

    async def test_move_request_from_sq_min_length(self, async_client):
        """Pydantic validation: from_sq too short (Pydantic validates before router, returns 422)"""
        resp = await async_client.post("/api/games/any/move", json={"from_sq": "e", "to_sq": "e4"})
        # Pydantic validation runs before the route handler, so returns 422 not 404
        assert resp.status_code == 422

    async def test_swagger_schema_generates(self, async_client):
        """Swagger: OpenAPI schema should generate correctly"""
        resp = await async_client.get("/openapi.json")
        assert resp.status_code == 200
        schema = resp.json()
        assert "/api/games" in str(schema["paths"])
        assert "/api/games/{game_id}" in str(schema["paths"])
        assert "/api/games/{game_id}/move" in str(schema["paths"])
        assert "/api/games/{game_id}/legal-moves" in str(schema["paths"])
