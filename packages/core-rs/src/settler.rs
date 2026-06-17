//! Settler execution per ARKY-SETTLERS-v1 §4 (pre-checks) and §5 (Execution
//! Receipt). Validate an execution request (verb registered, args valid per the
//! verb schema, rail supported), then produce a signed XR. Deterministic
//! idempotency (§6.1) dedupes duplicate requests. Mirrors @arky/core settler.ts.

use crate::canonicalize::canonicalize;
use crate::cid::{cid_from_canonical, multihash_mb};
use crate::jws::sign_detached;
use crate::kernel::REGISTERED_VERBS;
use ed25519_dalek::SigningKey;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

/// Required argument fields per core verb (schemas/verbs/*.json).
pub fn verb_required_args(verb: &str) -> &'static [&'static str] {
    match verb {
        "arky:verb/pay@v1" => &["to", "amount"],
        "arky:verb/refund@v1" => &["payment_ref"],
        "arky:verb/slash@v1" => &["subject", "amount"],
        "arky:verb/revoke@v1" => &["subject"],
        "arky:verb/upgrade@v1" => &["target", "version"],
        "arky:verb/signal@v1" => &["channel"],
        "arky:verb/control@v1" => &["action"],
        _ => &[],
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecStatus {
    Success,
    Failed,
}

impl ExecStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            ExecStatus::Success => "SUCCESS",
            ExecStatus::Failed => "FAILED",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ExecuteResult {
    pub status: ExecStatus,
    pub errors: Vec<String>,
    pub missing_fields: Vec<String>,
    /// The signed XR (only on success).
    pub receipt: Option<Value>,
}

/// A rail is unsupported if its scheme is explicitly `unknown:`; absent is ok.
fn rail_supported(rail: Option<&str>) -> bool {
    match rail {
        None => true,
        Some(r) => !r.starts_with("unknown:"),
    }
}

/// multibase(multihash(sha2-256, JCS(args))).
pub fn args_hash(args: &Value) -> String {
    multihash_mb(canonicalize(args).as_bytes())
}

/// Derive an idempotency key per §6.1 when the client omits one.
pub fn derive_idempotency_key(commitment_cid: &str, verb: &str, rail: Option<&str>, args: &Value, verb_index: u64) -> String {
    let components = json!({
        "args_hash": args_hash(args),
        "commitment_cid": commitment_cid,
        "rail": rail.unwrap_or(""),
        "verb": verb,
        "verb_index": verb_index,
    });
    multihash_mb(canonicalize(&components).as_bytes())
}

/// In-memory idempotency store: key -> XR.
pub type IdempotencyStore = BTreeMap<String, Value>;

/// Inputs to an execution.
pub struct ExecRequest<'a> {
    pub verb: &'a str,
    pub rail: Option<&'a str>,
    pub args: Value,
    pub commitment_cid: Option<&'a str>,
    pub request_id: Option<&'a str>,
    pub idempotency_key: Option<&'a str>,
}

/// Validate and "execute" a request (no real rail — signed XR with a mock
/// locator + anchor). Pre-check order per §4.2: verb -> args -> rail.
pub fn execute(
    req: &ExecRequest,
    signing_key: &SigningKey,
    kid: Option<&str>,
    ts: &str,
    anchor_target: &str,
    store: Option<&mut IdempotencyStore>,
) -> ExecuteResult {
    // 1. Verb registered.
    if !REGISTERED_VERBS.contains(&req.verb) {
        return ExecuteResult { status: ExecStatus::Failed, errors: vec!["settler.unknown_verb".into()], missing_fields: vec![], receipt: None };
    }
    // 2. Required args present.
    let missing: Vec<String> = verb_required_args(req.verb)
        .iter()
        .filter(|k| req.args.get(**k).is_none())
        .map(|k| k.to_string())
        .collect();
    if !missing.is_empty() {
        return ExecuteResult { status: ExecStatus::Failed, errors: vec!["settler.invalid_args".into()], missing_fields: missing, receipt: None };
    }
    // 3. Rail supported.
    if !rail_supported(req.rail) {
        return ExecuteResult { status: ExecStatus::Failed, errors: vec!["settler.unsupported_rail".into()], missing_fields: vec![], receipt: None };
    }

    let commitment_cid = req.commitment_cid.unwrap_or("");
    let idem_key = req
        .idempotency_key
        .map(String::from)
        .unwrap_or_else(|| derive_idempotency_key(commitment_cid, req.verb, req.rail, &req.args, 0));

    // Idempotency: return cached XR.
    if let Some(s) = store.as_ref() {
        if let Some(cached) = s.get(&idem_key) {
            return ExecuteResult { status: ExecStatus::Success, errors: vec![], missing_fields: vec![], receipt: Some(cached.clone()) };
        }
    }

    let mut body = Map::new();
    body.insert("request_id".into(), json!(req.request_id.map(String::from).unwrap_or_else(|| format!("exec-{}", &idem_key[..12.min(idem_key.len())]))));
    body.insert("commitment_cid".into(), json!(commitment_cid));
    body.insert("verb".into(), json!(req.verb));
    body.insert("rail".into(), json!(req.rail.unwrap_or("")));
    body.insert("args_hash".into(), json!(args_hash(&req.args)));
    body.insert("idempotency_key".into(), json!(idem_key));
    body.insert("status".into(), json!("success"));
    body.insert("locator".into(), json!(format!("MOCK-{}", &idem_key[1..18.min(idem_key.len())])));
    body.insert(
        "anchors".into(),
        json!([{ "target": anchor_target, "locator": format!("batch-{}", &idem_key[1..10.min(idem_key.len())]), "status": "pending" }]),
    );
    body.insert("ts".into(), json!(ts));

    let body_val = Value::Object(body);
    let canonical = canonicalize(&body_val);
    let cid = cid_from_canonical(&canonical);
    let sig = sign_detached(canonical.as_bytes(), signing_key, kid);

    let mut xr = body_val.as_object().unwrap().clone();
    xr.insert("cid".into(), json!(cid));
    xr.insert("sig".into(), json!(sig));
    let receipt = Value::Object(xr);

    if let Some(s) = store {
        s.insert(idem_key, receipt.clone());
    }
    ExecuteResult { status: ExecStatus::Success, errors: vec![], missing_fields: vec![], receipt: Some(receipt) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idempotency_key_deterministic() {
        let args = json!({"to": "acct:x", "amount": {"value": 1, "unit": "USD"}});
        let k1 = derive_idempotency_key("zC", "arky:verb/pay@v1", Some("ach:us"), &args, 0);
        let k2 = derive_idempotency_key("zC", "arky:verb/pay@v1", Some("ach:us"), &args, 0);
        assert_eq!(k1, k2);
        assert!(k1.starts_with('z'));
        assert!(args_hash(&args).starts_with('z'));
    }
}
