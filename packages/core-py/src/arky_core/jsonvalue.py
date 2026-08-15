"""JSON value model and parser preserving what canonicalization needs.

Python's ``json`` module cannot be used for parsing here:

* it coerces numbers at parse time (``int`` for integer literals, ``float``
  otherwise), losing the lexical form the RFC 8785 formatter needs and letting
  integers exceed IEEE-754 range;
* ``object_pairs_hook`` can preserve key order, but duplicate-key *rejection*
  (Canonicalization section 3) still has to be written by hand.

The parser below keeps numbers as :class:`Number` (a ``str`` subclass holding
the original literal) and objects as :class:`JsonObject` (insertion-ordered),
and offers a strict mode that rejects duplicate member names.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator

__all__ = ["JsonObject", "JsonParseError", "Number", "get_str", "parse", "parse_strict", "path"]


class JsonParseError(ValueError):
    """Raised for malformed JSON or, in strict mode, duplicate member names."""


class Number(str):
    """A JSON number in its original lexical form (e.g. ``1e21``).

    Subclasses ``str`` so the literal survives untouched until canonicalization
    converts it to a double exactly once. ``float(n)`` gives the numeric value.
    """

    __slots__ = ()

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"Number({str.__repr__(self)})"

    def value(self) -> float:
        """The IEEE-754 double this number denotes."""
        return float(str(self))


class JsonObject:
    """A JSON object preserving key insertion order.

    Insertion order matters because the JWS protected header is base64url-
    encoded verbatim into the signing input: reordering its members would
    change the signature.
    """

    __slots__ = ("_data",)

    def __init__(
        self, pairs: dict[str, object] | Iterable[tuple[str, object]] | None = None
    ) -> None:
        self._data: dict[str, object] = {}
        if pairs is not None:
            items = pairs.items() if isinstance(pairs, dict) else pairs
            for k, v in items:
                self._data[k] = v

    def __contains__(self, key: object) -> bool:
        return key in self._data

    def __len__(self) -> int:
        return len(self._data)

    def __iter__(self) -> Iterator[str]:
        return iter(self._data)

    def __eq__(self, other: object) -> bool:
        if isinstance(other, JsonObject):
            return self._data == other._data
        return NotImplemented

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"JsonObject({self._data!r})"

    def get(self, key: str, default: object = None) -> object:
        return self._data.get(key, default)

    def __getitem__(self, key: str) -> object:
        return self._data[key]

    def set(self, key: str, value: object) -> None:
        self._data[key] = value

    __setitem__ = set

    def delete(self, key: str) -> None:
        self._data.pop(key, None)

    def keys(self):
        return self._data.keys()

    def items(self):
        return self._data.items()

    def clone(self) -> JsonObject:
        """Deep copy, so callers can mutate without aliasing shared structure."""
        out = JsonObject()
        for k, v in self._data.items():
            out.set(k, _clone(v))
        return out


def _clone(value: object) -> object:
    if isinstance(value, JsonObject):
        return value.clone()
    if isinstance(value, list):
        return [_clone(v) for v in value]
    return value


def path(value: object, *keys: str) -> tuple[object, bool]:
    """Walk nested objects. Returns ``(value, found)``."""
    cur = value
    for key in keys:
        if not isinstance(cur, JsonObject) or key not in cur:
            return None, False
        cur = cur[key]
    return cur, True


def get_str(value: object, *keys: str) -> str:
    """Return the string at ``keys``, or ``""`` if absent or not a string."""
    got, ok = path(value, *keys)
    if not ok or not isinstance(got, str) or isinstance(got, Number):
        return ""
    return got


def parse(text: str) -> object:
    """Parse JSON, preserving number lexical form and key order.

    Duplicate member names are permitted (last wins), mirroring ``json.loads``,
    ``JSON.parse`` and ``serde_json``. Use :func:`parse_strict` to reject them.
    """
    return _Parser(text, strict=False).parse()


def parse_strict(text: str) -> object:
    """Parse JSON, rejecting duplicate object member names at any depth.

    Canonicalization section 3 requires duplicates to be REJECTED, but every
    mainstream parser silently keeps the last one — so two parties can disagree
    about what a document says while both accepting it. Use this for untrusted
    JSON before canonicalizing or verifying.
    """
    return _Parser(text, strict=True).parse()


_WS = " \t\n\r"


class _Parser:
    __slots__ = ("i", "s", "strict")

    def __init__(self, text: str, strict: bool) -> None:
        self.s = text
        self.i = 0
        self.strict = strict

    def parse(self) -> object:
        self._ws()
        value = self._value()
        self._ws()
        if self.i != len(self.s):
            raise JsonParseError(f"trailing characters at position {self.i}")
        return value

    def _ws(self) -> None:
        s, n = self.s, len(self.s)
        while self.i < n and s[self.i] in _WS:
            self.i += 1

    def _value(self) -> object:
        if self.i >= len(self.s):
            raise JsonParseError("unexpected end of input")
        c = self.s[self.i]
        if c == "{":
            return self._object()
        if c == "[":
            return self._array()
        if c == '"':
            return self._string()
        if c == "t":
            return self._literal("true", True)
        if c == "f":
            return self._literal("false", False)
        if c == "n":
            return self._literal("null", None)
        if c == "-" or c.isdigit():
            return self._number()
        raise JsonParseError(f"unexpected character {c!r} at position {self.i}")

    def _literal(self, word: str, value: object) -> object:
        if not self.s.startswith(word, self.i):
            raise JsonParseError(f"invalid literal at position {self.i}")
        self.i += len(word)
        return value

    def _object(self) -> JsonObject:
        self.i += 1  # '{'
        obj = JsonObject()
        seen: set[str] = set()
        self._ws()
        if self.i < len(self.s) and self.s[self.i] == "}":
            self.i += 1
            return obj
        while True:
            self._ws()
            if self.i >= len(self.s) or self.s[self.i] != '"':
                raise JsonParseError(f"expected object key at position {self.i}")
            key = self._string()
            if self.strict and key in seen:
                raise JsonParseError(f"duplicate object member name {key!r}")
            seen.add(key)
            self._ws()
            if self.i >= len(self.s) or self.s[self.i] != ":":
                raise JsonParseError(f"expected ':' at position {self.i}")
            self.i += 1
            self._ws()
            obj.set(key, self._value())
            self._ws()
            if self.i >= len(self.s):
                raise JsonParseError("unterminated object")
            c = self.s[self.i]
            if c == ",":
                self.i += 1
            elif c == "}":
                self.i += 1
                return obj
            else:
                raise JsonParseError(f"expected ',' or '}}' at position {self.i}")

    def _array(self) -> list:
        self.i += 1  # '['
        arr: list[object] = []
        self._ws()
        if self.i < len(self.s) and self.s[self.i] == "]":
            self.i += 1
            return arr
        while True:
            self._ws()
            arr.append(self._value())
            self._ws()
            if self.i >= len(self.s):
                raise JsonParseError("unterminated array")
            c = self.s[self.i]
            if c == ",":
                self.i += 1
            elif c == "]":
                self.i += 1
                return arr
            else:
                raise JsonParseError(f"expected ',' or ']' at position {self.i}")

    def _string(self) -> str:
        self.i += 1  # opening quote
        out: list[str] = []
        s, n = self.s, len(self.s)
        while self.i < n:
            c = s[self.i]
            if c == '"':
                self.i += 1
                return "".join(out)
            if c == "\\":
                self.i += 1
                if self.i >= n:
                    raise JsonParseError("unterminated escape")
                e = s[self.i]
                simple = {
                    '"': '"',
                    "\\": "\\",
                    "/": "/",
                    "b": "\b",
                    "f": "\f",
                    "n": "\n",
                    "r": "\r",
                    "t": "\t",
                }
                if e in simple:
                    out.append(simple[e])
                    self.i += 1
                elif e == "u":
                    out.append(self._unicode_escape())
                else:
                    raise JsonParseError(f"invalid escape {e!r}")
            elif c < "\x20":
                raise JsonParseError(f"unescaped control character at position {self.i}")
            else:
                out.append(c)
                self.i += 1
        raise JsonParseError("unterminated string")

    def _unicode_escape(self) -> str:
        """Decode ``\\uXXXX`` at ``self.i`` (on the 'u'), combining surrogates."""

        def hex4() -> int:
            if self.i + 5 > len(self.s):
                raise JsonParseError("truncated \\u escape")
            chunk = self.s[self.i + 1 : self.i + 5]
            try:
                code = int(chunk, 16)
            except ValueError as exc:
                raise JsonParseError(f"invalid \\u escape {chunk!r}") from exc
            self.i += 5
            return code

        code = hex4()
        if 0xD800 <= code <= 0xDBFF and self.s.startswith("\\u", self.i):
            self.i += 1  # step onto the 'u' for hex4
            low = hex4()
            if 0xDC00 <= low <= 0xDFFF:
                return chr(0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00))
            # Not a valid pair: emit a replacement char and reprocess the second
            # escape on its own.
            self.i -= 6
            return "�"
        if 0xD800 <= code <= 0xDFFF:
            return "�"  # lone surrogate
        return chr(code)

    def _number(self) -> Number:
        start = self.i
        s, n = self.s, len(self.s)
        if self.i < n and s[self.i] == "-":
            self.i += 1
        while self.i < n and s[self.i].isdigit():
            self.i += 1
        if self.i < n and s[self.i] == ".":
            self.i += 1
            while self.i < n and s[self.i].isdigit():
                self.i += 1
        if self.i < n and s[self.i] in "eE":
            self.i += 1
            if self.i < n and s[self.i] in "+-":
                self.i += 1
            while self.i < n and s[self.i].isdigit():
                self.i += 1
        literal = s[start : self.i]
        try:
            float(literal)
        except (ValueError, OverflowError) as exc:
            raise JsonParseError(f"invalid number {literal!r}") from exc
        return Number(literal)
