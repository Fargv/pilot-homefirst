import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function BootstrapPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const checkBootstrap = async () => {
      try {
        const data = await apiRequest("/api/users/bootstrap-needed");
        if (active && !data.needed) {
          navigate("/login", { replace: true });
        }
      } catch {
        // Si falla la comprobación, dejamos el formulario visible para no bloquear.
      } finally {
        if (active) setChecking(false);
      }
    };
    checkBootstrap();
    return () => {
      active = false;
    };
  }, [navigate]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    const trimmedEmail = form.email.trim().toLowerCase();
    if (!form.firstName.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!emailRegex.test(trimmedEmail)) {
      setError("El email no es válido.");
      return;
    }
    if (form.password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/api/users/bootstrap", {
        method: "POST",
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: trimmedEmail,
          password: form.password
        })
      });
      await login(trimmedEmail, form.password);
      setSuccess("Usuario admin creado. Sesión iniciada.");
      navigate("/admin/usuarios", { replace: true });
    } catch (err) {
      setError(err.message || "No se pudo crear el usuario.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kitchen-app">
      <div className="kitchen-container" style={{ maxWidth: 520 }}>
        <div className="kitchen-card" style={{ textAlign: "center" }}>
          <h2>Crear primer usuario</h2>
          <p className="kitchen-muted">No hay usuarios todavía. Crea el primero para empezar.</p>
          {checking ? (
            <div className="kitchen-muted" style={{ marginTop: 12 }}>Comprobando estado...</div>
          ) : null}
        </div>
        <div className="kitchen-card" style={{ marginTop: 16 }}>
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
            <label>
              <span className="kitchen-label">Nombre</span>
              <input
                className="kitchen-input"
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                placeholder="Ej: Ana"
                required
              />
            </label>
            <label>
              <span className="kitchen-label">Apellidos (opcional)</span>
              <input
                className="kitchen-input"
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                placeholder="Ej: Gómez"
              />
            </label>
            <label>
              <span className="kitchen-label">Email</span>
              <input
                className="kitchen-input"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="ana@email.com"
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
                placeholder="Mínimo 8 caracteres"
                required
              />
            </label>
            {error ? <div className="kitchen-alert error">{error}</div> : null}
            {success ? <div className="kitchen-alert success">{success}</div> : null}
            <button className="kitchen-button" type="submit" disabled={loading}>
              {loading ? "Creando..." : "Crear usuario admin"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
