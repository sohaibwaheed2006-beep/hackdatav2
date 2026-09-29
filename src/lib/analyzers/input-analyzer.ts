import type { ColumnDef } from "@/types";
import {
  NULL_TOKENS,
  isNullToken,
  normaliseHeader,
  uniqueHeaders,
  checkHeaderQuality,
  parseFlexibleDate,
} from "./data-hygiene";

export class InputValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

export interface ColumnQualityWarning {
  column: string;
  reason: string;
}

interface AnalysisResult {
  dataType: "tabular" | "relational" | "document";
  format: "csv" | "json" | "sql" | "txt";
  tables: ParsedTable[];
  documentType?: "invoice" | "bank_statement";
  qualityWarnings?: ColumnQualityWarning[];
}

interface ParsedTable {
  name: string;
  columns: ColumnDef[];
  sampleData: Record<string, unknown>[];
  primaryKeys: string[];
  uniqueFields: string[];
  nullableFields: string[];
}

const SUPPORTED_FORMATS = new Set(["csv", "json", "sql"]);

export function analyzeInput(
  content: string,
  fileName: string,
  fileType: string
): AnalysisResult {
  if (!content || !content.trim()) {
    throw new InputValidationError("File is empty.");
  }

  if (!SUPPORTED_FORMATS.has(fileType)) {
    throw new InputValidationError(
      `Unsupported file type "${fileType}". Upload a CSV, JSON, or SQL schema.`
    );
  }

  const format = fileType as AnalysisResult["format"];

  let result: AnalysisResult;
  switch (format) {
    case "csv":
      result = analyzeCSV(content, fileName);
      break;
    case "json":
      result = analyzeJSON(content, fileName);
      break;
    case "sql":
      result = analyzeSQL(content);
      break;
    default:
      throw new InputValidationError(`Unsupported file type "${fileType}".`);
  }

  result.qualityWarnings = collectQualityWarnings(result.tables);

  const docType = detectDocumentType(result.tables);
  if (docType) {
    result.dataType = "document";
    result.documentType = docType;
  }

  return result;
}

function collectQualityWarnings(tables: ParsedTable[]): ColumnQualityWarning[] {
  const warnings: ColumnQualityWarning[] = [];
  for (const t of tables) {
    for (const col of t.columns) {
      if (col.qualityWarning) warnings.push({ column: `${t.name}.${col.name}`, reason: col.qualityWarning });
    }
  }
  return warnings;
}

const DOCUMENT_SIGNALS: { type: "invoice" | "bank_statement"; fields: string[] }[] = [
  { type: "invoice", fields: ["invoicenumber", "invoice_number", "invoiceno", "lineitems", "line_items", "subtotal", "taxrate", "tax_rate", "billedto", "billed_to"] },
  { type: "bank_statement", fields: ["accountnumber", "account_number", "openingbalance", "opening_balance", "closingbalance", "closing_balance", "transactions", "debit", "credit", "runningbalance", "running_balance"] },
];

function detectDocumentType(tables: ParsedTable[]): "invoice" | "bank_statement" | null {
  const allFields = new Set<string>();
  for (const t of tables) {
    for (const c of t.columns) allFields.add(c.name.toLowerCase().replace(/[^a-z0-9_]/g, ""));
  }

  for (const signal of DOCUMENT_SIGNALS) {
    const matches = signal.fields.filter((f) => allFields.has(f)).length;
    if (matches >= 2) return signal.type;
  }
  return null;
}

function analyzeCSV(content: string, fileName: string): AnalysisResult {
  const nonEmptyLines = content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (nonEmptyLines.length === 0) {
    throw new InputValidationError("File is empty.");
  }

  const rawHeaders = parseCSVLine(nonEmptyLines[0]);

  if (rawHeaders.length < 2) {
    throw new InputValidationError(
      "Fewer than 2 columns detected. This does not look like CSV data — check the file contents and delimiter."
    );
  }

  const headerIssues = checkHeaderQuality(rawHeaders);
  if (headerIssues.length > 0) {
    const reasons = headerIssues.slice(0, 3).map((i) => `"${i.header.slice(0, 40)}" (${i.reason})`).join("; ");
    throw new InputValidationError(
      `Header row does not look like column names: ${reasons}. If this is prose text, remove it and upload real CSV.`
    );
  }

  const headers = uniqueHeaders(rawHeaders.map((h) => normaliseHeader(h) || "column"));
  const rows = nonEmptyLines.slice(1).map(parseCSVLine);

  if (rows.length === 0) {
    throw new InputValidationError("No data rows found — only a header row was provided.");
  }

  const sampleData = rows.slice(0, 20).map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const raw = row[i];
      obj[h] = raw === undefined || isNullToken(raw) ? null : raw;
    });
    return obj;
  });

  const columns = headers.map((header, colIdx) => {
    const values = rows.map((r) => r[colIdx]).filter((v) => v !== undefined);
    return inferColumnDef(header, values, rows.length);
  });

  const tableName = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_") || "table";

  const primaryKeys = columns.filter((c) => c.isPrimary).map((c) => c.name);
  const uniqueFields = columns.filter((c) => c.isUnique).map((c) => c.name);
  const nullableFields = columns.filter((c) => c.nullable).map((c) => c.name);

  return {
    dataType: "tabular",
    format: "csv",
    tables: [
      {
        name: tableName,
        columns,
        sampleData,
        primaryKeys,
        uniqueFields,
        nullableFields,
      },
    ],
  };
}

function analyzeJSON(content: string, fileName: string): AnalysisResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new InputValidationError(
      `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new InputValidationError("JSON array is empty — no data rows to analyze.");
    }
    const tableName = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_") || "table";
    const table = analyzeJSONArray(parsed as Record<string, unknown>[], tableName);
    return { dataType: "tabular", format: "json", tables: [table] };
  }

  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    const tables: ParsedTable[] = [];
    const arrayKeys = Object.keys(obj).filter((k) => Array.isArray(obj[k]));

    if (arrayKeys.length > 1) {
      for (const key of arrayKeys) {
        const arr = obj[key] as Record<string, unknown>[];
        if (arr.length === 0) continue;
        tables.push(analyzeJSONArray(arr, key));
      }
      if (tables.length === 0) throw new InputValidationError("JSON contains no non-empty arrays.");
      return { dataType: "relational", format: "json", tables };
    }

    if (arrayKeys.length === 1) {
      const arr = obj[arrayKeys[0]] as Record<string, unknown>[];
      if (arr.length === 0) throw new InputValidationError("JSON array is empty — no data rows to analyze.");
      const table = analyzeJSONArray(arr, arrayKeys[0]);
      return { dataType: "tabular", format: "json", tables: [table] };
    }

    const tableName = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_") || "table";
    return {
      dataType: "tabular",
      format: "json",
      tables: [analyzeJSONArray([obj], tableName)],
    };
  }

  throw new InputValidationError("Unsupported JSON structure. Expected an array of objects or an object of arrays.");
}

function analyzeJSONArray(arr: Record<string, unknown>[], tableName: string): ParsedTable {
  if (arr.length === 0) {
    throw new InputValidationError(`Empty array for table "${tableName}".`);
  }

  const allKeys = new Set<string>();
  arr.forEach((row) => Object.keys(row).forEach((k) => allKeys.add(k)));

  const rawHeaders = Array.from(allKeys);
  if (rawHeaders.length < 2) {
    throw new InputValidationError(
      `Table "${tableName}" has fewer than 2 columns — cannot analyze.`
    );
  }

  const headers = uniqueHeaders(rawHeaders.map((h) => normaliseHeader(h) || "column"));
  const remap = new Map(rawHeaders.map((raw, i) => [raw, headers[i]]));

  const cleaned = arr.map((row) => {
    const out: Record<string, unknown> = {};
    for (const rawKey of Object.keys(row)) {
      const value = row[rawKey];
      const cleanKey = remap.get(rawKey)!;
      out[cleanKey] = isNullToken(value) ? null : value;
    }
    return out;
  });

  const sampleData = cleaned.slice(0, 20);

  const columns = headers.map((header) => {
    const values = cleaned
      .map((r) => r[header])
      .filter((v) => v !== undefined && v !== null)
      .map(String);
    return inferColumnDef(header, values, cleaned.length);
  });

  const primaryKeys = columns.filter((c) => c.isPrimary).map((c) => c.name);
  const uniqueFields = columns.filter((c) => c.isUnique).map((c) => c.name);
  const nullableFields = columns.filter((c) => c.nullable).map((c) => c.name);

  return { name: tableName, columns, sampleData, primaryKeys, uniqueFields, nullableFields };
}

function analyzeSQL(content: string): AnalysisResult {
  const tables: ParsedTable[] = [];
  const createTableRegex =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s*\(([\s\S]*?)\);/gi;

  let match;
  while ((match = createTableRegex.exec(content)) !== null) {
    const tableName = match[1];
    const body = match[2];
    const table = parseSQLTableBody(tableName, body);
    tables.push(table);
  }

  if (tables.length === 0) {
    throw new InputValidationError("No CREATE TABLE statements found in SQL.");
  }

  return {
    dataType: tables.length > 1 ? "relational" : "tabular",
    format: "sql",
    tables,
  };
}

function parseSQLTableBody(tableName: string, body: string): ParsedTable {
  const lines = body
    .split(",")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const columns: ColumnDef[] = [];
  const primaryKeys: string[] = [];

  for (const line of lines) {
    const upper = line.toUpperCase();

    if (upper.startsWith("PRIMARY KEY")) {
      const pkMatch = line.match(/\(([^)]+)\)/);
      if (pkMatch) {
        pkMatch[1].split(",").forEach((k) => primaryKeys.push(k.trim().replace(/[`"]/g, "")));
      }
      continue;
    }

    if (upper.startsWith("FOREIGN KEY") || upper.startsWith("CONSTRAINT") || upper.startsWith("UNIQUE") || upper.startsWith("INDEX") || upper.startsWith("CHECK")) {
      continue;
    }

    const colMatch = line.match(/^[`"]?(\w+)[`"]?\s+(\w+(?:\([^)]*\))?)/);
    if (!colMatch) continue;

    const colName = colMatch[1];
    const sqlType = colMatch[2].toUpperCase();
    const isPrimary = upper.includes("PRIMARY KEY");
    const isUnique = upper.includes("UNIQUE");
    const isNullable = !upper.includes("NOT NULL");

    if (isPrimary) primaryKeys.push(colName);

    const enriched = applySchemaHeuristics({
      name: colName,
      type: mapSQLType(sqlType),
      nullable: isNullable,
      isPrimary,
      isUnique,
    });
    columns.push(enriched);
  }

  columns.forEach((c) => {
    if (primaryKeys.includes(c.name)) {
      c.isPrimary = true;
      c.isIdentifier = true;
    }
  });

  return {
    name: tableName,
    columns,
    sampleData: [],
    primaryKeys,
    uniqueFields: columns.filter((c) => c.isUnique).map((c) => c.name),
    nullableFields: columns.filter((c) => c.nullable).map((c) => c.name),
  };
}

function mapSQLType(sqlType: string): ColumnDef["type"] {
  const t = sqlType.replace(/\([^)]*\)/, "").toUpperCase();
  const map: Record<string, ColumnDef["type"]> = {
    INT: "integer",
    INTEGER: "integer",
    BIGINT: "integer",
    SMALLINT: "integer",
    SERIAL: "integer",
    FLOAT: "float",
    DOUBLE: "float",
    DECIMAL: "float",
    NUMERIC: "float",
    REAL: "float",
    BOOLEAN: "boolean",
    BOOL: "boolean",
    DATE: "date",
    TIMESTAMP: "datetime",
    TIMESTAMPTZ: "datetime",
    DATETIME: "datetime",
    UUID: "uuid",
    TEXT: "text",
    VARCHAR: "string",
    CHAR: "string",
    CHARACTER: "string",
  };
  return map[t] || "string";
}

function inferColumnDef(name: string, values: string[], totalRowCount: number): ColumnDef {
  const lowerName = name.toLowerCase();
  const nonNullValues = values.filter((v) => v !== undefined && !isNullToken(v));
  const nullCount = totalRowCount - nonNullValues.length;
  const uniqueValues = new Set(nonNullValues);
  const missingRatio = totalRowCount > 0 ? nullCount / totalRowCount : 1;

  const isPrimary =
    lowerName === "id" ||
    (lowerName.endsWith("_id") && uniqueValues.size === nonNullValues.length && nonNullValues.length > 0);
  const isUnique = uniqueValues.size === nonNullValues.length && nonNullValues.length > 1;
  const nullable = nullCount > 0;

  let qualityWarning: string | undefined;
  if (nonNullValues.length === 0) {
    qualityWarning = "column has no usable values (every cell is missing or a null-like token)";
  } else if (missingRatio > 0.9) {
    qualityWarning = `column is ${(missingRatio * 100).toFixed(0)}% missing`;
  }

  const uniqueRatio = nonNullValues.length > 0 ? uniqueValues.size / nonNullValues.length : 0;

  // ---- statistical profile shared by all column types ----
  const isConstant = uniqueValues.size === 1 && nonNullValues.length > 0;
  const constantValue = isConstant ? Array.from(uniqueValues)[0] : undefined;
  const isIdentifier = isPrimary || (isUnique && (lowerName === "id" || lowerName.endsWith("_id")));
  const frequency = buildFrequency(nonNullValues);

  const base = {
    name,
    nullable,
    uniqueRatio,
    missingRatio,
    qualityWarning,
    isConstant,
    constantValue,
    isIdentifier,
    frequency,
  };

  if (lowerName.includes("email")) {
    return { ...base, type: "email", isPrimary: false, isUnique };
  }

  if (lowerName.includes("phone") || lowerName.includes("tel")) {
    return { ...base, type: "phone", isPrimary: false, isUnique: false };
  }

  if (lowerName.includes("price") || lowerName.includes("amount") || lowerName.includes("cost") || lowerName.includes("balance") || lowerName.includes("total") || lowerName.includes("salary") || lowerName.includes("revenue")) {
    return { ...base, type: "currency", isPrimary: false, isUnique: false };
  }

  if (lowerName.includes("date") || lowerName.includes("created") || lowerName.includes("updated") || lowerName === "signup_date" || lowerName === "dob") {
    const parsed = nonNullValues.map((v) => parseFlexibleDate(v));
    const validCount = parsed.filter((p) => p.iso !== null).length;
    if (validCount === nonNullValues.length && nonNullValues.length > 0) {
      const ambiguous = parsed.some((p) => p.ambiguous);
      const warn = ambiguous ? "date column has ambiguous DD/MM vs MM/DD values" : qualityWarning;
      return { ...base, qualityWarning: warn, type: "date", isPrimary: false, isUnique: false };
    }
  }

  const allIntegers = nonNullValues.every((v) => /^-?\d+$/.test(v));
  if (allIntegers && nonNullValues.length > 0) {
    const nums = nonNullValues.map(Number);
    const numericProfile = computeNumericProfile(nums);
    const treatAsId = isPrimary && lowerName === "id";
    return {
      ...base,
      type: "integer",
      isPrimary: treatAsId,
      isUnique: isUnique && (lowerName === "id" || lowerName.endsWith("_id")),
      isInteger: true,
      minValue: numericProfile.min,
      maxValue: numericProfile.max,
      mean: numericProfile.mean,
      median: numericProfile.median,
      stddev: numericProfile.stddev,
      skewness: numericProfile.skewness,
      isSkewed: numericProfile.isSkewed,
    };
  }

  const allFloats = nonNullValues.every((v) => /^-?\d+\.?\d*$/.test(v.replace(/[$,]/g, "")));
  if (allFloats && nonNullValues.length > 0) {
    const nums = nonNullValues.map((v) => Number(v.replace(/[$,]/g, "")));
    const numericProfile = computeNumericProfile(nums);
    return {
      ...base,
      type: "float",
      isPrimary: false,
      isUnique: false,
      isInteger: false,
      minValue: numericProfile.min,
      maxValue: numericProfile.max,
      mean: numericProfile.mean,
      median: numericProfile.median,
      stddev: numericProfile.stddev,
      skewness: numericProfile.skewness,
      isSkewed: numericProfile.isSkewed,
    };
  }

  const allBooleans = nonNullValues.every((v) =>
    ["true", "false", "0", "1", "yes", "no"].includes(v.toLowerCase())
  );
  if (allBooleans && nonNullValues.length > 0) {
    // frequency stored as normalized "true"/"false" for downstream sampling
    const boolFreq: Record<string, number> = { true: 0, false: 0 };
    for (const v of nonNullValues) {
      const key = ["true", "1", "yes"].includes(v.toLowerCase()) ? "true" : "false";
      boolFreq[key] += 1;
    }
    const total = nonNullValues.length;
    boolFreq.true /= total;
    boolFreq.false /= total;
    return { ...base, type: "boolean", isPrimary: false, isUnique: false, frequency: boolFreq };
  }

  const avgLen = nonNullValues.length > 0
    ? nonNullValues.reduce((s, v) => s + v.length, 0) / nonNullValues.length
    : 0;

  // Category detection: few distinct values, either a low unique ratio OR
  // uniformly short codes (e.g., country/currency/status codes).
  // Skip columns whose header or values suggest free text (names, titles).
  const looksLikeLabel = /^(name|title|full_name|first_name|last_name|description|comment|address|note)$/.test(lowerName);
  const allNoSpaces = nonNullValues.every((v) => !/\s/.test(v));
  const shortCodes = uniqueValues.size <= 8 && avgLen <= 8 && allNoSpaces;
  const lowRatio = uniqueValues.size < nonNullValues.length * 0.5;
  if (!looksLikeLabel && uniqueValues.size <= 10 && nonNullValues.length > 0 && (lowRatio || shortCodes)) {
    return {
      ...base,
      type: "enum",
      isPrimary: false,
      isUnique: false,
      enumValues: Array.from(uniqueValues),
    };
  }

  const looksLikeFreeText = avgLen > 40 || nonNullValues.some((v) => /\s\S+\s\S+\s/.test(v));

  return {
    ...base,
    type: looksLikeFreeText ? "text" : "string",
    isPrimary: isPrimary && lowerName === "id",
    isUnique,
  };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Column-name driven defaults for schema-only inputs (SQL DDL, JSON with no
// samples) so the generator has a sensible profile to sample from instead of
// falling back to uniform-in-[0,100] numerics and AI-invented categories.
function applySchemaHeuristics(col: ColumnDef): ColumnDef {
  const lower = col.name.toLowerCase();
  const out: ColumnDef = { ...col };

  if (col.isPrimary || lower === "id" || lower.endsWith("_id")) {
    out.isIdentifier = true;
  }

  if (out.type === "integer" || out.type === "float" || out.type === "currency") {
    const profile = numericHintForName(lower, out.type === "integer");
    if (profile) {
      out.minValue = profile.min;
      out.maxValue = profile.max;
      out.mean = profile.mean;
      out.stddev = profile.stddev;
      out.median = profile.mean;
      out.isInteger = out.type === "integer";
      out.isSkewed = profile.skewed;
      out.skewness = profile.skewed ? 1.5 : 0;
    }
  }

  // Common enum-like column names — supply sensible defaults so we don't ask
  // the LLM to invent categories from thin air.
  if (out.type === "string" || out.type === "text") {
    const enumHint = enumHintForName(lower);
    if (enumHint) {
      out.type = "enum";
      out.enumValues = enumHint;
      const freq: Record<string, number> = {};
      for (const v of enumHint) freq[v] = 1 / enumHint.length;
      out.frequency = freq;
    }
  }

  return out;
}

interface NumericHint { min: number; max: number; mean: number; stddev: number; skewed: boolean }

function numericHintForName(name: string, integer: boolean): NumericHint | null {
  if (name === "age" || name.endsWith("_age")) return { min: 18, max: 90, mean: 40, stddev: 15, skewed: false };
  if (name.includes("year")) return { min: 1980, max: 2025, mean: 2015, stddev: 8, skewed: false };
  if (name.includes("income") || name.includes("salary") || name.includes("revenue")) {
    return { min: 20000, max: 300000, mean: 65000, stddev: 40000, skewed: true };
  }
  if (name.includes("price") || name.includes("cost") || name.includes("amount") || name.includes("total") || name.includes("balance") || name.includes("fee")) {
    return { min: 5, max: 5000, mean: 200, stddev: 300, skewed: true };
  }
  if (name.includes("quantity") || name.includes("count") || name.includes("qty")) {
    return { min: 1, max: 100, mean: 10, stddev: 15, skewed: true };
  }
  if (name.includes("rating") || name.includes("score") || name.includes("stars")) {
    return { min: 1, max: 5, mean: 4, stddev: 1, skewed: false };
  }
  if (name.includes("percent") || name === "pct") return { min: 0, max: 100, mean: 50, stddev: 25, skewed: false };
  if (name.includes("weight")) return { min: 40, max: 150, mean: 75, stddev: 15, skewed: false };
  if (name.includes("height")) return { min: 140, max: 210, mean: 170, stddev: 10, skewed: false };
  if (integer) return { min: 1, max: 1000, mean: 100, stddev: 100, skewed: true };
  return { min: 0, max: 1000, mean: 250, stddev: 200, skewed: true };
}

function enumHintForName(name: string): string[] | null {
  if (name === "plan" || name.endsWith("_plan") || name === "tier" || name === "subscription") {
    return ["free", "pro", "team", "enterprise"];
  }
  if (name === "status" || name.endsWith("_status") || name === "state") {
    return ["active", "inactive", "pending"];
  }
  if (name === "role" || name === "user_role" || name === "permission") {
    return ["admin", "user", "guest"];
  }
  if (name === "category" || name === "type" || name.endsWith("_type") || name.endsWith("_category")) {
    return ["standard", "premium", "custom"];
  }
  if (name === "priority") return ["low", "medium", "high"];
  if (name === "gender" || name === "sex") return ["male", "female", "other"];
  if (name === "country" || name === "country_code") return ["US", "UK", "DE", "FR", "JP", "CA", "AU", "IN"];
  if (name === "currency" || name === "currency_code") return ["USD", "EUR", "GBP", "JPY", "CAD"];
  return null;
}

function buildFrequency(values: string[]): Record<string, number> | undefined {
  if (values.length === 0) return undefined;
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const total = values.length;
  const freq: Record<string, number> = {};
  for (const k of Object.keys(counts)) freq[k] = counts[k] / total;
  return freq;
}

interface NumericProfile {
  min: number;
  max: number;
  mean: number;
  median: number;
  stddev: number;
  skewness: number;
  isSkewed: boolean;
}

function computeNumericProfile(nums: number[]): NumericProfile {
  const n = nums.length;
  const sorted = [...nums].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[n - 1];
  const mean = nums.reduce((a, b) => a + b, 0) / n;
  const median = sorted[Math.floor(n / 2)];
  const variance = n > 1 ? nums.reduce((acc, x) => acc + (x - mean) ** 2, 0) / n : 0;
  const stddev = Math.sqrt(variance);
  // Fisher-Pearson skewness
  let skewness = 0;
  if (stddev > 0 && n > 0) {
    const m3 = nums.reduce((acc, x) => acc + (x - mean) ** 3, 0) / n;
    skewness = m3 / stddev ** 3;
  }
  const isSkewed = Math.abs(skewness) > 1;
  return { min, max, mean, median, stddev, skewness, isSkewed };
}

// Re-export so callers have a single import surface.
export { NULL_TOKENS, isNullToken, parseFlexibleDate };
