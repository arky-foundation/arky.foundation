"""Canonicalize a raw JSON string argument, for cross-language number/edge
checks against the TypeScript, Rust and Go stacks.

Usage: python tools/canonjson.py '{"n":1e21}'
"""

from __future__ import annotations

import sys

import arky_core as arky


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: canonjson.py <json>", file=sys.stderr)
        return 2
    try:
        sys.stdout.write(arky.canonicalize(arky.parse(sys.argv[1])))
    except (arky.JsonParseError, arky.JcsError) as exc:
        print(exc, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
