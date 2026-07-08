# Fibonacci Script — 架构设计文档

## 1. 技术栈选型

| 维度 | 选择 | 理由 |
|------|------|------|
| 语言 | Python ≥3.12 | 已确认。3.12+ 提供更好的类型注解支持、更清晰的错误回溯 |
| 包管理 | `uv` | 现代 Python 项目管理工具，速度快，依赖解析可靠 |
| 构建后端 | hatchling | uv 生态推荐的轻量构建后端 |
| CLI 解析 | argparse（标准库） | 零依赖，内置 Python，足以处理单一参数 |
| 测试框架 | pytest 9.x | 主流 Python 测试框架，fixture/参数化支持好 |
| 类型检查 | 运行时无强制要求 | 单文件脚本，纯函数易于测试，不引入 mypy 等额外复杂度 |
| 代码格式 | 遵循 PEP 8 | 通过内置规范保持可读性 |

## 2. 目录结构设计

```
super-loop/
├── pyproject.toml              # 项目元数据和依赖配置
├── .venv/                      # uv 虚拟环境（不提交）
├── src/                        # 源码根目录
│   └── fibonacci/              # fibonacci 包
│       ├── __init__.py         # 包初始化，导出公共 API
│       ├── __main__.py         # python -m fibonacci 入口
│       ├── calculator.py       # 核心计算逻辑（纯函数）
│       └── cli.py              # CLI 参数解析与主流程编排
├── tests/                      # 测试目录
│   └── test_fibonacci.py       # 全部单元测试
└── docs/
    └── fibonacci-script/
        ├── reqs-manifest.md     # 需求清单
        └── architecture.md     # 本文档
```

## 3. 模块划分和职责

### `fibonacci/__init__.py`
- 职责：导出包级公共 API
- 导出：`fibonacci` 函数以便 `from fibonacci import fibonacci` 使用

### `fibonacci/calculator.py`
- 职责：纯函数，计算斐波那契数列第 N 项
- 函数签名：`def fibonacci(n: int) -> int`
- 特点：无副作用，不涉及 I/O，纯数学计算
- 算法：**迭代法**（见第 5 节）

### `fibonacci/cli.py`
- 职责：解析命令行参数、调用计算逻辑、输出结果
- 函数签名：`def main() -> None`
- 功能：参数解析 → 调用 `fibonacci()` → 打印结果
- 退出码：成功 0，参数错误 1，运行时错误 1

### `fibonacci/__main__.py`
- 职责：支持 `python -m fibonacci` 调用方式
- 内容：`from fibonacci.cli import main; main()`

## 4. 命令行接口设计

### 用法

```bash
# 直接脚本调用（安装后）
fibonacci 10

# 或通过 Python 模块
python -m fibonacci 10

# 或通过 uv
uv run python -m fibonacci 10
```

### 参数

| 参数 | 位置 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `N` | 第 1 个位置参数 | `int` | 是 | 斐波那契数列的索引（非负整数） |

### 输出

```bash
$ python -m fibonacci 10
55

$ python -m fibonacci 0
0

$ python -m fibonacci 1
1
```

### 错误输出

```bash
$ python -m fibonacci
usage: fibonacci [-h] N
fibonacci: error: the following arguments are required: N

$ python -m fibonacci -1
fibonacci: error: N must be a non-negative integer, got -1

$ python -m fibonacci abc
fibonacci: error: argument N: invalid int value: 'abc'
```

## 5. 算法选择和理由

### 候选算法对比

| 算法 | 时间复杂度 | 空间复杂度 | 优点 | 缺点 |
|------|-----------|-----------|------|------|
| 朴素递归 | O(2ⁿ) | O(n) | 代码最简 | 指数爆炸，不可用 |
| 记忆化递归 | O(n) | O(n) | 比朴素好 | 递归深度限制 |
| **迭代法** | **O(n)** | **O(1)** | **高效、简单** | 无显著缺点 |
| 矩阵快速幂 | O(log n) | O(1) | 超大 N 最快 | 实现复杂，可读性差 |
| 通项公式(Binet) | O(1) | O(1) | 常数时间 | 浮点误差，大 N 不精确 |

### 选择：**迭代法**

理由：
1. **足够高效**：O(n) 时间，O(1) 空间，N=100000 毫秒级完成
2. **实现简单**：约 10 行代码，无任何复杂数学
3. **无副作用**：纯循环累加，易于理解和维护
4. **精确性**：Python 原生支持大整数，不会溢出
5. **可读性**：代码即文档，适合教学和后续维护

对于本脚本的典型使用场景（N 通常在合理范围内），迭代法是最优平衡选择。

### 核心实现伪代码

```
function fibonacci(n):
    if n == 0: return 0
    if n == 1: return 1
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b
```

## 6. 错误处理策略

| 错误场景 | 检测方式 | 用户提示 | 退出码 |
|----------|---------|---------|--------|
| 缺少参数 | argparse 内置 | `error: the following arguments are required: N` | 2 |
| 参数非整数 | argparse 类型转换 | `error: argument N: invalid int value: 'abc'` | 2 |
| 参数为负整数 | 自定义校验 | `fibonacci: error: N must be a non-negative integer, got -1` | 1 |
| 运行时异常 | `try/except` | 友好错误信息 | 1 |

### 设计中体现的原则

1. **尽早失败**：参数解析阶段完成全部验证，确保 `fibonacci()` 函数接收的一定是合法值
2. **纯函数不抛异常**：`calculator.py` 中的 `fibonacci()` 假定输入合法（被调用前已校验），不主动抛异常
3. **用户友好**：错误信息以 `fibonacci: error:` 前缀清晰标识来源
4. **标准退出码**：0 成功，1 业务错误，2 argparse 语法错误

## 7. 测试策略

### 框架与配置
- 使用 pytest，配置在 `pyproject.toml` 中
- 测试路径：`tests/`
- Python 路径：`src/`（确保能直接 import 包）

### 测试覆盖范围

#### 正常路径（7 类场景）

| # | 测试用例 | 输入 | 期望输出 | 测试意图 |
|---|---------|------|---------|---------|
| 1 | 边界 N=0 | 0 | 0 | F(0) = 0 |
| 2 | 边界 N=1 | 1 | 1 | F(1) = 1 |
| 3 | 小 N=2 | 2 | 1 | 基本加法场景 |
| 4 | 中 N=10 | 10 | 55 | 常规用例 |
| 5 | 中 N=20 | 20 | 6765 | 稍大常规用例 |
| 6 | 大 N=100 | 100 | 354224848179261915075 | Python 大整数验证 |
| 7 | 更大 N=1000 | 1000 | （209 位数字） | 性能与精确性验证 |

#### 边缘/错误路径

| # | 测试用例 | 输入 | 期望行为 | 测试意图 |
|---|---------|------|---------|---------|
| 8 | 负数 | -1 | 退出码非 0，错误信息含 "non-negative" | 输入验证 |
| 9 | 负大数 | -999 | 同上 | 边界错误 |
| 10 | 非数字字符串 | "abc" | 退出码非 0，argparse 报错 | 类型校验 |
| 11 | 浮点数 | "3.14" | 退出码非 0，argparse 报错 | 类型校验 |
| 12 | 空输入（无参数） | [] | 退出码非 0，argparse 报缺参数错误 | 缺失参数 |
| 13 | 多参数 | ["10", "20"] | argparse 报多余参数错误 | 多余参数 |

### 测试实现方式

- **`test_fibonacci.py`**：`calculator.py` 的纯函数单元测试（直接 import `fibonacci` 函数）
- CLI 集成测试：通过 `subprocess` 调用 `python -m fibonacci` 进程，捕获 stdout/stderr 和退出码
- 无需 mock：纯函数 + CLI 测试无需依赖注入

## 8. 数据流

```
用户输入
    ↓
CLI 层 (cli.py)
  ├── argparse 解析参数 (获取 N 的原始字符串)
  ├── int() 类型转换
  ├── 非负校验 (N >= 0)
  ├── 错误 → sys.exit(1)
    ↓
计算层 (calculator.py)
  └── fibonacci(N) 迭代计算
    ↓
CLI 层 (cli.py)
  └── print(result)
    ↓
stdout 输出
```
