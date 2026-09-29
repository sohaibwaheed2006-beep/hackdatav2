import type { ColumnDef, GenerationConfig, BusinessRule } from "@/types";
import { isNullToken } from "@/lib/analyzers/data-hygiene";

export function applyBusinessRules(columns: ColumnDef[], rules?: BusinessRule[]): ColumnDef[] {
  if (!rules || rules.length === 0) return columns;

  return columns.map((col) => {
    const updated = { ...col };
    for (const rule of rules) {
      if (rule.field !== col.name) continue;
      switch (rule.rule) {
        case "min": {
          const n = Number(rule.value);
          if (!isNaN(n)) updated.minValue = n;
          break;
        }
        case "max": {
          const n = Number(rule.value);
          if (!isNaN(n)) updated.maxValue = n;
          break;
        }
        case "range": {
          const [minS, maxS] = rule.value.split(",").map((s) => s.trim());
          const min = Number(minS);
          const max = Number(maxS);
          if (!isNaN(min)) updated.minValue = min;
          if (!isNaN(max)) updated.maxValue = max;
          break;
        }
        case "enum": {
          const vals = rule.value.split(",").map((s) => s.trim()).filter(Boolean);
          if (vals.length > 0) {
            updated.type = "enum";
            updated.enumValues = vals;
          }
          break;
        }
        default:
          break;
      }
    }
    return updated;
  });
}

export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// Columns whose values are fully determined by the statistical profile must
// never be overridden by LLM/free-text AI content.
function isProfileDriven(col: ColumnDef): boolean {
  if (col.isConstant) return true;
  if (col.isIdentifier || col.isPrimary) return true;
  if (col.type === "boolean" || col.type === "enum") return true;
  if (col.type === "integer" || col.type === "float" || col.type === "currency") return true;
  return false;
}

export function generateTabularData(
  columns: ColumnDef[],
  config: GenerationConfig,
  aiData?: Record<string, string[]>
): Record<string, unknown>[] {
  const rand = seededRandom(config.random_seed ?? Date.now());
  const rows: Record<string, unknown>[] = [];
  const uniqueTrackers = new Map<string, Set<unknown>>();

  for (const col of columns) {
    if (col.isPrimary || col.isUnique || col.isIdentifier) {
      uniqueTrackers.set(col.name, new Set());
    }
  }

  for (let i = 0; i < config.row_count; i++) {
    const row: Record<string, unknown> = {};

    for (const col of columns) {
      // Constant columns keep their constant value regardless of null/outlier config.
      if (col.isConstant && col.constantValue !== undefined) {
        row[col.name] = col.nullable && rand() < config.null_rate ? null : col.constantValue;
        continue;
      }

      if (col.nullable && rand() < config.null_rate) {
        row[col.name] = null;
        continue;
      }

      const isOutlier = rand() < config.outlier_rate;

      // Only use AI content for genuinely free-text columns; distributions
      // (enum/boolean/numeric/id/constant) must be sampled deterministically
      // from the profile.
      if (
        !isProfileDriven(col) &&
        aiData && aiData[col.name] && aiData[col.name].length > 0
      ) {
        const aiValues = aiData[col.name];
        let candidate = aiValues[i % aiValues.length];
        // When cycling AI content for unique columns, append a suffix to
        // prevent pk_duplicate / uniqueness validation failures.
        if (col.isUnique && i >= aiValues.length) {
          candidate = `${candidate} ${i + 1}`;
        }
        row[col.name] = isNullToken(candidate)
          ? generateValue(col, i, rand, isOutlier, config)
          : candidate;
      } else {
        row[col.name] = generateValue(col, i, rand, isOutlier, config);
      }

      // Enforce strict uniqueness on unique/primary columns
      if (uniqueTrackers.has(col.name)) {
        const seen = uniqueTrackers.get(col.name)!;
        let val = row[col.name];
        if (val !== null && val !== undefined) {
          if (seen.has(val)) {
            if (typeof val === "number") {
              val = val + i + 1;
              while (seen.has(val)) (val as number)++;
            } else {
              val = `${val}_${i + 1}`;
              while (seen.has(val)) val = `${val}_${Math.floor(rand() * 1000)}`;
            }
            row[col.name] = val;
          }
          seen.add(val);
        }
      }
    }

    rows.push(row);
  }

  return rows;
}

// Weighted sample from a value -> probability map using the seeded RNG.
function weightedSample(freq: Record<string, number>, rand: () => number): string {
  const entries = Object.entries(freq);
  const total = entries.reduce((s, [, p]) => s + p, 0);
  if (total <= 0) return entries[0]?.[0] ?? "";
  const r = rand() * total;
  let acc = 0;
  for (const [k, p] of entries) {
    acc += p;
    if (r <= acc) return k;
  }
  return entries[entries.length - 1][0];
}

// Box-Muller: standard normal from two uniform [0,1) draws.
function sampleNormal(rand: () => number): number {
  let u1 = rand();
  if (u1 <= 0) u1 = 1e-12;
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function generateValue(
  col: ColumnDef,
  index: number,
  rand: () => number,
  isOutlier: boolean,
  config: GenerationConfig
): unknown {
  switch (col.type) {
    case "integer": {
      if (col.isPrimary || col.isIdentifier || col.isUnique) {
        const base = (col.minValue !== undefined && col.minValue > 0) ? col.minValue : 1;
        return base + index;
      }
      return sampleNumeric(col, rand, isOutlier, true);
    }

    case "float":
    case "currency": {
      return sampleNumeric(col, rand, isOutlier, false);
    }

    case "boolean": {
      if (col.frequency && "true" in col.frequency) {
        return weightedSample(col.frequency, rand) === "true";
      }
      return rand() > 0.5;
    }

    case "date": {
      const start = new Date("2023-01-01").getTime();
      const end = new Date("2025-12-31").getTime();
      const d = new Date(start + rand() * (end - start));
      return d.toISOString().split("T")[0];
    }

    case "datetime": {
      const start = new Date("2023-01-01").getTime();
      const end = new Date("2025-12-31").getTime();
      return new Date(start + rand() * (end - start)).toISOString();
    }

    case "uuid":
      return generateUUID(rand);

    case "email": {
      const names = ["user", "admin", "info", "contact", "test", "dev", "hello", "support"];
      const domains = ["example.com", "test.org", "demo.net", "sample.io"];
      return `${names[Math.floor(rand() * names.length)]}${index}@${domains[Math.floor(rand() * domains.length)]}`;
    }

    case "phone": {
      const area = Math.floor(rand() * 900) + 100;
      const mid = Math.floor(rand() * 900) + 100;
      const last = Math.floor(rand() * 9000) + 1000;
      return `+1-${area}-${mid}-${last}`;
    }

    case "enum": {
      // Prefer the empirical distribution learned from the input.
      if (col.frequency && Object.keys(col.frequency).length > 0) {
        const filtered: Record<string, number> = {};
        for (const [k, v] of Object.entries(col.frequency)) {
          if (!isNullToken(k)) filtered[k] = v;
        }
        if (Object.keys(filtered).length > 0) return weightedSample(filtered, rand);
      }
      const clean = (col.enumValues || []).filter((v) => !isNullToken(v));
      if (clean.length > 0) {
        return clean[Math.floor(rand() * clean.length)];
      }
      return `value_${Math.floor(rand() * 5)}`;
    }

    case "text":
    case "string":
    default:
      return `${col.name}_${index + 1}`;
  }
}

function sampleNumeric(
  col: ColumnDef,
  rand: () => number,
  isOutlier: boolean,
  asInteger: boolean
): number {
  const mean = col.mean;
  const stddev = col.stddev;
  const min = col.minValue;
  const max = col.maxValue;

  // No profile → keep the old behaviour (constrained range) rather than emitting
  // giant numbers.
  if (mean === undefined || stddev === undefined || min === undefined || max === undefined) {
    const lo = min ?? 0;
    const hi = max ?? (asInteger ? 100 : 1000);
    const v = rand() * (hi - lo) + lo;
    return asInteger ? Math.round(v) : Math.round(v * 100) / 100;
  }

  let value: number;
  const positiveOnly = min >= 0;

  if (col.isSkewed && positiveOnly && mean > 0) {
    // Log-normal fit for right-skewed positive data (income-like).
    const shifted = Math.max(1e-9, mean);
    const sigma2 = Math.log(1 + (stddev * stddev) / (shifted * shifted));
    const sigma = Math.sqrt(sigma2);
    const mu = Math.log(shifted) - sigma2 / 2;
    value = Math.exp(mu + sigma * sampleNormal(rand));
  } else {
    // Normal distribution parameterised by the observed mean/std.
    const s = stddev > 0 ? stddev : Math.max(1, Math.abs(mean) * 0.1);
    value = mean + s * sampleNormal(rand);
  }

  if (isOutlier) {
    // Deliberate, bounded outlier: push out ~3 std devs while staying same sign.
    const s = stddev > 0 ? stddev : Math.max(1, Math.abs(mean) * 0.1);
    const direction = rand() < 0.5 ? -1 : 1;
    value = mean + direction * 3 * s;
  }

  if (positiveOnly && value < 0) value = Math.abs(value);

  // Clamp softly to the observed range unless outlier expanded it intentionally.
  if (!isOutlier) {
    if (value < min) value = min;
    if (value > max) value = max;
  }

  if (asInteger) return Math.round(value);
  return Math.round(value * 100) / 100;
}

function generateUUID(rand: () => number): string {
  const hex = "0123456789abcdef";
  let uuid = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += "-";
    } else if (i === 14) {
      uuid += "4";
    } else if (i === 19) {
      uuid += hex[(Math.floor(rand() * 4) + 8)];
    } else {
      uuid += hex[Math.floor(rand() * 16)];
    }
  }
  return uuid;
}

export function applyPrivacy(
  data: Record<string, unknown>[],
  columns: ColumnDef[],
  privacyLevel: string
): Record<string, unknown>[] {
  if (privacyLevel === "none") return data;

  return data.map((row) => {
    const masked = { ...row };
    for (const col of columns) {
      if (col.type === "email" && privacyLevel !== "none") {
        const email = String(masked[col.name] || "");
        const [local, domain] = email.split("@");
        if (local && domain) {
          masked[col.name] = `${local[0]}***@${domain}`;
        }
      }
      if (col.type === "phone" && (privacyLevel === "medium" || privacyLevel === "high")) {
        const phone = String(masked[col.name] || "");
        masked[col.name] = phone.replace(/\d(?=\d{4})/g, "*");
      }
      if (col.name.toLowerCase().includes("name") && privacyLevel === "high") {
        const name = String(masked[col.name] || "");
        masked[col.name] = name[0] + "***";
      }
    }
    return masked;
  });
}
