"""TIM produce and verify, per ARKY-TIM-v1.

The canonical body is the TIM minus ``cid``, ``sig``, and ``time.witnesses``.
Witnesses are excluded because they are co-signatures over those same bytes —
including them would make the signed body depend on the signatures over it. The
issuer ``sig`` and each witness are detached Ed25519 JWS over the canonical
bytes.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from . import ed25519
from .canonicalize import JcsError, canonicalize
from .cid import Base58Error, cid_from_canonical, from_multibase
from .jsonvalue import JsonObject, get_str, path
from .jws import decode_protected_header, sign_detached, verify_detached
from .timeparse import parse_rfc3339_ms

__all__ = [
    "KeyResolver",
    "VerifyResult",
    "canonical_body",
    "create_tim",
    "default_resolver",
    "resolve_did_key",
    "verify_tim",
    "verify_tim_at",
]

# (tim, witness_kid) -> 32-byte public key, or None when no key is known.
KeyResolver = Callable[[object, str], "bytes | None"]

_REQUIRED_PATHS: tuple[tuple[str, ...], ...] = (
    ("time", "ts"),
    ("identity", "id"),
    ("measurement", "name"),
    ("measurement", "value"),
    ("measurement", "method"),
    ("cid",),
    ("sig",),
)


@dataclass
class VerifyResult:
    """The outcome of verifying a TIM."""

    valid: bool = False
    schema_valid: bool = False
    cid_valid: bool = False
    signature_valid: bool = False
    witnesses_valid: bool = False
    #: False only when a reference time was given to :func:`verify_tim_at` and
    #: the TIM's ``exp`` is at or before it (TIM section 4).
    fresh: bool = True
    errors: list[str] = field(default_factory=list)
    missing_fields: list[str] = field(default_factory=list)


def canonical_body(tim: object) -> object:
    """Return the canonical body: TIM minus cid, sig and time.witnesses.

    ``time`` is dropped entirely if removing the witnesses empties it.
    """
    if not isinstance(tim, JsonObject):
        return tim
    out = tim.clone()
    out.delete("cid")
    out.delete("sig")
    time_obj = out.get("time")
    if isinstance(time_obj, JsonObject):
        time_obj.delete("witnesses")
        if len(time_obj) == 0:
            out.delete("time")
    return out


def create_tim(body: object, seed: bytes, kid: str | None = None) -> JsonObject:
    """Build a signed TIM from a body object and a 32-byte Ed25519 seed."""
    base = body.clone() if isinstance(body, JsonObject) else JsonObject()
    base.delete("cid")
    base.delete("sig")

    canonical = canonicalize(base)
    out = base.clone()
    out.set("cid", cid_from_canonical(canonical))
    out.set("sig", sign_detached(canonical.encode("utf-8"), seed, kid))
    return out


def resolve_did_key(identity: str) -> bytes | None:
    """Extract the Ed25519 public key from a ``did:key:z6Mk...`` identity.

    Returns None for any malformed input — bad base58, wrong multicodec, or a
    payload that is not exactly 32 bytes — and never raises, so a verifier
    handling untrusted TIMs cannot be crashed by a hostile identity string.

    Both the ``z6Mk`` prefix and the 34-byte decoded length are enforced so this
    agrees exactly with the TypeScript, Rust and Go stacks on which identities
    resolve.
    """
    if not identity.startswith("did:key:z6Mk"):
        return None
    try:
        decoded = from_multibase(identity[len("did:key:") :])
    except (Base58Error, ValueError):
        return None
    if len(decoded) != 34 or decoded[0] != 0xED or decoded[1] != 0x01:
        return None
    return decoded[2:]


def default_resolver(tim: object, witness_kid: str = "") -> bytes | None:
    """Resolve the TIM's did:key identity, witness-aware.

    When a witness carries a did:key ``kid`` this resolves that notary's key, so
    a TIM co-signed by a second party verifies out of the box; otherwise it
    falls back to the TIM's own identity.
    """
    if witness_kid:
        key = resolve_did_key(witness_kid)
        if key is not None:
            return key
    return resolve_did_key(get_str(tim, "identity", "id"))


def verify_tim(tim: object, resolve: KeyResolver | None = None) -> VerifyResult:
    """Verify a TIM's cid, issuer signature and witnesses.

    A pure cryptographic check with no freshness enforcement. Pass ``None`` for
    ``resolve`` to use :func:`default_resolver`.
    """
    return verify_tim_at(tim, resolve, None)


def verify_tim_at(
    tim: object, resolve: KeyResolver | None = None, at: str | None = None
) -> VerifyResult:
    """Verify a TIM, optionally enforcing freshness (TIM section 4).

    When ``at`` is an RFC3339 timestamp and the TIM's ``exp`` is at or before
    it, the result is ``fresh=False`` with a ``tim.expired`` error. Pass None to
    skip the freshness check.

    Anti-replay (``nonce``) and causal-chain (``prev``) enforcement need
    external state and remain the caller's responsibility — single-TIM
    verification cannot do them. This function never raises.
    """
    if resolve is None:
        resolve = default_resolver
    result = VerifyResult()

    for required in _REQUIRED_PATHS:
        _, found = path(tim, *required)
        if not found:
            result.missing_fields.append(".".join(required))
    if result.missing_fields:
        result.errors.append("tim.missing_required")
        return result
    result.schema_valid = True

    # JCS forbids non-finite numbers and a hostile TIM can carry one. Translate
    # a canonicalization failure into the standard failure shape rather than
    # letting it escape, so the verifier stays safe on untrusted input.
    try:
        canonical = canonicalize(canonical_body(tim))
    except JcsError:
        result.errors.append("tim.non_finite")
        return result
    payload = canonical.encode("utf-8")

    result.cid_valid = cid_from_canonical(canonical) == get_str(tim, "cid")
    if not result.cid_valid:
        result.errors.append("tim.cid_mismatch")

    key = resolve(tim, "")
    if key is not None and len(key) == ed25519.PUBLIC_KEY_SIZE:
        result.signature_valid = verify_detached(get_str(tim, "sig"), payload, key)
        if not result.signature_valid:
            result.errors.append("tim.invalid_signature")
    else:
        result.errors.append("tim.key_unresolved")

    # Witnesses (optional): each is a detached JWS over the SAME canonical bytes.
    result.witnesses_valid = True
    witnesses, found = path(tim, "time", "witnesses")
    if found and isinstance(witnesses, list):
        for index, witness in enumerate(witnesses):
            jws = witness if isinstance(witness, str) else ""
            kid = ""
            try:
                header = decode_protected_header(jws)
                kid = get_str(header, "kid")
            except Exception:
                kid = ""
            wkey = resolve(tim, kid)
            if (
                wkey is None
                or len(wkey) != ed25519.PUBLIC_KEY_SIZE
                or not verify_detached(jws, payload, wkey)
            ):
                result.witnesses_valid = False
                result.errors.append(f"tim.invalid_witness[{index}]")

    # Freshness. Unparseable at/exp are ignored rather than treated as expired,
    # mirroring the other stacks.
    if at:
        exp = get_str(tim, "exp")
        if exp:
            now_ms = parse_rfc3339_ms(at)
            exp_ms = parse_rfc3339_ms(exp)
            if now_ms is not None and exp_ms is not None and exp_ms <= now_ms:
                result.fresh = False
                result.errors.append("tim.expired")

    result.valid = (
        result.cid_valid and result.signature_valid and result.witnesses_valid and result.fresh
    )
    return result
