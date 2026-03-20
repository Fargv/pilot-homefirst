import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../api.js";
import { buildReturnTo, storePostAuthRedirect } from "../authRedirect.js";
import { isUserAuthenticated, useAuth } from "../auth.jsx";
import { AppLoadingScreen } from "../components/WeekPageSkeleton.jsx";

export default function InviteLandingPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { loading, refreshUser, setUser, user } = useAuth();

  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteStatus, setInviteStatus] = useState("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [roleLabel, setRoleLabel] = useState("");

  const isAuthenticated = isUserAuthenticated(user);
  const isAlreadyMember = inviteStatus === "already_member";

  const statusCopy = useMemo(() => {
    if (error) return null;
    if (inviteStatus === "joined") {
      return {
        title: "Acceso concedido",
        body: "La invitacion es valida y ya te uniste al hogar."
      };
    }
    if (isAlreadyMember) {
      return {
        title: "Ya formas parte de este hogar",
        body: "Tu cuenta ya pertenece a este hogar. Puedes continuar directamente."
      };
    }
    if (inviteStatus === "valid") {
      return {
        title: "Invitacion lista",
        body: "Confirma para unirte a este hogar con tu cuenta actual."
      };
    }
    return null;
  }, [error, inviteStatus, isAlreadyMember]);

  useEffect(() => {
    if (loading || isAuthenticated) return;
    const next = buildReturnTo(window.location);
    storePostAuthRedirect(next);
    navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
  }, [isAuthenticated, loading, navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const validateInvite = async () => {
      setLoadingInvite(true);
      setError("");
      setInviteStatus("idle");

      if (!token) {
        setLoadingInvite(false);
        setError("Token de invitacion invalido.");
        return;
      }

      try {
        const data = await apiRequest(`/api/kitchen/household/invitations/${token}/validate`);
        setHouseholdName(data.householdName || "");
        setExpiresAt(data.expiresAt || "");
        setRoleLabel(data.roleLabel || "");
        setInviteStatus(data.status || "valid");
      } catch (err) {
        setError(err.message || "No se pudo validar la invitacion.");
        setHouseholdName("");
        setExpiresAt("");
        setRoleLabel("");
        setInviteStatus("invalid");
      } finally {
        setLoadingInvite(false);
      }
    };

    void validateInvite();
  }, [isAuthenticated, token]);

  const acceptInvite = async () => {
    setSubmitting(true);
    setError("");

    try {
      const data = await apiRequest(`/api/kitchen/household/invitations/${token}/accept`, {
        method: "POST"
      });
      if (data?.user) {
        setUser((prev) => ({ ...prev, ...data.user }));
      }
      await refreshUser();
      setInviteStatus(data?.status || "joined");
    } catch (err) {
      setError(err.message || "No se pudo aceptar la invitacion.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !isAuthenticated) {
    return (
      <AppLoadingScreen
        title="Preparando acceso"
        subtitle="Estamos validando tu sesion para abrir esta invitacion."
      />
    );
  }

  return (
    <div className="kitchen-app">
      <div className="kitchen-container" style={{ maxWidth: 520 }}>
        <div className="kitchen-card kitchen-block-gap">
          <h2>Invitacion al hogar</h2>
          {householdName ? <p className="kitchen-muted">Te invitaron a unirte a <strong>{householdName}</strong>.</p> : null}
          {expiresAt ? <p className="kitchen-muted">Valida hasta {new Date(expiresAt).toLocaleString()}.</p> : null}
          {roleLabel ? <p className="kitchen-muted">Acceso previsto: <strong>{roleLabel}</strong>.</p> : null}

          {loadingInvite ? <p className="kitchen-muted">Validando invitacion...</p> : null}
          {error ? <div className="kitchen-alert error">{error}</div> : null}

          {!loadingInvite && statusCopy ? (
            <div className="kitchen-block-gap">
              <div className="kitchen-card" style={{ padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>{statusCopy.title}</h3>
                <p className="kitchen-muted" style={{ marginBottom: 0 }}>{statusCopy.body}</p>
              </div>
              {inviteStatus === "valid" ? (
                <button type="button" className="kitchen-button" disabled={submitting} onClick={() => void acceptInvite()}>
                  {submitting ? "Uniendo al hogar..." : "Unirme al hogar"}
                </button>
              ) : null}
              {inviteStatus === "joined" || isAlreadyMember ? (
                <button type="button" className="kitchen-button secondary" onClick={() => navigate("/kitchen/semana", { replace: true })}>
                  Ir a mi semana
                </button>
              ) : null}
            </div>
          ) : null}

          {!loadingInvite && error ? (
            <button type="button" className="kitchen-button secondary" onClick={() => window.location.reload()}>
              Reintentar validacion
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
