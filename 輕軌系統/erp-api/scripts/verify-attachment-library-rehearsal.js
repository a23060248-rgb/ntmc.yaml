process.env.NODE_ENV = "test";
process.env.ENV_FILE ||= ".env.test";
process.env.DATABASE_SAFETY_MODE ||= "rehearsal";

require("../src/config/loadEnvironment").loadEnvironment();

const { Client } = require("pg");
const { assertSafeDatabaseTarget, parseDatabaseTarget } = require("../src/config/databaseSafety");

async function main() {
  assertSafeDatabaseTarget({
    connectionString: process.env.DATABASE_URL,
    safetyMode: process.env.DATABASE_SAFETY_MODE,
    allowedNamePattern: process.env.DATABASE_ALLOWED_NAME_PATTERN,
  });
  const target = parseDatabaseTarget(process.env.DATABASE_URL);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(`
      SELECT
        (SELECT count(*)::int FROM pm_attachment_definition) AS definitions,
        (SELECT count(*)::int FROM pm_attachment_definition_version) AS versions,
        (SELECT count(*)::int FROM pm_attachment_definition_version
          WHERE lifecycle_status='PUBLISHED' AND is_active=true) AS published_versions,
        (SELECT count(*)::int
           FROM pm_template_attachment binding
           JOIN pm_attachment_definition_version version
             ON version.id=binding.attachment_definition_version_id
          WHERE binding.schema_json IS DISTINCT FROM version.schema_json
             OR binding.schema_version IS DISTINCT FROM version.schema_version) AS changed_snapshots,
        (SELECT count(*)::int FROM (
           SELECT attachment_definition_id
             FROM pm_attachment_definition_version
            WHERE lifecycle_status='PUBLISHED' AND is_active=true
            GROUP BY attachment_definition_id HAVING count(*) > 1
         ) duplicate) AS duplicate_published,
        (SELECT count(*)::int
           FROM (SELECT DISTINCT attachment_code FROM pm_template_attachment WHERE is_active=true) legacy
           LEFT JOIN pm_attachment_definition definition
             ON definition.attachment_code=legacy.attachment_code
          WHERE definition.id IS NULL) AS missing_legacy_definitions
    `);
    const summary = result.rows[0];
    if (summary.changed_snapshots !== 0) throw new Error("Template attachment snapshots changed while linking the library");
    if (summary.duplicate_published !== 0) throw new Error("An attachment definition has multiple published versions");
    if (summary.missing_legacy_definitions !== 0) throw new Error("A legacy attachment code was not promoted to the library");
    if (summary.definitions < 1 || summary.published_versions < 1) throw new Error("Attachment library backfill is empty");
    const definitions = await client.query(`
      SELECT definition.attachment_code,definition.attachment_name,definition.attachment_type,
             version.version_no,version.schema_version
        FROM pm_attachment_definition definition
        JOIN pm_attachment_definition_version version
          ON version.attachment_definition_id=definition.id
         AND version.lifecycle_status='PUBLISHED' AND version.is_active=true
       ORDER BY definition.attachment_code
    `);
    console.log(JSON.stringify({
      ok: true,
      database: target.database,
      ...summary,
      items: definitions.rows,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
