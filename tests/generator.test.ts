import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateTabularData } from "../src/lib/generators/tabular-engine.ts";
import { validateDataset, decideStatus } from "../src/lib/validators/data-validator.ts";
import { isNullToken } from "../src/lib/analyzers/data-hygiene.ts";

const baseColumns = [
  { name: "id", type: "integer" as const, nullable: false, isPrimary: true, isUnique: true },
  { name: "email", type: "email" as const, nullable: true, isPrimary: false, isUnique: false },
  { name: "country", type: "enum" as const, nullable: true, isPrimary: false, isUnique: false, enumValues: ["US", "PK", "BG"] },
];

const baseConfig = {
  id: "cfg1",
  project_id: "p1",
  row_count: 30,
  random_seed: 42,
  locale: "en-US",
  currency: "USD",
  null_rate: 0.05,
  outlier_rate: 0.0,
  privacy_level: "none" as const,
  business_rules: [],
  document_type: null,
  document_template: null,
  created_at: "",
  updated_at: "",
};

describe("generator — seed reproducibility", () => {
  test("same seed + same config => identical output", () => {
    const a = generateTabularData(baseColumns, baseConfig);
    const b = generateTabularData(baseColumns, baseConfig);
    assert.deepEqual(a, b, "identical seeds must yield identical output");
  });

  test("different seed => different output", () => {
    const a = generateTabularData(baseColumns, baseConfig);
    const b = generateTabularData(baseColumns, { ...baseConfig, random_seed: 99 });
    assert.notDeepEqual(a, b);
  });
});

describe("generator — never emits null-like tokens as data", () => {
  test("no cell ever equals a null token when messy mode is off", () => {
    const data = generateTabularData(baseColumns, { ...baseConfig, row_count: 200, null_rate: 0.1 });
    for (const row of data) {
      for (const [k, v] of Object.entries(row)) {
        if (v === null) continue;
        assert.ok(!isNullToken(v), `column ${k} produced null-like token "${v}"`);
      }
    }
  });

  test("enum polluted with null-like values still generates clean data", () => {
    const cols = [
      { name: "id", type: "integer" as const, nullable: false, isPrimary: true, isUnique: true },
      { name: "cat", type: "enum" as const, nullable: false, isPrimary: false, isUnique: false, enumValues: ["A", "N/A", "-", "B"] },
    ];
    const data = generateTabularData(cols, { ...baseConfig, row_count: 100, null_rate: 0 });
    for (const row of data) {
      assert.ok(!isNullToken(row.cat));
    }
  });
});

describe("validator — status gating", () => {
  const schema = {
    id: "s1",
    project_id: "p1",
    table_name: "users",
    columns: baseColumns,
    primary_keys: ["id"],
    unique_fields: ["id"],
    nullable_fields: ["email", "country"],
    sample_data: null,
    is_confirmed: true,
    created_at: "",
    updated_at: "",
  };

  test("clean generation => completed", () => {
    const data = generateTabularData(baseColumns, baseConfig);
    const { errors } = validateDataset(data, schema, undefined, undefined, {
      nullRate: baseConfig.null_rate,
      expectedRowCount: baseConfig.row_count,
    });
    assert.equal(decideStatus(errors), "completed");
  });

  test("empty result => failed", () => {
    const { errors } = validateDataset([], schema);
    assert.equal(decideStatus(errors), "failed");
  });

  test("wrong row count => failed", () => {
    const data = generateTabularData(baseColumns, { ...baseConfig, row_count: 5 });
    const { errors } = validateDataset(data, schema, undefined, undefined, {
      expectedRowCount: 30,
    });
    assert.equal(decideStatus(errors), "failed");
  });

  test("primary keys are unique and non-null", () => {
    const data = generateTabularData(baseColumns, baseConfig);
    const ids = new Set(data.map((r) => r.id));
    assert.equal(ids.size, data.length, "PK must be unique");
    for (const r of data) assert.notEqual(r.id, null);
  });

  test("null_token_leak forces failed status", () => {
    const dirty = [
      { id: 1, email: "N/A", country: "US" },
      { id: 2, email: "b@x.com", country: "PK" },
    ];
    const { errors } = validateDataset(dirty, schema);
    assert.equal(decideStatus(errors), "failed");
  });

  test("null rate stays within tolerance of configured rate", () => {
    const cols = [
      { name: "id", type: "integer" as const, nullable: false, isPrimary: true, isUnique: true },
      { name: "nickname", type: "string" as const, nullable: true, isPrimary: false, isUnique: false },
    ];
    const cfg = { ...baseConfig, row_count: 400, null_rate: 0.2, random_seed: 7 };
    const data = generateTabularData(cols, cfg);
    const nulls = data.filter((r) => r.nickname === null).length;
    const actual = nulls / data.length;
    assert.ok(Math.abs(actual - 0.2) < 0.05, `null rate ${actual} not within ±0.05 of 0.2`);
  });
});
