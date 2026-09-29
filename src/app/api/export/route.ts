import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { exportToCSV, exportToJSON, exportToSQL } from "@/lib/export/exporter";

export async function POST(req: NextRequest) {
  const { projectId, format, tableNames } = await req.json();

  if (!projectId || !format) {
    return NextResponse.json({ error: "Missing projectId or format" }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { data: datasets } = await supabase
    .from("generated_datasets")
    .select("*")
    .eq("project_id", projectId);

  const { data: documents } = await supabase
    .from("generated_documents")
    .select("*")
    .eq("project_id", projectId);

  const { data: schemas } = await supabase
    .from("detected_schemas")
    .select("*")
    .eq("project_id", projectId);

  const { data: relationships } = await supabase
    .from("relationships")
    .select("source_table, source_column, target_table, target_column")
    .eq("project_id", projectId);

  if (format === "pdf" && documents && documents.length > 0) {
    const doc = documents[0];
    await supabase.from("export_history").insert({
      project_id: projectId,
      export_format: "pdf",
      row_count: documents.length,
    });

    return new NextResponse(doc.html_content, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `attachment; filename="${doc.document_type}_${doc.document_number || "doc"}.html"`,
      },
    });
  }

  if (!datasets || datasets.length === 0) {
    return NextResponse.json({ error: "No generated data found" }, { status: 404 });
  }

  const filtered = tableNames
    ? datasets.filter((d) => tableNames.includes(d.table_name))
    : datasets;

  let content: string;
  let contentType: string;
  let fileName: string;

  switch (format) {
    case "csv": {
      if (filtered.length === 1) {
        content = exportToCSV(filtered[0]);
        fileName = `${filtered[0].table_name}.csv`;
      } else {
        content = filtered.map((d) => `--- ${d.table_name} ---\n${exportToCSV(d)}`).join("\n\n");
        fileName = "export.csv";
      }
      contentType = "text/csv";
      break;
    }
    case "json": {
      content = exportToJSON(filtered);
      contentType = "application/json";
      fileName = "export.json";
      break;
    }
    case "sql": {
      const filteredNames = new Set(filtered.map((d) => d.table_name));
      const relevantSchemas = (schemas || [])
        .filter((s) => filteredNames.has(s.table_name))
        .map((s) => ({
          table_name: s.table_name,
          columns: s.columns as import("@/types").ColumnDef[],
          primary_keys: (s.primary_keys as string[] | null) || [],
        }));
      const relevantRels = (relationships || []).filter(
        (r) => filteredNames.has(r.source_table) && filteredNames.has(r.target_table)
      );
      content = exportToSQL(filtered, relevantSchemas, relevantRels);
      contentType = "text/plain";
      fileName = "export.sql";
      break;
    }
    default:
      return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  }

  const totalRows = filtered.reduce((sum, d) => sum + d.row_count, 0);

  await supabase.from("export_history").insert({
    project_id: projectId,
    export_format: format,
    file_size_bytes: new TextEncoder().encode(content).length,
    row_count: totalRows,
  });

  return new NextResponse(content, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
