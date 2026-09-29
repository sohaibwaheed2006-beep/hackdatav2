import { callGrokJSON } from "@/lib/grok";
import { ColumnDef } from "@/types";
import { isNullToken } from "@/lib/analyzers/data-hygiene";

function scrubStringArray(arr: string[]): string[] {
  return arr.map((v) => {
    const s = typeof v === "string" ? v.replace(/\0/g, "").replace(/\\u0000/gi, "") : String(v);
    return isNullToken(s) ? `value_${Math.floor(Math.random() * 1000)}` : s;
  });
}

function maskExample(value: unknown): string {
  if (value === null || value === undefined) return "<null>";
  const str = String(value);
  if (str.length === 0) return "<empty>";
  if (str.length <= 3) return str[0] + "*".repeat(str.length - 1);
  return `${str.slice(0, 2)}***${str.slice(-1)} (len=${str.length})`;
}

interface AIGeneratedContent {
  [columnName: string]: string[];
}

const FIRST_NAMES = [
  "Aarav", "Liam", "Emma", "Noah", "Olivia", "Sophia", "Lucas", "Mia", "Amara", "Mateo",
  "Yuki", "Priya", "Chen", "Fatima", "Tariq", "Elena", "Dmitri", "Zainab", "Hiroshi", "Kwame",
  "Siti", "Alejandro", "Chloe", "Dev", "Ananya", "Marcus", "Freja", "Leila", "Diego", "Amina"
];

const LAST_NAMES = [
  "Patel", "Smith", "Garcia", "Tanaka", "Müller", "Ivanov", "Kim", "Nguyen", "Al-Mansoor", "Osei",
  "Silva", "Dubois", "Kowalski", "Johansson", "Watanabe", "Santos", "Ali", "Mehta", "Zhang", "Nakamura",
  "Hernandez", "Bauer", "Popov", "Rossi", "O'Connor", "Larsson", "Hassan", "Gupta", "Suzuki", "Schneider"
];

const COMPANIES = [
  "Apex Dynamics", "Starlight Technologies", "Quantum Horizon", "Nexus Global", "Vertex Cloud",
  "Solaria Energy", "Aegis Security", "Prism Data Labs", "Hyperion Logistics", "Chronos AI",
  "Cascade Financial", "BlueShift Bio", "Vanguard Media", "Echo Systems", "Synergy Health"
];

const STREETS = [
  "142 Market Street, Suite 400, San Francisco, CA",
  "88 King's Road, Kensington, London, UK",
  "204 Friedrichstraße, Mitte, Berlin, Germany",
  "45-12 Ginza, Chuo-ku, Tokyo, Japan",
  "77 Orchard Road, #12-01, Singapore",
  "312 Queen Street West, Toronto, ON, Canada",
  "55 George Street, The Rocks, Sydney, NSW, Australia",
  "19 Boulevard Haussmann, 75009 Paris, France",
  "108 Diagonal Avenue, Eixample, Barcelona, Spain",
  "500 Bay Street, Financial District, New York, NY"
];

const JOB_TITLES = [
  "Senior Software Engineer", "Product Manager", "Chief Data Architect", "Financial Analyst",
  "Head of Operations", "UX/UI Designer", "Security Specialist", "DevOps Engineer", "Marketing Director", "Lead Researcher"
];

const DESCRIPTIONS = [
  "High-performance cloud synchronization with zero downtime architecture.",
  "Integrated enterprise compliance reporting with automated auditing.",
  "Next-generation analytics dashboard featuring predictive trends.",
  "Secure biometric identity verification with multi-factor encryption.",
  "Scalable microservices ecosystem designed for high throughput."
];

function generateLocalSyntheticValues(colName: string, count: number): string[] {
  const lower = colName.toLowerCase();
  const list: string[] = [];

  for (let i = 0; i < count; i++) {
    if (lower.includes("name") && !lower.includes("company") && !lower.includes("file")) {
      const first = FIRST_NAMES[i % FIRST_NAMES.length];
      const last = LAST_NAMES[(i * 3) % LAST_NAMES.length];
      list.push(`${first} ${last}`);
    } else if (lower.includes("company") || lower.includes("organization") || lower.includes("vendor")) {
      list.push(COMPANIES[i % COMPANIES.length]);
    } else if (lower.includes("address") || lower.includes("location") || lower.includes("city")) {
      list.push(STREETS[i % STREETS.length]);
    } else if (lower.includes("title") || lower.includes("position") || lower.includes("role")) {
      list.push(JOB_TITLES[i % JOB_TITLES.length]);
    } else if (lower.includes("desc") || lower.includes("comment") || lower.includes("review") || lower.includes("summary")) {
      list.push(DESCRIPTIONS[i % DESCRIPTIONS.length]);
    } else if (lower.includes("email")) {
      const first = FIRST_NAMES[i % FIRST_NAMES.length].toLowerCase();
      const last = LAST_NAMES[(i * 3) % LAST_NAMES.length].toLowerCase();
      list.push(`${first}.${last}@example.com`);
    } else {
      list.push(`${colName}_${i + 1}`);
    }
  }

  return list;
}

export async function generateAIContent(
  columns: ColumnDef[],
  rowCount: number,
  locale: string
): Promise<AIGeneratedContent> {
  const aiColumns = columns.filter((col) =>
    ["string", "text", "email"].includes(col.type) ||
    col.name.toLowerCase().includes("name") ||
    col.name.toLowerCase().includes("address") ||
    col.name.toLowerCase().includes("description") ||
    col.name.toLowerCase().includes("comment") ||
    col.name.toLowerCase().includes("title") ||
    col.name.toLowerCase().includes("company")
  );

  if (aiColumns.length === 0) return {};

  const batchSize = Math.min(rowCount, 50);
  const prompt = buildContentPrompt(aiColumns, batchSize, locale);

  try {
    const result = await callGrokJSON<AIGeneratedContent>(
      [
        {
          role: "system",
          content:
            "You are a synthetic data generator. You produce realistic, diverse, privacy-safe fake data. Always return valid JSON with the exact structure requested. Make names ethnically diverse and realistic. Make addresses varied. Make text content natural and varied.",
        },
        { role: "user", content: prompt },
      ],
      0.8
    );

    const scrubbed: AIGeneratedContent = {};
    for (const [key, values] of Object.entries(result)) {
      scrubbed[key] = scrubStringArray(values);
    }

    if (rowCount > batchSize) {
      const expanded: AIGeneratedContent = {};
      for (const [key, values] of Object.entries(scrubbed)) {
        expanded[key] = [];
        for (let i = 0; i < rowCount; i++) {
          expanded[key].push(values[i % values.length]);
        }
      }
      return expanded;
    }

    return scrubbed;
  } catch {
    const localResult: AIGeneratedContent = {};
    for (const col of aiColumns) {
      localResult[col.name] = generateLocalSyntheticValues(col.name, rowCount);
    }
    return localResult;
  }
}

function buildContentPrompt(
  columns: ColumnDef[],
  count: number,
  locale: string
): string {
  const colDescriptions = columns
    .map((col) => {
      let desc = `"${col.name}": array of ${count} `;
      if (col.name.toLowerCase().includes("name")) {
        desc += "realistic full person names (diverse ethnicity)";
      } else if (col.name.toLowerCase().includes("company")) {
        desc += "realistic company names";
      } else if (col.name.toLowerCase().includes("address")) {
        desc += "realistic street addresses";
      } else if (col.name.toLowerCase().includes("email")) {
        desc += "realistic email addresses using @example.com domain";
      } else if (col.name.toLowerCase().includes("description")) {
        desc += "short realistic descriptions (1-2 sentences)";
      } else if (col.name.toLowerCase().includes("title")) {
        desc += "realistic titles";
      } else if (col.name.toLowerCase().includes("comment") || col.name.toLowerCase().includes("review")) {
        desc += "realistic short comments or reviews";
      } else {
        desc += `realistic values for a field named "${col.name}"`;
      }
      return desc;
    })
    .join("\n");

  return `Generate synthetic data for locale "${locale}". Return JSON object with these fields:

${colDescriptions}

Return ONLY a JSON object. Each key maps to an array of exactly ${count} strings.`;
}

export async function generateDocumentAIContent(
  documentType: "invoice" | "bank_statement",
  count: number,
  locale: string
): Promise<Record<string, string[]>> {
  const prompt =
    documentType === "invoice"
      ? `Generate data for ${count} synthetic invoices (locale: ${locale}). Return JSON:
{
  "companies": [${count} realistic company names],
  "items": [${count} realistic product/service descriptions],
  "addresses": [${count} realistic business addresses],
  "emails": [${count} realistic business email addresses using @example.com]
}`
      : `Generate data for ${count} synthetic bank statements (locale: ${locale}). Return JSON:
{
  "merchants": [${count} realistic merchant/store names],
  "descriptions": [${count} realistic credit transaction descriptions like "Payroll deposit", "Freelance payment", "Refund"]
}`;

  try {
    return await callGrokJSON<Record<string, string[]>>(
      [
        {
          role: "system",
          content:
            "You generate realistic synthetic data for financial documents. Always return valid JSON. Make data diverse and realistic.",
        },
        { role: "user", content: prompt },
      ],
      0.8
    );
  } catch {
    if (documentType === "invoice") {
      return {
        companies: Array.from({ length: count }, (_, i) => COMPANIES[i % COMPANIES.length]),
        items: Array.from({ length: count }, (_, i) => DESCRIPTIONS[i % DESCRIPTIONS.length]),
        addresses: Array.from({ length: count }, (_, i) => STREETS[i % STREETS.length]),
        emails: Array.from({ length: count }, (_, i) => `billing${i + 1}@example.com`),
      };
    }
    return {
      merchants: [
        "Greenleaf Market", "Riverside Utilities", "Metro Transit",
        "Cloud Nine Cafe", "FreshMart Grocery", "TechZone Electronics",
        "City Parking", "StreamFlix", "Peak Fitness", "Harbor Books"
      ],
      descriptions: ["Payroll Direct Deposit", "Consulting Fee", "Interest Credit", "Expense Reimbursement", "Dividends Payment"]
    };
  }
}

const ALLOWED_TYPES = new Set([
  "string", "integer", "float", "boolean", "date", "datetime",
  "email", "phone", "uuid", "currency", "text", "enum",
]);
const ALLOWED_SEMANTICS = new Set([
  "email", "person_name", "first_name", "last_name", "company_name",
  "country", "city", "address", "id", "phone", "url", "ip_address",
  "zip_code", "currency", "date", "boolean", "category", "free_text",
  "identifier", "description",
]);

interface AISchemaResponse {
  columns: Array<{ name: string; type?: string; semanticLabel?: string }>;
  suggestions?: string[];
}

function validateAISchemaResponse(raw: unknown, columns: ColumnDef[]): { columns: ColumnDef[]; suggestions: string[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as AISchemaResponse;
  if (!Array.isArray(parsed.columns)) return null;

  const byName = new Map(columns.map((c) => [c.name, c]));
  const updated: ColumnDef[] = [];
  for (const original of columns) {
    const patch = parsed.columns.find((c) => c && c.name === original.name);
    if (!patch) {
      updated.push(original);
      continue;
    }
    const next: ColumnDef = { ...original };
    if (patch.type && ALLOWED_TYPES.has(patch.type)) next.type = patch.type as ColumnDef["type"];
    if (patch.semanticLabel && ALLOWED_SEMANTICS.has(patch.semanticLabel)) next.semanticLabel = patch.semanticLabel;
    updated.push(next);
  }
  // Reject responses that dropped columns entirely.
  if (updated.length !== byName.size) return null;

  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((s) => typeof s === "string") : [];
  return { columns: updated, suggestions };
}

export async function analyzeSchemaWithAI(
  sampleData: Record<string, unknown>[],
  columns: ColumnDef[]
): Promise<{ columns: ColumnDef[]; suggestions: string[] }> {
  // Only send aggregate stats + masked examples. Never send raw rows.
  const summary = columns.map((c) => {
    const values = sampleData.map((r) => r[c.name]);
    const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
    const uniqueCount = new Set(nonNull.map(String)).size;
    const masked = nonNull.slice(0, 3).map(maskExample);
    return {
      name: c.name,
      detectedType: c.type,
      nullable: c.nullable,
      sampleRows: sampleData.length,
      nonNullRows: nonNull.length,
      uniqueCount,
      maskedExamples: masked,
    };
  });

  const prompt = `You are labelling columns for a synthetic-data generator.
Given ONLY the aggregate stats and MASKED example patterns below, choose the best type
and (optionally) a semantic label for each column.

Allowed types: ${Array.from(ALLOWED_TYPES).join(", ")}
Allowed semanticLabel values: ${Array.from(ALLOWED_SEMANTICS).join(", ")}

Columns:
${JSON.stringify(summary, null, 2)}

Return STRICT JSON of the form:
{
  "columns": [{"name": "<original name>", "type": "<one of allowed types>", "semanticLabel": "<one of allowed labels or omit>"}],
  "suggestions": ["short human-readable notes"]
}
Do not invent new column names. Do not include raw row data.`;

  const messages = [
    { role: "system" as const, content: "You are a strict data schema classifier. Return valid JSON only, no prose." },
    { role: "user" as const, content: prompt },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callGrokJSON(messages, 0.2);
      const validated = validateAISchemaResponse(raw, columns);
      if (validated) return validated;
    } catch {
      // fall through to retry / fallback
    }
  }
  return { columns, suggestions: [] };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidForType(value: unknown, type: ColumnDef["type"]): boolean {
  switch (type) {
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "float":
    case "currency":
      return typeof value === "number" && !isNaN(value);
    case "boolean":
      return typeof value === "boolean";
    case "date":
    case "datetime":
      return typeof value === "string" && !isNaN(Date.parse(value));
    case "email":
      return typeof value === "string" && EMAIL_RE.test(value);
    default:
      return true;
  }
}

function fallbackForColumn(col: ColumnDef, index: number): unknown {
  switch (col.type) {
    case "integer": {
      const base = col.minValue !== undefined ? Math.ceil(col.minValue) : 1;
      return base + index;
    }
    case "float":
    case "currency": {
      const lo = col.minValue ?? 0;
      const hi = col.maxValue ?? lo + 1000;
      const mid = (lo + hi) / 2;
      return Math.round(mid * 100) / 100;
    }
    case "boolean":
      return index % 2 === 0;
    case "date":
      return new Date(Date.UTC(2024, 0, 1 + (index % 28))).toISOString().slice(0, 10);
    case "datetime":
      return new Date(Date.UTC(2024, 0, 1 + (index % 28))).toISOString();
    case "email": {
      const first = FIRST_NAMES[index % FIRST_NAMES.length].toLowerCase();
      const last = LAST_NAMES[(index * 3) % LAST_NAMES.length].toLowerCase();
      return `${first}.${last}${index}@example.com`;
    }
    case "phone": {
      const area = 200 + (index % 700);
      const mid = 200 + ((index * 7) % 700);
      const last = 1000 + ((index * 13) % 9000);
      return `+1-${area}-${mid}-${last}`;
    }
    case "uuid":
      return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    case "enum": {
      const clean = (col.enumValues || []).filter((v) => !isNullToken(v));
      return clean[index % clean.length] ?? `value_${index}`;
    }
    default:
      return `${col.name}_edge_${index + 1}`;
  }
}

function repairEdgeCaseRow(
  row: Record<string, unknown>,
  columns: ColumnDef[],
  rowIndex: number
): Record<string, unknown> {
  const repaired: Record<string, unknown> = {};
  for (const col of columns) {
    let v = row[col.name];
    if (typeof v === "string") {
      v = v.replace(/\0/g, "").replace(/\\u0000/gi, "");
    }
    if (isNullToken(v)) v = null;

    if (v === null || v === undefined) {
      repaired[col.name] = col.nullable ? null : fallbackForColumn(col, rowIndex);
      continue;
    }

    if (!isValidForType(v, col.type)) {
      repaired[col.name] = fallbackForColumn(col, rowIndex);
      continue;
    }

    repaired[col.name] = v;
  }
  return repaired;
}

export async function generateEdgeCases(
  columns: ColumnDef[],
  count: number
): Promise<Record<string, unknown>[]> {
  const nonNullable = columns.filter((c) => !c.nullable).map((c) => c.name);
  const typedCols = columns
    .filter((c) => ["email", "date", "datetime", "integer", "float", "currency", "boolean", "uuid", "phone"].includes(c.type))
    .map((c) => `${c.name} (${c.type})`);

  const constraintNotes: string[] = [];
  if (nonNullable.length > 0) {
    constraintNotes.push(`- These columns MUST NOT be null: ${nonNullable.join(", ")}.`);
  }
  if (typedCols.length > 0) {
    constraintNotes.push(`- Values for these columns must remain valid for their type: ${typedCols.join(", ")}.`);
  }

  const prompt = `Generate ${count} edge-case rows for testing. These should include boundary values, unusual but valid data, and tricky inputs.

Schema:
${columns.map((c) => `- ${c.name}: ${c.type}${c.nullable ? " (nullable)" : " (required)"}`).join("\n")}

Constraints (must be satisfied by every row):
${constraintNotes.join("\n") || "- (none)"}

Return JSON array of ${count} objects matching this schema. Include:
- Boundary values (very long strings, near-max integers) for text/numeric fields
- Special characters and Unicode in free-text fields (name/description/comment)
- Dates at boundaries (leap years, end of month) — still valid ISO dates
- Zero and small values where numeric (respect any implied minimum)
Do not violate the constraints above.`;

  try {
    const rows = await callGrokJSON<Record<string, unknown>[]>(
      [
        {
          role: "system",
          content: "Generate edge case test data. Return valid JSON array only. Never violate nullability or type constraints.",
        },
        { role: "user", content: prompt },
      ],
      0.9
    );
    return rows.map((row, i) => repairEdgeCaseRow(row, columns, i));
  } catch {
    return [];
  }
}
