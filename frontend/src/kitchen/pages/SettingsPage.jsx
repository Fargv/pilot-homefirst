import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";
import { useAuth } from "../auth";
import { apiRequest } from "../api.js";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [inviteLink, setInviteLink] = useState("");
  const [placeholderName, setPlaceholderName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isOwner = user?.role === "owner" || user?.role === "admin";

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const membersResponse = await apiRequest("/api/kitchen/users/members");
      setMembers(membersResponse.users || []);

      if (isOwner) {
        const inviteResponse = await apiRequest("/api/kitchen/household/invitations");
        setInvitations(inviteResponse.invitations || []);
      }
    } catch (err) {
      setError(err.message || "No se pudo cargar la configuración del hogar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [isOwner]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  const generateInvite = async () => {
    setError("");
    setSuccess("");
    try {
      const data = await apiRequest("/api/kitchen/household/invitations", { method: "POST" });
      setInviteLink(data.inviteLink || "");
      setSuccess("Enlace de invitación generado correctamente.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo generar la invitación.");
    }
  };

  const copyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setSuccess("Enlace copiado al portapapeles.");
    } catch {
      setError("No pudimos copiar el enlace automáticamente.");
    }
  };

  const createPlaceholder = async () => {
    const safeName = placeholderName.trim();
    if (!safeName) {
      setError("Debes indicar un nombre para el comensal.");
      return;
    }

    setError("");
    setSuccess("");
    try {
      await apiRequest("/api/kitchen/household/placeholders", {
        method: "POST",
        body: JSON.stringify({ displayName: safeName })
      });
      setPlaceholderName("");
      setSuccess("Comensal sin cuenta creado correctamente.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo crear el comensal.");
    }
  };

  return (
    <KitchenLayout>
      <div className="kitchen-card kitchen-block-gap">
        <h2>Configuración</h2>
        <p className="kitchen-muted">Gestiona tu hogar y tus miembros.</p>
        {error ? <div className="kitchen-alert error">{error}</div> : null}
        {success ? <div className="kitchen-alert success">{success}</div> : null}

        <h3>Mi Hogar</h3>
        {loading ? <p className="kitchen-muted">Cargando miembros...</p> : null}
        {!loading ? (
          <ul className="kitchen-list">
            {members.map((member) => (
              <li key={member.id}>
                <strong>{member.displayName}</strong>{" "}
                {member.isPlaceholder ? "(comensal sin cuenta)" : member.email ? `(${member.email})` : ""}
              </li>
            ))}
            {members.length === 0 ? <li className="kitchen-muted">Todavía no hay miembros.</li> : null}
          </ul>
        ) : null}

        {isOwner ? (
          <>
            <h3>Invitar</h3>
            <div className="kitchen-actions">
              <button type="button" className="kitchen-button" onClick={generateInvite}>
                Generar enlace
              </button>
              <button
                type="button"
                className="kitchen-button secondary"
                onClick={copyInvite}
                disabled={!inviteLink}
              >
                Copiar
              </button>
            </div>
            {inviteLink ? <p className="kitchen-muted">{inviteLink}</p> : null}

            {invitations.length > 0 ? (
              <ul className="kitchen-list">
                {invitations.map((invitation) => (
                  <li key={invitation.id}>
                    Invitación activa hasta {new Date(invitation.expiresAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            ) : null}

            <h3>Añadir comensal (sin cuenta)</h3>
            <div className="kitchen-actions">
              <input
                type="text"
                className="kitchen-input"
                placeholder="Nombre del comensal"
                value={placeholderName}
                onChange={(event) => setPlaceholderName(event.target.value)}
              />
              <button type="button" className="kitchen-button secondary" onClick={createPlaceholder}>
                Añadir comensal sin cuenta
              </button>
            </div>
          </>
        ) : null}

        <button type="button" className="kitchen-button secondary" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>
    </KitchenLayout>
  );
}
