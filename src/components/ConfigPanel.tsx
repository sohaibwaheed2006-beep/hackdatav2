"use client";

import { useState, useEffect } from "react";
import { GenerationConfig, BusinessRule, DetectedSchema } from "@/types";

interface Props {
  projectId: string;
  dataType: string;
  onSaved: () => void;
}

const RULE_TYPES: BusinessRule["rule"][] = ["min", "max", "range", "pattern", "enum", "custom"];

export default function ConfigPanel({ projectId, dataType, onSaved }: Props) {
  const [config, setConfig] = useState<GenerationConfig | null>(null);
  const [fieldNames, setFieldNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
    fetchFields();
  }, [projectId]);

  async function fetchConfig() {
    setLoading(true);
    const res = await fetch(`/api/config/${projectId}`);
    const data = await res.json();
    setConfig({ ...data, business_rules: data.business_rules || [] });
    setLoading(false);
  }

  async function fetchFields() {
    try {
      const res = await fetch(`/api/schemas/${projectId}`);
      const data = await res.json();
      const names = new Set<string>();
      (data.schemas || []).forEach((s: DetectedSchema) =>
        s.columns.forEach((c) => names.add(c.name))
      );
      setFieldNames(Array.from(names));
    } catch {
      setFieldNames([]);
    }
  }

  function addRule() {
    if (!config) return;
    const field = fieldNames[0] || "";
    setConfig({
      ...config,
      business_rules: [...(config.business_rules || []), { field, rule: "min", value: "" }],
    });
  }

  function updateRule(idx: number, patch: Partial<BusinessRule>) {
    if (!config) return;
    const rules = [...(config.business_rules || [])];
    rules[idx] = { ...rules[idx], ...patch };
    setConfig({ ...config, business_rules: rules });
  }

  function removeRule(idx: number) {
    if (!config) return;
    const rules = (config.business_rules || []).filter((_, i) => i !== idx);
    setConfig({ ...config, business_rules: rules });
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    await fetch(`/api/config/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        row_count: config.row_count,
        random_seed: config.random_seed,
        locale: config.locale,
        currency: config.currency,
        null_rate: config.null_rate,
        outlier_rate: config.outlier_rate,
        privacy_level: config.privacy_level,
        document_type: config.document_type,
        business_rules: config.business_rules,
      }),
    });
    setSaving(false);
    onSaved();
  }

  if (loading || !config) {
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
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-black mb-1"><span className="gradient-text">Generation</span> Configuration</h2>
      <p className="text-[var(--text-secondary)] mb-6">
        Customize how your synthetic data is generated.
      </p>

      <div className="glass card-3d spotlight rounded-2xl p-6 space-y-6 animate-fade-up">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Row Count</label>
            <input
              type="number"
              min={1}
              max={10000}
              value={config.row_count}
              onChange={(e) => setConfig({ ...config, row_count: parseInt(e.target.value) || 100 })}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Random Seed (optional)</label>
            <input
              type="number"
              value={config.random_seed ?? ""}
              onChange={(e) => setConfig({ ...config, random_seed: e.target.value ? parseInt(e.target.value) : null })}
              placeholder="Auto"
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Locale</label>
            <select
              value={config.locale}
              onChange={(e) => setConfig({ ...config, locale: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg"
            >
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="de-DE">German</option>
              <option value="fr-FR">French</option>
              <option value="es-ES">Spanish</option>
              <option value="ja-JP">Japanese</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Currency</label>
            <select
              value={config.currency}
              onChange={(e) => setConfig({ ...config, currency: e.target.value })}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="JPY">JPY</option>
              <option value="CAD">CAD</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Null Rate: {(config.null_rate * 100).toFixed(0)}%</label>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={config.null_rate}
            onChange={(e) => setConfig({ ...config, null_rate: parseFloat(e.target.value) })}
            className="w-full accent-[var(--accent)]"
          />
          <div className="flex justify-between text-xs text-[var(--text-secondary)]">
            <span>0%</span>
            <span>50%</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Outlier Rate: {(config.outlier_rate * 100).toFixed(0)}%</label>
          <input
            type="range"
            min={0}
            max={0.2}
            step={0.01}
            value={config.outlier_rate}
            onChange={(e) => setConfig({ ...config, outlier_rate: parseFloat(e.target.value) })}
            className="w-full accent-[var(--accent)]"
          />
          <div className="flex justify-between text-xs text-[var(--text-secondary)]">
            <span>0%</span>
            <span>20%</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Privacy Level</label>
          <div className="grid grid-cols-4 gap-2">
            {(["none", "low", "medium", "high"] as const).map((level, i) => {
              const active = config.privacy_level === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => setConfig({ ...config, privacy_level: level })}
                  style={{
                    animationDelay: `${i * 0.05}s`,
                    ...(active ? { background: "linear-gradient(135deg, var(--accent), var(--accent-2))" } : {}),
                  }}
                  className={`animate-fade-up py-2.5 rounded-xl text-sm font-bold transition-all duration-300 capitalize ${
                    active
                      ? "text-white scale-110 shadow-lg glow-accent"
                      : "bg-white/60 dark:bg-white/5 text-gray-600 hover:-translate-y-0.5 hover:shadow-md border border-white/40"
                  }`}
                >
                  {level}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-2">
            {config.privacy_level === "none" && "No masking applied"}
            {config.privacy_level === "low" && "Emails partially masked"}
            {config.privacy_level === "medium" && "Emails and phones masked"}
            {config.privacy_level === "high" && "All PII fields masked"}
          </p>
        </div>

        {dataType === "document" && (
          <div>
            <label className="block text-sm font-medium mb-2">Document Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(["invoice", "bank_statement"] as const).map((type) => {
                const active = config.document_type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setConfig({ ...config, document_type: type })}
                    style={active ? { background: "linear-gradient(135deg, var(--accent), var(--accent-2))" } : {}}
                    className={`py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                      active
                        ? "text-white scale-105 shadow-lg glow-accent"
                        : "bg-white/60 text-gray-600 hover:-translate-y-0.5 hover:shadow-md border border-white/40"
                    }`}
                  >
                    {type === "invoice" ? "🧾 Invoices" : "🏦 Bank Statements"}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {dataType !== "document" && (
          <div className="pt-2 border-t border-[var(--border)]">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium">Business Rules</label>
              <button
                type="button"
                onClick={addRule}
                disabled={fieldNames.length === 0}
                className="px-3 py-1 text-xs bg-[var(--accent-light)] text-[var(--accent)] rounded-lg hover:bg-teal-100 disabled:opacity-50 font-medium"
              >
                + Add Rule
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              Constrain generated values. e.g. <span className="font-mono">age</span> min <span className="font-mono">18</span>, or <span className="font-mono">price</span> range <span className="font-mono">10,500</span>.
            </p>
            {(config.business_rules || []).length === 0 && (
              <p className="text-xs text-gray-400 italic">No rules defined.</p>
            )}
            <div className="space-y-2">
              {(config.business_rules || []).map((rule, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select
                    value={rule.field}
                    onChange={(e) => updateRule(idx, { field: e.target.value })}
                    className="px-2 py-1.5 border border-[var(--border)] rounded text-sm flex-1"
                  >
                    {fieldNames.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                  <select
                    value={rule.rule}
                    onChange={(e) => updateRule(idx, { rule: e.target.value as BusinessRule["rule"] })}
                    className="px-2 py-1.5 border border-[var(--border)] rounded text-sm"
                  >
                    {RULE_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={rule.value}
                    onChange={(e) => updateRule(idx, { value: e.target.value })}
                    placeholder={rule.rule === "range" ? "min,max" : rule.rule === "enum" ? "a,b,c" : "value"}
                    className="px-2 py-1.5 border border-[var(--border)] rounded text-sm flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeRule(idx)}
                    className="px-2 py-1.5 text-red-500 hover:bg-red-50 rounded text-sm"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-3d w-full mt-4 px-6 py-3.5 disabled:opacity-50 font-bold text-lg"
      >
        {saving ? "Saving..." : "Save & Continue"}
      </button>
    </div>
  );
}
