package arky

import (
	"crypto/ed25519"
	"crypto/rand"
)

// KeyPair is an Ed25519 keypair plus its matching did:key identity.
//
// The verification identity is a did:key:z6Mk... derived from the public key,
// so identity.id resolves to the signing key (ARKY-TIM-v1 section 6.1). Using
// these together guarantees the DID and the key agree — a mismatch is exactly
// the bug an earlier audit found in the published fixtures.
type KeyPair struct {
	PrivateKey ed25519.PrivateKey
	PublicKey  ed25519.PublicKey
	Did        string
}

// DidKeyFromPublic derives the did:key form (multicodec 0xed01 + pubkey,
// base58btc, 'z' prefix).
func DidKeyFromPublic(pub ed25519.PublicKey) string {
	mc := make([]byte, 0, 2+len(pub))
	mc = append(mc, 0xed, 0x01)
	mc = append(mc, pub...)
	return "did:key:" + ToMultibase(mc)
}

// FromSeed builds a KeyPair from a 32-byte seed.
func FromSeed(seed []byte) KeyPair {
	priv := ed25519.NewKeyFromSeed(seed)
	pub := priv.Public().(ed25519.PublicKey)
	return KeyPair{PrivateKey: priv, PublicKey: pub, Did: DidKeyFromPublic(pub)}
}

// GenerateKeyPair creates a new random KeyPair.
func GenerateKeyPair() (KeyPair, error) {
	seed := make([]byte, ed25519.SeedSize)
	if _, err := rand.Read(seed); err != nil {
		return KeyPair{}, err
	}
	return FromSeed(seed), nil
}
