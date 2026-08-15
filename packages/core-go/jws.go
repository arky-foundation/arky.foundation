package arky

import (
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"strings"
)

var b64u = base64.RawURLEncoding // base64url, no padding

// protectedHeader builds the JWS protected header JSON.
//
// The member order is fixed at alg, typ, [kid,] b64, crit and written by hand
// rather than via encoding/json, which sorts map keys alphabetically. The
// header is base64url-encoded verbatim into the signing input, so its byte
// order is part of the signature: sorted keys would produce a different
// protected segment and a signature the other stacks reject.
func protectedHeader(kid string) string {
	var sb strings.Builder
	sb.WriteString(`{"alg":"EdDSA","typ":"JWS"`)
	if kid != "" {
		sb.WriteString(`,"kid":`)
		writeString(kid, &sb)
	}
	sb.WriteString(`,"b64":false,"crit":["b64"]}`)
	return sb.String()
}

// signingInput is the RFC 7797 detached-payload signing input:
// ASCII(BASE64URL(protected)) || '.' || payload.
func signingInput(protectedB64 string, payload []byte) []byte {
	buf := make([]byte, 0, len(protectedB64)+1+len(payload))
	buf = append(buf, protectedB64...)
	buf = append(buf, '.')
	return append(buf, payload...)
}

// SignDetached signs canonical payload bytes, returning the compact detached
// JWS <protected>..<signature> (RFC 7797, b64:false), per ARKY-TIM-v1 section 6.
// Pass kid = "" to omit the key id.
func SignDetached(payload []byte, priv ed25519.PrivateKey, kid string) string {
	protectedB64 := b64u.EncodeToString([]byte(protectedHeader(kid)))
	sig := ed25519.Sign(priv, signingInput(protectedB64, payload))
	return protectedB64 + ".." + b64u.EncodeToString(sig)
}

// DecodeProtectedHeader decodes the protected header of a compact JWS.
func DecodeProtectedHeader(jws string) (Value, error) {
	part, _, _ := strings.Cut(jws, ".")
	if part == "" {
		return nil, errors.New("jws: empty protected header")
	}
	raw, err := b64u.DecodeString(part)
	if err != nil {
		return nil, err
	}
	return Parse(string(raw))
}

// VerifyDetached verifies a detached compact JWS over payload against an
// Ed25519 public key. It returns true only if the signature is valid, the
// payload segment is empty, and the header is well-formed (alg EdDSA,
// b64:false, crit contains b64).
//
// The header checks are defense in depth: the protected header is part of the
// signing input, so tampering with alg already breaks the signature. They are
// kept so an alg:none downgrade is refused explicitly rather than incidentally.
// This function never panics on malformed input.
func VerifyDetached(jws string, payload []byte, pub ed25519.PublicKey) bool {
	parts := strings.Split(jws, ".")
	if len(parts) != 3 || parts[1] != "" {
		return false
	}
	protectedB64, sigB64 := parts[0], parts[2]

	hdr, err := DecodeProtectedHeader(jws)
	if err != nil {
		return false
	}
	obj, ok := hdr.(*Object)
	if !ok {
		return false
	}
	if alg, _ := obj.Get("alg"); alg != "EdDSA" {
		return false
	}
	if b64flag, _ := obj.Get("b64"); b64flag != false {
		return false
	}
	crit, _ := obj.Get("crit")
	critArr, ok := crit.([]Value)
	if !ok {
		return false
	}
	hasB64 := false
	for _, c := range critArr {
		if c == "b64" {
			hasB64 = true
			break
		}
	}
	if !hasB64 {
		return false
	}

	sig, err := b64u.DecodeString(sigB64)
	if err != nil || len(sig) != ed25519.SignatureSize {
		return false
	}
	if len(pub) != ed25519.PublicKeySize {
		return false
	}
	return ed25519.Verify(pub, signingInput(protectedB64, payload), sig)
}
