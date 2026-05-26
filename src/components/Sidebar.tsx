"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Settings,
  Clock,
  PanelLeftClose,
  PanelLeftOpen,
  Zap,
  Users,
} from "lucide-react";
import { Instagram } from "@/components/icons";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sources", label: "Fontes", icon: Users },
  { href: "/settings", label: "Configurações", icon: Settings },
];

export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Zap className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white truncate">
              Reels AutoPoster
            </h1>
            <p
              className="text-[10px] font-medium truncate"
              style={{ color: "var(--text-muted)" }}
            >
              Automação Instagram & Facebook
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`nav-item relative ${isActive ? "active" : ""}`}
              title={collapsed ? label : undefined}
            >
              <Icon className="nav-icon" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}

        {/* Divider */}
        <div
          className="my-3 mx-2"
          style={{ borderTop: "1px solid var(--surface-border)" }}
        />

        {/* Scheduler status indicator */}
        <div
          className="nav-item"
          style={{ cursor: "default", opacity: 0.7 }}
        >
          <Clock className="nav-icon" />
          {!collapsed && (
            <div className="flex items-center gap-2">
              <span className="text-xs">Scheduler</span>
              <span className="flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--success)" }}
                />
                {!collapsed && (
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--success)" }}
                  >
                    Ativo
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      </nav>

      {/* Collapse toggle */}
      <div style={{ borderTop: "1px solid var(--surface-border)" }}>
        <button
          onClick={onToggle}
          className="nav-item justify-center"
          style={{ margin: "8px" }}
        >
          {collapsed ? (
            <PanelLeftOpen className="nav-icon" />
          ) : (
            <>
              <PanelLeftClose className="nav-icon" />
              <span>Recolher</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
