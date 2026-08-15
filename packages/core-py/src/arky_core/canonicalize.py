"""RFC 8785 JSON Canonicalization Scheme (JCS), per ARKY-TIM-Canonicalization-v1.

Hand-rolled because Python's ``json`` module is not JCS-compliant in three ways
that each change the signed bytes:

* ``json.dumps(sort_keys=True)`` sorts by Unicode code point; JCS requires
  UTF-16 code units, which differ for non-BMP characters (surrogate pairs sort
  below U+E000..U+FFFF in UTF-16 but above them by code point).
* ``json`` emits Python's ``repr`` for floats (``1e+20``, ``1e-07``, ``-0.0``,
  ``42.0``); RFC 8785 mandates ECMAScript ``Number::toString``.
* ``json`` parses integers as arbitrary-precision ``int``, so
  ``9007199254740993`` would survive exactly where every other stack collapses
  it to the nearest double.

See :mod:`arky_core.jsonvalue` for the parser that keeps numbers in their
lexical form so the conversion below happens exactly once.
"""

from __future__ import annotations

import math

from .jsonvalue import JsonObject, Number

__all__ = ["JcsError", "canonicalize", "ecmascript_number_to_string"]


class JcsError(ValueError):
    """Raised when a value cannot be canonicalized (e.g. a non-finite number)."""


def canonicalize(value: object) -> str:
    """Serialize a parsed JSON value to its JCS canonical string.

    Raises :class:`JcsError` for NaN/Infinity, which JCS forbids. Callers
    verifying untrusted input must catch this rather than let it escape.
    """
    out: list[str] = []
    _write_value(value, out)
    return "".join(out)


def _write_value(value: object, out: list[str]) -> None:
    # bool must precede the int/Number checks: in Python ``bool`` subclasses
    # ``int``, so ``isinstance(True, int)`` is True and a naive ordering would
    # serialize ``true`` as ``1``.
    if value is None:
        out.append("null")
    elif value is True:
        out.append("true")
    elif value is False:
        out.append("false")
    elif isinstance(value, Number):
        out.append(_format_number(value))
    elif isinstance(value, str):
        _write_string(value, out)
    elif isinstance(value, int | float):
        # Values constructed in Python rather than parsed from JSON.
        out.append(_format_number(Number(_lexical_of(value))))
    elif isinstance(value, list):
        out.append("[")
        for i, item in enumerate(value):
            if i:
                out.append(",")
            _write_value(item, out)
        out.append("]")
    elif isinstance(value, JsonObject | dict):
        _write_object(value.items(), out)
    else:
        raise JcsError(f"unsupported value type {type(value).__name__}")


def _write_object(items, out: list[str]) -> None:
    pairs = list(items)
    # Sort by UTF-16 code units (RFC 8785 section 3.2.3).
    pairs.sort(key=lambda kv: _utf16_key(kv[0]))
    out.append("{")
    for i, (key, val) in enumerate(pairs):
        if i:
            out.append(",")
        _write_string(key, out)
        out.append(":")
        _write_value(val, out)
    out.append("}")


def _utf16_key(s: str) -> tuple[int, ...]:
    """Return the UTF-16 code-unit sequence used for JCS key ordering.

    Python sorts ``str`` by code point, which diverges from UTF-16 for non-BMP
    characters: U+1F600 is one code point above U+FB00, but as a surrogate pair
    (0xD83D 0xDE00) it sorts *below* it in UTF-16.
    """
    return tuple(
        int.from_bytes(s.encode("utf-16-be")[i : i + 2], "big")
        for i in range(0, len(s.encode("utf-16-be")), 2)
    )


_ESCAPES = {
    '"': '\\"',
    "\\": "\\\\",
    "\b": "\\b",
    "\f": "\\f",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
}


def _write_string(s: str, out: list[str]) -> None:
    """Emit the RFC 8785 section 3.2.2.2 string production (minimal escapes)."""
    out.append('"')
    for ch in s:
        esc = _ESCAPES.get(ch)
        if esc is not None:
            out.append(esc)
        elif ch < "\x20":
            out.append(f"\\u{ord(ch):04x}")
        else:
            out.append(ch)
    out.append('"')


def _lexical_of(value: int | float) -> str:
    """Render a Python number as a JSON literal for the formatter below."""
    if isinstance(value, bool):  # pragma: no cover - guarded by caller
        raise JcsError("bool is not a JSON number")
    return repr(value)


def _format_number(n: Number) -> str:
    """Render a JSON number in RFC 8785 form.

    Every JSON number is an IEEE-754 double, so the value is routed through
    ``float`` exactly once here. That is what makes ``9007199254740993``
    canonicalize to ``9007199254740992`` as it does in the other stacks, rather
    than surviving as a Python arbitrary-precision ``int``.
    """
    try:
        f = float(str(n))
    except (ValueError, OverflowError) as exc:
        raise JcsError(f"malformed number {str(n)!r}") from exc
    return ecmascript_number_to_string(f)


def ecmascript_number_to_string(f: float) -> str:
    """ECMAScript ``Number::toString`` (ECMA-262 section 6.1.6.1.20).

    RFC 8785 designates this as the reference number format, so the output must
    equal V8's ``String(n)``. Python's ``repr`` supplies the shortest
    round-tripping digits, but frames them differently (``1e+20`` vs
    ``100000000000000000000``, ``1e-07`` vs ``1e-7``, ``-0.0`` vs ``0``,
    ``42.0`` vs ``42``), so the digits are extracted and re-assembled here under
    ECMAScript's rules.
    """
    if math.isnan(f) or math.isinf(f):
        raise JcsError("non-finite numbers are forbidden by JCS")
    if f == 0:
        return "0"  # also normalizes -0.0

    sign = "-" if f < 0 else ""
    f = abs(f)

    digits, exp = _shortest_digits(f)

    k = len(digits)  # number of significant digits
    n = exp + 1  # ECMAScript's n: decimal point position among the digits

    if 1 <= n <= 21:
        body = digits + "0" * (n - k) if k <= n else digits[:n] + "." + digits[n:]
    elif -5 <= n <= 0:
        body = "0." + "0" * (-n) + digits
    else:
        e = n - 1
        mant = digits if k == 1 else digits[0] + "." + digits[1:]
        body = f"{mant}e{'+' if e >= 0 else '-'}{abs(e)}"
    return sign + body


def _shortest_digits(f: float) -> tuple[str, int]:
    """Return ``(digits, exponent)`` for the shortest round-tripping form of f.

    ``digits`` has no decimal point and no trailing zeros beyond what is needed;
    the value is ``0.<digits> * 10**(exponent+1)``. Derived from ``repr``, which
    CPython guarantees to be the shortest string that round-trips.
    """
    r = repr(f)  # f is already positive and finite here
    if "e" in r or "E" in r:
        mant, _, exp_s = r.partition("e")
        exp = int(exp_s)
    else:
        mant, exp = r, 0

    if "." in mant:
        int_part, _, frac_part = mant.partition(".")
    else:
        int_part, frac_part = mant, ""

    digits = (int_part + frac_part).lstrip("0")
    if not digits:
        return "0", 0
    # Exponent of the leading digit: account for the decimal point position and
    # any leading zeros that were stripped (e.g. 0.001 -> digits "1", exp -3).
    leading_zeros = len(int_part + frac_part) - len((int_part + frac_part).lstrip("0"))
    exponent = exp + len(int_part) - 1 - leading_zeros
    return digits.rstrip("0") or "0", exponent
