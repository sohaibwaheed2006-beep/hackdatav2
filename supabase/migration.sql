-- ============================================
-- HackDataV2 — Synthetic Data Platform
-- Complete Database Schema
-- ============================================
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard > SQL Editor > New Query > Paste & Run
-- ============================================

-- 1. PROJECTS TABLE
-- Stores user projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  data_type TEXT CHECK (data_type IN ('tabular', 'relational', 'document')) DEFAULT 'tabular',
  status TEXT CHECK (status IN ('draft', 'analyzing', 'configured', 'generating', 'completed', 'completed_with_warnings', 'failed', 'error')) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. INPUT FILES TABLE
-- Stores uploaded input data (CSV, JSON, SQL schema)
CREATE TABLE IF NOT EXISTS input_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT CHECK (file_type IN ('csv', 'json', 'sql', 'txt')) NOT NULL,
  raw_content TEXT NOT NULL,
  parsed_content JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. DETECTED SCHEMAS TABLE
-- Stores the schema detected from input analysis
CREATE TABLE IF NOT EXISTS detected_schemas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  table_name TEXT NOT NULL,
  columns JSONB NOT NULL DEFAULT '[]',
  -- columns format: [{ name, type, nullable, isPrimary, isUnique, defaultValue, constraints }]
  primary_keys TEXT[] DEFAULT '{}',
  unique_fields TEXT[] DEFAULT '{}',
  nullable_fields TEXT[] DEFAULT '{}',
  sample_data JSONB,
  is_confirmed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. RELATIONSHIPS TABLE
-- Stores detected relationships between tables
CREATE TABLE IF NOT EXISTS relationships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  source_table TEXT NOT NULL,
  source_column TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_column TEXT NOT NULL,
  relationship_type TEXT CHECK (relationship_type IN ('1:1', '1:N', 'N:N')) NOT NULL,
  cardinality_min INT DEFAULT 0,
  cardinality_max INT DEFAULT 10,
  is_confirmed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. GENERATION CONFIGS TABLE
-- Stores generation settings per project
CREATE TABLE IF NOT EXISTS generation_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL UNIQUE,
  row_count INT DEFAULT 100,
  random_seed INT,
  locale TEXT DEFAULT 'en-US',
  currency TEXT DEFAULT 'USD',
  null_rate DECIMAL(3,2) DEFAULT 0.05,
  outlier_rate DECIMAL(3,2) DEFAULT 0.02,
  privacy_level TEXT CHECK (privacy_level IN ('none', 'low', 'medium', 'high')) DEFAULT 'medium',
  business_rules JSONB DEFAULT '[]',
  -- business_rules format: [{ field, rule, value }]
  document_type TEXT CHECK (document_type IN ('invoice', 'bank_statement', 'receipt', 'report')),
  document_template JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. GENERATED DATASETS TABLE
-- Stores generated synthetic data
CREATE TABLE IF NOT EXISTS generated_datasets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  table_name TEXT NOT NULL,
  row_count INT DEFAULT 0,
  data JSONB NOT NULL DEFAULT '[]',
  statistics JSONB,
  -- statistics: { mean, median, stddev, min, max, nullCount, uniqueCount }
  is_valid BOOLEAN DEFAULT false,
  validation_errors JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. GENERATED DOCUMENTS TABLE
-- Stores generated documents (invoices, bank statements)
CREATE TABLE IF NOT EXISTS generated_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  document_type TEXT CHECK (document_type IN ('invoice', 'bank_statement', 'receipt', 'report')) NOT NULL,
  document_number TEXT,
  content JSONB NOT NULL,
  -- invoice content: { invoiceNumber, billedTo, from, items[], subtotal, tax, total, date }
  -- bank_statement: { accountHolder, transactions[], openingBalance, closingBalance, period }
  html_content TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. EXPORT HISTORY TABLE
-- Tracks exports
CREATE TABLE IF NOT EXISTS export_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  export_format TEXT CHECK (export_format IN ('csv', 'json', 'sql', 'pdf')) NOT NULL,
  file_size_bytes BIGINT,
  row_count INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_input_files_project ON input_files(project_id);
CREATE INDEX IF NOT EXISTS idx_detected_schemas_project ON detected_schemas(project_id);
CREATE INDEX IF NOT EXISTS idx_relationships_project ON relationships(project_id);
CREATE INDEX IF NOT EXISTS idx_generated_datasets_project ON generated_datasets(project_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_project ON generated_documents(project_id);

-- ============================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_projects_updated
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_schemas_updated
  BEFORE UPDATE ON detected_schemas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_configs_updated
  BEFORE UPDATE ON generation_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- For now, allow all operations (no auth)
-- ============================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE input_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE detected_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_history ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (hackathon mode - no auth)
CREATE POLICY "Allow all on projects" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on input_files" ON input_files FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on detected_schemas" ON detected_schemas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on relationships" ON relationships FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on generation_configs" ON generation_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on generated_datasets" ON generated_datasets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on generated_documents" ON generated_documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on export_history" ON export_history FOR ALL USING (true) WITH CHECK (true);

-- Idempotent status check upgrade (safe to re-run on existing DBs)
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('draft', 'analyzing', 'configured', 'generating', 'completed', 'completed_with_warnings', 'failed', 'error'));
