"""Detached-payload JWS (compact) with Ed25519/EdDSA.

Per ARKY-TIM-v1 section 6 and RFC 7797 (``b64:false``): the compact form is
``<protected>..<signature>`` and the payload — the JCS canonical bytes — is
supplied separately rather than embedded.
"""

from __future__ import annotations

import base64

from . import ed25519
from .canonicalize import _write_string
from .jsonvalue import JsonObject, parse

__all__ = [
    "b64url_decode",
    "b64url_encode",
    "decode_protected_header",
    "sign_detached",
    "verify_detached",
]


def b64url_encode(data: bytes) -> str:
    """base64url without padding."""
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def b64url_decode(text: str) -> bytes:
    """Decode base64url without padding. Raises on invalid input."""
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + padding)


def _protected_header(kid: str | None) -> str:
    """Build the JWS protected header JSON.

    Member order is fixed at ``alg, typ, [kid,] b64, crit`` and written by hand
    rather than via ``json.dumps``, which would also insert spaces after
    separators by default. The header is base64url-encoded verbatim into the
    signing input, so both its byte order and its exact spelling are part of the
    signature: any difference here yields a signature the other stacks reject.
    """
    parts = ['{"alg":"EdDSA","typ":"JWS"']
    if kid:
        out: list[str] = []
        _write_string(kid, out)
        parts.append(',"kid":' + "".join(out))
    parts.append(',"b64":false,"crit":["b64"]}')
    return "".join(parts)


def _signing_input(protected_b64: str, payload: bytes) -> bytes:
    """RFC 7797 signing input: ASCII(BASE64URL(protected)) || '.' || payload."""
    return protected_b64.encode("ascii") + b"." + payload


def sign_detached(payload: bytes, seed: bytes, kid: str | None = None) -> str:
    """Sign canonical ``payload`` bytes, returning ``<protected>..<signature>``."""
    protected_b64 = b64url_encode(_protected_header(kid).encode("utf-8"))
    signature = ed25519.sign(_signing_input(protected_b64, payload), seed)
    return f"{protected_b64}..{b64url_encode(signature)}"


def decode_protected_header(jws: str) -> object:
    """Decode the protected header of a compact JWS. Raises on malformed input."""
    protected_b64 = jws.split(".", 1)[0]
    if not protected_b64:
        raise ValueError("jws: empty protected header")
    return parse(b64url_decode(protected_b64).decode("utf-8"))


def verify_detached(jws: str, payload: bytes, public_key: bytes) -> bool:
    """Verify a detached compact JWS against an Ed25519 public key.

    Returns True only if the signature is valid, the payload segment is empty,
    and the header is well-formed (``alg`` EdDSA, ``b64`` false, ``crit``
    containing ``b64``).

    The header checks are defense in depth: the protected header is part of the
    signing input, so tampering with ``alg`` already breaks the signature. They
    are kept so an ``alg:none`` downgrade is refused explicitly rather than
    incidentally. Never raises, whatever the input.
    """
    parts = jws.split(".")
    if len(parts) != 3 or parts[1] != "":
        return False
    protected_b64, sig_b64 = parts[0], parts[2]

    try:
        header = decode_protected_header(jws)
    except Exception:
        return False
    if not isinstance(header, JsonObject):
        return False
    if header.get("alg") != "EdDSA":
        return False
    if header.get("b64") is not False:
        return False
    crit = header.get("crit")
    if not isinstance(crit, list) or "b64" not in crit:
        return False

    try:
        signature = b64url_decode(sig_b64)
    except Exception:
        return False
    return ed25519.verify(signature, _signing_input(protected_b64, payload), public_key)
