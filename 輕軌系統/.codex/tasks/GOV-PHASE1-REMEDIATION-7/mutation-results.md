# Mutation Results

The production mutation runner applies 17 source mutations and requires the expected production case to fail. Final observed result: 17/17 mutations killed.

Required killed mutations include reintroducing final approval into Candidate Review, routing Migration 320 into Candidate, trusting report claims, skipping contract or scanned-set bindings, allowing an unregistered finding class, and treating an external Railway decision as a mechanism result. Additional mutations exercise payload, canonicalization, header, entropy, binary, schema, meta-rule, and Railway selection controls.
