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
      <path d="M4 3v8M7 3v8M4 7h3" />
      <path d="M18 3v18" />
      <circle cx="12" cy="12" r="5" />
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
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
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
