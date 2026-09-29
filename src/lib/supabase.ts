import { createClient } from "@supabase/supabase-js";
import { createLocalClient } from "./local-db";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

const isPlaceholder =
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl.includes("placeholder") ||
  supabaseUrl.includes("your-project") ||
  !supabaseUrl.startsWith("http");

function initSupabase() {
  try {
    if (isPlaceholder) {
      return createLocalClient() as unknown as ReturnType<typeof createClient>;
    }
    return createClient(supabaseUrl, supabaseAnonKey);
  } catch (e) {
    console.warn("Falling back to local Supabase client:", e);
    return createLocalClient() as unknown as ReturnType<typeof createClient>;
  }
}

export const supabase = initSupabase();

export function getServiceClient() {
  try {
    const key = supabaseServiceKey || supabaseAnonKey;
    if (isPlaceholder || !key) {
      return createLocalClient() as unknown as ReturnType<typeof createClient>;
    }
    return createClient(supabaseUrl, key);
  } catch (e) {
    console.warn("Falling back to local Supabase service client:", e);
    return createLocalClient() as unknown as ReturnType<typeof createClient>;
  }
}

