"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  Settings,
  Save,
  Upload,
  Clock,
  Image,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Zap,
  Monitor,
} from "lucide-react";
import { Instagram, Facebook } from "@/components/icons";

import Sidebar from "@/components/Sidebar";
import type { AppSettings } from "@/types";

const POSITIONS = [
  { value: "top-left", label: "Superior Esquerdo" },
  { value: "top-right", label: "Superior Direito" },
  { value: "bottom-left", label: "Inferior Esquerdo" },
  { value: "bottom-right", label: "Inferior Direito" },
  { value: "center", label: "Centro" },
];

const CRON_PRESETS = [
  { value: "*/15 * * * *", label: "A cada 15 minutos" },
  { value: "*/30 * * * *", label: "A cada 30 minutos" },
  { value: "0 * * * *", label: "A cada 1 hora" },
  { value: "0 */3 * * *", label: "A cada 3 horas" },
  { value: "0 */6 * * *", label: "A cada 6 horas" },
  { value: "0 0 * * *", label: "Uma vez por dia (meia-noite)" },
];

const DEFAULT_SETTINGS: AppSettings = {
  logo_position: "bottom-right",
  logo_scale: 80,
  cron_schedule: "*/30 * * * *",
  max_reels_per_run: 5,
  auto_publish: true,
  custom_caption_template: "",
  instagram_enabled: true,
  facebook_enabled: true,
};

export default function SettingsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success && data.data) {
        setSettings({ ...DEFAULT_SETTINGS, ...data.data });
      }
    } catch {
      // use defaults
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSettings();
    // Check if logo exists
    fetch("/logos/logo.png", { method: "HEAD" })
      .then((res) => {
        if (res.ok) setLogoPreview("/logos/logo.png");
      })
      .catch(() => {});
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(data.error || "Erro ao salvar");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    const formData = new FormData();
    formData.append("logo", file);

    try {
      const res = await fetch("/api/upload-logo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setLogoPreview(data.data.path + "?t=" + Date.now());
      }
    } catch {
      setError("Erro ao enviar logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="app-layout">
      <div className="ambient-bg" />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
      />

      <main className={`main-area relative z-10 ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="topbar">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5" style={{ color: "var(--brand-purple)" }} />
            <h2 className="text-lg font-bold text-white">Configurações</h2>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary btn-sm"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? "Salvo!" : "Salvar"}
          </button>
        </div>

        <div className="p-6 max-w-4xl space-y-6">
          {/* Error */}
          {error && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg text-sm"
              style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* ── Logo Section ────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--brand-gradient-subtle)" }}>
                <Image className="w-5 h-5" style={{ color: "var(--brand-purple)" }} />
              </div>
              <div>
                <h3 className="font-bold text-white">Logo / Marca d&apos;água</h3>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Será aplicada em todos os vídeos processados
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Logo preview & upload */}
              <div>
                <div
                  className="w-full aspect-video rounded-xl flex items-center justify-center mb-3 cursor-pointer overflow-hidden"
                  style={{ background: "var(--surface-2)", border: "2px dashed var(--surface-border)" }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="max-w-full max-h-full object-contain p-4" />
                  ) : (
                    <div className="text-center">
                      <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Clique para enviar logo (PNG)
                      </p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/webp"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="btn btn-secondary btn-sm w-full"
                >
                  {uploadingLogo ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {logoPreview ? "Trocar Logo" : "Enviar Logo"}
                </button>
              </div>

              {/* Logo settings */}
              <div className="space-y-4">
                <div>
                  <label className="label">Posição da Logo</label>
                  <select
                    value={settings.logo_position}
                    onChange={(e) => updateSetting("logo_position", e.target.value as AppSettings["logo_position"])}
                    className="select"
                  >
                    {POSITIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Tamanho da Logo (px largura)</label>
                  <input
                    type="range"
                    min={30}
                    max={200}
                    value={settings.logo_scale}
                    onChange={(e) => updateSetting("logo_scale", Number(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                  <p className="text-xs text-right mt-1" style={{ color: "var(--text-muted)" }}>
                    {settings.logo_scale}px
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Schedule Section ─────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--warning-bg)" }}>
                <Clock className="w-5 h-5" style={{ color: "var(--warning)" }} />
              </div>
              <div>
                <h3 className="font-bold text-white">Agendamento</h3>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Frequência de verificação e processamento
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Frequência</label>
                <select
                  value={settings.cron_schedule}
                  onChange={(e) => updateSetting("cron_schedule", e.target.value)}
                  className="select"
                >
                  {CRON_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Máximo de Reels por execução</label>
                <input
                  type="number"
                  min={1}
                  max={25}
                  value={settings.max_reels_per_run}
                  onChange={(e) => updateSetting("max_reels_per_run", Number(e.target.value))}
                  className="input"
                />
              </div>
            </div>

            {/* Auto publish toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
              <div className="flex items-center gap-3">
                <Zap className="w-4 h-4" style={{ color: "var(--warning)" }} />
                <div>
                  <p className="text-sm font-semibold text-white">Publicação automática</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Publicar automaticamente após processamento
                  </p>
                </div>
              </div>
              <button
                onClick={() => updateSetting("auto_publish", !settings.auto_publish)}
                className="relative w-12 h-6 rounded-full transition-colors"
                style={{ background: settings.auto_publish ? "var(--success)" : "var(--surface-3)" }}
              >
                <span
                  className="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform"
                  style={{ left: settings.auto_publish ? "28px" : "4px" }}
                />
              </button>
            </div>
          </motion.div>

          {/* ── Publishing Section ───────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--instagram-bg)" }}>
                <Monitor className="w-5 h-5" style={{ color: "var(--instagram)" }} />
              </div>
              <div>
                <h3 className="font-bold text-white">Destinos de Publicação</h3>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Selecione onde os Reels serão publicados
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Instagram toggle */}
              <div
                className="flex items-center justify-between p-4 rounded-xl transition-all cursor-pointer"
                style={{
                  background: settings.instagram_enabled ? "var(--instagram-bg)" : "var(--surface-2)",
                  border: `1px solid ${settings.instagram_enabled ? "rgba(228,64,95,0.3)" : "var(--surface-border)"}`,
                }}
                onClick={() => updateSetting("instagram_enabled", !settings.instagram_enabled)}
              >
                <div className="flex items-center gap-3">
                  <Instagram className="w-5 h-5" style={{ color: settings.instagram_enabled ? "var(--instagram)" : "var(--text-muted)" }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: settings.instagram_enabled ? "white" : "var(--text-muted)" }}>
                      Instagram Reels
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Publica como Reel na sua conta
                    </p>
                  </div>
                </div>
                <div
                  className="w-10 h-5 rounded-full transition-colors"
                  style={{ background: settings.instagram_enabled ? "var(--instagram)" : "var(--surface-3)" }}
                >
                  <span
                    className="block w-3.5 h-3.5 rounded-full bg-white mt-[3px] transition-transform"
                    style={{ marginLeft: settings.instagram_enabled ? "22px" : "3px" }}
                  />
                </div>
              </div>

              {/* Facebook toggle */}
              <div
                className="flex items-center justify-between p-4 rounded-xl transition-all cursor-pointer"
                style={{
                  background: settings.facebook_enabled ? "var(--facebook-bg)" : "var(--surface-2)",
                  border: `1px solid ${settings.facebook_enabled ? "rgba(24,119,242,0.3)" : "var(--surface-border)"}`,
                }}
                onClick={() => updateSetting("facebook_enabled", !settings.facebook_enabled)}
              >
                <div className="flex items-center gap-3">
                  <Facebook className="w-5 h-5" style={{ color: settings.facebook_enabled ? "var(--facebook)" : "var(--text-muted)" }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: settings.facebook_enabled ? "white" : "var(--text-muted)" }}>
                      Facebook Page
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Publica como vídeo na sua página
                    </p>
                  </div>
                </div>
                <div
                  className="w-10 h-5 rounded-full transition-colors"
                  style={{ background: settings.facebook_enabled ? "var(--facebook)" : "var(--surface-3)" }}
                >
                  <span
                    className="block w-3.5 h-3.5 rounded-full bg-white mt-[3px] transition-transform"
                    style={{ marginLeft: settings.facebook_enabled ? "22px" : "3px" }}
                  />
                </div>
              </div>
            </div>

            {/* Caption template */}
            <div>
              <label className="label">Template de Legenda (opcional)</label>
              <textarea
                value={settings.custom_caption_template}
                onChange={(e) => updateSetting("custom_caption_template", e.target.value)}
                placeholder="Use {caption} para a legenda original e {hashtags} para hashtags..."
                rows={3}
                className="input"
                style={{ resize: "vertical", minHeight: "80px" }}
              />
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                Variáveis: {"{caption}"}, {"{hashtags}"}, {"{source}"}
              </p>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
