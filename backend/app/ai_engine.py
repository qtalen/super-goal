"""
Chess AI Engine — Minimax + Alpha-Beta Pruning

Provides board evaluation, move ordering, search, and move selection.
"""
import chess
import random

# Piece base values
PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 20000,
}

# Pawn position value table (8x8, from white's perspective, row 0 = rank 8, row 7 = rank 1)
PAWN_TABLE = [
    [0,   0,   0,   0,   0,   0,   0,   0],
    [50,  50,  50,  50,  50,  50,  50,  50],
    [10,  10,  20,  30,  30,  20,  10,  10],
    [5,   5,   10,  27,  27,  10,  5,   5],
    [0,   0,   0,   25,  25,  0,   0,   0],
    [5,   -5,  -10, 0,   0,   -10, -5,  5],
    [5,   10,  10,  -25, -25, 10,  10,  5],
    [0,   0,   0,   0,   0,   0,   0,   0],
]

# Knight position value table
KNIGHT_TABLE = [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0,   0,   0,   0,   -20, -40],
    [-30, 0,   10,  15,  15,  10,  0,   -30],
    [-30, 5,   15,  20,  20,  15,  5,   -30],
    [-30, 0,   15,  20,  20,  15,  0,   -30],
    [-30, 5,   10,  15,  15,  10,  5,   -30],
    [-40, -20, 0,   5,   5,   0,   -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
]

# Bishop position value table
BISHOP_TABLE = [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0,   0,   0,   0,   0,   0,   -10],
    [-10, 0,   5,   10,  10,  5,   0,   -10],
    [-10, 5,   5,   10,  10,  5,   5,   -10],
    [-10, 0,   10,  10,  10,  10,  0,   -10],
    [-10, 10,  10,  10,  10,  10,  10,  -10],
    [-10, 5,   0,   0,   0,   0,   5,   -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
]

# Rook position value table
ROOK_TABLE = [
    [0,   0,   0,   0,   0,   0,   0,   0],
    [5,   10,  10,  10,  10,  10,  10,  5],
    [-5,  0,   0,   0,   0,   0,   0,   -5],
    [-5,  0,   0,   0,   0,   0,   0,   -5],
    [-5,  0,   0,   0,   0,   0,   0,   -5],
    [-5,  0,   0,   0,   0,   0,   0,   -5],
    [-5,  0,   0,   0,   0,   0,   0,   -5],
    [0,   0,   0,   5,   5,   0,   0,   0],
]

# Queen position value table
QUEEN_TABLE = [
    [-20, -10, -10, -5,  -5,  -10, -10, -20],
    [-10, 0,   0,   0,   0,   0,   0,   -10],
    [-10, 0,   5,   5,   5,   5,   0,   -10],
    [-5,  0,   5,   5,   5,   5,   0,   -5],
    [0,   0,   5,   5,   5,   5,   0,   -5],
    [-10, 5,   5,   5,   5,   5,   0,   -10],
    [-10, 0,   5,   0,   0,   0,   0,   -10],
    [-20, -10, -10, -5,  -5,  -10, -10, -20],
]

# King position value table (middlegame)
KING_TABLE = [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20,  20,  0,   0,   0,   0,   20,  20],
    [20,  30,  10,  0,   0,   10,  30,  20],
]


def _get_position_value(piece: chess.Piece, square: int) -> int:
    """Return position value based on piece type and square (white's perspective)

    Args:
        piece: The chess piece
        square: Square index (0-63)

    Returns:
        Position value (positive means the position favors white)
    """
    row = square // 8  # 0 = rank 8, 7 = rank 1
    col = square % 8   # 0 = a-file, 7 = h-file

    # Flip row for black pieces perspective
    if piece.color == chess.BLACK:
        row = 7 - row

    piece_type = piece.piece_type
    tables = {
        chess.PAWN: PAWN_TABLE,
        chess.KNIGHT: KNIGHT_TABLE,
        chess.BISHOP: BISHOP_TABLE,
        chess.ROOK: ROOK_TABLE,
        chess.QUEEN: QUEEN_TABLE,
        chess.KING: KING_TABLE,
    }
    table = tables.get(piece_type)
    if table:
        return table[row][col]
    return 0


def evaluate(board: chess.Board) -> float:
    """Board evaluation function

    Considers both material value and positional value.
    Positive = white advantage, Negative = black advantage.

    Args:
        board: Current chess board

    Returns:
        Evaluation score
    """
    if board.is_checkmate():
        # Side to move loses
        return -1e6 if board.turn == chess.WHITE else 1e6
    if board.is_stalemate() or board.is_insufficient_material():
        return 0

    score = 0

    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is None:
            continue

        # Base material value
        value = PIECE_VALUES[piece.piece_type]
        # Positional value
        value += _get_position_value(piece, square)

        if piece.color == chess.WHITE:
            score += value
        else:
            score -= value

    return score


def order_moves(board: chess.Board) -> list[chess.Move]:
    """MVV-LVA move ordering: captures first, sorted by victim_value - attacker_value descending

    Args:
        board: Current chess board

    Returns:
        Ordered list of moves
    """
    def move_priority(move: chess.Move) -> int:
        if board.is_capture(move):
            victim = board.piece_at(move.to_square)
            attacker = board.piece_at(move.from_square)
            if victim and attacker:
                # MVV-LVA: victim_value * 10 - attacker_value
                return (
                    PIECE_VALUES.get(victim.piece_type, 0) * 10
                    - PIECE_VALUES.get(attacker.piece_type, 0)
                )
        return 0

    moves = list(board.legal_moves)
    moves.sort(key=move_priority, reverse=True)
    return moves


def minimax(
    board: chess.Board,
    depth: int,
    alpha: float,
    beta: float,
    is_maximizing: bool,
) -> float:
    """Minimax with Alpha-Beta pruning (recursive)

    Args:
        board: Current chess board
        depth: Remaining search depth
        alpha: Alpha value (best score the maximizer can guarantee)
        beta: Beta value (best score the minimizer can guarantee)
        is_maximizing: Whether the current layer is maximizing (white)

    Returns:
        Evaluation score
    """
    if depth == 0 or board.is_game_over():
        return evaluate(board)

    moves = order_moves(board)

    if is_maximizing:
        max_eval = -1e9
        for move in moves:
            board.push(move)
            eval_score = minimax(board, depth - 1, alpha, beta, False)
            board.pop()
            max_eval = max(max_eval, eval_score)
            alpha = max(alpha, eval_score)
            if beta <= alpha:
                break  # Beta cutoff
        return max_eval
    else:
        min_eval = 1e9
        for move in moves:
            board.push(move)
            eval_score = minimax(board, depth - 1, alpha, beta, True)
            board.pop()
            min_eval = min(min_eval, eval_score)
            beta = min(beta, eval_score)
            if beta <= alpha:
                break  # Alpha cutoff
        return min_eval


def select_move(board: chess.Board, difficulty: int) -> chess.Move | None:
    """AI move selection entry point

    Args:
        board: Current chess board
        difficulty: Difficulty level (1 = beginner, 2 = intermediate, 3 = advanced)

    Returns:
        Selected move, or None if no legal moves
    """
    if board.is_game_over() or board.legal_moves.count() == 0:
        return None

    # Search depth configuration
    depth_map = {
        1: random.choice([1, 2]),  # Beginner: 1-2 ply, randomized
        2: 3,                       # Intermediate: 3 ply
        3: 4,                       # Advanced: 4 ply
    }
    depth = depth_map.get(difficulty, 2)

    # Increase search depth for advanced mode in midgame
    if difficulty >= 2 and board.fullmove_number > 10:
        depth += 1

    best_move = None
    best_score = -1e9 if board.turn == chess.WHITE else 1e9
    is_maximizing = board.turn == chess.WHITE

    moves = order_moves(board)

    for move in moves:
        board.push(move)
        if board.is_game_over():
            score = evaluate(board)
        else:
            score = minimax(board, depth - 1, -1e9, 1e9, not is_maximizing)
        board.pop()

        if is_maximizing:
            if score > best_score:
                best_score = score
                best_move = move
        else:
            if score < best_score:
                best_score = score
                best_move = move

    # Beginner difficulty: random perturbation — pick randomly from top-3 moves
    if difficulty == 1 and len(moves) > 1:
        # Recalculate all move scores
        move_scores = []
        for move in moves:
            board.push(move)
            if board.is_game_over():
                score = evaluate(board)
            else:
                score = minimax(board, depth - 1, -1e9, 1e9, not is_maximizing)
            board.pop()
            move_scores.append((move, score))

        # Sort by score and take top 3
        move_scores.sort(key=lambda x: x[1], reverse=is_maximizing)
        top_moves = move_scores[:min(3, len(move_scores))]
        best_move = random.choice(top_moves)[0]

    return best_move
