import { createClient } from "@supabase/supabase-js";
import { createLocalClient } from "./local-db";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

const isPlaceholder =
  !supabaseUrl ||
  supabaseUrl.includes("placeholder") ||
  supabaseUrl.includes("your-project") ||
  !supabaseUrl.startsWith("http");

export const supabase = isPlaceholder
  ? (createLocalClient() as unknown as ReturnType<typeof createClient>)
  : createClient(supabaseUrl, supabaseAnonKey);

export function getServiceClient() {
  if (isPlaceholder) {
    return createLocalClient() as unknown as ReturnType<typeof createClient>;
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}
