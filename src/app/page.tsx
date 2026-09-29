"use client";

import { useState, useEffect } from "react";
import { Project } from "@/types";
import Sidebar from "@/components/Sidebar";
import CreateProjectModal from "@/components/CreateProjectModal";
import InputUpload from "@/components/InputUpload";
import SchemaReview from "@/components/SchemaReview";
import ConfigPanel from "@/components/ConfigPanel";
import GeneratePanel from "@/components/GeneratePanel";
import PreviewPanel from "@/components/PreviewPanel";

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "schema" | "config" | "generate" | "preview">("upload");

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (Array.isArray(data)) {
        setProjects(data);
      } else {
        setProjects([]);
      }
    } catch (e) {
      console.error("Failed to fetch projects:", e);
      setProjects([]);
    }
  }

  async function handleProjectCreated(project: Project) {
    setProjects((prev) => [project, ...prev]);
    setSelectedProject(project);
    setShowCreateModal(false);
    setActiveTab("upload");
  }

  async function fetchProject(project: Project): Promise<Project | null> {
    try {
      const res = await fetch(`/api/projects/${project.id}`);
      if (!res.ok) {
        console.warn(`Failed to refresh project ${project.id}: HTTP ${res.status}`);
        return project;
      }
      const freshProject = await res.json();
      if (!freshProject || !freshProject.id) {
        return project;
      }
      setSelectedProject(freshProject);
      return freshProject;
    } catch (err) {
      console.warn("Network error refreshing project:", err);
      return project;
    }
  }

  async function handleSelectProject(project: Project) {
    const freshProject = await fetchProject(project);
    if (!freshProject) return;

    const status = freshProject.status || "draft";
    if (["completed", "completed_with_warnings", "failed"].includes(status)) setActiveTab("preview");
    else if (status === "configured") setActiveTab("config");
    else if (status === "analyzing" && freshProject.data_type === "document") setActiveTab("config");
    else setActiveTab("upload");
  }

  async function handleDeleteProject(project: Project) {
    if (!confirm(`Are you sure you want to delete "${project.name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== project.id));
        if (selectedProject?.id === project.id) {
          setSelectedProject(null);
        }
        try {
          window.sessionStorage.removeItem(`hackdata:upload:${project.id}`);
        } catch {
          // sessionStorage unavailable — nothing to clean up.
        }
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete project");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete project");
    }
  }

  function refreshProject() {
    if (selectedProject) fetchProject(selectedProject);
  }

  const s = selectedProject?.status || "";
  const isDocument = selectedProject?.data_type === "document";
  const finishedGeneration = ["completed", "completed_with_warnings", "failed"].includes(s);
  const allSteps = [
    { key: "upload" as const, label: "1. Input", enabled: true },
    { key: "schema" as const, label: "2. Schema", enabled: s !== "" && s !== "draft" },
    { key: "config" as const, label: "3. Configure", enabled: ["configured", "generating"].includes(s) || finishedGeneration },
    { key: "generate" as const, label: "4. Generate", enabled: s === "configured" || finishedGeneration },
    { key: "preview" as const, label: "5. Preview", enabled: finishedGeneration },
  ];
  const steps = (isDocument ? allSteps.filter((step) => step.key !== "schema") : allSteps).map((step, i) => ({
    ...step,
    label: `${i + 1}. ${step.label.replace(/^\d+\.\s*/, "")}`,
  }));

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        projects={projects}
        selectedProject={selectedProject}
        onSelect={handleSelectProject}
        onCreateNew={() => setShowCreateModal(true)}
        onDelete={handleDeleteProject}
        onHome={() => setSelectedProject(null)}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-black/10 dark:border-white/10 glass shrink-0 z-20">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 -ml-1 rounded-xl text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title="Open projects menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => setSelectedProject(null)}
            className="flex items-center gap-1.5 font-black text-sm hover:opacity-85 transition-opacity"
            title="Go to Home / Overview"
          >
            <span className="gradient-text">HackData</span>
            <span className="text-[var(--text-primary)]">V2</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="btn-3d px-3 py-1.5 text-xs font-bold"
          >
            + New
          </button>
        </div>

        {selectedProject ? (
          <>
            <header className="glass border-0 border-b border-[var(--glass-border)] px-4 sm:px-6 py-3 sm:py-4 z-10 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
                <div className="animate-fade-up min-w-0 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedProject(null)}
                    title="Return to Home / Overview"
                    className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-white hover:bg-[var(--accent)] hover:border-transparent border border-black/10 dark:border-white/10 transition-all duration-200 flex items-center gap-1.5 shrink-0 shadow-sm"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span>Home</span>
                  </button>
                  <div className="min-w-0">
                    <h1 className="text-lg sm:text-xl font-black tracking-tight truncate">{selectedProject.name}</h1>
                    {selectedProject.description && (
                      <p className="text-xs sm:text-sm text-[var(--text-secondary)] line-clamp-1">{selectedProject.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(selectedProject)}
                    title="Delete this project"
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-all duration-200 flex items-center gap-1"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Delete
                  </button>
                  <StatusBadge status={selectedProject.status} />
                </div>
              </div>
              <nav className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none">
                {steps.map((step, i) => {
                  const active = activeTab === step.key;
                  return (
                    <button
                      key={step.key}
                      onClick={() => step.enabled && setActiveTab(step.key)}
                      disabled={!step.enabled}
                      style={{
                        animationDelay: `${i * 0.06}s`,
                        ...(active
                          ? { background: "linear-gradient(120deg, var(--accent), var(--accent-2))" }
                          : {}),
                      }}
                      className={`underline-sweep ${active ? "active" : ""} animate-fade-up px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-xl font-semibold transition-all duration-300 whitespace-nowrap shrink-0 ${
                        active
                          ? "text-white scale-105 shadow-xl glow-accent"
                          : step.enabled
                          ? "bg-[var(--accent-light)] text-[var(--accent)] hover:-translate-y-0.5 hover:shadow-md hover:scale-105"
                          : "bg-gray-500/10 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {step.label}
                    </button>
                  );
                })}
              </nav>
            </header>

            <div key={activeTab} className="animate-fade-up flex-1 overflow-auto p-4 sm:p-6 tilt-scene min-w-0">
              {activeTab === "upload" && (
                <InputUpload
                  project={selectedProject}
                  onAnalyzed={async () => {
                    const fresh = await fetchProject(selectedProject);
                    setActiveTab(fresh?.data_type === "document" ? "config" : "schema");
                  }}
                />
              )}
              {activeTab === "schema" && (
                <SchemaReview
                  projectId={selectedProject.id}
                  onConfirmed={() => {
                    refreshProject();
                    setActiveTab("config");
                  }}
                />
              )}
              {activeTab === "config" && (
                <ConfigPanel
                  projectId={selectedProject.id}
                  dataType={selectedProject.data_type}
                  onSaved={() => setActiveTab("generate")}
                />
              )}
              {activeTab === "generate" && (
                <GeneratePanel
                  projectId={selectedProject.id}
                  onGenerated={() => {
                    refreshProject();
                    setActiveTab("preview");
                  }}
                />
              )}
              {activeTab === "preview" && (
                <PreviewPanel projectId={selectedProject.id} />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center tilt-scene relative overflow-hidden">
            <div className="orb orb-a" style={{ width: 320, height: 320, top: "10%", left: "12%" }} />
            <div className="orb orb-b" style={{ width: 280, height: 280, bottom: "8%", right: "10%" }} />
            <div className="orb orb-c" style={{ width: 220, height: 220, top: "40%", right: "30%" }} />

            <div className="text-center animate-scale-in relative z-10">
              <div className="mb-8 flex justify-center">
                <div className="grad-border rounded-3xl">
                  <div className="animate-tilt animate-float card-3d glass rounded-3xl p-8 glow-accent">
                    <svg width="104" height="104" viewBox="0 0 80 80" fill="none" className="mx-auto drop-shadow-lg">
                      <defs>
                        <linearGradient id="heroGrad" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
                          <stop stopColor="var(--accent)" />
                          <stop offset="0.5" stopColor="var(--accent-2)" />
                          <stop offset="1" stopColor="var(--accent-3)" />
                        </linearGradient>
                      </defs>
                      <rect width="80" height="80" rx="20" fill="url(#heroGrad)" opacity="0.18" />
                      <rect x="6" y="6" width="68" height="68" rx="16" stroke="url(#heroGrad)" strokeWidth="1.5" opacity="0.4" fill="none" />
                      <path d="M22 26h36M22 40h28M22 54h32" stroke="url(#heroGrad)" strokeWidth="4.5" strokeLinecap="round" />
                      <circle cx="64" cy="26" r="3.5" fill="var(--accent)" className="animate-pulse" />
                      <circle cx="56" cy="40" r="3" fill="var(--accent-2)" className="animate-pulse" />
                      <circle cx="60" cy="54" r="3" fill="var(--accent-3)" className="animate-pulse" />
                    </svg>
                  </div>
                </div>
              </div>
              <h2 className="text-3xl sm:text-5xl font-black mb-3 tracking-tight tilt-scene px-2">
                <span className="gradient-text">Synthetic Data</span>{" "}
                <span className="gradient-text-2 animate-wobble">Platform</span>
              </h2>
              <p className="text-[var(--text-secondary)] mb-6 sm:mb-8 max-w-md mx-auto text-sm sm:text-base px-4">
                Generate realistic, privacy-safe tabular, relational and document data — on demand.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-6 sm:mb-8 px-2">
                <FeaturePill label="Tabular" color="var(--accent)" delay={0.1} />
                <FeaturePill label="Relational" color="var(--accent-2)" delay={0.2} />
                <FeaturePill label="Documents" color="var(--accent-3)" delay={0.3} />
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-3d px-6 sm:px-10 py-3 sm:py-4 font-bold text-base sm:text-lg animate-pulse-glow"
              >
                Create Project ✨
              </button>
            </div>
          </div>
        )}
      </main>

      {showCreateModal && (
        <CreateProjectModal
          onCreated={handleProjectCreated}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

function FeaturePill({ label, color, delay }: { label: string; color: string; delay: number }) {
  return (
    <span
      className="animate-bounce-in glass px-4 py-1.5 rounded-full text-sm font-semibold border"
      style={{
        animationDelay: `${delay}s`,
        borderColor: color,
        color,
        boxShadow: `0 4px 12px ${color}33`,
      }}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  const safeStatus = (status || "draft").toLowerCase();
  const colors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    analyzing: "bg-blue-100 text-blue-700",
    configured: "bg-yellow-100 text-yellow-700",
    generating: "bg-purple-100 text-purple-700",
    completed: "bg-green-100 text-green-700",
    completed_with_warnings: "bg-amber-100 text-amber-800",
    failed: "bg-red-100 text-red-700",
    error: "bg-red-100 text-red-700",
  };

  const labels: Record<string, string> = {
    completed_with_warnings: "Completed with warnings",
    draft: "Draft",
    analyzing: "Analyzing",
    configured: "Configured",
    generating: "Generating",
    completed: "Completed",
    failed: "Failed",
    error: "Error",
  };

  const pulse = safeStatus === "generating" || safeStatus === "analyzing" ? "animate-pulse" : "";
  const label = labels[safeStatus] || (safeStatus ? safeStatus.charAt(0).toUpperCase() + safeStatus.slice(1) : "Draft");
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold border border-white/20 backdrop-blur-sm ${colors[safeStatus] || colors.draft} ${pulse}`}>
      {label}
    </span>
  );
}

