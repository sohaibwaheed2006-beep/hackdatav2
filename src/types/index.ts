// ============================================
// DATABASE TYPES
// ============================================

export type ProjectStatus =
  | "draft"
  | "analyzing"
  | "configured"
  | "generating"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "error";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  data_type: "tabular" | "relational" | "document";
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface InputFile {
  id: string;
  project_id: string;
  file_name: string;
  file_type: "csv" | "json" | "sql" | "txt";
  raw_content: string;
  parsed_content: unknown;
  created_at: string;
}

export interface ColumnDef {
  name: string;
  type: "string" | "integer" | "float" | "boolean" | "date" | "datetime" | "email" | "phone" | "uuid" | "currency" | "text" | "enum";
  nullable: boolean;
  isPrimary: boolean;
  isUnique: boolean;
  defaultValue?: string;
  constraints?: string[];
  enumValues?: string[];
  minValue?: number;
  maxValue?: number;
  format?: string;
  semanticLabel?: string;
  uniqueRatio?: number;
  missingRatio?: number;
  qualityWarning?: string;
  // ---- statistical profile (populated during analysis) ----
  isConstant?: boolean;
  constantValue?: unknown;
  isIdentifier?: boolean;
  // categorical / boolean empirical distribution: value -> probability
  frequency?: Record<string, number>;
  // numeric profile
  mean?: number;
  stddev?: number;
  median?: number;
  skewness?: number;
  isInteger?: boolean;
  isSkewed?: boolean;
}

export interface DetectedSchema {
  id: string;
  project_id: string;
  table_name: string;
  columns: ColumnDef[];
  primary_keys: string[];
  unique_fields: string[];
  nullable_fields: string[];
  sample_data: Record<string, unknown>[] | null;
  is_confirmed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Relationship {
  id: string;
  project_id: string;
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  relationship_type: "1:1" | "1:N" | "N:N";
  cardinality_min: number;
  cardinality_max: number;
  is_confirmed: boolean;
  created_at: string;
}

export interface GenerationConfig {
  id: string;
  project_id: string;
  row_count: number;
  random_seed: number | null;
  locale: string;
  currency: string;
  null_rate: number;
  outlier_rate: number;
  privacy_level: "none" | "low" | "medium" | "high";
  business_rules: BusinessRule[];
  document_type: "invoice" | "bank_statement" | "receipt" | "report" | null;
  document_template: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessRule {
  field: string;
  rule: "min" | "max" | "range" | "pattern" | "enum" | "custom";
  value: string;
}

export interface GeneratedDataset {
  id: string;
  project_id: string;
  table_name: string;
  row_count: number;
  data: Record<string, unknown>[];
  statistics: DataStatistics | null;
  is_valid: boolean;
  validation_errors: ValidationError[];
  created_at: string;
}

export interface DataStatistics {
  [column: string]: {
    mean?: number;
    median?: number;
    stddev?: number;
    min?: number | string;
    max?: number | string;
    nullCount: number;
    uniqueCount: number;
    distribution?: Record<string, number>;
  };
}

export interface ValidationError {
  type:
    | "pk_duplicate"
    | "fk_invalid"
    | "type_mismatch"
    | "constraint_violation"
    | "null_violation"
    | "business_rule_violation"
    | "rate_deviation"
    | "row_count_mismatch"
    | "column_count_mismatch"
    | "null_token_leak"
    | "empty_result";
  table: string;
  column: string;
  row: number;
  message: string;
  severity?: "warning" | "error";
}

export interface GeneratedDocument {
  id: string;
  project_id: string;
  document_type: "invoice" | "bank_statement" | "receipt" | "report";
  document_number: string | null;
  content: InvoiceContent | BankStatementContent;
  html_content: string | null;
  created_at: string;
}

export interface InvoiceContent {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  billedTo: { name: string; address: string; email: string };
  from: { name: string; address: string; email: string };
  items: { description: string; quantity: number; unitPrice: number; amount: number }[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  currency: string;
}

export interface BankStatementContent {
  accountHolder: string;
  accountNumber: string;
  period: { from: string; to: string };
  openingBalance: number;
  closingBalance: number;
  transactions: {
    date: string;
    description: string;
    debit: number | null;
    credit: number | null;
    balance: number;
  }[];
  currency: string;
}

// ============================================
// API REQUEST / RESPONSE TYPES
// ============================================

export interface AnalyzeInputRequest {
  projectId: string;
  content: string;
  fileName: string;
  fileType: "csv" | "json" | "sql" | "txt";
}

export interface AnalyzeInputResponse {
  dataType: "tabular" | "relational" | "document";
  schemas: Omit<DetectedSchema, "id" | "project_id" | "created_at" | "updated_at">[];
  relationships: Omit<Relationship, "id" | "project_id" | "created_at">[];
}

export interface GenerateRequest {
  projectId: string;
}

export interface ExportRequest {
  projectId: string;
  format: "csv" | "json" | "sql" | "pdf";
  tableNames?: string[];
}
