package arky

import (
	"crypto/ed25519"
	"math"
)

// VerbRequiredArgs returns the required argument fields for a core verb, per
// schemas/verbs/*.json (the canonical source; ARKY-SETTLERS-v1 section 3.2
// prose was reconciled to these).
func VerbRequiredArgs(verb string) []string {
	switch verb {
	case "arky:verb/pay@v1":
		return []string{"to", "amount"}
	case "arky:verb/refund@v1":
		return []string{"payment_ref"}
	case "arky:verb/slash@v1":
		return []string{"subject", "amount"}
	case "arky:verb/revoke@v1":
		return []string{"subject"}
	case "arky:verb/upgrade@v1":
		return []string{"target", "version"}
	case "arky:verb/signal@v1":
		return []string{"channel"}
	case "arky:verb/control@v1":
		return []string{"action"}
	}
	return nil
}

// ExecStatus is the outcome of an execution attempt.
type ExecStatus int

const (
	ExecFailed ExecStatus = iota
	ExecSuccess
)

func (e ExecStatus) String() string {
	if e == ExecSuccess {
		return "SUCCESS"
	}
	return "FAILED"
}

// ExecuteResult is the result of Execute.
type ExecuteResult struct {
	Status        ExecStatus
	Errors        []string
	MissingFields []string
	Receipt       Value // the signed XR, only on success
}

// ExecRequest describes an execution to attempt.
type ExecRequest struct {
	Verb           string
	Rail           string
	Args           Value
	CommitmentCid  string
	RequestID      string
	IdempotencyKey string
}

// IdempotencyStore maps an idempotency key to its XR.
type IdempotencyStore map[string]Value

// railSupported treats an explicit "unknown:" scheme as unsupported; an absent
// rail is fine.
func railSupported(rail string) bool {
	return len(rail) < 8 || rail[:8] != "unknown:"
}

// validateAmount enforces section 3.2: a present amount MUST be
// { value: finite number > 0, unit: non-empty string }. Returns the offending
// field, or "" when absent or valid.
//
// This check is the difference between a Settler that authorizes a negative
// payment and one that does not; an earlier audit found both stacks approving
// {value:-1000} because they only checked that the key existed.
func validateAmount(args Value) string {
	amount, ok := Path(args, "amount")
	if !ok {
		return ""
	}
	obj, ok := amount.(*Object)
	if !ok {
		return "amount"
	}
	v, ok := obj.Get("value")
	if !ok {
		return "amount.value"
	}
	n, ok := v.(Number)
	if !ok {
		return "amount.value"
	}
	f, err := n.Float()
	if err != nil || math.IsNaN(f) || math.IsInf(f, 0) || f <= 0 {
		return "amount.value"
	}
	u, ok := obj.Get("unit")
	if !ok {
		return "amount.unit"
	}
	s, ok := u.(string)
	if !ok || s == "" {
		return "amount.unit"
	}
	return ""
}

// ArgsHash returns multibase(multihash(sha2-256, JCS(args))).
func ArgsHash(args Value) (string, error) {
	canonical, err := Canonicalize(args)
	if err != nil {
		return "", err
	}
	return MultihashMb([]byte(canonical)), nil
}

// DeriveIdempotencyKey derives a key per ARKY-SETTLERS-v1 section 6.1, for
// clients that omit one. Deterministic and JCS-based, so the same request
// derives the same key in every stack.
func DeriveIdempotencyKey(commitmentCid, verb, rail string, args Value, verbIndex int) (string, error) {
	ah, err := ArgsHash(args)
	if err != nil {
		return "", err
	}
	components := NewObject()
	components.Set("args_hash", ah)
	components.Set("commitment_cid", commitmentCid)
	components.Set("rail", rail)
	components.Set("verb", verb)
	components.Set("verb_index", Number(itoa(verbIndex)))
	canonical, err := Canonicalize(components)
	if err != nil {
		return "", err
	}
	return MultihashMb([]byte(canonical)), nil
}

func truncate(s string, n int) string {
	if len(s) < n {
		return s
	}
	return s[:n]
}

// Execute validates and executes a request, returning a signed Execution
// Receipt. Pre-check order is verb, then args, then rail (section 4.2); there
// is no real rail, so the XR carries a mock locator and a pending anchor.
//
// Pass a non-nil store to enable idempotency (section 6.1): a repeat of the
// same key returns the identical cached receipt rather than executing twice.
func Execute(req ExecRequest, priv ed25519.PrivateKey, kid, ts, anchorTarget string, store IdempotencyStore) ExecuteResult {
	if !IsRegisteredVerb(req.Verb) {
		return ExecuteResult{Status: ExecFailed, Errors: []string{"settler.unknown_verb"}}
	}

	var missing []string
	for _, k := range VerbRequiredArgs(req.Verb) {
		if _, ok := Path(req.Args, k); !ok {
			missing = append(missing, k)
		}
	}
	if len(missing) > 0 {
		return ExecuteResult{
			Status:        ExecFailed,
			Errors:        []string{"settler.invalid_args"},
			MissingFields: missing,
		}
	}
	if field := validateAmount(req.Args); field != "" {
		return ExecuteResult{
			Status:        ExecFailed,
			Errors:        []string{"settler.invalid_args"},
			MissingFields: []string{field},
		}
	}
	if !railSupported(req.Rail) {
		return ExecuteResult{Status: ExecFailed, Errors: []string{"settler.unsupported_rail"}}
	}

	idemKey := req.IdempotencyKey
	if idemKey == "" {
		var err error
		idemKey, err = DeriveIdempotencyKey(req.CommitmentCid, req.Verb, req.Rail, req.Args, 0)
		if err != nil {
			return ExecuteResult{Status: ExecFailed, Errors: []string{"settler.invalid_args"}}
		}
	}

	if store != nil {
		if cached, ok := store[idemKey]; ok {
			return ExecuteResult{Status: ExecSuccess, Receipt: cached}
		}
	}

	ah, err := ArgsHash(req.Args)
	if err != nil {
		return ExecuteResult{Status: ExecFailed, Errors: []string{"settler.invalid_args"}}
	}

	requestID := req.RequestID
	if requestID == "" {
		requestID = "exec-" + truncate(idemKey, 12)
	}

	anchor := NewObject()
	anchor.Set("target", anchorTarget)
	anchor.Set("locator", "batch-"+truncate(idemKey[1:], 9))
	anchor.Set("status", "pending")

	body := NewObject()
	body.Set("request_id", requestID)
	body.Set("commitment_cid", req.CommitmentCid)
	body.Set("verb", req.Verb)
	body.Set("rail", req.Rail)
	body.Set("args_hash", ah)
	body.Set("idempotency_key", idemKey)
	body.Set("status", "success")
	body.Set("locator", "MOCK-"+truncate(idemKey[1:], 17))
	body.Set("anchors", []Value{anchor})
	body.Set("ts", ts)

	canonical, err := Canonicalize(body)
	if err != nil {
		return ExecuteResult{Status: ExecFailed, Errors: []string{"settler.invalid_args"}}
	}
	xr := body.Clone()
	xr.Set("cid", CidFromCanonical(canonical))
	xr.Set("sig", SignDetached([]byte(canonical), priv, kid))

	if store != nil {
		store[idemKey] = xr
	}
	return ExecuteResult{Status: ExecSuccess, Receipt: xr}
}
