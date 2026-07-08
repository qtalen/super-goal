"""Core Fibonacci calculation logic — pure function with fast doubling (O(log n))."""


def fibonacci(n: int) -> int:
    """Compute the nth Fibonacci number using fast doubling (O(log n) time).

    Uses the identities:
      F(2k)   = F(k) * (2*F(k+1) - F(k))
      F(2k+1) = F(k)^2 + F(k+1)^2

    Args:
        n: A non-negative integer index into the Fibonacci sequence.

    Returns:
        The nth Fibonacci number. F(0) = 0, F(1) = 1.

    Raises:
        TypeError: If n is not an integer.
        ValueError: If n is negative.
    """
    if not isinstance(n, int):
        raise TypeError(f"n must be an integer, got {type(n).__name__}")
    if n < 0:
        raise ValueError(f"n must be a non-negative integer, got {n}")

    def _fib(k: int) -> tuple[int, int]:
        if k == 0:
            return (0, 1)
        a, b = _fib(k >> 1)
        c = a * ((b << 1) - a)
        d = a * a + b * b
        if k & 1:
            return (d, c + d)
        return (c, d)

    return _fib(n)[0]
