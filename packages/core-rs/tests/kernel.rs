//! Kernel conformance: arky-core (Rust) evaluate_kernel against the K1/K2 vectors.
//! A second-language check of the spec's tri-valued assertion + decision logic.

use arky_core::kernel::{DecisionStatus, evaluate_kernel};
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

#[test]
fn kernel_k1_k2_vectors() {
    for path in list("vectors/kernel") {
        let v: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        let id = v["id"].as_str().unwrap();
        let commitment = &v["inputs"]["commitment"];
        if commitment.is_null() {
            continue;
        }

        // Resolve TIM evidence from either shared fixtures or inline vector cases.
        let mut tims: Vec<Value> = Vec::new();
        if let Some(tp) = v["context"]["fixtures"]["tim"].as_str() {
            tims.push(read(&format!("vectors/{}", tp))["tim"].clone());
        }
        if let Some(ev) = v["context"]["evidence"].as_array() {
            tims.extend(ev.iter().cloned());
        }
        let eval_time = v["context"]["time"]
            .as_str()
            .unwrap_or("2025-10-15T12:00:00Z");

        let decision = evaluate_kernel(commitment, &tims, eval_time);
        let exp = &v["expect"];

        if let Some(status) = exp["decision"]["status"].as_str() {
            assert_eq!(decision.status.as_str(), status, "{} status", id);
        }
        if let Some(eas) = exp["decision"]["assertions"].as_array() {
            for ea in eas {
                let name = ea["name"].as_str().unwrap();
                let got = decision
                    .assertions
                    .iter()
                    .find(|a| a.name == name)
                    .unwrap_or_else(|| panic!("{} missing assertion {}", id, name));
                if let Some(r) = ea["result"].as_str() {
                    assert_eq!(got.result.as_str(), r, "{} {} result", id, name);
                }
            }
        }
        if let Some(auth) = exp["decision"]["authorized"].as_array() {
            let want: Vec<&str> = auth.iter().filter_map(|x| x.as_str()).collect();
            assert_eq!(decision.authorized, want, "{} authorized", id);
        }
        if let Some(errs) = exp["errors"].as_array()
            && errs
                .iter()
                .any(|e| e.as_str() == Some("kernel.unknown_verb"))
        {
            assert!(
                decision.errors.contains(&"kernel.unknown_verb".to_string()),
                "{} unknown_verb",
                id
            );
        }
        // For schema-invalid negatives, ensure we did not approve.
        if exp["valid"].as_bool() == Some(false) {
            assert_ne!(
                decision.status,
                DecisionStatus::Approved,
                "{} must not APPROVE",
                id
            );
        }
    }
}
