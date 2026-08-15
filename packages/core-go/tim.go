package arky

import (
	"crypto/ed25519"
	"strings"
)

// VerifyResult is the outcome of verifying a TIM.
type VerifyResult struct {
	Valid          bool
	SchemaValid    bool
	CidValid       bool
	SignatureValid bool
	WitnessesValid bool
	// Fresh is false only when a reference time was supplied to VerifyTimAt and
	// the TIM's exp is at or before it (TIM section 4). VerifyTim leaves it true.
	Fresh         bool
	Errors        []string
	MissingFields []string
}

var requiredPaths = [][]string{
	{"time", "ts"},
	{"identity", "id"},
	{"measurement", "name"},
	{"measurement", "value"},
	{"measurement", "method"},
	{"cid"},
	{"sig"},
}

// CanonicalBody returns the canonical body: the TIM minus cid, sig, and
// time.witnesses (dropping time entirely if that empties it).
//
// Witnesses are excluded because they are co-signatures over these same bytes —
// including them would make the signed body depend on the signatures over it.
func CanonicalBody(tim Value) Value {
	obj, ok := tim.(*Object)
	if !ok {
		return tim
	}
	out := obj.Clone()
	out.Delete("cid")
	out.Delete("sig")
	if t, ok := out.Get("time"); ok {
		if tobj, ok := t.(*Object); ok {
			tobj.Delete("witnesses")
			if tobj.Len() == 0 {
				out.Delete("time")
			}
		}
	}
	return out
}

// CreateTim builds a signed TIM from a body object (time/identity/measurement
// plus optional prev/nonce/exp) and an Ed25519 private key, computing the
// canonical body, cid, and detached sig.
func CreateTim(body Value, priv ed25519.PrivateKey, kid string) (Value, error) {
	obj, ok := body.(*Object)
	if !ok {
		obj = NewObject()
	}
	base := obj.Clone()
	base.Delete("cid")
	base.Delete("sig")

	canonical, err := Canonicalize(base)
	if err != nil {
		return nil, err
	}
	out := base.Clone()
	out.Set("cid", CidFromCanonical(canonical))
	out.Set("sig", SignDetached([]byte(canonical), priv, kid))
	return out, nil
}

// KeyResolver maps a TIM (and, for a witness, that witness's kid) to a 32-byte
// Ed25519 public key. Return nil when no key is known.
type KeyResolver func(tim Value, witnessKid string) ed25519.PublicKey

// ResolveDidKey extracts the Ed25519 public key from a did:key:z6Mk... identity
// (multicodec 0xed 0x01 followed by a 32-byte key).
//
// It returns nil for any malformed input — bad base58, wrong multicodec, or a
// payload that is not exactly 32 bytes — and never panics, so a verifier
// handling untrusted TIMs cannot be crashed by a hostile identity string. The
// z6Mk prefix and the 34-byte decoded length are both enforced so this agrees
// exactly with @arky/core and arky-core on which identities resolve.
func ResolveDidKey(id string) ed25519.PublicKey {
	rest, ok := strings.CutPrefix(id, "did:key:z6Mk")
	if !ok {
		return nil
	}
	decoded, err := FromMultibase("z6Mk" + rest)
	if err != nil || len(decoded) != 34 || decoded[0] != 0xed || decoded[1] != 0x01 {
		return nil
	}
	return ed25519.PublicKey(decoded[2:])
}

// DefaultResolver resolves the TIM's did:key identity, and is witness-aware:
// when a witness carries a did:key kid it resolves that notary's key instead,
// so a TIM co-signed by a second party verifies out of the box. Falls back to
// the TIM identity when the kid is absent or is not a did:key.
func DefaultResolver(tim Value, witnessKid string) ed25519.PublicKey {
	if witnessKid != "" {
		if key := ResolveDidKey(witnessKid); key != nil {
			return key
		}
	}
	return ResolveDidKey(Str(tim, "identity", "id"))
}

// VerifyTim verifies a TIM's cid, issuer signature, and any witnesses. It is a
// pure cryptographic check with no freshness enforcement; pass nil for resolve
// to use DefaultResolver.
func VerifyTim(tim Value, resolve KeyResolver) VerifyResult {
	return VerifyTimAt(tim, resolve, "")
}

// VerifyTimAt verifies a TIM, optionally enforcing freshness (TIM section 4).
// When at is a non-empty RFC3339 timestamp and the TIM's exp is at or before
// it, the result is Fresh:false with a tim.expired error, and Valid is false.
// Pass "" for at to skip the freshness check.
//
// Anti-replay (nonce) and causal-chain (prev) enforcement need external state
// and remain the caller's responsibility — single-TIM verification cannot do
// them. This function never panics, whatever the input.
func VerifyTimAt(tim Value, resolve KeyResolver, at string) VerifyResult {
	if resolve == nil {
		resolve = DefaultResolver
	}
	res := VerifyResult{Fresh: true, Errors: []string{}, MissingFields: []string{}}

	for _, p := range requiredPaths {
		if _, ok := Path(tim, p...); !ok {
			res.MissingFields = append(res.MissingFields, strings.Join(p, "."))
		}
	}
	if len(res.MissingFields) > 0 {
		res.Errors = append(res.Errors, "tim.missing_required")
		return res
	}
	res.SchemaValid = true

	// JCS forbids non-finite numbers, and a hostile TIM can carry one. Translate
	// a canonicalization failure into the standard failure shape instead of
	// propagating it, so the verifier stays safe on untrusted input.
	canonical, err := Canonicalize(CanonicalBody(tim))
	if err != nil {
		res.Errors = append(res.Errors, "tim.non_finite")
		return res
	}
	payload := []byte(canonical)

	res.CidValid = CidFromCanonical(canonical) == Str(tim, "cid")
	if !res.CidValid {
		res.Errors = append(res.Errors, "tim.cid_mismatch")
	}

	if key := resolve(tim, ""); len(key) == ed25519.PublicKeySize {
		res.SignatureValid = VerifyDetached(Str(tim, "sig"), payload, key)
		if !res.SignatureValid {
			res.Errors = append(res.Errors, "tim.invalid_signature")
		}
	} else {
		res.Errors = append(res.Errors, "tim.key_unresolved")
	}

	// Witnesses (optional): each is a detached JWS over the SAME canonical bytes.
	res.WitnessesValid = true
	if ws, ok := Path(tim, "time", "witnesses"); ok {
		if arr, ok := ws.([]Value); ok {
			for i, w := range arr {
				wjws, _ := w.(string)
				kid := ""
				if hdr, err := DecodeProtectedHeader(wjws); err == nil {
					kid = Str(hdr, "kid")
				}
				key := resolve(tim, kid)
				if len(key) != ed25519.PublicKeySize || !VerifyDetached(wjws, payload, key) {
					res.WitnessesValid = false
					res.Errors = append(res.Errors, "tim.invalid_witness["+itoa(i)+"]")
				}
			}
		}
	}

	// Freshness (TIM section 4). Unparseable at/exp are ignored rather than
	// treated as expired, mirroring the other stacks.
	if at != "" {
		if exp := Str(tim, "exp"); exp != "" {
			now, okNow := ParseRFC3339Ms(at)
			e, okExp := ParseRFC3339Ms(exp)
			if okNow && okExp && e <= now {
				res.Fresh = false
				res.Errors = append(res.Errors, "tim.expired")
			}
		}
	}

	res.Valid = res.CidValid && res.SignatureValid && res.WitnessesValid && res.Fresh
	return res
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var buf [20]byte
	pos := len(buf)
	for i > 0 {
		pos--
		buf[pos] = byte('0' + i%10)
		i /= 10
	}
	return string(buf[pos:])
}
