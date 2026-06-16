/**
 * Content identifier per ARKY-TIM-Canonicalization-v1 §4:
 *   cid = multibase('z', base58btc(multihash(sha2-256, canonical_bytes)))
 * where multihash = 0x12 0x20 || sha256(bytes). NOT an IPFS CID.
 *
 * Clean-room: base58btc encode/decode implemented here (Bitcoin alphabet).
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { canonicalize } from './canonicalize.ts';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_MAP: Record<string, number> = Object.fromEntries([...B58].map((c, i) => [c, i]));

/** base58btc (Bitcoin) encode of raw bytes. */
export function base58btcEncode(bytes: Uint8Array): string {
  // Count leading zero bytes -> leading '1's.
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let out = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

/** base58btc (Bitcoin) decode to raw bytes. */
export function base58btcDecode(str: string): Uint8Array {
  let zeros = 0;
  while (zeros < str.length && str[zeros] === '1') zeros++;

  const bytes: number[] = [];
  for (let i = zeros; i < str.length; i++) {
    const val = B58_MAP[str[i]];
    if (val === undefined) throw new Error(`base58: invalid character '${str[i]}'`);
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) out[zeros + bytes.length - 1 - i] = bytes[i];
  return out;
}

/** Encode raw bytes as multibase base58btc (prefix 'z'). */
export function toMultibase(bytes: Uint8Array): string {
  return 'z' + base58btcEncode(bytes);
}

/** Decode a multibase 'z…' (base58btc) string to raw bytes. */
export function fromMultibase(s: string): Uint8Array {
  if (s[0] !== 'z') throw new Error(`multibase: expected base58btc 'z' prefix, got '${s[0]}'`);
  return base58btcDecode(s.slice(1));
}

/** multihash(sha2-256, bytes) = 0x12 0x20 || digest. */
export function multihashSha256(bytes: Uint8Array): Uint8Array {
  const digest = sha256(bytes);
  const mh = new Uint8Array(2 + digest.length);
  mh[0] = 0x12;
  mh[1] = 0x20;
  mh.set(digest, 2);
  return mh;
}

/** Compute a TIM cid over canonical bytes (already a string). */
export function cidFromCanonical(canonical: string): string {
  return toMultibase(multihashSha256(new TextEncoder().encode(canonical)));
}

/** Compute a cid over an arbitrary value (canonicalizes first). */
export function computeCid(value: unknown): string {
  return cidFromCanonical(canonicalize(value));
}
