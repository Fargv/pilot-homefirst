import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkAfterSignUpUrl = import.meta.env.VITE_CLERK_AFTER_SIGN_UP_URL || "/onboarding/clerk";

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
