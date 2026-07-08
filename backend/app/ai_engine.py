"""
国际象棋 AI 引擎 — Minimax + Alpha-Beta 剪枝

提供局面评估、走法排序、搜索和走法选择功能。
"""
import chess
import random

# 棋子基础价值
PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 20000,
}

# 兵的位置价值表（8x8，从白方视角，行 0=第8排，行 7=第1排）
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

# 马的位置价值表
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

# 象的位置价值表
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

# 车的位置价值表
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

# 后的位置价值表
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

# 王的位置价值表（中局）
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
    """根据棋子和位置返回位置价值（白方视角）

    参数:
        piece: 棋子对象
        square: 格子索引（0-63）

    返回:
        位置价值（正数表示该位置对白方有利）
    """
    row = square // 8  # 0=第8排, 7=第1排
    col = square % 8   # 0=a列, 7=h列

    # 黑方棋子的视角需要翻转行
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
    """局面评估函数

    综合考虑子力价值、位置价值。
    正值 = 白方优势，负值 = 黑方优势。

    参数:
        board: 当前棋局

    返回:
        评估分值
    """
    if board.is_checkmate():
        # 轮到谁走谁输
        return -1e6 if board.turn == chess.WHITE else 1e6
    if board.is_stalemate() or board.is_insufficient_material():
        return 0

    score = 0

    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is None:
            continue

        # 基础价值
        value = PIECE_VALUES[piece.piece_type]
        # 位置价值
        value += _get_position_value(piece, square)

        if piece.color == chess.WHITE:
            score += value
        else:
            score -= value

    return score


def order_moves(board: chess.Board) -> list[chess.Move]:
    """MVV-LVA 走法排序：吃子走法优先，按 victim_value - attacker_value 降序

    参数:
        board: 当前棋局

    返回:
        排序后的走法列表
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
    """Minimax with Alpha-Beta pruning（递归）

    参数:
        board: 当前棋局
        depth: 剩余搜索深度
        alpha: Alpha 值（当前能保证的最大值）
        beta: Beta 值（对手能保证的最小值）
        is_maximizing: 当前层是否为最大化层（白方）

    返回:
        评估分值
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
                break  # Beta 剪枝
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
                break  # Alpha 剪枝
        return min_eval


def select_move(board: chess.Board, difficulty: int) -> chess.Move | None:
    """AI 选择走法主入口

    参数:
        board: 当前棋局
        difficulty: 难度级别（1=初级, 2=中级, 3=高级）

    返回:
        选择的走法，无合法走法时返回 None
    """
    if board.is_game_over() or board.legal_moves.count() == 0:
        return None

    # 搜索深度配置
    depth_map = {
        1: random.choice([1, 2]),  # 初级: 1-2 层，随机变化
        2: 3,                       # 中级: 3 层
        3: 4,                       # 高级: 4 层
    }
    depth = depth_map.get(difficulty, 2)

    # 高级难度在棋局中期适当增加搜索深度
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

    # 初级难度随机扰动：从 top-3 走法中随机选一个
    if difficulty == 1 and len(moves) > 1:
        # 重新计算所有走法的分值
        move_scores = []
        for move in moves:
            board.push(move)
            if board.is_game_over():
                score = evaluate(board)
            else:
                score = minimax(board, depth - 1, -1e9, 1e9, not is_maximizing)
            board.pop()
            move_scores.append((move, score))

        # 按分值排序取前 3
        move_scores.sort(key=lambda x: x[1], reverse=is_maximizing)
        top_moves = move_scores[:min(3, len(move_scores))]
        best_move = random.choice(top_moves)[0]

    return best_move
