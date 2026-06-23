/**
 * Detached-payload JWS (compact) with Ed25519/EdDSA, per ARKY-TIM-v1 §6 and
 * RFC 7797 (b64:false). The compact form is `<protected>..<signature>` — the
 * payload segment is empty; the payload is the JCS canonical bytes supplied
 * separately when signing/verifying.
 *
 * Clean-room: base64url and the RFC 7797 signing-input construction are
 * implemented here over @noble/curves ed25519 (not via jose).
 */

import { ed25519 } from '@noble/curves/ed25519';

export interface ProtectedHeader {
  alg: 'EdDSA';
  b64: false;
  crit: ['b64'];
  typ?: string;
  kid?: string;
}

export function base64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * RFC 7797 signing input for a detached, unencoded payload:
 *   ASCII(BASE64URL(protected)) || '.' || payload_bytes
 */
function signingInput(protectedB64: string, payload: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(protectedB64 + '.');
  const out = new Uint8Array(prefix.length + payload.length);
  out.set(prefix, 0);
  out.set(payload, prefix.length);
  return out;
}

/** Sign canonical `payload` bytes; returns compact `<protected>..<signature>`. */
export function signDetached(payload: Uint8Array, privateKey: Uint8Array, kid?: string): string {
  const header: ProtectedHeader = {
    alg: 'EdDSA',
    b64: false,
    crit: ['b64'],
    typ: 'JWS',
    ...(kid ? { kid } : {}),
  };
  const protectedB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const sig = ed25519.sign(signingInput(protectedB64, payload), privateKey);
  return `${protectedB64}..${base64urlEncode(sig)}`;
}

/** Decode the protected header of a compact JWS. */
export function decodeProtectedHeader(jws: string): ProtectedHeader & Record<string, unknown> {
  const protectedB64 = jws.split('.')[0];
  return JSON.parse(new TextDecoder().decode(base64urlDecode(protectedB64)));
}

/**
 * Verify a detached compact JWS over `payload` bytes against an Ed25519 public
 * key. Returns true iff the signature is valid and the header is well-formed
 * (alg EdDSA, b64:false, crit includes b64, empty payload segment).
 */
export function verifyDetached(jws: string, payload: Uint8Array, publicKey: Uint8Array): boolean {
  const parts = jws.split('.');
  if (parts.length !== 3 || parts[1].length !== 0) return false;
  const [protectedB64, , sigB64] = parts;
  let header: ProtectedHeader;
  try {
    header = JSON.parse(new TextDecoder().decode(base64urlDecode(protectedB64)));
  } catch {
    return false;
  }
  if (header.alg !== 'EdDSA' || header.b64 !== false || !header.crit?.includes('b64')) return false;
  try {
    return ed25519.verify(base64urlDecode(sigB64), signingInput(protectedB64, payload), publicKey);
  } catch {
    return false;
  }
}
