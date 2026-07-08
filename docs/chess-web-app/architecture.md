# 国际象棋 Web 应用 — 架构设计文档

**Task Slug**: `chess-web-app`
**编写日期**: 2026-07-07
**状态**: 已锁定

---

## 1. 项目目录结构

```
super-loop/
│
├── backend/                          # Python FastAPI 后端
│   ├── main.py                       # FastAPI 应用入口 + CORS 配置
│   ├── pyproject.toml                # 依赖管理（uv）
│   ├── app/
│   │   ├── __init__.py
│   │   ├── models.py                 # 数据模型（GameSession, GameState）
│   │   ├── game_manager.py           # 游戏会话管理器（线程安全）
│   │   ├── ai_engine.py              # AI 引擎（Minimax + Alpha-Beta）
│   │   └── routers/
│   │       ├── __init__.py
│   │       └── games.py              # API 路由定义
│
├── frontend/                         # React + TypeScript + Vite 前端
│   ├── package.json                  # 依赖管理（pnpm）
│   ├── tsconfig.json
│   ├── vite.config.ts                # Vite 配置（含开发代理）
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx                  # React 入口
│   │   ├── App.tsx                   # 根组件，组合所有子组件
│   │   ├── types/
│   │   │   └── index.ts              # TypeScript 类型定义
│   │   ├── components/
│   │   │   ├── Board.tsx             # 棋盘组件（8×8 网格）
│   │   │   ├── Square.tsx            # 单个格子渲染
│   │   │   ├── Piece.tsx             # 棋子 Unicode 显示
│   │   │   ├── ControlPanel.tsx      # 控制面板（难度/新游戏/悔棋）
│   │   │   └── GameStatus.tsx        # 游戏状态显示
│   │   ├── api/
│   │   │   └── chessApi.ts           # API 客户端封装
│   │   ├── context/
│   │   │   └── GameContext.tsx        # 全局游戏状态（Context + useReducer）
│   │   └── styles/
│   │       ├── global.scss           # 全局样式 + CSS 变量
│   │       ├── Board.scss            # 棋盘样式
│   │       └── ControlPanel.scss     # 控制面板样式
│
└── docs/
    └── chess-web-app/
        ├── reqs-manifest.md          # 需求清单（已锁定）
        └── architecture.md           # 本文件
```

### 目录设计原则

| 原则 | 说明 |
|------|------|
| **关注点分离** | 前端/后端完全独立，通过 REST API 通信 |
| **扁平路由层** | routers/ 只做请求路由和参数校验，业务逻辑下沉到 game_manager |
| **单一职责** | models/game_manager/ai_engine 各司其职，不互相耦合 |
| **无持久化** | 所有数据在内存中，进程重启即丢失 |

---

## 2. 后端架构

### 2.1 分层职责

```
HTTP Request
    │
    ▼
routers/games.py          ← 路由层：参数解析、请求校验、状态码
    │
    ▼
game_manager.py           ← 业务层：会话生命周期管理、走法校验委托
    │
    ├── models.py          ← 数据层：GameSession 数据类
    └── ai_engine.py       ← 算法层：AI 走法计算
```

### 2.2 models.py — 数据模型

```python
@dataclass
class GameSession:
    game_id: str                    # UUID 字符串
    board: chess.Board              # python-chess Board 实例
    difficulty: int                 # 1|2|3
    status: str                     # "playing" | "check" | "checkmate" | "stalemate" | "draw"
    last_move: str | None           # 上一步走法的 UCI 表示（如 "e2e4"）
    created_at: float               # time.time() 时间戳
```

关键设计决策：

- **不存储走法历史列表**：python-chess Board 内部通过 `board.move_stack` 保留完整历史，需要时可推导
- **status 由 Board 实时推导**：每次走子后调用 `board.is_checkmate()`、`board.is_stalemate()` 等判断
- **不可变返回**：API 返回的是 board 的快照拷贝，不会直接暴露内部引用

### 2.3 game_manager.py — 游戏会话管理器

```python
class GameManager:
    _games: dict[str, GameSession]   # game_id → GameSession
    _lock: asyncio.Lock              # 异步锁保证线程安全

    async def create_game(difficulty: int) -> GameSession
    async def get_game(game_id: str) -> GameSession | None
    async def delete_game(game_id: str) -> bool
    async def make_move(game_id: str, from_sq: str, to_sq: str, promotion: str | None) -> GameSession
    async def get_legal_moves(game_id: str) -> list[str]
```

设计要点：

- **单例模式**：模块级全局实例 `game_manager = GameManager()`
- **asyncio.Lock 保证原子性**：所有读写操作都通过 `async with self._lock` 保护
- **生存周期**：会话永不过期（原型阶段），后续可添加空闲超时清理
- **走子流程**：`make_move()` 内部依次执行——校验合法性 → 执行走子 → 检查游戏状态 → 调用 AI → 再次检查状态 → 返回

### 2.4 ai_engine.py — AI 引擎

核心算法：Minimax + Alpha-Beta 剪枝

```python
def select_move(board: chess.Board, difficulty: int) -> chess.Move | None:
    """
    主入口：
    1. 根据 difficulty 选择搜索深度
    2. 走法排序（MVV-LVA 启发式）
    3. 调用 minimax 搜索
    4. 初级难度加入随机扰动
    5. 异步超时保护（5 秒上限）
    """

def minimax(board: chess.Board, depth: int, alpha: int, beta: int,
            is_maximizing: bool) -> float

def evaluate(board: chess.Board) -> float:
    """
    评估函数（AI 执白时正值 = 白方优势）：
    + 棋子基础价值
    + 位置价值表（中心控制）
    + 机动性调整（合法走法数量）
    """
```

#### 评估函数设计

| 棋子 | 基础价值 | 位置策略 |
|------|---------|---------|
| 兵 (P) | 100 | 中心兵 (+10)，前进兵 (+5)，边路兵 (-5) |
| 马 (N) | 320 | 中心马 (+15)，边角马 (-10) |
| 象 (B) | 330 | 象位表（中心对角线加分） |
| 车 (R) | 500 | 开放线加分，第七横排加分 |
| 后 (Q) | 900 | 中心控制加分，但不过早出动 |
| 王 (K) | 20000 | 中局安全位置，残局中心化 |

#### 搜索难度配置

| 难度 | 搜索深度 | 特点 |
|------|---------|------|
| 1（初级） | 1~2 | 走法中加入随机扰动（从 top-3 走法中随机选取） |
| 2（中级） | 2~3 | 完整 alpha-beta，无扰动 |
| 3（高级） | 3~4 | 更精细的评估 + 扩展搜索（将军时增加搜索深度） |

#### 性能优化

1. **走法排序（MVV-LVA）**：先搜索吃子走法（最有希望剪枝的），提高剪枝效率
2. **Alpha-Beta 剪枝**：严格实现，剪枝不搜索的分支
3. **超时保护**：`asyncio.wait_for(..., timeout=5.0)` 兜底，超时时返回当前最佳走法
4. **迭代加深（可选）**：可在 1 秒内完成浅层搜索，剩余时间继续加深

---

## 3. API 设计

### 3.1 端点概览

| 方法 | 路径 | 描述 | 请求体 | 返回体 |
|------|------|------|--------|--------|
| POST | `/api/games` | 创建新游戏 | `{ "difficulty": 1|2|3 }` | `GameState` |
| GET | `/api/games/{game_id}` | 查询游戏状态 | — | `GameState` |
| POST | `/api/games/{game_id}/move` | 玩家走子 + AI 应答 | `{ "from": "e2", "to": "e4", "promotion": "q"\|null }` | `MoveResponse` |
| GET | `/api/games/{game_id}/legal-moves` | 获取合法走法 | — | `{ "legal_moves": [...] }` |

### 3.2 统一返回格式 — GameState

```json
{
  "game_id": "550e8400-e29b-41d4-a716-446655440000",
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "turn": "w",
  "status": "playing",
  "legal_moves": ["e2e4", "d2d4", "g1f3", ...],
  "last_move": null,
  "difficulty": 2
}
```

### 3.3 POST /api/games/{game_id}/move — MoveResponse

```json
{
  "game_id": "550e8400-e29b-41d4-a716-446655440000",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "turn": "b",
  "status": "playing",
  "legal_moves": ["e7e5", "e7e6", "d7d5", ...],
  "last_move": "e2e4",
  "ai_move": "e7e5",
  "difficulty": 2
}
```

### 3.4 错误处理

| 场景 | HTTP 状态码 | 返回体 |
|------|------------|--------|
| game_id 不存在 | 404 | `{ "detail": "Game not found" }` |
| 非法走子 | 400 | `{ "detail": "Illegal move: e2e5" }` |
| 游戏已结束 | 400 | `{ "detail": "Game is already over" }` |
| 不是白方回合 | 400 | `{ "detail": "It's not your turn" }` |
| 难度参数无效 | 422 | Pydantic 自动校验错误 |

### 3.5 CORS 配置

在 `main.py` 中配置：

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite 开发服务器
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 3.6 Vite 开发代理

`vite.config.ts` 中配置 `/api` 代理到后端，避免开发时跨域问题：

```typescript
server: {
  proxy: {
    '/api': 'http://localhost:8000'
  }
}
```

---

## 4. 前端架构

### 4.1 组件树

```
App
├── ControlPanel
│   ├── 难度选择下拉框 (初/中/高)
│   ├── 新游戏按钮
│   └── 悔棋按钮 (back_arrow)
│
├── Board
│   └── Square × 64 (8行 × 8列)
│       ├── 行列坐标标注 (a-h, 1-8)
│       ├── 深浅交替背景
│       ├── 选中高亮 (黄色)
│       ├── 合法走法标记 (绿色圆点)
│       └── Piece (有棋子时渲染)
│           └── Unicode 棋子字符
│
└── GameStatus
    ├── 回合指示 (白方走 / 黑方走)
    ├── 状态 (将军 / 将杀 / 和棋 / 逼和)
    └── 走法历史显示 (棋谱)
```

### 4.2 状态管理 — GameContext

使用 React Context + useReducer 模式：

```typescript
// types/index.ts
interface GameState {
  gameId: string | null;
  fen: string;
  turn: 'w' | 'b';
  status: 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw';
  difficulty: 1 | 2 | 3;
  legalMoves: string[];
  lastMove: string | null;
  history: string[];        // FEN 历史快照（用于悔棋）
  selectedSquare: string | null;  // 当前选中的格子
  boardOrientation: 'w';    // 始终从白方视角（可扩展）
  isThinking: boolean;      // AI 计算中标记
  error: string | null;
}

type GameAction =
  | { type: 'CREATE_GAME'; payload: GameState }
  | { type: 'SELECT_SQUARE'; payload: string | null }
  | { type: 'MAKE_MOVE'; payload: Partial<GameState> }
  | { type: 'SET_THINKING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'UNDO_MOVE'; payload: Partial<GameState> }
  | { type: 'RESET' };
```

### 4.3 走子交互流程

```
用户点击格子
    │
    ▼
Board.onSquareClick(square)
    │
    ├── 无选中格子 + 格子上有己方棋子
    │   └── dispatch SELECT_SQUARE(square) → 高亮选中 + 显示合法走法
    │
    ├── 有选中格子 + 点击同一格子
    │   └── dispatch SELECT_SQUARE(null) → 取消选中
    │
    ├── 有选中格子 + 点击另一个己方棋子
    │   └── dispatch SELECT_SQUARE(newSquare) → 切换选中
    │
    └── 有选中格子 + 点击目标格子
        ├── 如果是升变走法 → 弹出升变对话框 → 选择棋子
        └── 调用 chessApi.makeMove(gameId, from, to, promotion)
            ├── 成功 → dispatch MAKE_MOVE(response) → 更新棋盘
            └── 失败 → dispatch SET_ERROR(errorMsg)
```

### 4.4 API 客户端 — chessApi.ts

```typescript
// 封装所有 fetch 调用
export const chessApi = {
  createGame(difficulty: 1 | 2 | 3): Promise<GameState>,
  getGame(gameId: string): Promise<GameState>,
  makeMove(gameId: string, from: string, to: string, promotion?: string): Promise<MoveResponse>,
  getLegalMoves(gameId: string): Promise<{ legal_moves: string[] }>,
};
```

设计要点：

- **统一错误处理**：所有方法内部 catch 网络错误，throw 结构化错误对象 `{ status, message }`
- **请求超时**：使用 `AbortController` 设置 10 秒超时
- **TypeScript 完全类型化**：请求体/返回体均有对应 interface

### 4.5 棋盘渲染逻辑

```typescript
// Board.tsx
function Board({ fen, ... }: Props) {
  const rows = [8, 7, 6, 5, 4, 3, 2, 1];  // 从第8排开始渲染（白方在下）
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  // 解析 FEN → 二维数组
  const board = parseFen(fen);

  return (
    <div className="board">
      {rows.map(row =>
        files.map(file => {
          const square = `${file}${row}`;
          const piece = board[row][file];
          return (
            <Square
              key={square}
              square={square}
              piece={piece}
              isLight={(row + file.charCodeAt(0)) % 2 === 0}
              isSelected={selectedSquare === square}
              isLegalMove={legalMoveSquares.has(square)}
              isLastMove={lastMoveFrom === square || lastMoveTo === square}
              onClick={() => onSquareClick(square)}
            />
          );
        })
      )}
    </div>
  );
}
```

### 4.6 视觉反馈方案

| 状态 | 颜色 | 实现方式 |
|------|------|---------|
| 选中格子 | 黄色半透明覆盖层 | `box-shadow: inset 0 0 0 3px gold` |
| 合法走法（无吃子） | 绿色圆点 | 伪元素 `:after` 居中 |
| 合法走法（有吃子） | 红色边框 | `outline: 3px solid red` |
| 上一步走法 | 蓝色半透明 | `background: rgba(0,0,255,0.1)` |
| 将军状态 | 红色闪烁 | 王所在格子添加 pulse 动画 |

### 4.7 升变处理

升变在前端通过模态对话框处理：

1. 用户意图走子到第 1 或第 8 横排（兵升变条件）
2. 前端检测到升变条件，在 `makeMove` 调用前弹出选择对话框
3. 用户选择：后 (q) / 车 (r) / 象 (b) / 马 (n)
4. 调用 API 时传入 `promotion` 参数
5. 后端 python-chess 处理 `board.push(chess.Move(from, to, promotion=piece))`

---

## 5. AI 引擎关键设计（详细）

### 5.1 棋子基础价值表

```
P (兵) = 100
N (马) = 320
B (象) = 330
R (车) = 500
Q (后) = 900
K (王) = 20000  (确保王不会被"吃掉")
```

### 5.2 位置价值表

每种子力维护一个 8×8 位置价值表（从白方视角）。关键模式：

- **中心控制**：d4, d5, e4, e5 为中心四格，所有子力在此均有分值加成
- **兵位置**：中心兵 > 边路兵，连锁兵额外加分，孤兵减分
- **马位置**：中心 > 边缘，d4/d5/e4/e5 最佳
- **象位置**：长对角线 > 短对角线，中心化加分
- **车位置**：开放线（无兵阻挡）加分，第 7 横排（对黑方底线）加分
- **后位置**：中局不宜过早出动，残局中心化

### 5.3 机动性评估

```
mobility_score = len(board.legal_moves) * MOBILITY_WEIGHT
MOBILITY_WEIGHT ≈ 5  （经验调参值）
```

机动性差异通常 ±50~200 分，有助于 AI 选择局面更开放、子力更活跃的走法。

### 5.4 搜索优化

```
function minimax(board, depth, alpha, beta, is_maximizing):
    if depth == 0 or game_over:
        return quiescence_search(board, alpha, beta, 3)
        // 静态搜索：继续搜索吃子走法，解决"水平线效应"

    moves = order_moves(board.legal_moves, board)
    // MVV-LVA 排序：先搜索最有希望的分支

    for move in moves:
        board.push(move)
        score = minimax(board, depth-1, alpha, beta, not is_maximizing)
        board.pop()
        // alpha-beta 剪枝...

    return best_score
```

### 5.5 AI 调用流程（后端 make_move 完整流程）

```
POST /api/games/{id}/move 收到请求
    │
    ▼
1. 校验 game_id 存在
    │
    ▼
2. 校验走法合法性（board.is_legal(move)）
    │  └─ 非法 → 返回 400
    ▼
3. 执行走子 board.push(move)
    │
    ▼
4. 检查游戏状态
    │  ├─ 将杀/逼和/和棋 → 设置 status，返回（AI 不走）
    │  └─ 正常继续
    ▼
5. 调用 AI: ai_engine.select_move(board, difficulty)
    │  └─ 超时 → 返回当前最佳走法
    ▼
6. AI 走子 board.push(ai_move)
    │
    ▼
7. 再次检查游戏状态
    │
    ▼
8. 返回完整 GameState（含 ai_move 字段）
```

---

## 6. 前后端交互流程

### 6.1 完整用户会话流程

```
玩家操作                             前端状态                           后端
─────────                           ────────                          ────
1. 选择难度 (初/中/高)
    ↓
2. 点击"新游戏"                    dispatch(CREATE_GAME)
    →                              fetch POST /api/games              → 创建 GameSession
    ← 收到 game_id, fen                                              ← 返回 GameState
    →                              dispatch({type: 'CREATE_GAME', ...})
    ↓
3. 更新棋盘渲染                    Board 读取 fen，渲染棋子
    ↓
4. 点击己方棋子                    dispatch(SELECT_SQUARE)
    →                              高亮选中格子 + 显示合法走法
    ↓
5. 点击目标格子                    dispatch(SET_THINKING, true)
    →                              (升变时弹出选择对话框)
    →                              fetch POST /api/games/{id}/move    → 校验走法
    →                                                                 → AI 计算应答
    ← 收到新状态                                                    ← 返回 MoveResponse
    →                              dispatch(MAKE_MOVE, ...)
    →                              dispatch(SET_THINKING, false)
    ↓
6. 更新棋盘渲染                    Board + GameStatus 同步更新
    ↓
7. 重复 4-6 直到游戏结束           status !== 'playing'
    ↓
8. 游戏结束显示                    GameStatus 显示将杀/和棋等
    ↓
9. 点击"新游戏" → 回到步骤 2
```

### 6.2 悔棋流程

```
1. 玩家点击"悔棋"按钮
2. 后端弹回两步（AI 一步 + 玩家一步）：
   - board.pop()  // 撤回 AI 走法
   - board.pop()  // 撤回玩家走法
3. 返回新状态（玩家回合）
4. 前端更新状态

注：如果游戏已结束，悔棋需额外处理（先重置状态为 playing）
```

---

## 7. 安全与边界处理

### 7.1 输入校验

| 层面 | 校验内容 | 处理方式 |
|------|---------|---------|
| HTTP（Pydantic） | difficulty 范围 1-3, FEN 格式, 格子格式 | 422 Unprocessable Entity |
| 业务（game_manager） | game_id 存在性, 走法合法性, 回合正确性 | 400/404 详细错误 |
| AI 引擎 | board 非 None, 深度为正整数 | 防御式断言 |

### 7.2 并发安全

- 所有 `GameManager` 方法使用 `asyncio.Lock` 保护
- AI 计算期间锁不释放（计算时间可能较长，但游戏间互不干扰——锁是单会话级别，还是全局级别？）
  - **决策**：使用 **per-game 锁**（字典嵌套锁），而非全局锁，避免不同游戏相互阻塞
  - 实现方式：`locks: dict[str, asyncio.Lock]` + 一个保护 locks 字典本身的轻量锁

### 7.3 资源限制

| 限制项 | 值 | 说明 |
|--------|-----|------|
| 最大活跃会话 | 100 | 防内存耗尽，达到上限时拒绝新游戏 |
| AI 搜索超时 | 5 秒 | asyncio.wait_for 硬限制 |
| API 超时 | 10 秒 | 前端 AbortController 控制 |
| 会话闲置清理 | 1 小时（可选） | 后台任务扫描清理 |

---

## 8. 测试策略

### 8.1 后端测试

| 测试类型 | 工具 | 覆盖范围 |
|---------|------|---------|
| 单元测试 | pytest | ai_engine.evaluate, minimax 各搜索深度 |
| 集成测试 | pytest + httpx.AsyncClient | API 端点：创建游戏、走子、游戏状态 |
| 边缘情况 | pytest | 将杀/逼和/升变/王车易位/吃过路兵 |

### 8.2 前端测试

| 测试类型 | 工具 | 覆盖范围 |
|---------|------|---------|
| 组件测试 | vitest + @testing-library/react | Board 渲染、Square 点击、GameStatus 显示 |
| 上下文测试 | vitest | GameContext reducer 各种 action |
| API 测试 | vitest + MSW | chessApi 正常/异常响应 |

### 8.3 关键边缘场景

- 空输入：FEN 为空、格子名为空
- 边界值：difficulty=0, difficulty=4, depth=0
- 异常输入：非法格子名 "z9"、"a0"、"e2e4"（不是一个格子）
- 失败路径：走子到被对方保护的格子、游戏结束后继续走子
- 特殊走法：王车易位（双方、各方向）、升变（4 种子力）、吃过路兵
- 并发：两个游戏互不干扰、同一游戏两次请求的竞态

---

## 9. 依赖清单

### 9.1 后端（pyproject.toml）

```toml
[project]
name = "chess-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "python-chess>=1.999",
    "pydantic>=2.0",
]
```

### 9.2 前端（package.json — pnpm）

```json
{
  "name": "chess-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "sass": "^1.77.0",
    "vitest": "^1.6.0",
    "@testing-library/react": "^16.0.0",
    "jsdom": "^24.0.0"
  }
}
```

---

## 10. 实施计划（建议执行顺序）

按拓扑序依赖，分 5 轮实施：

| 轮次 | 需求 | 内容 | 依赖 |
|------|------|------|------|
| 1 | R1, R5 | 后端/前端项目初始化，基础骨架 | — |
| 2 | R2, R3, R6 | 游戏会话管理 + AI 引擎 + 棋盘渲染 | R1, R5 |
| 3 | R4, R7 | REST API 端点 + 走子交互 | R2, R3, R5, R6 |
| 4 | R8, R9 | 控制面板 + API 客户端 + 状态管理 | R4, R5, R7 |
| 5 | R10 | 前后端联调集成验证 | R4, R7, R8, R9 |

---

===SUMMARY===

## 关键设计决策总结

1. **REST API 通信**：前后端完全解耦，通过 JSON over HTTP 通信，无 WebSocket，无服务器端渲染。

2. **纯内存无持久化**：所有 GameSession 存储在内存字典中，进程重启即丢失，适合原型验证阶段。

3. **per-game 锁设计**：使用 per-game 的 `asyncio.Lock` 而非全局锁，保证不同游戏会话的并发安全互不干扰。

4. **AI 引擎 3 档难度**：通过搜索深度（1-2/2-3/3-4）区分难度，初级加入随机扰动，高级增加扩展搜索。

5. **评估函数三层结构**：棋子基础价值 + 位置价值表 + 机动性评分，平衡确定性策略与局面感知。

6. **React Context + useReducer**：不引入 Redux/Zustand 等外部状态库，Context 加原生 hook 已满足单页面应用需求。

7. **升变走法前端弹窗处理**：前端检测升变条件后弹出 4 子选择对话框，传入后端标准化处理。

8. **python-chess 作为核心依赖**：后端所有棋盘逻辑（规则校验、FEN 编解码、走法合法性）依赖 python-chess，不重复造轮子。

9. **MVV-LVA 走法排序**：AI 搜索前对走法按"最有希望优先"排序，显著提升 Alpha-Beta 剪枝效率。

10. **5 秒 AI 搜索超时**：所有难度统一 5 秒上限，asyncio.wait_for 兜底，保证 API 不挂死。

11. **CORS + Vite Proxy 双保险**：后端配置 CORS 中间件，前端 Vite 配置开发代理，生产部署只需其中一层。

12. **前端工具链**：pnpm（包管理） + Vite（构建） + vitest（测试） + SCSS（样式），统一现代工具生态。
