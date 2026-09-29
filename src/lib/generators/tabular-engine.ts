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

export const FIRST_NAMES = [
  "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "William", "Elizabeth",
  "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen",
  "Christopher", "Nancy", "Daniel", "Lisa", "Matthew", "Margaret", "Anthony", "Betty", "Donald", "Sandra",
  "Mark", "Ashley", "Paul", "Dorothy", "Steven", "Kimberly", "Andrew", "Emily", "Kenneth", "Donna",
  "Joshua", "Michelle", "Kevin", "Carol", "Brian", "Amanda", "George", "Melissa", "Edward", "Deborah",
  "Ronald", "Stephanie", "Timothy", "Rebecca", "Jason", "Sharon", "Jeffrey", "Laura", "Ryan", "Cynthia",
  "Jacob", "Kathleen", "Gary", "Amy", "Nicholas", "Shirley", "Eric", "Angela", "Jonathan", "Helen",
  "Stephen", "Anna", "Larry", "Brenda", "Justin", "Pamela", "Scott", "Nicole", "Brandon", "Emma",
  "Benjamin", "Samantha", "Samuel", "Katherine", "Gregory", "Christine", "Alexander", "Debra", "Patrick", "Rachel",
  "Frank", "Catherine", "Raymond", "Carolyn", "Jack", "Janet", "Dennis", "Ruth", "Jerry", "Maria",
  "Tyler", "Heather", "Aaron", "Diane", "Jose", "Virginia", "Adam", "Julie", "Nathan", "Joyce",
  "Henry", "Victoria", "Zachary", "Olivia", "Douglas", "Kelly", "Peter", "Christina", "Kyle", "Lauren",
  "Noah", "Joan", "Ethan", "Evelyn", "Jeremy", "Judith", "Walter", "Megan", "Christian", "Cheryl",
  "Keith", "Andrea", "Roger", "Hannah", "Terry", "Martha", "Gerald", "Jacqueline", "Harold", "Frances",
  "Sean", "Ann", "Austin", "Gloria", "Carl", "Jean", "Arthur", "Kathryn", "Lawrence", "Alice",
  "Dylan", "Teresa", "Jesse", "Sara", "Jordan", "Janice", "Bryan", "Doris", "Billy", "Madison",
  "Joe", "Julia", "Bruce", "Grace", "Gabriel", "Judy", "Logan", "Abigail", "Albert", "Marie"
];

export const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
  "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
  "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
  "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
  "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts",
  "Gomez", "Phillips", "Evans", "Turner", "Diaz", "Parker", "Cruz", "Edwards", "Collins", "Reyes",
  "Stewart", "Morris", "Morales", "Murphy", "Cook", "Rogers", "Gutierrez", "Ortiz", "Morgan", "Cooper",
  "Peterson", "Bailey", "Reed", "Kelly", "Howard", "Ramos", "Kim", "Cox", "Ward", "Richardson",
  "Watson", "Brooks", "Chavez", "Wood", "James", "Bennett", "Mendoza", "Gray", "Aguilar", "Hughes",
  "Alvarez", "Castillo", "Sanders", "Patel", "Myers", "Long", "Ross", "Foster", "Jimenez", "Powell",
  "Jenkins", "Perry", "Russell", "Sullivan", "Bell", "Coleman", "Butler", "Henderson", "Barnes", "Gonzales",
  "Fisher", "Vasquez", "Simmons", "Romero", "Jordan", "Patterson", "Alexander", "Hamilton", "Graham", "Reynolds",
  "Griffin", "Wallace", "Moreno", "West", "Cole", "Hayes", "Bryant", "Herrera", "Gibson", "Ellis",
  "Tran", "Medina", "Stevens", "Murray", "Ford", "Castro", "Marshall", "Owens", "Harrison", "Fernandez",
  "McDonald", "Woods", "Washington", "Kennedy", "Wells", "Vargas", "Henry", "Chen", "Freeman", "Webb",
  "Tucker", "Guzman", "Burns", "Crawford", "Olson", "Simpson", "Porter", "Hunter", "Gordon", "Mendez"
];

export function getDistinctPerson(index: number) {
  const fIdx = index % FIRST_NAMES.length;
  const lIdx = (Math.floor(index / FIRST_NAMES.length) + (index % LAST_NAMES.length)) % LAST_NAMES.length;
  const firstName = FIRST_NAMES[fIdx];
  const lastName = LAST_NAMES[lIdx];
  const fullName = `${firstName} ${lastName}`;
  const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, "");
  const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, "");
  const email = `${cleanFirst}.${cleanLast}@example.com`;

  // Realistic NANP phone number: area code 201-998 (never starts with 0 or 1)
  const area = 201 + ((index * 17) % 798);
  const mid = 201 + ((index * 31) % 798);
  const last = String(1000 + ((index * 47) % 9000)).padStart(4, "0");
  const phone = `+1-${area}-${mid}-${last}`;

  return { firstName, lastName, fullName, email, phone };
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

export function isStructuralColumn(col: ColumnDef): boolean {
  const lower = col.name.toLowerCase();
  if (col.isPrimary || lower === "id" || lower.startsWith("pk_") || lower.endsWith("_pk")) return true;
  if (lower.startsWith("fk_") || lower.endsWith("_fk") || (lower.endsWith("_id") && !lower.includes("name"))) return true;
  if (
    lower.startsWith("id_") ||
    lower.includes("tracking") ||
    lower.includes("uuid") ||
    lower.includes("guid") ||
    lower.includes("sku") ||
    lower.endsWith("_no") ||
    lower.endsWith("_num") ||
    lower.endsWith("_number") ||
    lower.endsWith("_key")
  ) {
    return true;
  }
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
    if (col.isPrimary || col.isUnique || col.isIdentifier || isStructuralColumn(col)) {
      uniqueTrackers.set(col.name, new Set());
    }
  }

  for (let i = 0; i < config.row_count; i++) {
    const row: Record<string, unknown> = {};
    const person = getDistinctPerson(i);
    const isOutlier = rand() < (config.outlier_rate ?? 0.02);

    for (const col of columns) {
      const lower = col.name.toLowerCase();
      const isStructural = isStructuralColumn(col);

      // 1. Primary key: id must never be null or duplicated.
      if (col.isPrimary || lower === "id" || lower.startsWith("pk_") || lower.endsWith("_pk")) {
        const pkVal = col.type === "integer" ? i + 1 : `PK-${String(i + 1).padStart(5, "0")}`;
        row[col.name] = pkVal;
        if (uniqueTrackers.has(col.name)) uniqueTrackers.get(col.name)!.add(pkVal);
        continue;
      }

      // Constant columns keep their constant value
      if (col.isConstant && col.constantValue !== undefined) {
        row[col.name] = col.nullable && !isStructural && rand() < (config.null_rate ?? 0.05) ? null : col.constantValue;
        continue;
      }

      // 9. Keep null rate around 5% on nullable columns only (never on structural / keys / non-nullable).
      if (col.nullable && !isStructural && rand() < (config.null_rate ?? 0.05)) {
        row[col.name] = null;
        continue;
      }

      // Tracking numbers / shipment codes
      if (lower.includes("tracking") || lower.includes("shipment")) {
        const trk = `TRK-${100000 + ((i * 7919 + 104729) % 900000)}`;
        row[col.name] = trk;
        if (uniqueTrackers.has(col.name)) uniqueTrackers.get(col.name)!.add(trk);
        continue;
      }

      // 2. Distinct person name: no repeated names. Never add suffixes like _51.
      if (
        lower === "name" ||
        lower === "customer_name" ||
        lower === "full_name" ||
        (lower.endsWith("_name") && !lower.includes("first") && !lower.includes("last") && !lower.includes("company") && !lower.includes("product")) ||
        lower.includes("driver") ||
        lower.includes("recipient") ||
        lower.includes("passenger") ||
        lower.includes("client") ||
        lower.includes("agent")
      ) {
        row[col.name] = person.fullName;
        if (uniqueTrackers.has(col.name)) uniqueTrackers.get(col.name)!.add(person.fullName);
        continue;
      }
      if (lower === "first_name") {
        row[col.name] = person.firstName;
        continue;
      }
      if (lower === "last_name") {
        row[col.name] = person.lastName;
        continue;
      }

      // 3. Email must be valid (name@domain.com), unique, and match the person's name. Never put anything after .com.
      if (col.type === "email" || lower === "email" || lower.endsWith("_email")) {
        row[col.name] = person.email;
        if (uniqueTrackers.has(col.name)) uniqueTrackers.get(col.name)!.add(person.email);
        continue;
      }

      // 7. Realistic phone numbers: valid area code that doesn't start with 0 or 1. Distinct per row.
      if (col.type === "phone" || lower === "phone" || lower.includes("phone") || lower.includes("tel")) {
        row[col.name] = person.phone;
        if (uniqueTrackers.has(col.name)) uniqueTrackers.get(col.name)!.add(person.phone);
        continue;
      }

      // 5. Use all status values: active, inactive, suspended, pending. Roughly 60% active, 20% inactive, 10% suspended, 10% pending.
      if (lower === "status" || lower.endsWith("_status")) {
        const r = rand();
        if (r < 0.60) row[col.name] = "active";
        else if (r < 0.80) row[col.name] = "inactive";
        else if (r < 0.90) row[col.name] = "suspended";
        else row[col.name] = "pending";
        continue;
      }

      // 6. Format balance with exactly 2 decimals (68.00, not 68)
      if (lower === "balance" || col.type === "currency") {
        const num = sampleNumeric(col, rand, isOutlier, false);
        row[col.name] = num.toFixed(2);
        continue;
      }

      // AI content for free-text columns if provided
      if (
        !isProfileDriven(col) &&
        aiData && aiData[col.name] && aiData[col.name].length > 0
      ) {
        const aiValues = aiData[col.name];
        const candidate = aiValues[i % aiValues.length];
        row[col.name] = isNullToken(candidate)
          ? generateValue(col, i, rand, isOutlier, config)
          : candidate;
      } else {
        row[col.name] = generateValue(col, i, rand, isOutlier, config);
      }

      // Enforce strict uniqueness for other columns
      if (uniqueTrackers.has(col.name)) {
        const seen = uniqueTrackers.get(col.name)!;
        let val = row[col.name];
        if (val !== null && val !== undefined) {
          if (seen.has(val)) {
            if (typeof val === "number") {
              val = (col.minValue !== undefined && col.minValue > 0 ? col.minValue : 1) + i;
              while (seen.has(val)) (val as number)++;
            } else {
              if (lower.includes("name") || lower.includes("driver") || lower.includes("recipient") || lower.includes("client")) {
                val = getDistinctPerson(i + seen.size + 100).fullName;
                while (seen.has(val)) {
                  val = getDistinctPerson(i + seen.size + Math.floor(rand() * 500)).fullName;
                }
              } else if (lower.includes("tracking")) {
                val = `TRK-${100000 + (((i + seen.size) * 7919 + 104729) % 900000)}`;
              } else if (lower.startsWith("pk_") || lower.endsWith("_pk")) {
                val = `PK-${String(i + seen.size + 1).padStart(5, "0")}`;
              } else {
                val = `${val}-${(seen.size + 1).toString(36).toUpperCase()}`;
              }
            }
            row[col.name] = val;
          }
          seen.add(val);
        }
      }
    }

    // 10. Mark deliberate edge-case rows with a flag column is_edge_case = true
    row.is_edge_case = isOutlier;

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
  const lower = col.name.toLowerCase();

  switch (col.type) {
    case "integer": {
      if (col.isPrimary || col.isIdentifier || col.isUnique || lower === "id") {
        return index + 1;
      }
      return sampleNumeric(col, rand, isOutlier, true);
    }

    case "float":
    case "currency": {
      const num = sampleNumeric(col, rand, isOutlier, false);
      if (col.type === "currency" || lower === "balance" || lower.includes("price") || lower.includes("amount") || lower.includes("cost")) {
        return num.toFixed(2);
      }
      return Number(num.toFixed(2));
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
      return getDistinctPerson(index).email;
    }

    case "phone": {
      return getDistinctPerson(index).phone;
    }

    case "enum": {
      if (lower === "status" || lower.endsWith("_status")) {
        const r = rand();
        if (r < 0.60) return "active";
        if (r < 0.80) return "inactive";
        if (r < 0.90) return "suspended";
        return "pending";
      }
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
    default: {
      if (
        lower === "name" ||
        lower === "customer_name" ||
        lower === "full_name" ||
        (lower.endsWith("_name") && !lower.includes("first") && !lower.includes("last") && !lower.includes("company") && !lower.includes("product")) ||
        lower.includes("driver") ||
        lower.includes("recipient") ||
        lower.includes("passenger") ||
        lower.includes("client") ||
        lower.includes("agent")
      ) {
        return getDistinctPerson(index).fullName;
      }
      if (lower === "first_name") return getDistinctPerson(index).firstName;
      if (lower === "last_name") return getDistinctPerson(index).lastName;
      if (lower.includes("tracking") || lower.includes("shipment")) {
        return `TRK-${100000 + ((index * 7919 + 104729) % 900000)}`;
      }
      if (lower.startsWith("pk_") || lower.endsWith("_pk") || lower.startsWith("id_") || lower === "id") {
        return `PK-${String(index + 1).padStart(5, "0")}`;
      }
      if (lower.startsWith("fk_") || lower.endsWith("_fk") || (lower.endsWith("_id") && !lower.includes("name"))) {
        return `FK-${String(index + 1).padStart(5, "0")}`;
      }
      if (lower.includes("order")) return `ORD-${10000 + index + 1}`;
      if (lower.includes("invoice")) return `INV-${20000 + index + 1}`;
      if (lower.includes("delivery")) return `DEL-${30000 + index + 1}`;
      if (lower.includes("code") || lower.includes("sku") || lower.endsWith("_no") || lower.endsWith("_key")) {
        return `CODE-${String(1000 + index + 1)}`;
      }
      return `VAL-${String(1000 + index + 1)}`;
    }
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
      const lower = col.name.toLowerCase();
      if ((col.type === "email" || lower === "email" || lower.endsWith("_email")) && masked[col.name]) {
        masked[col.name] = hashEmail(String(masked[col.name]));
      }
      if ((col.type === "phone" || lower === "phone" || lower.includes("phone") || lower.includes("tel")) && masked[col.name]) {
        const phone = String(masked[col.name]);
        masked[col.name] = phone.replace(/\d(?=\d{4})/g, "*");
      }
      if (lower.includes("name") && masked[col.name] && privacyLevel === "high") {
        const name = String(masked[col.name]);
        const parts = name.split(" ");
        masked[col.name] = parts.map((p) => (p.length > 0 ? p[0] + "***" : p)).join(" ");
      }
    }
    return masked;
  });
}

function hashEmail(email: string): string {
  const [local] = email.split("@");
  let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
  for (let i = 0; i < (local || email).length; i++) {
    const ch = (local || email).charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(8, "0").slice(0, 8);
  const initial = local && /^[a-z]/i.test(local) ? local[0].toLowerCase() : "u";
  return `${initial}_${hex}@example.com`;
}
