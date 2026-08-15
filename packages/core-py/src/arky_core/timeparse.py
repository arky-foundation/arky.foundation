"""RFC 3339 and ISO-8601 duration parsing for the Kernel.

Hand-rolled rather than using ``datetime.fromisoformat``, because the contract
is to match ECMAScript ``Date.parse`` (which the TypeScript stack uses)
exactly — including *rejecting* trailing garbage and a missing timezone
designator. ``datetime.fromisoformat`` differs in what it accepts (it takes a
designator-less timestamp, and since 3.11 a trailing ``Z``), and a divergence
here would silently change which evidence falls inside a Kernel window.

Both functions return ``None`` where ``Date.parse`` yields ``NaN``.
"""

from __future__ import annotations

__all__ = ["parse_iso_duration_ms", "parse_rfc3339_ms"]


def parse_iso_duration_ms(text: str) -> int | None:
    """Convert an ISO-8601 duration to milliseconds.

    Covers the ``P[nD][T[nH][nM][nS]]`` subset the vectors use.
    """
    if not text.startswith("P"):
        return None
    rest = text[1:]
    days_part, sep, time_part = rest.partition("T")

    total = 0.0
    if days_part:
        if not days_part.endswith("D"):
            return None
        try:
            total += float(days_part[:-1]) * 86400
        except ValueError:
            return None
    if sep:
        remainder = time_part
        for suffix, multiplier in (("H", 3600.0), ("M", 60.0), ("S", 1.0)):
            index = remainder.find(suffix)
            if index >= 0:
                try:
                    total += float(remainder[:index]) * multiplier
                except ValueError:
                    return None
                remainder = remainder[index + 1 :]
    return int(total * 1000)


def _digits(text: str, start: int, end: int) -> int | None:
    chunk = text[start:end]
    if len(chunk) != end - start or not chunk.isdigit() or not chunk.isascii():
        return None
    return int(chunk)


def parse_rfc3339_ms(text: str) -> int | None:
    """Parse an RFC3339 timestamp to epoch milliseconds (UTC).

    Honors the timezone designator: ``Z`` is UTC, and ``+HH:MM`` / ``-HH:MM``
    are applied to reach UTC, so ``12:00:00+02:00`` is the same instant as
    ``10:00:00Z``. Optional fractional seconds are truncated to milliseconds.

    Returns None for malformed input, which is what ``Date.parse`` signals with
    ``NaN``: trailing characters, a missing designator, an out-of-range offset,
    or a ``.`` with no digits.
    """
    if len(text) < 20 or text[10] != "T":
        return None

    year = _digits(text, 0, 4)
    month = _digits(text, 5, 7)
    day = _digits(text, 8, 10)
    hour = _digits(text, 11, 13)
    minute = _digits(text, 14, 16)
    second = _digits(text, 17, 19)
    if (
        year is None
        or month is None
        or day is None
        or hour is None
        or minute is None
        or second is None
    ):
        return None
    if text[4] != "-" or text[7] != "-" or text[13] != ":" or text[16] != ":":
        return None

    index = 19
    millis = 0
    if text[index] == ".":
        index += 1
        start = index
        while index < len(text) and text[index].isdigit() and text[index].isascii():
            index += 1
        fraction = text[start:index]
        if not fraction:
            return None  # '.' with no digits
        millis = int((fraction[:3]).ljust(3, "0"))

    if index >= len(text):
        return None  # designator required
    offset_ms = 0
    designator = text[index]
    if designator == "Z":
        index += 1
    elif designator in "+-":
        sign = -1 if designator == "-" else 1
        index += 1
        if index + 5 > len(text) or text[index + 2] != ":":
            return None
        offset_hours = _digits(text, index, index + 2)
        offset_minutes = _digits(text, index + 3, index + 5)
        if offset_hours is None or offset_minutes is None:
            return None
        if offset_hours > 23 or offset_minutes > 59:
            return None
        offset_ms = sign * (offset_hours * 3600 + offset_minutes * 60) * 1000
        index += 5
    else:
        return None

    if index != len(text):
        return None  # trailing characters

    days = _days_from_civil(year, month, day)
    local_ms = (days * 86400 + hour * 3600 + minute * 60 + second) * 1000 + millis
    return local_ms - offset_ms


def _days_from_civil(year: int, month: int, day: int) -> int:
    """Days since the Unix epoch (Howard Hinnant's civil-from-days)."""
    y = year - 1 if month <= 2 else year
    era = (y if y >= 0 else y - 399) // 400
    yoe = y - era * 400
    mp = month + 9 if month <= 2 else month - 3
    doy = (153 * mp + 2) // 5 + day - 1
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
    return era * 146097 + doe - 719468
