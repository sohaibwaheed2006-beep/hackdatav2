"use client";

import { useState } from "react";

interface Props {
  projectId: string;
  onGenerated: () => void;
}

export default function GeneratePanel({ projectId, onGenerated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  async function handleGenerate() {
    if (!projectId) {
      setError("No project selected. Pick a project from the sidebar first.");
      return;
    }

    setLoading(true);
    setError("");
    setProgress("Starting generation...");

    try {
      setProgress("Generating AI content & synthetic data...");

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      let data: { error?: string; status?: string } = {};
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(
            data.error || "Project configuration not found. Please review the schema/config step and try again."
          );
        }
        throw new Error(data.error || `Generation failed (HTTP ${res.status})`);
      }

      setProgress("Done!");
      setTimeout(onGenerated, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="glass rounded-3xl p-12 border border-[var(--border)] shadow-xl animate-scale-in">
        <div className="mb-6">
          <div className="inline-block">
            <svg width="112" height="112" viewBox="0 0 80 80" fill="none" className="mx-auto drop-shadow-2xl">
              <defs>
                <linearGradient id="genGrad" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
                  <stop stopColor="var(--accent)" />
                  <stop offset="0.5" stopColor="var(--accent-2)" />
                  <stop offset="1" stopColor="var(--accent-3)" />
                </linearGradient>
              </defs>
              <circle cx="40" cy="40" r="38" fill="url(#genGrad)" opacity="0.18" />
              <circle cx="40" cy="40" r="30" stroke="url(#genGrad)" strokeWidth="1" opacity="0.4" fill="none" />
              <path d="M28 40l8 8 16-16" stroke="url(#genGrad)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <h2 className="text-3xl font-black mb-2"><span className="gradient-text">Ready</span> to Generate</h2>
        <p className="text-[var(--text-secondary)] mb-8">
          Your schema is configured. Click below to generate synthetic data using AI.
        </p>

        {progress && loading && (
          <div className="mb-6 animate-fade-up">
            <div className="flex items-center justify-center gap-3 mb-3">
              <svg className="animate-spin h-5 w-5 text-[var(--accent)]" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-[var(--accent)] font-semibold">{progress}</span>
            </div>
            <div className="h-2 rounded-full bg-black/10 overflow-hidden max-w-sm mx-auto">
              <div className="stripes h-full w-full" style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }} />
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="btn-3d px-10 py-4 disabled:opacity-50 font-bold text-lg"
        >
          {loading ? "Generating..." : "Generate Synthetic Data ⚡"}
        </button>
      </div>
    </div>
  );
}
