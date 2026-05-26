import React, { useState } from "react";
import { Link } from "react-router-dom";
import { buildApiUrl } from "../api.js";
import Card from "../components/ui/Card.jsx";
import Input from "../components/ui/Input.jsx";
import Button from "../components/ui/Button.jsx";

export default function AdminForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("admin@admin.com");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/admin/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim().toLowerCase() })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setError("Demasiadas peticiones. Espera unos minutos antes de volver a intentarlo.");
        return;
      }
      // Always show generic success — backend never reveals account existence
      setSent(true);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="kitchen-app">
      <div className="kitchen-container kitchen-login-wrap">
        <Card className="kitchen-login-card kitchen-auth-card">
          <p className="kitchen-auth-kicker">Admin</p>
          <h2 className="kitchen-login-title">Recuperar contraseña</h2>
          <p className="kitchen-login-subtitle">
            Recuperación exclusiva para la cuenta de administrador legacy.
          </p>

          {sent ? (
            <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
              <div style={{
                background: "#f0fdf4",
                border: "1px solid #86efac",
                borderRadius: 10,
                padding: "16px 20px",
                marginBottom: 16,
                fontSize: 14,
                color: "#166534",
                lineHeight: 1.6
              }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>✓ Solicitud enviada</div>
                Si existe una cuenta compatible, enviaremos instrucciones de recuperación.
              </div>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
                Revisa el correo de recuperación configurado en la cuenta admin.
                El enlace expira en <strong>15 minutos</strong>.
              </p>
              <Link
                to="/admin/login"
                style={{ fontSize: 13, color: "#6366f1", textDecoration: "none" }}
              >
                ← Volver al acceso admin
              </Link>
            </div>
          ) : (
            <>
              {error ? <div className="kitchen-alert error">{error}</div> : null}
              <form onSubmit={onSubmit} className="kitchen-form">
                <Input
                  id="admin-identifier"
                  label="Identificador de acceso admin"
                  type="email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  autoComplete="username"
                />
                <p style={{ fontSize: 12, color: "#9ca3af", margin: "-4px 0 8px" }}>
                  Introduce el email con el que accedes al panel admin.
                </p>
                <div className="kitchen-actions">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Enviando..." : "Solicitar recuperación"}
                  </Button>
                </div>
              </form>
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <Link
                  to="/admin/login"
                  style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}
                >
                  ← Volver al acceso admin
                </Link>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
