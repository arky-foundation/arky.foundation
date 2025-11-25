---
spec_id: ARKY-EXAMPLES-v1
title: Arky — Examples & Tutorials
version: v1
status: stable
effective: 2025-10-15
doc_type: guide
normative_default: false
summary: >
  Pointers to walkthroughs and copy‑paste examples that complement
  the normative specifications.
permalink: /specs/ARKY-EXAMPLES-v1
last_updated: 2025-10-15
---

# Arky — Examples & Tutorials (v1)

This document now serves as a concise index. Full tutorials and copy‑paste examples live under `examples/`.

## Quick Links
- TIM basics: `examples/flows/tim-basic.md`
- Notary witnessing: `examples/flows/notary-witness.md`
- Settler execution: `examples/flows/settler-execution.md`
- Cloud autoscaling (end‑to‑end): `examples/flows/cloud-autoscaling.md`
- Discovery well‑known samples: `examples/discovery/well-known/arky/`
- Service descriptors (schema‑compliant):
  - Notary: `examples/service-descriptors/notary/descriptor.json`
  - Settler: `examples/service-descriptors/settler/descriptor.json`
<!-- Tools are provided by SDKs/CLIs; this repo omits helpers. -->

## How To Use
- Follow flows in `examples/flows/` for end‑to‑end walkthroughs.
- Validate JSON against schemas in `schemas/` during implementation.
- Use vectors in `vectors/` to check conformance.

## Related Specs
- TIM: `specs/core/ARKY-TIM-v1.md`
- Kernel: `specs/core/ARKY-KERNEL-v1.md`
- Notary: `specs/core/ARKY-NOTARY-v1.md`
- Settlers: `specs/core/ARKY-SETTLERS-v1.md`
- Vectors: `specs/development/ARKY-VECTORS-v1.md`

---

## 2. Kernel Evaluation Walkthrough

### 2.1 Scenario: Cloud Auto-scaling Payment

**Context:** AI agent monitoring CPU usage, authorized to send up to $500/day on compute.

#### Step 1: Commitment Submitted

```json
{
  "scope": "arky:scope/cloud-autoscaling@v1",
  "actor": "did:web:infra.company.com:scaling-controller",
  "intent": {
    "do": "provision_compute",
    "budget": {
      "value": 500,
      "unit": "USD"
    }
  },
  "measure": [{
    "name": "cpu_load",
    "from": "prometheus:/api/v1/query?query=avg(cpu_utilization)",
    "window": {
      "max_age": "PT5M"
    },
    "assert": "cpu_load > 80",
    "require": {
      "min_witnesses": 1
    }
  }],
  "consequence": [
    {
      "if": "PASS",
      "then": [{
        "name": "arky:verb/pay@v1",
        "args": {
          "to": "acct:ach:us:cloud-provider-invoice",
          "amount": {
            "value": 250,
            "unit": "USD"
          },
          "memo": "10 compute nodes for 1 hour"
        }
      }],
      "limits": {
        "amount_max": {
          "value": 500,
          "unit": "USD"
        },
        "expiry": "2025-10-15T15:00:00Z"
      }
    },
    {
      "if": "FAIL",
      "then": [{
        "name": "arky:verb/signal@v1",
        "args": {
          "topic": "ops-alerts",
          "payload_hash": "sha256:...",
          "payload": {
            "message": "CPU load below threshold, scaling not needed"
          }
        }
      }]
    }
  ],
  "cid": "zQmKERNEL456...",
  "sig": "eyJ...controller_sig"
}
```

#### Step 2: TIM Receipts Provided

```json
[
  {
    "time": {
      "ts": "2025-10-15T14:30:00Z",
      "witnesses": ["eyJ...notary1_sig"]
    },
    "identity": {
      "id": "did:web:monitoring.company.com:prometheus-01"
    },
    "measurement": {
      "name": "cpu.utilization",
      "value": 87.5,
      "unit": "%",
      "method": {
        "type": "computation",
        "source": "prometheus:avg_over_time",
        "version": "v1",
        "params": {
          "query": "avg(rate(cpu_seconds_total[5m]))",
          "interval": "5m"
        }
      }
    },
    "cid": "zQmCPU123...",
    "sig": "eyJ...prometheus_sig"
  }
]
```

#### Step 3: Evaluation Process

**Validation:**
```
✓ Commitment signature valid (controller key verified)
✓ Actor authorized for scope cloud-autoscaling@v1
✓ Budget within policy limits ($500 ≤ $1000 daily cap)
✓ Expiry in future (2025-10-15T15:00:00Z)
```

**Receipt Selection:**
```
MeasureSpec: "cpu_load"
Window: max_age=PT5M (5 minutes)
Current time: 2025-10-15T14:30:05Z

Candidate receipts:
1. zQmCPU123 - ts=2025-10-15T14:30:00Z
   Age: 5 seconds ✓ (within 5 minutes)
   Name matches: "cpu.utilization" ✓
   Witness count: 1 ✓ (>= min_witnesses=1)

Selected: [zQmCPU123]
```

**Symbol Binding:**
```
cpu_load = 87.5  (from zQmCPU123.measurement.value)
```

**Assertion Evaluation:**
```
Expression: "cpu_load > 80"
Bound: 87.5 > 80
Result: true → PASS
```

**Consequence Resolution:**
```
ConsequenceSpec[0]: if="PASS" → MATCH
  then: [pay@v1]
  Authorized verbs: [
    {
      name: "arky:verb/pay@v1",
      args: {
        to: "acct:ach:us:cloud-provider-invoice",
        amount: { value: 250, unit: "USD" }
      }
    }
  ]

ConsequenceSpec[1]: if="FAIL" → SKIP
```

**Conflict Detection:**
```
Authorized verbs: 1 (pay@v1)
Conflicts: None
```

#### Step 4: Decision Produced

```json
{
  "kernel_cid": "zQmKERNEL456...",
  "actor": "did:web:infra.company.com:scaling-controller",
  "scope": "arky:scope/cloud-autoscaling@v1",
  "assertions": [{
    "name": "cpu_load",
    "result": "PASS",
    "value": 87.5,
    "inputs": ["zQmCPU123..."]
  }],
  "authorized": [{
    "name": "arky:verb/pay@v1",
    "args": {
      "to": "acct:ach:us:cloud-provider-invoice",
      "amount": {
        "value": 250,
        "unit": "USD"
      },
      "memo": "10 compute nodes for 1 hour"
    }
  }],
  "status": "APPROVED",
  "ts_eval": "2025-10-15T14:30:05Z",
  "cid": "zQmDECISION789...",
  "sig": "eyJ...kernel_sig"
}
```

---

## 3. Settler Pre-checks Deep Dive

### 3.1 Scenario: ACH Payment Execution

**ExecutionRequest:**
```json
{
  "request_id": "req_2025-10-15_001",
  "commitment_cid": "zQmKERNEL456...",
  "verbs": [{
    "verb": "arky:verb/pay@v1",
    "rail": "arky:rail/ach:us@v1",
    "args": {
      "to": "acct:ach:us:cloud-provider-invoice:123456789",
      "amount": {
        "value": 250,
        "unit": "USD"
      },
      "memo": "10 compute nodes for 1 hour"
    },
    "max_fee": {
      "value": 5,
      "unit": "USD"
    },
    "deadline": "2025-10-15T15:00:00Z"
  }],
  "anchors_required": true,
  "policy": {
    "id": "arky:policy/enterprise-payments@v1",
    "tim_level": "T2",
    "max_tim_age": 300000
  },
  "idempotency_key": "idem_kernel456_pay_ach",
  "context": {
    "actor": "did:web:infra.company.com:scaling-controller"
  }
}
```

### Pre-check Steps (Detailed)

#### Check 1: Request Validation

```typescript
// 1.1 Check deadline
const now = Date.now(); // 2025-10-15T14:30:05Z
const deadline = Date.parse("2025-10-15T15:00:00Z");
if (now > deadline) {
  return error("settler.deadline_exceeded");
}
// Result: ✓ 14:30:05 < 15:00:00

// 1.2 Validate verb in registry
const verbDef = await registry.getVerb("arky:verb/pay@v1");
if (!verbDef) {
  return error("settler.unknown_verb");
}
// Result: ✓ pay@v1 found

// 1.3 Validate rail supports verb
const railDef = await registry.getRail("arky:rail/ach:us@v1");
if (!railDef.supports_verbs.includes("pay@v1")) {
  return error("settler.unsupported_rail");
}
// Result: ✓ ACH supports pay

// 1.4 Validate args schema
const schema = verbDef.args_schema;
const valid = validateJSON(request.verbs[0].args, schema);
if (!valid) {
  return error("settler.invalid_args", valid.errors);
}
// Result: ✓ to, amount, memo valid
```

#### Check 2: Commitment Validation

```typescript
// 2.1 Fetch commitment
const commitment = await fetchCommitment("zQmKERNEL456...");
// Result: ✓ Commitment retrieved

// 2.2 Verify signature
const pubkey = await resolveKey(commitment.actor);
const sigValid = await verifyJWS(commitment.sig, commitment, pubkey);
if (!sigValid) {
  return error("settler.auth_failed");
}
// Result: ✓ Signature valid

// 2.3 Check actor authorization
const authCheck = await policyEngine.canExecute({
  actor: "did:web:infra.company.com:scaling-controller",
  verb: "pay@v1",
  scope: "arky:scope/cloud-autoscaling@v1"
});
if (!authCheck.authorized) {
  return error("settler.policy_denied", authCheck.reason);
}
// Result: ✓ Actor authorized
```

#### Check 3: TIM Validation

```typescript
// 3.1 Fetch TIMs
const timCids = commitment.assertions[0].inputs; // ["zQmCPU123..."]
const tims = await fetchTIMs(timCids);
// Result: ✓ 1 TIM retrieved

// 3.2 Verify TIM signatures
const requiredLevel = request.policy?.tim_level || "T2";
for (const tim of tims) {
  const timValid = await verifyTIM(tim, requiredLevel);
  if (!timValid) {
    return error("tim.invalid_signature", tim.cid);
  }
}
// Result: ✓ TIM signature valid, T2 level met

// 3.3 Check TIM freshness
const maxAge = request.policy?.max_tim_age; // 300000ms = 5min
if (maxAge) {
  const timAge = now - Date.parse(tims[0].time.ts);
  if (timAge > maxAge) {
    return error("tim.expired");
  }
}
// Result: ✓ TIM age = 5 seconds < 5 minutes
```

#### Check 4: Rail-Specific Checks

```typescript
// 4.1 Check balance
const sourceAccount = "acct:ach:us:company-operating:987654321";
const balance = await achRail.checkBalance(sourceAccount);
const required = 250 + 5; // amount + max_fee
if (balance < required) {
  return error("settler.insufficient_funds", {
    balance,
    required
  });
}
// Result: ✓ Balance = $10,000 >= $255

// 4.2 Check rail health
const railStatus = await achRail.healthCheck();
if (!railStatus.available) {
  return error("settler.rail_unavailable", railStatus.reason);
}
// Result: ✓ ACH rail operational

// 4.3 Check rate limits
const rateLimitKey = `${request.context.actor}:${request.verbs[0].rail}`;
const rateLimit = await rateLimiter.check(rateLimitKey);
if (rateLimit.limited) {
  return error("settler.rate_limited", {
    retry_after_ms: rateLimit.retry_after_ms
  });
}
// Result: ✓ 5 requests in last hour < 100/hour limit
```

#### Check 5: Policy Gates

```typescript
// 5.1 KYC Check
const kycResult = await complianceEngine.checkKYC({
  actor: "did:web:infra.company.com:scaling-controller",
  counterparty: "acct:ach:us:cloud-provider-invoice:123456789"
});
if (!kycResult.passed) {
  return error("settler.policy_denied", `KYC: ${kycResult.reason}`);
}
// Result: ✓ Both parties KYC-verified

// 5.2 Sanctions Screening
const sanctionsResult = await complianceEngine.checkSanctions(
  "acct:ach:us:cloud-provider-invoice:123456789"
);
if (sanctionsResult.blocked) {
  return error("settler.policy_denied", `Sanctions: ${sanctionsResult.reason}`);
}
// Result: ✓ Not on OFAC list

// 5.3 AML Check
const amlResult = await complianceEngine.checkAML({
  amount: 250,
  currency: "USD",
  from: sourceAccount,
  to: "acct:ach:us:cloud-provider-invoice:123456789"
});
if (amlResult.flagged) {
  return error("settler.policy_denied", `AML: ${amlResult.reason}`);
}
// Result: ✓ Amount below reporting threshold
```

### Pre-checks Summary

```
✓ All 5 pre-check categories passed
✓ Total time: 1.2 seconds (< 5s requirement)
→ Proceed to execution
```

---

## 4. Notary Anchoring Tutorial

### 4.1 Batch Anchoring to Ethereum

**Scenario:** Anchor 5 TIM receipts to Ethereum mainnet

#### Step 1: Receive TIMs

```json
[
  { "cid": "zQmTIM1...", "canonical_bytes": "..." },
  { "cid": "zQmTIM2...", "canonical_bytes": "..." },
  { "cid": "zQmTIM3...", "canonical_bytes": "..." },
  { "cid": "zQmTIM4...", "canonical_bytes": "..." },
  { "cid": "zQmTIM5...", "canonical_bytes": "..." }
]
```

#### Step 2: Build Merkle Tree

```
        root (zQmROOT...)
       /                \
    H_AB              H_CDE
    /  \             /  |  \
  H_A  H_B        H_C H_D H_E
   |    |          |   |   |
TIM1 TIM2        TIM3 TIM4 TIM5

Calculation:
H_A = SHA-256(TIM1.canonical_bytes)
H_B = SHA-256(TIM2.canonical_bytes)
H_AB = SHA-256(min(H_A, H_B) || max(H_A, H_B))

H_C = SHA-256(TIM3.canonical_bytes)
H_D = SHA-256(TIM4.canonical_bytes)
H_E = SHA-256(TIM5.canonical_bytes)
H_CD = SHA-256(min(H_C, H_D) || max(H_C, H_D))
H_CDE = SHA-256(min(H_CD, H_E) || max(H_CD, H_E))

root = SHA-256(min(H_AB, H_CDE) || max(H_AB, H_CDE))
```

#### Step 3: Submit to Ethereum

```solidity
// Smart contract call
contract.anchorBatch({
  batchId: "batch_2025-10-15_001",
  merkleRoot: "0x1a2b3c4d...",
  count: 5
});

// Transaction result
tx_hash: "0xabc123..."
block: 12345678
timestamp: 2025-10-15T14:30:10Z
```

#### Step 4: Track Finality

```
Block 12345678: Included (1 confirmation)
Block 12345679: 2 confirmations
Block 12345680: 3 confirmations
...
Block 12345690: 13 confirmations ✓ (finality_depth met)

Status: pending → final
```

#### Step 5: Generate Inclusion Proofs

**Proof for TIM3:**

```json
{
  "target": "caip2:eip155:1",
  "locator": "0xabc123...#log0",
  "root": "0x1a2b3c4d...",
  "leaf": "zQmTIM3...",
  "path": [
    "H_D",
    "H_E",
    "H_AB"
  ],
  "alg": "merkle-sha256-v1"
}
```

**Verification:**
```
current = H_C (TIM3)
current = SHA-256(min(current, H_D) || max(current, H_D)) = H_CD
current = SHA-256(min(H_CD, H_E) || max(H_CD, H_E)) = H_CDE
current = SHA-256(min(H_CDE, H_AB) || max(H_CDE, H_AB)) = root ✓
```

---

## 5. End-to-End Scenarios

### 5.1 AI Agent: Cloud Auto-scaling Payment

**Complete flow:** Evidence → Decision → Execution → Receipt

#### Step 1: Agent Creates TIM Evidence

```json
{
  "time": {
    "ts": "2025-10-15T14:30:00Z",
    "witnesses": ["eyJhbGciOi...sig1", "eyJhbGciOi...sig2"]
  },
  "identity": {
    "id": "did:web:infra.company.com:scaling-controller",
    "claims": ["urn:vc:soc2-certified:2025"]
  },
  "measurement": {
    "name": "cpu.utilization.avg_5min",
    "value": 87.3,
    "unit": "percent",
    "method": {
      "type": "aggregation",
      "source": "prometheus:infra-metrics",
      "version": "v2.45",
      "params": { "query": "avg(cpu_usage)", "window": "5m" }
    },
    "provenance": { "cluster": "us-east-1-prod", "namespace": "ai" }
  },
  "cid": "zQmCPU789xyz...",
  "sig": "eyJhbGciOi..."
}
```

#### Step 2: Kernel Evaluates Decision

```json
{
  "actor": "did:web:infra.company.com:scaling-controller",
  "assertions": [{
    "measure": [{ "name": "cpu", "cid": "zQmCPU789xyz..." }],
    "assert": ["cpu > 85"],
    "consequence": {
      "decision": "APPROVED",
      "verbs": [{
        "verb": "pay@v1",
        "rail": "arky:rail/ach:us@v1",
        "args": {
          "to": "acct:ach:us:cloud-provider-invoice:123456789",
          "amount": { "value": 250, "unit": "USD" },
          "memo": "Auto-scaling: +5 nodes (cpu=87.3%)"
        }
      }]
    }
  }],
  "policy": "arky:pac/cloud-autoscaling@v1",
  "cid": "zQmKERNEL456...",
  "sig": "eyJhbGciOi..."
}
```

**Evaluation:**
- CPU measurement = 87.3% > 85% threshold
- Assertion passes
- Decision: APPROVED
- Consequence: Execute pay@v1

#### Step 3: Settler Executes Payment

**Pre-checks:**
```
✓ Commitment signature valid
✓ Actor authorized (cloud-autoscaling policy)
✓ TIM signature valid (T2 level)
✓ Balance sufficient ($10,000 > $255 required)
✓ KYC/AML checks passed
```

**Execution:**
```json
{
  "request_id": "req-20251015-143005-abc",
  "commitment_cid": "zQmKERNEL456...",
  "verbs": [{
    "verb": "pay@v1",
    "rail": "arky:rail/ach:us@v1",
    "status": "success",
    "result": {
      "trace_id": "ach-tx-987654321",
      "debit": { "account": "...987654321", "amount": 250 },
      "credit": { "account": "...123456789", "amount": 250 },
      "fee": 2.50,
      "settled_at": "2025-10-15T14:30:03Z"
    }
  }],
  "ts": "2025-10-15T14:30:03Z",
  "cid": "zQmXR123abc...",
  "sig": "eyJhbGciOi..."
}
```

**Timeline:**
```
14:30:00 - TIM created (CPU measurement)
14:30:01 - Kernel evaluated (decision APPROVED)
14:30:02 - Settler pre-checks passed
14:30:03 - ACH transfer executed
14:30:03 - XR receipt created
```

---

### 5.2 Aerospace: Satellite Maneuver Authorization

**Scenario:** Ground control + two operators authorize fuel burn for orbital adjustment

#### Multi-Witness TIMs

```json
// TIM 1: Collision avoidance alert
{
  "identity": { "id": "did:web:norad.mil:collision-alert-system" },
  "measurement": {
    "name": "collision.probability",
    "value": 0.0034,
    "unit": "probability",
    "method": { "type": "simulation", "source": "conjunction-analysis" }
  },
  "cid": "zQmCOLLISION1..."
}

// TIM 2: Operator 1 approval
{
  "identity": { "id": "did:web:ops.aerospace.com:operator:alice" },
  "measurement": {
    "name": "maneuver.approval",
    "value": true,
    "unit": "boolean",
    "method": { "type": "manual", "source": "operator-console" }
  },
  "cid": "zQmAPPROVAL1..."
}

// TIM 3: Operator 2 approval
{
  "identity": { "id": "did:web:ops.aerospace.com:operator:bob" },
  "measurement": {
    "name": "maneuver.approval",
    "value": true,
    "unit": "boolean"
  },
  "cid": "zQmAPPROVAL2..."
}
```

#### Kernel Multi-Witness Decision

```json
{
  "assertions": [{
    "measure": [
      { "name": "collision_risk", "cid": "zQmCOLLISION1..." },
      { "name": "op1", "cid": "zQmAPPROVAL1..." },
      { "name": "op2", "cid": "zQmAPPROVAL2..." }
    ],
    "assert": [
      "collision_risk > 0.001",
      "op1 == true",
      "op2 == true"
    ],
    "consequence": {
      "decision": "APPROVED",
      "verbs": [{
        "verb": "control@v1",
        "rail": "arky:rail/satellite:command@v1",
        "args": {
          "target": "sat:noaa:20",
          "command": "burn",
          "params": { "delta_v": 0.5, "axis": "retrograde", "duration_s": 30 }
        }
      }]
    }
  }],
  "policy": "arky:pac/two-person-rule@v1"
}
```

**Policy Requirements:**
- Two-person approval (Alice + Bob)
- Collision risk > 0.1% threshold
- Both approvals within 5-minute window
- → Decision: APPROVED

#### Settler XR

```json
{
  "verbs": [{
    "verb": "control@v1",
    "status": "success",
    "result": {
      "trace_id": "cmd-sat20-20251015-143010",
      "uplink_confirmed": true,
      "telemetry": {
        "burn_duration": 30.2,
        "delta_v_actual": 0.49,
        "fuel_consumed_kg": 1.2
      }
    }
  }]
}
```

---

### 5.3 Healthcare: Automated Medication Dispensing

**Scenario:** IoT dispenser releases dose based on patient vitals + doctor approval

#### TIM: Patient Vitals

```json
{
  "identity": { "id": "did:web:hospital.org:patient-monitor:room-302" },
  "measurement": {
    "name": "heart.rate",
    "value": 78,
    "unit": "bpm",
    "method": { "type": "sensor", "source": "device:ecg-monitor" },
    "code": "LOINC:8867-4",
    "device": "urn:medical:device:ecg:philips-mx800"
  },
  "cid": "zQmHEART123..."
}
```

#### TIM: Doctor Approval

```json
{
  "identity": {
    "id": "did:web:hospital.org:doctor:smith",
    "claims": ["urn:vc:medical-license:ca:MD123456"]
  },
  "measurement": {
    "name": "medication.approval",
    "value": true,
    "unit": "boolean",
    "method": { "type": "manual", "source": "ehr-system" }
  },
  "cid": "zQmDOCTOR456..."
}
```

#### Kernel Decision

```json
{
  "assertions": [{
    "measure": [
      { "name": "hr", "cid": "zQmHEART123..." },
      { "name": "doc_approval", "cid": "zQmDOCTOR456..." }
    ],
    "assert": [
      "hr > 60 && hr < 100",
      "doc_approval == true"
    ],
    "consequence": {
      "decision": "APPROVED",
      "verbs": [{
        "verb": "control@v1",
        "rail": "arky:rail/medical:dispenser@v1",
        "args": {
          "patient_id": "patient:302:john-doe",
          "medication": "med:lisinopril:10mg",
          "dose": { "value": 1, "unit": "tablet" }
        }
      }]
    }
  }],
  "policy": "arky:pac/hipaa-medication@v1"
}
```

**HIPAA Compliance:**
- TIMs encrypted at rest
- Access audit logged
- Doctor credentials verified
- Patient consent on file

---

### 5.4 Supply Chain: Escrow Release on Delivery

**Scenario:** Payment released when GPS + sensors confirm delivery

#### Multi-Sensor TIMs

```json
// GPS location
{
  "measurement": {
    "name": "location.gps",
    "value": { "lat": 37.7749, "lon": -122.4194 },
    "unit": "degrees"
  },
  "cid": "zQmGPS123..."
}

// Temperature (cold chain)
{
  "measurement": {
    "name": "container.temperature",
    "value": 4.2,
    "unit": "degC"
  },
  "cid": "zQmTEMP456..."
}

// Receiver signature
{
  "measurement": {
    "name": "delivery.acknowledged",
    "value": true,
    "unit": "boolean"
  },
  "cid": "zQmSIGN789..."
}
```

#### Kernel Multi-Condition Release

```json
{
  "assertions": [{
    "measure": [
      { "name": "gps", "cid": "zQmGPS123..." },
      { "name": "temp", "cid": "zQmTEMP456..." },
      { "name": "signature", "cid": "zQmSIGN789..." }
    ],
    "assert": [
      "distance(gps, target) < 100",  // within 100m
      "temp >= 2 && temp <= 8",       // cold chain maintained
      "signature == true"              // receiver confirmed
    ],
    "consequence": {
      "decision": "APPROVED",
      "verbs": [{
        "verb": "pay@v1",
        "args": {
          "from": "acct:escrow:contract-abc123",
          "to": "acct:ach:us:supplier:999888777",
          "amount": { "value": 50000, "unit": "USD" },
          "memo": "Shipment #SHP-2025-8472 delivered"
        }
      }]
    }
  }],
  "policy": "arky:pac/escrow-release@v1"
}
```

**Evaluation:**
```
✓ GPS: 37.7749,-122.4194 → 35m from warehouse (< 100m)
✓ Temperature: 4.2°C (within 2-8°C range)
✓ Signature: Confirmed by doc-3
→ All conditions met: $50,000 released
```

---

## Appendix A: Common Pitfalls

### A.1 TIM Validation Errors

**Issue:** Numeric value without unit
```json
// Wrong
"measurement": { "value": 22.3 }

// Correct
"measurement": { "value": 22.3, "unit": "degC" }
```

### A.2 Kernel Assertion Mistakes

**Issue:** Incorrect symbol binding
```json
// Wrong - name mismatch
"measure": [{ "name": "temperature" }], "assert": "temp > 20"

// Correct
"measure": [{ "name": "temp" }], "assert": "temp > 20"
```

### A.3 Settler Idempotency

**Issue:** Not handling duplicate requests
```typescript
// Wrong - executes twice
async function execute(request) {
  return await rail.transfer(request.args);
}

// Correct - checks cache
async function execute(request) {
  const cached = await cache.get(request.idempotency_key);
  if (cached) return cached;

  const result = await rail.transfer(request.args);
  await cache.set(request.idempotency_key, result);
  return result;
}
```

---

## Appendix B: Style & Formatting Guide

### B.1 Terminology Mistakes

| Avoid | Use Instead |
|---------|---------------|
| "TIM Receipt" | "TIM" or "TIM receipt" |
| "CID" (in code) | "cid" |
| "execution receipt" | "ExecutionReceipt" or "XR" |
| `tim.missing_required` | `` `tim.missing_required` `` (in code formatting) |
| "Witness Receipt" | "WitnessReceipt" |
| "commitment_CID" | "commitment_cid" |
| "SettlementReceipt" | "ExecutionReceipt" |
| "multi-hash" | "multihash" |
| "Kernel_CID" | "kernel_cid" |
| "Pay Verb" | "pay verb" or `` `pay@v1` `` |

### B.2 Capitalization Rules

**Capitalize when:**
- Referring to a specific Arky component (Kernel, Notary, Settler)
- Referring to a specific object type (TIM, Commitment, Decision, ExecutionReceipt)
- Starting a sentence
- In titles and headers

**Lowercase when:**
- Using as a generic term ("the kernel evaluates")
- In code, JSON, or technical examples
- In field names (`cid`, `sig`, `ts`)

**Examples:**
| Correct | Incorrect |
|-----------|-------------|
| "The Kernel evaluates assertions" | "The kernel Evaluates assertions" |
| "A TIM receipt contains a cid" | "A tim Receipt contains a CID" |
| "The ExecutionReceipt (XR) has status" | "The Execution Receipt (xr) has Status" |
| "Settlers execute verbs on rails" | "settlers Execute Verbs on Rails" |

### B.3 JSON Field Naming

**Always use snake_case with lowercase:**
```json
{
  "cid": "zQm...",
  "sig": "eyJ...",
  "commitment_cid": "zQm...",
  "request_id": "req_001",
  "kernel_cid": "zQm...",
  "ts": "2025-10-15T14:30:00Z"
}
```

**Never:**
```json
{
  "CID": "zQm...",              // Wrong - uppercase
  "commitmentCid": "zQm...",    // Wrong - camelCase
  "commitment_CID": "zQm...",   // Wrong - uppercase suffix
  "request-id": "req_001"       // Wrong - kebab-case
}
```

### B.4 Error Code Format

**Always use lowercase dot notation in code formatting:**

Correct:
- `` `tim.invalid_signature` ``
- `` `settler.insufficient_funds` ``
- `` `notary.witness_quorum_failed` ``

Wrong:
- `TIM.INVALID_SIGNATURE`
- `settler.insufficientFunds`
- "tim.invalid_signature" (without code formatting in docs)

### B.5 URN Format

**Standard pattern:**
```
urn:arky:<type>:<name>@v<version>
```

Correct:
- `arky:verb/pay@v1`
- `arky:rail/ach:us@v1`
- `arky:policy/witness-quorum@v1`

Wrong:
- `arky:verb/Pay@v1` (uppercase name)
- `arky:verb/pay-v1` (missing @)
- `URN:ARKY:VERB:PAY@V1` (all uppercase)

### B.6 Markdown Code Formatting

**When to use code formatting:**
- Technical field names: `` `measurement.value` ``
- Error codes: `` `tim.missing_required` ``
- Inline verbs: `` `pay@v1` ``
- CIDs: `` `zQm...` ``
- Short code snippets: `` ` "cid": "..." ` ``

**When NOT to use code formatting:**
- Prose references to components: "The Kernel evaluates..."
- Capitalized terms: "ExecutionReceipt", "TIM"
- Natural language: "the system processes..."

### B.7 Vector Documentation Style

**File naming:**
- Vector files: `t1-001.json`, `s2-042.json`
- Fixture files: `ed25519-test-01.json`, `ach-us-mock.json`

**Vector IDs:**
- Match filename: `"id": "t1-001"`
- Version suffix for updates: `t1-001-v2`
- Never: `T1_001`, `t1.001`, `test-t1-001`

**Fixture references:**
```json
// Simple reference
"$ref": "fixtures/keys/ed25519-test-01.json"

// JSON Pointer
"$ref": "fixtures/keys/ed25519-test-01.json#/publicKey"

// Context alias
{
  "context": { "fixtures": { "key1": "fixtures/keys/ed25519-test-01.json" } },
  "inputs": { "signing_key": { "$ref": "key1" } }
}
```

---

**End of ARKY-EXAMPLES-v1**

For normative requirements, see the core specifications:
- ARKY-TIM-v1
- ARKY-KERNEL-v1
- ARKY-SETTLERS-v1
- ARKY-NOTARY-v1
