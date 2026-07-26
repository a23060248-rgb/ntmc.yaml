-- DESIGN_PROPOSAL_ONLY
-- NOT_APPROVED_FOR_EXECUTION
-- PROPOSED_NOT_ADOPTED
-- NOT_EXECUTED
-- NOT_IMPLEMENTED
-- This file is an auditable design artifact, not an executable migration.

CREATE SCHEMA IF NOT EXISTS magp;
CREATE TABLE magp.governance_object (canonical_id uuid PRIMARY KEY, object_type text NOT NULL, revision bigint NOT NULL CHECK (revision > 0), lifecycle_state text NOT NULL, content_hash char(64) NOT NULL, authority_context_id uuid NOT NULL, created_at timestamptz NOT NULL, created_by uuid NOT NULL);
CREATE TABLE magp.evidence_record (canonical_id uuid PRIMARY KEY, subject_id uuid NOT NULL, subject_revision bigint NOT NULL, producer_id uuid NOT NULL, authority_context_id uuid NOT NULL, content_hash char(64) NOT NULL, classification text NOT NULL, recorded_at timestamptz NOT NULL);
CREATE TABLE magp.audit_record (audit_id uuid PRIMARY KEY, sequence_no bigint NOT NULL, prior_hash char(64), record_hash char(64) NOT NULL, actor_id uuid NOT NULL, authority_context_id uuid NOT NULL, action text NOT NULL, recorded_at timestamptz NOT NULL);
