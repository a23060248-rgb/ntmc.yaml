import { useEffect, useState } from "react";
import { LogOut, Menu, PanelLeftClose, TrainFront, X } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { navigationItems } from "../app/navigation";
import { useAuth } from "../shared/auth/AuthContext";
import { roleLabels } from "../shared/types/auth";

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { session, signOut, hasRole } = useAuth();
  const allowedNavigation = navigationItems.filter((item) => hasRole(item.roles));
  const activeItem =
    allowedNavigation.find((item) =>
      item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path),
    ) ??
    allowedNavigation[0];

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <button
        className={`sidebar-scrim ${menuOpen ? "is-visible" : ""}`}
        aria-label="關閉導覽"
        onClick={() => setMenuOpen(false)}
      />

      <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true">
            <TrainFront size={21} strokeWidth={2.2} />
          </span>
          <div className="brand-copy">
            <strong>輕軌維修系統</strong>
            <span>Maintenance Console</span>
          </div>
          <button
            className="icon-button sidebar-close"
            type="button"
            aria-label="關閉導覽"
            title="關閉導覽"
            onClick={() => setMenuOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="primary-nav" aria-label="主要功能">
          {allowedNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "is-active" : ""}`
                }
              >
                <Icon size={18} strokeWidth={2} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span className="environment-dot" aria-hidden="true" />
          <div>
            <strong>{session?.user.displayName}</strong>
            <span>{session ? roleLabels[session.user.role] : "未登入"}</span>
          </div>
          <button className="icon-button" type="button" title="登出" aria-label="登出" onClick={() => void signOut()}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="icon-button mobile-menu"
              type="button"
              aria-label="開啟導覽"
              title="開啟導覽"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <PanelLeftClose size={17} aria-hidden="true" />
            <span>{activeItem.label}</span>
          </div>
          <span className="system-state" title="API 狀態會在主儀表板顯示">
            <i aria-hidden="true" />
            {session?.adapter === "api" ? "正式登入" : "預覽環境"}
          </span>
        </header>

        <main className="main-content" id="main-content">
          <Outlet />
        </main>
      </section>
    </div>
  );
}
