"""arky-core — reference Python implementation of Arky TIM.

A fourth independent stack covering JCS canonicalization (RFC 8785, hand-rolled
including number formatting), content addressing (multihash sha2-256 with
base58btc multibase), detached-payload Ed25519 JWS (RFC 7797), TIM verification
with did:key resolution, and the Kernel and Settler layers.

Built clean-room from the specs, it reproduces byte-identical canonical bytes,
cids, and signatures to ``@arky/core`` (TypeScript), ``arky-core`` (Rust) and
``arky-core-go`` (Go) on the Foundation's published vectors.

No third-party dependencies: Ed25519 is implemented from RFC 8032 on top of
``hashlib``. See :mod:`arky_core.ed25519` for the scope and limits of that
choice.
"""

from __future__ import annotations

from .assertion import EvalResult, Symbols, SymVal, TriState, evaluate_assertion
from .canonicalize import JcsError, canonicalize, ecmascript_number_to_string
from .cid import (
    Base58Error,
    base58btc_decode,
    base58btc_encode,
    cid_from_canonical,
    compute_cid,
    from_multibase,
    multihash_mb,
    multihash_sha256,
    to_multibase,
)
from .jsonvalue import (
    JsonObject,
    JsonParseError,
    Number,
    get_str,
    parse,
    parse_strict,
    path,
)
from .jws import (
    b64url_decode,
    b64url_encode,
    decode_protected_header,
    sign_detached,
    verify_detached,
)
from .kernel import (
    REGISTERED_VERBS,
    AssertionResult,
    Decision,
    DecisionStatus,
    evaluate_kernel,
    is_registered_verb,
)
from .keys import KeyPair, did_key_from_public, from_seed, generate_keypair
from .settler import (
    ExecRequest,
    ExecStatus,
    ExecuteResult,
    args_hash,
    derive_idempotency_key,
    execute,
    verb_required_args,
)
from .tim import (
    KeyResolver,
    VerifyResult,
    canonical_body,
    create_tim,
    default_resolver,
    resolve_did_key,
    verify_tim,
    verify_tim_at,
)
from .timeparse import parse_iso_duration_ms, parse_rfc3339_ms

__version__ = "0.1.0"

# Grouped by concern rather than alphabetically: this is the package's
# guided tour of the protocol layers.
__all__ = [  # noqa: RUF022
    # canonicalization + json
    "canonicalize",
    "ecmascript_number_to_string",
    "JcsError",
    "parse",
    "parse_strict",
    "path",
    "get_str",
    "JsonObject",
    "JsonParseError",
    "Number",
    # content addressing
    "compute_cid",
    "cid_from_canonical",
    "multihash_sha256",
    "multihash_mb",
    "to_multibase",
    "from_multibase",
    "base58btc_encode",
    "base58btc_decode",
    "Base58Error",
    # keys + jws
    "KeyPair",
    "generate_keypair",
    "from_seed",
    "did_key_from_public",
    "sign_detached",
    "verify_detached",
    "decode_protected_header",
    "b64url_encode",
    "b64url_decode",
    # tim
    "create_tim",
    "verify_tim",
    "verify_tim_at",
    "canonical_body",
    "resolve_did_key",
    "default_resolver",
    "VerifyResult",
    "KeyResolver",
    # assertions + kernel
    "evaluate_assertion",
    "TriState",
    "SymVal",
    "Symbols",
    "EvalResult",
    "evaluate_kernel",
    "Decision",
    "DecisionStatus",
    "AssertionResult",
    "REGISTERED_VERBS",
    "is_registered_verb",
    # settler
    "execute",
    "ExecRequest",
    "ExecuteResult",
    "ExecStatus",
    "args_hash",
    "derive_idempotency_key",
    "verb_required_args",
    # time
    "parse_rfc3339_ms",
    "parse_iso_duration_ms",
    "__version__",
]
