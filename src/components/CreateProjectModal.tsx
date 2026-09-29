"use client";

import { useState } from "react";
import { Project } from "@/types";

interface Props {
  onCreated: (project: Project) => void;
  onClose: () => void;
}
export default function CreateProjectModal({ onCreated, onClose }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dataType, setDataType] = useState<"tabular" | "relational" | "document">("tabular");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, data_type: dataType }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to create project");
      }
      onCreated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 animate-fade-up" onClick={onClose}>
      <div className="tilt-scene" onClick={(e) => e.stopPropagation()}>
        <div className="glass card-3d rounded-3xl p-6 w-full max-w-md animate-scale-in glow-accent">
        <h2 className="text-xl font-black mb-4"><span className="gradient-text">Create</span> Project</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Synthetic Dataset"
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this dataset for?"
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)] h-20 resize-none"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Data Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(["tabular", "relational", "document"] as const).map((type, i) => {
                const active = dataType === type;
                const icon = type === "tabular" ? "📊" : type === "relational" ? "🔗" : "📄";
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setDataType(type)}
                    style={{
                      animationDelay: `${i * 0.08}s`,
                      ...(active ? { background: "linear-gradient(135deg, var(--accent-light), rgba(99,102,241,0.15))" } : {}),
                    }}
                    className={`animate-bounce-in p-3 rounded-2xl border-2 text-center transition-all duration-300 ${
                      active
                        ? "border-[var(--accent)] scale-110 shadow-lg glow-accent"
                        : "border-[var(--border)] hover:border-[var(--accent)] hover:-translate-y-1"
                    }`}
                  >
                    <div className="text-2xl mb-1">{icon}</div>
                    <div className="text-sm font-bold capitalize">{type}</div>
                    <div className="text-xs text-[var(--text-secondary)] mt-1">
                      {type === "tabular" && "CSV / Table"}
                      {type === "relational" && "Multi-table"}
                      {type === "document" && "Invoices / Docs"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="mb-4 text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="btn-3d flex-1 px-4 py-2.5 disabled:opacity-50 font-bold"
            >
              {loading ? "Creating..." : "Create ✨"}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
