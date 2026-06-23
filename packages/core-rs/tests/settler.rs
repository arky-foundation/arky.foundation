//! Settler conformance: arky-core (Rust) execute() against the S1 vectors.
//! Second-language check of pre-checks (verb/args/rail), XR production, and
//! idempotency.

use arky_core::cid::cid_from_canonical;
use arky_core::settler::{ExecRequest, IdempotencyStore, execute};
use arky_core::{canonicalize, verify_detached, verifying_key_from_bytes};
use ed25519_dalek::SigningKey;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf()
}
fn read(rel: &str) -> Value {
    serde_json::from_str(&fs::read_to_string(repo().join(rel)).unwrap()).unwrap()
}
fn list(dir: &str) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = fs::read_dir(repo().join(dir))
        .unwrap()
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|x| x == "json").unwrap_or(false))
        .collect();
    v.sort();
    v
}

// Deterministic test settler key (NOT a fixture key).
fn key() -> SigningKey {
    SigningKey::from_bytes(&[9u8; 32])
}

#[test]
fn settler_s1_vectors() {
    let signing = key();
    let pubkey = signing.verifying_key();
    let mut store = IdempotencyStore::new();

    for path in list("vectors/settlers") {
        let v: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        let id = v["id"].as_str().unwrap();
        let inp = &v["inputs"];
        // Only S1 vectors here (skip s2/s3 algorithmic ones handled elsewhere).
        if v["level"].as_str() != Some("S1") {
            continue;
        }

        // s1-005 reuses s1-001's key; pre-seed so this is order-independent.
        if id == "s1-005" {
            let first = read("vectors/settlers/s1-001.json");
            let fi = &first["inputs"];
            let req = ExecRequest {
                verb: fi["verb"].as_str().unwrap(),
                rail: fi["rail"].as_str(),
                args: fi["params"].clone(),
                commitment_cid: None,
                request_id: None,
                idempotency_key: fi["idempotency_key"].as_str(),
            };
            execute(
                &req,
                &signing,
                None,
                "2025-10-15T12:00:01Z",
                "log:arky:transparency@v1",
                Some(&mut store),
            );
        }

        let req = ExecRequest {
            verb: inp["verb"].as_str().unwrap_or(""),
            rail: inp["rail"].as_str(),
            args: inp["params"].clone(),
            commitment_cid: None,
            request_id: None,
            idempotency_key: inp["idempotency_key"].as_str(),
        };
        let ts = v["context"]["time"]
            .as_str()
            .unwrap_or("2025-10-15T12:00:01Z");
        let res = execute(
            &req,
            &signing,
            Some("test-settler"),
            ts,
            "log:arky:transparency@v1",
            Some(&mut store),
        );

        let exp = &v["expect"];
        if let Some(status) = exp["status"].as_str() {
            assert_eq!(res.status.as_str(), status, "{} status", id);
        }
        if let Some(errs) = exp["errors"].as_array() {
            for e in errs {
                if let Some(es) = e.as_str() {
                    assert!(
                        res.errors.iter().any(|x| x == es),
                        "{} expected error {}",
                        id,
                        es
                    );
                }
            }
        }
        if let Some(mf) = exp["missing_fields"].as_array() {
            let want: Vec<&str> = mf.iter().filter_map(|x| x.as_str()).collect();
            assert_eq!(res.missing_fields, want, "{} missing_fields", id);
        }
        if let Some(xr_exp) = exp.get("execution_receipt") {
            let xr = res
                .receipt
                .as_ref()
                .unwrap_or_else(|| panic!("{} no receipt", id));
            if let Some(verb) = xr_exp["verb"].as_str() {
                assert_eq!(xr["verb"].as_str().unwrap(), verb, "{} xr verb", id);
            }
            if xr_exp["has_anchor"].as_bool() == Some(true) {
                assert!(
                    xr["anchors"]
                        .as_array()
                        .map(|a| !a.is_empty())
                        .unwrap_or(false),
                    "{} has_anchor",
                    id
                );
            }
            // The XR is a real signed, content-addressed artifact.
            let mut body = xr.as_object().unwrap().clone();
            body.remove("cid");
            body.remove("sig");
            let canon = canonicalize(&Value::Object(body));
            assert_eq!(
                cid_from_canonical(&canon),
                xr["cid"].as_str().unwrap(),
                "{} xr cid",
                id
            );
            let vk = verifying_key_from_bytes(&pubkey.to_bytes()).unwrap();
            assert!(
                verify_detached(xr["sig"].as_str().unwrap(), canon.as_bytes(), &vk),
                "{} xr sig",
                id
            );
        }
    }
}
