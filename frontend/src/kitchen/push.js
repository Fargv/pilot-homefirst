import { apiRequest } from "./api.js";

function getBrowserPermission() {
  if (typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission || "default";
}

function hasPushRuntimeSupport() {
  if (typeof window === "undefined") return false;
  return Boolean(window.isSecureContext && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window);
}

function getPublicKey() {
  return String(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || "").trim();
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

async function requestNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";

  const nextPermission = await Notification.requestPermission();
  return nextPermission || "default";
}

async function getServiceWorkerRegistration() {
  if (!hasPushRuntimeSupport()) return null;

  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function getExistingSubscription() {
  const registration = await getServiceWorkerRegistration();
  if (!registration?.pushManager) return null;

  try {
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function syncSubscriptionWithBackend(subscription) {
  if (!subscription) {
    throw new Error("No se pudo obtener la suscripcion del navegador.");
  }

  return apiRequest("/api/kitchen/push/subscription", {
    method: "POST",
    body: JSON.stringify({ subscription: subscription.toJSON() })
  });
}

export async function getPushNotificationStatus() {
  const supported = hasPushRuntimeSupport();
  const permission = getBrowserPermission();
  const publicKey = getPublicKey();
  const existingSubscription = supported ? await getExistingSubscription() : null;
  let backendStatus = {
    configured: Boolean(publicKey),
    subscriptionCount: 0,
    hasSubscriptions: false
  };

  try {
    backendStatus = await apiRequest("/api/kitchen/push/status");
  } catch {
    // Mantener la UI funcional aunque el backend no responda.
  }

  return {
    supported,
    permission,
    configured: Boolean(publicKey) && Boolean(backendStatus?.configured),
    subscriptionCount: Number(backendStatus?.subscriptionCount || 0),
    hasSubscriptions: Boolean(backendStatus?.hasSubscriptions),
    isSubscribed: Boolean(existingSubscription),
    publicKeyAvailable: Boolean(publicKey)
  };
}

export async function enablePushNotifications() {
  if (!hasPushRuntimeSupport()) {
    throw new Error("Este navegador no soporta notificaciones push.");
  }

  const publicKey = getPublicKey();
  if (!publicKey) {
    throw new Error("Falta configurar la clave publica de Web Push en el frontend.");
  }

  const permission = await requestNotificationPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied"
      ? "Has bloqueado las notificaciones en este navegador."
      : "No se concedio permiso para mostrar notificaciones.");
  }

  const registration = await getServiceWorkerRegistration();
  if (!registration?.pushManager) {
    throw new Error("El service worker no esta listo para notificaciones.");
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }

  await syncSubscriptionWithBackend(subscription);
  return getPushNotificationStatus();
}

export async function disablePushNotifications() {
  const subscription = await getExistingSubscription();
  const endpoint = String(subscription?.endpoint || "");

  if (subscription) {
    try {
      await subscription.unsubscribe();
    } catch {
      // Intentamos limpiar backend igualmente.
    }
  }

  try {
    await apiRequest("/api/kitchen/push/subscription", {
      method: "DELETE",
      body: JSON.stringify(endpoint ? { endpoint } : {})
    });
  } catch {
    // La app debe seguir funcionando aunque falle el borrado remoto.
  }

  return getPushNotificationStatus();
}

export async function sendPushNotificationTest() {
  return apiRequest("/api/kitchen/push/test", {
    method: "POST"
  });
}
