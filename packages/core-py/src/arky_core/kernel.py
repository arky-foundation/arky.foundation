"""Kernel evaluation per ARKY-KERNEL-v1 section 5.

Bind MeasureSpec symbols from TIM evidence, evaluate assertions (tri-valued),
resolve consequences, and emit a Decision.

The safety property that matters: missing or INDETERMINATE evidence yields
INDETERMINATE, never APPROVED. Authorization requires every assertion to PASS
*and* a matching consequence — there is no fall-through path that authorizes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from .assertion import Symbols, SymVal, TriState, evaluate_assertion
from .jsonvalue import Number, get_str, path
from .timeparse import parse_iso_duration_ms, parse_rfc3339_ms

__all__ = [
    "REGISTERED_VERBS",
    "AssertionResult",
    "Decision",
    "DecisionStatus",
    "evaluate_kernel",
    "is_registered_verb",
]

#: Core verbs registered in ARKY-REGISTRIES-v1 (v1).
REGISTERED_VERBS: tuple[str, ...] = (
    "arky:verb/pay@v1",
    "arky:verb/refund@v1",
    "arky:verb/slash@v1",
    "arky:verb/revoke@v1",
    "arky:verb/upgrade@v1",
    "arky:verb/signal@v1",
    "arky:verb/control@v1",
)


def is_registered_verb(name: str) -> bool:
    """Whether a verb URN is in the v1 registry."""
    return name in REGISTERED_VERBS


class DecisionStatus(Enum):
    """The Kernel's verdict."""

    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    INDETERMINATE = "INDETERMINATE"

    def __str__(self) -> str:
        return self.value


@dataclass
class AssertionResult:
    """One MeasureSpec's evaluation."""

    name: str
    result: TriState
    input_value: SymVal | None = None
    unit: str | None = None
    error: str | None = None


@dataclass
class Decision:
    """The Kernel's output for a commitment."""

    status: DecisionStatus
    assertions: list[AssertionResult] = field(default_factory=list)
    authorized: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def _to_symval(value: object) -> SymVal | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, Number):
        try:
            return float(str(value))
        except ValueError:
            return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        return value
    return None


def _within_window(ts: str, window: object, eval_time: str) -> bool:
    moment = parse_rfc3339_ms(ts)
    if moment is None:
        return False
    start = get_str(window, "start")
    if start:
        start_ms = parse_rfc3339_ms(start)
        if start_ms is not None and moment < start_ms:
            return False
    end = get_str(window, "end")
    if end:
        end_ms = parse_rfc3339_ms(end)
        if end_ms is not None and moment >= end_ms:
            return False
    max_age = get_str(window, "max_age")
    if max_age:
        now_ms = parse_rfc3339_ms(eval_time)
        age_ms = parse_iso_duration_ms(max_age)
        if now_ms is not None and age_ms is not None and now_ms - moment > age_ms:
            return False
    return True


def _lamport(tim: object) -> float:
    value, found = path(tim, "time", "ordering", "lamport")
    if not found or not isinstance(value, Number):
        return 0.0
    try:
        return float(str(value))
    except ValueError:
        return 0.0


def _select_latest(spec: object, tims: list[object], eval_time: str) -> object | None:
    """Pick the latest TIM matching a MeasureSpec's require/window filters."""
    candidates = list(tims)

    require, has_require = path(spec, "require")
    if has_require:
        min_witnesses, found = path(require, "min_witnesses")
        if found and isinstance(min_witnesses, Number):
            threshold = float(str(min_witnesses))
            kept = []
            for tim in candidates:
                witnesses, ok = path(tim, "time", "witnesses")
                count = len(witnesses) if ok and isinstance(witnesses, list) else 0
                if count >= threshold:
                    kept.append(tim)
            candidates = kept
        device_class, found = path(require, "device_class")
        if found and isinstance(device_class, list):
            allowed = {d for d in device_class if isinstance(d, str)}
            candidates = [t for t in candidates if get_str(t, "measurement", "device") in allowed]

    window, has_window = path(spec, "window")
    if has_window:
        candidates = [
            t for t in candidates if _within_window(get_str(t, "time", "ts"), window, eval_time)
        ]

    if not candidates:
        return None
    # Notary tuple ordering: (ts, lamport, identity.id, cid).
    candidates.sort(
        key=lambda t: (
            get_str(t, "time", "ts"),
            _lamport(t),
            get_str(t, "identity", "id"),
            get_str(t, "cid"),
        )
    )
    return candidates[-1]


def evaluate_kernel(commitment: object, tims: list[object], eval_time: str) -> Decision:
    """Evaluate a commitment against TIM evidence at ``eval_time`` (RFC3339)."""
    decision = Decision(status=DecisionStatus.INDETERMINATE)

    measure, has_measure = path(commitment, "measure")
    consequence, has_consequence = path(commitment, "consequence")
    if (
        not has_measure
        or not has_consequence
        or not isinstance(measure, list)
        or not isinstance(consequence, list)
    ):
        decision.status = DecisionStatus.REJECTED
        decision.errors.append("kernel.invalid_commitment")
        return decision

    # Static verb-registry validation, independent of the measurement outcome:
    # an unregistered verb is a malformed commitment, not a failed assertion.
    for cons in consequence:
        then, found = path(cons, "then")
        if found and isinstance(then, list):
            for verb in then:
                if not is_registered_verb(get_str(verb, "name")):
                    decision.status = DecisionStatus.REJECTED
                    decision.errors.append("kernel.unknown_verb")
                    return decision

    symbols: Symbols = {}
    for spec in measure:
        name = get_str(spec, "name")
        expr = get_str(spec, "assert")
        entry = AssertionResult(name=name, result=TriState.INDETERMINATE)

        tim = _select_latest(spec, tims, eval_time)
        if tim is None:
            entry.error = "no matching receipts"
        else:
            value, found = path(tim, "measurement", "value")
            if found:
                sym = _to_symval(value)
                if sym is not None:
                    symbols[name] = sym
                    entry.input_value = sym
            entry.unit = get_str(tim, "measurement", "unit") or None
            evaluated = evaluate_assertion(expr, symbols)
            entry.result = evaluated.result
            entry.error = evaluated.error
        decision.assertions.append(entry)

    any_indeterminate = any(a.result is TriState.INDETERMINATE for a in decision.assertions)
    all_pass = bool(decision.assertions) and all(
        a.result is TriState.PASS for a in decision.assertions
    )
    if any_indeterminate:
        overall = TriState.INDETERMINATE
    elif all_pass:
        overall = TriState.PASS
    else:
        overall = TriState.FAIL

    if overall is TriState.INDETERMINATE:
        decision.status = DecisionStatus.INDETERMINATE
        return decision

    # The first matching consequence authorizes its verbs.
    authorized: list[str] = []
    for cons in consequence:
        clause = get_str(cons, "if").strip()
        matches = (
            (clause == "PASS" and overall is TriState.PASS)
            or (clause == "FAIL" and overall is TriState.FAIL)
            or (clause == "INDETERMINATE" and overall is TriState.INDETERMINATE)
        )
        if matches:
            then, found = path(cons, "then")
            if found and isinstance(then, list):
                authorized = [n for verb in then if (n := get_str(verb, "name"))]
            break

    if overall is TriState.PASS and authorized:
        decision.status = DecisionStatus.APPROVED
        decision.authorized = authorized
    else:
        decision.status = DecisionStatus.REJECTED
        decision.authorized = []
    return decision
