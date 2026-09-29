import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { analyzeInput, InputValidationError } from "@/lib/analyzers/input-analyzer";
import { detectRelationships } from "@/lib/analyzers/relationship-analyzer";
import { analyzeSchemaWithAI } from "@/lib/ai/ai-layer";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { projectId, content, fileName, fileType } = body;

  if (!projectId || !content || !fileName || !fileType) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Validate BEFORE touching project state, so we never leave a project in a
  // half-analyzed "configured" state after a rejected file.
  let analysis;
  try {
    analysis = analyzeInput(content, fileName, fileType);
  } catch (err) {
    if (err instanceof InputValidationError) {
      return NextResponse.json({ error: err.message, kind: "input_validation" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message, kind: "input_validation" }, { status: 400 });
  }

  try {
    await supabase.from("projects").update({ status: "analyzing" }).eq("id", projectId);

    await supabase.from("input_files").insert({
      project_id: projectId,
      file_name: fileName,
      file_type: fileType,
      raw_content: content,
    });

    await supabase.from("projects").update({ data_type: analysis.dataType }).eq("id", projectId);

    const enhancedTables = [];
    for (const table of analysis.tables) {
      let columns = table.columns;

      if (table.sampleData.length > 0) {
        try {
          const aiResult = await analyzeSchemaWithAI(table.sampleData, columns);
          columns = aiResult.columns;
        } catch {
          // AI enhancement failed, keep heuristic columns (fallback).
        }
      }

      enhancedTables.push({ ...table, columns });
    }

    await supabase.from("detected_schemas").delete().eq("project_id", projectId);
    await supabase.from("relationships").delete().eq("project_id", projectId);

    for (const table of enhancedTables) {
      await supabase.from("detected_schemas").insert({
        project_id: projectId,
        table_name: table.name,
        columns: table.columns,
        primary_keys: table.primaryKeys,
        unique_fields: table.uniqueFields,
        nullable_fields: table.nullableFields,
        sample_data: table.sampleData,
      });
    }

    const relationships = detectRelationships(
      enhancedTables.map((t) => ({
        name: t.name,
        columns: t.columns,
        sampleData: t.sampleData,
      }))
    );

    for (const rel of relationships) {
      await supabase.from("relationships").insert({
        project_id: projectId,
        ...rel,
      });
    }

    const { data: configExists } = await supabase
      .from("generation_configs")
      .select("id")
      .eq("project_id", projectId)
      .single();

    if (!configExists) {
      await supabase.from("generation_configs").insert({
        project_id: projectId,
        row_count: 100,
        locale: "en-US",
        currency: "USD",
        null_rate: 0.05,
        outlier_rate: 0.02,
        privacy_level: "medium",
        document_type: analysis.dataType === "document" ? (analysis.documentType || "invoice") : null,
      });
    }

    await supabase.from("projects").update({ status: "configured" }).eq("id", projectId);

    return NextResponse.json({
      dataType: analysis.dataType,
      qualityWarnings: analysis.qualityWarnings || [],
      tables: enhancedTables.map((t) => ({
        name: t.name,
        columns: t.columns,
        primaryKeys: t.primaryKeys,
        sampleData: t.sampleData.slice(0, 5),
      })),
      relationships,
    });
  } catch (err) {
    await supabase.from("projects").update({ status: "error" }).eq("id", projectId);
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
