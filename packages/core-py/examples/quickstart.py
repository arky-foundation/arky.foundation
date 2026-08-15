"""Produce a TIM, verify it, and show that tampering is caught.

Run: PYTHONPATH=src python examples/quickstart.py
"""

from __future__ import annotations

import arky_core as arky


def obj(**pairs: object) -> arky.JsonObject:
    out = arky.JsonObject()
    for key, value in pairs.items():
        out.set(key, value)
    return out


def main() -> None:
    kp = arky.generate_keypair()

    body = obj(
        time=obj(ts="2025-10-15T12:00:00Z"),
        identity=obj(id=kp.did),
        measurement=obj(
            name="temperature",
            value=arky.Number("22.5"),
            unit="arky:unit/temp.C",
            method=obj(type="sensor", source="device:temp-01"),
        ),
    )

    tim = arky.create_tim(body, kp.seed)
    canonical = arky.canonicalize(arky.canonical_body(tim))

    print("did:      ", kp.did)
    print("canonical:", canonical)
    print("cid:      ", arky.get_str(tim, "cid"))

    result = arky.verify_tim(tim)
    print(
        f"verified:  valid={result.valid} "
        f"cid={result.cid_valid} sig={result.signature_valid}"
    )

    # Tamper with the measurement: verification must fail.
    forged = tim.clone()
    measurement = forged.get("measurement").clone()
    measurement.set("value", arky.Number("999"))
    forged.set("measurement", measurement)
    bad = arky.verify_tim(forged)
    print(f"tampered:  valid={bad.valid} errors={bad.errors}")


if __name__ == "__main__":
    main()
