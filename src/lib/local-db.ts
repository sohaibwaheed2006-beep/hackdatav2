import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");

interface LocalDBData {
  projects: Record<string, unknown>[];
  input_files: Record<string, unknown>[];
  detected_schemas: Record<string, unknown>[];
  relationships: Record<string, unknown>[];
  generation_configs: Record<string, unknown>[];
  generated_datasets: Record<string, unknown>[];
  generated_documents: Record<string, unknown>[];
  export_history: Record<string, unknown>[];
}

const defaultData: LocalDBData = {
  projects: [],
  input_files: [],
  detected_schemas: [],
  relationships: [],
  generation_configs: [],
  generated_datasets: [],
  generated_documents: [],
  export_history: [],
};

function ensureDB(): LocalDBData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), "utf-8");
      return defaultData;
    }
    const content = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(content) as LocalDBData;
  } catch {
    return defaultData;
  }
}

function saveDB(data: LocalDBData) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving local DB:", err);
  }
}

class QueryBuilder<T = Record<string, unknown>> {
  private tableName: keyof LocalDBData;
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private orderField: string | null = null;
  private orderAscending = true;
  private pendingInsert: Record<string, unknown> | null = null;
  private pendingUpdate: Record<string, unknown> | null = null;
  private isDelete = false;

  constructor(tableName: keyof LocalDBData) {
    this.tableName = tableName;
  }

  select(_fields = "*"): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => String(row[column]) === String(value));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderField = column;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  insert(data: Record<string, unknown>): this {
    const now = new Date().toISOString();
    const newRecord = {
      id: data.id || crypto.randomUUID(),
      created_at: data.created_at || now,
      updated_at: data.updated_at || now,
      ...data,
    };
    this.pendingInsert = newRecord;

    const db = ensureDB();
    if (!db[this.tableName]) db[this.tableName] = [];
    db[this.tableName].push(newRecord);
    saveDB(db);

    return this;
  }

  update(data: Record<string, unknown>): this {
    this.pendingUpdate = { ...data, updated_at: new Date().toISOString() };
    return this;
  }

  delete(): this {
    this.isDelete = true;
    return this;
  }

  async single(): Promise<{ data: T | null; error: { message: string } | null }> {
    const res = await this.execute();
    if (res.error) return { data: null, error: res.error };
    const items = res.data as T[];
    return { data: items && items.length > 0 ? items[0] : null, error: null };
  }

  async then<TResult1 = { data: T[] | null; error: { message: string } | null }>(
    onfulfilled?: ((value: { data: T[] | null; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null
  ): Promise<TResult1> {
    const result = await this.execute();
    if (onfulfilled) {
      return onfulfilled(result as unknown as { data: T[] | null; error: { message: string } | null });
    }
    return result as unknown as TResult1;
  }

  private async execute(): Promise<{ data: T[] | null; error: { message: string } | null }> {
    const db = ensureDB();
    if (!db[this.tableName]) db[this.tableName] = [];

    if (this.pendingInsert) {
      return { data: [this.pendingInsert as unknown as T], error: null };
    }

    if (this.pendingUpdate) {
      let updatedCount = 0;
      const updatedRows: Record<string, unknown>[] = [];
      db[this.tableName] = db[this.tableName].map((row) => {
        const matches = this.filters.every((f) => f(row));
        if (matches) {
          updatedCount++;
          const updated = { ...row, ...this.pendingUpdate };
          updatedRows.push(updated);
          return updated;
        }
        return row;
      });
      if (updatedCount > 0) saveDB(db);
      return { data: updatedRows as unknown as T[], error: null };
    }

    if (this.isDelete) {
      const initialLength = db[this.tableName].length;
      db[this.tableName] = db[this.tableName].filter((row) => !this.filters.every((f) => f(row)));
      if (db[this.tableName].length !== initialLength) saveDB(db);
      return { data: [] as unknown as T[], error: null };
    }

    let results = db[this.tableName].filter((row) => this.filters.every((f) => f(row)));

    if (this.orderField) {
      const field = this.orderField;
      results.sort((a, b) => {
        const valA = a[field];
        const valB = b[field];
        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        if (valA < valB) return this.orderAscending ? -1 : 1;
        return this.orderAscending ? 1 : -1;
      });
    }

    return { data: results as unknown as T[], error: null };
  }
}

export function createLocalClient() {
  return {
    from: (tableName: string) => {
      return new QueryBuilder(tableName as keyof LocalDBData);
    },
  };
}
