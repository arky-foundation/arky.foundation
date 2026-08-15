//! Adversarial / security regression tests for the Rust stack.
//!
//! The mirror of `@arky/core`'s `test/security.test.ts`: each case is an attack
//! that MUST be rejected (verification fails) or handled (no panic) — never
//! forged, never fatal. Both reference stacks are cross-checked byte-for-byte on
//! the happy path, so their *failure* behaviour has to be pinned too: a hole that
//! exists in only one stack is exactly the kind of divergence the second
//! implementation is meant to surface.

use arky_core::jws::decode_protected_header;
use arky_core::kernel::evaluate_kernel;
use arky_core::keys::from_seed;
use arky_core::settler::{ExecRequest, ExecStatus, execute};
use arky_core::tim::{canonical_body, create_tim, resolve_did_key, verify_tim, verify_tim_at};
use arky_core::{canonicalize, sign_detached, to_multibase};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde_json::{Value, json};

/// Default-equivalent resolver: the TIM's did:key identity, witness kid ignored.
fn identity_resolver(tim: &Value, _kid: Option<&str>) -> Option<Vec<u8>> {
    let id = tim.get("identity")?.get("id")?.as_str()?;
    resolve_did_key(id)
}

/// Witness-aware resolver: prefer a did:key `kid` on the witness header, else the
/// TIM identity. Mirrors `@arky/core`'s default `resolveDidKey`.
fn witness_aware_resolver(tim: &Value, kid: Option<&str>) -> Option<Vec<u8>> {
    if let Some(k) = kid
        && let Some(key) = resolve_did_key(k)
    {
        return Some(key);
    }
    identity_resolver(tim, None)
}

fn base_body(did: &str) -> Value {
    json!({
        "time": { "ts": "2025-10-15T12:00:00Z" },
        "identity": { "id": did },
        "measurement": {
            "name": "temp", "value": 22.5, "unit": "degC",
            "method": { "type": "sensor", "source": "s" }
        },
    })
}

fn issuer_and_tim() -> (arky_core::KeyPair, Value) {
    let issuer = from_seed([7u8; 32]);
    let tim = create_tim(base_body(&issuer.did), &issuer.signing_key, None);
    (issuer, tim)
}

// ---------------------------------------------------------------- forgery ---

#[test]
fn mutated_value_with_original_cid_and_sig_is_rejected() {
    let (_issuer, tim) = issuer_and_tim();
    let mut t = tim.clone();
    t["measurement"]["value"] = json!(999);
    assert!(!verify_tim(&t, &identity_resolver).valid);
}

#[test]
fn mutated_value_with_recomputed_cid_and_stale_sig_is_rejected() {
    let (_issuer, tim) = issuer_and_tim();
    let mut t = tim.clone();
    t["measurement"]["value"] = json!(999);
    // Recompute the cid so it matches the tampered body, but keep the old sig.
    let canonical = canonicalize(&canonical_body(&t));
    t["cid"] = json!(arky_core::cid_from_canonical(&canonical));
    let r = verify_tim(&t, &identity_resolver);
    assert!(r.cid_valid, "cid was recomputed, so it should match");
    assert!(!r.signature_valid, "the stale signature must not verify");
    assert!(!r.valid);
}

#[test]
fn attacker_signs_with_own_key_but_claims_victim_did() {
    let issuer = from_seed([7u8; 32]);
    let attacker = from_seed([9u8; 32]);
    // identity.id is the victim's DID; the signature is the attacker's.
    let forged = create_tim(base_body(&issuer.did), &attacker.signing_key, None);
    let r = verify_tim(&forged, &identity_resolver);
    assert!(!r.valid, "did:key resolves to the issuer, not the attacker");
    assert!(!r.signature_valid);
}

#[test]
fn swapping_identity_to_attacker_while_keeping_victim_signature_is_rejected() {
    let (_issuer, tim) = issuer_and_tim();
    let attacker = from_seed([9u8; 32]);
    let mut t = tim.clone();
    t["identity"]["id"] = json!(attacker.did);
    assert!(!verify_tim(&t, &identity_resolver).valid);
}

#[test]
fn alg_none_downgrade_is_rejected() {
    let (_issuer, tim) = issuer_and_tim();
    let hdr = json!({ "alg": "none", "b64": false, "crit": ["b64"] });
    let h = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&hdr).unwrap());
    let sigpart = tim["sig"].as_str().unwrap().split('.').nth(2).unwrap();
    let mut t = tim.clone();
    t["sig"] = json!(format!("{h}..{sigpart}"));
    assert!(!verify_tim(&t, &identity_resolver).valid);
}

#[test]
fn empty_signature_is_rejected() {
    let (_issuer, tim) = issuer_and_tim();
    let h0 = tim["sig"].as_str().unwrap().split('.').next().unwrap();
    let mut t = tim.clone();
    t["sig"] = json!(format!("{h0}.."));
    assert!(!verify_tim(&t, &identity_resolver).valid);
}

#[test]
fn forged_witness_is_rejected() {
    let (_issuer, tim) = issuer_and_tim();
    let attacker = from_seed([9u8; 32]);
    let canon = canonicalize(&canonical_body(&tim));
    let wsig = sign_detached(canon.as_bytes(), &attacker.signing_key, None);
    let mut t = tim.clone();
    t["time"]["witnesses"] = json!([wsig]);
    let r = verify_tim(&t, &identity_resolver);
    assert!(!r.witnesses_valid);
    assert!(!r.valid);
}

// -------------------------------------------------- witness-aware resolver ---

#[test]
fn witness_cosigned_by_a_second_did_key_notary_verifies() {
    let (_issuer, tim) = issuer_and_tim();
    let notary = from_seed([11u8; 32]);
    let canon = canonicalize(&canonical_body(&tim));
    let wsig = sign_detached(canon.as_bytes(), &notary.signing_key, Some(&notary.did));
    let mut t = tim.clone();
    t["time"]["witnesses"] = json!([wsig]);
    let r = verify_tim(&t, &witness_aware_resolver);
    assert!(
        r.witnesses_valid,
        "notary kid should resolve: {:?}",
        r.errors
    );
    assert!(r.valid);
}

#[test]
fn witness_with_non_did_kid_falls_back_to_identity_and_stays_rejected() {
    let (_issuer, tim) = issuer_and_tim();
    let attacker = from_seed([9u8; 32]);
    let canon = canonicalize(&canonical_body(&tim));
    // kid is not a did:key -> falls back to the TIM identity, but the witness was
    // signed by the attacker, so it must still fail.
    let wsig = sign_detached(
        canon.as_bytes(),
        &attacker.signing_key,
        Some("test-key-2025-02"),
    );
    let mut t = tim.clone();
    t["time"]["witnesses"] = json!([wsig]);
    assert!(!verify_tim(&t, &witness_aware_resolver).witnesses_valid);
}

// ------------------------------------------------------- malformed / DoS ---

#[test]
fn malformed_input_is_handled_without_panicking() {
    let (_issuer, tim) = issuer_and_tim();

    let mut bad: Vec<(&str, Value)> = Vec::new();

    let mut t = tim.clone();
    t["identity"]["id"] = json!("did:key:z6Mk0OIl");
    bad.push(("malformed base58 did:key", t));

    let mut t = tim.clone();
    t["identity"]["id"] = json!("did:key:z6Mk");
    bad.push(("truncated did:key", t));

    let mut t = tim.clone();
    t["identity"]["id"] = json!("did:key:z6MkAAAA");
    bad.push(("wrong-length did:key", t));

    let mut t = tim.clone();
    t["time"]["witnesses"] = json!(["!!!not.a.jws"]);
    bad.push(("malformed witness JWS", t));

    let mut t = tim.clone();
    t["sig"] = json!("$$$garbage$$$");
    bad.push(("garbage signature", t));

    bad.push((
        "null measurement",
        json!({
            "time": { "ts": "x" }, "identity": { "id": "did:web:x" },
            "measurement": null, "cid": "z", "sig": "a..b"
        }),
    ));

    for (name, t) in bad {
        let r = verify_tim(&t, &identity_resolver);
        assert!(!r.valid, "{name} must not verify");
    }
}

#[test]
fn resolve_did_key_never_panics_on_hostile_input() {
    for id in [
        "did:key:z6Mk0OIl",
        "did:key:z",
        "did:key:z6Mk",
        "did:key:zNOPE",
        "did:key:",
        "",
        "not-a-did",
        "did:key:z6Mk\u{0}\u{1}",
    ] {
        assert!(resolve_did_key(id).is_none(), "{id} must not resolve");
    }
}

/// A did:key carrying the right multicodec prefix but a payload that is not 32
/// bytes must NOT resolve. `@arky/core` enforces a 34-byte decoded length; this
/// pins the Rust side to the same contract so the two stacks agree on exactly
/// which identities are resolvable.
#[test]
fn did_key_with_non_32_byte_payload_does_not_resolve() {
    for n in [0usize, 1, 4, 31, 33, 64] {
        let mut raw = vec![0xedu8, 0x01];
        raw.extend(std::iter::repeat_n(0x41u8, n));
        let id = format!("did:key:{}", to_multibase(&raw));
        assert!(
            resolve_did_key(&id).is_none(),
            "{n}-byte payload must not resolve as an Ed25519 key"
        );
    }
}

#[test]
fn did_key_with_wrong_multicodec_does_not_resolve() {
    // 0xec 0x01 is X25519, not Ed25519 — must be refused even at 32 bytes.
    let mut raw = vec![0xecu8, 0x01];
    raw.extend(std::iter::repeat_n(0x41u8, 32));
    let id = format!("did:key:{}", to_multibase(&raw));
    assert!(resolve_did_key(&id).is_none());
}

#[test]
fn decode_protected_header_does_not_panic_on_garbage() {
    for j in ["", "...", "!!!", "a.b.c", "$$$garbage$$$"] {
        let _ = decode_protected_header(j);
    }
}

// ------------------------------------------------------------- freshness ---

#[test]
fn expired_tim_is_rejected_only_when_a_reference_time_is_given() {
    let issuer = from_seed([7u8; 32]);
    let mut body = base_body(&issuer.did);
    body["exp"] = json!("2020-01-02T00:00:00Z");
    let expired = create_tim(body, &issuer.signing_key, None);

    // No reference time: pure cryptographic check, still valid.
    let r = verify_tim(&expired, &identity_resolver);
    assert!(r.valid);
    assert!(r.fresh);

    // With a reference time after exp: expired.
    let r = verify_tim_at(&expired, &identity_resolver, Some("2026-01-01T00:00:00Z"));
    assert!(!r.valid);
    assert!(!r.fresh);
    assert!(r.errors.iter().any(|e| e == "tim.expired"));
}

#[test]
fn tim_without_exp_is_always_fresh() {
    let (_issuer, tim) = issuer_and_tim();
    let r = verify_tim_at(&tim, &identity_resolver, Some("2099-01-01T00:00:00Z"));
    assert!(r.fresh);
}

// --------------------------------------------- settler authorization safety ---

fn pay(amount: Value) -> ExecStatus {
    let key = from_seed([1u8; 32]);
    let req = ExecRequest {
        verb: "arky:verb/pay@v1",
        rail: Some("ach:us"),
        args: json!({ "to": "x", "amount": amount }),
        commitment_cid: None,
        request_id: None,
        idempotency_key: None,
    };
    execute(
        &req,
        &key.signing_key,
        None,
        "2025-01-01T00:00:00Z",
        "mock",
        None,
    )
    .status
}

#[test]
fn settler_rejects_invalid_amounts() {
    assert_eq!(
        pay(json!({ "value": -1000, "unit": "USD" })),
        ExecStatus::Failed,
        "negative amount"
    );
    assert_eq!(
        pay(json!({ "value": 0, "unit": "USD" })),
        ExecStatus::Failed,
        "zero amount"
    );
    assert_eq!(
        pay(json!({ "value": 100 })),
        ExecStatus::Failed,
        "amount missing unit"
    );
    assert_eq!(pay(json!("100")), ExecStatus::Failed, "non-object amount");
    assert_eq!(
        pay(json!({ "value": 100, "unit": "USD" })),
        ExecStatus::Success,
        "a valid amount must still succeed"
    );
}

// ------------------------------------------------ kernel authorization safety ---

fn commitment() -> Value {
    json!({
        "scope": "s", "actor": "a",
        "intent": { "do": "arky:verb/pay@v1" },
        "measure": [{ "name": "temp", "assert": "temp > 20" }],
        "consequence": [{
            "if": "PASS",
            "then": [{ "name": "arky:verb/pay@v1",
                       "args": { "to": "x", "amount": { "value": 1, "unit": "USD" } } }]
        }]
    })
}

#[test]
fn kernel_does_not_approve_on_missing_evidence() {
    let d = evaluate_kernel(&commitment(), &[], "2025-10-15T12:00:00Z");
    assert_eq!(
        d.status.as_str(),
        "INDETERMINATE",
        "no evidence must never approve"
    );
}

#[test]
fn kernel_rejects_an_unregistered_verb() {
    let mut c = commitment();
    c["consequence"] = json!([{ "if": "PASS",
        "then": [{ "name": "arky:verb/evil@v1", "args": {} }] }]);
    let d = evaluate_kernel(&c, &[], "2025-10-15T12:00:00Z");
    assert_eq!(d.status.as_str(), "REJECTED");
    assert!(d.errors.iter().any(|e| e == "kernel.unknown_verb"));
}
