# Bootstrap Trust Boundary

Status: `ANALYSIS ONLY`

## Conclusion

An independent Bootstrap Governance Gate should be created conceptually before any first governance commit is authorized. The current untracked framework can be used as an analysis tool, but it cannot make its own producer strings, hashes, scanner report, or staged proof authoritative. All of those artifacts and the code that verifies them coexist in one mutable, not-yet-anchored workspace.

The recommended separation is:

1. **Bootstrap Candidate Review Gate** — independent humans/Reviewers decide whether the exact untracked source set is acceptable. Candidate tools provide reproducible evidence, not authority.
2. **Bootstrap Human Commit Gate** — a human independently verifies the exact file set, stages and commits it, and records the resulting commit hash as the first trust anchor. No agent or untrusted validator authorizes the Git mutation.
3. **Steady-State Governance Preparation Gate** — tools executed from an already trusted governance commit may produce a workspace candidate receipt bound to that base commit and exact validator bytes.
4. **Steady-State Governance Execution Gate** — the trusted validator recomputes the live staged path/blob set in the same execution and combines it with fresh independent review and final human approval.

This is more coherent than requiring the untracked framework to prove its own provenance. It does not weaken A5: the Bootstrap Candidate Gate remains `NO-GO` until the six blocking findings are removed from or closed within the selected candidate contract.

## 1. Why self-validation is circular before the first commit

The current manifest and candidate snapshot prove useful consistency facts:

- the manifest enumerates 97 paths;
- each recorded file digest matches the current bytes;
- the included file-set digest is reproducible;
- the candidate proof payload is internally self-consistent;
- independent A5 Reviewers rechecked those facts against a before/after baseline.

They do not prove an origin or trusted producer. Before the first commit, a party that can edit the workspace can change all of the following together:

- validator or scanner code;
- schema and policy defining valid output;
- manifest entries and file hashes;
- candidate or staged proof fields;
- `producer`, `execution_id`, timestamp, and validator version strings;
- the ordinary SHA256 payload hash;
- Task-authored approval and prerequisite records;
- test input and test oracle.

An unkeyed hash is tamper evidence only relative to an independently trusted expected digest. If the subject, expected digest, verifier, and report are all mutable together, it establishes internal consistency, not authenticity.

### Can bootstrap reasonably rely on its own components?

| Component | Bootstrap use that is reasonable | Claim that is not reasonable before anchoring |
|---|---|---|
| Validator | Diagnostic execution; independent Reviewers inspect source and reproduce critical checks | "VALID" alone proves the validator is trustworthy |
| Candidate proof | Compact checksum receipt for the exact set independently reviewed | `producer: governance-validator` proves tool origin |
| Scanner report | One bounded signal to assist human/reviewer inspection | Clean report proves absence within a contract defined and implemented by the same untrusted bytes |
| Producer identity | Descriptive audit field | Non-forgeable identity or execution provenance |
| Manifest hash | Stable identifier after a human/reviewer records the expected hash | Authority when manifest and generator can be changed together |

## 2. Four-Gate model

### A. Bootstrap Candidate Review Gate

Purpose: decide whether the exact untracked candidate is suitable to become the first governance baseline.

Required minimum:

- human-approved scope and candidate capability boundary;
- exact relative-path manifest with byte size and SHA256;
- independent read-only Code, Security, Domain, and compatibility review where applicable;
- before/after candidate hash stability;
- independent reproduction of every critical exploit and negative invariant;
- no unresolved blocker, false security claim, Domain authority path, or scope bypass;
- explicit list of controls removed from bootstrap;
- all product, database, migration, Session B, and Git actions still prohibited.

Authority: external human decision plus independent Reviewer records bound to the exact candidate hashes. Candidate validators may supply evidence, but they do not decide their own trustworthiness.

Current state: `NO-GO` because A5 has six blocking findings.

### B. Bootstrap Human Commit Gate

Purpose: create the first version-controlled governance trust anchor.

Required minimum:

- Bootstrap Candidate Review Gate passed on the exact unchanged file set;
- human independently compares the intended manifest with the staged path set and staged blobs using trusted Git/native tooling or manual review;
- human alone performs stage and commit under a separately authorized operation;
- resulting commit hash, exact manifest hash, reviewer set, and approval are recorded outside the candidate's self-authored authority path;
- optional commit signing or protected remote recording may strengthen identity but is not claimed unless actually configured.

Not required: a claim that the untracked `STAGED_EXACT` producer was already trusted. A self-issued staged proof may be retained as diagnostic evidence but cannot authorize this Gate.

Output: a first governance commit hash accepted by the human as the steady-state base anchor.

### C. Steady-State Governance Preparation Gate

Purpose: decide whether a workspace change built on a trusted governance base is ready for independent review/staging consideration.

Required proof subject:

- trusted `base_governance_commit`;
- exact validator/scanner blob IDs or digests from that base;
- candidate manifest and file-set digests;
- Task ID, purpose, execution nonce, and time;
- independent review bound to the same candidate;
- scope check bound to one exact actor assignment.

The workspace receipt remains a consistency proof, but its producer becomes meaningful because the executable is selected from an already accepted commit rather than from the candidate it is judging.

### D. Steady-State Governance Execution Gate

Purpose: authorize a human-controlled commit of one exact staged candidate.

Required proof subject:

- trusted base commit and validator blob;
- current index path set and blob set recomputed in the same validation execution;
- manifest hash and candidate review identity;
- non-replay execution ID/nonce and bounded freshness;
- typed scope-validation receipt and typed preapproval receipt resolved exactly once;
- clean independent Reviews and final human approval;
- immediate revalidation if the index changes.

The Gate must consume the live computation result directly. A caller-supplied boolean or stored self-authored proof file is insufficient.

## 3. Trust anchors by proof type

| Proof | Current source | Current problem | Minimum bootstrap trust anchor | Minimum steady-state trust anchor |
|---|---|---|---|---|
| Workspace candidate | `generate-candidate-snapshot.mjs`; constant producer string; manifest/file hashes | Same untracked code defines, creates, and verifies the receipt; every field and hash is reproducible by a Task author | Independent human/Reviewer records the exact manifest and file-set hash and treats the receipt as evidence-only | Validator executable selected by trusted base commit; receipt binds base commit and validator blob plus exact candidate |
| Scanner report | Manifest-bound scanner implemented in candidate source | Scanner, contract, manifest, and clean claim can change together; A5 found an in-contract false negative | Human/Security Reviewer independently inspects scanner source, reruns adversarial vectors, and reviews the exact manifest | Scanner from trusted base commit; report binds contract version, scanner blob, manifest, execution ID, and exact finding set |
| Reviewer result | Fresh read-only Reviewer session with unique run/session IDs; root files the result | Identity and context separation are procedural; Task JSON is not cryptographic attestation | Human-controlled Codex task/session provenance, preserved raw result, unique IDs, and exact candidate baseline hash | Same, plus repository/CI retention or signed review record if later available |
| Staged exact proof | Task-file object plus separate `validate-staged-candidate`; `validateTask` receives a live boolean | Stored fields are forgeable; index recomputation and Gate are not one bound execution; TOCTOU remains | Human independently verifies current staged paths/blobs and performs the first commit; self-issued proof is non-authoritative | Trusted-base validator recomputes current index and returns/consumes an in-process typed receipt immediately before human commit |
| Human approval | `human-approval.yaml` with names, timestamps, and statuses | Candidate/Task can write approval-shaped fields; procedural identity is not cryptographic | Human decision occurs through an external interaction and explicitly references candidate/staged hashes; Task file is a projection, not source | Protected approval channel or signed/retained decision referencing trusted base, candidate, index, and execution receipt |
| Domain/meta-rule authority | `status=confirmed`, source/owner strings, file namespace, and generic schema | Namespace and status can create authority; `human-approval` source strings are self-declared | No Railway Domain authority in Phase 1; proposed registry only. Bootstrap human approves only the governance-control allowlist | Later phase requires typed rule class, exact source/approval binding, human Domain authority, anti-replay chronology, and independent review |

## 4. What the first commit hash does and does not establish

Once a human accepts and commits the exact reviewed file set, the commit hash can anchor:

- exact source bytes and tree structure;
- the validator/scanner version used for later changes;
- policy and schema versions;
- a base against which later mutations are visible.

It does not by itself prove:

- who authored or approved the commit;
- remote branch protection;
- cryptographic human or Reviewer identity;
- freedom from malicious code already present in the committed baseline;
- correctness of business rules.

Those limitations require explicit human/process controls and independent review. The commit hash is therefore an integrity anchor, not a complete identity or correctness proof.

## 5. Required bootstrap invariants

Before the Bootstrap Candidate Gate can be reconsidered:

1. Every retained automatic control has one public production path and one explicit semantic oracle.
2. Any control that can cause incorrect GO, forged authority, false clean scan, or scope bypass is implemented or removed from bootstrap.
3. Task-authored fields are never treated as their own authority source.
4. Human approval and Reviewer records are external authorities projected into Task artifacts, not created by the Task itself.
5. Dynamic `applicable_rules` cannot import Railway Domain meaning in Phase 1.
6. The manifest is rebuilt from the selected bootstrap capability set; preserving the number 97 is not an objective.
7. Migration 320 remains `NO-GO` independent of the governance bootstrap decision.

## 6. Gate state preserved

```text
Session A5: ARCHIVED / BLOCKER
Remediation 6: NOT AUTHORIZED
Session B: NOT AUTHORIZED
Bootstrap Candidate Review Gate: NO-GO
Bootstrap Human Commit Gate: NO-GO
Steady-State Governance Preparation Gate: NOT YET AVAILABLE / NO-GO
Steady-State Governance Execution Gate: NOT YET AVAILABLE / NO-GO
Migration 320 Execution Gate: NO-GO
```
