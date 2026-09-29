import { ColumnDef, Relationship } from "@/types";

interface TableInfo {
  name: string;
  columns: ColumnDef[];
  sampleData: Record<string, unknown>[];
}

export function detectRelationships(tables: TableInfo[]): Omit<Relationship, "id" | "project_id" | "created_at">[] {
  if (tables.length < 2) return [];

  const relationships: Omit<Relationship, "id" | "project_id" | "created_at">[] = [];
  const tableMap = new Map(tables.map((t) => [t.name, t]));

  for (const table of tables) {
    for (const col of table.columns) {
      const colLower = col.name.toLowerCase();

      if (!colLower.endsWith("_id") && colLower !== "id") continue;
      if (col.isPrimary) continue;

      const refTableName = colLower.replace(/_id$/, "");

      for (const [otherName, otherTable] of tableMap) {
        if (otherName === table.name) continue;

        const otherLower = otherName.toLowerCase();
        const isMatch =
          otherLower === refTableName ||
          otherLower === refTableName + "s" ||
          otherLower === refTableName + "es" ||
          otherLower.replace(/_/g, "") === refTableName.replace(/_/g, "");

        if (!isMatch) continue;

        const targetPK = otherTable.columns.find((c) => c.isPrimary);
        if (!targetPK) continue;

        const isUnique = col.isUnique;
        const relType: Relationship["relationship_type"] = isUnique ? "1:1" : "1:N";

        relationships.push({
          source_table: table.name,
          source_column: col.name,
          target_table: otherName,
          target_column: targetPK.name,
          relationship_type: relType,
          cardinality_min: 0,
          cardinality_max: relType === "1:1" ? 1 : 10,
          is_confirmed: false,
        });
      }
    }
  }

  detectManyToMany(tables, relationships);

  return relationships;
}

function detectManyToMany(
  tables: TableInfo[],
  relationships: Omit<Relationship, "id" | "project_id" | "created_at">[]
) {
  for (const table of tables) {
    const fkCols = table.columns.filter((col) => {
      const l = col.name.toLowerCase();
      if (l === "id" || !l.endsWith("_id")) return false;
      const ref = l.replace(/_id$/, "");
      return tables.some((t) => {
        if (t.name === table.name) return false;
        const tl = t.name.toLowerCase();
        return tl === ref || tl === ref + "s" || tl === ref + "es" || tl.replace(/_/g, "") === ref.replace(/_/g, "");
      });
    });

    const nonFkCols = table.columns.filter(
      (c) => !fkCols.includes(c) && c.name.toLowerCase() !== "id" && !c.isPrimary
    );

    // Junction table: exactly two FKs and few/no extra data columns
    if (fkCols.length === 2 && nonFkCols.length <= 2) {
      const resolve = (col: ColumnDef): TableInfo | undefined => {
        const ref = col.name.toLowerCase().replace(/_id$/, "");
        return tables.find((t) => {
          if (t.name === table.name) return false;
          const tl = t.name.toLowerCase();
          return tl === ref || tl === ref + "s" || tl === ref + "es" || tl.replace(/_/g, "") === ref.replace(/_/g, "");
        });
      };

      const a = resolve(fkCols[0]);
      const b = resolve(fkCols[1]);
      if (!a || !b || a.name === b.name) continue;

      const aPK = a.columns.find((c) => c.isPrimary);
      const bPK = b.columns.find((c) => c.isPrimary);
      if (!aPK || !bPK) continue;

      relationships.push({
        source_table: a.name,
        source_column: aPK.name,
        target_table: b.name,
        target_column: bPK.name,
        relationship_type: "N:N",
        cardinality_min: 0,
        cardinality_max: 100,
        is_confirmed: false,
      });
    }
  }
}
