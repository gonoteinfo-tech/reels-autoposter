"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Play,
  Clock,
  AlertCircle,
  CheckCircle2,
  Download,
  Upload,
  Loader2,
  ExternalLink,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Instagram, Facebook } from "@/components/icons";
import type { Reel, ReelStage } from "@/types";

const STAGE_CONFIG: Record<
  ReelStage,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }>; step: number }
> = {
  discovered: { label: "Descoberto", color: "var(--info)", icon: Clock, step: 0 },
  downloading: { label: "Baixando", color: "var(--warning)", icon: Download, step: 1 },
  downloaded: { label: "Baixado", color: "var(--info)", icon: CheckCircle2, step: 2 },
  processing: { label: "Processando", color: "var(--warning)", icon: Loader2, step: 3 },
  processed: { label: "Processado", color: "var(--brand-purple)", icon: CheckCircle2, step: 4 },
  uploading: { label: "Enviando", color: "var(--warning)", icon: Upload, step: 5 },
  uploaded: { label: "Enviado", color: "var(--brand-purple)", icon: CheckCircle2, step: 6 },
  publishing: { label: "Publicando", color: "var(--instagram)", icon: Instagram, step: 7 },
  published: { label: "Publicado", color: "var(--success)", icon: CheckCircle2, step: 8 },
  error: { label: "Erro", color: "var(--danger)", icon: AlertCircle, step: -1 },
};

const TOTAL_STEPS = 8;

interface ReelCardProps {
  reel: Reel;
  onPublish?: (reelId: number) => void;
  onReprocess?: (reelId: number) => void;
  onDelete?: (reelId: number) => void;
}

export default function ReelCard({ reel, onPublish, onReprocess, onDelete }: ReelCardProps) {
  const stage = STAGE_CONFIG[reel.stage] || STAGE_CONFIG.discovered;
  const StageIcon = stage.icon;
  const isAnimating = ["downloading", "processing", "uploading", "publishing"].includes(reel.stage);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="reel-card group"
    >
      {/* Thumbnail */}
      <div className="reel-card-thumbnail">
        {reel.local_path || reel.processed_path || reel.r2_url ? (
          <video
            src={reel.r2_url || (reel.processed_path ? `/api/videos?id=${reel.id}&type=processed` : reel.local_path ? `/api/videos?id=${reel.id}&type=local` : "")}
            muted
            loop
            playsInline
            onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
            onMouseLeave={(e) => {
              const v = e.target as HTMLVideoElement;
              v.pause();
              v.currentTime = 0;
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play
              className="w-10 h-10"
              style={{ color: "var(--text-muted)" }}
            />
          </div>
        )}

        {/* Hover overlay */}
        <div className="reel-card-overlay">
          <div className="flex gap-2">
            {reel.stage === "uploaded" && onPublish && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPublish(reel.id);
                  }}
                  className="btn btn-sm btn-instagram flex-1"
                >
                  <Instagram className="w-3.5 h-3.5" />
                  Instagram
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPublish(reel.id);
                  }}
                  className="btn btn-sm btn-facebook flex-1"
                >
                  <Facebook className="w-3.5 h-3.5" />
                  Facebook
                </button>
              </>
            )}
            {reel.instagram_url && (
              <a
                href={reel.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-secondary"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Duration badge */}
        {reel.duration_seconds > 0 && (
          <div
            className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold"
            style={{
              background: "rgba(0,0,0,0.7)",
              color: "white",
              backdropFilter: "blur(4px)",
            }}
          >
            {Math.floor(reel.duration_seconds / 60)}:
            {Math.floor(reel.duration_seconds % 60)
              .toString()
              .padStart(2, "0")}
          </div>
        )}

        {/* Stage indicator */}
        <div
          className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold"
          style={{
            background: "rgba(0,0,0,0.7)",
            color: stage.color,
            backdropFilter: "blur(4px)",
          }}
        >
          <StageIcon
            className={`w-3 h-3 ${isAnimating ? "animate-spin" : ""}`}
          />
          {stage.label}
        </div>
      </div>

      {/* Body */}
      <div className="reel-card-body">
        {/* Source username */}
        <p
          className="text-[11px] font-semibold mb-1"
          style={{ color: "var(--text-muted)" }}
        >
          @{reel.source_username}
        </p>

        {/* Caption */}
        <p className="text-xs text-white truncate-2 mb-3 leading-relaxed">
          {reel.caption || reel.original_caption || "Sem legenda"}
        </p>

        {/* Pipeline progress bar */}
        <div className="pipeline-bar">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`pipeline-step ${
                reel.stage === "error"
                  ? i === 0
                    ? "error"
                    : ""
                  : i < stage.step
                  ? "completed"
                  : i === stage.step
                  ? "active"
                  : ""
              }`}
            />
          ))}
        </div>

        {/* Published badges */}
        {(reel.ig_post_id || reel.fb_post_id) && (
          <div className="flex gap-1.5 mt-2">
            {reel.ig_post_id && (
              <span className="badge badge-instagram">
                <Instagram className="w-3 h-3" />
                IG
              </span>
            )}
            {reel.fb_post_id && (
              <span className="badge badge-facebook">
                <Facebook className="w-3 h-3" />
                FB
              </span>
            )}
          </div>
        )}

        {/* Error message and Actions */}
        {reel.stage === "error" && (
          <div className="mt-2 space-y-2">
            {reel.error_message && (
              <p
                className="text-[10px] break-words line-clamp-2"
                style={{ color: "var(--danger)" }}
                title={reel.error_message}
              >
                {reel.error_message}
              </p>
            )}
            <div className="flex gap-1.5">
              {onReprocess && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReprocess(reel.id);
                  }}
                  className="btn btn-sm flex-1 flex items-center justify-center gap-1.5 py-1 text-xs"
                  style={{
                    background: "rgba(124, 58, 237, 0.15)",
                    color: "var(--brand-purple)",
                    border: "1px solid rgba(124, 58, 237, 0.3)",
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reprocessar
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Deseja realmente excluir este reel e seus arquivos locais?")) {
                      onDelete(reel.id);
                    }
                  }}
                  className="btn btn-sm flex-1 flex items-center justify-center gap-1.5 py-1 text-xs"
                  style={{
                    background: "rgba(239, 68, 68, 0.15)",
                    color: "var(--danger)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
