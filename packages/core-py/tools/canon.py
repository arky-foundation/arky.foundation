"""Emit the JCS canonical string of a TIM's canonical body (cid/sig/witnesses
stripped), so CI can byte-diff Python output against the other stacks.

Usage: python tools/canon.py <path-to-tim-fixture.json>
"""

from __future__ import annotations

import pathlib
import sys

import arky_core as arky


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: canon.py <fixture.json>", file=sys.stderr)
        return 2
    value = arky.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    # Accept either a bare TIM or a fixture wrapper {"tim": {...}}.
    tim, found = arky.path(value, "tim")
    if not found:
        tim = value
    sys.stdout.write(arky.canonicalize(arky.canonical_body(tim)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
