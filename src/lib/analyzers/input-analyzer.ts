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

  if (!result.tables || result.tables.length === 0) {
    throw new InputValidationError("No tables found. Could not recognize valid tables or schema in the provided input.");
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

function isTableSchemaDefinition(item: unknown): boolean {
  if (typeof item !== "object" || item === null) return false;
  const o = item as Record<string, unknown>;
  const hasName = typeof o.name === "string" || typeof o.tableName === "string" || typeof o.table_name === "string";
  const hasCols = Array.isArray(o.columns) || Array.isArray(o.fields);
  return hasName && hasCols;
}

function parseJSONTableSchema(def: Record<string, unknown>, fallbackName: string): ParsedTable {
  const name = String(def.name || def.tableName || def.table_name || fallbackName).replace(/[^a-zA-Z0-9_]/g, "_");
  const rawCols = (def.columns || def.fields) as unknown[];
  if (!Array.isArray(rawCols) || rawCols.length < 2) {
    throw new InputValidationError(`Table "${name}" has fewer than 2 columns — cannot analyze.`);
  }

  const columns: ColumnDef[] = [];
  const primaryKeys: string[] = [];

  for (const c of rawCols) {
    if (typeof c !== "object" || c === null) continue;
    const colObj = c as Record<string, unknown>;
    const colName = String(colObj.name || colObj.field || colObj.column_name || "").trim();
    if (!colName) continue;

    const lowerName = colName.toLowerCase();
    const typeStr = String(colObj.type || colObj.dataType || "string").toLowerCase();
    const mappedType: ColumnDef["type"] = mapSQLType(typeStr);

    const isPrimary = Boolean(
      colObj.isPrimary ||
      colObj.primary ||
      colObj.primaryKey ||
      lowerName === "id" ||
      lowerName.startsWith("pk_") ||
      lowerName.endsWith("_pk")
    );
    const isUnique = Boolean(colObj.isUnique || colObj.unique || isPrimary);
    const isNullable = colObj.nullable !== undefined
      ? Boolean(colObj.nullable)
      : (!isPrimary && !lowerName.startsWith("pk_") && !lowerName.endsWith("_pk") && !lowerName.includes("tracking"));

    if (isPrimary) primaryKeys.push(colName);

    columns.push({
      name: colName,
      type: mappedType,
      nullable: isNullable,
      isPrimary,
      isUnique,
      isIdentifier: isPrimary || lowerName.endsWith("_id") || lowerName.startsWith("pk_"),
      enumValues: Array.isArray(colObj.enumValues) ? (colObj.enumValues as string[]) : undefined,
    });
  }

  if (columns.length < 2) {
    throw new InputValidationError(`Table "${name}" has fewer than 2 valid columns — cannot analyze.`);
  }

  return {
    name,
    columns,
    sampleData: [],
    primaryKeys,
    uniqueFields: columns.filter((c) => c.isUnique).map((c) => c.name),
    nullableFields: columns.filter((c) => c.nullable).map((c) => c.name),
  };
}

function parseJSONSchemaProperties(obj: Record<string, unknown>, tableName: string): ParsedTable | null {
  const props = obj.properties as Record<string, unknown> | undefined;
  if (!props || typeof props !== "object") return null;
  const propKeys = Object.keys(props);
  if (propKeys.length < 2) return null;

  const required = new Set(Array.isArray(obj.required) ? (obj.required as string[]) : []);
  const columns: ColumnDef[] = [];
  const primaryKeys: string[] = [];

  for (const key of propKeys) {
    const fieldDef = (props[key] || {}) as Record<string, unknown>;
    const lower = key.toLowerCase();
    const typeStr = String(fieldDef.type || "string").toLowerCase();
    let mappedType: ColumnDef["type"] = "string";
    if (typeStr === "integer" || typeStr === "number") mappedType = typeStr === "integer" ? "integer" : "float";
    else if (typeStr === "boolean") mappedType = "boolean";
    else if (fieldDef.format === "date-time") mappedType = "datetime";
    else if (fieldDef.format === "date") mappedType = "date";
    else if (fieldDef.format === "email") mappedType = "email";
    else if (fieldDef.format === "uuid") mappedType = "uuid";
    else mappedType = mapSQLType(typeStr);

    const isPrimary = lower === "id" || lower.startsWith("pk_") || lower.endsWith("_pk");
    if (isPrimary) primaryKeys.push(key);

    columns.push({
      name: key,
      type: mappedType,
      nullable: !required.has(key) && !isPrimary && !lower.startsWith("pk_") && !lower.endsWith("_pk") && !lower.includes("tracking"),
      isPrimary,
      isUnique: isPrimary,
      isIdentifier: isPrimary || lower.endsWith("_id") || lower.startsWith("pk_"),
      enumValues: Array.isArray(fieldDef.enum) ? (fieldDef.enum as string[]) : undefined,
    });
  }

  if (columns.length < 2) return null;

  return {
    name: tableName,
    columns,
    sampleData: [],
    primaryKeys,
    uniqueFields: columns.filter((c) => c.isUnique).map((c) => c.name),
    nullableFields: columns.filter((c) => c.nullable).map((c) => c.name),
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

  const baseTableName = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_") || "table";

  // Case 1: Top-level Array
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new InputValidationError("No tables found. JSON array is empty.");
    }
    // Check if it's an array of table schema definitions
    if (parsed.every((item) => isTableSchemaDefinition(item))) {
      const tables = parsed.map((item, idx) => parseJSONTableSchema(item as Record<string, unknown>, `${baseTableName}_${idx + 1}`));
      return { dataType: tables.length > 1 ? "relational" : "tabular", format: "json", tables };
    }
    // Otherwise it must be an array of row objects
    const isRowObjects = parsed.every((item) => typeof item === "object" && item !== null && !Array.isArray(item));
    if (!isRowObjects) {
      throw new InputValidationError("No tables found. Expected an array of row objects or table schema definitions.");
    }
    const table = analyzeJSONArray(parsed as Record<string, unknown>[], baseTableName);
    return { dataType: "tabular", format: "json", tables: [table] };
  }

  // Case 2: Top-level Object
  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;

    // 2A: Explicit tables / schemas array: { tables: [...] } or { schemas: [...] }
    const schemaArray = (Array.isArray(obj.tables) ? obj.tables : Array.isArray(obj.schemas) ? obj.schemas : null) as unknown[] | null;
    if (schemaArray) {
      if (schemaArray.length === 0) {
        throw new InputValidationError("No tables found. The tables array is empty.");
      }
      if (schemaArray.every((item) => isTableSchemaDefinition(item))) {
        const tables = schemaArray.map((item, idx) => parseJSONTableSchema(item as Record<string, unknown>, `table_${idx + 1}`));
        return { dataType: tables.length > 1 ? "relational" : "tabular", format: "json", tables };
      }
    }

    // 2B: Tables dictionary: { tables: { users: [...], orders: [...] } } or { tables: { users: { columns: [...] } } }
    if (obj.tables && typeof obj.tables === "object" && !Array.isArray(obj.tables)) {
      const tablesObj = obj.tables as Record<string, unknown>;
      const tableNames = Object.keys(tablesObj);
      const parsedTables: ParsedTable[] = [];
      for (const tName of tableNames) {
        const val = tablesObj[tName];
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object" && val[0] !== null && !Array.isArray(val[0])) {
          parsedTables.push(analyzeJSONArray(val as Record<string, unknown>[], tName));
        } else if (isTableSchemaDefinition(val)) {
          parsedTables.push(parseJSONTableSchema(val as Record<string, unknown>, tName));
        }
      }
      if (parsedTables.length > 0) {
        return { dataType: parsedTables.length > 1 ? "relational" : "tabular", format: "json", tables: parsedTables };
      }
    }

    // 2C: Relational data where keys are table names containing row arrays: { users: [ {...} ], orders: [ {...} ] }
    const arrayKeys = Object.keys(obj).filter((k) => {
      const val = obj[k];
      return Array.isArray(val) && val.length > 0 && typeof val[0] === "object" && val[0] !== null && !Array.isArray(val[0]);
    });

    if (arrayKeys.length > 1) {
      const tables: ParsedTable[] = [];
      for (const key of arrayKeys) {
        const arr = obj[key] as Record<string, unknown>[];
        tables.push(analyzeJSONArray(arr, key));
      }
      return { dataType: "relational", format: "json", tables };
    }

    if (arrayKeys.length === 1) {
      const arr = obj[arrayKeys[0]] as Record<string, unknown>[];
      const table = analyzeJSONArray(arr, arrayKeys[0]);
      return { dataType: "tabular", format: "json", tables: [table] };
    }

    // 2D: JSON Schema format: { "$schema": "...", "properties": { ... } } or { "type": "object", "properties": { ... } }
    const schemaTable = parseJSONSchemaProperties(obj, baseTableName);
    if (schemaTable) {
      return { dataType: "tabular", format: "json", tables: [schemaTable] };
    }

    // If none of the above matched, this JSON cannot be recognized as a schema or table data!
    throw new InputValidationError("No tables found. Could not recognize valid table data or schema in the provided JSON.");
  }

  throw new InputValidationError("No tables found. Unsupported JSON structure.");
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
  // Strip comments
  const cleanSQL = content
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  const tables: ParsedTable[] = [];
  const createTableRegex =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[`"]?\w+[`"]?\.)?[`"]?(\w+)[`"]?\s*\(/gi;

  let match;
  while ((match = createTableRegex.exec(cleanSQL)) !== null) {
    const tableName = match[1];
    const startIndex = createTableRegex.lastIndex; // index right after '('
    let depth = 1;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let endIndex = -1;

    for (let i = startIndex; i < cleanSQL.length; i++) {
      const ch = cleanSQL[i];
      if (ch === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
      } else if (ch === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
      } else if (ch === "(" && !inSingleQuote && !inDoubleQuote) {
        depth++;
      } else if (ch === ")" && !inSingleQuote && !inDoubleQuote) {
        depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }

    if (endIndex !== -1) {
      const body = cleanSQL.substring(startIndex, endIndex);
      const table = parseSQLTableBody(tableName, body);
      tables.push(table);
      createTableRegex.lastIndex = endIndex + 1;
    }
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

function splitSQLDefinitions(body: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += ch;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
    } else if (ch === "(" && !inSingleQuote && !inDoubleQuote) {
      depth++;
      current += ch;
    } else if (ch === ")" && !inSingleQuote && !inDoubleQuote) {
      depth = Math.max(0, depth - 1);
      current += ch;
    } else if (ch === "," && depth === 0 && !inSingleQuote && !inDoubleQuote) {
      if (current.trim().length > 0) parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) parts.push(current.trim());
  return parts;
}

function parseSQLTableBody(tableName: string, body: string): ParsedTable {
  const lines = splitSQLDefinitions(body);

  const columns: ColumnDef[] = [];
  const primaryKeys: string[] = [];

  for (const line of lines) {
    const upper = line.toUpperCase().trim();

    if (upper.startsWith("PRIMARY KEY") || (upper.includes("PRIMARY KEY") && upper.startsWith("CONSTRAINT"))) {
      const pkMatch = line.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) {
        pkMatch[1].split(",").forEach((k) => primaryKeys.push(k.trim().replace(/[`"]/g, "")));
      }
      continue;
    }

    if (upper.startsWith("UNIQUE") || (upper.includes("UNIQUE") && upper.startsWith("CONSTRAINT"))) {
      const uqMatch = line.match(/UNIQUE\s*\(([^)]+)\)/i);
      if (uqMatch) {
        uqMatch[1].split(",").forEach((k) => {
          const uqName = k.trim().replace(/[`"]/g, "");
          const found = columns.find((c) => c.name === uqName);
          if (found) found.isUnique = true;
        });
      }
      continue;
    }

    if (upper.startsWith("FOREIGN KEY") || upper.startsWith("CHECK") || upper.startsWith("INDEX")) {
      continue;
    }

    const colMatch = line.match(/^[`"]?([a-zA-Z0-9_]+)[`"]?\s+([a-zA-Z0-9_]+(?:\([^)]*\))?)/);
    if (!colMatch) continue;

    const colName = colMatch[1];
    const sqlType = colMatch[2].toUpperCase();
    const isPrimary = upper.includes("PRIMARY KEY");
    const isUnique = upper.includes("UNIQUE");
    const isNullable = !upper.includes("NOT NULL") && !isPrimary && colName.toLowerCase() !== "id";

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
    const l = c.name.toLowerCase();
    if (primaryKeys.includes(c.name) || l === "id" || l.startsWith("pk_") || l.endsWith("_pk")) {
      c.isPrimary = true;
      c.isIdentifier = true;
      c.nullable = false;
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
    BIGSERIAL: "integer",
    FLOAT: "float",
    DOUBLE: "float",
    DECIMAL: "currency",
    NUMERIC: "currency",
    MONEY: "currency",
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
    lowerName.startsWith("pk_") ||
    lowerName.endsWith("_pk") ||
    (lowerName.endsWith("_id") && uniqueValues.size === nonNullValues.length && nonNullValues.length > 0);
  const isUnique = uniqueValues.size === nonNullValues.length && nonNullValues.length > 1;

  const isStructural =
    isPrimary ||
    lowerName.startsWith("pk_") ||
    lowerName.endsWith("_pk") ||
    lowerName.startsWith("fk_") ||
    lowerName.endsWith("_fk") ||
    lowerName.endsWith("_id") ||
    lowerName.startsWith("id_") ||
    lowerName.includes("tracking") ||
    lowerName.includes("code") ||
    lowerName.includes("sku") ||
    lowerName.endsWith("_no") ||
    lowerName.endsWith("_key");

  // Structural columns and primary keys are non-nullable by definition
  const nullable = !isPrimary && !isStructural && nullCount > 0;

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
  const isIdentifier = isPrimary || isStructural || (isUnique && (lowerName === "id" || lowerName.endsWith("_id")));
  const frequency = buildFrequency(nonNullValues);

  const base = {
    name,
    nullable,
    uniqueRatio,
    missingRatio,
    qualityWarning,
    isConstant,
    constantValue,
    isPrimary,
    isUnique,
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
    const treatAsId = isPrimary || lowerName === "id" || lowerName.startsWith("pk_") || lowerName.endsWith("_pk");
    return {
      ...base,
      type: "integer",
      isPrimary: treatAsId,
      isUnique: (isUnique || treatAsId) && (lowerName === "id" || lowerName.endsWith("_id") || lowerName.startsWith("pk_") || lowerName.endsWith("_pk")),
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
  if (!isPrimary && !isStructural && !looksLikeLabel && uniqueValues.size <= 10 && nonNullValues.length > 0 && (lowRatio || shortCodes)) {
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
    isPrimary: isPrimary || lowerName === "id" || lowerName.startsWith("pk_") || lowerName.endsWith("_pk"),
    isUnique: isUnique || isPrimary || lowerName.startsWith("pk_") || lowerName.endsWith("_pk"),
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
    if (lower === "id") {
      out.isPrimary = true;
      out.nullable = false;
    }
  }

  // Detect semantic type from column name for SQL schema inputs:
  if (lower === "email" || lower.includes("email")) {
    out.type = "email";
    out.isUnique = true;
  } else if (lower.includes("phone") || lower.includes("tel") || lower.includes("mobile")) {
    out.type = "phone";
    out.isUnique = true;
  } else if (
    lower.includes("balance") ||
    lower.includes("price") ||
    lower.includes("cost") ||
    lower.includes("amount") ||
    lower.includes("fee") ||
    lower.includes("salary") ||
    lower.includes("revenue")
  ) {
    out.type = "currency";
  } else if (
    lower.includes("date") ||
    lower.includes("created_at") ||
    lower.includes("updated_at") ||
    lower.includes("signup_date") ||
    lower.includes("dob") ||
    lower === "birth_date"
  ) {
    if (out.type === "string" || out.type === "text") out.type = "date";
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

  // Common enum-like column names — supply sensible defaults
  if (lower === "status" || lower.endsWith("_status") || lower === "state") {
    out.type = "enum";
    out.enumValues = ["active", "inactive", "suspended", "pending"];
    out.frequency = { active: 0.6, inactive: 0.2, suspended: 0.1, pending: 0.1 };
  } else if (out.type === "string" || out.type === "text") {
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
    return ["active", "inactive", "suspended", "pending"];
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
