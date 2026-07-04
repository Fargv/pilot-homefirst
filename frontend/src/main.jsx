import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkAfterSignUpUrl = import.meta.env.VITE_CLERK_AFTER_SIGN_UP_URL || "/onboarding/clerk";
const clerkAppearance = {
  cssLayerName: "clerk",
  elements: {
    rootBox: {
      width: "100%"
    },
    cardBox: {
      width: "100%",
      background: "var(--surface-elevated, rgba(255, 255, 255, 0.62))",
      color: "var(--text-primary, #111827)",
      borderColor: "var(--border-soft, transparent)",
      boxShadow: "none"
    },
    card: {
      width: "100%",
      background: "var(--surface-elevated, rgba(255, 255, 255, 0.62))",
      color: "var(--text-primary, #111827)",
      border: "0",
      boxShadow: "none",
      padding: "clamp(14px, 4vw, 20px)"
    },
    header: {
      display: "none"
    },
    headerTitle: {
      color: "var(--text-primary, #111827)",
      fontFamily: "inherit"
    },
    headerSubtitle: {
      color: "var(--text-muted, #64748b)",
      fontFamily: "inherit"
    },
    main: {
      background: "transparent"
    },
    form: {
      background: "transparent"
    },
    footer: {
      marginTop: "8px",
      background: "transparent",
      color: "var(--text-muted, #64748b)",
      fontFamily: "inherit"
    },
    footerPages: {
      background: "transparent"
    },
    footerAction: {
      color: "var(--text-muted, #64748b)"
    },
    footerActionText: {
      color: "var(--text-primary, #111827)",
      fontFamily: "inherit"
    },
    footerActionLink: {
      color: "var(--hf-primary, var(--hf-brand, #6260ff))",
      fontFamily: "inherit",
      fontWeight: "600"
    },
    formFieldRow: {
      background: "transparent"
    },
    formFieldLabel: {
      color: "var(--text-primary, #111827)",
      fontFamily: "inherit"
    },
    formFieldHintText: {
      color: "var(--text-muted, #64748b)"
    },
    formFieldInput: {
      minHeight: "52px",
      borderRadius: "var(--radius-full, 999px)",
      background: "var(--input-bg, #f8fafc)",
      borderColor: "var(--input-border, #e2e8f0)",
      color: "var(--input-text, #111827)",
      boxShadow: "none"
    },
    formButtonPrimary: {
      minHeight: "54px",
      borderRadius: "var(--radius-full, 999px)",
      background: "var(--hf-primary, var(--hf-brand, #6260ff))",
      color: "#ffffff",
      fontFamily: "inherit",
      fontSize: "1rem"
    },
    formResendCodeText: {
      color: "var(--text-muted, #64748b)",
      fontFamily: "inherit"
    },
    formResendCodeLink: {
      color: "var(--hf-primary, var(--hf-brand, #6260ff))",
      fontFamily: "inherit",
      fontWeight: "600"
    },
    socialButtons: {
      background: "transparent"
    },
    socialButtonsBlockButton: {
      background: "var(--button-secondary-bg, #ffffff)",
      borderColor: "var(--border-soft, #e5e7eb)",
      color: "var(--button-secondary-text, #111827)",
      boxShadow: "none"
    },
    socialButtonsBlockButtonText: {
      color: "var(--text-primary, #111827)",
      fontFamily: "inherit"
    },
    identityPreview: {
      background: "var(--button-secondary-bg, #ffffff)",
      borderColor: "var(--border-soft, #e5e7eb)",
      color: "var(--button-secondary-text, #111827)",
      boxShadow: "none"
    },
    identityPreviewText: {
      color: "var(--text-primary, #111827)",
      fontFamily: "inherit"
    },
    dividerText: {
      color: "var(--text-muted, #64748b)"
    },
    dividerLine: {
      background: "var(--border-soft, #e5e7eb)"
    },
    otpCodeFieldInputs: {
      display: "flex",
      gap: "6px",
      justifyContent: "center",
      background: "transparent"
    },
    otpCodeFieldInput: {
      width: "44px",
      height: "52px",
      minWidth: "0",
      padding: "0",
      textAlign: "center",
      fontSize: "1.35rem",
      fontWeight: "700",
      lineHeight: "52px",
      borderRadius: "var(--radius-md, 8px)",
      background: "var(--input-bg, #f8fafc)",
      borderColor: "var(--input-border, #e2e8f0)",
      color: "var(--input-text, #111827)",
      boxShadow: "none",
      boxSizing: "border-box"
    }
  }
};

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
        appearance={clerkAppearance}
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
