import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App.jsx";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkAfterSignUpUrl = import.meta.env.VITE_CLERK_AFTER_SIGN_UP_URL || "/onboarding/clerk";

const app = (
  clerkPublishableKey ? (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      signInUrl="/auth/clerk/sign-in"
      signUpUrl="/auth/clerk/sign-up"
      signInForceRedirectUrl="/auth/clerk/complete"
      signInFallbackRedirectUrl="/auth/clerk/complete"
      signUpForceRedirectUrl={clerkAfterSignUpUrl}
      signUpFallbackRedirectUrl={clerkAfterSignUpUrl}
    >
      {/*
        TODO: Configure Clerk application URLs and allowed redirect origins in the
        Clerk dashboard before enabling Clerk sign-in in production.
      */}
      <App />
    </ClerkProvider>
  ) : (
    <App />
  )
);

ReactDOM.createRoot(document.getElementById("root")).render(app);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Evita romper la app si el SW no se puede registrar.
    });
  });
}
