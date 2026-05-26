"use client";

import { motion } from "framer-motion";
import { TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trend?: { value: number; label: string };
  color?: string;
  gradient?: string;
}

export default function StatCard({
  label,
  value,
  icon,
  trend,
  color,
  gradient,
}: StatCardProps) {
  const isPositive = trend && trend.value >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="stat-card"
    >
      {/* Gradient accent */}
      {gradient && (
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: gradient }}
        />
      )}

      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: color
              ? `${color}15`
              : "var(--brand-gradient-subtle)",
            color: color || "var(--brand-purple)",
          }}
        >
          {icon}
        </div>
        {trend && (
          <div
            className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full"
            style={{
              background: isPositive
                ? "var(--success-bg)"
                : "var(--danger-bg)",
              color: isPositive ? "var(--success)" : "var(--danger)",
            }}
          >
            {isPositive ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>

      <p
        className="text-2xl font-bold text-white mb-1"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </p>
      <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
    </motion.div>
  );
}
