"""Conformance against the Foundation's published vectors.

These are the same vector files the TypeScript, Rust and Go stacks run, so a
divergence here is a divergence from every other implementation.
"""

from __future__ import annotations

import pytest
from conftest import VECTORS, list_json, obj, read_vector, vector_resolver

import arky_core as arky


def _canonicalization_vectors() -> list:
    out = []
    for file in list_json(VECTORS / "canonicalization"):
        vector = read_vector(file)
        original, found = arky.path(vector, "inputs", "original")
        expected = arky.get_str(vector, "expect", "canonical_json")
        if found and expected:
            out.append(pytest.param(vector, original, expected, id=arky.get_str(vector, "id")))
    return out


@pytest.mark.parametrize(("vector", "original", "expected"), _canonicalization_vectors())
def test_canonicalization_vectors(vector: object, original: object, expected: str) -> None:
    """C1/C2: canonical string and its exact byte encoding must match."""
    got = arky.canonicalize(original)
    assert got == expected, arky.get_str(vector, "description")

    expected_hex = arky.get_str(vector, "expect", "canonical_bytes_hex")
    if expected_hex:
        assert got.encode("utf-8").hex() == expected_hex


def _tim_vectors() -> list:
    out = []
    for file in list_json(VECTORS / "tim"):
        vector = read_vector(file)
        tim, found = arky.path(vector, "inputs", "tim")
        expect_valid, has_expect = arky.path(vector, "expect", "valid")
        if found and has_expect and isinstance(expect_valid, bool):
            out.append(pytest.param(vector, tim, expect_valid, id=arky.get_str(vector, "id")))
    return out


@pytest.mark.parametrize(("vector", "tim", "expect_valid"), _tim_vectors())
def test_tim_vectors(vector: object, tim: object, expect_valid: bool) -> None:
    """T1/T2: each vector's stated validity, negative cases included."""
    at = arky.get_str(vector, "context", "verify_options", "at")
    result = arky.verify_tim_at(tim, vector_resolver, at or None)
    assert result.valid is expect_valid, (
        f"{arky.get_str(vector, 'description')}: errors={result.errors}"
    )


def _tim_fixtures() -> list:
    out = []
    for file in list_json(VECTORS / "fixtures" / "tims"):
        out.append(pytest.param(read_vector(file), id=file.stem))
    return out


@pytest.mark.parametrize("wrapper", _tim_fixtures())
def test_tim_fixtures_verify_and_cid(wrapper: object) -> None:
    """Independently verify the signed fixtures and recompute each cid."""
    tim, found = arky.path(wrapper, "tim")
    if not found:
        tim = wrapper

    expect_valid = True
    stated, has_stated = arky.path(wrapper, "expect", "valid")
    if has_stated and isinstance(stated, bool):
        expect_valid = stated

    result = arky.verify_tim_at(tim, vector_resolver, None)
    assert result.valid is expect_valid, f"errors={result.errors}"

    if expect_valid:
        canonical = arky.canonicalize(arky.canonical_body(tim))
        assert arky.cid_from_canonical(canonical) == arky.get_str(tim, "cid")


def test_round_trip_produce_then_verify() -> None:
    """A TIM produced by this stack verifies, and its cid is spec-correct."""
    kp = arky.generate_keypair()
    body = obj(
        time=obj(ts="2025-10-15T12:00:00Z"),
        identity=obj(id=kp.did),
        measurement=obj(
            name="temperature",
            value=arky.Number("22.5"),
            unit="arky:unit/temp.C",
            method=obj(type="sensor", source="device:test"),
        ),
    )
    tim = arky.create_tim(body, kp.seed)

    result = arky.verify_tim(tim)
    assert result.valid, result.errors

    canonical = arky.canonicalize(arky.canonical_body(tim))
    assert arky.cid_from_canonical(canonical) == arky.get_str(tim, "cid")


def _kernel_vectors() -> list:
    out = []
    for file in list_json(VECTORS / "kernel"):
        vector = read_vector(file)
        commitment, found = arky.path(vector, "inputs", "commitment")
        want = arky.get_str(vector, "expect", "decision", "status")
        if found and want:
            out.append(pytest.param(vector, commitment, want, id=arky.get_str(vector, "id")))
    return out


@pytest.mark.parametrize(("vector", "commitment", "want_status"), _kernel_vectors())
def test_kernel_vectors(vector: object, commitment: object, want_status: str) -> None:
    """K1/K2: decision status and the authorized verb list."""
    tims: list[object] = []
    fixture_path = arky.get_str(vector, "context", "fixtures", "tim")
    if fixture_path:
        fixture = read_vector(VECTORS / fixture_path)
        tim, found = arky.path(fixture, "tim")
        if found:
            tims.append(tim)
    evidence, found = arky.path(vector, "context", "evidence")
    if found and isinstance(evidence, list):
        tims.extend(evidence)

    eval_time = arky.get_str(vector, "context", "time") or "2025-10-15T12:00:00Z"
    decision = arky.evaluate_kernel(commitment, tims, eval_time)

    assert str(decision.status) == want_status, arky.get_str(vector, "description")

    expected_verbs, has_verbs = arky.path(vector, "expect", "decision", "authorized")
    if has_verbs and isinstance(expected_verbs, list):
        want = [v for v in expected_verbs if isinstance(v, str)]
        assert decision.authorized == want


def _settler_vectors() -> list:
    out = []
    for file in list_json(VECTORS / "settlers"):
        vector = read_vector(file)
        if arky.get_str(vector, "level") != "S1":
            continue
        want = arky.get_str(vector, "expect", "status")
        if want:
            out.append(pytest.param(vector, want, id=arky.get_str(vector, "id")))
    return out


@pytest.mark.parametrize(("vector", "want_status"), _settler_vectors())
def test_settler_vectors(vector: object, want_status: str) -> None:
    """S1: execution status for each published request."""
    args, _ = arky.path(vector, "inputs", "params")
    result = arky.execute(
        arky.ExecRequest(
            verb=arky.get_str(vector, "inputs", "verb"),
            rail=arky.get_str(vector, "inputs", "rail"),
            args=args,
            idempotency_key=arky.get_str(vector, "inputs", "idempotency_key"),
        ),
        seed=bytes([9]) * 32,
        kid="test-settler",
        ts=arky.get_str(vector, "context", "time") or "2025-10-15T12:00:01Z",
        anchor_target="log:arky:transparency@v1",
        store={},
    )
    assert str(result.status) == want_status, (
        f"{arky.get_str(vector, 'description')}: errors={result.errors}"
    )


def test_vectors_actually_ran() -> None:
    """Guard against the parametrize helpers silently collecting nothing."""
    assert len(_canonicalization_vectors()) >= 10
    assert len(_tim_vectors()) >= 5
    assert len(_kernel_vectors()) >= 10
    assert len(_settler_vectors()) >= 5
    assert len(_tim_fixtures()) >= 2
