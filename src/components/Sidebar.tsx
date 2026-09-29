"use client";

import { Project } from "@/types";

interface SidebarProps {
  projects: Project[];
  selectedProject: Project | null;
  onSelect: (project: Project) => void;
  onCreateNew: () => void;
  onDelete?: (project: Project) => void;
}

export default function Sidebar({ projects, selectedProject, onSelect, onCreateNew, onDelete }: SidebarProps) {
  const icons: Record<string, string> = {
    tabular: "table",
    relational: "share-2",
    document: "file-text",
  };

  return (
    <aside
      className="w-64 flex flex-col h-full border-r border-white/10 relative z-10 shrink-0"
      style={{ background: "var(--bg-sidebar)", color: "#f7efe7" }}
    >
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="tilt-scene">
            <div className="animate-spin3d w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-lg"
                 style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))", boxShadow: "var(--glow)" }}>
              H
            </div>
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none">
              <span className="gradient-text">HackData</span>
              <span className="text-white/90">V2</span>
            </h1>
            <p className="text-[10px] text-gray-400 mt-0.5 tracking-widest uppercase">Synthetic Data</p>
          </div>
        </div>
      </div>

      <div className="p-3">
        <button
          onClick={onCreateNew}
          className="btn-3d w-full px-4 py-2.5 text-sm font-bold"
        >
          + New Project
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <p className="px-2 py-2 text-xs text-[#baa89b] uppercase tracking-wider font-semibold">Projects</p>
        {projects.length === 0 ? (
          <p className="px-3 py-4 text-sm text-[#baa89b] text-center">No projects yet</p>
        ) : (
          projects.map((project, i) => {
            const active = selectedProject?.id === project.id;
            return (
              <div
                key={project.id}
                style={{ animationDelay: `${i * 0.05}s` }}
                className="animate-fade-up group relative mb-1.5 flex items-center"
              >
                <button
                  onClick={() => onSelect(project)}
                  style={{
                    ...(active
                      ? { background: "linear-gradient(120deg, var(--accent), var(--accent-2))", boxShadow: "var(--glow)" }
                      : {}),
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-300 text-sm border flex items-center gap-2.5 pr-8 ${
                    active
                      ? "text-white border-transparent scale-[1.02] shadow-lg font-semibold"
                      : "text-[#dcd1c6] border-transparent hover:text-white hover:border-white/10 hover:bg-white/10 hover:translate-x-0.5"
                  }`}
                >
                  <DataTypeIcon type={project.data_type} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{project.name}</p>
                    <p className="text-xs opacity-70 capitalize">{project.data_type}</p>
                  </div>
                </button>

                {onDelete && (
                  <button
                    type="button"
                    title={`Delete "${project.name}"`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(project);
                    }}
                    className="absolute right-2 p-1.5 rounded-lg text-[#baa89b] hover:text-red-400 hover:bg-red-500/20 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function DataTypeIcon({ type }: { type: string }) {
  if (type === "tabular") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="2" width="12" height="12" rx="1" />
        <line x1="2" y1="6" x2="14" y2="6" />
        <line x1="2" y1="10" x2="14" y2="10" />
        <line x1="6" y1="2" x2="6" y2="14" />
      </svg>
    );
  }
  if (type === "relational") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="4" cy="4" r="2" />
        <circle cx="12" cy="4" r="2" />
        <circle cx="8" cy="12" r="2" />
        <line x1="5.5" y1="5.5" x2="7" y2="10.5" />
        <line x1="10.5" y1="5.5" x2="9" y2="10.5" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="1" width="10" height="14" rx="1" />
      <line x1="5" y1="5" x2="11" y2="5" />
      <line x1="5" y1="8" x2="11" y2="8" />
      <line x1="5" y1="11" x2="9" y2="11" />
    </svg>
  );
}
