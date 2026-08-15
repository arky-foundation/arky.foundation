package arky

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

var errNonFinite = errors.New("jcs: non-finite numbers are forbidden")

// Value is a parsed JSON value. The concrete types are:
//
//	nil        JSON null
//	bool       JSON true/false
//	Number     JSON number (lexical form preserved)
//	string     JSON string
//	[]Value    JSON array
//	*Object    JSON object (insertion order preserved)
//
// encoding/json's map[string]any is deliberately not used: it loses object key
// order (needed for the JWS protected header, which is signed verbatim) and
// coerces every number to float64 at parse time, which would discard the
// lexical form the RFC 8785 formatter needs to round correctly.
type Value any

// Number is a JSON number in its original lexical form (e.g. "1e21",
// "9007199254740993"). Conversion to float64 is deferred to canonicalization so
// it happens exactly once, matching V8's rounding.
type Number string

// Float parses the number as a float64.
func (n Number) Float() (float64, error) { return strconv.ParseFloat(string(n), 64) }

// Object is a JSON object preserving key insertion order.
type Object struct {
	keys []string
	vals map[string]Value
}

// NewObject returns an empty object.
func NewObject() *Object {
	return &Object{vals: map[string]Value{}}
}

// Set inserts or replaces a key, preserving first-insertion order.
func (o *Object) Set(k string, v Value) {
	if o.vals == nil {
		o.vals = map[string]Value{}
	}
	if _, seen := o.vals[k]; !seen {
		o.keys = append(o.keys, k)
	}
	o.vals[k] = v
}

// Get returns the value for k.
func (o *Object) Get(k string) (Value, bool) {
	if o == nil || o.vals == nil {
		return nil, false
	}
	v, ok := o.vals[k]
	return v, ok
}

// Delete removes a key.
func (o *Object) Delete(k string) {
	if o == nil || o.vals == nil {
		return
	}
	if _, ok := o.vals[k]; !ok {
		return
	}
	delete(o.vals, k)
	for i, key := range o.keys {
		if key == k {
			o.keys = append(o.keys[:i], o.keys[i+1:]...)
			break
		}
	}
}

// Keys returns the keys in insertion order.
func (o *Object) Keys() []string {
	if o == nil {
		return nil
	}
	out := make([]string, len(o.keys))
	copy(out, o.keys)
	return out
}

// Len returns the number of members.
func (o *Object) Len() int {
	if o == nil {
		return 0
	}
	return len(o.keys)
}

// Clone returns a deep copy, so callers can mutate without aliasing.
func (o *Object) Clone() *Object {
	if o == nil {
		return nil
	}
	c := NewObject()
	for _, k := range o.keys {
		c.Set(k, cloneValue(o.vals[k]))
	}
	return c
}

func cloneValue(v Value) Value {
	switch t := v.(type) {
	case *Object:
		return t.Clone()
	case []Value:
		out := make([]Value, len(t))
		for i, e := range t {
			out[i] = cloneValue(e)
		}
		return out
	default:
		return v
	}
}

// Path walks nested objects, returning the value at the given key path.
func Path(v Value, keys ...string) (Value, bool) {
	cur := v
	for _, k := range keys {
		obj, ok := cur.(*Object)
		if !ok {
			return nil, false
		}
		cur, ok = obj.Get(k)
		if !ok {
			return nil, false
		}
	}
	return cur, true
}

// Str returns the string at the given path, or "" if absent or not a string.
func Str(v Value, keys ...string) string {
	got, ok := Path(v, keys...)
	if !ok {
		return ""
	}
	s, _ := got.(string)
	return s
}

// Parse parses JSON into a Value, preserving number lexical form and object key
// order. Duplicate object member names are permitted (last wins), mirroring
// encoding/json, JSON.parse, and serde_json. Use ParseStrict to reject them.
func Parse(data string) (Value, error) { return parse(data, false) }

// ParseStrict parses JSON and rejects any object with a duplicate member name
// at any depth, per ARKY-TIM-Canonicalization-v1 section 3. Use it for
// untrusted JSON before canonicalizing or verifying: the default libraries in
// every language silently keep the last duplicate, so two parties can disagree
// about what a document says while both accepting it.
func ParseStrict(data string) (Value, error) { return parse(data, true) }

func parse(data string, strict bool) (Value, error) {
	p := &parser{s: data, strict: strict}
	p.ws()
	v, err := p.value()
	if err != nil {
		return nil, err
	}
	p.ws()
	if p.i != len(p.s) {
		return nil, fmt.Errorf("json: trailing characters at position %d", p.i)
	}
	return v, nil
}

type parser struct {
	s      string
	i      int
	strict bool
}

func (p *parser) ws() {
	for p.i < len(p.s) {
		switch p.s[p.i] {
		case ' ', '\t', '\n', '\r':
			p.i++
		default:
			return
		}
	}
}

func (p *parser) value() (Value, error) {
	if p.i >= len(p.s) {
		return nil, errors.New("json: unexpected end of input")
	}
	switch c := p.s[p.i]; {
	case c == '{':
		return p.object()
	case c == '[':
		return p.array()
	case c == '"':
		return p.str()
	case c == 't':
		return p.lit("true", true)
	case c == 'f':
		return p.lit("false", false)
	case c == 'n':
		return p.lit("null", nil)
	case c == '-' || (c >= '0' && c <= '9'):
		return p.number()
	default:
		return nil, fmt.Errorf("json: unexpected character %q at position %d", c, p.i)
	}
}

func (p *parser) lit(word string, v Value) (Value, error) {
	if !strings.HasPrefix(p.s[p.i:], word) {
		return nil, fmt.Errorf("json: invalid literal at position %d", p.i)
	}
	p.i += len(word)
	return v, nil
}

func (p *parser) object() (Value, error) {
	p.i++ // '{'
	obj := NewObject()
	seen := map[string]bool{}
	p.ws()
	if p.i < len(p.s) && p.s[p.i] == '}' {
		p.i++
		return obj, nil
	}
	for {
		p.ws()
		if p.i >= len(p.s) || p.s[p.i] != '"' {
			return nil, fmt.Errorf("json: expected object key at position %d", p.i)
		}
		k, err := p.str()
		if err != nil {
			return nil, err
		}
		key := k.(string)
		if p.strict && seen[key] {
			return nil, fmt.Errorf("json: duplicate object member name %q", key)
		}
		seen[key] = true
		p.ws()
		if p.i >= len(p.s) || p.s[p.i] != ':' {
			return nil, fmt.Errorf("json: expected ':' at position %d", p.i)
		}
		p.i++
		p.ws()
		v, err := p.value()
		if err != nil {
			return nil, err
		}
		obj.Set(key, v)
		p.ws()
		if p.i >= len(p.s) {
			return nil, errors.New("json: unterminated object")
		}
		switch p.s[p.i] {
		case ',':
			p.i++
		case '}':
			p.i++
			return obj, nil
		default:
			return nil, fmt.Errorf("json: expected ',' or '}' at position %d", p.i)
		}
	}
}

func (p *parser) array() (Value, error) {
	p.i++ // '['
	arr := []Value{}
	p.ws()
	if p.i < len(p.s) && p.s[p.i] == ']' {
		p.i++
		return arr, nil
	}
	for {
		p.ws()
		v, err := p.value()
		if err != nil {
			return nil, err
		}
		arr = append(arr, v)
		p.ws()
		if p.i >= len(p.s) {
			return nil, errors.New("json: unterminated array")
		}
		switch p.s[p.i] {
		case ',':
			p.i++
		case ']':
			p.i++
			return arr, nil
		default:
			return nil, fmt.Errorf("json: expected ',' or ']' at position %d", p.i)
		}
	}
}

func (p *parser) str() (Value, error) {
	p.i++ // opening quote
	var sb strings.Builder
	for p.i < len(p.s) {
		c := p.s[p.i]
		switch {
		case c == '"':
			p.i++
			return sb.String(), nil
		case c == '\\':
			p.i++
			if p.i >= len(p.s) {
				return nil, errors.New("json: unterminated escape")
			}
			switch p.s[p.i] {
			case '"':
				sb.WriteByte('"')
			case '\\':
				sb.WriteByte('\\')
			case '/':
				sb.WriteByte('/')
			case 'b':
				sb.WriteByte('\b')
			case 'f':
				sb.WriteByte('\f')
			case 'n':
				sb.WriteByte('\n')
			case 'r':
				sb.WriteByte('\r')
			case 't':
				sb.WriteByte('\t')
			case 'u':
				r, err := p.unicodeEscape()
				if err != nil {
					return nil, err
				}
				sb.WriteRune(r)
				continue
			default:
				return nil, fmt.Errorf("json: invalid escape %q", p.s[p.i])
			}
			p.i++
		case c < 0x20:
			return nil, fmt.Errorf("json: unescaped control character at position %d", p.i)
		default:
			r, size := utf8.DecodeRuneInString(p.s[p.i:])
			sb.WriteRune(r)
			p.i += size
		}
	}
	return nil, errors.New("json: unterminated string")
}

// unicodeEscape decodes \uXXXX at p.i (pointing at 'u'), combining surrogate
// pairs. p.i is left just past the consumed escape(s).
func (p *parser) unicodeEscape() (rune, error) {
	hex := func() (rune, error) {
		if p.i+5 > len(p.s) {
			return 0, errors.New("json: truncated \\u escape")
		}
		n, err := strconv.ParseUint(p.s[p.i+1:p.i+5], 16, 32)
		if err != nil {
			return 0, fmt.Errorf("json: invalid \\u escape: %w", err)
		}
		p.i += 5
		return rune(n), nil
	}
	r, err := hex()
	if err != nil {
		return 0, err
	}
	if utf16.IsSurrogate(r) && p.i+1 < len(p.s) && p.s[p.i] == '\\' && p.s[p.i+1] == 'u' {
		p.i++ // the backslash; hex() expects to sit on 'u'
		r2, err := hex()
		if err != nil {
			return 0, err
		}
		if combined := utf16.DecodeRune(r, r2); combined != utf8.RuneError {
			return combined, nil
		}
		// Not a valid pair: emit the replacement char for the lead and rewind
		// so the trail is handled on its own.
		p.i -= 6
		return utf8.RuneError, nil
	}
	if utf16.IsSurrogate(r) {
		return utf8.RuneError, nil
	}
	return r, nil
}

func (p *parser) number() (Value, error) {
	start := p.i
	if p.i < len(p.s) && p.s[p.i] == '-' {
		p.i++
	}
	for p.i < len(p.s) && p.s[p.i] >= '0' && p.s[p.i] <= '9' {
		p.i++
	}
	if p.i < len(p.s) && p.s[p.i] == '.' {
		p.i++
		for p.i < len(p.s) && p.s[p.i] >= '0' && p.s[p.i] <= '9' {
			p.i++
		}
	}
	if p.i < len(p.s) && (p.s[p.i] == 'e' || p.s[p.i] == 'E') {
		p.i++
		if p.i < len(p.s) && (p.s[p.i] == '+' || p.s[p.i] == '-') {
			p.i++
		}
		for p.i < len(p.s) && p.s[p.i] >= '0' && p.s[p.i] <= '9' {
			p.i++
		}
	}
	lit := p.s[start:p.i]
	if _, err := strconv.ParseFloat(lit, 64); err != nil {
		return nil, fmt.Errorf("json: invalid number %q", lit)
	}
	return Number(lit), nil
}
