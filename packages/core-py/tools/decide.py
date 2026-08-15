"""Emit "<STATUS>|<authorized verbs>" for a K1/K2 kernel vector, so CI can
compare Python kernel decisions against the other stacks.

Usage: python tools/decide.py <path-to-kernel-vector.json>
"""

from __future__ import annotations

import pathlib
import sys

import arky_core as arky


def read(path: pathlib.Path) -> object:
    return arky.parse(path.read_text(encoding="utf-8"))


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: decide.py <vector.json>", file=sys.stderr)
        return 2
    vector = read(pathlib.Path(sys.argv[1]))
    commitment, found = arky.path(vector, "inputs", "commitment")
    if not found:
        sys.stdout.write("NONE")
        return 0

    vectors_dir = pathlib.Path(__file__).resolve().parents[3] / "vectors"
    tims: list[object] = []
    fixture_path = arky.get_str(vector, "context", "fixtures", "tim")
    if fixture_path:
        tim, ok = arky.path(read(vectors_dir / fixture_path), "tim")
        if ok:
            tims.append(tim)
    # K2 vectors embed their evidence inline so they are self-contained.
    evidence, ok = arky.path(vector, "context", "evidence")
    if ok and isinstance(evidence, list):
        tims.extend(evidence)

    eval_time = arky.get_str(vector, "context", "time") or "2025-10-15T12:00:00Z"
    decision = arky.evaluate_kernel(commitment, tims, eval_time)
    sys.stdout.write(f"{decision.status}|{','.join(decision.authorized)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
