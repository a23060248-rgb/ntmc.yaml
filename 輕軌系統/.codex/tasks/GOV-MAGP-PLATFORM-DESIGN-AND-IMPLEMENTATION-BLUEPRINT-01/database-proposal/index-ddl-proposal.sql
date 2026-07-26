-- DESIGN_PROPOSAL_ONLY
-- NOT_APPROVED_FOR_EXECUTION
-- PROPOSED_NOT_ADOPTED
-- NOT_EXECUTED
-- NOT_IMPLEMENTED
-- This file is an auditable design artifact, not an executable migration.

CREATE INDEX idx_governance_object_state ON magp.governance_object (object_type, lifecycle_state);
CREATE INDEX idx_evidence_subject ON magp.evidence_record (subject_id, subject_revision);
CREATE INDEX idx_audit_actor_time ON magp.audit_record (actor_id, recorded_at);
