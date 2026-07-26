-- DESIGN_PROPOSAL_ONLY
-- NOT_APPROVED_FOR_EXECUTION
-- PROPOSED_NOT_ADOPTED
-- NOT_EXECUTED
-- NOT_IMPLEMENTED
-- This file is an auditable design artifact, not an executable migration.

ALTER TABLE magp.governance_object ADD CONSTRAINT uq_governance_object_revision UNIQUE (canonical_id, revision);
ALTER TABLE magp.evidence_record ADD CONSTRAINT ck_evidence_hash CHECK (content_hash ~ '^[0-9A-F]{64}$');
ALTER TABLE magp.audit_record ADD CONSTRAINT uq_audit_sequence UNIQUE (sequence_no);
