import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = getServiceClient();

  const { data: datasets } = await supabase
    .from("generated_datasets")
    .select("*")
    .eq("project_id", projectId);

  const { data: documents } = await supabase
    .from("generated_documents")
    .select("*")
    .eq("project_id", projectId);

  return NextResponse.json({
    datasets: datasets || [],
    documents: documents || [],
  });
}
