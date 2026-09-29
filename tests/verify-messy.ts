// End-to-end verification: analyze messy.csv, generate 10 rows, validate,
// and check the reject-prose path. Prints a human-readable summary.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { analyzeInput, InputValidationError } from "../src/lib/analyzers/input-analyzer.ts";
import { generateTabularData } from "../src/lib/generators/tabular-engine.ts";
import { validateDataset, decideStatus } from "../src/lib/validators/data-validator.ts";
import { isNullToken } from "../src/lib/analyzers/data-hygiene.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const csv = readFileSync(resolve(HERE, "fixtures", "messy.csv"), "utf-8");

console.log("--- 1) Analyzing messy.csv ---");
const analysis = analyzeInput(csv, "messy.csv", "csv");
const table = analysis.tables[0];
console.log("Columns detected (name / type):");
for (const c of table.columns) {
  console.log(`  ${c.name.padEnd(15)} ${c.type.padEnd(10)} ${c.qualityWarning ? "⚠ " + c.qualityWarning : ""}`);
}
console.log("Quality warnings:", analysis.qualityWarnings);

console.log("\n--- 2) Generating 10 rows ---");
const cfg = {
  id: "cfg", project_id: "p", row_count: 10, random_seed: 1234,
  locale: "en-US", currency: "USD", null_rate: 0.1, outlier_rate: 0,
  privacy_level: "none" as const, business_rules: [], document_type: null,
  document_template: null, created_at: "", updated_at: "",
};
const data = generateTabularData(table.columns, cfg);
console.table(data);

console.log("\n--- 3) Validating ---");
const schema = {
  id: "s", project_id: "p", table_name: table.name,
  columns: table.columns, primary_keys: table.primaryKeys,
  unique_fields: table.uniqueFields, nullable_fields: table.nullableFields,
  sample_data: null, is_confirmed: true, created_at: "", updated_at: "",
};
const { errors } = validateDataset(data, schema, undefined, undefined, {
  nullRate: cfg.null_rate, expectedRowCount: cfg.row_count,
});
console.log("Errors:", errors);
console.log("Final status:", decideStatus(errors));

let leaked = 0;
for (const row of data) for (const v of Object.values(row)) if (v !== null && isNullToken(v)) leaked++;
console.log(`Null-token leaks in output: ${leaked}`);

console.log("\n--- 4) Prose file must be rejected ---");
try {
  analyzeInput("Missing values in several columns (blank, NULL, N/A)\n", "bug.csv", "csv");
  console.log("FAIL: prose was accepted!");
} catch (err) {
  if (err instanceof InputValidationError) {
    console.log("OK — rejected with:", err.message);
  } else {
    console.log("FAIL: wrong error kind", err);
  }
}
