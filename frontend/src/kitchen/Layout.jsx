import React, { useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";

function CalendarIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function UtensilsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        stroke="none"
        d="m10.8 3.9l-6 4.5c-.5.38-.8.97-.8 1.6v9c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-9c0-.63-.3-1.22-.8-1.6l-6-4.5a2.01 2.01 0 0 0-2.4 0m1.7 8.6c0 .83-.67 1.5-1.5 1.5v3.5c0 .28-.22.5-.5.5s-.5-.22-.5-.5V14c-.83 0-1.5-.67-1.5-1.5V10c0-.28.22-.5.5-.5s.5.22.5.5v2.5h.5V10c0-.28.22-.5.5-.5s.5.22.5.5v2.5h.5V10c0-.28.22-.5.5-.5s.5.22.5.5zm2 5.5c-.28 0-.5-.22-.5-.5v-3h-.5c-.28 0-.5-.22-.5-.5v-2.5c0-.88.57-1.63 1.36-1.89c.31-.11.64.14.64.48v7.41c0 .28-.22.5-.5.5"
      />
    </svg>
  );
}

function ListIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4" cy="6" r="1.5" />
      <circle cx="4" cy="12" r="1.5" />
      <circle cx="4" cy="18" r="1.5" />
    </svg>
  );
}

function SettingsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        stroke="none"
        d="M19.14 12.94c.04-.3.06-.61.06-.94c0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6s3.6 1.62 3.6 3.6s-1.62 3.6-3.6 3.6"
      />
    </svg>
  );
}

function LogoutIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

export default function KitchenLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navLinks = useMemo(() => {
    const links = [
      { to: "/kitchen/semana", label: "Semana" },
      { to: "/kitchen/platos", label: "Platos" },
      { to: "/kitchen/compra", label: "Ingredientes" },
    ];

    if (user?.role === "admin") {
      links.push({ to: "/admin/usuarios", label: "Usuarios" });
    }

    return links;
  }, [user?.role]);

  const bottomNavLinks = useMemo(
    () => [
      { to: "/kitchen/semana", label: "Semana", icon: CalendarIcon },
      { to: "/kitchen/platos", label: "Platos", icon: UtensilsIcon },
      { to: "/kitchen/compra", label: "Lista", icon: ListIcon },
      { to: "/kitchen/configuracion", label: "Configuración", icon: SettingsIcon },
    ],
    []
  );

  const onLogout = async () => {
    await logout();
    navigate("/login");
    setDrawerOpen(false);
  };

  const onNavigate = () => {
    setDrawerOpen(false);
  };

  return (
    <div className="kitchen-app">
      <header className="kitchen-topbar">
        <div className="kitchen-topbar-inner">
          <div className="kitchen-brand">
            <button
              className="kitchen-nav-toggle"
              type="button"
              onClick={() => setDrawerOpen((open) => !open)}
              aria-label="Abrir menú"
              aria-expanded={drawerOpen}
            >
              <span />
              <span />
              <span />
            </button>
            <Link className="kitchen-brand-link" to="/kitchen/semana" onClick={onNavigate}>
              HomeFirst
            </Link>
          </div>
          <nav className="kitchen-nav-desktop">
            {navLinks.map((link) => (
              <NavLink key={link.to} to={link.to} onClick={onNavigate}>
                {link.label}
              </NavLink>
            ))}
          </nav>
          {user ? (
            <div className="kitchen-user">
              <span className="kitchen-user-name">{user.displayName}</span>
              <button
                className="kitchen-logout-button"
                type="button"
                onClick={onLogout}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
              >
                <LogoutIcon className="kitchen-logout-icon" />
              </button>
            </div>
          ) : (
            <div className="kitchen-user-placeholder" />
          )}
        </div>
      </header>
      <div className="kitchen-container">
        {drawerOpen ? (
          <>
            <button className="kitchen-drawer-backdrop" type="button" onClick={onNavigate} aria-label="Cerrar menú" />
            <aside className="kitchen-drawer" aria-hidden={!drawerOpen}>
              <div className="kitchen-drawer-header">
                <span>Menú</span>
                <button className="kitchen-drawer-close" type="button" onClick={onNavigate}>
                  Cerrar
                </button>
              </div>
              <nav className="kitchen-nav-mobile">
                {navLinks.map((link) => (
                  <NavLink key={link.to} to={link.to} onClick={onNavigate}>
                    {link.label}
                  </NavLink>
                ))}
              </nav>
              {user ? (
                <div className="kitchen-drawer-user">
                  <div>
                    <div className="kitchen-pill">{user.displayName}</div>
                  </div>
                  <button className="kitchen-button secondary" type="button" onClick={onLogout}>
                    Cerrar sesión
                  </button>
                </div>
              ) : null}
            </aside>
          </>
        ) : null}
        {children}
      </div>
      <nav className="kitchen-bottom-nav" aria-label="Navegación inferior">
        <div className="kitchen-bottom-nav-inner">
          {bottomNavLinks.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `kitchen-bottom-nav-item${isActive ? " active" : ""}`
                }
              >
                <Icon className="kitchen-bottom-nav-icon" />
                <span className="kitchen-bottom-nav-label">{link.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
