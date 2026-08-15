"""Canonicalization invariants the published vectors do not reach.

The vectors use ASCII keys and simple values, so several RFC 8785 requirements
are unexercised by them. Each test here was mutation-checked: breaking the
corresponding rule in the implementation makes it fail.
"""

from __future__ import annotations

import pytest

import arky_core as arky


def canon(text: str) -> str:
    return arky.canonicalize(arky.parse(text))


def test_key_ordering_and_no_whitespace() -> None:
    assert canon('{"zebra":1, "apple":2, "banana":3}') == '{"apple":2,"banana":3,"zebra":1}'


def test_key_ordering_is_utf16_not_code_point() -> None:
    """RFC 8785 section 3.2.3 sorts keys by UTF-16 code units.

    Python's ``str`` sorts by code point, which diverges for non-BMP
    characters: U+1F600 is one code point *above* U+FB00, but as a UTF-16
    surrogate pair (0xD83D 0xDE00) it sorts *below* it.

    The published vectors are ASCII-only, where the two orderings agree, so
    nothing in the conformance suite would catch a naive ``sort(key=kv[0])``.
    A stack that got this wrong would emit different canonical bytes, a
    different cid, and a signature the other stacks reject.
    """
    assert canon('{"\U0001f600":1,"ﬀ":2}') == '{"\U0001f600":1,"ﬀ":2}'


def test_nested_recursive_sort() -> None:
    got = canon('{"outer_z":{"inner_b":2,"inner_a":1},"outer_a":"x"}')
    assert got == '{"outer_a":"x","outer_z":{"inner_a":1,"inner_b":2}}'


@pytest.mark.parametrize(
    ("literal", "expected"),
    [
        ('{"a":42,"b":-17,"c":0}', '{"a":42,"b":-17,"c":0}'),
        ("-0.0", "0"),  # -0 normalizes to 0
        ("22.5", "22.5"),
        ("3.14159", "3.14159"),
        ("1e21", "1e+21"),
        ("1e20", "100000000000000000000"),
        ("1e-7", "1e-7"),
        ("1e-6", "0.000001"),
        ("0.0000001", "1e-7"),
        ("1.5e300", "1.5e+300"),
        ("-1.5e-300", "-1.5e-300"),
        # Above 2^53 the value collapses to the nearest double, matching V8,
        # rather than surviving as a Python arbitrary-precision int.
        ("9007199254740993", "9007199254740992"),
        ("5e-324", "5e-324"),
        ("1.7976931348623157e308", "1.7976931348623157e+308"),
        ("100000000000000000000", "100000000000000000000"),
        ("0.1", "0.1"),
        ("0.3", "0.3"),
        ("42", "42"),
        ("0", "0"),
    ],
)
def test_rfc8785_number_forms(literal: str, expected: str) -> None:
    """ECMAScript ``Number::toString`` forms, which RFC 8785 mandates.

    Python's ``repr`` disagrees with ECMAScript on nine of these (``1e+20``,
    ``1e-07``, ``-0.0``, ``42.0``, the >2^53 integer, ...), so this is the
    single most divergence-prone surface in the Python stack.
    """
    assert canon(literal) == expected


def test_integers_are_doubles_not_bignums() -> None:
    """JSON numbers are IEEE-754 doubles even when Python could hold more.

    ``json.loads`` would return an exact ``int`` here and canonicalize it
    losslessly, diverging from every other stack.
    """
    assert canon("9007199254740993") == "9007199254740992"
    assert canon("123456789012345678901234567890") == "1.2345678901234568e+29"


def test_control_char_escapes() -> None:
    assert canon('"a\\nb\\tc"') == '"a\\nb\\tc"'
    # U+0001 has no short escape and must use the \u form.
    assert canon('"\\u0001"') == '"\\u0001"'
    # A raw control character is invalid JSON.
    with pytest.raises(arky.JsonParseError):
        arky.parse('"a\x01b"')


def test_no_html_or_unicode_escaping() -> None:
    """RFC 8785 uses the minimal escape set.

    ``json.dumps`` defaults to ``ensure_ascii=True``, which would escape every
    non-ASCII character and change the bytes.
    """
    assert canon('"<a> & </a>"') == '"<a> & </a>"'
    assert canon('"éé"') == '"éé"'
    assert canon('"\U0001f600"') == '"\U0001f600"'


def test_booleans_are_not_integers() -> None:
    """``bool`` subclasses ``int`` in Python; true must not serialize as 1."""
    assert arky.canonicalize(arky.parse('{"a":true,"b":false}')) == '{"a":true,"b":false}'
    assert arky.canonicalize({"a": True, "b": False}) == '{"a":true,"b":false}'


def test_non_finite_rejected() -> None:
    """JCS forbids NaN/Infinity; canonicalization must raise, not emit them."""
    with pytest.raises(arky.JcsError):
        arky.canonicalize(arky.Number("NaN"))
    with pytest.raises(arky.JcsError):
        arky.canonicalize(arky.Number("Infinity"))
    with pytest.raises(arky.JcsError):
        arky.canonicalize(float("nan"))
    with pytest.raises(arky.JcsError):
        arky.canonicalize(float("inf"))


def test_parse_strict_rejects_duplicate_keys() -> None:
    with pytest.raises(arky.JsonParseError):
        arky.parse_strict('{"a":1,"a":2}')
    with pytest.raises(arky.JsonParseError):
        arky.parse_strict('{"o":{"b":1,"b":2}}')
    # Distinct keys sharing a prefix are fine, as are escaped quotes in keys.
    arky.parse_strict('{"a":1,"ab":2}')
    arky.parse_strict('{"a\\"b":1,"a":2}')
    # The lenient parser keeps last-wins, mirroring json.loads/JSON.parse.
    value, _ = arky.path(arky.parse('{"a":1,"a":2}'), "a")
    assert value == arky.Number("2")


def test_number_lexical_form_preserved() -> None:
    """The parser must keep the literal so the double conversion happens once."""
    value, _ = arky.path(arky.parse('{"n":9007199254740993}'), "n")
    assert value == arky.Number("9007199254740993")


def test_object_key_order_preserved_on_parse() -> None:
    """Insertion order matters: the JWS protected header is signed verbatim."""
    parsed = arky.parse('{"z":1,"a":2,"m":3}')
    assert list(parsed.keys()) == ["z", "a", "m"]


@pytest.mark.parametrize(
    "bad",
    ["", "{", "[1,", '{"a"}', '{"a":}', "tru", '{"a":1}x', '"unterminated', "[1 2]", "{,}"],
)
def test_parse_rejects_malformed(bad: str) -> None:
    with pytest.raises(arky.JsonParseError):
        arky.parse(bad)


def test_surrogate_pair_escapes_decode() -> None:
    """``\\uD83D\\uDE00`` must combine into one astral character."""
    assert arky.parse('"\\ud83d\\ude00"') == "\U0001f600"
