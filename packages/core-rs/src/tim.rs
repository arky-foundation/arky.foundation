//! TIM verify, per ARKY-TIM-v1. Canonical body = TIM minus `cid`, `sig`, and
//! `time.witnesses`; issuer `sig` and each witness are detached Ed25519 JWS over
//! those bytes. Public key resolved from a did:key identity (§6.1).

use crate::canonicalize::canonicalize;
use crate::cid::{cid_from_canonical, from_multibase};
use crate::jws::{decode_protected_header, sign_detached, verify_detached, verifying_key_from_bytes};
use ed25519_dalek::SigningKey;
use serde_json::{Map, Value};

/// Result of verifying a TIM.
#[derive(Debug, Clone)]
pub struct VerifyResult {
    pub valid: bool,
    pub schema_valid: bool,
    pub cid_valid: bool,
    pub signature_valid: bool,
    pub witnesses_valid: bool,
    pub errors: Vec<String>,
    pub missing_fields: Vec<String>,
}

const REQUIRED_PATHS: &[&[&str]] = &[
    &["time", "ts"],
    &["identity", "id"],
    &["measurement", "name"],
    &["measurement", "value"],
    &["measurement", "method"],
    &["cid"],
    &["sig"],
];

fn get_path<'a>(v: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut cur = v;
    for k in path {
        cur = cur.get(*k)?;
    }
    Some(cur)
}

/// The canonical body: clone, then remove cid, sig, and time.witnesses (drop an
/// emptied `time`).
pub fn canonical_body(tim: &Value) -> Value {
    let mut obj: Map<String, Value> = tim.as_object().cloned().unwrap_or_default();
    obj.remove("cid");
    obj.remove("sig");
    if let Some(Value::Object(time)) = obj.get_mut("time") {
        time.remove("witnesses");
        if time.is_empty() {
            obj.remove("time");
        }
    }
    Value::Object(obj)
}

/// Build a signed TIM from a body (any JSON object containing time/identity/
/// measurement and optional prev/nonce/exp) and an Ed25519 signing key. Computes
/// the canonical body, cid, and detached `sig`, returning the full TIM.
pub fn create_tim(body: Value, signing_key: &SigningKey, kid: Option<&str>) -> Value {
    let mut obj = body.as_object().cloned().unwrap_or_default();
    obj.remove("cid");
    obj.remove("sig");
    let base = Value::Object(obj);
    let canonical = canonicalize(&base);
    let cid = cid_from_canonical(&canonical);
    let sig = sign_detached(canonical.as_bytes(), signing_key, kid);
    let mut out = base.as_object().unwrap().clone();
    out.insert("cid".into(), Value::String(cid));
    out.insert("sig".into(), Value::String(sig));
    Value::Object(out)
}

/// Extract an Ed25519 public key from a did:key:z6Mk… identity (multicodec
/// 0xed 0x01 || 32-byte key).
pub fn resolve_did_key(id: &str) -> Option<Vec<u8>> {
    let rest = id.strip_prefix("did:key:z")?;
    let decoded = from_multibase(&format!("z{rest}")).ok()?;
    if decoded.len() < 2 || decoded[0] != 0xed || decoded[1] != 0x01 {
        return None;
    }
    Some(decoded[2..].to_vec())
}

/// Resolve a public key for a witness JWS by its `kid` against a small known-key
/// map, falling back to the TIM's did:key identity.
type KeyResolver<'a> = dyn Fn(&Value, Option<&str>) -> Option<Vec<u8>> + 'a;

/// Verify a TIM. `resolve` maps (tim, optional witness-kid) -> 32-byte pubkey.
pub fn verify_tim(tim: &Value, resolve: &KeyResolver) -> VerifyResult {
    let mut errors = Vec::new();
    let missing: Vec<String> = REQUIRED_PATHS
        .iter()
        .filter(|p| get_path(tim, p).is_none())
        .map(|p| p.join("."))
        .collect();
    if !missing.is_empty() {
        errors.push("tim.missing_required".to_string());
        return VerifyResult {
            valid: false,
            schema_valid: false,
            cid_valid: false,
            signature_valid: false,
            witnesses_valid: false,
            errors,
            missing_fields: missing,
        };
    }

    let canonical = canonicalize(&canonical_body(tim));
    let payload = canonical.as_bytes();

    let stored_cid = tim.get("cid").and_then(|v| v.as_str()).unwrap_or("");
    let cid_valid = cid_from_canonical(&canonical) == stored_cid;
    if !cid_valid {
        errors.push("tim.cid_mismatch".to_string());
    }

    let sig = tim.get("sig").and_then(|v| v.as_str()).unwrap_or("");
    let mut signature_valid = false;
    match resolve(tim, None) {
        Some(kb) => match verifying_key_from_bytes(&kb) {
            Ok(vk) => {
                signature_valid = verify_detached(sig, payload, &vk);
                if !signature_valid {
                    errors.push("tim.invalid_signature".to_string());
                }
            }
            Err(_) => errors.push("tim.key_unresolved".to_string()),
        },
        None => errors.push("tim.key_unresolved".to_string()),
    }

    // Witnesses (optional): each a detached JWS over the SAME canonical bytes.
    let mut witnesses_valid = true;
    if let Some(ws) = get_path(tim, &["time", "witnesses"]).and_then(|v| v.as_array()) {
        for (i, w) in ws.iter().enumerate() {
            let ws_str = w.as_str().unwrap_or("");
            let kid = decode_protected_header(ws_str)
                .ok()
                .and_then(|h| h.get("kid").and_then(|v| v.as_str()).map(String::from));
            let ok = resolve(tim, kid.as_deref())
                .and_then(|kb| verifying_key_from_bytes(&kb).ok())
                .map(|vk| verify_detached(ws_str, payload, &vk))
                .unwrap_or(false);
            if !ok {
                witnesses_valid = false;
                errors.push(format!("tim.invalid_witness[{i}]"));
            }
        }
    }

    let valid = cid_valid && signature_valid && witnesses_valid;
    VerifyResult {
        valid,
        schema_valid: true,
        cid_valid,
        signature_valid,
        witnesses_valid,
        errors,
        missing_fields: vec![],
    }
}
