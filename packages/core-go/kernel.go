package arky

import (
	"sort"
	"strconv"
	"strings"
)

// RegisteredVerbs are the core verbs registered in ARKY-REGISTRIES-v1 (v1).
var RegisteredVerbs = []string{
	"arky:verb/pay@v1",
	"arky:verb/refund@v1",
	"arky:verb/slash@v1",
	"arky:verb/revoke@v1",
	"arky:verb/upgrade@v1",
	"arky:verb/signal@v1",
	"arky:verb/control@v1",
}

// IsRegisteredVerb reports whether a verb URN is in the v1 registry.
func IsRegisteredVerb(name string) bool {
	for _, v := range RegisteredVerbs {
		if v == name {
			return true
		}
	}
	return false
}

// DecisionStatus is the Kernel's verdict.
type DecisionStatus int

const (
	StatusIndeterminate DecisionStatus = iota
	StatusApproved
	StatusRejected
)

func (d DecisionStatus) String() string {
	switch d {
	case StatusApproved:
		return "APPROVED"
	case StatusRejected:
		return "REJECTED"
	default:
		return "INDETERMINATE"
	}
}

// AssertionResult records one MeasureSpec's evaluation.
type AssertionResult struct {
	Name       string
	Result     TriState
	InputValue *SymVal
	Unit       string
	Error      string
}

// Decision is the Kernel's output for a commitment.
type Decision struct {
	Status     DecisionStatus
	Assertions []AssertionResult
	Authorized []string // verb URNs
	Errors     []string
}

// ParseISODurationMs converts an ISO-8601 duration to milliseconds, over the
// P[nD][T[nH][nM][nS]] subset the vectors use.
func ParseISODurationMs(d string) (int64, bool) {
	rest, ok := strings.CutPrefix(d, "P")
	if !ok {
		return 0, false
	}
	daysPart, timePart, hasTime := strings.Cut(rest, "T")
	total := 0.0
	if daysPart != "" {
		n, ok := strings.CutSuffix(daysPart, "D")
		if !ok {
			return 0, false
		}
		f, err := strconv.ParseFloat(n, 64)
		if err != nil {
			return 0, false
		}
		total += f * 86400
	}
	if hasTime {
		r := timePart
		for _, u := range []struct {
			suffix byte
			mult   float64
		}{{'H', 3600}, {'M', 60}, {'S', 1}} {
			if idx := strings.IndexByte(r, u.suffix); idx >= 0 {
				f, err := strconv.ParseFloat(r[:idx], 64)
				if err != nil {
					return 0, false
				}
				total += f * u.mult
				r = r[idx+1:]
			}
		}
	}
	return int64(total * 1000), true
}

// ParseRFC3339Ms parses an RFC3339 timestamp to epoch milliseconds (UTC).
//
// It honors the timezone designator: 'Z' is UTC, and '+HH:MM'/'-HH:MM' are
// applied to reach UTC, so 12:00:00+02:00 yields the same instant as
// 10:00:00Z. Optional fractional seconds are truncated to milliseconds.
//
// Hand-rolled rather than using time.Parse, because the contract is to match
// ECMAScript Date.parse (which the TS stack uses) exactly, including rejecting
// trailing garbage and a missing designator. time.RFC3339 differs in what it
// accepts, and a divergence here would silently change which evidence falls
// inside a Kernel window. The bool is false where Date.parse returns NaN.
func ParseRFC3339Ms(ts string) (int64, bool) {
	b := []byte(ts)
	if len(b) < 20 || b[10] != 'T' {
		return 0, false
	}
	num := func(a, z int) (int64, bool) {
		for _, c := range b[a:z] {
			if c < '0' || c > '9' {
				return 0, false
			}
		}
		n, err := strconv.ParseInt(ts[a:z], 10, 64)
		return n, err == nil
	}
	y, ok1 := num(0, 4)
	mo, ok2 := num(5, 7)
	d, ok3 := num(8, 10)
	h, ok4 := num(11, 13)
	mi, ok5 := num(14, 16)
	s, ok6 := num(17, 19)
	if !(ok1 && ok2 && ok3 && ok4 && ok5 && ok6) {
		return 0, false
	}

	idx := 19
	var ms int64
	if b[idx] == '.' {
		idx++
		start := idx
		for idx < len(b) && b[idx] >= '0' && b[idx] <= '9' {
			idx++
		}
		frac := ts[start:idx]
		if frac == "" {
			return 0, false // '.' with no digits
		}
		if len(frac) > 3 {
			frac = frac[:3]
		}
		for len(frac) < 3 {
			frac += "0"
		}
		n, err := strconv.ParseInt(frac, 10, 64)
		if err != nil {
			return 0, false
		}
		ms = n
	}

	if idx >= len(b) {
		return 0, false // designator required
	}
	var offsetMs int64
	switch b[idx] {
	case 'Z':
		idx++
	case '+', '-':
		sign := int64(1)
		if b[idx] == '-' {
			sign = -1
		}
		idx++
		if idx+5 > len(b) || b[idx+2] != ':' {
			return 0, false
		}
		oh, okh := num(idx, idx+2)
		om, okm := num(idx+3, idx+5)
		if !okh || !okm || oh > 23 || om > 59 {
			return 0, false
		}
		offsetMs = sign * (oh*3600 + om*60) * 1000
		idx += 5
	default:
		return 0, false
	}
	if idx != len(b) {
		return 0, false // trailing characters
	}

	// days since epoch (Howard Hinnant's civil-from-days).
	yy := y
	if mo <= 2 {
		yy--
	}
	var era int64
	if yy >= 0 {
		era = yy / 400
	} else {
		era = (yy - 399) / 400
	}
	yoe := yy - era*400
	mp := mo - 3
	if mo <= 2 {
		mp = mo + 9
	}
	doy := (153*mp+2)/5 + d - 1
	doe := yoe*365 + yoe/4 - yoe/100 + doy
	days := era*146097 + doe - 719468

	localMs := (days*86400+h*3600+mi*60+s)*1000 + ms
	return localMs - offsetMs, true
}

func withinWindow(ts string, window Value, evalTime string) bool {
	t, ok := ParseRFC3339Ms(ts)
	if !ok {
		return false
	}
	if start := Str(window, "start"); start != "" {
		if st, ok := ParseRFC3339Ms(start); ok && t < st {
			return false
		}
	}
	if end := Str(window, "end"); end != "" {
		if en, ok := ParseRFC3339Ms(end); ok && t >= en {
			return false
		}
	}
	if maxAge := Str(window, "max_age"); maxAge != "" {
		et, okEt := ParseRFC3339Ms(evalTime)
		ms, okMs := ParseISODurationMs(maxAge)
		if okEt && okMs && et-t > ms {
			return false
		}
	}
	return true
}

// selectLatest picks the latest TIM matching a MeasureSpec's require/window
// filters, ordered by the Notary tuple (ts, lamport, identity.id, cid).
func selectLatest(spec Value, tims []Value, evalTime string) Value {
	cands := make([]Value, 0, len(tims))
	cands = append(cands, tims...)

	if req, ok := Path(spec, "require"); ok {
		if mw, ok := Path(req, "min_witnesses"); ok {
			if n, err := toFloat(mw); err == nil {
				filtered := cands[:0]
				for _, t := range cands {
					count := 0
					if ws, ok := Path(t, "time", "witnesses"); ok {
						if arr, ok := ws.([]Value); ok {
							count = len(arr)
						}
					}
					if float64(count) >= n {
						filtered = append(filtered, t)
					}
				}
				cands = filtered
			}
		}
		if dc, ok := Path(req, "device_class"); ok {
			if arr, ok := dc.([]Value); ok {
				allowed := map[string]bool{}
				for _, a := range arr {
					if s, ok := a.(string); ok {
						allowed[s] = true
					}
				}
				filtered := cands[:0]
				for _, t := range cands {
					if allowed[Str(t, "measurement", "device")] {
						filtered = append(filtered, t)
					}
				}
				cands = filtered
			}
		}
	}
	if window, ok := Path(spec, "window"); ok {
		filtered := cands[:0]
		for _, t := range cands {
			if withinWindow(Str(t, "time", "ts"), window, evalTime) {
				filtered = append(filtered, t)
			}
		}
		cands = filtered
	}
	if len(cands) == 0 {
		return nil
	}
	sort.SliceStable(cands, func(i, j int) bool {
		return notaryLess(cands[i], cands[j])
	})
	return cands[len(cands)-1]
}

func notaryLess(a, b Value) bool {
	if x, y := Str(a, "time", "ts"), Str(b, "time", "ts"); x != y {
		return x < y
	}
	if x, y := lamport(a), lamport(b); x != y {
		return x < y
	}
	if x, y := Str(a, "identity", "id"), Str(b, "identity", "id"); x != y {
		return x < y
	}
	return Str(a, "cid") < Str(b, "cid")
}

func lamport(t Value) int64 {
	v, ok := Path(t, "time", "ordering", "lamport")
	if !ok {
		return 0
	}
	f, err := toFloat(v)
	if err != nil {
		return 0
	}
	return int64(f)
}

func toFloat(v Value) (float64, error) {
	n, ok := v.(Number)
	if !ok {
		return 0, strconv.ErrSyntax
	}
	return n.Float()
}

func jsonToSymVal(v Value) (SymVal, bool) {
	switch t := v.(type) {
	case Number:
		f, err := t.Float()
		if err != nil {
			return SymVal{}, false
		}
		return NumVal(f), true
	case string:
		return StrVal(t), true
	case bool:
		return BoolVal(t), true
	}
	return SymVal{}, false
}

// EvaluateKernel evaluates a commitment against TIM evidence and returns a
// Decision, per ARKY-KERNEL-v1 section 5. evalTime is an RFC3339 timestamp.
//
// The safety property that matters: missing or INDETERMINATE evidence yields
// INDETERMINATE, never APPROVED. Authorization requires every assertion to PASS
// and a matching consequence — there is no fall-through that authorizes.
func EvaluateKernel(commitment Value, tims []Value, evalTime string) Decision {
	dec := Decision{
		Status:     StatusIndeterminate,
		Assertions: []AssertionResult{},
		Authorized: []string{},
		Errors:     []string{},
	}

	measureV, hasMeasure := Path(commitment, "measure")
	consequenceV, hasCons := Path(commitment, "consequence")
	measure, okM := measureV.([]Value)
	consequence, okC := consequenceV.([]Value)
	if !hasMeasure || !hasCons || !okM || !okC {
		dec.Status = StatusRejected
		dec.Errors = append(dec.Errors, "kernel.invalid_commitment")
		return dec
	}

	// Static verb-registry validation, independent of the measurement outcome:
	// an unregistered verb is a malformed commitment, not a failed assertion.
	for _, cons := range consequence {
		if then, ok := Path(cons, "then"); ok {
			if arr, ok := then.([]Value); ok {
				for _, verb := range arr {
					if !IsRegisteredVerb(Str(verb, "name")) {
						dec.Status = StatusRejected
						dec.Errors = append(dec.Errors, "kernel.unknown_verb")
						return dec
					}
				}
			}
		}
	}

	symbols := Symbols{}
	for _, spec := range measure {
		name := Str(spec, "name")
		assertExpr := Str(spec, "assert")
		ar := AssertionResult{Name: name, Result: Indeterminate}

		tim := selectLatest(spec, tims, evalTime)
		if tim == nil {
			ar.Error = "no matching receipts"
		} else {
			if val, ok := Path(tim, "measurement", "value"); ok {
				if sv, ok := jsonToSymVal(val); ok {
					symbols[name] = sv
					v := sv
					ar.InputValue = &v
				}
			}
			ar.Unit = Str(tim, "measurement", "unit")
			res := EvaluateAssertion(assertExpr, symbols)
			ar.Result = res.Result
			ar.Error = res.Error
		}
		dec.Assertions = append(dec.Assertions, ar)
	}

	anyIndet := false
	allPass := len(dec.Assertions) > 0
	for _, a := range dec.Assertions {
		if a.Result == Indeterminate {
			anyIndet = true
		}
		if a.Result != Pass {
			allPass = false
		}
	}
	overall := Fail
	switch {
	case anyIndet:
		overall = Indeterminate
	case allPass:
		overall = Pass
	}

	if overall == Indeterminate {
		dec.Status = StatusIndeterminate
		return dec
	}

	// The first matching consequence authorizes its verbs.
	var authorized []string
	for _, cons := range consequence {
		ifClause := strings.TrimSpace(Str(cons, "if"))
		matches := false
		switch ifClause {
		case "PASS":
			matches = overall == Pass
		case "FAIL":
			matches = overall == Fail
		case "INDETERMINATE":
			matches = overall == Indeterminate
		}
		if matches {
			if then, ok := Path(cons, "then"); ok {
				if arr, ok := then.([]Value); ok {
					for _, verb := range arr {
						if n := Str(verb, "name"); n != "" {
							authorized = append(authorized, n)
						}
					}
				}
			}
			break
		}
	}

	if overall == Pass && len(authorized) > 0 {
		dec.Status = StatusApproved
		dec.Authorized = authorized
	} else {
		dec.Status = StatusRejected
		dec.Authorized = []string{}
	}
	return dec
}
