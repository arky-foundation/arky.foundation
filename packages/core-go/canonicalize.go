// Package arky is the reference Go implementation of Arky TIM.
//
// A third independent stack covering JCS canonicalization (RFC 8785,
// hand-rolled including number formatting), content addressing (multihash
// sha2-256 with base58btc multibase), detached-payload Ed25519 JWS (RFC 7797),
// and TIM verification with did:key resolution. Built from the specs, it
// reproduces byte-identical canonical bytes, cids, and signatures to
// @arky/core (TypeScript) and arky-core (Rust) on the Foundation's vectors.
package arky

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
)

// Canonicalize serializes a parsed JSON Value to its JCS canonical string
// (RFC 8785), per ARKY-TIM-Canonicalization-v1.
//
// Hand-rolled by design: encoding/json is NOT JCS-compliant. It sorts object
// keys by UTF-8 byte order (JCS requires UTF-16 code units), escapes HTML
// characters by default, and formats numbers with Go's strconv rules rather
// than ECMAScript's Number::toString.
//
// Returns an error for non-finite numbers, which JCS forbids — a verifier must
// never panic on hostile input.
func Canonicalize(v Value) (string, error) {
	var sb strings.Builder
	if err := writeValue(v, &sb); err != nil {
		return "", err
	}
	return sb.String(), nil
}

func writeValue(v Value, sb *strings.Builder) error {
	switch t := v.(type) {
	case nil:
		sb.WriteString("null")
	case bool:
		if t {
			sb.WriteString("true")
		} else {
			sb.WriteString("false")
		}
	case Number:
		s, err := t.canonical()
		if err != nil {
			return err
		}
		sb.WriteString(s)
	case string:
		writeString(t, sb)
	case []Value:
		sb.WriteByte('[')
		for i, e := range t {
			if i > 0 {
				sb.WriteByte(',')
			}
			if err := writeValue(e, sb); err != nil {
				return err
			}
		}
		sb.WriteByte(']')
	case *Object:
		keys := make([]string, 0, len(t.keys))
		keys = append(keys, t.keys...)
		// Sort by UTF-16 code units (RFC 8785 section 3.2.3), NOT Go's default
		// UTF-8 byte order — the two diverge for non-BMP code points.
		sort.SliceStable(keys, func(i, j int) bool {
			return cmpUTF16(keys[i], keys[j]) < 0
		})
		sb.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				sb.WriteByte(',')
			}
			writeString(k, sb)
			sb.WriteByte(':')
			val, _ := t.Get(k)
			if err := writeValue(val, sb); err != nil {
				return err
			}
		}
		sb.WriteByte('}')
	default:
		return fmt.Errorf("jcs: unsupported value type %T", v)
	}
	return nil
}

// cmpUTF16 compares two strings by their UTF-16 code units. Go strings sort by
// UTF-8 bytes natively, which orders non-BMP code points differently from
// UTF-16: a surrogate pair (0xD800..0xDFFF) sorts below U+E000..U+FFFF in
// UTF-16 but above it in UTF-8.
func cmpUTF16(a, b string) int {
	ua := utf16.Encode([]rune(a))
	ub := utf16.Encode([]rune(b))
	for i := 0; i < len(ua) && i < len(ub); i++ {
		if ua[i] != ub[i] {
			if ua[i] < ub[i] {
				return -1
			}
			return 1
		}
	}
	switch {
	case len(ua) < len(ub):
		return -1
	case len(ua) > len(ub):
		return 1
	}
	return 0
}

// writeString emits the RFC 8785 section 3.2.2.2 string production (the
// minimal JSON escape set). Note this deliberately does NOT escape <, >, or &
// the way encoding/json does by default.
func writeString(s string, sb *strings.Builder) {
	sb.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			sb.WriteString(`\"`)
		case '\\':
			sb.WriteString(`\\`)
		case '\b':
			sb.WriteString(`\b`)
		case '\f':
			sb.WriteString(`\f`)
		case '\n':
			sb.WriteString(`\n`)
		case '\r':
			sb.WriteString(`\r`)
		case '\t':
			sb.WriteString(`\t`)
		default:
			if r < 0x20 {
				sb.WriteString(fmt.Sprintf(`\u%04x`, r))
			} else {
				sb.WriteRune(r)
			}
		}
	}
	sb.WriteByte('"')
}

// canonical renders a JSON number in RFC 8785 form.
//
// CRITICAL: every JSON number is treated as an IEEE-754 double, so e.g.
// 9007199254740993 becomes 9007199254740992 (matching V8). The number's
// original lexical form is preserved through parsing precisely so this
// conversion happens exactly once, here, and rounds the same way V8 does.
func (n Number) canonical() (string, error) {
	f, err := strconv.ParseFloat(string(n), 64)
	if err != nil {
		return "", fmt.Errorf("jcs: malformed number %q: %w", string(n), err)
	}
	return ecmascriptNumberToString(f)
}

// ecmascriptNumberToString implements ECMAScript Number::toString
// (ECMA-262 section 6.1.6.1.20), which RFC 8785 designates as the reference
// number format. Equivalent to V8's String(n).
//
// Go's strconv.FormatFloat(f, 'g', -1, 64) gives the same shortest round-trip
// digits but different framing rules (it switches to exponent form at
// different thresholds and writes "e+07" style exponents), so the digits are
// extracted and re-assembled under ECMAScript's rules.
func ecmascriptNumberToString(f float64) (string, error) {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return "", errNonFinite
	}
	if f == 0 {
		return "0", nil // also normalizes -0
	}
	sign := ""
	if f < 0 {
		sign = "-"
		f = -f
	}

	// 'e' format yields the shortest round-trip as "d.ddde±dd".
	sci := strconv.FormatFloat(f, 'e', -1, 64)
	mantissa, expStr, _ := strings.Cut(sci, "e")
	exp, err := strconv.Atoi(expStr)
	if err != nil {
		return "", fmt.Errorf("jcs: bad exponent in %q: %w", sci, err)
	}

	digits := strings.Replace(mantissa, ".", "", 1)
	k := len(digits) // significant digits
	n := exp + 1     // ECMAScript's n: decimal point position among the digits

	var body string
	switch {
	case n >= 1 && n <= 21:
		if k <= n {
			body = digits + strings.Repeat("0", n-k)
		} else {
			body = digits[:n] + "." + digits[n:]
		}
	case n >= -5 && n <= 0:
		body = "0." + strings.Repeat("0", -n) + digits
	default:
		// Exponent form: d[.ddd]e{+|-}exp, exponent = n-1, no leading zeros.
		e := n - 1
		mant := digits
		if k > 1 {
			mant = digits[:1] + "." + digits[1:]
		}
		esign := "+"
		if e < 0 {
			esign = "-"
			e = -e
		}
		body = mant + "e" + esign + strconv.Itoa(e)
	}
	return sign + body, nil
}
