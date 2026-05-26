"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  RefreshCw,
  Download,
  Upload,
  Zap,
  AlertTriangle,
  BarChart3,
  Play,
  Clock,
  Loader2,
  CheckCircle2,
  Filter,
  Search,
} from "lucide-react";
import { Instagram, Facebook } from "@/components/icons";

import Sidebar from "@/components/Sidebar";
import StatCard from "@/components/StatCard";
import ReelCard from "@/components/ReelCard";
import AddReelModal from "@/components/AddReelModal";
import type { Reel, DashboardStats, SchedulerStatus, ReelStage } from "@/types";

const STAGE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "discovered", label: "Descobertos" },
  { value: "downloading", label: "Baixando" },
  { value: "processing", label: "Processando" },
  { value: "uploaded", label: "Prontos" },
  { value: "published", label: "Publicados" },
  { value: "error", label: "Erros" },
];

export default function Dashboard() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [reels, setReels] = useState<Reel[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [stageFilter, setStageFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [triggeringRun, setTriggeringRun] = useState(false);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [reelsRes, statsRes, schedulerRes] = await Promise.allSettled([
        fetch(`/api/reels?limit=50${stageFilter !== "all" ? `&stage=${stageFilter}` : ""}`),
        fetch("/api/stats"),
        fetch("/api/scheduler"),
      ]);

      if (reelsRes.status === "fulfilled" && reelsRes.value.ok) {
        const data = await reelsRes.value.json();
        if (data.success) setReels(data.data?.reels || []);
      }

      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        const data = await statsRes.value.json();
        if (data.success) setStats(data.data);
      }

      if (schedulerRes.status === "fulfilled" && schedulerRes.value.ok) {
        const data = await schedulerRes.value.json();
        if (data.success) setSchedulerStatus(data.data);
      }
    } catch {
      // ignore network errors
    } finally {
      setLoading(false);
    }
  }, [stageFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Actions
  const handleRunNow = async () => {
    setTriggeringRun(true);
    try {
      await fetch("/api/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run-now" }),
      });
      setTimeout(fetchData, 2000);
    } catch {
      // ignore
    } finally {
      setTriggeringRun(false);
    }
  };

  const handlePublish = async (reelId: number) => {
    try {
      await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reelId, targets: ["instagram", "facebook"] }),
      });
      setTimeout(fetchData, 2000);
    } catch {
      // ignore
    }
  };

  const handleReprocess = async (reelId: number) => {
    try {
      // Otimisticamente define o estágio como 'discovered' (Descoberto) na interface
      setReels((prev) =>
        prev.map((r) =>
          r.id === reelId ? { ...r, stage: "discovered" as const, error_message: null } : r
        )
      );

      await fetch("/api/reels/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reelId }),
      });
      setTimeout(fetchData, 1000);
    } catch (error) {
      console.error("Erro ao reprocessar:", error);
    }
  };

  const handleDelete = async (reelId: number) => {
    try {
      // Otimisticamente remove o Reel da UI
      setReels((prev) => prev.filter((r) => r.id !== reelId));

      await fetch(`/api/reels?id=${reelId}`, {
        method: "DELETE",
      });
      fetchData(); // Recarrega dados reais e estatísticas
    } catch (error) {
      console.error("Erro ao excluir reel:", error);
    }
  };

  // Filter reels
  const filteredReels = reels.filter((r) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.caption?.toLowerCase().includes(q) ||
        r.source_username?.toLowerCase().includes(q) ||
        r.original_caption?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="app-layout">
      {/* Ambient background */}
      <div className="ambient-bg" />

      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
      />

      {/* Main Area */}
      <main className={`main-area relative z-10 ${sidebarCollapsed ? "collapsed" : ""}`}>
        {/* TopBar */}
        <div className="topbar">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white">Dashboard</h2>
            {schedulerStatus && (
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    schedulerStatus.is_running ? "animate-pulse" : ""
                  }`}
                  style={{
                    background: schedulerStatus.is_running
                      ? "var(--success)"
                      : "var(--text-muted)",
                  }}
                />
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Scheduler {schedulerStatus.is_running ? "ativo" : "inativo"}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunNow}
              disabled={triggeringRun}
              className="btn btn-secondary btn-sm"
            >
              {triggeringRun ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Rodar Agora
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn btn-primary btn-sm"
            >
              <Plus className="w-4 h-4" />
              Adicionar Reel
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Reels Hoje"
              value={stats?.published_today || 0}
              icon={<Instagram className="w-5 h-5" />}
              color="var(--instagram)"
              gradient="linear-gradient(90deg, var(--instagram), var(--brand-orange))"
            />
            <StatCard
              label="Total Publicados"
              value={stats?.published_total || 0}
              icon={<CheckCircle2 className="w-5 h-5" />}
              color="var(--success)"
              gradient="linear-gradient(90deg, var(--success), #10b981)"
            />
            <StatCard
              label="Na Fila"
              value={stats?.pipeline_queue || 0}
              icon={<Clock className="w-5 h-5" />}
              color="var(--warning)"
              gradient="linear-gradient(90deg, var(--warning), var(--brand-orange))"
            />
            <StatCard
              label="Erros Hoje"
              value={stats?.errors_today || 0}
              icon={<AlertTriangle className="w-5 h-5" />}
              color="var(--danger)"
              gradient="linear-gradient(90deg, var(--danger), #dc2626)"
            />
          </div>

          {/* Filter Bar */}
          <div
            className="flex flex-wrap items-center gap-3 p-4 rounded-xl"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--surface-border)",
            }}
          >
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por legenda ou username..."
                className="input input-with-icon"
                style={{ background: "var(--surface-2)" }}
              />
            </div>

            {/* Stage filters */}
            <div className="flex items-center gap-1">
              <Filter className="w-4 h-4 mr-1" style={{ color: "var(--text-muted)" }} />
              {STAGE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStageFilter(f.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background:
                      stageFilter === f.value
                        ? "var(--brand-gradient-subtle)"
                        : "transparent",
                    color:
                      stageFilter === f.value
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
                    border:
                      stageFilter === f.value
                        ? "1px solid rgba(124,58,237,0.3)"
                        : "1px solid transparent",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={fetchData}
              className="btn btn-secondary btn-sm"
              title="Atualizar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Reels Grid */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2
                className="w-8 h-8 animate-spin mb-3"
                style={{ color: "var(--brand-purple)" }}
              />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Carregando...
              </p>
            </div>
          ) : filteredReels.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              >
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--surface-border)",
                  }}
                >
                  <Zap
                    className="w-10 h-10"
                    style={{ color: "var(--text-muted)" }}
                  />
                </div>
              </motion.div>
              <h3 className="text-lg font-bold text-white mb-2">
                Nenhum Reel encontrado
              </h3>
              <p
                className="text-sm max-w-sm mb-4"
                style={{ color: "var(--text-muted)" }}
              >
                Adicione perfis de origem na aba{" "}
                <strong>Fontes</strong> ou adicione Reels manualmente.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="btn btn-primary"
              >
                <Plus className="w-4 h-4" />
                Adicionar Reel
              </button>
            </motion.div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              <AnimatePresence>
                {filteredReels.map((reel) => (
                  <ReelCard
                    key={reel.id}
                    reel={reel}
                    onPublish={handlePublish}
                    onReprocess={handleReprocess}
                    onDelete={handleDelete}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Footer stats */}
          <div
            className="flex items-center justify-between text-xs p-3 rounded-lg"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--surface-border)",
              color: "var(--text-muted)",
            }}
          >
            <span>
              {filteredReels.length} reel{filteredReels.length !== 1 ? "s" : ""} exibido{filteredReels.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }} />
                {stats?.active_sources || 0} fontes ativas
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Atualização a cada 30 min
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Add Reel Modal */}
      <AddReelModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdded={fetchData}
      />
    </div>
  );
}
