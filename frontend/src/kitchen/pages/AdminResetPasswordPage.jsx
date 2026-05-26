import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { buildApiUrl } from "../api.js";
import Card from "../components/ui/Card.jsx";
import Input from "../components/ui/Input.jsx";
import Button from "../components/ui/Button.jsx";

// Matches the same policy enforced on the backend:
//   - Minimum 10 characters
//   - At least 2 of: uppercase, lowercase, number, symbol
function checkPasswordStrength(password) {
  const pw = String(password || "");
  const errors = [];

  if (pw.length < 10) errors.push("Mínimo 10 caracteres");

  const groups = [
    /[A-Z]/.test(pw),
    /[a-z]/.test(pw),
    /[0-9]/.test(pw),
    /[^A-Za-z0-9]/.test(pw)
  ];
  const metGroups = groups.filter(Boolean).length;
  if (metGroups < 2) errors.push("Al menos 2 de: mayúsculas, minúsculas, números, símbolos");

  const strength = pw.length === 0 ? 0
    : pw.length < 10 ? 1
    : metGroups < 2 ? 1
    : metGroups === 2 ? 2
    : metGroups === 3 ? 3
    : 4;

  return { valid: errors.length === 0, errors, strength };
}

const STRENGTH_LABELS = ["", "Débil", "Aceptable", "Buena", "Fuerte"];
const STRENGTH_COLORS = ["", "#ef4444", "#f59e0b", "#3b82f6", "#16a34a"];

function PasswordStrengthBar({ strength }) {
  if (strength === 0) return null;
  return (
    <div style={{ marginTop: 6, marginBottom: 4 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: i <= strength ? STRENGTH_COLORS[strength] : "#e5e7eb",
              transition: "background 0.2s"
            }}
          />
        ))}
      </div>
      <p style={{ fontSize: 11, color: STRENGTH_COLORS[strength], margin: 0, fontWeight: 600 }}>
        {STRENGTH_LABELS[strength]}
      </p>
    </div>
  );
}

export default function AdminResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("El enlace de recuperación no es válido. Solicita uno nuevo.");
    }
  }, [token]);

  const strength = checkPasswordStrength(newPassword);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!strength.valid) {
      setError(strength.errors.join(". ") + ".");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/admin/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "No se pudo restablecer la contraseña.");
        return;
      }
      setSuccess(true);
      // Auto-redirect after 3 seconds
      setTimeout(() => navigate("/admin/login", { replace: true }), 3000);
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
          <h2 className="kitchen-login-title">Nueva contraseña</h2>
          <p className="kitchen-login-subtitle">
            Establece una nueva contraseña para el acceso admin.
          </p>

          {success ? (
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
                <div style={{ fontWeight: 700, marginBottom: 6 }}>✓ Contraseña actualizada</div>
                Tu contraseña se ha restablecido correctamente.
                Redirigiendo al acceso admin...
              </div>
              <Link
                to="/admin/login"
                style={{ fontSize: 13, color: "#6366f1", textDecoration: "none" }}
              >
                Ir al acceso admin →
              </Link>
            </div>
          ) : (
            <>
              {error ? <div className="kitchen-alert error">{error}</div> : null}

              {!token ? null : (
                <form onSubmit={onSubmit} className="kitchen-form">
                  <div>
                    <Input
                      id="admin-new-password"
                      label="Nueva contraseña"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      autoFocus
                      autoComplete="new-password"
                    />
                    <PasswordStrengthBar strength={strength.strength} />
                    <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 11, color: "#9ca3af" }}>
                      <li style={{ color: newPassword.length >= 10 ? "#16a34a" : "#9ca3af" }}>
                        Mínimo 10 caracteres
                      </li>
                      <li style={{ color: strength.strength >= 2 ? "#16a34a" : "#9ca3af" }}>
                        Al menos 2 grupos: mayúsculas, minúsculas, números, símbolos
                      </li>
                    </ul>
                  </div>
                  <Input
                    id="admin-confirm-password"
                    label="Confirmar nueva contraseña"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                  {confirmPassword && confirmPassword !== newPassword && (
                    <p style={{ fontSize: 12, color: "#ef4444", margin: "-4px 0 0" }}>
                      Las contraseñas no coinciden.
                    </p>
                  )}
                  <div className="kitchen-actions">
                    <Button
                      type="submit"
                      disabled={submitting || !strength.valid || newPassword !== confirmPassword}
                    >
                      {submitting ? "Guardando..." : "Establecer nueva contraseña"}
                    </Button>
                  </div>
                </form>
              )}

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
