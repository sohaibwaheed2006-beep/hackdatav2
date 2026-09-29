"use client";

import { useState, useEffect } from "react";
import { DetectedSchema, Relationship } from "@/types";

interface Props {
  projectId: string;
  onConfirmed: () => void;
}

export default function SchemaReview({ projectId, onConfirmed }: Props) {
  const [schemas, setSchemas] = useState<DetectedSchema[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSchemas();
  }, [projectId]);

  async function fetchSchemas() {
    setLoading(true);
    try {
      const res = await fetch(`/api/schemas/${projectId}`);
      const data = await res.json();
      setSchemas(data.schemas || []);
      setRelationships(data.relationships || []);
    } catch {
      setSchemas([]);
      setRelationships([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setSaving(true);
    await fetch(`/api/schemas/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemas, relationships }),
    });
    setSaving(false);
    onConfirmed();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="animate-spin h-8 w-8 text-[var(--accent)]" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-2xl font-black mb-1"><span className="gradient-text">Schema</span> Review</h2>
      <p className="text-[var(--text-secondary)] mb-6">
        Review and edit the detected schema. Confirm when ready.
      </p>

      {schemas.map((schema, si) => (
        <div
          key={schema.id}
          className="glass spotlight lift rounded-2xl p-6 mb-4 animate-fade-up"
          style={{ animationDelay: `${si * 0.1}s` }}
        >
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-lg font-black gradient-text">{schema.table_name}</h3>
            <span className="chip-3d px-2.5 py-0.5 text-xs rounded-full font-semibold">
              {schema.columns.length} columns
            </span>
            {schema.primary_keys.length > 0 && (
              <span className="px-2.5 py-0.5 bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-700 text-xs rounded-full font-semibold border border-yellow-300">
                🔑 PK: {schema.primary_keys.join(", ")}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">Column</th>
                  <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">Type</th>
                  <th className="text-center py-2 px-3 font-medium text-[var(--text-secondary)]">Primary</th>
                  <th className="text-center py-2 px-3 font-medium text-[var(--text-secondary)]">Unique</th>
                  <th className="text-center py-2 px-3 font-medium text-[var(--text-secondary)]">Nullable</th>
                </tr>
              </thead>
              <tbody>
                {schema.columns.map((col, idx) => (
                  <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-3 font-mono text-sm">
                      <div className="flex items-center gap-2">
                        <span>{col.name}</span>
                        {col.qualityWarning && (
                          <span
                            title={col.qualityWarning}
                            className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300"
                          >
                            ⚠ low quality
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={col.type}
                        onChange={(e) => {
                          const updated = [...schemas];
                          const s = updated.find((s) => s.id === schema.id);
                          if (s) {
                            s.columns[idx] = { ...col, type: e.target.value as typeof col.type };
                            setSchemas(updated);
                          }
                        }}
                        className="px-2 py-1 border border-[var(--border)] rounded text-xs"
                      >
                        {["string", "integer", "float", "boolean", "date", "datetime", "email", "phone", "uuid", "currency", "text", "enum"].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {col.isPrimary && <span className="text-yellow-600 font-bold">PK</span>}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {col.isUnique && <span className="text-blue-600">UQ</span>}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={col.nullable}
                        onChange={(e) => {
                          const updated = [...schemas];
                          const s = updated.find((s) => s.id === schema.id);
                          if (s) {
                            s.columns[idx] = { ...col, nullable: e.target.checked };
                            setSchemas(updated);
                          }
                        }}
                        className="accent-[var(--accent)]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {schema.sample_data && schema.sample_data.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <p className="text-xs font-medium text-[var(--text-secondary)] mb-2">Sample Data (first 3 rows)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr>
                      {Object.keys(schema.sample_data[0]).map((key) => (
                        <th key={key} className="text-left py-1 px-2 text-[var(--text-secondary)]">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schema.sample_data.slice(0, 3).map((row, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="py-1 px-2">{String(val ?? "null")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ))}

      {relationships.length > 0 && (
        <div className="glass spotlight lift rounded-2xl p-6 mb-4 animate-fade-up">
          <h3 className="text-lg font-black mb-4"><span className="gradient-text-2">Detected</span> Relationships</h3>
          {relationships.map((rel, idx) => (
            <div
              key={idx}
              className="animate-fade-up flex items-center gap-3 py-2.5 border-b border-white/10 last:border-0"
              style={{ animationDelay: `${idx * 0.05}s` }}
            >
              <span className="font-mono text-sm text-[var(--accent)] font-semibold">{rel.source_table}.{rel.source_column}</span>
              <span className="px-2.5 py-0.5 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 text-xs rounded-full font-bold border border-purple-300">
                {rel.relationship_type}
              </span>
              <span className="font-mono text-sm text-[var(--accent-2)] font-semibold">{rel.target_table}.{rel.target_column}</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleConfirm}
        disabled={saving}
        className="btn-3d w-full px-6 py-3.5 disabled:opacity-50 font-bold text-lg"
      >
        {saving ? "Confirming..." : "Confirm Schema"}
      </button>
    </div>
  );
}
