const crypto = require("crypto");

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const FINAL_STATUSES = new Set(["PASSED", "FAILED"]);

function requiredText(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function hashEvidence(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeVerificationEvidence(input) {
  const runStatus = String(input?.runStatus || "").toUpperCase();
  if (!FINAL_STATUSES.has(runStatus)) throw new Error("runStatus must be PASSED or FAILED");
  const printStage = String(input?.printStage || "POST_COMPLETION").toUpperCase();
  if (!["PRE_WORK", "POST_COMPLETION"].includes(printStage)) throw new Error("printStage must be PRE_WORK or POST_COMPLETION");
  const outputFileHash = requiredText(input.outputFileHash, "outputFileHash");
  const templateFileHash = requiredText(input.templateFileHash, "templateFileHash");
  const evidenceHash = requiredText(input.evidenceHash, "evidenceHash");
  for (const [field, value] of Object.entries({ outputFileHash, templateFileHash, evidenceHash })) {
    if (!SHA256_PATTERN.test(value)) throw new Error(`${field} must be a SHA256 hash`);
  }
  const pageCount = Number(input.pageCount);
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("pageCount must be a positive integer");
  const blocks = Array.isArray(input.blocks) ? input.blocks : [];
  if (!blocks.length) throw new Error("at least one block result is required");
  const seen = new Set();
  const normalizedBlocks = blocks.map((block, index) => {
    const blockMappingId = requiredText(block.blockMappingId, `blocks[${index}].blockMappingId`);
    const blockCode = requiredText(block.blockCode, `blocks[${index}].blockCode`).toUpperCase();
    const resultStatus = String(block.resultStatus || "").toUpperCase();
    if (!FINAL_STATUSES.has(resultStatus)) throw new Error(`blocks[${index}].resultStatus must be PASSED or FAILED`);
    if (seen.has(blockMappingId)) throw new Error(`duplicate blockMappingId ${blockMappingId}`);
    seen.add(blockMappingId);
    return {
      blockMappingId,
      blockCode,
      resultStatus,
      pageNumbers: Array.isArray(block.pageNumbers)
        ? block.pageNumbers.map(Number).filter((page) => Number.isInteger(page) && page > 0)
        : [],
      evidence: block.evidence && typeof block.evidence === "object" ? block.evidence : {},
    };
  });
  if (runStatus === "PASSED" && normalizedBlocks.some((block) => block.resultStatus !== "PASSED")) {
    throw new Error("a passed run cannot contain failed block evidence");
  }
  return {
    formTemplateId: requiredText(input.formTemplateId, "formTemplateId"),
    printJobId: input.printJobId ? String(input.printJobId) : null,
    runStatus,
    printStage,
    templateFileHash: templateFileHash.toLowerCase(),
    outputFileHash: outputFileHash.toLowerCase(),
    outputFilePath: requiredText(input.outputFilePath, "outputFilePath"),
    baselinePdfHash: input.baselinePdfHash ? String(input.baselinePdfHash).toLowerCase() : null,
    outputPdfHash: input.outputPdfHash ? String(input.outputPdfHash).toLowerCase() : null,
    pageCount,
    evidenceFileName: requiredText(input.evidenceFileName, "evidenceFileName"),
    evidencePath: requiredText(input.evidencePath, "evidencePath"),
    evidenceHash: evidenceHash.toLowerCase(),
    verifierName: requiredText(input.verifierName, "verifierName"),
    verifierVersion: requiredText(input.verifierVersion, "verifierVersion"),
    summary: input.summary && typeof input.summary === "object" ? input.summary : {},
    actorId: input.actorId || null,
    blocks: normalizedBlocks,
  };
}

async function recordPassedVerification(client, input) {
  const evidence = normalizeVerificationEvidence(input);
  if (evidence.runStatus !== "PASSED") throw new Error("only passed evidence can verify Word block mappings");

  const mappings = await client.query(
    `SELECT id,form_template_id,block_code
       FROM form_template_block_mapping
      WHERE form_template_id=$1 AND id=ANY($2::uuid[])
      FOR UPDATE`,
    [evidence.formTemplateId, evidence.blocks.map((block) => block.blockMappingId)]
  );
  if (mappings.rowCount !== evidence.blocks.length) throw new Error("one or more block mappings do not belong to the form template");
  const mappingById = new Map(mappings.rows.map((mapping) => [mapping.id, mapping]));
  for (const block of evidence.blocks) {
    if (mappingById.get(block.blockMappingId)?.block_code !== block.blockCode) {
      throw new Error(`block code mismatch for ${block.blockMappingId}`);
    }
  }

  if (evidence.printJobId) {
    const printJob = await client.query(
      `SELECT id,form_template_id,job_status,output_hash
         FROM work_order_print_job WHERE id=$1`,
      [evidence.printJobId]
    );
    const job = printJob.rows[0];
    if (!job || job.form_template_id !== evidence.formTemplateId || job.job_status !== "READY") {
      throw new Error("verification print job is missing, not ready, or belongs to another form template");
    }
    if (String(job.output_hash || "").toLowerCase() !== evidence.outputFileHash) {
      throw new Error("verification output hash does not match the print job");
    }
  }

  const run = await client.query(
    `INSERT INTO form_template_verification_run (
       form_template_id,print_job_id,verification_kind,print_stage,run_status,template_file_hash,
       output_file_hash,output_file_path,baseline_pdf_hash,output_pdf_hash,page_count,evidence_file_name,
       evidence_path,evidence_hash,verifier_name,verifier_version,summary_json,
       requested_by,completed_by,completed_at
     ) VALUES ($1,$2,'WORD_BLOCK_OUTPUT',$3,'PASSED',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$16,now())
     RETURNING *`,
    [evidence.formTemplateId, evidence.printJobId, evidence.printStage, evidence.templateFileHash,
      evidence.outputFileHash, evidence.outputFilePath, evidence.baselinePdfHash, evidence.outputPdfHash,
      evidence.pageCount, evidence.evidenceFileName, evidence.evidencePath, evidence.evidenceHash,
      evidence.verifierName, evidence.verifierVersion, JSON.stringify(evidence.summary), evidence.actorId]
  );

  for (const block of evidence.blocks) {
    await client.query(
      `INSERT INTO form_template_block_verification (
         verification_run_id,block_mapping_id,block_code,result_status,output_file_hash,page_numbers,evidence_json
       ) VALUES ($1,$2,$3,'PASSED',$4,$5::integer[],$6::jsonb)`,
      [run.rows[0].id, block.blockMappingId, block.blockCode, evidence.outputFileHash,
        block.pageNumbers, JSON.stringify(block.evidence)]
    );
  }

  await client.query(
    `UPDATE form_template_block_mapping
        SET is_verified=true,verified_run_id=$2,updated_at=now()
      WHERE form_template_id=$1 AND id=ANY($3::uuid[])`,
    [evidence.formTemplateId, run.rows[0].id, evidence.blocks.map((block) => block.blockMappingId)]
  );
  return run.rows[0];
}

module.exports = {
  hashEvidence,
  normalizeVerificationEvidence,
  recordPassedVerification,
};
