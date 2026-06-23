//! Detached-payload JWS (compact) with Ed25519/EdDSA, per ARKY-TIM-v1 §6 and
//! RFC 7797 (b64:false). Compact form `<protected>..<signature>`; payload is the
//! JCS canonical bytes supplied separately.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde_json::json;

/// RFC 7797 signing input: ASCII(BASE64URL(protected)) || '.' || payload.
fn signing_input(protected_b64: &str, payload: &[u8]) -> Vec<u8> {
    let mut v = Vec::with_capacity(protected_b64.len() + 1 + payload.len());
    v.extend_from_slice(protected_b64.as_bytes());
    v.push(b'.');
    v.extend_from_slice(payload);
    v
}

/// Sign canonical `payload` bytes; returns compact `<protected>..<signature>`.
pub fn sign_detached(payload: &[u8], signing_key: &SigningKey, kid: Option<&str>) -> String {
    let header = match kid {
        Some(k) => json!({"alg":"EdDSA","typ":"JWS","kid":k,"b64":false,"crit":["b64"]}),
        None => json!({"alg":"EdDSA","typ":"JWS","b64":false,"crit":["b64"]}),
    };
    let protected_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&header).unwrap());
    let sig: Signature = signing_key.sign(&signing_input(&protected_b64, payload));
    format!(
        "{}..{}",
        protected_b64,
        URL_SAFE_NO_PAD.encode(sig.to_bytes())
    )
}

/// Decode the protected header of a compact JWS to a serde_json Value.
pub fn decode_protected_header(jws: &str) -> Result<serde_json::Value, String> {
    let part = jws.split('.').next().ok_or("empty jws")?;
    let bytes = URL_SAFE_NO_PAD.decode(part).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

/// Verify a detached compact JWS over `payload` against an Ed25519 public key.
/// Returns true iff the signature is valid, the payload segment is empty, and
/// the header is well-formed (alg EdDSA, b64:false, crit includes b64).
pub fn verify_detached(jws: &str, payload: &[u8], public_key: &VerifyingKey) -> bool {
    let parts: Vec<&str> = jws.split('.').collect();
    if parts.len() != 3 || !parts[1].is_empty() {
        return false;
    }
    let (protected_b64, sig_b64) = (parts[0], parts[2]);

    let header: serde_json::Value = match decode_protected_header(jws) {
        Ok(h) => h,
        Err(_) => return false,
    };
    if header.get("alg").and_then(|v| v.as_str()) != Some("EdDSA")
        || header.get("b64").and_then(|v| v.as_bool()) != Some(false)
        || !header
            .get("crit")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().any(|x| x.as_str() == Some("b64")))
            .unwrap_or(false)
    {
        return false;
    }

    let sig_bytes = match URL_SAFE_NO_PAD.decode(sig_b64) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let sig = match Signature::from_slice(&sig_bytes) {
        Ok(s) => s,
        Err(_) => return false,
    };
    public_key
        .verify(&signing_input(protected_b64, payload), &sig)
        .is_ok()
}

/// Parse a 32-byte Ed25519 public key into a VerifyingKey.
pub fn verifying_key_from_bytes(bytes: &[u8]) -> Result<VerifyingKey, String> {
    let arr: [u8; 32] = bytes.try_into().map_err(|_| "key must be 32 bytes")?;
    VerifyingKey::from_bytes(&arr).map_err(|e| e.to_string())
}
