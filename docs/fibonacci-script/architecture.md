# Fibonacci Script — Architecture Design Document

## 1. Technology Stack Selection

| Dimension | Choice | Rationale |
|-----------|--------|-----------|
| Language | Python ≥3.12 | Confirmed. 3.12+ provides better type annotation support and clearer error tracebacks |
| Package management | `uv` | Modern Python project management tool, fast, reliable dependency resolution |
| Build backend | hatchling | Lightweight build backend recommended by the uv ecosystem |
| CLI parsing | argparse (standard library) | Zero dependencies, built into Python, sufficient for single parameter |
| Testing framework | pytest 9.x | Mainstream Python testing framework, good fixture/parametrization support |
| Type checking | No runtime enforcement | Single-file script, pure functions easy to test, avoids extra complexity from mypy |
| Code formatting | Follows PEP 8 | Maintains readability through built-in conventions |

## 2. Directory Structure Design

```
super-loop/
├── pyproject.toml              # Project metadata and dependency configuration
├── .venv/                      # uv virtual environment (not committed)
├── src/                        # Source code root
│   └── fibonacci/              # Fibonacci package
│       ├── __init__.py         # Package initialization, exports public API
│       ├── __main__.py         # python -m fibonacci entry point
│       ├── calculator.py       # Core calculation logic (pure functions)
│       └── cli.py              # CLI argument parsing and main flow orchestration
├── tests/                      # Test directory
│   └── test_fibonacci.py       # All unit tests
└── docs/
    └── fibonacci-script/
        ├── reqs-manifest.md    # Requirements manifest
        └── architecture.md    # This document
```

## 3. Module Division and Responsibilities

### `fibonacci/__init__.py`
- Responsibility: Export package-level public API
- Exports: `fibonacci` function for use via `from fibonacci import fibonacci`

### `fibonacci/calculator.py`
- Responsibility: Pure function to compute the Nth Fibonacci number
- Function signature: `def fibonacci(n: int) -> int`
- Characteristics: Side-effect-free, no I/O, pure mathematical computation
- Algorithm: **Iterative method** (see Section 5)

### `fibonacci/cli.py`
- Responsibility: Parse command-line arguments, invoke calculation logic, output results
- Function signature: `def main() -> None`
- Functionality: Argument parsing → call `fibonacci()` → print result
- Exit codes: 0 success, 1 argument error, 1 runtime error

### `fibonacci/__main__.py`
- Responsibility: Support the `python -m fibonacci` invocation method
- Content: `from fibonacci.cli import main; main()`

## 4. Command-Line Interface Design

### Usage

```bash
# Direct script invocation (after installation)
fibonacci 10

# Or via Python module
python -m fibonacci 10

# Or via uv
uv run python -m fibonacci 10
```

### Parameters

| Parameter | Position | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| `N` | 1st positional argument | `int` | Yes | Index of the Fibonacci sequence (non-negative integer) |

### Output

```bash
$ python -m fibonacci 10
55

$ python -m fibonacci 0
0

$ python -m fibonacci 1
1
```

### Error Output

```bash
$ python -m fibonacci
usage: fibonacci [-h] N
fibonacci: error: the following arguments are required: N

$ python -m fibonacci -1
fibonacci: error: N must be a non-negative integer, got -1

$ python -m fibonacci abc
fibonacci: error: argument N: invalid int value: 'abc'
```

## 5. Algorithm Selection and Rationale

### Candidate Algorithm Comparison

| Algorithm | Time Complexity | Space Complexity | Pros | Cons |
|-----------|----------------|------------------|------|------|
| Naive recursion | O(2ⁿ) | O(n) | Simplest code | Exponential explosion, unusable |
| Memoized recursion | O(n) | O(n) | Better than naive | Recursion depth limit |
| **Iterative method** | **O(n)** | **O(1)** | **Efficient, simple** | No significant drawbacks |
| Matrix exponentiation | O(log n) | O(1) | Fastest for very large N | Complex implementation, poor readability |
| Binet's formula | O(1) | O(1) | Constant time | Floating-point errors, imprecise for large N |

### Choice: **Iterative Method**

Rationale:
1. **Efficient enough**: O(n) time, O(1) space, completes N=100000 in milliseconds
2. **Simple implementation**: ~10 lines of code, no complex mathematics
3. **No side effects**: Pure loop accumulation, easy to understand and maintain
4. **Precision**: Python natively supports big integers, no overflow
5. **Readability**: Code is self-documenting, suitable for learning and future maintenance

For the typical use cases of this script (N within a reasonable range), the iterative method is the optimal balanced choice.

### Core Implementation Pseudocode

```
function fibonacci(n):
    if n == 0: return 0
    if n == 1: return 1
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b
```

## 6. Error Handling Strategy

| Error Scenario | Detection Method | User Prompt | Exit Code |
|----------------|-----------------|-------------|-----------|
| Missing argument | argparse built-in | `error: the following arguments are required: N` | 2 |
| Non-integer argument | argparse type conversion | `error: argument N: invalid int value: 'abc'` | 2 |
| Negative integer argument | Custom validation | `fibonacci: error: N must be a non-negative integer, got -1` | 1 |
| Runtime exception | `try/except` | Friendly error message | 1 |

### Principles Embodied in the Design

1. **Fail early**: Complete all validation during argument parsing, ensuring `fibonacci()` always receives valid input
2. **Pure functions don't throw exceptions**: `fibonacci()` in `calculator.py` assumes valid input (validated before calling), does not actively throw exceptions
3. **User-friendly**: Error messages clearly identify their source with the `fibonacci: error:` prefix
4. **Standard exit codes**: 0 success, 1 business error, 2 argparse syntax error

## 7. Testing Strategy

### Framework and Configuration
- Uses pytest, configured in `pyproject.toml`
- Test path: `tests/`
- Python path: `src/` (ensures direct package import)

### Test Coverage

#### Normal Paths (7 scenarios)

| # | Test Case | Input | Expected Output | Test Intent |
|---|-----------|-------|-----------------|-------------|
| 1 | Boundary N=0 | 0 | 0 | F(0) = 0 |
| 2 | Boundary N=1 | 1 | 1 | F(1) = 1 |
| 3 | Small N=2 | 2 | 1 | Basic addition scenario |
| 4 | Medium N=10 | 10 | 55 | Regular use case |
| 5 | Medium N=20 | 20 | 6765 | Slightly larger regular use case |
| 6 | Large N=100 | 100 | 354224848179261915075 | Python big integer verification |
| 7 | Larger N=1000 | 1000 | (209-digit number) | Performance and precision verification |

#### Edge/Error Paths

| # | Test Case | Input | Expected Behavior | Test Intent |
|---|-----------|-------|-------------------|-------------|
| 8 | Negative number | -1 | Non-zero exit code, error message contains "non-negative" | Input validation |
| 9 | Large negative number | -999 | Same as above | Boundary error |
| 10 | Non-numeric string | "abc" | Non-zero exit code, argparse error | Type validation |
| 11 | Float number | "3.14" | Non-zero exit code, argparse error | Type validation |
| 12 | Empty input (no arguments) | [] | Non-zero exit code, argparse missing argument error | Missing argument |
| 13 | Multiple arguments | ["10", "20"] | argparse extra argument error | Extra argument |

### Test Implementation

- **`test_fibonacci.py`**: Pure function unit tests for `calculator.py` (directly import `fibonacci` function)
- CLI integration tests: Use `subprocess` to invoke `python -m fibonacci` process, capture stdout/stderr and exit codes
- No mocking needed: Pure functions + CLI tests require no dependency injection

## 8. Data Flow

```
User Input
    ↓
CLI Layer (cli.py)
  ├── argparse parses arguments (gets raw N string)
  ├── int() type conversion
  ├── Non-negative validation (N >= 0)
  ├── Error → sys.exit(1)
    ↓
Computation Layer (calculator.py)
  └── fibonacci(N) iterative calculation
    ↓
CLI Layer (cli.py)
  └── print(result)
    ↓
stdout output
```
