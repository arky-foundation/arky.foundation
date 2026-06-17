//! Content identifier per ARKY-TIM-Canonicalization-v1 §4:
//!   cid = multibase('z', base58btc(multihash(sha2-256, canonical_bytes)))
//! multihash = 0x12 0x20 || sha256(bytes). NOT an IPFS CID.

use sha2::{Digest, Sha256};

/// multihash(sha2-256, bytes) = 0x12 0x20 || digest (34 bytes).
pub fn multihash_sha256(bytes: &[u8]) -> Vec<u8> {
    let digest = Sha256::digest(bytes);
    let mut mh = Vec::with_capacity(34);
    mh.push(0x12);
    mh.push(0x20);
    mh.extend_from_slice(&digest);
    mh
}

/// Encode raw bytes as multibase base58btc (prefix 'z').
pub fn to_multibase(bytes: &[u8]) -> String {
    let mut s = String::from("z");
    s.push_str(&bs58::encode(bytes).into_string());
    s
}

/// Decode a multibase 'z…' (base58btc) string to raw bytes.
pub fn from_multibase(s: &str) -> Result<Vec<u8>, String> {
    let rest = s.strip_prefix('z').ok_or("multibase: expected 'z' prefix")?;
    bs58::decode(rest)
        .into_vec()
        .map_err(|e| format!("base58: {e}"))
}

/// cid over canonical bytes.
pub fn cid_from_canonical(canonical: &str) -> String {
    to_multibase(&multihash_sha256(canonical.as_bytes()))
}

/// multibase(multihash(sha2-256, bytes)).
pub fn multihash_mb(bytes: &[u8]) -> String {
    to_multibase(&multihash_sha256(bytes))
}
