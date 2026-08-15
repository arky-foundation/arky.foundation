"""Emit epoch ms for an RFC3339 timestamp, so CI can compare Python's parser
against the TypeScript Date.parse and the Rust/Go parsers. Prints "NONE" when
the parser rejects the input.

Usage: python tools/parsetime.py <timestamp>
"""

from __future__ import annotations

import sys

import arky_core as arky


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: parsetime.py <ts>", file=sys.stderr)
        return 2
    result = arky.parse_rfc3339_ms(sys.argv[1])
    sys.stdout.write("NONE" if result is None else str(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
