/**
 * Ed25519 key helpers for Arky. The signing key is a 32-byte seed; the matching
 * verification identity is a `did:key:z6Mk…` derived from the public key so that
 * `identity.id` resolves to the key that signed the TIM (ARKY-TIM-v1 §6.1).
 *
 * Using these together guarantees the DID and the key agree — the common
 * footgun when hand-constructing identities.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { base58btcEncode } from './cid.ts';

export interface KeyPair {
  /** 32-byte Ed25519 seed (private). Keep secret. */
  privateKey: Uint8Array;
  /** 32-byte Ed25519 public key. */
  publicKey: Uint8Array;
  /** did:key identity that resolves to `publicKey` (use as identity.id). */
  did: string;
}

/** Derive the did:key (multicodec 0xed01 + pubkey, base58btc, 'z' prefix). */
export function didKeyFromPublicKey(publicKey: Uint8Array): string {
  const mc = new Uint8Array(2 + publicKey.length);
  mc[0] = 0xed;
  mc[1] = 0x01;
  mc.set(publicKey, 2);
  return 'did:key:z' + base58btcEncode(mc);
}

/** Public key + did:key for a given 32-byte seed. */
export function fromSeed(privateKey: Uint8Array): KeyPair {
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey, did: didKeyFromPublicKey(publicKey) };
}

/** Generate a fresh random Ed25519 keypair with its matching did:key. */
export function generateKeyPair(): KeyPair {
  return fromSeed(ed25519.utils.randomPrivateKey());
}
