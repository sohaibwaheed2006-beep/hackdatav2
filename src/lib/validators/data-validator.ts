import type { ColumnDef, DetectedSchema, Relationship, ValidationError, DataStatistics, BusinessRule } from "@/types";
import { isNullToken } from "@/lib/analyzers/data-hygiene";

interface ValidateOptions {
  businessRules?: BusinessRule[];
  nullRate?: number;
  expectedRowCount?: number;
}

const NULL_TOLERANCE = 0.15;

export type CompletionStatus = "completed" | "completed_with_warnings" | "failed";

export function decideStatus(errors: ValidationError[]): CompletionStatus {
  if (errors.length === 0) return "completed";
  const hasHard = errors.some((e) =>
    e.severity === "error" ||
    e.type === "empty_result" ||
    e.type === "row_count_mismatch" ||
    e.type === "column_count_mismatch" ||
    e.type === "pk_duplicate" ||
    e.type === "null_violation"
  );
  return hasHard ? "failed" : "completed_with_warnings";
}

export function validateDataset(
  data: Record<string, unknown>[],
  schema: DetectedSchema,
  allData?: Record<string, Record<string, unknown>[]>,
  relationships?: Relationship[],
  options?: ValidateOptions
): { isValid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (data.length === 0) {
    errors.push({
      type: "empty_result",
      table: schema.table_name,
      column: "",
      row: -1,
      message: `Generation produced no rows for "${schema.table_name}".`,
      severity: "error",
    });
    return { isValid: false, errors };
  }

  if (options?.expectedRowCount !== undefined && data.length !== options.expectedRowCount) {
    errors.push({
      type: "row_count_mismatch",
      table: schema.table_name,
      column: "",
      row: -1,
      message: `Expected ${options.expectedRowCount} rows, got ${data.length}.`,
      severity: "error",
    });
  }

  const expectedCols = new Set(schema.columns.map((c) => c.name));
  const actualCols = new Set(Object.keys(data[0]));
  if (expectedCols.size !== actualCols.size || [...expectedCols].some((c) => !actualCols.has(c))) {
    errors.push({
      type: "column_count_mismatch",
      table: schema.table_name,
      column: "",
      row: -1,
      message: `Column mismatch: schema has ${expectedCols.size} column(s) but data has ${actualCols.size}.`,
      severity: "error",
    });
  }

  // Never allow null-like tokens to escape as real data (must come from null_rate only).
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    for (const col of schema.columns) {
      const v = row[col.name];
      if (v !== null && v !== undefined && isNullToken(v)) {
        errors.push({
          type: "null_token_leak",
          table: schema.table_name,
          column: col.name,
          row: i,
          message: `Row ${i}: column "${col.name}" contains null-like token "${String(v)}" as data.`,
          severity: "error",
        });
        break; // one is enough to fail
      }
    }
    if (errors.some((e) => e.type === "null_token_leak")) break;
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    for (const col of schema.columns) {
      const value = row[col.name];

      if (!col.nullable && (value === null || value === undefined)) {
        errors.push({
          type: "null_violation",
          table: schema.table_name,
          column: col.name,
          row: i,
          message: `Non-nullable column "${col.name}" has null at row ${i}`,
        });
      }

      if (value !== null && value !== undefined) {
        if (!isValidType(value, col.type)) {
          errors.push({
            type: "type_mismatch",
            table: schema.table_name,
            column: col.name,
            row: i,
            message: `Value "${value}" doesn't match type "${col.type}" at row ${i}`,
          });
        }
      }
    }
  }

  for (const col of schema.columns) {
    if (col.isPrimary || col.isUnique) {
      const values = data.map((r) => r[col.name]).filter((v) => v !== null);
      const unique = new Set(values.map(String));
      if (unique.size < values.length) {
        errors.push({
          type: "pk_duplicate",
          table: schema.table_name,
          column: col.name,
          row: -1,
          message: `Duplicate values in ${col.isPrimary ? "primary key" : "unique"} column "${col.name}" (${values.length - unique.size} duplicates)`,
        });
      }
    }
  }

  if (relationships && allData) {
    for (const rel of relationships) {
      if (rel.source_table !== schema.table_name) continue;

      const parentData = allData[rel.target_table];
      if (!parentData) continue;

      const parentIds = new Set(parentData.map((r) => String(r[rel.target_column])));

      for (let i = 0; i < data.length; i++) {
        const fkValue = data[i][rel.source_column];
        if (fkValue === null || fkValue === undefined) continue;

        if (!parentIds.has(String(fkValue))) {
          errors.push({
            type: "fk_invalid",
            table: schema.table_name,
            column: rel.source_column,
            row: i,
            message: `Foreign key "${rel.source_column}" value "${fkValue}" not found in "${rel.target_table}.${rel.target_column}"`,
          });
        }
      }
    }
  }

  if (options?.businessRules && options.businessRules.length > 0) {
    validateBusinessRules(data, schema, options.businessRules, errors);
  }

  if (options?.nullRate !== undefined) {
    validateNullRate(data, schema, options.nullRate, errors);
  }

  return { isValid: errors.length === 0, errors };
}

function validateBusinessRules(
  data: Record<string, unknown>[],
  schema: DetectedSchema,
  rules: BusinessRule[],
  errors: ValidationError[]
) {
  const columnNames = new Set(schema.columns.map((c) => c.name));

  for (const rule of rules) {
    if (!columnNames.has(rule.field)) continue;

    for (let i = 0; i < data.length; i++) {
      const value = data[i][rule.field];
      if (value === null || value === undefined) continue;

      const violation = checkRule(value, rule);
      if (violation) {
        errors.push({
          type: "business_rule_violation",
          table: schema.table_name,
          column: rule.field,
          row: i,
          message: `Row ${i}: ${violation}`,
        });
      }
    }
  }
}

function checkRule(value: unknown, rule: BusinessRule): string | null {
  const num = Number(value);
  switch (rule.rule) {
    case "min": {
      const min = Number(rule.value);
      if (!isNaN(num) && !isNaN(min) && num < min) return `"${value}" is below min ${min}`;
      return null;
    }
    case "max": {
      const max = Number(rule.value);
      if (!isNaN(num) && !isNaN(max) && num > max) return `"${value}" is above max ${max}`;
      return null;
    }
    case "range": {
      const [minS, maxS] = rule.value.split(",").map((s) => s.trim());
      const min = Number(minS);
      const max = Number(maxS);
      if (!isNaN(num) && ((!isNaN(min) && num < min) || (!isNaN(max) && num > max)))
        return `"${value}" is outside range ${rule.value}`;
      return null;
    }
    case "enum": {
      const allowed = rule.value.split(",").map((s) => s.trim());
      if (!allowed.includes(String(value))) return `"${value}" is not in allowed set [${rule.value}]`;
      return null;
    }
    case "pattern": {
      try {
        const re = new RegExp(rule.value);
        if (!re.test(String(value))) return `"${value}" does not match pattern /${rule.value}/`;
      } catch {
        // invalid regex — skip
      }
      return null;
    }
    default:
      return null;
  }
}

function validateNullRate(
  data: Record<string, unknown>[],
  schema: DetectedSchema,
  configuredRate: number,
  errors: ValidationError[]
) {
  if (data.length === 0) return;

  for (const col of schema.columns) {
    if (!col.nullable) continue;
    const nulls = data.filter((r) => r[col.name] === null || r[col.name] === undefined).length;
    const actual = nulls / data.length;
    if (Math.abs(actual - configuredRate) > NULL_TOLERANCE) {
      errors.push({
        type: "rate_deviation",
        table: schema.table_name,
        column: col.name,
        row: -1,
        message: `Null rate for "${col.name}" is ${(actual * 100).toFixed(0)}%, expected ~${(configuredRate * 100).toFixed(0)}% (±${(NULL_TOLERANCE * 100).toFixed(0)}%)`,
        severity: "warning",
      });
    }
  }
}

export function isValidType(value: unknown, type: ColumnDef["type"]): boolean {
  switch (type) {
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "float":
    case "currency":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && !isNaN(Date.parse(value));
    case "datetime":
      return typeof value === "string" && !isNaN(Date.parse(value));
    case "email":
      return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    default:
      return true;
  }
}

export function computeStatistics(
  data: Record<string, unknown>[],
  columns: ColumnDef[]
): DataStatistics {
  const stats: DataStatistics = {};

  for (const col of columns) {
    const values = data.map((r) => r[col.name]);
    const nonNull = values.filter((v) => v !== null && v !== undefined);
    const uniqueCount = new Set(nonNull.map(String)).size;
    const nullCount = values.length - nonNull.length;

    if (col.type === "integer" || col.type === "float" || col.type === "currency") {
      const nums = nonNull.map(Number).filter((n) => !isNaN(n));
      const sorted = [...nums].sort((a, b) => a - b);
      const sum = nums.reduce((a, b) => a + b, 0);
      const mean = nums.length > 0 ? sum / nums.length : 0;
      const median = nums.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
      const variance = nums.length > 0
        ? nums.reduce((acc, n) => acc + (n - mean) ** 2, 0) / nums.length
        : 0;

      stats[col.name] = {
        mean: Math.round(mean * 100) / 100,
        median,
        stddev: Math.round(Math.sqrt(variance) * 100) / 100,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        nullCount,
        uniqueCount,
      };
    } else if (col.type === "enum") {
      const distribution: Record<string, number> = {};
      nonNull.forEach((v) => {
        const key = String(v);
        distribution[key] = (distribution[key] || 0) + 1;
      });
      stats[col.name] = { nullCount, uniqueCount, distribution };
    } else {
      stats[col.name] = { nullCount, uniqueCount };
    }
  }

  return stats;
}
