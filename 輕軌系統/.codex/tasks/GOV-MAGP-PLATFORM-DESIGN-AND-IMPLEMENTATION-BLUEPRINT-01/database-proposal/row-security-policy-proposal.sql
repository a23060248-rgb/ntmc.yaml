-- DESIGN_PROPOSAL_ONLY
-- NOT_APPROVED_FOR_EXECUTION
-- PROPOSED_NOT_ADOPTED
-- NOT_EXECUTED
-- NOT_IMPLEMENTED
-- This file is an auditable design artifact, not an executable migration.

-- Candidate only; RLS adoption is Human Decision HID-007.
-- ALTER TABLE magp.evidence_record ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY evidence_scope_policy ON magp.evidence_record USING (authority_scope_allows(subject_id));
