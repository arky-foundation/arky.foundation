//! Ed25519 key helpers. The matching verification identity is a `did:key:z6Mk…`
//! derived from the public key, so `identity.id` resolves to the signing key
//! (ARKY-TIM-v1 §6.1). Using these together guarantees the DID and key agree.

use crate::cid::to_multibase;
use ed25519_dalek::SigningKey;

/// An Ed25519 keypair plus its matching did:key identity.
pub struct KeyPair {
    pub signing_key: SigningKey,
    pub did: String,
}

/// Derive the did:key (multicodec 0xed01 + pubkey, base58btc, 'z' prefix).
pub fn did_key_from_public(public_key: &[u8]) -> String {
    let mut mc = Vec::with_capacity(2 + public_key.len());
    mc.push(0xed);
    mc.push(0x01);
    mc.extend_from_slice(public_key);
    // to_multibase yields "z<base58>"; the did:key form is "did:key:z<base58>".
    format!("did:key:{}", to_multibase(&mc))
}

/// KeyPair from a 32-byte seed.
pub fn from_seed(seed: [u8; 32]) -> KeyPair {
    let signing_key = SigningKey::from_bytes(&seed);
    let did = did_key_from_public(signing_key.verifying_key().as_bytes());
    KeyPair { signing_key, did }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn did_matches_key() {
        // The did:key derived from a known seed's public key starts with z6Mk
        // and round-trips back to the same 32-byte key via resolve_did_key.
        let kp = from_seed([7u8; 32]);
        assert!(kp.did.starts_with("did:key:z6Mk"));
        let resolved = crate::tim::resolve_did_key(&kp.did).unwrap();
        assert_eq!(resolved, kp.signing_key.verifying_key().as_bytes());
    }
}
