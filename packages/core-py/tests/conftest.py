"""Shared fixtures and helpers for the arky-core test suite."""

from __future__ import annotations

import base64
import pathlib

import arky_core as arky

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
VECTORS = REPO_ROOT / "vectors"


def read_vector(path: pathlib.Path) -> object:
    """Parse a vector/fixture file through the package's own parser."""
    return arky.parse(path.read_text(encoding="utf-8"))


def list_json(directory: pathlib.Path) -> list[pathlib.Path]:
    """Sorted .json files in a directory (empty if it does not exist)."""
    if not directory.is_dir():
        return []
    return sorted(p for p in directory.iterdir() if p.suffix == ".json")


def _b64u(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def vector_resolver(tim: object, witness_kid: str = "") -> bytes | None:
    """Resolver used for the published vectors.

    The TIM's did:key issuer, plus the two published test witness keys addressed
    by ``kid`` (the fixtures predate did:key witnesses). Mirrors the Rust and Go
    conformance resolvers so all stacks verify the same artifacts.
    """
    if witness_kid:
        known = {
            "test-key-2025-02": "e_vAtyLIHAXMh1TRvhFUNrvifhH5ZzXKGwGKk9zgB9I",
            "notary-key-2025-01": "HDl_cQgT9vSiYMsH8q1dOdyb5prCuQYuRVBRhTTk1P8",
        }
        if witness_kid in known:
            return _b64u(known[witness_kid])
        key = arky.resolve_did_key(witness_kid)
        if key is not None:
            return key
    return arky.resolve_did_key(arky.get_str(tim, "identity", "id"))


def obj(**pairs: object) -> arky.JsonObject:
    """Build a JsonObject from keyword pairs, preserving insertion order."""
    out = arky.JsonObject()
    for key, value in pairs.items():
        out.set(key, value)
    return out


def base_body(did: str) -> arky.JsonObject:
    """The minimal valid TIM body used across the security tests."""
    return obj(
        time=obj(ts="2025-10-15T12:00:00Z"),
        identity=obj(id=did),
        measurement=obj(
            name="temp",
            value=arky.Number("22.5"),
            unit="degC",
            method=obj(type="sensor", source="s"),
        ),
    )
