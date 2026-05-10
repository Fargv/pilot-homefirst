import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl, setToken } from "../api.js";
import { useAuth } from "../auth.jsx";
import Card from "../components/ui/Card.jsx";
import Input from "../components/ui/Input.jsx";
import Button from "../components/ui/Button.jsx";

export default function AdminLoginPage() {
  const { user, loading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@admin.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user?.globalRole === "diod") {
      navigate("/admin", { replace: true });
    }
  }, [loading, navigate, user]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Credenciales inválidas.");
        return;
      }
      if (data.user?.globalRole !== "diod") {
        setError("Este usuario no tiene permisos de administrador.");
        return;
      }
      setToken(data.token);
      await refreshUser();
      navigate("/admin", { replace: true });
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="kitchen-app">
      <div className="kitchen-container kitchen-login-wrap">
        <Card className="kitchen-login-card kitchen-auth-card">
          <p className="kitchen-auth-kicker">Admin</p>
          <h2 className="kitchen-login-title">Acceso administrador</h2>
          <p className="kitchen-login-subtitle">
            Acceso directo sin Clerk para gestión del sistema.
          </p>
          {error ? <div className="kitchen-alert error">{error}</div> : null}
          <form onSubmit={onSubmit} className="kitchen-form">
            <Input
              id="admin-email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
            <Input
              id="admin-password"
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              autoComplete="current-password"
            />
            <div className="kitchen-actions">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Entrando..." : "Entrar como admin"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
