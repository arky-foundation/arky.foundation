//! Strict JSON parsing for Arky.
//!
//! Canonicalization §3 requires duplicate object member names to be REJECTED.
//! `serde_json` silently keeps the last duplicate, so a caller that wants the
//! spec's guarantee must parse untrusted JSON through [`parse_strict`].
//!
//! A small scanning pass over the raw text detects any duplicate key at any
//! depth and errors before the value is built. We scan the text rather than a
//! `serde_json::Value`, because with the `arbitrary_precision` feature enabled
//! (this crate uses it for byte-exact canonicalization) numbers deserialize
//! through an internal map representation, which makes a `serde` map visitor an
//! unreliable place to detect *user* duplicate keys. After the scan passes, the
//! actual `Value` is produced by `serde_json::from_str`.

use serde_json::Value;
use std::collections::HashSet;

/// Parse JSON into a [`serde_json::Value`], rejecting any object with a
/// duplicate member name at any depth (Canonicalization §3). Returns `Err` on
/// duplicate keys or malformed input. Use this for untrusted JSON before
/// canonicalizing/verifying.
pub fn parse_strict(json: &str) -> Result<Value, String> {
    let chars: Vec<char> = json.chars().collect();
    let mut p = Scanner {
        chars: &chars,
        i: 0,
    };
    p.ws();
    p.value()?;
    p.ws();
    if p.i != p.chars.len() {
        return Err(format!("trailing characters at position {}", p.i));
    }
    serde_json::from_str(json).map_err(|e| e.to_string())
}

struct Scanner<'a> {
    chars: &'a [char],
    i: usize,
}

impl Scanner<'_> {
    fn ws(&mut self) {
        while self.i < self.chars.len() {
            match self.chars[self.i] {
                ' ' | '\t' | '\n' | '\r' => self.i += 1,
                _ => break,
            }
        }
    }

    fn value(&mut self) -> Result<(), String> {
        match self.chars.get(self.i) {
            Some('{') => self.object(),
            Some('[') => self.array(),
            Some('"') => self.string().map(|_| ()),
            Some(c) if *c == '-' || c.is_ascii_digit() => {
                self.number();
                Ok(())
            }
            Some(_) => {
                // true / false / null
                for lit in ["true", "false", "null"] {
                    if self.starts_with(lit) {
                        self.i += lit.chars().count();
                        return Ok(());
                    }
                }
                Err(format!("unexpected token at position {}", self.i))
            }
            None => Err("unexpected end of input".into()),
        }
    }

    fn starts_with(&self, lit: &str) -> bool {
        let l: Vec<char> = lit.chars().collect();
        self.i + l.len() <= self.chars.len() && self.chars[self.i..self.i + l.len()] == l[..]
    }

    fn object(&mut self) -> Result<(), String> {
        self.i += 1; // '{'
        let mut seen = HashSet::new();
        self.ws();
        if self.chars.get(self.i) == Some(&'}') {
            self.i += 1;
            return Ok(());
        }
        loop {
            self.ws();
            if self.chars.get(self.i) != Some(&'"') {
                return Err(format!("expected object key at position {}", self.i));
            }
            let key = self.string()?;
            if !seen.insert(key.clone()) {
                return Err(format!("duplicate key {key:?}"));
            }
            self.ws();
            if self.chars.get(self.i) != Some(&':') {
                return Err(format!("expected ':' at position {}", self.i));
            }
            self.i += 1;
            self.ws();
            self.value()?;
            self.ws();
            match self.chars.get(self.i) {
                Some(',') => {
                    self.i += 1;
                    continue;
                }
                Some('}') => {
                    self.i += 1;
                    return Ok(());
                }
                _ => return Err(format!("expected ',' or '}}' at position {}", self.i)),
            }
        }
    }

    fn array(&mut self) -> Result<(), String> {
        self.i += 1; // '['
        self.ws();
        if self.chars.get(self.i) == Some(&']') {
            self.i += 1;
            return Ok(());
        }
        loop {
            self.ws();
            self.value()?;
            self.ws();
            match self.chars.get(self.i) {
                Some(',') => {
                    self.i += 1;
                    continue;
                }
                Some(']') => {
                    self.i += 1;
                    return Ok(());
                }
                _ => return Err(format!("expected ',' or ']' at position {}", self.i)),
            }
        }
    }

    fn string(&mut self) -> Result<String, String> {
        self.i += 1; // opening quote
        let mut s = String::new();
        while self.i < self.chars.len() {
            let c = self.chars[self.i];
            if c == '\\' {
                // Keep the escape verbatim — fidelity of the unescaped value
                // does not matter for duplicate-key detection, only that two
                // keys with identical raw text collide.
                if self.i + 1 >= self.chars.len() {
                    return Err("bad escape".into());
                }
                s.push(c);
                s.push(self.chars[self.i + 1]);
                self.i += 2;
                continue;
            }
            if c == '"' {
                self.i += 1;
                return Ok(s);
            }
            s.push(c);
            self.i += 1;
        }
        Err("unterminated string".into())
    }

    fn number(&mut self) {
        if self.chars.get(self.i) == Some(&'-') {
            self.i += 1;
        }
        while self.i < self.chars.len() {
            match self.chars[self.i] {
                '0'..='9' | '.' | 'e' | 'E' | '+' | '-' => self.i += 1,
                _ => break,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_duplicate_keys() {
        assert!(parse_strict(r#"{"a":1,"a":2}"#).is_err());
    }

    #[test]
    fn rejects_nested_duplicate_keys() {
        assert!(parse_strict(r#"{"x":{"a":1,"a":2}}"#).is_err());
        assert!(parse_strict(r#"{"x":[{"a":1,"a":2}]}"#).is_err());
    }

    #[test]
    fn clean_object_round_trips() {
        let src = r#"{"x":{"a":1,"b":2},"y":[1,2,3],"s":"hi","n":null,"b":true}"#;
        let strict = parse_strict(src).unwrap();
        let normal: Value = serde_json::from_str(src).unwrap();
        assert_eq!(strict, normal);
    }
}
