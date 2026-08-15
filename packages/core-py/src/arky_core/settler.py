"""Settler execution per ARKY-SETTLERS-v1 sections 4 (pre-checks) and 5 (XR).

Validate an execution request (verb registered, args valid per the verb schema,
rail supported), then produce a signed Execution Receipt. Deterministic
idempotency (section 6.1) dedupes duplicate requests.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum

from .canonicalize import canonicalize
from .cid import cid_from_canonical, multihash_mb
from .jsonvalue import JsonObject, Number, path
from .jws import sign_detached
from .kernel import is_registered_verb

__all__ = [
    "ExecRequest",
    "ExecStatus",
    "ExecuteResult",
    "IdempotencyStore",
    "args_hash",
    "derive_idempotency_key",
    "execute",
    "verb_required_args",
]

_REQUIRED_ARGS: dict[str, tuple[str, ...]] = {
    "arky:verb/pay@v1": ("to", "amount"),
    "arky:verb/refund@v1": ("payment_ref",),
    "arky:verb/slash@v1": ("subject", "amount"),
    "arky:verb/revoke@v1": ("subject",),
    "arky:verb/upgrade@v1": ("target", "version"),
    "arky:verb/signal@v1": ("channel",),
    "arky:verb/control@v1": ("action",),
}


def verb_required_args(verb: str) -> tuple[str, ...]:
    """Required argument fields for a core verb, per ``schemas/verbs/*.json``.

    The verb schemas are canonical here: the section 3.2 prose was reconciled to
    them after an audit found a three-way contradiction between the spec text,
    the schemas, and the S1 vectors.
    """
    return _REQUIRED_ARGS.get(verb, ())


class ExecStatus(Enum):
    """The outcome of an execution attempt."""

    SUCCESS = "SUCCESS"
    FAILED = "FAILED"

    def __str__(self) -> str:
        return self.value


@dataclass
class ExecRequest:
    """Inputs to an execution."""

    verb: str
    args: object
    rail: str = ""
    commitment_cid: str = ""
    request_id: str = ""
    idempotency_key: str = ""


@dataclass
class ExecuteResult:
    """The result of :func:`execute`."""

    status: ExecStatus
    errors: list[str] = field(default_factory=list)
    missing_fields: list[str] = field(default_factory=list)
    receipt: object | None = None  # the signed XR, only on success


#: In-memory idempotency store: key -> XR.
IdempotencyStore = dict[str, object]


def _rail_supported(rail: str) -> bool:
    """An explicit ``unknown:`` scheme is unsupported; an absent rail is fine."""
    return not rail.startswith("unknown:")


def _validate_amount(args: object) -> str:
    """Enforce section 3.2 on a present ``amount``.

    It MUST be ``{value: finite number > 0, unit: non-empty string}``. Returns
    the offending field, or "" when absent or valid.

    This is the difference between a Settler that authorizes a negative payment
    and one that does not: an audit found every stack approving
    ``{value: -1000}`` because they only checked that the key existed.
    """
    amount, found = path(args, "amount")
    if not found:
        return ""
    if not isinstance(amount, JsonObject):
        return "amount"
    value = amount.get("value")
    if not isinstance(value, Number):
        return "amount.value"
    try:
        number = float(str(value))
    except ValueError:
        return "amount.value"
    if math.isnan(number) or math.isinf(number) or number <= 0:
        return "amount.value"
    unit = amount.get("unit")
    if not isinstance(unit, str) or isinstance(unit, Number) or not unit:
        return "amount.unit"
    return ""


def args_hash(args: object) -> str:
    """multibase(multihash(sha2-256, JCS(args)))."""
    return multihash_mb(canonicalize(args).encode("utf-8"))


def derive_idempotency_key(
    commitment_cid: str, verb: str, rail: str, args: object, verb_index: int = 0
) -> str:
    """Derive an idempotency key per section 6.1 when the client omits one.

    Deterministic and JCS-based, so the same request derives the same key in
    every stack.
    """
    components = JsonObject()
    components.set("args_hash", args_hash(args))
    components.set("commitment_cid", commitment_cid)
    components.set("rail", rail)
    components.set("verb", verb)
    components.set("verb_index", Number(str(verb_index)))
    return multihash_mb(canonicalize(components).encode("utf-8"))


def execute(
    request: ExecRequest,
    seed: bytes,
    kid: str = "",
    ts: str = "",
    anchor_target: str = "",
    store: IdempotencyStore | None = None,
) -> ExecuteResult:
    """Validate and execute a request, returning a signed Execution Receipt.

    Pre-check order is verb, then args, then rail (section 4.2). There is no
    real rail, so the XR carries a mock locator and a pending anchor. Pass a
    ``store`` to enable idempotency: a repeat of the same key returns the
    identical cached receipt rather than executing twice.
    """
    if not is_registered_verb(request.verb):
        return ExecuteResult(ExecStatus.FAILED, errors=["settler.unknown_verb"])

    missing = [k for k in verb_required_args(request.verb) if not path(request.args, k)[1]]
    if missing:
        return ExecuteResult(
            ExecStatus.FAILED, errors=["settler.invalid_args"], missing_fields=missing
        )

    bad_field = _validate_amount(request.args)
    if bad_field:
        return ExecuteResult(
            ExecStatus.FAILED, errors=["settler.invalid_args"], missing_fields=[bad_field]
        )

    if not _rail_supported(request.rail):
        return ExecuteResult(ExecStatus.FAILED, errors=["settler.unsupported_rail"])

    idempotency_key = request.idempotency_key or derive_idempotency_key(
        request.commitment_cid, request.verb, request.rail, request.args, 0
    )

    if store is not None and idempotency_key in store:
        return ExecuteResult(ExecStatus.SUCCESS, receipt=store[idempotency_key])

    request_id = request.request_id or f"exec-{idempotency_key[:12]}"

    anchor = JsonObject()
    anchor.set("target", anchor_target)
    anchor.set("locator", f"batch-{idempotency_key[1:10]}")
    anchor.set("status", "pending")

    body = JsonObject()
    body.set("request_id", request_id)
    body.set("commitment_cid", request.commitment_cid)
    body.set("verb", request.verb)
    body.set("rail", request.rail)
    body.set("args_hash", args_hash(request.args))
    body.set("idempotency_key", idempotency_key)
    body.set("status", "success")
    body.set("locator", f"MOCK-{idempotency_key[1:18]}")
    body.set("anchors", [anchor])
    body.set("ts", ts)

    canonical = canonicalize(body)
    receipt = body.clone()
    receipt.set("cid", cid_from_canonical(canonical))
    receipt.set("sig", sign_detached(canonical.encode("utf-8"), seed, kid or None))

    if store is not None:
        store[idempotency_key] = receipt
    return ExecuteResult(ExecStatus.SUCCESS, receipt=receipt)
