/**
 * @arky/core quickstart: generate a key, sign a TIM, verify it, witness it.
 * Run: bun run examples/quickstart.ts
 */
import { generateKeyPair, createTim, verifyTim, signDetached, canonicalize, canonicalBody } from '../src/index.ts';

// 1. A keypair whose did:key matches the signing key (no DID/key mismatch).
const issuer = generateKeyPair();

// 2. Produce a signed, content-addressed TIM (Time + Identity + Measurement).
const tim = createTim(
  {
    ts: '2025-10-15T12:00:00Z',
    identity: { id: issuer.did },
    measurement: {
      name: 'temperature',
      value: 22.5,
      unit: 'degC',
      method: { type: 'sensor', source: 'device:datacenter-temp-01' },
    },
  },
  issuer.privateKey,
);
console.log('TIM cid:', tim.cid);

// 3. Verify it. For a did:key identity the verifying key is resolved
//    automatically from identity.id — nothing else to wire up.
console.log('valid:', verifyTim(tim).valid); // true

// 4. (Optional) A second party witnesses the same evidence by co-signing the
//    SAME canonical bytes; the witness JWS is appended to time.witnesses[].
const notary = generateKeyPair();
const canonical = new TextEncoder().encode(canonicalize(canonicalBody(tim)));
const witnessSig = signDetached(canonical, notary.privateKey);
const witnessed = { ...tim, time: { ...tim.time, witnesses: [witnessSig] } };

// Provide a key resolver: the issuer is a did:key (auto-resolvable), and the
// witness key is supplied directly. `t.__witness` is set when resolving a
// witness signature, the issuer otherwise.
const result = verifyTim(witnessed, (t: any) =>
  t.__witness ? notary.publicKey : issuer.publicKey,
);
console.log('witnessed valid:', result.valid, '| witnesses_valid:', result.witnesses_valid);
