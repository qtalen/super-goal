"""CLI entry point — argument parsing, validation, and orchestration."""

import argparse
import sys

from fibonacci.calculator import fibonacci


def create_parser() -> argparse.ArgumentParser:
    """Create the argument parser for the fibonacci CLI.

    Returns:
        Configured ArgumentParser instance.
    """
    parser = argparse.ArgumentParser(prog="fibonacci")
    parser.add_argument(
        "N",
        type=int,
        help="Fibonacci sequence index (non-negative integer)",
    )
    return parser


def main() -> None:
    """Parse CLI arguments, validate input, compute Fibonacci, and print result."""
    parser = create_parser()
    args = parser.parse_args()

    if args.N < 0:
        print(
            f"fibonacci: error: N must be a non-negative integer, got {args.N}",
            file=sys.stderr,
        )
        sys.exit(1)

    result = fibonacci(args.N)
    print(result)


if __name__ == "__main__":
    main()
