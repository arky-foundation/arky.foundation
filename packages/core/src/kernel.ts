/**
 * Kernel evaluation per ARKY-KERNEL-v1 §5.
 *
 * Given a Commitment and a set of TIM receipts: bind each MeasureSpec symbol
 * from matching TIM evidence, evaluate its assertion (tri-valued), resolve the
 * ConsequenceSpec array, and produce a Decision (APPROVED / REJECTED /
 * INDETERMINATE) listing authorized verbs.
 */

import { evaluateAssertion, type TriState, type Symbols } from './assert.ts';
import type { Tim } from './tim.ts';

/** Core verbs registered in ARKY-REGISTRIES-v1 (v1). */
export const REGISTERED_VERBS = new Set([
  'arky:verb/pay@v1',
  'arky:verb/refund@v1',
  'arky:verb/slash@v1',
  'arky:verb/revoke@v1',
  'arky:verb/upgrade@v1',
  'arky:verb/signal@v1',
  'arky:verb/control@v1',
]);

export interface MeasureSpec {
  name: string;
  from?: string;
  assert: string;
  window?: { start?: string; end?: string; max_age?: string };
  profile?: string;
  require?: { min_witnesses?: number; device_class?: string[]; code?: string[] };
}

export interface Verb {
  name: string;
  args: Record<string, unknown>;
}
export interface ConsequenceSpec {
  if: string;
  then: Verb[];
  limits?: unknown;
}

export interface Commitment {
  scope: string;
  actor: string;
  intent: { do: string; [k: string]: unknown };
  measure: MeasureSpec[];
  consequence: ConsequenceSpec[];
  cid?: string;
  sig?: string;
  [k: string]: unknown;
}

export interface AssertionResult {
  name: string;
  result: TriState;
  input_value?: number | string | boolean;
  unit?: string;
  inputs?: string[];
  error?: string;
}

export type DecisionStatus = 'APPROVED' | 'REJECTED' | 'INDETERMINATE';

export interface Decision {
  status: DecisionStatus;
  assertions: AssertionResult[];
  authorized: Verb[];
  errors: string[];
}

interface EvalOptions {
  /** evaluation time (ISO) for window max_age; defaults to now */
  time?: string;
}

/** Select TIMs matching a MeasureSpec and return the latest by Notary tuple. */
function selectLatest(spec: MeasureSpec, tims: Tim[], evalTime: string): Tim | undefined {
  let candidates = tims.slice();

  // require.min_witnesses
  if (spec.require?.min_witnesses !== undefined) {
    const min = spec.require.min_witnesses;
    candidates = candidates.filter((t) => (t.time.witnesses?.length ?? 0) >= min);
  }
  // require.device_class (match measurement.device)
  if (spec.require?.device_class?.length) {
    candidates = candidates.filter((t) =>
      spec.require!.device_class!.includes((t.measurement as any).device),
    );
  }
  // require.code
  if (spec.require?.code?.length) {
    candidates = candidates.filter((t) =>
      spec.require!.code!.includes((t.measurement as any).code),
    );
  }
  // window
  if (spec.window) {
    candidates = candidates.filter((t) => withinWindow(t.time.ts, spec.window!, evalTime));
  }
  if (candidates.length === 0) return undefined;

  // Notary ordering tuple: (ts ASC, lamport ASC, identity.id ASC, cid ASC); pick last.
  candidates.sort((a, b) => {
    if (a.time.ts !== b.time.ts) return a.time.ts < b.time.ts ? -1 : 1;
    const la = (a.time as any).ordering?.lamport ?? 0,
      lb = (b.time as any).ordering?.lamport ?? 0;
    if (la !== lb) return la - lb;
    if (a.identity.id !== b.identity.id) return a.identity.id < b.identity.id ? -1 : 1;
    return (a.cid ?? '') < (b.cid ?? '') ? -1 : a.cid === b.cid ? 0 : 1;
  });
  return candidates[candidates.length - 1];
}

function withinWindow(
  ts: string,
  w: { start?: string; end?: string; max_age?: string },
  evalTime: string,
): boolean {
  const t = Date.parse(ts);
  if (w.start && t < Date.parse(w.start)) return false;
  if (w.end && t >= Date.parse(w.end)) return false;
  if (w.max_age) {
    const ageMs = Date.parse(evalTime) - t;
    if (ageMs > parseIsoDurationMs(w.max_age)) return false;
  }
  return true;
}

/** Minimal ISO-8601 duration -> ms (supports the PnDTnHnMnS forms used in vectors). */
export function parseIsoDurationMs(d: string): number {
  const m = d.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!m) return NaN;
  const [, dd, hh, mm, ss] = m;
  return (
    (Number(dd || 0) * 86400 + Number(hh || 0) * 3600 + Number(mm || 0) * 60 + Number(ss || 0)) *
    1000
  );
}

/**
 * Evaluate a commitment against TIM receipts. `tims` are the candidate evidence
 * (already verified by the caller). Returns a Decision.
 */
export function evaluateKernel(
  commitment: Commitment,
  tims: Tim[],
  opts: EvalOptions = {},
): Decision {
  const evalTime = opts.time ?? new Date().toISOString();
  const errors: string[] = [];
  const assertions: AssertionResult[] = [];
  const symbols: Symbols = {};

  // Structural validation (§5 step 1): a commitment missing required fields is
  // invalid and cannot be evaluated -> REJECTED with kernel.invalid_commitment.
  if (!Array.isArray(commitment.measure) || !Array.isArray(commitment.consequence)) {
    errors.push('kernel.invalid_commitment');
    return { status: 'REJECTED', assertions, authorized: [], errors };
  }

  // Static validation (§5 step 1 / §8.1): every verb referenced by any
  // ConsequenceSpec.then MUST be registered, independent of the outcome. An
  // unregistered verb makes the whole commitment invalid -> REJECTED.
  for (const cons of commitment.consequence) {
    for (const v of cons.then) {
      if (!REGISTERED_VERBS.has(v.name)) {
        errors.push('kernel.unknown_verb');
        return { status: 'REJECTED', assertions, authorized: [], errors };
      }
    }
  }

  // Bind each MeasureSpec symbol and evaluate its assertion.
  for (const spec of commitment.measure) {
    const tim = selectLatest(spec, tims, evalTime);
    const ar: AssertionResult = { name: spec.name, result: 'INDETERMINATE' };
    if (!tim) {
      ar.result = 'INDETERMINATE';
      ar.error = 'no matching receipts';
      assertions.push(ar);
      continue;
    }
    const value = (tim.measurement as any).value;
    const unit = (tim.measurement as any).unit;
    symbols[spec.name] = { value, unit };
    ar.input_value = value;
    if (unit !== undefined) ar.unit = unit;
    ar.inputs = tim.cid ? [tim.cid] : [];

    const res = evaluateAssertion(spec.assert, symbols);
    ar.result = res.result;
    if (res.error) ar.error = res.error;
    assertions.push(ar);
  }

  // Aggregate: APPROVED if all PASS; INDETERMINATE if any INDETERMINATE; else REJECTED.
  const anyIndet = assertions.some((a) => a.result === 'INDETERMINATE');
  const allPass = assertions.length > 0 && assertions.every((a) => a.result === 'PASS');
  const overall: TriState = anyIndet ? 'INDETERMINATE' : allPass ? 'PASS' : 'FAIL';

  if (overall === 'INDETERMINATE') {
    return { status: 'INDETERMINATE', assertions, authorized: [], errors };
  }

  // Resolve consequences in order; first matching `if` authorizes its `then`.
  // (All verbs were already verified as registered above.)
  let authorized: Verb[] = [];
  for (const cons of commitment.consequence) {
    if (matchesOutcome(cons.if, overall, assertions)) {
      authorized = cons.then;
      break;
    }
  }

  const status: DecisionStatus =
    overall === 'PASS' && authorized.length > 0 ? 'APPROVED' : 'REJECTED';
  return { status, assertions, authorized: status === 'APPROVED' ? authorized : [], errors };
}

/** Match a ConsequenceSpec.if (literal PASS/FAIL/INDETERMINATE) to the outcome. */
function matchesOutcome(
  ifClause: string,
  overall: TriState,
  _assertions: AssertionResult[],
): boolean {
  const c = ifClause.trim();
  if (c === 'PASS') return overall === 'PASS';
  if (c === 'FAIL') return overall === 'FAIL';
  if (c === 'INDETERMINATE') return overall === 'INDETERMINATE';
  // Expression outcomes (advanced) not needed for K1 vectors; default no-match.
  return false;
}
