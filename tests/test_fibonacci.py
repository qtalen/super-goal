"""Tests for fibonacci calculator — unit tests + CLI integration tests.

Covers all 13 test scenarios defined in the architecture document:
  Normal path (unit):    N=0,1,2,10,20,100,1000  (test cases 1-7)
  Edge/error path (CLI): negative, large negative, non-numeric,
                         float, empty, extra args  (test cases 8-13)
"""

import subprocess
import sys
from pathlib import Path

import pytest

from fibonacci.calculator import fibonacci

# ---------------------------------------------------------------------------
# Path helpers for subprocess CLI tests
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"


def run_cli(args: list[str]) -> subprocess.CompletedProcess:
    """Invoke ``python -m fibonacci`` via subprocess and return the result."""
    cmd = [sys.executable, "-m", "fibonacci", *args]
    env = {**__import__("os").environ, "PYTHONPATH": str(SRC_DIR)}
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        env=env,
        cwd=PROJECT_ROOT,
    )


# ===================================================================
#  1.1  Normal path — unit tests for fibonacci() pure function
# ===================================================================
# Test case 1 — Boundary N=0: F(0) = 0
def test_fibonacci_n0() -> None:
    """边缘情况: N=0, 期望值为 0 (F(0)=0)."""
    assert fibonacci(0) == 0


# Test case 2 — Boundary N=1: F(1) = 1
def test_fibonacci_n1() -> None:
    """边缘情况: N=1, 期望值为 1 (F(1)=1)."""
    assert fibonacci(1) == 1


# Test case 3 — Small N=2: basic addition scenario
def test_fibonacci_n2() -> None:
    """小值: N=2, 期望值为 1 (F(2)=F(0)+F(1)=0+1=1)."""
    assert fibonacci(2) == 1


# Test case 4 — Medium N=10
def test_fibonacci_n10() -> None:
    """常规用例: N=10, 期望值为 55."""
    assert fibonacci(10) == 55


# Test case 5 — Medium N=20
def test_fibonacci_n20() -> None:
    """稍大常规用例: N=20, 期望值为 6765."""
    assert fibonacci(20) == 6765


# Test case 6 — Large N=100 (Python big integer precision)
def test_fibonacci_n100() -> None:
    """大整数验证: N=100, 验证 Python 大整数精确计算."""
    expected = 354224848179261915075
    assert fibonacci(100) == expected


# Test case 7 — Larger N=1000 (209-digit number, performance + precision)
def test_fibonacci_n1000() -> None:
    """性能与精确性验证: N=1000, 验证 209 位大整数精确匹配."""
    expected = 43466557686937456435688527675040625802564660517371780402481729089536555417949051890403879840079255169295922593080322634775209689623239873322471161642996440906533187938298969649928516003704476137795166849228875  # noqa: E501
    assert fibonacci(1000) == expected


# ===================================================================
#  1.2  Edge cases for the pure function (defensive checks)
# ===================================================================

def test_fibonacci_negative_raises() -> None:
    """异常输入: 负数传入纯函数应抛出 ValueError."""
    with pytest.raises(ValueError, match="non-negative"):
        fibonacci(-1)


def test_fibonacci_non_integer_raises() -> None:
    """异常输入: 非整数传入纯函数应抛出 TypeError."""
    with pytest.raises(TypeError, match="must be an integer"):
        fibonacci("abc")  # type: ignore[arg-type]


# ===================================================================
#  2  CLI integration tests — error / edge paths (test cases 8-13)
# ===================================================================
# Test case 8 — Negative integer
def test_cli_negative() -> None:
    """CLI 输入验证: N=-1, 退出码应为 1, stderr 包含 'non-negative'."""
    result = run_cli(["-1"])
    assert result.returncode == 1, "负数参数应返回退出码 1"
    assert "non-negative" in result.stderr.lower()


# Test case 9 — Large negative integer
def test_cli_large_negative() -> None:
    """CLI 输入验证: N=-999 (负大数), 退出码应为 1, stderr 包含 'non-negative'."""
    result = run_cli(["-999"])
    assert result.returncode == 1, "负大数参数应返回退出码 1"
    assert "non-negative" in result.stderr.lower()


# Test case 10 — Non-numeric string
def test_cli_non_numeric() -> None:
    """CLI 类型校验: 'abc' 非数字字符串, 退出码应为 2 (argparse 错误)."""
    result = run_cli(["abc"])
    assert result.returncode == 2, "非数字参数应返回退出码 2"
    assert "invalid int" in result.stderr.lower()


# Test case 11 — Floating-point string
def test_cli_float() -> None:
    """CLI 类型校验: '3.14' 浮点数字符串, 退出码应为 2 (argparse 无法转 int)."""
    result = run_cli(["3.14"])
    assert result.returncode == 2, "浮点数字符串应返回退出码 2"
    assert "invalid int" in result.stderr.lower()


# Test case 12 — Empty input (no arguments)
def test_cli_no_args() -> None:
    """CLI 缺失参数: 无参数输入, 退出码应为 2, stderr 包含 'required'."""
    result = run_cli([])
    assert result.returncode == 2, "缺少参数应返回退出码 2"
    assert "required" in result.stderr.lower()


# Test case 13 — Extra arguments
def test_cli_extra_args() -> None:
    """CLI 多余参数: 传入 N=10 和额外参数 20, 退出码应为 2."""
    result = run_cli(["10", "20"])
    assert result.returncode == 2, "多余参数应返回退出码 2"
    assert "unrecognized" in result.stderr.lower() or "extra" in result.stderr.lower()
