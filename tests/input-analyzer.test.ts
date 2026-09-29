import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { analyzeInput, InputValidationError } from "../src/lib/analyzers/input-analyzer.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string) => readFileSync(resolve(HERE, "fixtures", name), "utf-8");

describe("analyzeInput — rejection cases", () => {
  test("rejects empty file", () => {
    assert.throws(() => analyzeInput("", "empty.csv", "csv"), InputValidationError);
  });

  test("rejects header-only file", () => {
    assert.throws(
      () => analyzeInput("email,name,date", "hdr.csv", "csv"),
      (err: unknown) => err instanceof InputValidationError && /No data rows/.test((err as Error).message),
    );
  });

  test("rejects file with fewer than 2 columns", () => {
    assert.throws(
      () => analyzeInput("only_one_column\nrow1\nrow2", "one.csv", "csv"),
      (err: unknown) => err instanceof InputValidationError && /Fewer than 2 columns/.test((err as Error).message),
    );
  });

  test("rejects unsupported .txt file type", () => {
    assert.throws(
      () => analyzeInput("hello world", "notes.txt", "txt"),
      (err: unknown) => err instanceof InputValidationError && /Unsupported file type/.test((err as Error).message),
    );
  });

  test("rejects prose masquerading as CSV (the observed bug)", () => {
    const prose = "Missing values in several columns (blank, NULL, N/A)\n";
    assert.throws(
      () => analyzeInput(prose, "bug.csv", "csv"),
      (err: unknown) => err instanceof InputValidationError,
    );
  });
});

describe("analyzeInput — header cleaning", () => {
  test("trims and snake-cases headers, dedupes", () => {
    const csv = ` Email , First Name, first_name,age\n` + `a@b.com,Ada,Alan,30\n`;
    const result = analyzeInput(csv, "x.csv", "csv");
    const names = result.tables[0].columns.map((c) => c.name);
    assert.deepEqual(names, ["email", "first_name", "first_name_2", "age"]);
  });

  test("recognises many null-token variants and marks column nullable", () => {
    const csv = `email,note\n` +
      `a@b.com,hello\n` +
      `,N/A\n` +
      `c@d.com,NULL\n` +
      `e@f.com,None\n` +
      `g@h.com,-\n` +
      `i@j.com,\n`;
    const result = analyzeInput(csv, "x.csv", "csv");
    const noteCol = result.tables[0].columns.find((c) => c.name === "note")!;
    assert.equal(noteCol.nullable, true, "note column should be nullable");
    // sampleData should show null (not the raw token)
    const notes = result.tables[0].sampleData.map((r) => r.note);
    assert.equal(notes.filter((v) => v === null).length, 5);
  });
});

describe("analyzeInput — messy.csv fixture", () => {
  const result = analyzeInput(readFixture("messy.csv"), "messy.csv", "csv");
  const table = result.tables[0];

  test("has 5 cleaned column headers", () => {
    const names = table.columns.map((c) => c.name);
    assert.deepEqual(names, ["email", "name", "signup_date", "balance", "country"]);
  });

  test("balance detected as currency (money)", () => {
    const balance = table.columns.find((c) => c.name === "balance")!;
    assert.equal(balance.type, "currency");
  });

  test("email detected with email type", () => {
    const email = table.columns.find((c) => c.name === "email")!;
    assert.equal(email.type, "email");
  });

  test("country becomes a low-cardinality enum (category)", () => {
    const country = table.columns.find((c) => c.name === "country")!;
    assert.equal(country.type, "enum");
    assert.ok(country.enumValues && country.enumValues.length <= 3);
  });

  test("signup_date is a date column and flags DD/MM ambiguity", () => {
    const d = table.columns.find((c) => c.name === "signup_date")!;
    assert.equal(d.type, "date");
    assert.match(d.qualityWarning || "", /ambiguous/);
  });
});
