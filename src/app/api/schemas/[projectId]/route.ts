import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = getServiceClient();

  const { data: schemas } = await supabase
    .from("detected_schemas")
    .select("*")
    .eq("project_id", projectId);

  const { data: relationships } = await supabase
    .from("relationships")
    .select("*")
    .eq("project_id", projectId);

  return NextResponse.json({ schemas: schemas || [], relationships: relationships || [] });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const body = await req.json();
  const supabase = getServiceClient();

  if (body.schemas) {
    for (const schema of body.schemas) {
      await supabase
        .from("detected_schemas")
        .update({
          columns: schema.columns,
          is_confirmed: true,
        })
        .eq("id", schema.id)
        .eq("project_id", projectId);
    }
  }

  if (body.relationships) {
    for (const rel of body.relationships) {
      await supabase
        .from("relationships")
        .update({
          relationship_type: rel.relationship_type,
          cardinality_min: rel.cardinality_min,
          cardinality_max: rel.cardinality_max,
          is_confirmed: true,
        })
        .eq("id", rel.id)
        .eq("project_id", projectId);
    }
  }

  return NextResponse.json({ success: true });
}
