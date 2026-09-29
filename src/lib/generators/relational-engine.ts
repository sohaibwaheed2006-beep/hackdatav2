import { DetectedSchema, Relationship, GenerationConfig } from "@/types";
import { generateTabularData, seededRandom } from "./tabular-engine";

interface RelationalResult {
  [tableName: string]: Record<string, unknown>[];
}

export function generateRelationalData(
  schemas: DetectedSchema[],
  relationships: Relationship[],
  config: GenerationConfig,
  aiData?: Record<string, Record<string, string[]>>
): RelationalResult {
  const result: RelationalResult = {};
  const rand = seededRandom((config.random_seed ?? Date.now()) + 104729);

  const sorted = topologicalSort(schemas, relationships);

  for (const schema of sorted) {
    const tableAiData = aiData?.[schema.table_name];

    const rows = generateTabularData(
      schema.columns,
      config,
      tableAiData
    );

    // Only physical FK relationships assign parent keys. N:N is logical
    // (realized by a junction table's own _id columns) and must not overwrite
    // this table's own primary key.
    const incomingRels = relationships.filter(
      (r) => r.source_table === schema.table_name && r.relationship_type !== "N:N"
    );

    for (const rel of incomingRels) {
      const parentData = result[rel.target_table];
      if (!parentData || parentData.length === 0) continue;

      const parentIds = parentData.map((r) => r[rel.target_column]).filter(Boolean);
      if (parentIds.length === 0) continue;

      rows.forEach((row, i) => {
        if (rel.relationship_type === "1:1") {
          row[rel.source_column] = parentIds[i % parentIds.length];
        } else {
          const randomIdx = Math.floor(rand() * parentIds.length);
          row[rel.source_column] = parentIds[randomIdx];
        }
      });
    }

    result[schema.table_name] = rows;
  }

  return result;
}

function topologicalSort(
  schemas: DetectedSchema[],
  relationships: Relationship[]
): DetectedSchema[] {
  const graph = new Map<string, Set<string>>();
  const schemaMap = new Map<string, DetectedSchema>();

  for (const s of schemas) {
    graph.set(s.table_name, new Set());
    schemaMap.set(s.table_name, s);
  }

  for (const rel of relationships) {
    const deps = graph.get(rel.source_table);
    if (deps) {
      deps.add(rel.target_table);
    }
  }

  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(node: string) {
    if (visited.has(node)) return;
    if (visiting.has(node)) return;
    visiting.add(node);
    const deps = graph.get(node) || new Set();
    for (const dep of deps) {
      visit(dep);
    }
    visiting.delete(node);
    visited.add(node);
    sorted.push(node);
  }

  for (const name of graph.keys()) {
    visit(name);
  }

  return sorted.map((name) => schemaMap.get(name)!).filter(Boolean);
}
