import React, { useEffect, useState } from "react";
import { disablePushNotifications, enablePushNotifications, getPushNotificationStatus, sendPushNotificationTest } from "../push.js";

function buildStatusLabel(status) {
  if (!status.supported) return "No compatible";
  if (!status.publicKeyAvailable || !status.configured) return "Sin configurar";
  if (status.permission === "denied") return "Bloqueadas";
  if (status.isSubscribed || status.hasSubscriptions) return "Activadas";
  if (status.permission === "granted") return "Permiso concedido";
  return "Desactivadas";
}

export default function PushNotificationsPanel({ refreshKey = "" }) {
  const [status, setStatus] = useState({
    supported: false,
    permission: "default",
    configured: false,
    subscriptionCount: 0,
    hasSubscriptions: false,
    isSubscribed: false,
    publicKeyAvailable: false
  });
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadStatus = async () => {
      setLoading(true);
      setError("");
      try {
        const nextStatus = await getPushNotificationStatus();
        if (!active) return;
        setStatus(nextStatus);
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || "No se pudo cargar el estado de notificaciones.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadStatus();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const runAction = async (actionName, action, successMessage) => {
    setBusyAction(actionName);
    setError("");
    setMessage("");
    try {
      const nextStatus = await action();
      if (nextStatus) {
        setStatus(nextStatus);
      }
      setMessage(successMessage);
    } catch (actionError) {
      setError(actionError.message || "No se pudo completar la accion.");
    } finally {
      setBusyAction("");
    }
  };

  const statusLabel = buildStatusLabel(status);
  const canEnable = status.supported && status.publicKeyAvailable && status.permission !== "denied";
  const canDisable = status.isSubscribed || status.hasSubscriptions;
  const canSendTest = status.hasSubscriptions;

  return (
    <div className="settings-block">
      <div className="settings-notification-row">
        <div>
          <div className="settings-coming-row">
            <span>Notificaciones</span>
            <span className="kitchen-pill">{loading ? "Cargando" : statusLabel}</span>
          </div>
          <p className="kitchen-muted">
            {!status.supported
              ? "Tu navegador o contexto actual no admite Web Push."
              : !status.publicKeyAvailable || !status.configured
              ? "Falta configurar Web Push para activar las notificaciones."
              : status.permission === "denied"
              ? "Las notificaciones estan bloqueadas en este navegador."
              : `Suscripciones activas para tu usuario: ${status.subscriptionCount}.`}
          </p>
        </div>
        <div className="settings-notification-actions">
          <button
            type="button"
            className="kitchen-button"
            onClick={() => runAction("enable", enablePushNotifications, "Notificaciones activadas.")}
            disabled={loading || busyAction === "disable" || !canEnable}
          >
            {busyAction === "enable" ? "Activando..." : "Activar"}
          </button>
          <button
            type="button"
            className="kitchen-button secondary"
            onClick={() => runAction("disable", disablePushNotifications, "Notificaciones desactivadas para este navegador.")}
            disabled={loading || busyAction === "enable" || !canDisable}
          >
            {busyAction === "disable" ? "Desactivando..." : "Desactivar"}
          </button>
          <button
            type="button"
            className="kitchen-button secondary"
            onClick={() => runAction("test", sendPushNotificationTest, "Notificacion de prueba enviada a tu usuario.")}
            disabled={loading || busyAction === "enable" || busyAction === "disable" || !canSendTest}
          >
            {busyAction === "test" ? "Enviando..." : "Enviar prueba"}
          </button>
        </div>
      </div>
      {message ? <p className="kitchen-muted">{message}</p> : null}
      {error ? <p className="kitchen-inline-error">{error}</p> : null}
    </div>
  );
}
