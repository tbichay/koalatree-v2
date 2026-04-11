"use client";

import { useState, useEffect, useCallback } from "react";

interface Task {
  id: string;
  type: string;
  status: string;
  priority: number;
  progress?: string;
  progressPct?: number;
  error?: string;
  retryCount: number;
  maxRetries: number;
  estimatedCostCents?: number;
  actualCostCents?: number;
  qualityScore?: number;
  qualityNotes?: string;
  qualityChecked: boolean;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  project?: { id: string; name: string } | null;
}

const TYPE_ICONS: Record<string, string> = {
  clip: "\uD83C\uDFAC",
  audio: "\uD83C\uDFA4",
  story: "\uD83D\uDCD6",
  screenplay: "\uD83C\uDFAC",
  portrait: "\uD83C\uDFAD",
  landscape: "\uD83C\uDFDE\uFE0F",
  "character-sheet": "\uD83D\uDC64",
  assemble: "\uD83C\uDFA5",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-400/70 bg-yellow-500/10",
  running: "text-blue-400/70 bg-blue-500/10",
  completed: "text-green-400/70 bg-green-500/10",
  failed: "text-red-400/70 bg-red-500/10",
  cancelled: "text-white/30 bg-white/5",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Wartend",
  running: "Laeuft",
  completed: "Fertig",
  failed: "Fehlgeschlagen",
  cancelled: "Abgebrochen",
};

const FILTER_OPTIONS = [
  { id: "all", label: "Alle" },
  { id: "running", label: "Laufend" },
  { id: "pending", label: "Wartend" },
  { id: "completed", label: "Fertig" },
  { id: "failed", label: "Fehler" },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const loadTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      params.set("limit", "100");
      const res = await fetch(`/api/studio/tasks?${params}`);
      const data = await res.json();
      setTasks(data.tasks || []);
      setCounts(data.counts || {});
    } catch { /* */ }
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Poll every 5 seconds if there are running tasks
  useEffect(() => {
    const hasActive = tasks.some((t) => t.status === "running" || t.status === "pending");
    if (!hasActive) return;
    const interval = setInterval(loadTasks, 5000);
    return () => clearInterval(interval);
  }, [tasks, loadTasks]);

  const cancelTask = async (taskId: string) => {
    await fetch(`/api/studio/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    loadTasks();
  };

  const retryTask = async (taskId: string) => {
    await fetch(`/api/studio/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry" }),
    });
    loadTasks();
  };

  const deleteTask = async (taskId: string) => {
    await fetch(`/api/studio/tasks/${taskId}`, { method: "DELETE" });
    loadTasks();
  };

  const totalRunning = (counts.running || 0) + (counts.pending || 0);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[#f5eed6]">
          Tasks {totalRunning > 0 && <span className="text-[#d4a853] text-sm">({totalRunning} aktiv)</span>}
        </h1>
        <p className="text-[11px] text-white/30 mt-1">
          Alle AI-Generierungen — Clips, Audio, Portraits, Stories
        </p>
      </div>

      {/* Filter */}
      <div className="flex gap-1 mb-4 bg-white/5 rounded-lg p-0.5 w-fit">
        {FILTER_OPTIONS.map((f) => {
          const count = f.id === "all"
            ? Object.values(counts).reduce((a, b) => a + b, 0)
            : counts[f.id] || 0;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-md text-[10px] transition-all ${
                filter === f.id
                  ? "bg-[#d4a853]/20 text-[#d4a853]"
                  : "text-white/30 hover:text-white/50"
              }`}
            >
              {f.label} {count > 0 && <span className="text-white/20">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Task List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-4 h-4 border-2 border-[#d4a853] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-white/20 text-sm">
          <p>Keine Tasks{filter !== "all" ? ` mit Status "${STATUS_LABELS[filter]}"` : ""}.</p>
          <p className="text-[10px] mt-1">Tasks werden automatisch erstellt wenn du AI-Generierungen im Hintergrund startest.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 hover:border-white/10 transition-all"
            >
              <div className="flex items-start gap-3">
                {/* Type Icon */}
                <span className="text-lg mt-0.5">{TYPE_ICONS[task.type] || "\u25CB"}</span>

                {/* Main Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[#f5eed6]">{task.type}</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[task.status] || ""}`}>
                      {STATUS_LABELS[task.status] || task.status}
                    </span>
                    {task.qualityChecked && task.qualityScore !== null && task.qualityScore !== undefined && (
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${
                        task.qualityScore >= 70 ? "text-green-400/70 bg-green-500/10" :
                        task.qualityScore >= 40 ? "text-yellow-400/70 bg-yellow-500/10" :
                        "text-red-400/70 bg-red-500/10"
                      }`}>
                        Q: {task.qualityScore}
                      </span>
                    )}
                  </div>

                  {/* Project + Progress */}
                  <div className="flex items-center gap-2 mt-0.5">
                    {task.project && (
                      <span className="text-[9px] text-white/25">{task.project.name || "Projekt"}</span>
                    )}
                    {task.progress && (
                      <span className="text-[9px] text-white/40">{task.progress}</span>
                    )}
                  </div>

                  {/* Progress Bar */}
                  {task.status === "running" && task.progressPct !== null && task.progressPct !== undefined && (
                    <div className="mt-1.5 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#d4a853]/50 rounded-full transition-all"
                        style={{ width: `${task.progressPct}%` }}
                      />
                    </div>
                  )}

                  {/* Error */}
                  {task.error && (
                    <p className="text-[9px] text-red-400/60 mt-1 truncate">{task.error}</p>
                  )}

                  {/* Quality Notes */}
                  {task.qualityNotes && (
                    <p className="text-[9px] text-white/20 mt-0.5 truncate">{task.qualityNotes}</p>
                  )}

                  {/* Cost + Time */}
                  <div className="flex items-center gap-3 mt-1">
                    {task.actualCostCents !== null && task.actualCostCents !== undefined && task.actualCostCents > 0 && (
                      <span className="text-[8px] text-white/15">${(task.actualCostCents / 100).toFixed(2)}</span>
                    )}
                    {task.retryCount > 0 && (
                      <span className="text-[8px] text-white/15">Versuch {task.retryCount + 1}/{task.maxRetries + 1}</span>
                    )}
                    <span className="text-[8px] text-white/10">
                      {new Date(task.createdAt).toLocaleString("de", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  {(task.status === "pending" || task.status === "running") && (
                    <button
                      onClick={() => cancelTask(task.id)}
                      className="text-[8px] px-2 py-1 rounded bg-red-500/10 text-red-400/50 hover:text-red-400"
                    >
                      Abbrechen
                    </button>
                  )}
                  {(task.status === "failed" || task.status === "cancelled") && (
                    <button
                      onClick={() => retryTask(task.id)}
                      className="text-[8px] px-2 py-1 rounded bg-[#d4a853]/10 text-[#d4a853]/50 hover:text-[#d4a853]"
                    >
                      Nochmal
                    </button>
                  )}
                  {task.status !== "running" && (
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-[8px] px-2 py-1 rounded bg-white/5 text-white/20 hover:text-white/40"
                    >
                      &#x2715;
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
