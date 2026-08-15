"""Ed25519 (RFC 8032) on top of ``hashlib``, with no third-party dependency.

Python has no stdlib Ed25519, and the other three reference stacks
(TypeScript, Rust, Go) are all dependency-free. Pulling in ``cryptography`` or
``PyNaCl`` here would make the *reference* implementation of a signature
protocol depend on someone else's reading of it, and would add a build/supply
-chain surface to a package whose whole job is to be auditable. So the curve
arithmetic is implemented from the RFC, verified against its official test
vectors in ``tests/test_ed25519.py``.

Scope and limits, stated plainly:

* This is a **reference** implementation optimized for clarity and
  auditability. It is written with constant-ish structure but Python cannot
  offer real constant-time guarantees (big-int arithmetic, garbage collection,
  and branch prediction are all outside its control).
* **Signing** with a long-lived secret in an adversarial, co-located setting
  should use a vetted native library. **Verification** — the operation a
  receipt consumer actually performs — handles only public data, so the
  side-channel concern does not apply.

Verification follows the RFC 8032 section 5.1.7 check ``[8][S]B = [8]R +
[8][k]A`` and rejects non-canonical or out-of-range inputs rather than raising.
"""

from __future__ import annotations

import hashlib

__all__ = ["PUBLIC_KEY_SIZE", "SEED_SIZE", "SIGNATURE_SIZE", "publickey", "sign", "verify"]

SEED_SIZE = 32
PUBLIC_KEY_SIZE = 32
SIGNATURE_SIZE = 64

_P = 2**255 - 19  # field prime
_L = 2**252 + 27742317777372353535851937790883648493  # group order
_D = -121665 * pow(121666, _P - 2, _P) % _P
_SQRT_M1 = pow(2, (_P - 1) // 4, _P)

# Extended twisted Edwards coordinates: (X, Y, Z, T) with x=X/Z, y=Y/Z, xy=T/Z.
_Point = tuple[int, int, int, int]


def _sha512(data: bytes) -> bytes:
    return hashlib.sha512(data).digest()


def _recover_x(y: int, sign_bit: int) -> int | None:
    """Recover x from y on the curve, or None if the point is not on it."""
    if y >= _P:
        return None  # non-canonical encoding
    xx = (y * y - 1) * pow(_D * y * y + 1, _P - 2, _P) % _P
    x = pow(xx, (_P + 3) // 8, _P)
    if (x * x - xx) % _P != 0:
        x = x * _SQRT_M1 % _P
    if (x * x - xx) % _P != 0:
        return None  # not a square: not on the curve
    if x == 0 and sign_bit:
        return None  # non-canonical: -0 is not a valid encoding
    if x & 1 != sign_bit:
        x = _P - x
    return x


_BASE_Y = 4 * pow(5, _P - 2, _P) % _P
_BASE_X = _recover_x(_BASE_Y, 0)
assert _BASE_X is not None
_B: _Point = (_BASE_X, _BASE_Y, 1, _BASE_X * _BASE_Y % _P)
_IDENTITY: _Point = (0, 1, 1, 0)


def _add(p: _Point, q: _Point) -> _Point:
    x1, y1, z1, t1 = p
    x2, y2, z2, t2 = q
    a = (y1 - x1) * (y2 - x2) % _P
    b = (y1 + x1) * (y2 + x2) % _P
    c = 2 * t1 * t2 * _D % _P
    dd = 2 * z1 * z2 % _P
    e, f, g, h = b - a, dd - c, dd + c, b + a
    return (e * f % _P, g * h % _P, f * g % _P, e * h % _P)


# Clamping sets bit 254, so a secret scalar is 255 bits wide; the ladder must
# cover every one of them. (An earlier 253-bit ladder silently discarded the top
# bits and produced wrong public keys — caught by the RFC 8032 vectors.)
_LADDER_BITS = 256


def _mul(p: _Point, n: int) -> _Point:
    """Scalar multiplication by double-and-add over a fixed-width ladder.

    The loop count does not depend on the scalar's magnitude, which keeps the
    obvious timing signal out of signing. See the module docstring for why this
    is not a constant-time guarantee.
    """
    result = _IDENTITY
    addend = p
    for _ in range(_LADDER_BITS):
        if n & 1:
            result = _add(result, addend)
        addend = _add(addend, addend)
        n >>= 1
    return result


def _encode_point(p: _Point) -> bytes:
    x, y, z, _ = p
    zi = pow(z, _P - 2, _P)
    x = x * zi % _P
    y = y * zi % _P
    return int.to_bytes(y | ((x & 1) << 255), 32, "little")


def _decode_point(data: bytes) -> _Point | None:
    if len(data) != 32:
        return None
    value = int.from_bytes(data, "little")
    sign_bit = value >> 255
    y = value & ((1 << 255) - 1)
    x = _recover_x(y, sign_bit)
    if x is None:
        return None
    return (x, y, 1, x * y % _P)


def _secret_scalar(seed: bytes) -> tuple[int, bytes]:
    """Clamp the hashed seed into a scalar, returning it with the prefix half."""
    h = _sha512(seed)
    a = int.from_bytes(h[:32], "little")
    a &= (1 << 254) - 8  # clear the low 3 bits and the high bit
    a |= 1 << 254  # set the second-highest bit
    return a, h[32:]


def publickey(seed: bytes) -> bytes:
    """Derive the 32-byte public key from a 32-byte seed."""
    if len(seed) != SEED_SIZE:
        raise ValueError(f"seed must be {SEED_SIZE} bytes, got {len(seed)}")
    a, _ = _secret_scalar(seed)
    return _encode_point(_mul(_B, a))


def sign(message: bytes, seed: bytes, public_key: bytes | None = None) -> bytes:
    """Sign ``message`` with a 32-byte seed, returning a 64-byte signature."""
    if len(seed) != SEED_SIZE:
        raise ValueError(f"seed must be {SEED_SIZE} bytes, got {len(seed)}")
    a, prefix = _secret_scalar(seed)
    if public_key is None:
        public_key = _encode_point(_mul(_B, a))
    r = int.from_bytes(_sha512(prefix + message), "little") % _L
    big_r = _encode_point(_mul(_B, r))
    k = int.from_bytes(_sha512(big_r + public_key + message), "little") % _L
    s = (r + k * a) % _L
    return big_r + int.to_bytes(s, 32, "little")


def verify(signature: bytes, message: bytes, public_key: bytes) -> bool:
    """Verify a 64-byte Ed25519 signature.

    Returns ``False`` for every malformed input — wrong lengths, a public key or
    R that is not a valid curve point, or a non-canonical S >= L — and never
    raises, so a verifier processing untrusted receipts cannot be crashed.
    """
    if len(signature) != SIGNATURE_SIZE or len(public_key) != PUBLIC_KEY_SIZE:
        return False

    big_r_bytes, s_bytes = signature[:32], signature[32:]
    s = int.from_bytes(s_bytes, "little")
    if s >= _L:
        # Non-canonical S: rejecting this is what prevents trivial signature
        # malleability (S and S+L would otherwise both verify).
        return False

    big_a = _decode_point(public_key)
    if big_a is None:
        return False
    big_r = _decode_point(big_r_bytes)
    if big_r is None:
        return False

    k = int.from_bytes(_sha512(big_r_bytes + public_key + message), "little") % _L

    # Cofactored check (RFC 8032 section 5.1.7): [8][S]B == [8]R + [8][k]A.
    lhs = _mul(_B, s * 8 % _L)
    rhs = _add(_mul(big_r, 8), _mul(big_a, k * 8 % _L))
    return _points_equal(lhs, rhs)


def _points_equal(p: _Point, q: _Point) -> bool:
    x1, y1, z1, _ = p
    x2, y2, z2, _ = q
    return (x1 * z2 - x2 * z1) % _P == 0 and (y1 * z2 - y2 * z1) % _P == 0
