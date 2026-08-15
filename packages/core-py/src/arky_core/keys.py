"""Ed25519 key helpers and did:key derivation.

The verification identity is a ``did:key:z6Mk...`` derived from the public key,
so ``identity.id`` resolves to the signing key (ARKY-TIM-v1 section 6.1). Using
these helpers together guarantees the DID and the key agree — a mismatch
between them is exactly the bug an earlier audit found in the published
fixtures, where 19 artifacts carried a DID that did not match their signer.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass

from . import ed25519
from .cid import to_multibase

__all__ = ["KeyPair", "did_key_from_public", "from_seed", "generate_keypair"]


@dataclass(frozen=True)
class KeyPair:
    """An Ed25519 keypair plus its matching did:key identity."""

    seed: bytes
    public_key: bytes
    did: str


def did_key_from_public(public_key: bytes) -> str:
    """Derive the did:key form (multicodec 0xed01 + pubkey, base58btc, 'z')."""
    return "did:key:" + to_multibase(b"\xed\x01" + public_key)


def from_seed(seed: bytes) -> KeyPair:
    """Build a KeyPair from a 32-byte seed."""
    public_key = ed25519.publickey(seed)
    return KeyPair(seed=seed, public_key=public_key, did=did_key_from_public(public_key))


def generate_keypair() -> KeyPair:
    """Create a new random KeyPair using the OS CSPRNG."""
    return from_seed(secrets.token_bytes(ed25519.SEED_SIZE))
