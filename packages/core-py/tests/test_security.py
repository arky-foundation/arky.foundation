"""Adversarial / security regression tests for the Python stack.

The mirror of ``@arky/core``'s ``security.test.ts``, ``arky-core``'s
``security.rs``, and ``arky-core-go``'s ``security_test.go``: each case is an
attack that MUST be rejected (verification fails) or handled (no exception) —
never forged, never fatal.

The four stacks are cross-checked byte-for-byte on the happy path, so their
*failure* behaviour has to be pinned on each side too: a hole present in only
one stack is exactly the divergence an extra implementation exists to surface.
"""

from __future__ import annotations

import contextlib

import pytest
from conftest import base_body, obj

import arky_core as arky


def identity_resolver(tim: object, witness_kid: str = "") -> bytes | None:
    """Resolve only the TIM identity, ignoring any witness kid."""
    return arky.resolve_did_key(arky.get_str(tim, "identity", "id"))


def issuer_and_tim() -> tuple[arky.KeyPair, object]:
    issuer = arky.from_seed(bytes([7]) * 32)
    return issuer, arky.create_tim(base_body(issuer.did), issuer.seed)


def mutate(tim: object, outer: str, inner: str, value: object) -> object:
    """Return a clone with a (possibly nested) field replaced."""
    clone = tim.clone()
    if not inner:
        clone.set(outer, value)
        return clone
    sub = clone.get(outer)
    sub = sub.clone() if isinstance(sub, arky.JsonObject) else arky.JsonObject()
    sub.set(inner, value)
    clone.set(outer, sub)
    return clone


# --- forgery ---


def test_mutated_value_with_original_cid_and_sig_is_rejected() -> None:
    _, tim = issuer_and_tim()
    forged = mutate(tim, "measurement", "value", arky.Number("999"))
    assert not arky.verify_tim(forged, identity_resolver).valid


def test_mutated_value_with_recomputed_cid_and_stale_sig_is_rejected() -> None:
    _, tim = issuer_and_tim()
    forged = mutate(tim, "measurement", "value", arky.Number("999"))
    # Recompute the cid so it matches the tampered body, but keep the old sig.
    canonical = arky.canonicalize(arky.canonical_body(forged))
    forged.set("cid", arky.cid_from_canonical(canonical))

    result = arky.verify_tim(forged, identity_resolver)
    assert result.cid_valid, "the recomputed cid should match the tampered body"
    assert not result.signature_valid, "the stale signature must not verify"
    assert not result.valid


def test_attacker_signs_with_own_key_but_claims_victim_did() -> None:
    issuer = arky.from_seed(bytes([7]) * 32)
    attacker = arky.from_seed(bytes([9]) * 32)
    # identity.id is the victim's DID; the signature is the attacker's.
    forged = arky.create_tim(base_body(issuer.did), attacker.seed)

    result = arky.verify_tim(forged, identity_resolver)
    assert not result.valid
    assert not result.signature_valid


def test_swapping_identity_keeping_victim_signature_is_rejected() -> None:
    _, tim = issuer_and_tim()
    attacker = arky.from_seed(bytes([9]) * 32)
    forged = mutate(tim, "identity", "id", attacker.did)
    assert not arky.verify_tim(forged, identity_resolver).valid


def test_alg_none_downgrade_is_rejected() -> None:
    _, tim = issuer_and_tim()
    header = arky.b64url_encode(b'{"alg":"none","b64":false,"crit":["b64"]}')
    signature_part = arky.get_str(tim, "sig").split(".")[2]
    forged = mutate(tim, "sig", "", f"{header}..{signature_part}")
    assert not arky.verify_tim(forged, identity_resolver).valid


def test_empty_signature_is_rejected() -> None:
    _, tim = issuer_and_tim()
    header = arky.get_str(tim, "sig").split(".")[0]
    forged = mutate(tim, "sig", "", f"{header}..")
    assert not arky.verify_tim(forged, identity_resolver).valid


def test_forged_witness_is_rejected() -> None:
    _, tim = issuer_and_tim()
    attacker = arky.from_seed(bytes([9]) * 32)
    canonical = arky.canonicalize(arky.canonical_body(tim))
    witness = arky.sign_detached(canonical.encode("utf-8"), attacker.seed)
    forged = mutate(tim, "time", "witnesses", [witness])

    result = arky.verify_tim(forged, identity_resolver)
    assert not result.witnesses_valid
    assert not result.valid


# --- witness-aware default resolver ---


def test_witness_cosigned_by_second_did_key_notary_verifies() -> None:
    _, tim = issuer_and_tim()
    notary = arky.from_seed(bytes([11]) * 32)
    canonical = arky.canonicalize(arky.canonical_body(tim))
    witness = arky.sign_detached(canonical.encode("utf-8"), notary.seed, notary.did)
    cosigned = mutate(tim, "time", "witnesses", [witness])

    result = arky.verify_tim(cosigned)  # default (witness-aware) resolver
    assert result.witnesses_valid, result.errors
    assert result.valid


def test_witness_with_non_did_kid_falls_back_and_stays_rejected() -> None:
    _, tim = issuer_and_tim()
    attacker = arky.from_seed(bytes([9]) * 32)
    canonical = arky.canonicalize(arky.canonical_body(tim))
    # A non-did:key kid falls back to the TIM identity, but the witness was
    # signed by the attacker, so it must still fail.
    witness = arky.sign_detached(canonical.encode("utf-8"), attacker.seed, "test-key-2025-02")
    forged = mutate(tim, "time", "witnesses", [witness])
    assert not arky.verify_tim(forged).witnesses_valid


# --- malformed input / DoS ---


def test_malformed_input_is_handled_without_raising() -> None:
    _, tim = issuer_and_tim()
    cases = {
        "malformed base58 did:key": mutate(tim, "identity", "id", "did:key:z6Mk0OIl"),
        "truncated did:key": mutate(tim, "identity", "id", "did:key:z6Mk"),
        "wrong-length did:key": mutate(tim, "identity", "id", "did:key:z6MkAAAA"),
        "malformed witness JWS": mutate(tim, "time", "witnesses", ["!!!not.a.jws"]),
        "garbage signature": mutate(tim, "sig", "", "$$$garbage$$$"),
        "witness not a string": mutate(tim, "time", "witnesses", [arky.Number("1")]),
    }
    for name, forged in cases.items():
        assert not arky.verify_tim(forged, identity_resolver).valid, name

    broken = arky.parse(
        '{"time":{"ts":"x"},"identity":{"id":"did:web:x"},'
        '"measurement":null,"cid":"z","sig":"a..b"}'
    )
    assert not arky.verify_tim(broken, identity_resolver).valid


def test_non_list_witnesses_are_ignored_matching_the_other_stacks() -> None:
    """A ``time.witnesses`` that is not a list is skipped, not an error.

    Verified against the TypeScript, Rust and Go stacks, which all behave the
    same way: the witness loop only runs for an array, so a scalar value leaves
    ``witnesses_valid`` true and the TIM verifies on its issuer signature alone.

    This is pinned rather than "fixed" because changing it unilaterally would
    make this stack reject artifacts the other three accept. If the protocol
    ever decides a malformed ``witnesses`` must invalidate a TIM, that is a spec
    change and all four stacks move together.
    """
    _, tim = issuer_and_tim()
    forged = mutate(tim, "time", "witnesses", "nope")
    result = arky.verify_tim(forged, identity_resolver)
    assert result.valid
    assert result.witnesses_valid


def test_verify_non_finite_does_not_raise() -> None:
    """JCS forbids NaN; a hostile TIM carrying one must fail, not explode."""
    _, tim = issuer_and_tim()
    hostile = mutate(tim, "measurement", "value", arky.Number("NaN"))
    result = arky.verify_tim(hostile, identity_resolver)
    assert not result.valid
    assert "tim.non_finite" in result.errors


@pytest.mark.parametrize(
    "identity",
    [
        "did:key:z6Mk0OIl",
        "did:key:z",
        "did:key:z6Mk",
        "did:key:zNOPE",
        "did:key:",
        "",
        "not-a-did",
        "did:key:z6Mk\x00\x01",
        "did:key:z6Mk" + "1" * 1000,
    ],
)
def test_resolve_did_key_never_raises_on_hostile_input(identity: str) -> None:
    assert arky.resolve_did_key(identity) is None


@pytest.mark.parametrize("payload_len", [0, 1, 4, 31, 33, 64])
def test_did_key_with_non_32_byte_payload_does_not_resolve(payload_len: int) -> None:
    """The multicodec prefix alone is not enough: the key must be 32 bytes.

    Note what actually rejects these: base58btc output length is determined by
    input length, so a 0xed01-prefixed buffer renders as ``z6Mk...`` only when
    it is exactly 34 bytes. These are caught by the prefix check, and the
    explicit length check is defense in depth.
    """
    raw = b"\xed\x01" + bytes([0x41]) * payload_len
    assert arky.resolve_did_key("did:key:" + arky.to_multibase(raw)) is None


def test_did_key_with_wrong_multicodec_does_not_resolve() -> None:
    # 0xec 0x01 is X25519, not Ed25519 — refuse even at 32 bytes.
    raw = b"\xec\x01" + bytes([0x41]) * 32
    assert arky.resolve_did_key("did:key:" + arky.to_multibase(raw)) is None


def test_truncated_or_extended_did_key_does_not_resolve() -> None:
    real = arky.from_seed(bytes([7]) * 32).did
    assert arky.resolve_did_key(real) is not None
    for cut in (1, 2, 5, 10):
        truncated = real[:-cut]
        assert truncated.startswith("did:key:z6Mk")
        assert arky.resolve_did_key(truncated) is None
    assert arky.resolve_did_key(real + "111") is None


def test_only_34_byte_multicodec_encodes_to_z6mk() -> None:
    """Documents why the z6Mk prefix check implies the length check.

    If this ever stops holding, the explicit 34-byte guard in resolve_did_key
    becomes the only thing between a caller and a malformed key.
    """
    for payload_len in (29, 30, 31, 33, 34, 35, 64):
        for lead in range(256):
            raw = b"\xed\x01" + bytes([lead]) + bytes(payload_len - 1)
            assert not arky.to_multibase(raw).startswith("z6Mk"), payload_len
    assert arky.from_seed(bytes([7]) * 32).did.startswith("did:key:z6Mk")


@pytest.mark.parametrize("jws", ["", "...", "!!!", "a.b.c", "$$$garbage$$$", "e30"])
def test_decode_protected_header_does_not_crash_verification(jws: str) -> None:
    # Raising here is acceptable; what matters is that verification says False.
    with contextlib.suppress(Exception):
        arky.decode_protected_header(jws)
    assert not arky.verify_detached(jws, b"payload", bytes(32))


def test_verify_detached_rejects_malformed() -> None:
    kp = arky.from_seed(bytes([3]) * 32)
    payload = b"payload"
    valid = arky.sign_detached(payload, kp.seed)
    assert arky.verify_detached(valid, payload, kp.public_key)

    for bad in ["", "a.b", "a.b.c.d", "a..b", valid + "x", "..", "!!!"]:
        assert not arky.verify_detached(bad, payload, kp.public_key)

    # A non-empty payload segment violates the detached (b64:false) form.
    parts = valid.split(".")
    assert not arky.verify_detached(f"{parts[0]}.injected.{parts[2]}", payload, kp.public_key)

    other = arky.from_seed(bytes([4]) * 32)
    assert not arky.verify_detached(valid, payload, other.public_key)
    assert not arky.verify_detached(valid, payload, b"\x01\x02\x03")


# --- freshness ---


def test_freshness_only_enforced_with_reference_time() -> None:
    issuer = arky.from_seed(bytes([7]) * 32)
    body = base_body(issuer.did)
    body.set("exp", "2020-01-02T00:00:00Z")
    expired = arky.create_tim(body, issuer.seed)

    # No reference time: a pure cryptographic check, still valid.
    result = arky.verify_tim(expired, identity_resolver)
    assert result.valid and result.fresh

    result = arky.verify_tim_at(expired, identity_resolver, "2026-01-01T00:00:00Z")
    assert not result.valid
    assert not result.fresh
    assert "tim.expired" in result.errors


def test_unexpired_tim_passes_with_reference_time() -> None:
    issuer = arky.from_seed(bytes([7]) * 32)
    body = base_body(issuer.did)
    body.set("exp", "2099-01-01T00:00:00Z")
    future = arky.create_tim(body, issuer.seed)
    assert arky.verify_tim_at(future, identity_resolver, "2026-01-01T00:00:00Z").valid


def test_tim_without_exp_is_always_fresh() -> None:
    _, tim = issuer_and_tim()
    assert arky.verify_tim_at(tim, identity_resolver, "2099-01-01T00:00:00Z").fresh


# --- settler authorization safety ---


def pay(amount: object) -> arky.ExecStatus:
    kp = arky.from_seed(bytes([1]) * 32)
    return arky.execute(
        arky.ExecRequest(verb="arky:verb/pay@v1", rail="ach:us", args=obj(to="x", amount=amount)),
        seed=kp.seed,
        ts="2025-01-01T00:00:00Z",
        anchor_target="log:x",
    ).status


@pytest.mark.parametrize(
    ("label", "amount", "expected"),
    [
        ("negative", obj(value=arky.Number("-1000"), unit="USD"), arky.ExecStatus.FAILED),
        ("zero", obj(value=arky.Number("0"), unit="USD"), arky.ExecStatus.FAILED),
        ("missing unit", obj(value=arky.Number("100")), arky.ExecStatus.FAILED),
        ("empty unit", obj(value=arky.Number("100"), unit=""), arky.ExecStatus.FAILED),
        ("missing value", obj(unit="USD"), arky.ExecStatus.FAILED),
        ("non-object", "100", arky.ExecStatus.FAILED),
        ("valid", obj(value=arky.Number("100"), unit="USD"), arky.ExecStatus.SUCCESS),
    ],
)
def test_settler_rejects_invalid_amounts(
    label: str, amount: object, expected: arky.ExecStatus
) -> None:
    """An audit found every stack approving negative payments because they only
    checked that the argument key existed."""
    assert pay(amount) is expected, label


def test_settler_rejects_unknown_verb_and_rail() -> None:
    kp = arky.from_seed(bytes([1]) * 32)
    args = obj(action="stop")

    result = arky.execute(
        arky.ExecRequest(verb="arky:verb/evil@v1", args=args), seed=kp.seed, ts="t"
    )
    assert result.status is arky.ExecStatus.FAILED

    result = arky.execute(
        arky.ExecRequest(verb="arky:verb/control@v1", rail="unknown:rail", args=args),
        seed=kp.seed,
        ts="t",
    )
    assert result.status is arky.ExecStatus.FAILED


def test_idempotent_replay_returns_identical_receipt() -> None:
    kp = arky.from_seed(bytes([9]) * 32)
    request = arky.ExecRequest(
        verb="arky:verb/pay@v1",
        rail="ach:us",
        args=obj(to="acct:x", amount=obj(value=arky.Number("100"), unit="USD")),
        idempotency_key="idem-fixed-key",
    )
    store: dict[str, object] = {}
    first = arky.execute(request, kp.seed, "k", "2025-01-01T00:00:00Z", "log:x", store)
    second = arky.execute(request, kp.seed, "k", "2025-01-01T00:00:00Z", "log:x", store)
    assert first.status is arky.ExecStatus.SUCCESS
    assert arky.get_str(first.receipt, "cid") == arky.get_str(second.receipt, "cid")


# --- kernel authorization safety ---


def commitment_fixture() -> object:
    return arky.parse(
        """{
        "scope":"s","actor":"a",
        "intent":{"do":"arky:verb/pay@v1"},
        "measure":[{"name":"temp","assert":"temp > 20"}],
        "consequence":[{"if":"PASS","then":[
            {"name":"arky:verb/pay@v1","args":{"to":"x","amount":{"value":1,"unit":"USD"}}}]}]
        }"""
    )


def test_kernel_does_not_approve_on_missing_evidence() -> None:
    decision = arky.evaluate_kernel(commitment_fixture(), [], "2025-10-15T12:00:00Z")
    assert decision.status is arky.DecisionStatus.INDETERMINATE
    assert decision.authorized == []


def test_kernel_rejects_unregistered_verb() -> None:
    commitment = arky.parse(
        """{
        "scope":"s","actor":"a",
        "intent":{"do":"arky:verb/pay@v1"},
        "measure":[{"name":"temp","assert":"temp > 20"}],
        "consequence":[{"if":"PASS","then":[{"name":"arky:verb/evil@v1","args":{}}]}]
        }"""
    )
    decision = arky.evaluate_kernel(commitment, [], "2025-10-15T12:00:00Z")
    assert decision.status is arky.DecisionStatus.REJECTED
    assert "kernel.unknown_verb" in decision.errors


def test_kernel_rejects_malformed_commitment() -> None:
    decision = arky.evaluate_kernel(arky.parse('{"scope":"s"}'), [], "2025-10-15T12:00:00Z")
    assert decision.status is arky.DecisionStatus.REJECTED
