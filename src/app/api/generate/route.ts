import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { generateTabularData, applyPrivacy, applyBusinessRules, generateValue, seededRandom } from "@/lib/generators/tabular-engine";
import { generateRelationalData } from "@/lib/generators/relational-engine";
import { generateInvoices, generateBankStatements } from "@/lib/generators/document-engine";
import { generateAIContent, generateDocumentAIContent, generateEdgeCases } from "@/lib/ai/ai-layer";
import { validateDataset, computeStatistics, decideStatus, CompletionStatus, isValidType } from "@/lib/validators/data-validator";
import { invoiceToHTML, bankStatementToHTML } from "@/lib/export/exporter";
import { DetectedSchema, GenerationConfig, Relationship } from "@/types";

export async function POST(req: NextRequest) {
  const { projectId } = await req.json();

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const supabase = getServiceClient();

  try {
    await supabase.from("projects").update({ status: "generating" }).eq("id", projectId);

    const { data: project } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { data: schemas } = await supabase
      .from("detected_schemas")
      .select("*")
      .eq("project_id", projectId);

    const { data: config } = await supabase
      .from("generation_configs")
      .select("*")
      .eq("project_id", projectId)
      .single();

    const { data: relationships } = await supabase
      .from("relationships")
      .select("*")
      .eq("project_id", projectId);

    if (!schemas || schemas.length === 0 || !config) {
      return NextResponse.json({ error: "No schema or config found" }, { status: 400 });
    }

    await supabase.from("generated_datasets").delete().eq("project_id", projectId);
    await supabase.from("generated_documents").delete().eq("project_id", projectId);

    let finalStatus: CompletionStatus = "completed";
    if (project.data_type === "document") {
      await handleDocumentGeneration(supabase, projectId, config, project);
    } else if (project.data_type === "relational") {
      finalStatus = await handleRelationalGeneration(supabase, projectId, schemas, relationships || [], config);
    } else {
      finalStatus = await handleTabularGeneration(supabase, projectId, schemas[0], config);
    }

    await supabase.from("projects").update({ status: finalStatus }).eq("id", projectId);
    return NextResponse.json({ success: true, status: finalStatus });
  } catch (err) {
    await supabase.from("projects").update({ status: "error" }).eq("id", projectId);
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const MAX_REGEN_ATTEMPTS = 3;

async function handleTabularGeneration(
  supabase: ReturnType<typeof getServiceClient>,
  projectId: string,
  schema: DetectedSchema,
  config: GenerationConfig
): Promise<CompletionStatus> {
  let aiData: Record<string, string[]> | undefined;
  try {
    aiData = await generateAIContent(schema.columns, config.row_count, config.locale);
  } catch {
    // AI content generation failed, fallback to basic generation
  }

  const validateOpts = {
    businessRules: config.business_rules,
    nullRate: config.null_rate,
    expectedRowCount: config.row_count,
  };
  const genColumns = applyBusinessRules(schema.columns, config.business_rules);

  // When the user pins a seed, reproducibility trumps retry: same seed => same rows.
  const attempts = config.random_seed === null || config.random_seed === undefined ? MAX_REGEN_ATTEMPTS : 1;

  let best: { data: Record<string, unknown>[]; isValid: boolean; errors: ReturnType<typeof validateDataset>["errors"] } | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const attemptConfig = varySeed(config, attempt);
    let data = generateTabularData(genColumns, attemptConfig, aiData);

    try {
      const edgeCount = Math.min(5, Math.floor(config.row_count * 0.05));
      if (edgeCount > 0) {
        const edgeCases = await generateEdgeCases(schema.columns, edgeCount);
        if (edgeCases.length > 0) {
          const startIndex = data.length - edgeCases.length;
          for (let e = 0; e < edgeCases.length; e++) {
            const targetIdx = startIndex + e;
            const originalRow = data[targetIdx];
            const edgeRow = edgeCases[e];
            const merged = { ...originalRow };

            for (const col of schema.columns) {
              // Never touch primary keys, unique columns, or identifiers with edge cases
              if (col.isPrimary || col.isUnique || col.isIdentifier) continue;

              const val = edgeRow[col.name];
              // Never inject null if column is not nullable
              if (!col.nullable && (val === null || val === undefined)) continue;

              // Never inject value if it doesn't match the column type
              if (val !== null && val !== undefined && !isValidType(val, col.type)) continue;

              merged[col.name] = val;
            }
            data[targetIdx] = merged;
          }
        }
      }
    } catch {
      // Edge case generation failed
    }

    // Auto-heal any invalid types or non-nullable nulls before validation
    const healRand = seededRandom((config.random_seed ?? Date.now()) + attempt + 777);
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      for (const col of schema.columns) {
        const val = row[col.name];
        if (!col.nullable && (val === null || val === undefined)) {
          row[col.name] = generateValue(col, i, healRand, false, config);
        } else if (val !== null && val !== undefined && !isValidType(val, col.type)) {
          row[col.name] = generateValue(col, i, healRand, false, config);
        }
      }
    }

    // Validate BEFORE privacy masking — masking can collapse unique values
    // (e.g. emails become "u***@example.com") causing false pk_duplicate errors.
    const { isValid, errors } = validateDataset(data, schema, undefined, undefined, validateOpts);

    data = applyPrivacy(data, schema.columns, config.privacy_level);

    if (!best || errors.length < best.errors.length) {
      best = { data, isValid, errors };
    }
    if (isValid) break;
  }

  const result = best!;
  const statistics = computeStatistics(result.data, schema.columns);
  const status = decideStatus(result.errors);

  const { error: insertError } = await supabase.from("generated_datasets").insert({
    project_id: projectId,
    table_name: schema.table_name,
    row_count: result.data.length,
    data: sanitizeForPostgres(result.data),
    statistics: sanitizeForPostgres(statistics),
    is_valid: status === "completed",
    validation_errors: result.errors,
  });

  if (insertError) {
    console.error("Failed to insert generated_dataset:", insertError);
    throw new Error(`Failed to save generated dataset: ${insertError.message}`);
  }

  return status;
}

function varySeed(config: GenerationConfig, attempt: number): GenerationConfig {
  // A stable per-attempt seed avoids depending on Date.now() during retries.
  if (attempt === 0) return config;
  const base = config.random_seed ?? 1;
  return { ...config, random_seed: base + attempt * 7919 };
}

async function handleRelationalGeneration(
  supabase: ReturnType<typeof getServiceClient>,
  projectId: string,
  schemas: DetectedSchema[],
  relationships: Relationship[],
  config: GenerationConfig
): Promise<CompletionStatus> {
  const aiDataMap: Record<string, Record<string, string[]>> = {};

  for (const schema of schemas) {
    try {
      const aiData = await generateAIContent(schema.columns, config.row_count, config.locale);
      aiDataMap[schema.table_name] = aiData;
    } catch {
      // AI content generation failed for this table
    }
  }

  const validateOpts = {
    businessRules: config.business_rules,
    nullRate: config.null_rate,
    expectedRowCount: config.row_count,
  };
  const genSchemas = schemas.map((s) => ({ ...s, columns: applyBusinessRules(s.columns, config.business_rules) }));

  const attempts = config.random_seed === null || config.random_seed === undefined ? MAX_REGEN_ATTEMPTS : 1;

  type TableResult = { data: Record<string, unknown>[]; isValid: boolean; errors: ReturnType<typeof validateDataset>["errors"] };
  let bestResults: Record<string, TableResult> | null = null;
  let bestErrorCount = Infinity;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const attemptConfig = varySeed(config, attempt);
    const allData = generateRelationalData(genSchemas, relationships, attemptConfig, aiDataMap);

    // Validate BEFORE privacy masking to avoid false duplicate errors from
    // collapsed masked values (e.g. emails).
    const results: Record<string, TableResult> = {};
    let totalErrors = 0;
    for (const schema of schemas) {
      const tableData = allData[schema.table_name] || [];
      const healRand = seededRandom((config.random_seed ?? Date.now()) + attempt + 888);
      for (let i = 0; i < tableData.length; i++) {
        const row = tableData[i];
        for (const col of schema.columns) {
          const val = row[col.name];
          if (!col.nullable && (val === null || val === undefined)) {
            row[col.name] = generateValue(col, i, healRand, false, config);
          } else if (val !== null && val !== undefined && !isValidType(val, col.type)) {
            row[col.name] = generateValue(col, i, healRand, false, config);
          }
        }
      }
      const { isValid, errors } = validateDataset(tableData, schema, allData, relationships, validateOpts);
      const masked = applyPrivacy(tableData, schema.columns, config.privacy_level);
      results[schema.table_name] = { data: masked, isValid, errors };
      totalErrors += errors.length;
    }

    if (totalErrors < bestErrorCount) {
      bestErrorCount = totalErrors;
      bestResults = results;
    }
    if (totalErrors === 0) break;
  }

  const allErrors: ReturnType<typeof validateDataset>["errors"] = [];

  for (const schema of schemas) {
    const result = bestResults![schema.table_name];
    const statistics = computeStatistics(result.data, schema.columns);
    const perTableStatus = decideStatus(result.errors);
    allErrors.push(...result.errors);

    const { error: insertError } = await supabase.from("generated_datasets").insert({
      project_id: projectId,
      table_name: schema.table_name,
      row_count: result.data.length,
      data: sanitizeForPostgres(result.data),
      statistics: sanitizeForPostgres(statistics),
      is_valid: perTableStatus === "completed",
      validation_errors: result.errors,
    });

    if (insertError) {
      console.error("Failed to insert generated_dataset:", insertError);
      throw new Error(`Failed to save relational dataset for ${schema.table_name}: ${insertError.message}`);
    }
  }

  return decideStatus(allErrors);
}

function sanitizeForPostgres<T>(val: T): T {
  if (typeof val === "string") {
    return val.replace(/\0/g, "").replace(/\\u0000/gi, "") as unknown as T;
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeForPostgres) as unknown as T;
  }
  if (val !== null && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = sanitizeForPostgres(v);
    }
    return out as unknown as T;
  }
  return val;
}

async function handleDocumentGeneration(
  supabase: ReturnType<typeof getServiceClient>,
  projectId: string,
  config: GenerationConfig,
  project: { data_type: string }
) {
  const docType = config.document_type || "invoice";
  const count = config.row_count;

  let aiData: Record<string, string[]> = {};
  try {
    aiData = await generateDocumentAIContent(docType as "invoice" | "bank_statement", count, config.locale);
  } catch {
    // AI document content failed
  }

  if (docType === "invoice") {
    const invoices = generateInvoices(count, config, aiData);
    for (const inv of invoices) {
      const html = invoiceToHTML(inv);
      await supabase.from("generated_documents").insert({
        project_id: projectId,
        document_type: "invoice",
        document_number: inv.invoiceNumber,
        content: inv,
        html_content: html,
      });
    }
  } else if (docType === "bank_statement") {
    const statements = generateBankStatements(count, config, aiData);
    for (const stmt of statements) {
      const html = bankStatementToHTML(stmt);
      await supabase.from("generated_documents").insert({
        project_id: projectId,
        document_type: "bank_statement",
        document_number: stmt.accountNumber,
        content: stmt,
        html_content: html,
      });
    }
  }
}
