package arky_test

import (
	"testing"

	arky "github.com/arky-foundation/arky.foundation/packages/core-go"
)

func canon(t *testing.T, jsonText string) string {
	t.Helper()
	v, err := arky.Parse(jsonText)
	if err != nil {
		t.Fatalf("parse %s: %v", jsonText, err)
	}
	s, err := arky.Canonicalize(v)
	if err != nil {
		t.Fatalf("canonicalize %s: %v", jsonText, err)
	}
	return s
}

func TestKeyOrderingAndWhitespace(t *testing.T) {
	if got, want := canon(t, `{"zebra":1, "apple":2, "banana":3}`),
		`{"apple":2,"banana":3,"zebra":1}`; got != want {
		t.Errorf("got %s, want %s", got, want)
	}
}

// TestKeyOrderingIsUTF16 pins RFC 8785 section 3.2.3: keys sort by UTF-16 code
// units, not UTF-8 bytes. The two orderings disagree for non-BMP code points,
// which encode as surrogate pairs (0xD800..0xDFFF) and therefore sort BELOW
// U+E000..U+FFFF in UTF-16 but ABOVE them in UTF-8.
//
// The published vectors use only ASCII keys, where both orderings agree, so
// nothing else in the suite would catch a naive `keys[i] < keys[j]`. A stack
// that got this wrong would produce different canonical bytes, a different cid,
// and a signature the TS and Rust stacks reject.
func TestKeyOrderingIsUTF16NotUTF8(t *testing.T) {
	// U+1F600 GRINNING FACE (surrogate pair) vs U+FB00 LATIN SMALL LIGATURE FF.
	got := canon(t, `{"😀":1,"ﬀ":2}`)
	want := "{\"\U0001F600\":1,\"ﬀ\":2}"
	if got != want {
		t.Errorf("UTF-16 key ordering\n got: %s\nwant: %s", got, want)
	}
}

func TestNestedRecursiveSort(t *testing.T) {
	got := canon(t, `{"outer_z":{"inner_b":2,"inner_a":1},"outer_a":"x"}`)
	want := `{"outer_a":"x","outer_z":{"inner_a":1,"inner_b":2}}`
	if got != want {
		t.Errorf("got %s, want %s", got, want)
	}
}

// TestRFC8785Numbers pins the ECMAScript Number::toString forms that RFC 8785
// mandates. These MUST equal V8's String(n) so all three stacks agree
// byte-for-byte; they are where JCS implementations most often diverge.
func TestRFC8785Numbers(t *testing.T) {
	cases := []struct{ in, want string }{
		{`{"a":42,"b":-17,"c":0}`, `{"a":42,"b":-17,"c":0}`},
		{`-0.0`, `0`}, // -0 normalizes to 0
		{`22.5`, `22.5`},
		{`3.14159`, `3.14159`},
		{`1e21`, `1e+21`},
		{`1e20`, `100000000000000000000`},
		{`1e-7`, `1e-7`},
		{`1e-6`, `0.000001`},
		{`0.0000001`, `1e-7`},
		{`1.5e300`, `1.5e+300`},
		{`-1.5e-300`, `-1.5e-300`},
		// Above 2^53 the value collapses to the nearest double (matching V8),
		// rather than keeping the exact integer.
		{`9007199254740993`, `9007199254740992`},
		{`5e-324`, `5e-324`},
		{`1.7976931348623157e308`, `1.7976931348623157e+308`},
		{`0.1`, `0.1`},
		{`0.3`, `0.3`},
	}
	for _, c := range cases {
		if got := canon(t, c.in); got != c.want {
			t.Errorf("canonicalize(%s) = %s, want %s", c.in, got, c.want)
		}
	}
}

func TestControlCharEscapes(t *testing.T) {
	if got, want := canon(t, `"a\nb\tc"`), `"a\nb\tc"`; got != want {
		t.Errorf("got %s, want %s", got, want)
	}
	// U+0001 has no short escape and must be emitted in the \u form.
	if got, want := canon(t, `"\u0001"`), `"\u0001"`; got != want {
		t.Errorf("got %s, want %s", got, want)
	}
	// A raw (unescaped) control character is invalid JSON and must be rejected.
	if _, err := arky.Parse("\"a\x01b\""); err == nil {
		t.Error("expected a parse error for a raw control character")
	}
}

// TestNoHTMLEscaping guards against Go's encoding/json habit of escaping <, >
// and & as < etc. RFC 8785 uses the minimal escape set, so these
// characters must pass through literally.
func TestNoHTMLEscaping(t *testing.T) {
	if got, want := canon(t, `"<a> & </a>"`), `"<a> & </a>"`; got != want {
		t.Errorf("got %s, want %s", got, want)
	}
}

func TestUnicodePassthrough(t *testing.T) {
	if got, want := canon(t, `"éé"`), "\"éé\""; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

// TestNonFiniteRejected confirms canonicalization reports an error rather than
// panicking: JCS forbids NaN and Infinity, and a verifier must stay safe.
func TestNonFiniteRejected(t *testing.T) {
	// The JSON grammar has no NaN literal, so construct one directly.
	if _, err := arky.Canonicalize(arky.Number("NaN")); err == nil {
		t.Error("expected an error for NaN")
	}
	if _, err := arky.Canonicalize(arky.Number("1e999")); err == nil {
		t.Error("expected an error for an overflowing literal (Inf)")
	}
}

func TestParseStrictRejectsDuplicateKeys(t *testing.T) {
	if _, err := arky.ParseStrict(`{"a":1,"a":2}`); err == nil {
		t.Error("expected duplicate top-level key to be rejected")
	}
	if _, err := arky.ParseStrict(`{"o":{"b":1,"b":2}}`); err == nil {
		t.Error("expected duplicate nested key to be rejected")
	}
	if _, err := arky.ParseStrict(`{"a":1,"ab":2}`); err != nil {
		t.Errorf("distinct keys sharing a prefix must be allowed: %v", err)
	}
	if _, err := arky.ParseStrict(`{"a\"b":1,"a":2}`); err != nil {
		t.Errorf("escaped quotes in keys must parse: %v", err)
	}
	// The lenient parser keeps last-wins, mirroring JSON.parse/serde_json.
	v, err := arky.Parse(`{"a":1,"a":2}`)
	if err != nil {
		t.Fatalf("lenient parse: %v", err)
	}
	got, _ := arky.Path(v, "a")
	if got != arky.Number("2") {
		t.Errorf("lenient parse should keep the last duplicate, got %v", got)
	}
}

// TestNumberLexicalFormPreserved is why this package does not use
// encoding/json: coercing to float64 at parse time would lose the information
// the RFC 8785 formatter needs to round exactly as V8 does.
func TestNumberLexicalFormPreserved(t *testing.T) {
	v, err := arky.Parse(`{"n":9007199254740993}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	n, _ := arky.Path(v, "n")
	if n != arky.Number("9007199254740993") {
		t.Errorf("lexical form not preserved: got %v", n)
	}
}

func TestParseRejectsMalformed(t *testing.T) {
	for _, bad := range []string{
		``, `{`, `[1,`, `{"a"}`, `{"a":}`, `tru`, `{"a":1}x`, `"unterminated`,
		`{"a":01}x`, `[1 2]`,
	} {
		if _, err := arky.Parse(bad); err == nil {
			t.Errorf("expected a parse error for %q", bad)
		}
	}
}
