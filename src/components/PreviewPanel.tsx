"use client";

import { useState, useEffect } from "react";
import { GeneratedDataset, GeneratedDocument, Relationship } from "@/types";

interface Props {
  projectId: string;
}

type ViewMode = "table" | "stats" | "charts" | "relationships" | "document";

export default function PreviewPanel({ projectId }: Props) {
  const [datasets, setDatasets] = useState<GeneratedDataset[]>([]);
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [activeTable, setActiveTable] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/datasets/${projectId}`);
      const data = await res.json();
      setDatasets(data.datasets || []);
      setDocuments(data.documents || []);
      if (data.documents?.length > 0 && (!data.datasets || data.datasets.length === 0)) {
        setViewMode("document");
      }
      try {
        const schemaRes = await fetch(`/api/schemas/${projectId}`);
        const schemaData = await schemaRes.json();
        setRelationships(schemaData.relationships || []);
      } catch {
        setRelationships([]);
      }
    } catch {
      setDatasets([]);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(format: "csv" | "json" | "sql" | "pdf") {
    setExporting(true);
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, format }),
    });

    const contentType = res.headers.get("Content-Type") || "";
    const disposition = res.headers.get("Content-Disposition") || "";
    const fileNameMatch = disposition.match(/filename="?([^"]+)"?/);
    const fileName = fileNameMatch?.[1] || `export.${format}`;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
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

  const currentDataset = datasets[activeTable];
  const activeStatus = currentDataset
    ? currentDataset.is_valid
      ? "completed"
      : currentDataset.validation_errors.some((e) =>
          ["empty_result", "row_count_mismatch", "column_count_mismatch", "pk_duplicate", "null_violation", "null_token_leak"].includes(e.type)
        )
        ? "failed"
        : "completed_with_warnings"
    : null;

  return (
    <div className="pt-2">
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pb-3 pt-2 mb-4 bg-[var(--bg,white)]/85 backdrop-blur border-b border-[var(--border)]/60 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black"><span className="gradient-text">Live</span> Preview</h2>
            {activeStatus && <ValidatorStatusPill status={activeStatus} />}
          </div>
          <p className="text-[var(--text-secondary)] text-xs sm:text-sm">
            {datasets.length > 0 && `${datasets.reduce((s, d) => s + d.row_count, 0)} total rows across ${datasets.length} table(s)`}
            {documents.length > 0 && `${documents.length} document(s) generated`}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs sm:text-sm font-medium text-[var(--text-secondary)] mr-1">Export:</span>
          {datasets.length > 0 && (
            <>
              <ExportButton label="CSV" onClick={() => handleExport("csv")} disabled={exporting} />
              <ExportButton label="JSON" onClick={() => handleExport("json")} disabled={exporting} />
              <ExportButton label="SQL" onClick={() => handleExport("sql")} disabled={exporting} />
            </>
          )}
          {documents.length > 0 && (
            <ExportButton label="HTML" onClick={() => handleExport("pdf")} disabled={exporting} />
          )}
        </div>
      </div>

      {datasets.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex gap-1 bg-white rounded-lg border border-[var(--border)] p-1">
            <button
              onClick={() => setViewMode("table")}
              className={`px-3 py-1.5 text-sm rounded-md ${viewMode === "table" ? "bg-[var(--accent)] text-white" : "hover:bg-gray-100"}`}
            >
              Table
            </button>
            <button
              onClick={() => setViewMode("stats")}
              className={`px-3 py-1.5 text-sm rounded-md ${viewMode === "stats" ? "bg-[var(--accent)] text-white" : "hover:bg-gray-100"}`}
            >
              Statistics
            </button>
            <button
              onClick={() => setViewMode("charts")}
              className={`px-3 py-1.5 text-sm rounded-md ${viewMode === "charts" ? "bg-[var(--accent)] text-white" : "hover:bg-gray-100"}`}
            >
              Charts
            </button>
            {relationships.length > 0 && (
              <button
                onClick={() => setViewMode("relationships")}
                className={`px-3 py-1.5 text-sm rounded-md ${viewMode === "relationships" ? "bg-[var(--accent)] text-white" : "hover:bg-gray-100"}`}
              >
                Relationships
              </button>
            )}
          </div>

          {datasets.length > 1 && (
            <div className="flex gap-1 bg-white rounded-lg border border-[var(--border)] p-1">
              {datasets.map((ds, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveTable(idx)}
                  className={`px-3 py-1.5 text-sm rounded-md ${activeTable === idx ? "bg-[var(--accent)] text-white" : "hover:bg-gray-100"}`}
                >
                  {ds.table_name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {viewMode === "table" && currentDataset && (
        <div className="glass card-3d rounded-2xl overflow-hidden animate-fade-up">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-[var(--border)]">
                  <th className="py-2 px-3 text-left text-xs font-medium text-[var(--text-secondary)]">#</th>
                  {currentDataset.data.length > 0 &&
                    Object.keys(currentDataset.data[0]).map((key) => (
                      <th
                        key={key}
                        title={key}
                        className="py-2 px-3 text-left text-xs font-medium text-[var(--text-secondary)] max-w-[180px] truncate"
                      >
                        {key}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {currentDataset.data.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1.5 px-3 text-xs text-gray-400">{i + 1}</td>
                    {Object.entries(row).map(([k, val], j) => {
                      const isMoney = k.toLowerCase().includes("balance") || k.toLowerCase().includes("price") || k.toLowerCase().includes("salary") || k.toLowerCase().includes("cost") || k.toLowerCase().includes("amount") || k.toLowerCase().includes("total");
                      let displayVal = String(val);
                      if (val === null || val === undefined) {
                        displayVal = "";
                      } else if (typeof val === "number" && isMoney) {
                        displayVal = val.toFixed(2);
                      } else if (typeof val === "boolean") {
                        displayVal = val ? "true" : "false";
                      }

                      return (
                        <td key={j} className="py-1.5 px-3 font-mono text-xs">
                          {val === null || val === undefined ? (
                            <span className="text-gray-300 italic">null</span>
                          ) : (
                            displayVal
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {currentDataset.data.length > 50 && (
            <div className="px-4 py-2 bg-gray-50 text-sm text-[var(--text-secondary)] text-center border-t border-[var(--border)]">
              Showing 50 of {currentDataset.data.length} rows
            </div>
          )}
        </div>
      )}

      {viewMode === "stats" && currentDataset?.statistics && (
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(currentDataset.statistics).map(([column, stats]) => (
            <div key={column} className="glass rounded-2xl p-4">
              <h4 className="font-medium text-sm mb-3">{column}</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {stats.mean !== undefined && (
                  <StatItem label="Mean" value={stats.mean.toFixed(2)} />
                )}
                {stats.median !== undefined && (
                  <StatItem label="Median" value={String(stats.median)} />
                )}
                {stats.stddev !== undefined && (
                  <StatItem label="Std Dev" value={stats.stddev.toFixed(2)} />
                )}
                {stats.min !== undefined && (
                  <StatItem label="Min" value={String(stats.min)} />
                )}
                {stats.max !== undefined && (
                  <StatItem label="Max" value={String(stats.max)} />
                )}
                <StatItem label="Nulls" value={String(stats.nullCount)} />
                <StatItem label="Unique" value={String(stats.uniqueCount)} />
                {stats.distribution && (
                  <div className="col-span-2 mt-2 pt-2 border-t border-gray-100">
                    <p className="text-[var(--text-secondary)] mb-1">Distribution</p>
                    {Object.entries(stats.distribution).map(([val, count]) => (
                      <div key={val} className="flex items-center gap-2 mb-1">
                        <span className="text-[var(--text-secondary)] w-20 truncate">{val}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-[var(--accent)] rounded-full h-2"
                            style={{
                              width: `${(count / currentDataset.data.length) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-[var(--text-secondary)]">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewMode === "charts" && currentDataset && (
        <ChartsView dataset={currentDataset} />
      )}

      {viewMode === "relationships" && (
        <RelationshipDiagram relationships={relationships} datasets={datasets} />
      )}

      {(viewMode === "document" || documents.length > 0) && documents.length > 0 && (
        <div className="space-y-4">
          {viewMode !== "document" && (
            <button
              onClick={() => setViewMode("document")}
              className="px-3 py-1.5 text-sm bg-[var(--accent-light)] text-[var(--accent)] rounded-lg"
            >
              View Documents ({documents.length})
            </button>
          )}
          {viewMode === "document" &&
            documents.slice(0, 5).map((doc) => (
              <div key={doc.id} className="glass rounded-2xl overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-[var(--border)] flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">
                    {doc.document_type.replace("_", " ")} — {doc.document_number}
                  </span>
                </div>
                {doc.html_content && (
                  <iframe
                    srcDoc={doc.html_content}
                    className="w-full h-96 border-0"
                    sandbox="allow-same-origin"
                  />
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function ValidatorStatusPill({ status }: { status: "completed" | "completed_with_warnings" | "failed" }) {
  const styles: Record<string, string> = {
    completed: "bg-green-100 text-green-700 border-green-300",
    completed_with_warnings: "bg-yellow-100 text-yellow-800 border-yellow-300",
    failed: "bg-red-100 text-red-700 border-red-300",
  };
  const label = status === "completed" ? "Completed" : status === "completed_with_warnings" ? "Completed with warnings" : "Failed";
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${styles[status]}`}>
      {label}
    </span>
  );
}

function ExportButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 text-sm bg-[var(--accent-light)] text-[var(--accent)] rounded-lg hover:bg-teal-100 disabled:opacity-50 font-medium"
    >
      {label}
    </button>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[var(--text-secondary)]">{label}</span>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function ChartsView({ dataset }: { dataset: GeneratedDataset }) {
  if (dataset.data.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">No data to chart.</p>;
  }

  const columns = Object.keys(dataset.data[0]);
  const charts: { column: string; kind: "histogram" | "bars"; bins: { label: string; count: number }[] }[] = [];

  for (const col of columns) {
    const values = dataset.data.map((r) => r[col]).filter((v) => v !== null && v !== undefined);
    if (values.length === 0) continue;

    const numeric = values.map(Number).filter((n) => !isNaN(n));
    const isNumeric = numeric.length === values.length && numeric.length > 0;

    if (isNumeric) {
      const min = Math.min(...numeric);
      const max = Math.max(...numeric);
      const binCount = Math.min(10, new Set(numeric).size);
      if (binCount <= 1 || min === max) {
        charts.push({ column: col, kind: "bars", bins: [{ label: String(min), count: numeric.length }] });
        continue;
      }
      const width = (max - min) / binCount;
      const bins = Array.from({ length: binCount }, (_, i) => ({
        label: `${(min + i * width).toFixed(1)}`,
        count: 0,
      }));
      for (const n of numeric) {
        let idx = Math.floor((n - min) / width);
        if (idx >= binCount) idx = binCount - 1;
        bins[idx].count++;
      }
      charts.push({ column: col, kind: "histogram", bins });
    } else {
      const counts: Record<string, number> = {};
      values.forEach((v) => {
        const key = String(v);
        counts[key] = (counts[key] || 0) + 1;
      });
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
      if (entries.length > 1 && entries.length <= 12) {
        charts.push({ column: col, kind: "bars", bins: entries.map(([label, count]) => ({ label, count })) });
      }
    }
  }

  if (charts.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">No chartable columns found.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {charts.map((chart) => {
        const maxCount = Math.max(...chart.bins.map((b) => b.count));
        return (
          <div key={chart.column} className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-sm">{chart.column}</h4>
              <span className="text-xs text-[var(--text-secondary)]">{chart.kind === "histogram" ? "distribution" : "counts"}</span>
            </div>
            <div className="flex items-end gap-1 h-32">
              {chart.bins.map((bin, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end group relative">
                  <div className="absolute -top-5 text-[10px] text-[var(--text-secondary)] opacity-0 group-hover:opacity-100">
                    {bin.count}
                  </div>
                  <div
                    className="w-full bg-[var(--accent)] rounded-t"
                    style={{ height: `${maxCount > 0 ? (bin.count / maxCount) * 100 : 0}%`, minHeight: bin.count > 0 ? "2px" : "0" }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-1 mt-1">
              {chart.bins.map((bin, i) => (
                <div key={i} className="flex-1 text-[9px] text-center text-[var(--text-secondary)] truncate" title={bin.label}>
                  {bin.label}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RelationshipDiagram({ relationships, datasets }: { relationships: Relationship[]; datasets: GeneratedDataset[] }) {
  if (relationships.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">No relationships detected.</p>;
  }

  const rowCounts = new Map(datasets.map((d) => [d.table_name, d.row_count]));

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-lg font-bold mb-4">Table Relationships</h3>
      <div className="space-y-3">
        {relationships.map((rel, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <TableNode name={rel.source_table} field={rel.source_column} count={rowCounts.get(rel.source_table)} />
            <div className="flex flex-col items-center min-w-[80px]">
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium mb-1">
                {rel.relationship_type}
              </span>
              <svg width="60" height="12" viewBox="0 0 60 12">
                <line x1="0" y1="6" x2="52" y2="6" stroke="#a78bfa" strokeWidth="2" />
                <polygon points="52,1 60,6 52,11" fill="#a78bfa" />
              </svg>
            </div>
            <TableNode name={rel.target_table} field={rel.target_column} count={rowCounts.get(rel.target_table)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TableNode({ name, field, count }: { name: string; field: string; count?: number }) {
  return (
    <div className="flex-1 bg-[var(--accent-light)] border border-[var(--accent)] rounded-lg px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="font-bold text-sm text-[var(--accent)]">{name}</span>
        {count !== undefined && <span className="text-[10px] text-[var(--text-secondary)]">{count} rows</span>}
      </div>
      <span className="font-mono text-xs text-[var(--text-secondary)]">{field}</span>
    </div>
  );
}
