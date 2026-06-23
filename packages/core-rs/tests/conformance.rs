//! Conformance: arky-core (Rust) against the Foundation's published vectors and
//! fixtures. Proves the Rust stack produces byte-identical canonical bytes,
//! cids, and signature verification — i.e. a second independent stack agreeing
//! with the spec and with @arky/core (TS).

use arky_core::canonicalize::canonicalize;
use arky_core::cid::cid_from_canonical;
use arky_core::tim::{canonical_body, resolve_did_key, verify_tim};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

fn repo() -> PathBuf {
    // tests run from the crate dir (packages/core-rs); repo is two levels up.
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf()
}

fn read_json(rel: &str) -> Value {
    let p = repo().join(rel);
    serde_json::from_str(&fs::read_to_string(&p).unwrap_or_else(|_| panic!("read {rel}"))).unwrap()
}

fn list_json(dir: &str) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = fs::read_dir(repo().join(dir))
        .unwrap()
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|x| x == "json").unwrap_or(false))
        .collect();
    v.sort();
    v
}

#[test]
fn canonicalization_c1_vectors() {
    for path in list_json("vectors/canonicalization") {
        let v: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        let expect = &v["expect"];
        let Some(canon_json) = expect.get("canonical_json").and_then(|x| x.as_str()) else {
            continue;
        };
        let input = if !v["inputs"]["original"].is_null() {
            v["inputs"]["original"].clone()
        } else {
            let s = v["inputs"]["original_formatted"].as_str().unwrap();
            serde_json::from_str(s).unwrap()
        };
        let got = canonicalize(&input);
        assert_eq!(got, canon_json, "C1 {} canonical_json", v["id"]);
        if let Some(hex) = expect.get("canonical_bytes_hex").and_then(|x| x.as_str()) {
            let got_hex: String = got
                .as_bytes()
                .iter()
                .map(|b| format!("{:02x}", b))
                .collect();
            assert_eq!(got_hex, hex, "C1 {} bytes_hex", v["id"]);
        }
    }
}

/// Test-key resolver: did:key issuer, plus the two witness keys by kid.
fn resolver(tim: &Value, witness_kid: Option<&str>) -> Option<Vec<u8>> {
    if let Some(kid) = witness_kid {
        match kid {
            "test-key-2025-02" => return b64u("e_vAtyLIHAXMh1TRvhFUNrvifhH5ZzXKGwGKk9zgB9I"),
            "notary-key-2025-01" => return b64u("HDl_cQgT9vSiYMsH8q1dOdyb5prCuQYuRVBRhTTk1P8"),
            _ => {}
        }
    }
    let id = tim.get("identity")?.get("id")?.as_str()?;
    resolve_did_key(id)
}

fn b64u(s: &str) -> Option<Vec<u8>> {
    URL_SAFE_NO_PAD.decode(s).ok()
}

#[test]
fn tim_t1_vectors() {
    for path in list_json("vectors/tim") {
        let v: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        let tim = &v["inputs"]["tim"];
        if tim.is_null() {
            continue;
        }
        let res = verify_tim(tim, &resolver);
        let expect = &v["expect"];
        match expect.get("valid").and_then(|x| x.as_bool()) {
            Some(true) => {
                assert!(res.valid, "T1 {} expected valid: {:?}", v["id"], res.errors);
            }
            Some(false) => {
                assert!(!res.valid, "T1 {} expected invalid", v["id"]);
            }
            _ => {}
        }
    }
}

#[test]
fn tim_fixtures_verify_and_cid() {
    for path in list_json("vectors/fixtures/tims") {
        let v: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        let tim = &v["tim"];
        if tim.get("sig").is_none() {
            continue;
        }
        // Independent cid recomputation must match the stored cid.
        let canon = canonicalize(&canonical_body(tim));
        assert_eq!(
            cid_from_canonical(&canon),
            tim["cid"].as_str().unwrap(),
            "fixture {} cid",
            v["id"]
        );
        let res = verify_tim(tim, &resolver);
        assert!(res.cid_valid, "fixture {} cid_valid", v["id"]);
        assert!(res.signature_valid, "fixture {} signature_valid", v["id"]);
        assert!(res.witnesses_valid, "fixture {} witnesses_valid", v["id"]);
    }
}

#[test]
fn cross_language_cids_match_known_values() {
    // These cids were produced by @arky/core (TS) and the tooling; the Rust
    // stack must reproduce them byte-for-byte from the same canonical bytes.
    let tim001 = read_json("vectors/fixtures/tims/valid-tim-001.json");
    let canon = canonicalize(&canonical_body(&tim001["tim"]));
    assert_eq!(
        cid_from_canonical(&canon),
        tim001["tim"]["cid"].as_str().unwrap()
    );
}
