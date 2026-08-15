package arky_test

import (
	"os"
	"path/filepath"
	"testing"

	arky "github.com/arky-foundation/arky.foundation/packages/core-go"
)

func TestAssertionLanguage(t *testing.T) {
	syms := arky.Symbols{
		"temp": arky.NumVal(22.5),
		"mode": arky.StrVal("auto"),
		"flag": arky.BoolVal(true),
	}
	cases := []struct {
		expr string
		want arky.TriState
	}{
		{"temp > 20", arky.Pass},
		{"temp > 30", arky.Fail},
		{"temp > 20 && temp < 25", arky.Pass},
		{"temp > 20 && temp < 22", arky.Fail},
		{"temp > 30 || temp < 25", arky.Pass},
		{"!(temp > 30)", arky.Pass},
		{`mode in ["auto","manual"]`, arky.Pass},
		{`mode in ["manual"]`, arky.Fail},
		{"flag", arky.Pass},
		{"missing > 1", arky.Indeterminate},
		{`temp > "hot"`, arky.Indeterminate}, // type mismatch
		{"temp >= 22.5", arky.Pass},
		{"temp == 22.5", arky.Pass},
		{"temp != 22.5", arky.Fail},
		// Negative numeric literals are part of the grammar (section 4.1).
		{"temp > -5", arky.Pass},
		{"temp < -5", arky.Fail},
		{"temp == -22.5", arky.Fail},
		{`mode in ["auto",-1]`, arky.Pass},
	}
	for _, c := range cases {
		if got := arky.EvaluateAssertion(c.expr, syms).Result; got != c.want {
			t.Errorf("%q = %v, want %v", c.expr, got, c.want)
		}
	}
}

// TestAssertionParseErrorsAreIndeterminate confirms a malformed expression
// yields INDETERMINATE rather than panicking or accidentally passing — a
// commitment that cannot be parsed must never authorize anything.
func TestAssertionParseErrorsAreIndeterminate(t *testing.T) {
	for _, expr := range []string{"", "temp >", "temp @ 5", "(temp > 1", "temp > 1)", "&&"} {
		res := arky.EvaluateAssertion(expr, arky.Symbols{"temp": arky.NumVal(1)})
		if res.Result != arky.Indeterminate {
			t.Errorf("%q = %v, want INDETERMINATE", expr, res.Result)
		}
	}
}

func TestParseISODuration(t *testing.T) {
	cases := []struct {
		in   string
		want int64
	}{
		{"PT5M", 300_000},
		{"PT1H", 3_600_000},
		{"P2D", 172_800_000},
	}
	for _, c := range cases {
		got, ok := arky.ParseISODurationMs(c.in)
		if !ok || got != c.want {
			t.Errorf("ParseISODurationMs(%q) = %d,%v want %d", c.in, got, ok, c.want)
		}
	}
}

// TestParseRFC3339 pins the Date.parse-compatible behaviour the Kernel window
// logic depends on, including offsets, fractional seconds, and the rejections.
func TestParseRFC3339(t *testing.T) {
	must := func(s string) int64 {
		t.Helper()
		v, ok := arky.ParseRFC3339Ms(s)
		if !ok {
			t.Fatalf("ParseRFC3339Ms(%q) failed", s)
		}
		return v
	}
	if got := must("2025-10-15T12:05:00Z") - must("2025-10-15T12:00:00Z"); got != 300_000 {
		t.Errorf("5 minute delta = %d", got)
	}
	// '+02:00' local is 2h behind UTC.
	if must("2025-10-15T12:00:00+02:00") != must("2025-10-15T10:00:00Z") {
		t.Error("+02:00 offset mismatch")
	}
	if must("2025-10-15T12:00:00-05:00") != must("2025-10-15T17:00:00Z") {
		t.Error("-05:00 offset mismatch")
	}
	if got := must("2025-10-15T12:00:00+02:00"); got != 1_760_522_400_000 {
		t.Errorf("absolute epoch = %d, want 1760522400000", got)
	}
	if must("2025-10-15T12:00:00.5Z") != must("2025-10-15T12:00:00Z")+500 {
		t.Error("fractional .5 mismatch")
	}
	if must("2025-10-15T12:00:00.123456Z") != must("2025-10-15T12:00:00Z")+123 {
		t.Error("fractional truncation mismatch")
	}
	if must("2025-10-15T12:00:00.5+02:00") != must("2025-10-15T10:00:00Z")+500 {
		t.Error("fractional + offset mismatch")
	}

	// Rejections: these all yield NaN from Date.parse, so they must fail here.
	for _, bad := range []string{
		"2025-10-15T12:00:00GARBAGE",
		"2025-10-15T12:00:00Z ",
		"2025-10-15T12:00:00Zextra",
		"2025-10-15T12:00:00+02:00extra",
		"2025-10-15T12:00:00+02:00 ",
		"2025-10-15T12:00:00.",
		"2025-10-15T12:00:00",
		"2025-10-15T12:00:00.5",
		"2025-10-15T12:00:00+2:00",
		"2025-10-15T12:00:00+99:00",
		"2025-10-15T12:00:00+02:99",
		"",
		"not-a-time",
	} {
		if _, ok := arky.ParseRFC3339Ms(bad); ok {
			t.Errorf("ParseRFC3339Ms(%q) should have failed", bad)
		}
	}
}

// TestKernelVectors runs the published K1/K2 vectors, comparing the decision
// status against each vector's expectation.
func TestKernelVectors(t *testing.T) {
	root := repoRoot(t)
	files := listJSON(t, filepath.Join(root, "vectors", "kernel"))
	if len(files) == 0 {
		t.Fatal("no kernel vectors found")
	}
	ran := 0
	for _, f := range files {
		v := readVector(t, f)
		id := arky.Str(v, "id")
		commitment, ok := arky.Path(v, "inputs", "commitment")
		if !ok {
			continue
		}

		var tims []arky.Value
		if tp := arky.Str(v, "context", "fixtures", "tim"); tp != "" {
			fixture := readVector(t, filepath.Join(root, "vectors", tp))
			if tim, ok := arky.Path(fixture, "tim"); ok {
				tims = append(tims, tim)
			}
		}
		if ev, ok := arky.Path(v, "context", "evidence"); ok {
			if arr, ok := ev.([]arky.Value); ok {
				tims = append(tims, arr...)
			}
		}

		evalTime := arky.Str(v, "context", "time")
		if evalTime == "" {
			evalTime = "2025-10-15T12:00:00Z"
		}
		dec := arky.EvaluateKernel(commitment, tims, evalTime)

		want := arky.Str(v, "expect", "decision", "status")
		if want == "" {
			continue
		}
		if got := dec.Status.String(); got != want {
			t.Errorf("%s (%s): decision.status = %s, want %s",
				id, arky.Str(v, "description"), got, want)
		}
		// Also pin the authorized verb list when the vector states one: a
		// decision that approves the wrong verb is as wrong as one that
		// approves when it should not.
		if av, ok := arky.Path(v, "expect", "decision", "authorized"); ok {
			if arr, ok := av.([]arky.Value); ok {
				var wantVerbs []string
				for _, a := range arr {
					if s, ok := a.(string); ok {
						wantVerbs = append(wantVerbs, s)
					}
				}
				if !equalStrings(dec.Authorized, wantVerbs) {
					t.Errorf("%s: authorized = %v, want %v", id, dec.Authorized, wantVerbs)
				}
			}
		}
		ran++
	}
	if ran == 0 {
		t.Fatal("no kernel vectors were actually evaluated")
	}
	t.Logf("ran %d kernel vectors", ran)
}

// TestSettlerVectors runs the published S1 vectors through Execute.
func TestSettlerVectors(t *testing.T) {
	root := repoRoot(t)
	dir := filepath.Join(root, "vectors", "settlers")
	if _, err := os.Stat(dir); err != nil {
		t.Skipf("no settlers vector directory: %v", err)
	}
	files := listJSON(t, dir)
	kp := arky.FromSeed(bytesRepeat(9, 32))
	ran := 0
	for _, f := range files {
		v := readVector(t, f)
		if arky.Str(v, "level") != "S1" {
			continue
		}
		id := arky.Str(v, "id")
		args, _ := arky.Path(v, "inputs", "params")
		ts := arky.Str(v, "context", "time")
		if ts == "" {
			ts = "2025-10-15T12:00:01Z"
		}
		store := arky.IdempotencyStore{}
		res := arky.Execute(arky.ExecRequest{
			Verb:           arky.Str(v, "inputs", "verb"),
			Rail:           arky.Str(v, "inputs", "rail"),
			Args:           args,
			IdempotencyKey: arky.Str(v, "inputs", "idempotency_key"),
		}, kp.PrivateKey, "test-settler", ts, "log:arky:transparency@v1", store)

		want := arky.Str(v, "expect", "status")
		if want == "" {
			continue
		}
		if got := res.Status.String(); got != want {
			t.Errorf("%s (%s): status = %s, want %s (errors %v)",
				id, arky.Str(v, "description"), got, want, res.Errors)
		}
		ran++
	}
	t.Logf("ran %d settler vectors", ran)
}

// TestIdempotency confirms section 6.1: the same key returns the identical
// cached receipt rather than executing twice, and derivation is deterministic.
func TestIdempotency(t *testing.T) {
	kp := arky.FromSeed(bytesRepeat(9, 32))
	amount := arky.NewObject()
	amount.Set("value", arky.Number("100"))
	amount.Set("unit", "USD")
	args := arky.NewObject()
	args.Set("to", "acct:x")
	args.Set("amount", amount)

	req := arky.ExecRequest{
		Verb:           "arky:verb/pay@v1",
		Rail:           "ach:us",
		Args:           args,
		IdempotencyKey: "idem-fixed-key",
	}
	store := arky.IdempotencyStore{}
	first := arky.Execute(req, kp.PrivateKey, "k", "2025-01-01T00:00:00Z", "log:x", store)
	second := arky.Execute(req, kp.PrivateKey, "k", "2025-01-01T00:00:00Z", "log:x", store)
	if first.Status != arky.ExecSuccess || second.Status != arky.ExecSuccess {
		t.Fatal("both executions should succeed")
	}
	if arky.Str(first.Receipt, "cid") != arky.Str(second.Receipt, "cid") {
		t.Error("idempotent replay produced a different receipt cid")
	}

	k1, err := arky.DeriveIdempotencyKey("cid1", "arky:verb/pay@v1", "ach:us", args, 0)
	if err != nil {
		t.Fatalf("derive: %v", err)
	}
	k2, _ := arky.DeriveIdempotencyKey("cid1", "arky:verb/pay@v1", "ach:us", args, 0)
	if k1 != k2 {
		t.Error("idempotency key derivation is not deterministic")
	}
	k3, _ := arky.DeriveIdempotencyKey("cid1", "arky:verb/pay@v1", "ach:us", args, 1)
	if k1 == k3 {
		t.Error("a different verb_index must derive a different key")
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func bytesRepeat(b byte, n int) []byte {
	out := make([]byte, n)
	for i := range out {
		out[i] = b
	}
	return out
}
