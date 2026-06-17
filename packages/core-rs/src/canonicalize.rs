//! RFC 8785 JSON Canonicalization Scheme (JCS), per ARKY-TIM-Canonicalization-v1.
//!
//! Hand-rolled (serde_json's serializer is NOT JCS-compliant): object members
//! sorted by UTF-16 code units, no insignificant whitespace, RFC 8785 number
//! formatting (ECMAScript Number::toString — shortest round-trip), and the
//! minimal JSON string escape set.

use serde_json::Value;

/// Serialize a parsed JSON value to its JCS canonical string.
pub fn canonicalize(value: &Value) -> String {
    let mut out = String::new();
    write_value(value, &mut out);
    out
}

fn write_value(value: &Value, out: &mut String) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&format_number(n)),
        Value::String(s) => write_string(s, out),
        Value::Array(arr) => {
            out.push('[');
            for (i, v) in arr.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_value(v, out);
            }
            out.push(']');
        }
        Value::Object(map) => {
            // Sort keys by UTF-16 code units (RFC 8785 §3.2.3).
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|a, b| cmp_utf16(a, b));
            out.push('{');
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_string(k, out);
                out.push(':');
                write_value(&map[*k], out);
            }
            out.push('}');
        }
    }
}

/// Compare two strings by their UTF-16 code units (not Rust's default UTF-8
/// byte order, which diverges for non-BMP code points).
fn cmp_utf16(a: &str, b: &str) -> std::cmp::Ordering {
    let mut ia = a.encode_utf16();
    let mut ib = b.encode_utf16();
    loop {
        match (ia.next(), ib.next()) {
            (Some(x), Some(y)) if x == y => continue,
            (Some(x), Some(y)) => return x.cmp(&y),
            (None, Some(_)) => return std::cmp::Ordering::Less,
            (Some(_), None) => return std::cmp::Ordering::Greater,
            (None, None) => return std::cmp::Ordering::Equal,
        }
    }
}

/// RFC 8785 §3.2.2.2 string production (minimal JSON escapes).
fn write_string(s: &str, out: &mut String) {
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{0008}' => out.push_str("\\b"),
            '\u{000C}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

/// RFC 8785 number formatting (ECMAScript Number::toString). serde_json with
/// the `arbitrary_precision` feature off parses numbers as i64/u64/f64; we
/// reproduce the ECMAScript `Number::toString` output that RFC 8785 mandates.
///
/// CRITICAL: every JSON number is treated as an IEEE-754 double (so e.g.
/// 9007199254740993 -> 9007199254740992, matching V8 — serde_json would
/// otherwise preserve the exact integer and diverge). Exponent notation is used
/// exactly when ECMAScript uses it (decimal exponent < -6 or >= 21).
fn format_number(n: &serde_json::Number) -> String {
    // Re-parse from the lexical form with Rust's std parser: serde_json's f64
    // parse is off by one ULP for some extreme exponents (e.g. 1.5e-300),
    // whereas std (like V8) rounds correctly. Falls back to serde's f64 if the
    // lexical form somehow won't parse.
    let f = n
        .to_string()
        .parse::<f64>()
        .unwrap_or_else(|_| n.as_f64().expect("finite JSON number"));
    ecmascript_number_to_string(f)
}

/// ECMAScript Number::toString (ECMA-262 §6.1.6.1.20 / Note), shortest
/// round-trip. Matches V8's `String(n)`, which is the RFC 8785 reference.
pub fn ecmascript_number_to_string(f: f64) -> String {
    if !f.is_finite() {
        panic!("JCS: non-finite numbers are forbidden");
    }
    if f == 0.0 {
        return "0".to_string(); // also normalizes -0
    }
    let sign = if f < 0.0 { "-" } else { "" };
    let abs = f.abs();

    // Rust's {:e} gives the shortest round-trip as "<d>[.<frac>]e<exp>".
    let sci = format!("{:e}", abs);
    let (mantissa, exp_str) = sci.split_once('e').expect("scientific form");
    let exp: i32 = exp_str.parse().expect("exponent");

    // Digit string `s` (no dot) and number of significant digits `k`; `n` is the
    // position of the decimal point relative to the digits (ECMAScript's n).
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    let n = exp + 1; // because mantissa is d.dddd with one digit before the dot

    let body = if (1..=21).contains(&n) {
        if k <= n {
            // Integer with trailing zeros: digits followed by (n-k) zeros.
            format!("{}{}", digits, "0".repeat((n - k) as usize))
        } else {
            // Decimal point inside the digits.
            format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
        }
    } else if (-5..=0).contains(&n) {
        // 0.000…digits
        format!("0.{}{}", "0".repeat((-n) as usize), digits)
    } else {
        // Exponent form: d[.ddd]e{+|-}exp, exponent = n-1, no leading zeros.
        let e = n - 1;
        let mant = if k == 1 {
            digits.clone()
        } else {
            format!("{}.{}", &digits[..1], &digits[1..])
        };
        let esign = if e >= 0 { "+" } else { "-" };
        format!("{}e{}{}", mant, esign, e.abs())
    };
    format!("{}{}", sign, body)
}

#[cfg(test)]
mod tests {
    use super::canonicalize;
    use serde_json::json;

    #[test]
    fn key_ordering_and_no_whitespace() {
        assert_eq!(
            canonicalize(&json!({"zebra":1,"apple":2,"banana":3})),
            "{\"apple\":2,\"banana\":3,\"zebra\":1}"
        );
    }

    #[test]
    fn rfc8785_numbers() {
        // integers plain; -0 -> 0; short decimals shortest round-trip.
        assert_eq!(canonicalize(&json!({"a":42,"b":-17,"c":0})), "{\"a\":42,\"b\":-17,\"c\":0}");
        assert_eq!(canonicalize(&json!(-0.0_f64)), "0");
        assert_eq!(canonicalize(&json!(22.5_f64)), "22.5");
        assert_eq!(canonicalize(&json!(3.14159_f64)), "3.14159");
    }

    /// ECMAScript Number::toString exponent + precision edges (RFC 8785). These
    /// MUST equal V8's String(n) so the TS and Rust stacks agree byte-for-byte.
    #[test]
    fn rfc8785_number_exponent_and_precision() {
        let parse = |s: &str| serde_json::from_str::<serde_json::Value>(s).unwrap();
        assert_eq!(canonicalize(&parse("1e21")), "1e+21");
        assert_eq!(canonicalize(&parse("1e20")), "100000000000000000000");
        assert_eq!(canonicalize(&parse("1e-7")), "1e-7");
        assert_eq!(canonicalize(&parse("1e-6")), "0.000001");
        assert_eq!(canonicalize(&parse("0.0000001")), "1e-7");
        assert_eq!(canonicalize(&parse("1.5e300")), "1.5e+300");
        assert_eq!(canonicalize(&parse("-1.5e-300")), "-1.5e-300");
        // > 2^53: collapses to the nearest double (matches V8), not the exact int.
        assert_eq!(canonicalize(&parse("9007199254740993")), "9007199254740992");
        assert_eq!(canonicalize(&parse("5e-324")), "5e-324");
        assert_eq!(canonicalize(&parse("1.7976931348623157e308")), "1.7976931348623157e+308");
    }

    #[test]
    fn nested_recursive_sort() {
        let v = json!({"outer_z":{"inner_b":2,"inner_a":1},"outer_a":"x"});
        assert_eq!(
            canonicalize(&v),
            "{\"outer_a\":\"x\",\"outer_z\":{\"inner_a\":1,\"inner_b\":2}}"
        );
    }

    #[test]
    fn control_char_escapes() {
        assert_eq!(canonicalize(&json!("a\nb\tc")), "\"a\\nb\\tc\"");
    }
}
