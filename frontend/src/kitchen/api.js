const API = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

let clerkTokenGetter = null;
let clerkAuthState = { isLoaded: false, isSignedIn: false };
const authStateListeners = new Set();
const CLERK_AUTH_WAIT_MS = 2500;

export class ApiRequestError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.path = details.path || "";
    this.url = details.url || "";
    this.status = details.status || 0;
    this.body = details.body || {};
  }
}

export function buildApiUrl(path = "") {
  if (!path) return API;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API}${normalizedPath}`;
}

export function getToken() {
  return localStorage.getItem("kitchen_token") || sessionStorage.getItem("kitchen_token");
}

export function hasLegacyToken() {
  return Boolean(getToken());
}

export function setToken(token) {
  if (token) {
    localStorage.setItem("kitchen_token", token);
    sessionStorage.removeItem("kitchen_token");
    return;
  }
  localStorage.removeItem("kitchen_token");
  sessionStorage.removeItem("kitchen_token");
}

export function registerClerkTokenGetter(getter, state = {}) {
  clerkTokenGetter = typeof getter === "function" ? getter : null;
  clerkAuthState = {
    isLoaded: Boolean(state.isLoaded),
    isSignedIn: Boolean(state.isSignedIn)
  };
  authStateListeners.forEach((listener) => listener());
}

function waitForAuthStateChange(timeoutMs = CLERK_AUTH_WAIT_MS) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, timeoutMs);
    function done() {
      clearTimeout(timer);
      authStateListeners.delete(done);
      resolve();
    }
    authStateListeners.add(done);
  });
}

function normalizeApiPath(path = "") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return normalizedPath.split("?")[0];
}

function isPublicKitchenPath(path = "") {
  const normalizedPath = normalizeApiPath(path);
  return (
    normalizedPath === "/api/kitchen/auth/login"
    || normalizedPath === "/api/kitchen/auth/register"
    || normalizedPath.startsWith("/api/kitchen/auth/invite/")
    || normalizedPath.startsWith("/api/kitchen/auth/resolve-household/")
    || normalizedPath.startsWith("/api/kitchen/beta/validate")
  );
}

function requiresAuthorization(path = "", authMode = "auto") {
  if (authMode === "none") return false;
  if (authMode === "clerk") return true;
  const normalizedPath = normalizeApiPath(path);
  if (isPublicKitchenPath(normalizedPath)) return false;
  return normalizedPath.startsWith("/api/kitchen/")
    || normalizedPath.startsWith("/api/payments/")
    || normalizedPath.startsWith("/api/subscription/");
}

async function readClerkTokenWithRetry() {
  if (!clerkTokenGetter) return null;
  const token = await clerkTokenGetter();
  if (token) return token;
  if (!clerkAuthState.isLoaded) {
    await waitForAuthStateChange();
    return clerkTokenGetter ? clerkTokenGetter() : null;
  }
  if (clerkAuthState.isSignedIn) {
    await waitForAuthStateChange(250);
    return clerkTokenGetter ? clerkTokenGetter() : null;
  }
  return null;
}

async function getAuthorizationHeader(authMode = "auto", path = "") {
  if (authMode === "clerk") {
    if (!clerkTokenGetter) {
      if (import.meta.env.DEV) {
        console.warn("[clerk][dev] Clerk authMode requested before token getter was registered");
      }
      return null;
    }

    try {
      const clerkToken = await readClerkTokenWithRetry();
      if (!clerkToken && import.meta.env.DEV) {
        console.warn("[clerk][dev] Clerk authMode requested but getToken returned no token", { path });
      }
      return clerkToken ? `Bearer ${clerkToken}` : null;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("[clerk][dev] Clerk token getter failed", {
          message: error?.message || String(error)
        });
      }
      return null;
    }
  }

  const legacyToken = getToken();
  if (legacyToken) return `Bearer ${legacyToken}`;

  if (!clerkTokenGetter) return null;

  try {
    const clerkToken = await readClerkTokenWithRetry();
    return clerkToken ? `Bearer ${clerkToken}` : null;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[clerk][dev] Auto Clerk token getter failed", {
        message: error?.message || String(error)
      });
    }
    return null;
  }
}

export async function apiRequest(path, options = {}) {
  const { authMode = "auto", ...fetchOptions } = options;
  const isFormDataBody = typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
  const headers = {
    ...(isFormDataBody ? {} : { "Content-Type": "application/json" }),
    ...(fetchOptions.headers || {})
  };

  const authorizationRequired = requiresAuthorization(path, authMode);
  const authorizationHeader = await getAuthorizationHeader(authMode, path);
  if (authorizationHeader && !headers.Authorization) {
    headers.Authorization = authorizationHeader;
  }
  if (authorizationRequired && !headers.Authorization) {
    if (import.meta.env.DEV) {
      console.warn("[auth][dev] Blocked protected API request without bearer token", {
        path,
        clerkLoaded: clerkAuthState.isLoaded,
        clerkSignedIn: clerkAuthState.isSignedIn,
        hasLegacyToken: hasLegacyToken()
      });
    }
    throw new ApiRequestError("Sesion no disponible. Espera un momento y vuelve a intentarlo.", {
      path,
      url: buildApiUrl(path),
      status: 0,
      body: { code: "AUTH_TOKEN_UNAVAILABLE" }
    });
  }

  const url = buildApiUrl(path);
  const response = await fetch(url, {
    ...fetchOptions,
    headers
  });

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const contentLength = Number.parseInt(response.headers.get("content-length") || "0", 10);
  const canHaveBody = response.status !== 204 && response.status !== 205;
  const shouldParseJson = canHaveBody && (contentType.includes("application/json") || (Number.isFinite(contentLength) && contentLength > 0));
  const data = shouldParseJson ? await response.json().catch(() => ({})) : {};
  if (!response.ok) {
    const message = data?.error || data?.message || "Error inesperado";
    throw new ApiRequestError(message, {
      path,
      url,
      status: response.status,
      body: data
    });
  }

  return data;
}

export async function fetchInviteDetails(inviteToken) {
  try {
    const response = await fetch(buildApiUrl(`/api/kitchen/auth/invite/${encodeURIComponent(inviteToken)}`));
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return null;
    return {
      householdName: data.householdName || "",
      recipientEmail: data.recipientEmail || "",
      role: data.role || "",
      expiresAt: data.expiresAt || "",
    };
  } catch {
    return null;
  }
}

export function requestForgotPassword(email) {
  return apiRequest("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export function requestResetPassword(token, newPassword) {
  return apiRequest("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, newPassword })
  });
}

// ─── Payments ─────────────────────────────────────────────────────────────────

/**
 * Create a Stripe Checkout Session on the backend and return { url, sessionId }.
 * @param {{ type: string, targetId?: string, targetName?: string, stripePriceId?: string, planKey?: string }} payload
 */
export function createCheckoutSession(payload) {
  return apiRequest("/api/payments/checkout-session", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

/** Fetch the current user's PurchaseAttempt history (DEV/debug use). */
export function getMyPaymentAttempts() {
  return apiRequest("/api/payments/my-attempts");
}

/** Open a Stripe Customer Portal session. Returns { url } to redirect to. */
export function createCustomerPortalSession() {
  return apiRequest("/api/payments/customer-portal", { method: "POST" });
}

/**
 * DEV/test only — change the current user's household plan directly without Stripe.
 * Requires STRIPE_MODE=test and ALLOW_TEST_PAYMENT_ENTITLEMENTS=true on the backend.
 */
export function devChangePlan(planKey) {
  return apiRequest("/api/payments/dev/change-plan", {
    method: "POST",
    body: JSON.stringify({ planKey })
  });
}

export function activatePaymentSession(sessionId) {
  return apiRequest("/api/payments/session-activate", { method: "POST", body: JSON.stringify({ sessionId }) });
}

/**
 * DEV/test only — re-apply the latest completed subscription PurchaseAttempt for
 * the current household. Call this from PaymentSuccessPage if polling fails.
 * Requires STRIPE_MODE=test and ALLOW_TEST_PAYMENT_ENTITLEMENTS=true on the backend.
 */
export function devApplyLatestSubscription() {
  return apiRequest("/api/payments/dev/apply-latest-subscription", { method: "POST" });
}

export function cancelSubscription(payload) {
  return apiRequest("/api/payments/cancel-subscription", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function undoCancelSubscription() {
  return apiRequest("/api/payments/undo-cancel-subscription", { method: "POST" });
}

export function getPlansAdminConfig() {
  return apiRequest("/api/kitchen/plans/admin/config");
}

export function savePlansAdminConfig(plans) {
  return apiRequest("/api/kitchen/plans/admin/config", {
    method: "PUT",
    body: JSON.stringify({ plans })
  });
}
