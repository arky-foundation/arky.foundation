//! Kernel evaluation per ARKY-KERNEL-v1 §5. Bind MeasureSpec symbols from TIM
//! evidence, evaluate assertions (tri-valued), resolve consequences, and emit a
//! Decision. Mirrors @arky/core (TS) kernel.ts.

use crate::assert::{SymVal, Symbols, TriState, evaluate_assertion};
use serde_json::Value;

/// Core verbs registered in ARKY-REGISTRIES-v1 (v1).
pub const REGISTERED_VERBS: &[&str] = &[
    "arky:verb/pay@v1",
    "arky:verb/refund@v1",
    "arky:verb/slash@v1",
    "arky:verb/revoke@v1",
    "arky:verb/upgrade@v1",
    "arky:verb/signal@v1",
    "arky:verb/control@v1",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecisionStatus {
    Approved,
    Rejected,
    Indeterminate,
}

impl DecisionStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            DecisionStatus::Approved => "APPROVED",
            DecisionStatus::Rejected => "REJECTED",
            DecisionStatus::Indeterminate => "INDETERMINATE",
        }
    }
}

#[derive(Debug, Clone)]
pub struct AssertionResult {
    pub name: String,
    pub result: TriState,
    pub input_value: Option<SymVal>,
    pub unit: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Decision {
    pub status: DecisionStatus,
    pub assertions: Vec<AssertionResult>,
    pub authorized: Vec<String>, // verb URNs
    pub errors: Vec<String>,
}

fn json_to_symval(v: &Value) -> Option<SymVal> {
    match v {
        Value::Number(n) => n.as_f64().map(SymVal::Num),
        Value::String(s) => Some(SymVal::Str(s.clone())),
        Value::Bool(b) => Some(SymVal::Bool(*b)),
        _ => None,
    }
}

/// Minimal ISO-8601 duration -> milliseconds (PnDTnHnMnS subset used in vectors).
pub fn parse_iso_duration_ms(d: &str) -> Option<i64> {
    // Very small parser: P[<n>D][T[<n>H][<n>M][<n>S]]
    let s = d.strip_prefix('P')?;
    let (days_part, time_part) = match s.split_once('T') {
        Some((d, t)) => (d, Some(t)),
        None => (s, None),
    };
    let mut total: f64 = 0.0;
    if !days_part.is_empty() {
        let n = days_part.strip_suffix('D')?;
        total += n.parse::<f64>().ok()? * 86400.0;
    }
    if let Some(t) = time_part {
        let mut rest = t;
        for (suffix, mult) in [('H', 3600.0), ('M', 60.0), ('S', 1.0)] {
            if let Some(idx) = rest.find(suffix) {
                let (num, after) = rest.split_at(idx);
                total += num.parse::<f64>().ok()? * mult;
                rest = &after[1..];
            }
        }
    }
    Some((total * 1000.0) as i64)
}

/// Parse an RFC3339 timestamp to epoch millis (UTC, the 'Z' form vectors use).
fn parse_rfc3339_ms(ts: &str) -> Option<i64> {
    // Format: YYYY-MM-DDTHH:MM:SSZ (no fractional/offset in the vectors).
    let bytes = ts.as_bytes();
    if bytes.len() < 20 || bytes[10] != b'T' {
        return None;
    }
    let num = |a: usize, b: usize| ts[a..b].parse::<i64>().ok();
    let (y, mo, d) = (num(0, 4)?, num(5, 7)?, num(8, 10)?);
    let (h, mi, s) = (num(11, 13)?, num(14, 16)?, num(17, 19)?);
    // days since epoch via a civil-from-days algorithm (Howard Hinnant's).
    let y = if mo <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if mo > 2 { mo - 3 } else { mo + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    Some((days * 86400 + h * 3600 + mi * 60 + s) * 1000)
}

fn within_window(ts: &str, window: &Value, eval_time: &str) -> bool {
    let t = match parse_rfc3339_ms(ts) {
        Some(v) => v,
        None => return false,
    };
    if let Some(start) = window.get("start").and_then(|v| v.as_str())
        && let Some(st) = parse_rfc3339_ms(start)
        && t < st
    {
        return false;
    }
    if let Some(end) = window.get("end").and_then(|v| v.as_str())
        && let Some(en) = parse_rfc3339_ms(end)
        && t >= en
    {
        return false;
    }
    if let Some(max_age) = window.get("max_age").and_then(|v| v.as_str())
        && let (Some(et), Some(ms)) = (parse_rfc3339_ms(eval_time), parse_iso_duration_ms(max_age))
        && et - t > ms
    {
        return false;
    }
    true
}

/// Select the latest TIM matching a MeasureSpec (require/window + Notary tuple).
fn select_latest<'a>(spec: &Value, tims: &'a [Value], eval_time: &str) -> Option<&'a Value> {
    let mut cands: Vec<&Value> = tims.iter().collect();

    if let Some(req) = spec.get("require") {
        if let Some(minw) = req.get("min_witnesses").and_then(|v| v.as_u64()) {
            cands.retain(|t| {
                t.get("time")
                    .and_then(|x| x.get("witnesses"))
                    .and_then(|w| w.as_array())
                    .map(|a| a.len() as u64)
                    .unwrap_or(0)
                    >= minw
            });
        }
        if let Some(dc) = req.get("device_class").and_then(|v| v.as_array()) {
            let allowed: Vec<&str> = dc.iter().filter_map(|x| x.as_str()).collect();
            cands.retain(|t| {
                t.get("measurement")
                    .and_then(|m| m.get("device"))
                    .and_then(|d| d.as_str())
                    .map(|d| allowed.contains(&d))
                    .unwrap_or(false)
            });
        }
    }
    if let Some(window) = spec.get("window") {
        cands.retain(|t| {
            t.get("time")
                .and_then(|x| x.get("ts"))
                .and_then(|ts| ts.as_str())
                .map(|ts| within_window(ts, window, eval_time))
                .unwrap_or(false)
        });
    }
    if cands.is_empty() {
        return None;
    }
    // Notary tuple: (ts, lamport, identity.id, cid).
    cands.sort_by(|a, b| {
        let key = |t: &Value| {
            (
                t["time"]["ts"].as_str().unwrap_or("").to_string(),
                t["time"]["ordering"]["lamport"].as_i64().unwrap_or(0),
                t["identity"]["id"].as_str().unwrap_or("").to_string(),
                t["cid"].as_str().unwrap_or("").to_string(),
            )
        };
        key(a).cmp(&key(b))
    });
    cands.last().copied()
}

/// Evaluate a commitment against TIM receipts. `eval_time` is RFC3339 (UTC).
pub fn evaluate_kernel(commitment: &Value, tims: &[Value], eval_time: &str) -> Decision {
    let mut errors = Vec::new();
    let mut assertions = Vec::new();

    let measure = commitment.get("measure").and_then(|v| v.as_array());
    let consequence = commitment.get("consequence").and_then(|v| v.as_array());
    if measure.is_none() || consequence.is_none() {
        errors.push("kernel.invalid_commitment".into());
        return Decision {
            status: DecisionStatus::Rejected,
            assertions,
            authorized: vec![],
            errors,
        };
    }
    let (measure, consequence) = (measure.unwrap(), consequence.unwrap());

    // Static verb-registry validation (independent of outcome).
    for cons in consequence {
        if let Some(then) = cons.get("then").and_then(|v| v.as_array()) {
            for verb in then {
                let name = verb.get("name").and_then(|v| v.as_str()).unwrap_or("");
                if !REGISTERED_VERBS.contains(&name) {
                    errors.push("kernel.unknown_verb".into());
                    return Decision {
                        status: DecisionStatus::Rejected,
                        assertions,
                        authorized: vec![],
                        errors,
                    };
                }
            }
        }
    }

    let mut symbols = Symbols::new();
    for spec in measure {
        let name = spec
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let assert_expr = spec.get("assert").and_then(|v| v.as_str()).unwrap_or("");
        let tim = select_latest(spec, tims, eval_time);
        let mut ar = AssertionResult {
            name: name.clone(),
            result: TriState::Indeterminate,
            input_value: None,
            unit: None,
            error: None,
        };
        match tim {
            None => {
                ar.error = Some("no matching receipts".into());
            }
            Some(t) => {
                let value = &t["measurement"]["value"];
                if let Some(sv) = json_to_symval(value) {
                    symbols.insert(name.clone(), sv.clone());
                    ar.input_value = Some(sv);
                }
                ar.unit = t["measurement"]["unit"].as_str().map(String::from);
                let res = evaluate_assertion(assert_expr, &symbols);
                ar.result = res.result;
                ar.error = res.error;
            }
        }
        assertions.push(ar);
    }

    let any_indet = assertions
        .iter()
        .any(|a| a.result == TriState::Indeterminate);
    let all_pass = !assertions.is_empty() && assertions.iter().all(|a| a.result == TriState::Pass);
    let overall = if any_indet {
        TriState::Indeterminate
    } else if all_pass {
        TriState::Pass
    } else {
        TriState::Fail
    };

    if overall == TriState::Indeterminate {
        return Decision {
            status: DecisionStatus::Indeterminate,
            assertions,
            authorized: vec![],
            errors,
        };
    }

    // First matching consequence authorizes its verbs.
    let mut authorized: Vec<String> = vec![];
    for cons in consequence {
        let if_clause = cons.get("if").and_then(|v| v.as_str()).unwrap_or("").trim();
        let matches = match if_clause {
            "PASS" => overall == TriState::Pass,
            "FAIL" => overall == TriState::Fail,
            "INDETERMINATE" => overall == TriState::Indeterminate,
            _ => false,
        };
        if matches {
            if let Some(then) = cons.get("then").and_then(|v| v.as_array()) {
                authorized = then
                    .iter()
                    .filter_map(|v| v.get("name").and_then(|n| n.as_str()).map(String::from))
                    .collect();
            }
            break;
        }
    }

    let status = if overall == TriState::Pass && !authorized.is_empty() {
        DecisionStatus::Approved
    } else {
        DecisionStatus::Rejected
    };
    Decision {
        status,
        assertions,
        authorized: if status == DecisionStatus::Approved {
            authorized
        } else {
            vec![]
        },
        errors,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duration_parsing() {
        assert_eq!(parse_iso_duration_ms("PT5M"), Some(300_000));
        assert_eq!(parse_iso_duration_ms("PT1H"), Some(3_600_000));
        assert_eq!(parse_iso_duration_ms("P2D"), Some(172_800_000));
    }

    #[test]
    fn rfc3339_parsing() {
        // 2025-10-15T12:05:00Z minus 2025-10-15T12:00:00Z == 5 min.
        let a = parse_rfc3339_ms("2025-10-15T12:00:00Z").unwrap();
        let b = parse_rfc3339_ms("2025-10-15T12:05:00Z").unwrap();
        assert_eq!(b - a, 300_000);
    }
}
