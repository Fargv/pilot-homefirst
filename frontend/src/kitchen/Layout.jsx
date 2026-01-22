import React, { useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";

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
              <div>
                <div className="kitchen-pill">{user.displayName}</div>
                <div className="kitchen-muted kitchen-user-role">{user.role}</div>
              </div>
              <button className="kitchen-button secondary" type="button" onClick={onLogout}>
                Cerrar sesión
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
                    <div className="kitchen-muted kitchen-user-role">{user.role}</div>
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
    </div>
  );
}
