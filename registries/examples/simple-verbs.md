# Verbs Registry - Simple Examples

## Core Concepts

Verbs define **actions** that can be executed in the Arky system. Think of them as standardized API calls across different networks and platforms.

## Simple Examples

### Basic Payment

```json
{
  "urn": "arky:verb/pay@v1",
  "semantics": "Send money from A to B",
  "description": "Simple payment transfer between accounts",
  "rails": ["ethereum", "ach:us", "sepa:eu"],
  "examples": {
    "simple": {
      "to": "acct:us:123456789",
      "amount": {"value": 100, "unit": "USD"},
      "memo": "Coffee payment"
    }
  }
}
```

**Real-world use:** Paying for coffee, sending money to friends, business payments.

---

### Smart Refund

```json
{
  "urn": "arky:verb/refund@v1",
  "semantics": "Return funds for a prior payment",
  "description": "Automated refund with reference to original transaction",
  "rails": ["ethereum", "ach:us", "sepa:eu"],
  "examples": {
    "simple": {
      "original_tx": "0xabc123...",
      "amount": {"value": 100, "unit": "USD"},
      "reason": "product_return"
    }
  }
}
```

**Real-world use:** E-commerce returns, subscription cancellations, dispute resolutions.

---

### Device Control

```json
{
  "urn": "arky:verb/control@v1",
  "semantics": "Execute a device control command",
  "description": "Send commands to IoT devices, robots, or systems",
  "rails": ["controller:*"],
  "examples": {
    "simple": {
      "device": "thermostat:living-room",
      "command": "set_temperature",
      "value": 22
    }
  }
}
```

**Real-world use:** Smart home control, industrial automation, robot commands.

---

## Complex Examples

### Advanced Payment with Safety

```json
{
  "urn": "arky:verb/pay@v1",
  "semantics": "Initiate a payment on a supported rail.",
  "input_schema": "https://arky.foundation/schemas/verbs/pay@v1.json",
  "idempotency": "key:<commitment+args>",
  "safety": {
    "class": "payment",
    "rollback": "P2D"
  },
  "rails": ["caip2:eip155:*", "sepa:eu", "ach:us"],
  "examples": {
    "complex": {
      "to": "acct:ach:us:supplier:999888777",
      "amount": {"value": 25000, "unit": "USD"},
      "memo": "Invoice #INV-2025-001",
      "reference": "PO-2025-042",
      "conditions": {
        "approval_required": true,
        "kyc_verified": true,
        "sanctions_check": "passed"
      },
      "limits": {
        "max_amount": {"value": 50000, "unit": "USD"},
        "daily_limit": {"value": 100000, "unit": "USD"}
      }
    }
  }
}
```

**Real-world use:** Enterprise B2B payments, payroll processing, supplier payments.

---

### Security Slash

```json
{
  "urn": "arky:verb/slash@v1",
  "semantics": "Slash a stake or bond per policy",
  "description": "Penalize bad behavior by confiscating collateral",
  "rails": ["controller:*"],
  "examples": {
    "complex": {
      "target": "stake:validator:0x123...",
      "amount": {"value": 1000, "unit": "ETH"},
      "reason": "double_sign_detected",
      "evidence": "block:12345:signature_conflict",
      "policy": "slashing:ethereum:beacon@v1"
    }
  }
}
```

**Real-world use:** Blockchain validator penalties, DeFi liquidations, contract violations.

---

## Integration Examples

### TypeScript Integration

```typescript
// Simple payment
const payment = {
  verb: "arky:verb/pay@v1",
  rail: "ach:us",
  args: {
    to: "acct:us:123456789",
    amount: { value: 100, unit: "USD" },
    memo: "Coffee payment"
  }
};

// Execute through settler
const result = await settler.execute(payment);
console.log(`Payment sent: ${result.tx_id}`);
```

### Python Integration

```python
# Device control
import arky_sdk

control_command = {
    "verb": "arky:verb/control@v1",
    "rail": "controller:home-automation",
    "args": {
        "device": "thermostat:living-room",
        "command": "set_temperature",
        "value": 22
    }
}

result = arky_sdk.settler.execute(control_command)
print(f"Device status: {result.status}")
```

---

## Use Case Scenarios

### E-commerce Platform
```json
{
  "workflow": "customer_purchase",
  "verbs": [
    {"verb": "pay@v1", "purpose": "charge_customer"},
    {"verb": "control@v1", "purpose": "update_inventory"},
    {"verb": "signal@v1", "purpose": "notify_shipping"}
  ]
}
```

### IoT Management
```json
{
  "workflow": "smart_building",
  "verbs": [
    {"verb": "control@v1", "purpose": "adjust_climate"},
    {"verb": "signal@v1", "purpose": "report_metrics"},
    {"verb": "upgrade@v1", "purpose": "update_firmware"}
  ]
}
```

### Financial Services
```json
{
  "workflow": "loan_processing",
  "verbs": [
    {"verb": "signal@v1", "purpose": "credit_check"},
    {"verb": "pay@v1", "purpose": "disburse_funds"},
    {"verb": "refund@v1", "purpose": "handle_rejections"}
  ]
}
```

---

## Learning Path

1. **Start with simple verbs**: `pay`, `control`, `signal`
2. **Understand rails**: How verbs map to different networks
3. **Learn safety classes**: How different verbs handle errors
4. **Master complex flows**: Combine multiple verbs for workflows
5. **Implement idempotency**: Handle retries safely

## Related Resources

- [Rails Registry](../rails@v1.json) - Where verbs can be executed
- [Complete Examples](../../specs/development/ARKY-EXAMPLES-v1.md) - Full implementation guides
- [Integration Docs](../../examples/) - Code examples and tutorials
