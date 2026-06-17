//! Assertion expression language per ARKY-KERNEL-v1 §4 / ARKY-ASSERTIONS-v1.
//!
//! Tri-valued (Kleene) result: Pass / Fail / Indeterminate. Grammar (§4.1):
//!   Expr        := Comparison | LogicalExpr | "(" Expr ")"
//!   Comparison  := Symbol Op Value | Symbol "in" "[" ValueList "]"
//!   LogicalExpr := Expr ("&&" | "||") Expr | "!" Expr
//!   Op          := < <= > >= == !=
//!
//! Mirrors @arky/core (TS) assert.ts; the two must agree on every K1 vector.

use std::cmp::Ordering;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TriState {
    Pass,
    Fail,
    Indeterminate,
}

impl TriState {
    pub fn as_str(self) -> &'static str {
        match self {
            TriState::Pass => "PASS",
            TriState::Fail => "FAIL",
            TriState::Indeterminate => "INDETERMINATE",
        }
    }
}

/// A bound symbol value (from TIM measurement.value).
#[derive(Debug, Clone, PartialEq)]
pub enum SymVal {
    Num(f64),
    Str(String),
    Bool(bool),
}

/// symbol name -> value (absent => Indeterminate).
pub type Symbols = std::collections::BTreeMap<String, SymVal>;

#[derive(Debug, Clone)]
pub struct EvalResult {
    pub result: TriState,
    pub error: Option<String>,
}

// --- tokens ---

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Num(f64),
    Str(String),
    Bool(bool),
    Sym(String),
    Op(String),
    LParen,
    RParen,
    LBrack,
    RBrack,
    Comma,
    And,
    Or,
    Not,
    In,
}

fn tokenize(src: &str) -> Result<Vec<Tok>, String> {
    let chars: Vec<char> = src.chars().collect();
    let mut toks = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            ' ' | '\t' => i += 1,
            '(' => {
                toks.push(Tok::LParen);
                i += 1;
            }
            ')' => {
                toks.push(Tok::RParen);
                i += 1;
            }
            '[' => {
                toks.push(Tok::LBrack);
                i += 1;
            }
            ']' => {
                toks.push(Tok::RBrack);
                i += 1;
            }
            ',' => {
                toks.push(Tok::Comma);
                i += 1;
            }
            '&' if i + 1 < chars.len() && chars[i + 1] == '&' => {
                toks.push(Tok::And);
                i += 2;
            }
            '|' if i + 1 < chars.len() && chars[i + 1] == '|' => {
                toks.push(Tok::Or);
                i += 2;
            }
            '!' if !(i + 1 < chars.len() && chars[i + 1] == '=') => {
                toks.push(Tok::Not);
                i += 1;
            }
            '"' => {
                let mut j = i + 1;
                let mut s = String::new();
                while j < chars.len() && chars[j] != '"' {
                    s.push(chars[j]);
                    j += 1;
                }
                if j >= chars.len() {
                    return Err("unterminated string".into());
                }
                toks.push(Tok::Str(s));
                i = j + 1;
            }
            '<' | '>' | '=' | '!' => {
                if i + 1 < chars.len() && chars[i + 1] == '=' {
                    toks.push(Tok::Op(format!("{}=", c)));
                    i += 2;
                } else if c == '<' || c == '>' {
                    toks.push(Tok::Op(c.to_string()));
                    i += 1;
                } else {
                    return Err(format!("bad operator at '{}'", c));
                }
            }
            '0'..='9' => {
                let mut j = i;
                let mut n = String::new();
                while j < chars.len() && (chars[j].is_ascii_digit() || chars[j] == '.') {
                    n.push(chars[j]);
                    j += 1;
                }
                toks.push(Tok::Num(n.parse().map_err(|_| "bad number")?));
                i = j;
            }
            c if c == '_' || c.is_ascii_lowercase() => {
                let mut j = i;
                let mut s = String::new();
                while j < chars.len() && (chars[j] == '_' || chars[j].is_ascii_lowercase() || chars[j].is_ascii_digit()) {
                    s.push(chars[j]);
                    j += 1;
                }
                match s.as_str() {
                    "true" => toks.push(Tok::Bool(true)),
                    "false" => toks.push(Tok::Bool(false)),
                    "in" => toks.push(Tok::In),
                    _ => toks.push(Tok::Sym(s)),
                }
                i = j;
            }
            other => return Err(format!("unexpected character '{}'", other)),
        }
    }
    Ok(toks)
}

// --- AST ---

#[derive(Debug, Clone)]
enum Lit {
    Num(f64),
    Str(String),
    Bool(bool),
}

#[derive(Debug, Clone)]
enum Ast {
    Cmp { sym: String, op: String, val: Lit },
    In { sym: String, vals: Vec<Lit> },
    And(Box<Ast>, Box<Ast>),
    Or(Box<Ast>, Box<Ast>),
    Not(Box<Ast>),
    SymRef(String),
}

struct Parser {
    toks: Vec<Tok>,
    pos: usize,
}

impl Parser {
    fn new(toks: Vec<Tok>) -> Self {
        Parser { toks, pos: 0 }
    }
    fn peek(&self) -> Option<&Tok> {
        self.toks.get(self.pos)
    }
    fn next(&mut self) -> Option<Tok> {
        let t = self.toks.get(self.pos).cloned();
        self.pos += 1;
        t
    }
    fn parse(&mut self) -> Result<Ast, String> {
        let e = self.parse_or()?;
        if self.pos != self.toks.len() {
            return Err("trailing tokens".into());
        }
        Ok(e)
    }
    fn parse_or(&mut self) -> Result<Ast, String> {
        let mut l = self.parse_and()?;
        while self.peek() == Some(&Tok::Or) {
            self.next();
            l = Ast::Or(Box::new(l), Box::new(self.parse_and()?));
        }
        Ok(l)
    }
    fn parse_and(&mut self) -> Result<Ast, String> {
        let mut l = self.parse_unary()?;
        while self.peek() == Some(&Tok::And) {
            self.next();
            l = Ast::And(Box::new(l), Box::new(self.parse_unary()?));
        }
        Ok(l)
    }
    fn parse_unary(&mut self) -> Result<Ast, String> {
        if self.peek() == Some(&Tok::Not) {
            self.next();
            return Ok(Ast::Not(Box::new(self.parse_unary()?)));
        }
        self.parse_primary()
    }
    fn parse_primary(&mut self) -> Result<Ast, String> {
        match self.peek().cloned() {
            Some(Tok::LParen) => {
                self.next();
                let e = self.parse_or()?;
                if self.next() != Some(Tok::RParen) {
                    return Err("expected )".into());
                }
                Ok(e)
            }
            Some(Tok::Sym(name)) => {
                self.next();
                match self.peek().cloned() {
                    Some(Tok::Op(op)) => {
                        self.next();
                        Ok(Ast::Cmp { sym: name, op, val: self.parse_lit()? })
                    }
                    Some(Tok::In) => {
                        self.next();
                        if self.next() != Some(Tok::LBrack) {
                            return Err("expected [".into());
                        }
                        let mut vals = vec![self.parse_lit()?];
                        while self.peek() == Some(&Tok::Comma) {
                            self.next();
                            vals.push(self.parse_lit()?);
                        }
                        if self.next() != Some(Tok::RBrack) {
                            return Err("expected ]".into());
                        }
                        Ok(Ast::In { sym: name, vals })
                    }
                    _ => Ok(Ast::SymRef(name)),
                }
            }
            _ => Err("expected symbol or (".into()),
        }
    }
    fn parse_lit(&mut self) -> Result<Lit, String> {
        match self.next() {
            Some(Tok::Num(n)) => Ok(Lit::Num(n)),
            Some(Tok::Str(s)) => Ok(Lit::Str(s)),
            Some(Tok::Bool(b)) => Ok(Lit::Bool(b)),
            _ => Err("expected literal".into()),
        }
    }
}

// --- Kleene logic ---

fn and3(a: TriState, b: TriState) -> TriState {
    use TriState::*;
    if a == Fail || b == Fail {
        Fail
    } else if a == Pass && b == Pass {
        Pass
    } else {
        Indeterminate
    }
}
fn or3(a: TriState, b: TriState) -> TriState {
    use TriState::*;
    if a == Pass || b == Pass {
        Pass
    } else if a == Fail && b == Fail {
        Fail
    } else {
        Indeterminate
    }
}
fn not3(a: TriState) -> TriState {
    match a {
        TriState::Pass => TriState::Fail,
        TriState::Fail => TriState::Pass,
        TriState::Indeterminate => TriState::Indeterminate,
    }
}
fn b(v: bool) -> TriState {
    if v {
        TriState::Pass
    } else {
        TriState::Fail
    }
}

fn eval_ast(ast: &Ast, symbols: &Symbols, errs: &mut Vec<String>) -> TriState {
    match ast {
        Ast::And(l, r) => and3(eval_ast(l, symbols, errs), eval_ast(r, symbols, errs)),
        Ast::Or(l, r) => or3(eval_ast(l, symbols, errs), eval_ast(r, symbols, errs)),
        Ast::Not(e) => not3(eval_ast(e, symbols, errs)),
        Ast::SymRef(sym) => match symbols.get(sym) {
            None => {
                errs.push(format!("no matching receipts for symbol '{}'", sym));
                TriState::Indeterminate
            }
            Some(SymVal::Bool(v)) => b(*v),
            Some(_) => {
                errs.push(format!("symbol '{}' is not boolean", sym));
                TriState::Indeterminate
            }
        },
        Ast::In { sym, vals } => match symbols.get(sym) {
            None => {
                errs.push(format!("no matching receipts for symbol '{}'", sym));
                TriState::Indeterminate
            }
            Some(v) => b(vals.iter().any(|l| lit_eq(l, v))),
        },
        Ast::Cmp { sym, op, val } => match symbols.get(sym) {
            None => {
                errs.push(format!("no matching receipts for symbol '{}'", sym));
                TriState::Indeterminate
            }
            Some(v) => eval_cmp(v, op, val, errs),
        },
    }
}

fn lit_eq(l: &Lit, v: &SymVal) -> bool {
    match (l, v) {
        (Lit::Num(a), SymVal::Num(b)) => a == b,
        (Lit::Str(a), SymVal::Str(b)) => a == b,
        (Lit::Bool(a), SymVal::Bool(b)) => a == b,
        _ => false,
    }
}

fn eval_cmp(v: &SymVal, op: &str, lit: &Lit, errs: &mut Vec<String>) -> TriState {
    // Type compatibility (§4.1).
    match (v, lit) {
        (SymVal::Num(_), Lit::Str(_)) => {
            errs.push("type mismatch: numeric symbol compared to string literal".into());
            return TriState::Indeterminate;
        }
        (SymVal::Num(_), Lit::Bool(_)) => {
            errs.push("type mismatch: numeric symbol compared to boolean literal".into());
            return TriState::Indeterminate;
        }
        (SymVal::Str(_), l) if !matches!(l, Lit::Str(_)) && op != "==" && op != "!=" => {
            errs.push("type mismatch: string symbol compared to non-string literal".into());
            return TriState::Indeterminate;
        }
        _ => {}
    }
    b(compare(v, op, lit))
}

fn compare(v: &SymVal, op: &str, lit: &Lit) -> bool {
    let ord = match (v, lit) {
        (SymVal::Num(a), Lit::Num(b)) => a.partial_cmp(b),
        (SymVal::Str(a), Lit::Str(b)) => Some(a.cmp(b)),
        (SymVal::Bool(a), Lit::Bool(b)) => Some(a.cmp(b)),
        _ => None,
    };
    match op {
        "==" => matches!(ord, Some(Ordering::Equal)),
        "!=" => !matches!(ord, Some(Ordering::Equal)),
        "<" => matches!(ord, Some(Ordering::Less)),
        "<=" => matches!(ord, Some(Ordering::Less) | Some(Ordering::Equal)),
        ">" => matches!(ord, Some(Ordering::Greater)),
        ">=" => matches!(ord, Some(Ordering::Greater) | Some(Ordering::Equal)),
        _ => false,
    }
}

/// Parse + evaluate an assertion string to a tri-state result.
pub fn evaluate_assertion(expr: &str, symbols: &Symbols) -> EvalResult {
    let ast = match tokenize(expr).and_then(|t| Parser::new(t).parse()) {
        Ok(a) => a,
        Err(e) => {
            return EvalResult {
                result: TriState::Indeterminate,
                error: Some(format!("parse error: {}", e)),
            }
        }
    };
    let mut errs = Vec::new();
    let result = eval_ast(&ast, symbols, &mut errs);
    EvalResult {
        result,
        error: if result == TriState::Indeterminate && !errs.is_empty() {
            Some(errs.remove(0))
        } else {
            None
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn syms() -> Symbols {
        let mut m = Symbols::new();
        m.insert("temp".into(), SymVal::Num(22.5));
        m.insert("flag".into(), SymVal::Bool(true));
        m
    }

    #[test]
    fn comparisons_and_logic() {
        let s = syms();
        assert_eq!(evaluate_assertion("temp > 20", &s).result, TriState::Pass);
        assert_eq!(evaluate_assertion("temp > 30", &s).result, TriState::Fail);
        assert_eq!(evaluate_assertion("temp >= 20 && temp <= 25", &s).result, TriState::Pass);
        assert_eq!(evaluate_assertion("temp > 30 || temp < 25", &s).result, TriState::Pass);
        assert_eq!(evaluate_assertion("!(temp > 30)", &s).result, TriState::Pass);
        assert_eq!(evaluate_assertion("temp in [22.5, 30]", &s).result, TriState::Pass);
        assert_eq!(evaluate_assertion("flag", &s).result, TriState::Pass);
    }

    #[test]
    fn missing_and_type_mismatch() {
        let s = syms();
        assert_eq!(evaluate_assertion("humidity > 50", &s).result, TriState::Indeterminate);
        let r = evaluate_assertion("temp > \"high\"", &s);
        assert_eq!(r.result, TriState::Indeterminate);
        assert!(r.error.unwrap().contains("type mismatch"));
    }
}
