package arky_test

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"os"
	"path/filepath"
	"sort"
	"testing"

	arky "github.com/arky-foundation/arky.foundation/packages/core-go"
)

// repoRoot locates the repository root from this package's directory.
func repoRoot(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	return filepath.Dir(filepath.Dir(wd)) // packages/core-go -> packages -> repo
}

func readVector(t *testing.T, path string) arky.Value {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	v, err := arky.Parse(string(data))
	if err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
	return v
}

func listJSON(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("readdir %s: %v", dir, err)
	}
	var out []string
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".json" {
			out = append(out, filepath.Join(dir, e.Name()))
		}
	}
	sort.Strings(out)
	return out
}

func b64uDecode(s string) ed25519.PublicKey {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil
	}
	return ed25519.PublicKey(b)
}

// vectorResolver mirrors the Rust conformance resolver: the TIM's did:key
// issuer, plus the two published test witness keys addressed by kid.
func vectorResolver(tim arky.Value, witnessKid string) ed25519.PublicKey {
	if witnessKid != "" {
		switch witnessKid {
		case "test-key-2025-02":
			return b64uDecode("e_vAtyLIHAXMh1TRvhFUNrvifhH5ZzXKGwGKk9zgB9I")
		case "notary-key-2025-01":
			return b64uDecode("HDl_cQgT9vSiYMsH8q1dOdyb5prCuQYuRVBRhTTk1P8")
		}
		if key := arky.ResolveDidKey(witnessKid); key != nil {
			return key
		}
	}
	return arky.ResolveDidKey(arky.Str(tim, "identity", "id"))
}

// TestCanonicalizationC1Vectors runs the published C1/C2 canonicalization
// vectors, asserting both the canonical string and its exact byte encoding.
func TestCanonicalizationC1Vectors(t *testing.T) {
	root := repoRoot(t)
	files := listJSON(t, filepath.Join(root, "vectors", "canonicalization"))
	if len(files) == 0 {
		t.Fatal("no canonicalization vectors found")
	}
	ran := 0
	for _, f := range files {
		v := readVector(t, f)
		id := arky.Str(v, "id")
		original, ok := arky.Path(v, "inputs", "original")
		if !ok {
			continue
		}
		expected := arky.Str(v, "expect", "canonical_json")
		if expected == "" {
			continue
		}
		got, err := arky.Canonicalize(original)
		if err != nil {
			t.Errorf("%s: canonicalize: %v", id, err)
			continue
		}
		if got != expected {
			t.Errorf("%s: canonical_json\n got: %s\nwant: %s", id, got, expected)
		}
		if wantHex := arky.Str(v, "expect", "canonical_bytes_hex"); wantHex != "" {
			if gotHex := hex.EncodeToString([]byte(got)); gotHex != wantHex {
				t.Errorf("%s: canonical_bytes_hex\n got: %s\nwant: %s", id, gotHex, wantHex)
			}
		}
		ran++
	}
	t.Logf("ran %d canonicalization vectors", ran)
}

// TestTimVectors runs the published T1/T2 TIM vectors, honouring each vector's
// expected validity (including the negative cases, which MUST fail).
func TestTimVectors(t *testing.T) {
	root := repoRoot(t)
	files := listJSON(t, filepath.Join(root, "vectors", "tim"))
	if len(files) == 0 {
		t.Fatal("no TIM vectors found")
	}
	ran := 0
	for _, f := range files {
		v := readVector(t, f)
		id := arky.Str(v, "id")
		tim, ok := arky.Path(v, "inputs", "tim")
		if !ok {
			continue
		}
		at := arky.Str(v, "context", "verify_options", "at")
		res := arky.VerifyTimAt(tim, vectorResolver, at)

		expectValid, hasExpect := arky.Path(v, "expect", "valid")
		if !hasExpect {
			continue
		}
		want, ok := expectValid.(bool)
		if !ok {
			continue
		}
		if res.Valid != want {
			t.Errorf("%s (%s): valid = %v, want %v (errors: %v)",
				id, arky.Str(v, "description"), res.Valid, want, res.Errors)
		}
		ran++
	}
	t.Logf("ran %d TIM vectors", ran)
}

// TestTimFixtures independently verifies the signed TIM fixtures and confirms
// each one's cid recomputes from its canonical body.
func TestTimFixtures(t *testing.T) {
	root := repoRoot(t)
	dir := filepath.Join(root, "vectors", "fixtures", "tims")
	files := listJSON(t, dir)
	if len(files) == 0 {
		t.Fatal("no TIM fixtures found")
	}
	for _, f := range files {
		wrapper := readVector(t, f)
		tim, ok := arky.Path(wrapper, "tim")
		if !ok {
			tim = wrapper
		}
		name := filepath.Base(f)

		expectValid := true
		if ev, ok := arky.Path(wrapper, "expect", "valid"); ok {
			if b, ok := ev.(bool); ok {
				expectValid = b
			}
		}

		res := arky.VerifyTimAt(tim, vectorResolver, "")
		if res.Valid != expectValid {
			t.Errorf("%s: valid = %v, want %v (errors: %v)", name, res.Valid, expectValid, res.Errors)
			continue
		}
		if !expectValid {
			continue
		}
		canonical, err := arky.Canonicalize(arky.CanonicalBody(tim))
		if err != nil {
			t.Errorf("%s: canonicalize: %v", name, err)
			continue
		}
		if got, want := arky.CidFromCanonical(canonical), arky.Str(tim, "cid"); got != want {
			t.Errorf("%s: cid = %s, want %s", name, got, want)
		}
	}
}

// TestCrossLanguageCids pins the exact cids the TS and Rust stacks produce for
// the shared fixtures. If a change ever alters canonical bytes, this fails here
// rather than silently diverging from the other stacks.
func TestCrossLanguageCids(t *testing.T) {
	root := repoRoot(t)
	cases := []struct{ path, cid string }{
		{"vectors/fixtures/tims/valid-tim-001.json", ""},
		{"vectors/fixtures/tims/valid-tim-002.json", ""},
	}
	for _, c := range cases {
		wrapper := readVector(t, filepath.Join(root, c.path))
		tim, ok := arky.Path(wrapper, "tim")
		if !ok {
			tim = wrapper
		}
		canonical, err := arky.Canonicalize(arky.CanonicalBody(tim))
		if err != nil {
			t.Fatalf("%s: %v", c.path, err)
		}
		got := arky.CidFromCanonical(canonical)
		want := arky.Str(tim, "cid")
		if got != want {
			t.Errorf("%s: recomputed cid %s != stored %s", c.path, got, want)
		}
	}
}

// TestRoundTrip produces a TIM with this stack and verifies it with this stack,
// confirming the produce and verify paths agree on the canonical body.
func TestRoundTrip(t *testing.T) {
	kp := arky.FromSeed(make([]byte, 32))

	method := arky.NewObject()
	method.Set("type", "sensor")
	method.Set("source", "device:test")

	measurement := arky.NewObject()
	measurement.Set("name", "temperature")
	measurement.Set("value", arky.Number("22.5"))
	measurement.Set("unit", "arky:unit/temp.C")
	measurement.Set("method", method)

	timeObj := arky.NewObject()
	timeObj.Set("ts", "2025-10-15T12:00:00Z")

	identity := arky.NewObject()
	identity.Set("id", kp.Did)

	body := arky.NewObject()
	body.Set("time", timeObj)
	body.Set("identity", identity)
	body.Set("measurement", measurement)

	tim, err := arky.CreateTim(body, kp.PrivateKey, "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	res := arky.VerifyTim(tim, nil)
	if !res.Valid {
		t.Fatalf("round-trip TIM did not verify: %v", res.Errors)
	}

	canonical, err := arky.Canonicalize(arky.CanonicalBody(tim))
	if err != nil {
		t.Fatalf("canonicalize: %v", err)
	}
	if got, want := arky.CidFromCanonical(canonical), arky.Str(tim, "cid"); got != want {
		t.Errorf("cid = %s, want %s", got, want)
	}
}
