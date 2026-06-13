---

spec_id: ARKY-ASSERTIONS-v1
title: Arky — Assertions & Evaluation
version: v1
status: review
effective: 2025-10-15
doc_type: specification
normative_default: true  # all sections normative unless labeled Informative
depends_on:
  - ARKY-TIM-v1
  - ARKY-REGISTRIES-v1
  - ARKY-ERRORS-v1
summary: >
  Defines a minimal, deterministic expression language and evaluation rules that
  turn typed inputs (from TIM/collectors) into boolean PASS/FAIL (or INDETERMINATE).
  Standardizes units, numeric semantics, missing-data handling, and conformance.
links:
  tim: https://arky.foundation/specs/core/ARKY-TIM-v1
  registries: https://arky.foundation/specs/infrastructure/ARKY-REGISTRIES-v1
  errors: https://arky.foundation/specs/core/ARKY-ERRORS-v1
  vectors: https://arky.foundation/specs/development/ARKY-VECTORS-v1
governance:
  owner: Arky Foundation Technical Council
  process: RFC with public vectors
authors:
  - Arky Foundation Spec WG
license:
  text: CC-BY-4.0
  code: Apache-2.0
permalink: /specs/core/ARKY-ASSERTIONS-v1
last_updated: 2025-10-15

---

# Arky — Assertions & Evaluation (v1)

**All sections are normative unless labeled *Informative*.**

## 1. Scope

This specification defines:

* A minimal **expression grammar** for boolean conditions.
* **Typed inputs** (scalars/series) with **units** and optional uncertainty.
* **Deterministic evaluation rules**, including unit checking, numeric semantics, and missing-data policy.
* Result tri-state: **PASS | FAIL | INDETERMINATE**.
* Conformance levels and error mapping.

Out of scope: how inputs are fetched from TIM; that binding is defined by higher layers (e.g., Kernel "measure").

---

## 2. Data Model

### 2.1 Assertion Object

```
Assertion :=
  expr: string,                         // required; expression per §3
  inputs:  [name: string]: Input ,    // required; symbols available to expr
  policy?: PolicyHints                  // optional; evaluation policy

Input :=
  kind: "scalar"|"series",              // required
  value?: number,                       // required if kind="scalar"
  series?: Series,                      // required if kind="series"
  unit?: string,                        // optional; URN or symbol; required if numeric with unit semantics
  error?: ErrorSpec                     // optional; uncertainty

Series :=
  samples: number[],                    // required; ordered by time ascending
  ts?: string[],                        // optional; RFC3339 timestamps matching samples length
  unit?: string                         // optional; overrides Input.unit for series

ErrorSpec :=
  model: "plusminus"|"ci95",            // required
  param: number|[number,number]         // required; ±x or [low,high]

PolicyHints :=
  on_missing: "fail"|"indeterminate"|"ignore", // default indeterminate
  unit_convert: boolean,                         // default true
  nan_policy: "fail"|"drop"|"indeterminate",     // default fail
  tol?: number                                   // optional; absolute comparison tolerance in input unit

```

**Rules**

* `expr` **MUST** evaluate to a boolean.
* **Expression canonicalization:** For hashing and caching, expressions are parsed to an AST and re-emitted as canonical JSON with no whitespace/comments and normalized operators.
* If any required input is absent or invalid, result **MUST** follow `policy.on_missing` (default: `indeterminate`).
* Units, when present, **MUST** be validated against **Registries** (`arky:unit/*` or equivalent).

---

## 3. Expression Grammar

### 3.1 EBNF (restricted)

```
expr      := or_expr
or_expr   := and_expr  "||" and_expr
and_expr  := not_expr  "&&" not_expr
not_expr  := [ "!" ] cmp_expr
cmp_expr  := sum_expr [ cmp_op sum_expr ]
cmp_op    := "==" | "!=" | ">" | ">=" | "<" | "<="
sum_expr  := prod_expr  ("+" | "-") prod_expr
prod_expr := unary_expr  ("*" | "/") unary_expr
unary_expr:= [ "-" ] primary
primary   := NUMBER | SYMBOL | func_call | "(" expr ")"
func_call := IDENT "(" [ arg_list ] ")"
arg_list  := expr  "," expr
```

### 3.2 Tokens & identifiers

* `NUMBER`: IEEE-754 binary64 decimal literals; no `NaN`/`Inf`.
* `SYMBOL`/`IDENT`: `[a-zA-Z_][a-zA-Z0-9_]*` (ASCII).
* Whitespace permitted between tokens; comments not permitted.

### 3.3 Built-in functions (closed set)

Scalar-only (return scalar unless noted):

* `abs(x)`, `min(a,b,...)`, `max(a,b,...)`, `clamp(x, lo, hi)`
  Series-aware (series or scalar return as specified):
* `mean(s)`, `median(s)`, `pctl(s, q)` (0≤q≤100), `sum(s)`, `count(s)`, `stddev(s)`
* `last(s)`, `first(s)`
* `slope(s)` (ordinary least squares over index/time; returns scalar in `<unit>/sample` if no timestamps, `<unit>/second` if `ts` provided)
* `rate(s, window)` (per-second rate over sliding window; requires `ts`; returns scalar in `<unit>/second`)
  Predicates (return boolean):
* `all(s, cond_scalar)` → applies comparison against each element (e.g., `all(s, x <= 5)`)
* `any(s, cond_scalar)`

**Rules**

* Functions outside this list **MUST NOT** be executed.
* New functions **MUST** be added via RFC and Registries.

---

## 4. Units & Type Rules

* If two operands have units, they **MUST** be dimensionally compatible for `+ -` and comparable for `cmp_op`.
* `* /` follow dimensional analysis.
* When `policy.unit_convert=true`, compatible units **MUST** be auto-converted using Registries; otherwise **MUST** raise `tim.schema_mismatch` mapped to FAIL or INDETERMINATE per policy.
* A unit attached to a series applies to each sample.

---

## 5. Numeric Semantics

* Arithmetic and comparisons **MUST** use IEEE-754 binary64 with deterministic parsing/formatting.
* Equality `==` with tolerance: if `policy.tol` is set, treat `a == b` as `|a - b| ≤ tol`. `!=` is the negation of that rule.
* Division by zero **MUST** produce **INDETERMINATE**.
* `nan_policy="fail"` **MUST** yield **FAIL** on encountering NaN; `"drop"` drops offending samples before aggregation; `"indeterminate"` yields **INDETERMINATE**.

---

## 6. Uncertainty Handling

When `error` is present:

* For comparisons `x >= y`, evaluators **SHOULD** apply **conservative** interpretation: treat `x` as `[low,high]` from `error`; return **PASS** only if the interval satisfies the predicate for all values; **FAIL** only if it violates for all; otherwise **INDETERMINATE**.
* Profiles MAY override this policy; overrides **MUST** be declared.

---

## 7. Inputs & Binding

* Higher layers provide `inputs` by resolving TIM receipts/fields; this spec does not define retrieval.
* Each `Input` name **MUST** be unique in the assertion context.
* Implementations **MUST** reject identifiers not present in `inputs`.

### 7.1 Evaluator Limits (DoS Prevention)

Implementations **MUST** enforce these limits to prevent denial-of-service:

* **AST depth:** Maximum 100 levels of nesting
* **Token count:** Maximum 10,000 tokens per expression
* **Series length:** Maximum 1,000,000 samples per series
* **Execution time:** Maximum 5 seconds per evaluation
* **Memory usage:** Maximum 100 MB per evaluation

If any limit is exceeded, evaluation **MUST** return `INDETERMINATE` with error code `assertion.limit_exceeded`.

---

## 8. Evaluation Result

The evaluator **MUST** return one of:

* `PASS` — expression evaluates true under rules above.
* `FAIL` — expression evaluates false, with no indeterminacy from missing/NaN/uncertainty.
* `INDETERMINATE` — evaluation cannot conclude due to missing inputs, NaN per policy, division by zero, unit incompatibility (when not auto-convert), or uncertainty overlap.

### 8.1 Tri-state Boolean Semantics (Kleene Logic)

When operands evaluate to tri-state values, logical operators **MUST** follow Kleene's three-valued logic:

**AND (&&) truth table:**
| A         | B         | A && B    |
|-----------|-----------|-----------|
| PASS      | PASS      | PASS      |
| PASS      | FAIL      | FAIL      |
| PASS      | INDETERMINATE | INDETERMINATE |
| FAIL      | PASS      | FAIL      |
| FAIL      | FAIL      | FAIL      |
| FAIL      | INDETERMINATE | FAIL      |
| INDETERMINATE | PASS      | INDETERMINATE |
| INDETERMINATE | FAIL      | FAIL      |
| INDETERMINATE | INDETERMINATE | INDETERMINATE |

**OR (||) truth table:**
| A         | B         | A || B    |
|-----------|-----------|-----------|
| PASS      | PASS      | PASS      |
| PASS      | FAIL      | PASS      |
| PASS      | INDETERMINATE | PASS      |
| FAIL      | PASS      | PASS      |
| FAIL      | FAIL      | FAIL      |
| FAIL      | INDETERMINATE | INDETERMINATE |
| INDETERMINATE | PASS      | PASS      |
| INDETERMINATE | FAIL      | INDETERMINATE |
| INDETERMINATE | INDETERMINATE | INDETERMINATE |

**NOT (!) truth table:**
| A         | !A        |
|-----------|-----------|
| PASS      | FAIL      |
| FAIL      | PASS      |
| INDETERMINATE | INDETERMINATE |

---

## 9. Error Mapping (ARKY-ERRORS-v1)

On processor errors, return ESE with:

* `assertion.limit_exceeded` — evaluator limits exceeded (DoS prevention).
* `common.invalid_argument` — parse error, unknown symbol/function, bad arity.
* `tim.schema_mismatch` — unit/type incompatibility when `unit_convert=false`.
* `common.not_implemented` — unsupported function.
* `common.internal_error` — evaluator failure.

Retry hints: `never` for parse/schema/limit errors; `immediate` or `exponential` for transient internal errors.

---

## 10. Conformance

* **A0 — Parser:** Implements grammar, rejects nonconforming expressions deterministically.
* **A1 — Type/Unit Checker:** Enforces unit compatibility/auto-conversion per policy; validates inputs.
* **A2 — Evaluator:** Produces PASS/FAIL/INDETERMINATE deterministically with numeric/uncertainty rules; implements built-ins exactly.
* **A3 — Vectors:** Passes Foundation vectors for parsing, units, numeric edge cases, missing-data policies, and uncertainty.

Claims of `ARKY-ASSERTION-v1 A0/A1/A2/A3` require passing official vectors.

---

## 11. Constraints Table (Informative)

| Area         | MUST                                    | SHOULD                                   |
| ------------ | --------------------------------------- | ---------------------------------------- |
| Grammar      | closed operators; no user-defined funcs | —                                        |
| Determinism  | IEEE-754 binary64; fixed semantics      | document platform math libs              |
| Units        | dimensional checks; registries-driven   | auto-convert if compatible               |
| Missing data | policy-driven triage                    | default to INDETERMINATE                 |
| Uncertainty  | conservative interval logic             | profile overrides declared               |
| Security     | no I/O, no time access, no randomness   | enforce AST/series limits; constant-time comparisons where relevant |

---

## 12. Versioning & Governance

* **Spec ID:** `ARKY-ASSERTION-v1`.
* Additions are additive (new functions/units via Registries + RFC).
* Breaking changes require `-v2` and updated vectors.

---

**End of Assertions & Evaluation (v1).**
