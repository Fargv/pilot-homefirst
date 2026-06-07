import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkAfterSignUpUrl = import.meta.env.VITE_CLERK_AFTER_SIGN_UP_URL || "/onboarding/clerk";

// Capture Clerk FAPI errors (domain-not-allowed, invalid key) before they
// silently freeze the app. No secrets are logged — only the error message.
window.addEventListener("__clerk_error", (ev) => {
  const msg = ev?.detail?.message ?? JSON.stringify(ev?.detail ?? "");
  console.error("[clerk] FAPI error:", msg);
});
window.addEventListener("unhandledrejection", (ev) => {
  const msg = String(ev?.reason?.message ?? "");
  if (msg.toLowerCase().includes("clerk") || msg.includes("subdomain") || msg.includes("authorized party")) {
    console.error("[clerk] Unhandled rejection:", msg);
  }
});

const app = (
  <ThemeProvider>
    {clerkPublishableKey ? (
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        signInUrl="/login"
        signUpUrl="/signup"
        signInForceRedirectUrl="/auth/clerk/complete"
        signInFallbackRedirectUrl="/auth/clerk/complete"
        signUpForceRedirectUrl={clerkAfterSignUpUrl}
        signUpFallbackRedirectUrl={clerkAfterSignUpUrl}
      >
        <App />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </ThemeProvider>
);

ReactDOM.createRoot(document.getElementById("root")).render(app);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Evita romper la app si el SW no se puede registrar.
    });
  });
}
