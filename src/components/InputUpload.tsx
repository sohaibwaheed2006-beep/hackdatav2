"use client";

import { useState, useRef } from "react";
import { Project } from "@/types";

interface Props {
  project: Project;
  onAnalyzed: () => void;
}

export default function InputUpload({ project, onAnalyzed }: Props) {
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState<"csv" | "json" | "sql" | "txt">("csv");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setContent(text);
    setFileName(file.name);
    setError("");

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv") setFileType("csv");
    else if (ext === "json") setFileType("json");
    else if (ext === "sql") setFileType("sql");
    else {
      setFileType("txt");
      setError(
        `.${ext || "?"} files aren't supported. Upload a CSV, JSON, or SQL schema, or pick the correct format below and paste the data.`
      );
    }
  }

  async function handleAnalyze() {
    if (!content.trim()) {
      setError("Please provide input data");
      return;
    }
    if (fileType === "txt") {
      setError(
        "Text files aren't a structured format. Choose CSV, JSON, or SQL Schema and provide data in that format."
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          content,
          fileName: fileName || `input.${fileType}`,
          fileType,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Analysis failed");
      }

      onAnalyzed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  const sampleCSV = `id,name,email,signup_date,balance
10231,Maria Chen,m.chen@example.com,2025-02-11,482.10
10232,Ahmed Raza,a.raza@example.com,2025-03-04,129.55
10233,Sofia Ivanova,s.ivanova@example.com,2025-01-27,918.42`;

  const sampleJSON = `{
  "customers": [
    {"customer_id": 1, "name": "Maria Chen", "email": "m.chen@example.com"},
    {"customer_id": 2, "name": "Ahmed Raza", "email": "a.raza@example.com"}
  ],
  "orders": [
    {"order_id": 101, "customer_id": 1, "order_date": "2025-03-01", "total": 150.00},
    {"order_id": 102, "customer_id": 2, "order_date": "2025-03-02", "total": 89.99}
  ]
}`;

  const sampleSQL = `CREATE TABLE customers (
  customer_id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  order_id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  order_date DATE NOT NULL,
  total DECIMAL(10,2),
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);`;

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-black mb-1"><span className="gradient-text">Provide</span> Input</h2>
      <p className="text-[var(--text-secondary)] mb-6">
        Upload a file or paste data. We'll analyze the structure automatically.
      </p>

      <div className="glass card-3d spotlight rounded-2xl p-6 mb-4 animate-fade-up">
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 border border-[var(--border)] rounded-lg hover:bg-gray-50 text-sm font-medium"
          >
            Upload File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,.sql,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />

          <select
            value={fileType}
            onChange={(e) => setFileType(e.target.value as typeof fileType)}
            className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
            <option value="sql">SQL Schema</option>
            <option value="txt">Text</option>
          </select>

          {fileName && (
            <span className="px-3 py-2 bg-[var(--accent-light)] text-[var(--accent)] rounded-lg text-sm">
              {fileName}
            </span>
          )}
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste your CSV, JSON, or SQL schema here..."
          className="w-full h-64 px-4 py-3 border border-[var(--border)] rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
        />
      </div>

      <div className="glass rounded-2xl p-4 mb-6 animate-fade-up delay-2">
        <p className="text-sm font-medium mb-3">Quick samples:</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setContent(sampleCSV); setFileType("csv"); setFileName("sample.csv"); }}
            className="chip-3d px-3 py-1.5 rounded-full text-xs font-semibold hover:-translate-y-0.5 transition-transform"
          >
            📊 Sample CSV
          </button>
          <button
            onClick={() => { setContent(sampleJSON); setFileType("json"); setFileName("sample.json"); }}
            className="chip-3d px-3 py-1.5 rounded-full text-xs font-semibold hover:-translate-y-0.5 transition-transform"
          >
            🔗 Sample JSON (Relational)
          </button>
          <button
            onClick={() => { setContent(sampleSQL); setFileType("sql"); setFileName("schema.sql"); }}
            className="chip-3d px-3 py-1.5 rounded-full text-xs font-semibold hover:-translate-y-0.5 transition-transform"
          >
            🗃️ Sample SQL Schema
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleAnalyze}
        disabled={loading || !content.trim()}
        className="btn-3d w-full px-6 py-3.5 disabled:opacity-50 font-bold text-lg"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Analyzing with AI...
          </span>
        ) : (
          "Analyze Input"
        )}
      </button>
    </div>
  );
}
