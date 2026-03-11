import webpush from "web-push";
import { config } from "../config.js";

let initialized = false;

function hasVapidConfig() {
  return Boolean(
    config.webPush?.publicKey
    && config.webPush?.privateKey
    && config.webPush?.contactEmail
  );
}

export function isWebPushConfigured() {
  return hasVapidConfig();
}

export function initWebPush() {
  if (initialized || !hasVapidConfig()) {
    return hasVapidConfig();
  }

  webpush.setVapidDetails(
    `mailto:${config.webPush.contactEmail}`,
    config.webPush.publicKey,
    config.webPush.privateKey
  );
  initialized = true;
  return true;
}

function buildFailureResult(subscription, error) {
  const statusCode = Number(error?.statusCode || 0);
  const expired = statusCode === 404 || statusCode === 410;
  return {
    ok: false,
    endpoint: String(subscription?.endpoint || ""),
    statusCode,
    expired,
    error: error?.message || "No se pudo enviar la notificacion."
  };
}

export async function sendPushNotification(subscription, payload) {
  if (!subscription?.endpoint) {
    return {
      ok: false,
      endpoint: "",
      statusCode: 0,
      expired: false,
      error: "La suscripcion no tiene endpoint."
    };
  }

  if (!initWebPush()) {
    return {
      ok: false,
      endpoint: String(subscription.endpoint || ""),
      statusCode: 0,
      expired: false,
      error: "Web Push no esta configurado."
    };
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload || {}));
    return {
      ok: true,
      endpoint: String(subscription.endpoint || ""),
      statusCode: 201,
      expired: false,
      error: null
    };
  } catch (error) {
    return buildFailureResult(subscription, error);
  }
}
