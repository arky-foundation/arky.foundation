"""Assertion expression language per ARKY-KERNEL-v1 section 4.

Tri-valued (Kleene) result: PASS / FAIL / INDETERMINATE. Grammar (section 4.1)::

    Expr        := Comparison | LogicalExpr | "(" Expr ")"
    Comparison  := Symbol Op Value | Symbol "in" "[" ValueList "]"
    LogicalExpr := Expr ("&&" | "||") Expr | "!" Expr
    Op          := < <= > >= == !=

The tri-state is the safety property: an unbound symbol or a type mismatch is
INDETERMINATE, never FAIL, so "no evidence" can never be mistaken for "the
measurement failed" and authorize a consequence.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

__all__ = ["EvalResult", "SymVal", "Symbols", "TriState", "evaluate_assertion"]


class TriState(Enum):
    """Kleene tri-valued assertion result."""

    PASS = "PASS"
    FAIL = "FAIL"
    INDETERMINATE = "INDETERMINATE"

    def __str__(self) -> str:
        return self.value


#: A bound symbol value from a TIM ``measurement.value``.
SymVal = float | int | str | bool
#: Symbol name -> value. An absent name yields INDETERMINATE.
Symbols = dict[str, SymVal]


@dataclass
class EvalResult:
    """The outcome of evaluating an assertion expression."""

    result: TriState
    error: str | None = None


# --- tokens ---

_VALUE_POS_KINDS = {"op", "(", "[", ",", "&&", "||", "!", "in"}


@dataclass
class _Tok:
    kind: str  # 'num' | 'str' | 'bool' | 'sym' | 'op' | punctuation | keyword
    value: object = None


def _value_pos(toks: list[_Tok]) -> bool:
    """Whether a '-' here starts a numeric literal rather than being invalid."""
    if not toks:
        return True
    return toks[-1].kind in _VALUE_POS_KINDS


def _tokenize(src: str) -> list[_Tok]:
    toks: list[_Tok] = []
    i = 0
    n = len(src)
    while i < n:
        c = src[i]
        if c in " \t":
            i += 1
        elif c in "()[],":
            toks.append(_Tok(c))
            i += 1
        elif src.startswith("&&", i):
            toks.append(_Tok("&&"))
            i += 2
        elif src.startswith("||", i):
            toks.append(_Tok("||"))
            i += 2
        elif c == "!" and not src.startswith("!=", i):
            toks.append(_Tok("!"))
            i += 1
        elif c == '"':
            j = i + 1
            while j < n and src[j] != '"':
                j += 1
            if j >= n:
                raise ValueError("unterminated string")
            toks.append(_Tok("str", src[i + 1 : j]))
            i = j + 1
        elif c in "<>=!":
            if i + 1 < n and src[i + 1] == "=":
                toks.append(_Tok("op", c + "="))
                i += 2
            elif c in "<>":
                toks.append(_Tok("op", c))
                i += 1
            else:
                raise ValueError(f"bad operator at {c!r}")
        elif c.isdigit() or (
            c == "-"
            and i + 1 < n
            and (src[i + 1].isdigit() or src[i + 1] == ".")
            and _value_pos(toks)
        ):
            j = i + 1 if c == "-" else i
            while j < n and (src[j].isdigit() or src[j] == "."):
                j += 1
            try:
                toks.append(_Tok("num", float(src[i:j])))
            except ValueError as exc:
                raise ValueError("bad number") from exc
            i = j
        elif c == "_" or c.islower():
            j = i
            while j < n and (src[j] == "_" or src[j].islower() or src[j].isdigit()):
                j += 1
            word = src[i:j]
            if word == "true":
                toks.append(_Tok("bool", True))
            elif word == "false":
                toks.append(_Tok("bool", False))
            elif word == "in":
                toks.append(_Tok("in"))
            else:
                toks.append(_Tok("sym", word))
            i = j
        else:
            raise ValueError(f"unexpected character {c!r}")
    return toks


# --- AST ---


@dataclass
class _Cmp:
    sym: str
    op: str
    val: object


@dataclass
class _In:
    sym: str
    vals: list[object]


@dataclass
class _And:
    left: object
    right: object


@dataclass
class _Or:
    left: object
    right: object


@dataclass
class _Not:
    operand: object


@dataclass
class _SymRef:
    sym: str


class _Parser:
    def __init__(self, toks: list[_Tok]) -> None:
        self.toks = toks
        self.pos = 0

    def peek(self) -> _Tok | None:
        return self.toks[self.pos] if self.pos < len(self.toks) else None

    def next(self) -> _Tok | None:
        tok = self.peek()
        self.pos += 1
        return tok

    def parse(self) -> object:
        node = self.parse_or()
        if self.pos != len(self.toks):
            raise ValueError("trailing tokens")
        return node

    def parse_or(self) -> object:
        node = self.parse_and()
        while (tok := self.peek()) is not None and tok.kind == "||":
            self.next()
            node = _Or(node, self.parse_and())
        return node

    def parse_and(self) -> object:
        node = self.parse_unary()
        while (tok := self.peek()) is not None and tok.kind == "&&":
            self.next()
            node = _And(node, self.parse_unary())
        return node

    def parse_unary(self) -> object:
        tok = self.peek()
        if tok is not None and tok.kind == "!":
            self.next()
            return _Not(self.parse_unary())
        return self.parse_primary()

    def parse_primary(self) -> object:
        tok = self.peek()
        if tok is None:
            raise ValueError("expected symbol or (")
        if tok.kind == "(":
            self.next()
            node = self.parse_or()
            closing = self.next()
            if closing is None or closing.kind != ")":
                raise ValueError("expected )")
            return node
        if tok.kind == "sym":
            name = str(tok.value)
            self.next()
            nxt = self.peek()
            if nxt is not None and nxt.kind == "op":
                self.next()
                return _Cmp(name, str(nxt.value), self.parse_lit())
            if nxt is not None and nxt.kind == "in":
                self.next()
                opening = self.next()
                if opening is None or opening.kind != "[":
                    raise ValueError("expected [")
                vals = [self.parse_lit()]
                while (peeked := self.peek()) is not None and peeked.kind == ",":
                    self.next()
                    vals.append(self.parse_lit())
                closing = self.next()
                if closing is None or closing.kind != "]":
                    raise ValueError("expected ]")
                return _In(name, vals)
            return _SymRef(name)
        raise ValueError("expected symbol or (")

    def parse_lit(self) -> object:
        tok = self.next()
        if tok is None or tok.kind not in {"num", "str", "bool"}:
            raise ValueError("expected literal")
        return tok.value


# --- Kleene logic ---


def _and3(a: TriState, b: TriState) -> TriState:
    if a is TriState.FAIL or b is TriState.FAIL:
        return TriState.FAIL
    if a is TriState.PASS and b is TriState.PASS:
        return TriState.PASS
    return TriState.INDETERMINATE


def _or3(a: TriState, b: TriState) -> TriState:
    if a is TriState.PASS or b is TriState.PASS:
        return TriState.PASS
    if a is TriState.FAIL and b is TriState.FAIL:
        return TriState.FAIL
    return TriState.INDETERMINATE


def _not3(a: TriState) -> TriState:
    if a is TriState.PASS:
        return TriState.FAIL
    if a is TriState.FAIL:
        return TriState.PASS
    return TriState.INDETERMINATE


def _tri(value: bool) -> TriState:
    return TriState.PASS if value else TriState.FAIL


def _is_num(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _eval(node: object, symbols: Symbols, errors: list[str]) -> TriState:
    if isinstance(node, _And):
        return _and3(_eval(node.left, symbols, errors), _eval(node.right, symbols, errors))
    if isinstance(node, _Or):
        return _or3(_eval(node.left, symbols, errors), _eval(node.right, symbols, errors))
    if isinstance(node, _Not):
        return _not3(_eval(node.operand, symbols, errors))
    if isinstance(node, _SymRef):
        if node.sym not in symbols:
            errors.append(f"no matching receipts for symbol '{node.sym}'")
            return TriState.INDETERMINATE
        value = symbols[node.sym]
        if not isinstance(value, bool):
            errors.append(f"symbol '{node.sym}' is not boolean")
            return TriState.INDETERMINATE
        return _tri(value)
    if isinstance(node, _In):
        if node.sym not in symbols:
            errors.append(f"no matching receipts for symbol '{node.sym}'")
            return TriState.INDETERMINATE
        value = symbols[node.sym]
        return _tri(any(_lit_eq(lit, value) for lit in node.vals))
    if isinstance(node, _Cmp):
        if node.sym not in symbols:
            errors.append(f"no matching receipts for symbol '{node.sym}'")
            return TriState.INDETERMINATE
        return _eval_cmp(symbols[node.sym], node.op, node.val, errors)
    return TriState.INDETERMINATE


def _lit_eq(lit: object, value: SymVal) -> bool:
    if isinstance(lit, bool) or isinstance(value, bool):
        return isinstance(lit, bool) and isinstance(value, bool) and lit is value
    if _is_num(lit) and _is_num(value):
        return float(lit) == float(value)  # type: ignore[arg-type]
    if isinstance(lit, str) and isinstance(value, str):
        return lit == value
    return False


def _eval_cmp(value: SymVal, op: str, lit: object, errors: list[str]) -> TriState:
    """Apply the section 4.1 type-compatibility rules, then compare."""
    if _is_num(value) and isinstance(lit, str):
        errors.append("type mismatch: numeric symbol compared to string literal")
        return TriState.INDETERMINATE
    if _is_num(value) and isinstance(lit, bool):
        errors.append("type mismatch: numeric symbol compared to boolean literal")
        return TriState.INDETERMINATE
    if isinstance(value, str) and not isinstance(lit, str) and op not in {"==", "!="}:
        errors.append("type mismatch: string symbol compared to non-string literal")
        return TriState.INDETERMINATE
    return _tri(_compare(value, op, lit))


def _compare(value: SymVal, op: str, lit: object) -> bool:
    """Compare under an ordering; incompatible types have none.

    Incompatible pairs are false for every operator except ``!=``, which is
    true — the same rule the other stacks apply.
    """
    order: int | None = None
    if isinstance(value, bool) and isinstance(lit, bool):
        order = (value > lit) - (value < lit)
    elif _is_num(value) and _is_num(lit):
        a, b = float(value), float(lit)  # type: ignore[arg-type]
        order = (a > b) - (a < b)
    elif isinstance(value, str) and isinstance(lit, str):
        order = (value > lit) - (value < lit)

    if op == "==":
        return order == 0
    if op == "!=":
        return order != 0
    if order is None:
        return False
    if op == "<":
        return order < 0
    if op == "<=":
        return order <= 0
    if op == ">":
        return order > 0
    if op == ">=":
        return order >= 0
    return False


def evaluate_assertion(expr: str, symbols: Symbols) -> EvalResult:
    """Parse and evaluate an assertion expression against bound symbols.

    A parse error yields INDETERMINATE rather than raising, so a malformed
    commitment can never authorize anything.
    """
    try:
        node = _Parser(_tokenize(expr)).parse()
    except ValueError as exc:
        return EvalResult(TriState.INDETERMINATE, f"parse error: {exc}")
    errors: list[str] = []
    result = _eval(node, symbols, errors)
    return EvalResult(result, errors[0] if result is TriState.INDETERMINATE and errors else None)
