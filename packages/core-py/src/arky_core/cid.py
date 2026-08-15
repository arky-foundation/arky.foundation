"""Content addressing per ARKY-TIM-Canonicalization-v1 section 4.

``cid = multibase('z', base58btc(multihash(sha2-256, canonical_bytes)))``,
where ``multihash = 0x12 0x20 || sha256(bytes)``. This is NOT an IPFS CID.
"""

from __future__ import annotations

import hashlib

from .canonicalize import canonicalize

__all__ = [
    "Base58Error",
    "base58btc_decode",
    "base58btc_encode",
    "cid_from_canonical",
    "compute_cid",
    "from_multibase",
    "multihash_mb",
    "multihash_sha256",
    "to_multibase",
]

_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_INDEX = {ch: i for i, ch in enumerate(_ALPHABET)}


class Base58Error(ValueError):
    """Raised for input outside the base58btc alphabet or multibase prefix."""


def base58btc_encode(data: bytes) -> str:
    """Encode bytes as base58btc (hand-rolled; there is no stdlib base58)."""
    if not data:
        return ""
    zeros = 0
    while zeros < len(data) and data[zeros] == 0:
        zeros += 1
    num = int.from_bytes(data, "big")
    out: list[str] = []
    while num > 0:
        num, rem = divmod(num, 58)
        out.append(_ALPHABET[rem])
    # Each leading zero byte encodes as a literal '1'.
    return "1" * zeros + "".join(reversed(out))


def base58btc_decode(text: str) -> bytes:
    """Decode a base58btc string, raising :class:`Base58Error` on bad input."""
    if text == "":
        return b""
    zeros = 0
    while zeros < len(text) and text[zeros] == "1":
        zeros += 1
    num = 0
    for ch in text[zeros:]:
        digit = _INDEX.get(ch)
        if digit is None:
            raise Base58Error(f"invalid base58 character {ch!r}")
        num = num * 58 + digit
    body = num.to_bytes((num.bit_length() + 7) // 8, "big") if num else b""
    return b"\x00" * zeros + body


def multihash_sha256(data: bytes) -> bytes:
    """multihash(sha2-256, data) = 0x12 0x20 || digest (34 bytes)."""
    return b"\x12\x20" + hashlib.sha256(data).digest()


def to_multibase(data: bytes) -> str:
    """Encode bytes as multibase base58btc (the 'z' prefix)."""
    return "z" + base58btc_encode(data)


def from_multibase(text: str) -> bytes:
    """Decode a multibase 'z...' (base58btc) string."""
    if not text.startswith("z"):
        raise Base58Error("multibase: expected 'z' prefix")
    return base58btc_decode(text[1:])


def multihash_mb(data: bytes) -> str:
    """multibase(multihash(sha2-256, data))."""
    return to_multibase(multihash_sha256(data))


def cid_from_canonical(canonical: str) -> str:
    """Compute the cid over canonical bytes."""
    return multihash_mb(canonical.encode("utf-8"))


def compute_cid(value: object) -> str:
    """Canonicalize a value and return its cid."""
    return cid_from_canonical(canonicalize(value))
