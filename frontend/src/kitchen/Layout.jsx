import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "./auth.js";

export default function KitchenLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate("/kitchen/login");
  };

  return (
    <div className="kitchen-app">
      <div className="kitchen-container">
        <header className="kitchen-header">
          <div>
            <Link to="/kitchen/semana" style={{ textDecoration: "none", color: "inherit" }}>
              <h2 style={{ margin: 0 }}>Kitchen</h2>
            </Link>
            <div className="kitchen-muted">Plan familiar de comidas y compras.</div>
          </div>
          <nav className="kitchen-nav">
            <NavLink to="/kitchen/semana">Semana</NavLink>
            <NavLink to="/kitchen/platos">Platos</NavLink>
            <NavLink to="/kitchen/compra">Compra</NavLink>
            <NavLink to="/kitchen/cambios">Cambios</NavLink>
          </nav>
          {user ? (
            <div>
              <div className="kitchen-pill">{user.displayName}</div>
              <button className="kitchen-button secondary" style={{ marginLeft: 8 }} onClick={onLogout}>
                Cerrar sesión
              </button>
            </div>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}
