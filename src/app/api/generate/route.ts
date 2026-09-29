import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { generateTabularData, applyPrivacy, applyBusinessRules } from "@/lib/generators/tabular-engine";
import { generateRelationalData } from "@/lib/generators/relational-engine";
import { generateInvoices, generateBankStatements } from "@/lib/generators/document-engine";
import { generateAIContent, generateDocumentAIContent, generateEdgeCases } from "@/lib/ai/ai-layer";
import { validateDataset, computeStatistics, decideStatus, CompletionStatus } from "@/lib/validators/data-validator";
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
      const edgeCases = await generateEdgeCases(schema.columns, Math.min(5, Math.floor(config.row_count * 0.05)));
      if (edgeCases.length > 0) {
        data = [...data.slice(0, data.length - edgeCases.length), ...edgeCases];
      }
    } catch {
      // Edge case generation failed
    }

    data = applyPrivacy(data, schema.columns, config.privacy_level);

    const { isValid, errors } = validateDataset(data, schema, undefined, undefined, validateOpts);

    if (!best || errors.length < best.errors.length) {
      best = { data, isValid, errors };
    }
    if (isValid) break;
  }

  const result = best!;
  const statistics = computeStatistics(result.data, schema.columns);
  const status = decideStatus(result.errors);

  await supabase.from("generated_datasets").insert({
    project_id: projectId,
    table_name: schema.table_name,
    row_count: result.data.length,
    data: result.data,
    statistics,
    is_valid: status === "completed",
    validation_errors: result.errors,
  });

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

    const masked: Record<string, Record<string, unknown>[]> = {};
    for (const schema of schemas) {
      masked[schema.table_name] = applyPrivacy(allData[schema.table_name] || [], schema.columns, config.privacy_level);
    }

    const results: Record<string, TableResult> = {};
    let totalErrors = 0;
    for (const schema of schemas) {
      const { isValid, errors } = validateDataset(masked[schema.table_name], schema, masked, relationships, validateOpts);
      results[schema.table_name] = { data: masked[schema.table_name], isValid, errors };
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

    await supabase.from("generated_datasets").insert({
      project_id: projectId,
      table_name: schema.table_name,
      row_count: result.data.length,
      data: result.data,
      statistics,
      is_valid: perTableStatus === "completed",
      validation_errors: result.errors,
    });
  }

  return decideStatus(allErrors);
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
