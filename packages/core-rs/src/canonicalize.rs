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
/// reproduce the JCS output:
///   - integers: plain decimal, no `.0`, no `+`, no leading zeros, no `-0`
///   - non-integers: shortest round-trip decimal (Rust's f64 Display, which is
///     shortest/round-trip like ECMAScript for the value ranges Arky uses)
fn format_number(n: &serde_json::Number) -> String {
    if let Some(i) = n.as_i64() {
        return i.to_string();
    }
    if let Some(u) = n.as_u64() {
        return u.to_string();
    }
    let f = n.as_f64().expect("finite JSON number");
    if !f.is_finite() {
        panic!("JCS: non-finite numbers are forbidden");
    }
    // -0 normalizes to 0.
    if f == 0.0 {
        return "0".to_string();
    }
    // Rust's {} for f64 emits the shortest round-trip decimal. For whole-valued
    // f64 it prints without a fractional part (e.g. 1e21 cases are out of scope
    // for Arky data). This matches ECMAScript Number::toString for the small
    // integer/decimal magnitudes used by Arky measurements.
    let s = format!("{}", f);
    s
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
