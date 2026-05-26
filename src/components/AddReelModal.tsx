"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Link as LinkIcon,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Instagram } from "@/components/icons";

interface AddReelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}

export default function AddReelModal({
  isOpen,
  onClose,
  onAdded,
}: AddReelModalProps) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/reels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), caption: caption.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(() => {
          onAdded();
          setUrl("");
          setCaption("");
          setSuccess(false);
          onClose();
        }, 1000);
      } else {
        setError(data.error || "Erro ao adicionar Reel");
      }
    } catch {
      setError("Erro de conexão com o servidor");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="w-full max-w-md rounded-2xl p-6"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--surface-border)",
                boxShadow: "var(--shadow-lg)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "var(--instagram-bg)" }}
                  >
                    <Instagram className="w-5 h-5" style={{ color: "var(--instagram)" }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Adicionar Reel</h3>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Cole a URL do Instagram Reel
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* URL */}
                <div>
                  <label className="label">URL do Reel</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <LinkIcon className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                    </div>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://www.instagram.com/reel/..."
                      className="input input-with-icon"
                      required
                    />
                  </div>
                </div>

                {/* Caption */}
                <div>
                  <label className="label">Legenda personalizada (opcional)</label>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Deixe vazio para usar a legenda original..."
                    rows={3}
                    className="input"
                    style={{ resize: "vertical", minHeight: "80px" }}
                  />
                </div>

                {/* Error */}
                {error && (
                  <div
                    className="flex items-center gap-2 text-xs p-3 rounded-lg"
                    style={{
                      background: "var(--danger-bg)",
                      color: "var(--danger)",
                      border: "1px solid rgba(239,68,68,0.2)",
                    }}
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                {/* Success */}
                {success && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-xs p-3 rounded-lg"
                    style={{
                      background: "var(--success-bg)",
                      color: "var(--success)",
                      border: "1px solid rgba(34,197,94,0.2)",
                    }}
                  >
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    Reel adicionado com sucesso!
                  </motion.div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={!url.trim() || submitting}
                  className="btn btn-primary w-full"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Adicionando...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Adicionar Reel
                    </>
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
