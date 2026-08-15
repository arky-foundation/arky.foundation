package arky

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// TriState is the Kleene tri-valued assertion result (ARKY-KERNEL-v1 section 4).
type TriState int

const (
	Indeterminate TriState = iota
	Pass
	Fail
)

func (t TriState) String() string {
	switch t {
	case Pass:
		return "PASS"
	case Fail:
		return "FAIL"
	default:
		return "INDETERMINATE"
	}
}

// SymKind discriminates a bound symbol's type.
type SymKind int

const (
	SymNum SymKind = iota
	SymStr
	SymBool
)

// SymVal is a symbol value bound from a TIM measurement.value.
type SymVal struct {
	Kind SymKind
	Num  float64
	Str  string
	Bool bool
}

// NumVal, StrVal and BoolVal construct bound symbol values.
func NumVal(f float64) SymVal { return SymVal{Kind: SymNum, Num: f} }
func StrVal(s string) SymVal  { return SymVal{Kind: SymStr, Str: s} }
func BoolVal(b bool) SymVal   { return SymVal{Kind: SymBool, Bool: b} }

// Symbols maps a symbol name to its bound value; an absent name yields
// INDETERMINATE rather than a failure, which is what keeps "no evidence" from
// ever reading as "assertion failed".
type Symbols map[string]SymVal

// EvalResult is the outcome of evaluating an assertion expression.
type EvalResult struct {
	Result TriState
	Error  string
}

// --- tokens ---

type tokKind int

const (
	tkNum tokKind = iota
	tkStr
	tkBool
	tkSym
	tkOp
	tkLParen
	tkRParen
	tkLBrack
	tkRBrack
	tkComma
	tkAnd
	tkOr
	tkNot
	tkIn
)

type token struct {
	kind tokKind
	num  float64
	str  string
	bool bool
}

// valuePos reports whether the next '-' would start a numeric literal: only at
// the start of the expression or after an operator, '(', '[', ',', or a
// logical/in keyword. Elsewhere '-' is not valid (there is no arithmetic).
func valuePos(toks []token) bool {
	if len(toks) == 0 {
		return true
	}
	switch toks[len(toks)-1].kind {
	case tkOp, tkLParen, tkLBrack, tkComma, tkAnd, tkOr, tkNot, tkIn:
		return true
	}
	return false
}

func tokenize(src string) ([]token, error) {
	chars := []rune(src)
	var toks []token
	for i := 0; i < len(chars); {
		c := chars[i]
		switch {
		case c == ' ' || c == '\t':
			i++
		case c == '(':
			toks = append(toks, token{kind: tkLParen})
			i++
		case c == ')':
			toks = append(toks, token{kind: tkRParen})
			i++
		case c == '[':
			toks = append(toks, token{kind: tkLBrack})
			i++
		case c == ']':
			toks = append(toks, token{kind: tkRBrack})
			i++
		case c == ',':
			toks = append(toks, token{kind: tkComma})
			i++
		case c == '&' && i+1 < len(chars) && chars[i+1] == '&':
			toks = append(toks, token{kind: tkAnd})
			i += 2
		case c == '|' && i+1 < len(chars) && chars[i+1] == '|':
			toks = append(toks, token{kind: tkOr})
			i += 2
		case c == '!' && !(i+1 < len(chars) && chars[i+1] == '='):
			toks = append(toks, token{kind: tkNot})
			i++
		case c == '"':
			j := i + 1
			var sb strings.Builder
			for j < len(chars) && chars[j] != '"' {
				sb.WriteRune(chars[j])
				j++
			}
			if j >= len(chars) {
				return nil, errors.New("unterminated string")
			}
			toks = append(toks, token{kind: tkStr, str: sb.String()})
			i = j + 1
		case c == '<' || c == '>' || c == '=' || c == '!':
			if i+1 < len(chars) && chars[i+1] == '=' {
				toks = append(toks, token{kind: tkOp, str: string(c) + "="})
				i += 2
			} else if c == '<' || c == '>' {
				toks = append(toks, token{kind: tkOp, str: string(c)})
				i++
			} else {
				return nil, fmt.Errorf("bad operator at '%c'", c)
			}
		case (c >= '0' && c <= '9') ||
			(c == '-' && i+1 < len(chars) &&
				((chars[i+1] >= '0' && chars[i+1] <= '9') || chars[i+1] == '.') &&
				valuePos(toks)):
			j := i
			var sb strings.Builder
			if chars[j] == '-' {
				sb.WriteRune('-')
				j++
			}
			for j < len(chars) && ((chars[j] >= '0' && chars[j] <= '9') || chars[j] == '.') {
				sb.WriteRune(chars[j])
				j++
			}
			f, err := strconv.ParseFloat(sb.String(), 64)
			if err != nil {
				return nil, errors.New("bad number")
			}
			toks = append(toks, token{kind: tkNum, num: f})
			i = j
		case c == '_' || (c >= 'a' && c <= 'z'):
			j := i
			var sb strings.Builder
			for j < len(chars) && (chars[j] == '_' || (chars[j] >= 'a' && chars[j] <= 'z') ||
				(chars[j] >= '0' && chars[j] <= '9')) {
				sb.WriteRune(chars[j])
				j++
			}
			switch s := sb.String(); s {
			case "true":
				toks = append(toks, token{kind: tkBool, bool: true})
			case "false":
				toks = append(toks, token{kind: tkBool, bool: false})
			case "in":
				toks = append(toks, token{kind: tkIn})
			default:
				toks = append(toks, token{kind: tkSym, str: s})
			}
			i = j
		default:
			return nil, fmt.Errorf("unexpected character '%c'", c)
		}
	}
	return toks, nil
}

// --- AST ---

type litKind int

const (
	litNum litKind = iota
	litStr
	litBool
)

type lit struct {
	kind litKind
	num  float64
	str  string
	bool bool
}

type astKind int

const (
	astCmp astKind = iota
	astIn
	astAnd
	astOr
	astNot
	astSymRef
)

type ast struct {
	kind  astKind
	sym   string
	op    string
	val   lit
	vals  []lit
	left  *ast
	right *ast
}

type aparser struct {
	toks []token
	pos  int
}

func (p *aparser) peek() *token {
	if p.pos < len(p.toks) {
		return &p.toks[p.pos]
	}
	return nil
}

func (p *aparser) next() *token {
	t := p.peek()
	p.pos++
	return t
}

func (p *aparser) parse() (*ast, error) {
	e, err := p.parseOr()
	if err != nil {
		return nil, err
	}
	if p.pos != len(p.toks) {
		return nil, errors.New("trailing tokens")
	}
	return e, nil
}

func (p *aparser) parseOr() (*ast, error) {
	l, err := p.parseAnd()
	if err != nil {
		return nil, err
	}
	for t := p.peek(); t != nil && t.kind == tkOr; t = p.peek() {
		p.next()
		r, err := p.parseAnd()
		if err != nil {
			return nil, err
		}
		l = &ast{kind: astOr, left: l, right: r}
	}
	return l, nil
}

func (p *aparser) parseAnd() (*ast, error) {
	l, err := p.parseUnary()
	if err != nil {
		return nil, err
	}
	for t := p.peek(); t != nil && t.kind == tkAnd; t = p.peek() {
		p.next()
		r, err := p.parseUnary()
		if err != nil {
			return nil, err
		}
		l = &ast{kind: astAnd, left: l, right: r}
	}
	return l, nil
}

func (p *aparser) parseUnary() (*ast, error) {
	if t := p.peek(); t != nil && t.kind == tkNot {
		p.next()
		e, err := p.parseUnary()
		if err != nil {
			return nil, err
		}
		return &ast{kind: astNot, left: e}, nil
	}
	return p.parsePrimary()
}

func (p *aparser) parsePrimary() (*ast, error) {
	t := p.peek()
	if t == nil {
		return nil, errors.New("expected symbol or (")
	}
	switch t.kind {
	case tkLParen:
		p.next()
		e, err := p.parseOr()
		if err != nil {
			return nil, err
		}
		if c := p.next(); c == nil || c.kind != tkRParen {
			return nil, errors.New("expected )")
		}
		return e, nil
	case tkSym:
		name := t.str
		p.next()
		nt := p.peek()
		if nt == nil {
			return &ast{kind: astSymRef, sym: name}, nil
		}
		switch nt.kind {
		case tkOp:
			op := nt.str
			p.next()
			l, err := p.parseLit()
			if err != nil {
				return nil, err
			}
			return &ast{kind: astCmp, sym: name, op: op, val: l}, nil
		case tkIn:
			p.next()
			if c := p.next(); c == nil || c.kind != tkLBrack {
				return nil, errors.New("expected [")
			}
			first, err := p.parseLit()
			if err != nil {
				return nil, err
			}
			vals := []lit{first}
			for c := p.peek(); c != nil && c.kind == tkComma; c = p.peek() {
				p.next()
				l, err := p.parseLit()
				if err != nil {
					return nil, err
				}
				vals = append(vals, l)
			}
			if c := p.next(); c == nil || c.kind != tkRBrack {
				return nil, errors.New("expected ]")
			}
			return &ast{kind: astIn, sym: name, vals: vals}, nil
		default:
			return &ast{kind: astSymRef, sym: name}, nil
		}
	default:
		return nil, errors.New("expected symbol or (")
	}
}

func (p *aparser) parseLit() (lit, error) {
	t := p.next()
	if t == nil {
		return lit{}, errors.New("expected literal")
	}
	switch t.kind {
	case tkNum:
		return lit{kind: litNum, num: t.num}, nil
	case tkStr:
		return lit{kind: litStr, str: t.str}, nil
	case tkBool:
		return lit{kind: litBool, bool: t.bool}, nil
	default:
		return lit{}, errors.New("expected literal")
	}
}

// --- Kleene logic ---

func and3(a, b TriState) TriState {
	if a == Fail || b == Fail {
		return Fail
	}
	if a == Pass && b == Pass {
		return Pass
	}
	return Indeterminate
}

func or3(a, b TriState) TriState {
	if a == Pass || b == Pass {
		return Pass
	}
	if a == Fail && b == Fail {
		return Fail
	}
	return Indeterminate
}

func not3(a TriState) TriState {
	switch a {
	case Pass:
		return Fail
	case Fail:
		return Pass
	default:
		return Indeterminate
	}
}

func tri(b bool) TriState {
	if b {
		return Pass
	}
	return Fail
}

func evalAst(a *ast, syms Symbols, errs *[]string) TriState {
	switch a.kind {
	case astAnd:
		return and3(evalAst(a.left, syms, errs), evalAst(a.right, syms, errs))
	case astOr:
		return or3(evalAst(a.left, syms, errs), evalAst(a.right, syms, errs))
	case astNot:
		return not3(evalAst(a.left, syms, errs))
	case astSymRef:
		v, ok := syms[a.sym]
		if !ok {
			*errs = append(*errs, "no matching receipts for symbol '"+a.sym+"'")
			return Indeterminate
		}
		if v.Kind != SymBool {
			*errs = append(*errs, "symbol '"+a.sym+"' is not boolean")
			return Indeterminate
		}
		return tri(v.Bool)
	case astIn:
		v, ok := syms[a.sym]
		if !ok {
			*errs = append(*errs, "no matching receipts for symbol '"+a.sym+"'")
			return Indeterminate
		}
		for _, l := range a.vals {
			if litEq(l, v) {
				return Pass
			}
		}
		return Fail
	case astCmp:
		v, ok := syms[a.sym]
		if !ok {
			*errs = append(*errs, "no matching receipts for symbol '"+a.sym+"'")
			return Indeterminate
		}
		return evalCmp(v, a.op, a.val, errs)
	}
	return Indeterminate
}

func litEq(l lit, v SymVal) bool {
	switch {
	case l.kind == litNum && v.Kind == SymNum:
		return l.num == v.Num
	case l.kind == litStr && v.Kind == SymStr:
		return l.str == v.Str
	case l.kind == litBool && v.Kind == SymBool:
		return l.bool == v.Bool
	}
	return false
}

// evalCmp applies the section 4.1 type-compatibility rules before comparing:
// mismatched types yield INDETERMINATE (not FAIL), so a type error can never be
// mistaken for a failed measurement.
func evalCmp(v SymVal, op string, l lit, errs *[]string) TriState {
	switch {
	case v.Kind == SymNum && l.kind == litStr:
		*errs = append(*errs, "type mismatch: numeric symbol compared to string literal")
		return Indeterminate
	case v.Kind == SymNum && l.kind == litBool:
		*errs = append(*errs, "type mismatch: numeric symbol compared to boolean literal")
		return Indeterminate
	case v.Kind == SymStr && l.kind != litStr && op != "==" && op != "!=":
		*errs = append(*errs, "type mismatch: string symbol compared to non-string literal")
		return Indeterminate
	}
	return tri(compare(v, op, l))
}

// compare returns the ordering result for op. Type-incompatible pairs have no
// ordering: they compare false for every operator except !=, which is true.
func compare(v SymVal, op string, l lit) bool {
	var ord int
	ok := false
	switch {
	case v.Kind == SymNum && l.kind == litNum:
		ok = true
		switch {
		case v.Num < l.num:
			ord = -1
		case v.Num > l.num:
			ord = 1
		}
	case v.Kind == SymStr && l.kind == litStr:
		ok = true
		ord = strings.Compare(v.Str, l.str)
	case v.Kind == SymBool && l.kind == litBool:
		ok = true
		switch {
		case !v.Bool && l.bool:
			ord = -1
		case v.Bool && !l.bool:
			ord = 1
		}
	}
	switch op {
	case "==":
		return ok && ord == 0
	case "!=":
		return !(ok && ord == 0)
	case "<":
		return ok && ord < 0
	case "<=":
		return ok && ord <= 0
	case ">":
		return ok && ord > 0
	case ">=":
		return ok && ord >= 0
	}
	return false
}

// EvaluateAssertion parses and evaluates an assertion expression against bound
// symbols, returning a tri-state result. A parse error yields INDETERMINATE
// rather than an exception, so a malformed commitment cannot authorize anything.
func EvaluateAssertion(expr string, syms Symbols) EvalResult {
	toks, err := tokenize(expr)
	if err != nil {
		return EvalResult{Result: Indeterminate, Error: "parse error: " + err.Error()}
	}
	p := &aparser{toks: toks}
	tree, err := p.parse()
	if err != nil {
		return EvalResult{Result: Indeterminate, Error: "parse error: " + err.Error()}
	}
	var errs []string
	result := evalAst(tree, syms, &errs)
	out := EvalResult{Result: result}
	if result == Indeterminate && len(errs) > 0 {
		out.Error = errs[0]
	}
	return out
}
