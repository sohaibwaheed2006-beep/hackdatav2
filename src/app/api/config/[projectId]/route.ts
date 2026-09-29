import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("generation_configs")
    .select("*")
    .eq("project_id", projectId)
    .single();

  if (error || !data) {
    const { data: project } = await supabase
      .from("projects")
      .select("data_type")
      .eq("id", projectId)
      .single();

    const defaultConfig = {
      project_id: projectId,
      row_count: 100,
      locale: "en-US",
      currency: "USD",
      null_rate: 0.05,
      outlier_rate: 0.02,
      privacy_level: "medium",
      document_type: project?.data_type === "document" ? "invoice" : null,
      business_rules: [],
    };

    const { data: created } = await supabase
      .from("generation_configs")
      .insert(defaultConfig)
      .select()
      .single();

    return NextResponse.json(created || defaultConfig);
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const body = await req.json();
  const supabase = getServiceClient();

  const { projectId: _p, id: _id, ...updates } = body;

  const { data: existing } = await supabase
    .from("generation_configs")
    .select("id")
    .eq("project_id", projectId)
    .single();

  if (!existing) {
    const { data: created, error: insertErr } = await supabase
      .from("generation_configs")
      .insert({ project_id: projectId, ...updates })
      .select()
      .single();
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    return NextResponse.json(created);
  }

  const { data, error } = await supabase
    .from("generation_configs")
    .update(updates)
    .eq("project_id", projectId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
