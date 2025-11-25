# RFC Templates

**Templates for different types of RFCs with detailed guidance and examples.**

## Quick Reference

| Template | Use Case | Complexity | Review Focus |
|---|---|---|---|
| **[spec-template.md](spec-template.md)** | Core specification changes | High | Technical correctness |
| **[registry-template.md](registry-template.md)** | Registry additions/modifications | Medium | Registry consistency |
| **[process-template.md](process-template.md)** | Process and workflow changes | Medium | Operational impact |
| **[security-template.md](security-template.md)** | Security improvements | High | Security analysis |
| **[0000-template.md](../0000-template.md)** | General purpose/simple changes | Low | All aspects |

## Template Selection Guide

### Choose spec-template.md when:
- Adding new core protocol features
- Making breaking changes to specifications
- Defining new data structures or protocols
- Complex technical changes requiring detailed specification

**Example**: "Add new verb type for financial transactions"

### Choose registry-template.md when:
- Adding new entries to existing registries
- Modifying registry structures
- Creating new registry types
- Registry consistency and standardization

**Example**: "Add new device type for IoT sensors"

### Choose process-template.md when:
- Changing development workflows
- Modifying governance procedures
- Updating review processes
- Organizational or operational changes

**Example**: "Implement new code review process for security"

### Choose security-template.md when:
- Adding security features or controls
- Addressing security vulnerabilities
- Implementing privacy protections
- Threat mitigations and security improvements

**Example**: "Implement end-to-end encryption for data transmission"

### Choose 0000-template.md when:
- Simple documentation changes
- Minor clarifications to existing specs
- Small improvements with minimal impact
- Quick changes that don't require detailed analysis

**Example**: "Clarify wording in TIM specification"

## Template Usage

### Step 1: Select Template
```bash
# Choose appropriate template
cp templates/[template-name].md rfc-XXXX-[your-title].md
```

### Step 2: Customize Template
- Replace placeholder text with your content
- Follow the structure and guidance
- Complete all required sections
- Add examples specific to your proposal

### Step 3: Review and Refine
- Review against template checklist
- Ensure all sections are complete
- Validate technical details
- Check for consistency with Arky principles

### Step 4: Submit for Review
- Create pull request
- Request appropriate reviewers
- Participate in review process
- Address feedback promptly

## Template Features

### Common Sections
All templates include these core sections:
- **Summary**: One-sentence overview
- **Motivation**: Problem statement and target users
- **Proposal**: Technical details and examples
- **Compatibility**: Breaking changes and migration
- **Security & Privacy**: Security considerations
- **Alternatives**: Other approaches considered
- **Rollout Plan**: Implementation timeline
- **Testing Strategy**: Testing approach
- **References**: Related documents

### Specialized Sections
Different templates add specialized sections:

#### spec-template.md
- Detailed specification changes
- API modifications
- Schema definitions
- Performance considerations

#### registry-template.md
- Registry entry structure
- Validation rules
- Schema updates
- Implementation requirements

#### process-template.md
- Process flow diagrams
- Role changes
- Training requirements
- Success metrics

#### security-template.md
- Threat analysis
- Security controls
- Penetration testing
- Incident response

## Template Best Practices

### Writing Style
- **Be Clear**: Use simple, unambiguous language
- **Be Specific**: Provide concrete examples and details
- **Be Concise**: Avoid unnecessary complexity
- **Be Complete**: Address all necessary aspects

### Technical Content
- **Code Examples**: Provide working code examples
- **Data Structures**: Show complete data structures
- **API Changes**: Document all API modifications
- **Configuration**: Include configuration examples

### Examples and Testing
- **Basic Examples**: Show simple usage patterns
- **Advanced Examples**: Show complex scenarios
- **Test Cases**: Define comprehensive test cases
- **Edge Cases**: Consider unusual situations

### Documentation
- **References**: Link to relevant specifications
- **Glossary**: Define technical terms
- **Migration Guides**: Provide clear migration paths
- **Troubleshooting**: Address common issues

## Template Customization

### Adding Sections
You can add additional sections to templates if needed:
```markdown
## Custom Section
Content specific to your RFC type
```

### Modifying Structure
If template structure doesn't fit your needs:
- Keep core sections (Summary, Motivation, Proposal, etc.)
- Add specialized sections as needed
- Maintain consistency with RFC format
- Document reasons for structural changes

### Template Feedback
If you have feedback on templates:
- **Issues**: Report template problems on GitHub
- **Improvements**: Suggest better template structure
- **Examples**: Provide examples of template usage
- **Documentation**: Help improve template documentation

## Template Examples

### Simple RFC Example
Using 0000-template.md for a simple documentation change:

```markdown
# RFC-0002: Clarify TIM Timestamp Format

**Status**: Draft
**Authors**: Jane Doe <jane@example.com>
**Tracing**: https://github.com/arky-foundation/arky.foundation/issues/42
**RFC Type**: Process

## Summary
Clarify the required timestamp format in TIM specifications.

## Motivation
### Problem Statement
Current TIM specification is unclear about timestamp format requirements.

### Target Users
Developers implementing TIM parsing and validation.

### Current Limitations
Multiple timestamp formats are currently accepted, causing interoperability issues.

## Proposal
### Overview
Specify ISO 8601 format as the only valid timestamp format.

### Technical Details
```
Required format: "2025-10-15T14:30:00Z"
Acceptable variations: None
```

## Compatibility
### Breaking Changes
- **API Changes**: None
- **Data Format**: Existing non-ISO timestamps will be rejected
- **Behavior**: Stricter timestamp validation

### Migration Path
- Update implementations to use ISO 8601 format
- Convert existing timestamps during migration period

## Security & Privacy
No security or privacy implications.

## Alternatives
- **Accept multiple formats**: Rejected for complexity reasons
- **Deprecate gradually**: Rejected for inconsistency reasons

## Rollout Plan
### Phase 1: Specification Update (1 week)
- [ ] Update TIM specification
- [ ] Add validation examples

### Phase 2: Implementation (2 weeks)
- [ ] Update parsing libraries
- [ ] Add migration tools

### Success Metrics
- **Adoption Rate**: 100% within 6 months
- **Interoperability**: No format-related issues

## Testing Strategy
### Test Vectors
```json
{
  "vector_id": "timestamp-format-001",
  "input": "2025-10-15T14:30:00Z",
  "expected": { "valid": true }
}
```

## References
- [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) - Date and time format
- [ARKY-TIM-v1](../specs/core/ARKY-TIM-v1.md) - TIM specification
```

### Complex RFC Example
Using spec-template.md for a major feature addition:

```markdown
# RFC-0003: Add Batch Processing Support

**Status**: Draft
**Authors**: John Smith <john@example.com>
**Tracing**: https://github.com/arky-foundation/arky.foundation/issues/43
**RFC Type**: Specification

## Summary
Add batch processing capabilities to improve performance for bulk operations.

## Motivation
### Problem Statement
Current single-item processing is inefficient for bulk operations.

### Target Users
- System operators processing large datasets
- Developers building batch applications
- Users needing high-throughput operations

### Current Limitations
- Single-item processing creates overhead
- No atomic batch operations
- Limited throughput for bulk operations

## Proposal
### Overview
Introduce a batch processing API with atomic operations and optimized performance.

### Technical Details
## Specification Changes
**Purpose**: Add batch processing capabilities

**Structure**:
```

  "batch_id": "string",
  "operations": [
    {
      "type": "string",
      "data": "object",
      "id": "string"
    }
  ],
  "options": {
    "atomic": "boolean",
    "timeout": "number"
  }

```

**Behavior**: Process all operations atomically or rollback on failure

**Examples**:
```json
{
  "batch_id": "batch-001",
  "operations": [
    {
      "type": "pay",
      "data": { "to": "account-1", "amount": 100 },
      "id": "op-001"
    },
    {
      "type": "pay",
      "data": { "to": "account-2", "amount": 200 },
      "id": "op-002"
    }
  ],
  "options": {
    "atomic": true,
    "timeout": 30000
  }
}
```

### Examples
#### Basic Batch Processing
```typescript
const batch = {
  batch_id: "batch-001",
  operations: [
    { type: "pay", data: { to: "account-1", amount: 100 } },
    { type: "pay", data: { to: "account-2", amount: 200 } }
  ],
  options: { atomic: true }
};

const result = await processBatch(batch);
```

#### Advanced Batch Processing
```typescript
const batch = {
  batch_id: "batch-002",
  operations: [
    { type: "pay", data: { to: "account-1", amount: 100 } },
    { type: "control", data: { device: "sensor-1", command: "reset" } }
  ],
  options: { atomic: true, timeout: 60000 }
};

const result = await processBatch(batch);
```

## Compatibility
### Breaking Changes
- **API Changes**: New batch processing API
- **Data Format**: New batch data structure
- **Behavior**: Existing single-item processing remains unchanged

### Migration Path
- Existing single-item APIs remain functional
- Gradual migration to batch processing for performance-critical operations

### Version Compatibility
- **Minimum Version**: v1.5.0
- **Deprecation Timeline**: N/A (single-item processing remains)
- **Removal Timeline**: N/A

## Security & Privacy
### Threat Model
1. **Threat**: Batch replay attacks
2. **Mitigation**: Include batch timestamps and nonces
3. **Impact**: Reduced through rate limiting

### Privacy Considerations
- **Data Collection**: Batch operations may process sensitive data in bulk
- **User Privacy**: Implement batch-level privacy controls
- **Compliance**: GDPR considerations for bulk data processing

## Alternatives
### Option 1: Keep Single-Item Processing
**Pros**: No complexity, no breaking changes
**Cons**: Poor performance, inefficient resource usage
**Reason for Rejection**: Performance benefits outweigh complexity

### Option 2: Asynchronous Batch Processing
**Pros**: Better resource utilization
**Cons**: Complex error handling, eventual consistency
**Reason for Rejection**: Atomicity requirements favor synchronous approach

## Rollout Plan
### Phase 1: Implementation (4-6 weeks)
- [ ] Batch processing API implementation
- [ ] Atomic transaction support
- [ ] Error handling and rollback

### Phase 2: Testing (2-3 weeks)
- [ ] Comprehensive test suite
- [ ] Performance benchmarks
- [ ] Load testing

### Phase 3: Documentation (2 weeks)
- [ ] API documentation
- [ ] Migration guides
- [ ] Best practices

### Phase 4: Release (1 week)
- [ ] Feature flag deployment
- [ ] Gradual rollout
- [ ] Performance monitoring

### Success Metrics
- **Performance**: 10x improvement for bulk operations
- **Adoption**: 50% of eligible operations use batch processing within 3 months
- **Reliability**: 99.9% batch success rate

## Testing Strategy
### Unit Tests
```typescript
describe('Batch Processing', () => {
  it('should process batch atomically', async () => {
    const batch = createTestBatch();
    const result = await processBatch(batch);
    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(2);
  });
});
```

### Test Vectors
```json
{
  "vector_id": "batch-processing-001",
  "input": {
    "batch_id": "test-batch-001",
    "operations": [
      { "type": "pay", "data": { "to": "account-1", "amount": 100 } },
      { "type": "pay", "data": { "to": "account-2", "amount": 200 } }
    ],
    "options": { "atomic": true }
  },
  "expected": {
    "success": true,
    "processed": 2,
    "failed": 0
  }
}
```

## References
### Related Specifications
- [ARKY-KERNEL-v1](../specs/core/ARKY-KERNEL-v1.md)
- [ARKY-REGISTRY-VERBS-v1](../specs/infrastructure/ARKY-REGISTRY-VERBS-v1.md)

### Related RFCs
- [RFC-0001](../0001-compatibility-matrix.md) - Compatibility Matrix

### External References
- [ACID Properties](https://en.wikipedia.org/wiki/ACID) - Database transaction properties
- [Batch Processing Patterns](https://example.com) - Best practices for batch operations
```

## Getting Help

### Template Questions
- **General Guidance**: See main RFC README.md
- **Specific Issues**: Create GitHub issue with template tag
- **Examples**: Review existing RFCs for similar patterns

### RFC Process Help
- **Process Questions**: rfc-help@arky.foundation
- **Technical Review**: spec-wg@arky.foundation
- **Security Review**: security@arky.foundation

---

**Related Resources:**
- [RFC Process Guide](../README.md) - Complete RFC process documentation
- RFC status overview is tracked in RFC list and labels; see this README
- [Arky Specifications](../../specs/) - Current specification documents