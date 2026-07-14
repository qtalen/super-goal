from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from app.game_manager import game_manager
from app.ai_engine import select_move
import chess

router = APIRouter(prefix="/games", tags=["games"])


class CreateGameRequest(BaseModel):
    difficulty: int = Field(ge=1, le=3)


class MoveRequest(BaseModel):
    from_sq: str = Field(min_length=2, max_length=2)
    to_sq: str = Field(min_length=2, max_length=2)
    promotion: Optional[str] = None


class GameStateResponse(BaseModel):
    game_id: str
    fen: str
    turn: str
    status: str
    legal_moves: list[str]
    last_move: Optional[str] = None
    difficulty: int


class MoveResponse(BaseModel):
    game_id: str
    fen: str
    turn: str
    status: str
    legal_moves: list[str]
    last_move: Optional[str] = None
    ai_move: Optional[str] = None
    difficulty: int


def _session_to_game_state(session) -> GameStateResponse:
    return GameStateResponse(
        game_id=session.game_id,
        fen=session.board.fen(),
        turn="w" if session.board.turn == chess.WHITE else "b",
        status=session.status,
        legal_moves=[m.uci() for m in session.board.legal_moves],
        last_move=session.last_move,
        difficulty=session.difficulty,
    )


@router.post("", response_model=GameStateResponse, status_code=201)
async def create_game(req: CreateGameRequest):
    try:
        session = await game_manager.create_game(req.difficulty)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _session_to_game_state(session)


@router.get("/{game_id}", response_model=GameStateResponse)
async def get_game(game_id: str):
    session = await game_manager.get_game(game_id)
    if not session:
        raise HTTPException(status_code=404, detail="Game not found")
    return _session_to_game_state(session)


@router.post("/{game_id}/move", response_model=MoveResponse)
async def make_move(game_id: str, req: MoveRequest):
    session = await game_manager.get_game(game_id)
    if not session:
        raise HTTPException(status_code=404, detail="Game not found")
    if session.status in ("checkmate", "stalemate", "draw"):
        raise HTTPException(status_code=400, detail="Game is already over")
    if session.board.turn != chess.WHITE:
        raise HTTPException(status_code=400, detail="It's not your turn")

    try:
        updated_session = await game_manager.make_move(
            game_id, req.from_sq, req.to_sq, req.promotion
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # AI makes its move
    ai_move_uci = None
    if updated_session.status not in ("checkmate", "stalemate", "draw"):
        try:
            ai_move = select_move(updated_session.board, updated_session.difficulty)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"AI engine error: {str(e)}")

        if ai_move:
            async with await game_manager.get_game_lock(game_id):
                updated_session.board.push(ai_move)
                updated_session.last_move = ai_move.uci()
                updated_session.status = _derive_board_status(updated_session.board)
            ai_move_uci = ai_move.uci()

    # Re-fetch latest state
    session = await game_manager.get_game(game_id)
    response = _session_to_move_response(session)
    response.ai_move = ai_move_uci
    return response


@router.get("/{game_id}/legal-moves")
async def get_legal_moves(game_id: str):
    try:
        moves = await game_manager.get_legal_moves(game_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"legal_moves": moves}


def _session_to_move_response(session) -> MoveResponse:
    return MoveResponse(
        game_id=session.game_id,
        fen=session.board.fen(),
        turn="w" if session.board.turn == chess.WHITE else "b",
        status=session.status,
        legal_moves=[m.uci() for m in session.board.legal_moves],
        last_move=session.last_move,
        ai_move=None,
        difficulty=session.difficulty,
    )


def _derive_board_status(board: chess.Board) -> str:
    if board.is_checkmate():
        return "checkmate"
    if board.is_stalemate():
        return "stalemate"
    if board.is_insufficient_material():
        return "draw"
    if board.can_claim_draw():
        return "draw"
    if board.is_check():
        return "check"
    return "playing"
