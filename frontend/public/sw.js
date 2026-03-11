self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function buildNotificationPayload(event) {
  if (!event?.data) {
    return {
      title: "HOMEFIRST",
      body: "",
      data: {}
    };
  }

  try {
    const parsed = event.data.json();
    return {
      title: parsed?.title || "HOMEFIRST",
      body: parsed?.body || "",
      data: parsed?.data || {}
    };
  } catch {
    return {
      title: "HOMEFIRST",
      body: event.data.text() || "",
      data: {}
    };
  }
}

function resolveNotificationUrl(data = {}) {
  const targetUrl = new URL("/kitchen/semana", self.location.origin);
  const safeUrl = String(data?.url || "").trim();

  if (safeUrl) {
    try {
      return new URL(safeUrl, self.location.origin).toString();
    } catch {
      // Continuar con la URL por defecto.
    }
  }

  if (data?.targetDate) {
    targetUrl.searchParams.set("date", String(data.targetDate));
  }
  if (data?.mealType) {
    targetUrl.searchParams.set("mealType", String(data.mealType));
  }
  return targetUrl.toString();
}

self.addEventListener("push", (event) => {
  const payload = buildNotificationPayload(event);

  event.waitUntil(
    self.registration.showNotification(payload.title || "HOMEFIRST", {
      body: payload.body || "",
      data: payload.data || {},
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png"
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification?.close?.();

  event.waitUntil((async () => {
    const targetUrl = resolveNotificationUrl(event.notification?.data || {});
    const clientsList = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    for (const client of clientsList) {
      const clientUrl = new URL(client.url, self.location.origin);
      if (clientUrl.origin !== self.location.origin) {
        continue;
      }

      await client.focus();
      if ("navigate" in client) {
        await client.navigate(targetUrl);
      }
      return;
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});
