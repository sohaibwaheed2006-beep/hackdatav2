export const NULL_TOKENS: readonly string[] = [
  "",
  "n/a",
  "na",
  "null",
  "none",
  "nan",
  "-",
  "--",
  "?",
  "not applicable",
  "unknown",
];

const NULL_TOKEN_SET = new Set(NULL_TOKENS);

export function isNullToken(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string") return false;
  return NULL_TOKEN_SET.has(value.trim().toLowerCase());
}

export function normaliseHeader(raw: string): string {
  return raw
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function uniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const base = h || "column";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

export interface HeaderQualityIssue {
  header: string;
  reason: string;
}

export function checkHeaderQuality(headers: string[]): HeaderQualityIssue[] {
  const issues: HeaderQualityIssue[] = [];
  for (const h of headers) {
    const trimmed = h.trim();
    if (trimmed.length === 0) {
      issues.push({ header: h, reason: "empty header" });
      continue;
    }
    if (trimmed.length > 60) {
      issues.push({ header: h, reason: "header looks like a sentence (over 60 chars)" });
    }
    if (/\s/.test(trimmed) && trimmed.split(/\s+/).length > 6) {
      issues.push({ header: h, reason: "header contains more than 6 words" });
    }
    if (/^[({[]/.test(trimmed) || /^\)/.test(trimmed)) {
      issues.push({ header: h, reason: "header starts with a bracket" });
    }
    const opens = (trimmed.match(/[(\[{]/g) || []).length;
    const closes = (trimmed.match(/[)\]}]/g) || []).length;
    if (opens !== closes) {
      issues.push({ header: h, reason: "unbalanced brackets in header" });
    }
    if (/[.!?]$/.test(trimmed) && trimmed.length > 15) {
      issues.push({ header: h, reason: "header ends in sentence punctuation" });
    }
  }
  return issues;
}

const DATE_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DATE_SLASH = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/;

export interface ParsedDate {
  iso: string | null;
  ambiguous: boolean;
}

export function parseFlexibleDate(value: string): ParsedDate {
  const raw = value.trim();
  if (!raw) return { iso: null, ambiguous: false };

  const iso = raw.match(DATE_ISO);
  if (iso) {
    const [, y, m, d] = iso;
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (!isNaN(dt.getTime())) return { iso: dt.toISOString().slice(0, 10), ambiguous: false };
  }

  const slash = raw.match(DATE_SLASH);
  if (slash) {
    let [, a, b, y] = slash;
    let year = Number(y);
    if (year < 100) year += 2000;
    const na = Number(a);
    const nb = Number(b);
    let month: number;
    let day: number;
    let ambiguous = false;
    if (na > 12 && nb <= 12) {
      day = na;
      month = nb;
    } else if (nb > 12 && na <= 12) {
      month = na;
      day = nb;
    } else {
      // Both plausible. Default to day/month/year (rest-of-world) but flag it.
      day = na;
      month = nb;
      ambiguous = true;
    }
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (!isNaN(dt.getTime())) return { iso: dt.toISOString().slice(0, 10), ambiguous };
  }

  const parsed = Date.parse(raw);
  if (!isNaN(parsed)) return { iso: new Date(parsed).toISOString().slice(0, 10), ambiguous: false };

  return { iso: null, ambiguous: false };
}
