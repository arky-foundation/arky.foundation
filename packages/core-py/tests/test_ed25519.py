"""Ed25519 against the RFC 8032 official test vectors.

This stack implements Ed25519 from the RFC rather than importing a library, so
these vectors are load-bearing: they are the only thing standing between a
subtle arithmetic error and silently-wrong signatures. They already caught one
real bug — a scalar ladder sized 253 bits when clamping produces a 255-bit
scalar, which silently discarded the top bits and yielded wrong public keys.
"""

from __future__ import annotations

import pytest

from arky_core import ed25519

# RFC 8032 section 7.1 (Ed25519) test vectors: seed, public key, message, sig.
RFC8032_VECTORS = [
    (
        "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
        "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
        "",
        "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc"
        "61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
    ),
    (
        "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
        "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
        "72",
        "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e"
        "458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00",
    ),
    (
        "c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7",
        "fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025",
        "af82",
        "6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290"
        "ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a",
    ),
]


@pytest.mark.parametrize(("seed_hex", "pub_hex", "msg_hex", "sig_hex"), RFC8032_VECTORS)
def test_rfc8032_vectors(seed_hex: str, pub_hex: str, msg_hex: str, sig_hex: str) -> None:
    seed = bytes.fromhex(seed_hex)
    message = bytes.fromhex(msg_hex)

    public_key = ed25519.publickey(seed)
    assert public_key.hex() == pub_hex

    signature = ed25519.sign(message, seed, public_key)
    assert signature.hex() == sig_hex
    assert ed25519.verify(signature, message, public_key)


def test_tampering_is_rejected() -> None:
    seed = bytes.fromhex(RFC8032_VECTORS[1][0])
    message = bytes.fromhex(RFC8032_VECTORS[1][2])
    public_key = ed25519.publickey(seed)
    signature = ed25519.sign(message, seed, public_key)

    assert not ed25519.verify(signature, message + b"x", public_key)
    assert not ed25519.verify(bytes([signature[0] ^ 1]) + signature[1:], message, public_key)
    assert not ed25519.verify(signature[:-1] + bytes([signature[-1] ^ 1]), message, public_key)

    other = ed25519.publickey(bytes([1]) * 32)
    assert not ed25519.verify(signature, message, other)


def test_malformed_inputs_return_false_without_raising() -> None:
    """A verifier on untrusted receipts must never be crashable."""
    seed = bytes([7]) * 32
    public_key = ed25519.publickey(seed)
    signature = ed25519.sign(b"payload", seed, public_key)

    assert not ed25519.verify(b"", b"payload", public_key)
    assert not ed25519.verify(b"\x00" * 63, b"payload", public_key)
    assert not ed25519.verify(b"\x00" * 65, b"payload", public_key)
    assert not ed25519.verify(signature, b"payload", b"")
    assert not ed25519.verify(signature, b"payload", b"\x00" * 31)
    # An all-zero public key is not a valid curve point.
    assert not ed25519.verify(signature, b"payload", b"\x00" * 32)
    # A y >= p encoding is non-canonical.
    assert not ed25519.verify(signature, b"payload", b"\xff" * 32)


def test_non_canonical_s_is_rejected() -> None:
    """S >= L must be refused, which is what blocks trivial malleability."""
    seed = bytes([7]) * 32
    public_key = ed25519.publickey(seed)
    signature = ed25519.sign(b"payload", seed, public_key)
    assert ed25519.verify(signature, b"payload", public_key)

    order = 2**252 + 27742317777372353535851937790883648493
    s = int.from_bytes(signature[32:], "little")
    malleable = signature[:32] + (s + order).to_bytes(32, "little")
    assert not ed25519.verify(malleable, b"payload", public_key)


def test_seed_size_is_enforced() -> None:
    with pytest.raises(ValueError):
        ed25519.publickey(b"\x00" * 31)
    with pytest.raises(ValueError):
        ed25519.sign(b"m", b"\x00" * 33)


def test_signatures_are_deterministic() -> None:
    """Ed25519 is deterministic: the same input always yields the same bytes."""
    seed = bytes([3]) * 32
    first = ed25519.sign(b"same message", seed)
    second = ed25519.sign(b"same message", seed)
    assert first == second
