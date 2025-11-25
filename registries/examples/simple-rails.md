# Rails Registry - Simple Examples

## Core Concepts

Rails define **networks and systems** where verbs can be executed. Think of them as the "roads" or "highways" that carry actions to their destination.

## Simple Examples

### Ethereum Blockchain

```json
{
  "urn": "caip2:eip155:1",
  "name": "Ethereum Mainnet",
  "kind": "blockchain",
  "description": "The main Ethereum network for smart contracts",
  "simple_config": {
    "network": "ethereum-mainnet",
    "currency": "ETH",
    "finality_time": "~13 minutes"
  }
}
```

**Real-world use:** Smart contract execution, DeFi transactions, NFT transfers.

---

### US ACH Payments

```json
{
  "urn": "ach:us",
  "name": "US ACH Network",
  "kind": "payment_rail",
  "description": "US electronic funds transfer system",
  "simple_config": {
    "network": "us-ach-network",
    "currency": "USD",
    "settlement_time": "1-2 business days"
  }
}
```

**Real-world use:** Direct deposits, bill payments, business transfers.

---

### Smart Home Controller

```json
{
  "urn": "controller:home-automation",
  "name": "Home Automation System",
  "kind": "iot_controller",
  "description": "Central controller for smart home devices",
  "simple_config": {
    "protocol": "mqtt",
    "response_time": "< 1 second",
    "devices": ["thermostats", "lights", "locks"]
  }
}
```

**Real-world use:** Smart home control, energy management, security systems.

---

## Complex Examples

### Ethereum with Advanced Features

```json
{
  "urn": "caip2:eip155:1",
  "kind": "blockchain",
  "network": "ethereum-mainnet",
  "locator_schema": "tx:<0xhex>",
  "proof_profile": "merkle-v1",
  "hash_alg": "sha256",
  "leaf_encoding": "cid-bytes",
  "default_finality": {
    "depth": 64
  },
  "limits": {
    "max_batch_cids": 2048,
    "max_batch_bytes": 1048576
  },
  "capabilities": {
    "supports_verbs": ["pay", "control", "signal"],
    "gas_tracing": true,
    "event_logs": true
  },
  "status": "active"
}
```

**Real-world use:** High-volume DeFi applications, batch transactions, proof generation.

---

### Bitcoin with Security Features

```json
{
  "urn": "btc:mainnet",
  "kind": "blockchain",
  "network": "bitcoin-mainnet",
  "locator_schema": "txid:<hex>",
  "proof_profile": "merkle-v1",
  "hash_alg": "sha256",
  "leaf_encoding": "cid-bytes",
  "default_finality": {
    "depth": 6
  },
  "limits": {
    "max_batch_cids": 1024,
    "max_batch_bytes": 1048576
  },
  "security": {
    "confirmations_required": 6,
    "double_spend_check": true,
    "rbf_detection": true
  },
  "status": "active"
}
```

**Real-world use:** Settlement layer, high-value transfers, cross-border payments.

---

## Multi-Rail Examples

### Cross-Rail Payment Routing

```json
{
  "payment_flow": "customer_to_supplier",
  "routing": [
    {
      "step": 1,
      "rail": "ach:us",
      "verb": "pay@v1",
      "amount": { "value": 1000, "unit": "USD" },
      "purpose": "initial_payment"
    },
    {
      "step": 2,
      "rail": "caip2:eip155:1",
      "verb": "pay@v1",
      "amount": { "value": 0.5, "unit": "ETH" },
      "purpose": "crypto_conversion"
    }
  ]
}
```

**Real-world use:** Multi-currency payments, cross-border transactions, fiat-to-crypto onboarding.

---

### IoT + Blockchain Integration

```json
{
  "workflow": "energy_trading",
  "rails": {
    "measurement": "controller:smart-meter",
    "settlement": "caip2:eip155:1",
    "reporting": "log:arky:transparency@v1"
  },
  "flow": [
    {
      "rail": "controller:smart-meter",
      "verb": "signal@v1",
      "data": "energy_produced: 10kWh"
    },
    {
      "rail": "caip2:eip155:1",
      "verb": "pay@v1",
      "amount": { "value": 2, "unit": "ETH" },
      "purpose": "energy_payment"
    },
    {
      "rail": "log:arky:transparency@v1",
      "verb": "signal@v1",
      "data": "transaction_recorded"
    }
  ]
}
```

**Real-world use:** Peer-to-peer energy trading, carbon credits, IoT marketplaces.

---

## Integration Examples

### TypeScript Multi-Rail Payment

```typescript
// Select appropriate rail based on amount and currency
function selectRail(amount: number, currency: string): string {
  if (currency === "USD" && amount < 25000) {
    return "ach:us";
  } else if (currency === "ETH") {
    return "caip2:eip155:1";
  } else {
    return "swift:global";
  }
}

// Execute payment on selected rail
async function executePayment(
  to: string,
  amount: { value: number; unit: string }
): Promise<TransactionResult> {
  const rail = selectRail(amount.value, amount.unit);

  const payment = {
    verb: "arky:verb/pay@v1",
    rail: `arky:rail:${rail}@v1`,
    args: {
      to,
      amount,
      memo: "Automated payment"
    }
  };

  return await settler.execute(payment);
}
```

### Python Rail Discovery

```python
import arky_sdk

# Discover available rails
def discover_rails_for_verb(verb_name: str):
    verb = arky_sdk.registries.get_verb(verb_name)
    available_rails = []

    for rail_urn in verb.rails:
        rail = arky_sdk.registries.get_rail(rail_urn)
        if rail.status == "active":
            available_rails.append({
                "name": rail.name,
                "urn": rail.urn,
                "kind": rail.kind,
                "currency": getattr(rail, "currency", "N/A")
            })

    return available_rails

# Usage
rails = discover_rails_for_verb("pay@v1")
for rail in rails:
    print(f"Available: {rail['name']} ({rail['kind']})")
```

---

## Industry Use Cases

### Banking and Finance
```json
{
  "rails_used": [
    { "rail": "ach:us", "use_case": "domestic_transfers" },
    { "rail": "swift:global", "use_case": "international_payments" },
    { "rail": "caip2:eip155:1", "use_case": "digital_assets" }
  ],
  "advantages": [
    "Reduced settlement times",
    "Lower transaction costs",
    "Automated compliance"
  ]
}
```

### Supply Chain Management
```json
{
  "rails_used": [
    { "rail": "controller:iot_sensors", "use_case": "tracking" },
    { "rail": "log:arky:transparency@v1", "use_case": "audit_trail" },
    { "rail": "ach:us", "use_case": "payments" }
  ],
  "advantages": [
    "Real-time visibility",
    "Tamper-proof records",
    "Automated payments"
  ]
}
```

### Healthcare
```json
{
  "rails_used": [
    { "rail": "controller:medical_devices", "use_case": "monitoring" },
    { "rail": "log:arky:transparency@v1", "use_case": "patient_records" },
    { "rail": "ach:us", "use_case": "insurance_claims" }
  ],
  "advantages": [
    "Secure data sharing",
    "Regulatory compliance",
    "Automated billing"
  ]
}
```

---

## Learning Path

1. **Understand rail types**: blockchain, payment_rail, iot_controller, audit_log
2. **Learn rail capabilities**: finality, limits, supported verbs
3. **Explore multi-rail workflows**: Combine different rails for complex processes
4. **Master rail selection**: Choose optimal rails based on requirements
5. **Implement fallback strategies**: Handle rail failures gracefully

## Related Resources

- [Verbs Registry](../verbs@v1.json) - Actions that run on rails
- [Units Registry](../units@v1.json) - Standardized measurements for rails
- [Integration Examples](../../examples/flows/) - Complete workflow examples
