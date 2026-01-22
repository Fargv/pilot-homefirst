import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kitchen-app">
      <div className="kitchen-container" style={{ maxWidth: 480 }}>
        <div className="kitchen-card">
          <h2>Acceso a HomeFirst</h2>
          <p className="kitchen-muted">Usa tus credenciales familiares para entrar.</p>
          <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <label>
              <span className="kitchen-label">Email</span>
              <input
                className="kitchen-input"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="Ej: ana@email.com"
                required
              />
            </label>
            <label>
              <span className="kitchen-label">Contraseña</span>
              <input
                className="kitchen-input"
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="••••••••"
                required
              />
            </label>
            {error ? <div style={{ color: "#b42318" }}>{error}</div> : null}
            <button className="kitchen-button" type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
