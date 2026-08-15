// Adversarial / security regression tests for the Go stack.
//
// The mirror of @arky/core's test/security.test.ts and arky-core's
// tests/security.rs: each case is an attack that MUST be rejected (verification
// fails) or handled (no panic) — never forged, never fatal. The three stacks
// are cross-checked byte-for-byte on the happy path, so their *failure*
// behaviour has to be pinned on each side too: a hole present in only one stack
// is exactly the divergence a third implementation exists to surface.
package arky_test

import (
	"crypto/ed25519"
	"encoding/base64"
	"strings"
	"testing"

	arky "github.com/arky-foundation/arky.foundation/packages/core-go"
)

func identityResolver(tim arky.Value, _ string) ed25519.PublicKey {
	return arky.ResolveDidKey(arky.Str(tim, "identity", "id"))
}

func baseBody(did string) *arky.Object {
	method := arky.NewObject()
	method.Set("type", "sensor")
	method.Set("source", "s")

	measurement := arky.NewObject()
	measurement.Set("name", "temp")
	measurement.Set("value", arky.Number("22.5"))
	measurement.Set("unit", "degC")
	measurement.Set("method", method)

	timeObj := arky.NewObject()
	timeObj.Set("ts", "2025-10-15T12:00:00Z")

	identity := arky.NewObject()
	identity.Set("id", did)

	body := arky.NewObject()
	body.Set("time", timeObj)
	body.Set("identity", identity)
	body.Set("measurement", measurement)
	return body
}

func issuerAndTim(t *testing.T) (arky.KeyPair, *arky.Object) {
	t.Helper()
	issuer := arky.FromSeed(bytesRepeat(7, 32))
	tim, err := arky.CreateTim(baseBody(issuer.Did), issuer.PrivateKey, "")
	if err != nil {
		t.Fatalf("create tim: %v", err)
	}
	return issuer, tim.(*arky.Object)
}

// setPath mutates a nested field, returning a modified clone.
func setPath(o *arky.Object, outer, inner string, v arky.Value) *arky.Object {
	c := o.Clone()
	if inner == "" {
		c.Set(outer, v)
		return c
	}
	sub, _ := c.Get(outer)
	subObj, ok := sub.(*arky.Object)
	if !ok {
		subObj = arky.NewObject()
	}
	subObj.Set(inner, v)
	c.Set(outer, subObj)
	return c
}

// --- forgery ---

func TestMutatedValueWithOriginalCidAndSigIsRejected(t *testing.T) {
	_, tim := issuerAndTim(t)
	forged := setPath(tim, "measurement", "value", arky.Number("999"))
	if arky.VerifyTim(forged, identityResolver).Valid {
		t.Error("a mutated measurement must not verify")
	}
}

func TestMutatedValueWithRecomputedCidAndStaleSigIsRejected(t *testing.T) {
	_, tim := issuerAndTim(t)
	forged := setPath(tim, "measurement", "value", arky.Number("999"))
	// Recompute the cid so it matches the tampered body, keeping the old sig.
	canonical, err := arky.Canonicalize(arky.CanonicalBody(forged))
	if err != nil {
		t.Fatalf("canonicalize: %v", err)
	}
	forged.Set("cid", arky.CidFromCanonical(canonical))

	res := arky.VerifyTim(forged, identityResolver)
	if !res.CidValid {
		t.Error("the recomputed cid should match the tampered body")
	}
	if res.SignatureValid {
		t.Error("the stale signature must not verify")
	}
	if res.Valid {
		t.Error("overall result must be invalid")
	}
}

func TestAttackerSignsWithOwnKeyButClaimsVictimDid(t *testing.T) {
	issuer := arky.FromSeed(bytesRepeat(7, 32))
	attacker := arky.FromSeed(bytesRepeat(9, 32))
	// identity.id is the victim's DID; the signature is the attacker's.
	forged, err := arky.CreateTim(baseBody(issuer.Did), attacker.PrivateKey, "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	res := arky.VerifyTim(forged, identityResolver)
	if res.Valid || res.SignatureValid {
		t.Error("did:key resolves to the issuer, so the attacker's signature must fail")
	}
}

func TestSwappingIdentityKeepingVictimSignatureIsRejected(t *testing.T) {
	_, tim := issuerAndTim(t)
	attacker := arky.FromSeed(bytesRepeat(9, 32))
	forged := setPath(tim, "identity", "id", attacker.Did)
	if arky.VerifyTim(forged, identityResolver).Valid {
		t.Error("swapping identity.id must invalidate the TIM")
	}
}

func TestAlgNoneDowngradeIsRejected(t *testing.T) {
	_, tim := issuerAndTim(t)
	hdr := base64.RawURLEncoding.EncodeToString(
		[]byte(`{"alg":"none","b64":false,"crit":["b64"]}`))
	parts := strings.Split(arky.Str(tim, "sig"), ".")
	forged := tim.Clone()
	forged.Set("sig", hdr+".."+parts[2])
	if arky.VerifyTim(forged, identityResolver).Valid {
		t.Error("an alg:none downgrade must be rejected")
	}
}

func TestEmptySignatureIsRejected(t *testing.T) {
	_, tim := issuerAndTim(t)
	parts := strings.Split(arky.Str(tim, "sig"), ".")
	forged := tim.Clone()
	forged.Set("sig", parts[0]+"..")
	if arky.VerifyTim(forged, identityResolver).Valid {
		t.Error("an empty signature must be rejected")
	}
}

func TestForgedWitnessIsRejected(t *testing.T) {
	_, tim := issuerAndTim(t)
	attacker := arky.FromSeed(bytesRepeat(9, 32))
	canonical, err := arky.Canonicalize(arky.CanonicalBody(tim))
	if err != nil {
		t.Fatalf("canonicalize: %v", err)
	}
	wsig := arky.SignDetached([]byte(canonical), attacker.PrivateKey, "")
	forged := setPath(tim, "time", "witnesses", []arky.Value{wsig})

	res := arky.VerifyTim(forged, identityResolver)
	if res.WitnessesValid || res.Valid {
		t.Error("a witness signed by an unknown key must be rejected")
	}
}

// --- witness-aware default resolver ---

func TestWitnessCosignedBySecondDidKeyNotaryVerifies(t *testing.T) {
	_, tim := issuerAndTim(t)
	notary := arky.FromSeed(bytesRepeat(11, 32))
	canonical, err := arky.Canonicalize(arky.CanonicalBody(tim))
	if err != nil {
		t.Fatalf("canonicalize: %v", err)
	}
	// Witness signed by the notary, with kid = the notary's did:key.
	wsig := arky.SignDetached([]byte(canonical), notary.PrivateKey, notary.Did)
	cosigned := setPath(tim, "time", "witnesses", []arky.Value{wsig})

	res := arky.VerifyTim(cosigned, nil) // nil -> DefaultResolver
	if !res.WitnessesValid || !res.Valid {
		t.Errorf("a did:key notary co-signature should verify with the default resolver: %v", res.Errors)
	}
}

func TestWitnessWithNonDidKidFallsBackAndStaysRejected(t *testing.T) {
	_, tim := issuerAndTim(t)
	attacker := arky.FromSeed(bytesRepeat(9, 32))
	canonical, err := arky.Canonicalize(arky.CanonicalBody(tim))
	if err != nil {
		t.Fatalf("canonicalize: %v", err)
	}
	// kid is not a did:key, so the resolver falls back to the TIM identity —
	// but the witness was signed by the attacker, so it must still fail.
	wsig := arky.SignDetached([]byte(canonical), attacker.PrivateKey, "test-key-2025-02")
	forged := setPath(tim, "time", "witnesses", []arky.Value{wsig})
	if arky.VerifyTim(forged, nil).WitnessesValid {
		t.Error("a forged witness must not verify via the identity fallback")
	}
}

// --- malformed input / DoS ---

func TestMalformedInputIsHandledWithoutPanicking(t *testing.T) {
	_, tim := issuerAndTim(t)

	cases := []struct {
		name string
		tim  arky.Value
	}{
		{"malformed base58 did:key", setPath(tim, "identity", "id", "did:key:z6Mk0OIl")},
		{"truncated did:key", setPath(tim, "identity", "id", "did:key:z6Mk")},
		{"wrong-length did:key", setPath(tim, "identity", "id", "did:key:z6MkAAAA")},
		{"malformed witness JWS", setPath(tim, "time", "witnesses", []arky.Value{"!!!not.a.jws"})},
		{"garbage signature", setPath(tim, "sig", "", "$$$garbage$$$")},
		{"witness not a string", setPath(tim, "time", "witnesses", []arky.Value{arky.Number("1")})},
	}
	for _, c := range cases {
		res := arky.VerifyTim(c.tim, identityResolver)
		if res.Valid {
			t.Errorf("%s: must not verify", c.name)
		}
	}

	// A structurally broken TIM (null measurement, junk cid/sig) must report
	// missing fields rather than panicking.
	broken, err := arky.Parse(`{"time":{"ts":"x"},"identity":{"id":"did:web:x"},
		"measurement":null,"cid":"z","sig":"a..b"}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if arky.VerifyTim(broken, identityResolver).Valid {
		t.Error("a TIM with a null measurement must not verify")
	}
}

// TestVerifyNonFiniteDoesNotPanic covers the JCS-forbidden numbers a hostile
// TIM can carry: canonicalization fails, and the verifier must translate that
// into a clean failure rather than propagating it.
func TestVerifyNonFiniteDoesNotPanic(t *testing.T) {
	_, tim := issuerAndTim(t)
	hostile := setPath(tim, "measurement", "value", arky.Number("NaN"))
	res := arky.VerifyTim(hostile, identityResolver)
	if res.Valid {
		t.Error("a non-finite measurement must not verify")
	}
	found := false
	for _, e := range res.Errors {
		if e == "tim.non_finite" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected tim.non_finite, got %v", res.Errors)
	}
}

func TestResolveDidKeyNeverPanicsOnHostileInput(t *testing.T) {
	for _, id := range []string{
		"did:key:z6Mk0OIl", "did:key:z", "did:key:z6Mk", "did:key:zNOPE",
		"did:key:", "", "not-a-did", "did:key:z6Mk\x00\x01",
		"did:key:z6Mk" + strings.Repeat("1", 1000),
	} {
		if key := arky.ResolveDidKey(id); key != nil {
			t.Errorf("ResolveDidKey(%q) resolved unexpectedly", id)
		}
	}
}

// TestDidKeyWithNonThirtyTwoBytePayload pins the resolution contract shared
// with the other stacks: a did:key must decode to the Ed25519 multicodec
// followed by exactly 32 bytes. Anything else resolves to nil rather than
// handing the caller a slice that is not a key.
//
// Note what actually rejects these: base58btc output length is tightly
// determined by input length, so a 0xed01-prefixed payload encodes to a
// "z6Mk..." string only when it is exactly 34 bytes. These inputs are
// therefore caught by the prefix check, and the explicit length check below is
// defense in depth for the cases the prefix alone would let through.
func TestDidKeyWithNonThirtyTwoBytePayload(t *testing.T) {
	for _, n := range []int{0, 1, 4, 31, 33, 64} {
		raw := append([]byte{0xed, 0x01}, bytesRepeat(0x41, n)...)
		id := "did:key:" + arky.ToMultibase(raw)
		if key := arky.ResolveDidKey(id); key != nil {
			t.Errorf("%d-byte payload must not resolve as an Ed25519 key", n)
		}
	}
}

// TestTruncatedOrExtendedDidKeyDoesNotResolve mutates a genuine z6Mk did:key by
// trimming or extending its base58 payload. Each result keeps the z6Mk prefix
// but decodes to different bytes, so it must not resolve.
//
// Mutation testing showed these are caught by the multicodec byte check rather
// than the length check: altering the base58 tail changes the leading decoded
// bytes too. Together with the enumeration below, that means the explicit
// 34-byte test is redundant for did:key inputs specifically — it is kept
// because ResolveDidKey's contract is "exactly 32 key bytes or nil", and a
// future change to the prefix handling must not silently widen it.
func TestTruncatedOrExtendedDidKeyDoesNotResolve(t *testing.T) {
	real := arky.FromSeed(bytesRepeat(7, 32)).Did
	if arky.ResolveDidKey(real) == nil {
		t.Fatal("the genuine did:key should resolve")
	}
	for _, cut := range []int{1, 2, 5, 10} {
		truncated := real[:len(real)-cut]
		if !strings.HasPrefix(truncated, "did:key:z6Mk") {
			t.Fatalf("test setup: %q lost the z6Mk prefix", truncated)
		}
		if key := arky.ResolveDidKey(truncated); key != nil {
			t.Errorf("truncated did:key %q must not resolve (got %d bytes)",
				truncated, len(key))
		}
	}
	if key := arky.ResolveDidKey(real + "111"); key != nil {
		t.Errorf("an over-long did:key must not resolve (got %d bytes)", len(key))
	}
}

// TestOnlyThirtyFourByteMulticodecEncodesToZ6Mk documents why the z6Mk prefix
// check is sufficient in practice: base58btc output length is determined by
// input length, so an Ed25519-multicodec buffer renders as "z6Mk..." only when
// it is exactly 34 bytes. If this ever stops holding, the prefix check would no
// longer imply the length check and the guard in ResolveDidKey becomes the only
// thing standing between a caller and a malformed key.
func TestOnlyThirtyFourByteMulticodecEncodesToZ6Mk(t *testing.T) {
	for _, n := range []int{29, 30, 31, 33, 34, 35, 64} {
		for b := range 256 {
			raw := append([]byte{0xed, 0x01, byte(b)}, bytesRepeat(0x00, n-1)...)
			if strings.HasPrefix(arky.ToMultibase(raw), "z6Mk") {
				t.Errorf("a %d-byte payload encoded to z6Mk; the prefix check no "+
					"longer implies the 34-byte length check", n+2)
			}
		}
	}
	// The 32-byte key case must of course still produce z6Mk.
	real := arky.FromSeed(bytesRepeat(7, 32))
	if !strings.HasPrefix(real.Did, "did:key:z6Mk") {
		t.Error("a genuine Ed25519 did:key must start with z6Mk")
	}
}

func TestDidKeyWithWrongMulticodecDoesNotResolve(t *testing.T) {
	// 0xec 0x01 is X25519, not Ed25519 — refuse even at 32 bytes.
	raw := append([]byte{0xec, 0x01}, bytesRepeat(0x41, 32)...)
	if key := arky.ResolveDidKey("did:key:" + arky.ToMultibase(raw)); key != nil {
		t.Error("an X25519 multicodec must not resolve as Ed25519")
	}
}

func TestDecodeProtectedHeaderDoesNotPanicOnGarbage(t *testing.T) {
	for _, j := range []string{"", "...", "!!!", "a.b.c", "$$$garbage$$$", "e30"} {
		_, _ = arky.DecodeProtectedHeader(j) // must not panic
	}
}

func TestVerifyDetachedRejectsMalformed(t *testing.T) {
	kp := arky.FromSeed(bytesRepeat(3, 32))
	payload := []byte("payload")
	valid := arky.SignDetached(payload, kp.PrivateKey, "")
	if !arky.VerifyDetached(valid, payload, kp.PublicKey) {
		t.Fatal("a well-formed signature should verify")
	}
	for _, bad := range []string{"", "a.b", "a.b.c.d", "a..b", valid + "x", "..", "!!!"} {
		if arky.VerifyDetached(bad, payload, kp.PublicKey) {
			t.Errorf("malformed JWS %q must not verify", bad)
		}
	}
	// A non-empty payload segment violates the detached (b64:false) form.
	parts := strings.Split(valid, ".")
	if arky.VerifyDetached(parts[0]+".injected."+parts[2], payload, kp.PublicKey) {
		t.Error("a non-empty payload segment must be rejected")
	}
	// A wrong key must not verify.
	other := arky.FromSeed(bytesRepeat(4, 32))
	if arky.VerifyDetached(valid, payload, other.PublicKey) {
		t.Error("verification under the wrong key must fail")
	}
	// A short/invalid public key must be refused rather than panicking.
	if arky.VerifyDetached(valid, payload, ed25519.PublicKey{1, 2, 3}) {
		t.Error("an undersized public key must not verify")
	}
}

// --- freshness ---

func TestFreshnessOnlyEnforcedWithReferenceTime(t *testing.T) {
	issuer := arky.FromSeed(bytesRepeat(7, 32))
	body := baseBody(issuer.Did)
	body.Set("exp", "2020-01-02T00:00:00Z")
	expired, err := arky.CreateTim(body, issuer.PrivateKey, "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	// No reference time: a pure cryptographic check, still valid.
	res := arky.VerifyTim(expired, identityResolver)
	if !res.Valid || !res.Fresh {
		t.Errorf("without `at` the TIM should verify: %v", res.Errors)
	}

	// With a reference time after exp: expired.
	res = arky.VerifyTimAt(expired, identityResolver, "2026-01-01T00:00:00Z")
	if res.Valid || res.Fresh {
		t.Error("an expired TIM must fail once a reference time is supplied")
	}
	found := false
	for _, e := range res.Errors {
		if e == "tim.expired" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected tim.expired, got %v", res.Errors)
	}
}

func TestUnexpiredTimPassesWithReferenceTime(t *testing.T) {
	issuer := arky.FromSeed(bytesRepeat(7, 32))
	body := baseBody(issuer.Did)
	body.Set("exp", "2099-01-01T00:00:00Z")
	future, err := arky.CreateTim(body, issuer.PrivateKey, "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if !arky.VerifyTimAt(future, identityResolver, "2026-01-01T00:00:00Z").Valid {
		t.Error("an unexpired TIM should verify")
	}
}

func TestTimWithoutExpIsAlwaysFresh(t *testing.T) {
	_, tim := issuerAndTim(t)
	if !arky.VerifyTimAt(tim, identityResolver, "2099-01-01T00:00:00Z").Fresh {
		t.Error("a TIM without exp is always fresh")
	}
}

// --- settler authorization safety ---

func pay(t *testing.T, amount arky.Value) arky.ExecStatus {
	t.Helper()
	kp := arky.FromSeed(bytesRepeat(1, 32))
	args := arky.NewObject()
	args.Set("to", "x")
	args.Set("amount", amount)
	return arky.Execute(arky.ExecRequest{
		Verb: "arky:verb/pay@v1",
		Rail: "ach:us",
		Args: args,
	}, kp.PrivateKey, "", "2025-01-01T00:00:00Z", "log:x", nil).Status
}

func amountOf(value, unit string) *arky.Object {
	a := arky.NewObject()
	if value != "" {
		a.Set("value", arky.Number(value))
	}
	if unit != "" {
		a.Set("unit", unit)
	}
	return a
}

// TestSettlerRejectsInvalidAmounts guards the authorization boundary: an
// earlier audit found every stack approving negative and zero payments because
// they only checked that the argument key existed.
func TestSettlerRejectsInvalidAmounts(t *testing.T) {
	cases := []struct {
		name   string
		amount arky.Value
		want   arky.ExecStatus
	}{
		{"negative", amountOf("-1000", "USD"), arky.ExecFailed},
		{"zero", amountOf("0", "USD"), arky.ExecFailed},
		{"missing unit", amountOf("100", ""), arky.ExecFailed},
		{"empty unit", amountOf("100", ""), arky.ExecFailed},
		{"non-object", "100", arky.ExecFailed},
		{"missing value", amountOf("", "USD"), arky.ExecFailed},
		{"valid", amountOf("100", "USD"), arky.ExecSuccess},
	}
	for _, c := range cases {
		if got := pay(t, c.amount); got != c.want {
			t.Errorf("%s amount: status = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestSettlerRejectsUnknownVerbAndRail(t *testing.T) {
	kp := arky.FromSeed(bytesRepeat(1, 32))
	args := arky.NewObject()
	args.Set("action", "stop")

	res := arky.Execute(arky.ExecRequest{
		Verb: "arky:verb/evil@v1", Args: args,
	}, kp.PrivateKey, "", "2025-01-01T00:00:00Z", "log:x", nil)
	if res.Status != arky.ExecFailed {
		t.Error("an unregistered verb must fail")
	}

	res = arky.Execute(arky.ExecRequest{
		Verb: "arky:verb/control@v1", Rail: "unknown:rail", Args: args,
	}, kp.PrivateKey, "", "2025-01-01T00:00:00Z", "log:x", nil)
	if res.Status != arky.ExecFailed {
		t.Error("an unsupported rail must fail")
	}
}

// --- kernel authorization safety ---

func commitmentFixture(t *testing.T) arky.Value {
	t.Helper()
	v, err := arky.Parse(`{
		"scope":"s","actor":"a",
		"intent":{"do":"arky:verb/pay@v1"},
		"measure":[{"name":"temp","assert":"temp > 20"}],
		"consequence":[{"if":"PASS","then":[
			{"name":"arky:verb/pay@v1","args":{"to":"x","amount":{"value":1,"unit":"USD"}}}]}]
	}`)
	if err != nil {
		t.Fatalf("parse commitment: %v", err)
	}
	return v
}

func TestKernelDoesNotApproveOnMissingEvidence(t *testing.T) {
	dec := arky.EvaluateKernel(commitmentFixture(t), nil, "2025-10-15T12:00:00Z")
	if dec.Status != arky.StatusIndeterminate {
		t.Errorf("no evidence must yield INDETERMINATE, got %v", dec.Status)
	}
	if len(dec.Authorized) != 0 {
		t.Errorf("nothing may be authorized without evidence, got %v", dec.Authorized)
	}
}

func TestKernelRejectsUnregisteredVerb(t *testing.T) {
	v, err := arky.Parse(`{
		"scope":"s","actor":"a",
		"intent":{"do":"arky:verb/pay@v1"},
		"measure":[{"name":"temp","assert":"temp > 20"}],
		"consequence":[{"if":"PASS","then":[{"name":"arky:verb/evil@v1","args":{}}]}]
	}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	dec := arky.EvaluateKernel(v, nil, "2025-10-15T12:00:00Z")
	if dec.Status != arky.StatusRejected {
		t.Errorf("an unregistered verb must be REJECTED, got %v", dec.Status)
	}
	found := false
	for _, e := range dec.Errors {
		if e == "kernel.unknown_verb" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected kernel.unknown_verb, got %v", dec.Errors)
	}
}

func TestKernelRejectsMalformedCommitment(t *testing.T) {
	v, err := arky.Parse(`{"scope":"s"}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	dec := arky.EvaluateKernel(v, nil, "2025-10-15T12:00:00Z")
	if dec.Status != arky.StatusRejected {
		t.Errorf("a commitment without measure/consequence must be REJECTED, got %v", dec.Status)
	}
}
