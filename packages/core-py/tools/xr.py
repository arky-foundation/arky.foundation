"""Emit "<STATUS>|<xr cid>" for an S1 settler vector, so CI can compare Python
execution receipts against the other stacks.

Usage: python tools/xr.py <path-to-s1-vector.json>
"""

from __future__ import annotations

import pathlib
import sys

import arky_core as arky


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: xr.py <vector.json>", file=sys.stderr)
        return 2
    vector = arky.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    if arky.get_str(vector, "level") != "S1":
        sys.stdout.write("SKIP")
        return 0

    args, _ = arky.path(vector, "inputs", "params")
    result = arky.execute(
        arky.ExecRequest(
            verb=arky.get_str(vector, "inputs", "verb"),
            rail=arky.get_str(vector, "inputs", "rail"),
            args=args,
            idempotency_key=arky.get_str(vector, "inputs", "idempotency_key"),
        ),
        # The same fixed signing seed the other drivers use.
        seed=bytes([9]) * 32,
        kid="test-settler",
        ts=arky.get_str(vector, "context", "time") or "2025-10-15T12:00:01Z",
        anchor_target="log:arky:transparency@v1",
        store={},
    )
    cid = arky.get_str(result.receipt, "cid") if result.receipt is not None else ""
    sys.stdout.write(f"{result.status}|{cid}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
