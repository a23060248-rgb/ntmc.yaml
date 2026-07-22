import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const traceability = JSON.parse(await readFile(path.join(taskDir, "traceability.yaml"), "utf8"));
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const nodes = [...traceability.nodes].sort((a, b) => a.id.localeCompare(b.id));
const edges = [...traceability.edges].sort((a, b) => `${a.from}|${a.relation}|${a.to}`.localeCompare(`${b.from}|${b.relation}|${b.to}`));
const source_digest_sha256 = createHash("sha256").update(JSON.stringify(canonical({ nodes, edges }))).digest("hex").toUpperCase();
const graph = { schema_version: 1, task_id: traceability.task_id, generated_at: traceability.generated_at, generated_by: ".codex/scripts/validate-task.mjs", source_digest_sha256, nodes, edges };
await writeFile(path.join(taskDir, "task-graph.json"), `${JSON.stringify(graph, null, 2)}\n`, { flag: "wx" });
