import React, { useEffect } from "react";
import { SignIn, SignUp, UserButton, useAuth as useClerkAuth } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import Card from "../components/ui/Card";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const isDevelopmentEnvironment = import.meta.env.VITE_APP_ENV === "development" || import.meta.env.DEV;

export default function ClerkDevAuthPage() {
  const navigate = useNavigate();

  if (!isDevelopmentEnvironment) {
    return (
      <div className="kitchen-app">
        <div className="kitchen-container kitchen-login-wrap">
          <Card className="kitchen-login-card">
            <h2 className="kitchen-login-title">Clerk test auth disabled</h2>
            <p className="kitchen-login-subtitle">This route is only available in development.</p>
            <button type="button" className="kitchen-ui-button kitchen-login-submit" onClick={() => navigate("/login")}>
              Back to legacy login
            </button>
          </Card>
        </div>
      </div>
    );
  }

  if (!clerkPublishableKey) {
    return (
      <div className="kitchen-app">
        <div className="kitchen-container kitchen-login-wrap">
          <Card className="kitchen-login-card">
            <h2 className="kitchen-login-title">Clerk test auth not configured</h2>
            <p className="kitchen-login-subtitle">Set VITE_CLERK_PUBLISHABLE_KEY to enable this DEV-only path.</p>
            <button type="button" className="kitchen-ui-button kitchen-login-submit" onClick={() => navigate("/login")}>
              Back to legacy login
            </button>
          </Card>
        </div>
      </div>
    );
  }

  return <ClerkDevAuthContent />;
}

function ClerkDevAuthContent() {
  const navigate = useNavigate();
  const { user, loading, refreshUser } = useAuth();
  const { isSignedIn } = useClerkAuth();

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  return (
    <div className="kitchen-app">
      <div className="kitchen-container kitchen-login-wrap">
        <Card className="kitchen-auth-card">
          <p className="kitchen-auth-kicker">DEV ONLY - Clerk test auth</p>
          <h2 className="kitchen-login-title">Clerk sign-up / sign-in sandbox</h2>
          <p className="kitchen-login-subtitle">
            This path creates real Clerk users. The legacy login and register pages still use the Mongo/JWT flow.
          </p>
          <div className="kitchen-alert info">
            Use this page only for development migration testing. After auth succeeds, the backend resolves the Clerk identity back to Mongo by email.
          </div>
          <div className="kitchen-actions" style={{ marginBottom: 16 }}>
            <button type="button" className="kitchen-button secondary" onClick={() => navigate("/login")}>
              Legacy login
            </button>
            <button type="button" className="kitchen-button secondary" onClick={() => navigate("/register")}>
              Legacy register
            </button>
            <button type="button" className="kitchen-button" onClick={() => navigate("/kitchen/semana")}>
              Open app after Clerk auth
            </button>
          </div>

          {isSignedIn ? (
            <div className="kitchen-alert success">
              Signed in with Clerk. {loading ? "Resolving Mongo user..." : `Mongo user: ${user?.email || "not resolved yet"}`}
            </div>
          ) : null}
          {isSignedIn ? (
            <div className="kitchen-actions" style={{ alignItems: "center" }}>
              <UserButton afterSignOutUrl="/dev/clerk-auth" />
              <button type="button" className="kitchen-button" onClick={() => refreshUser()}>
                Refresh Mongo mapping
              </button>
            </div>
          ) : null}

          {!isSignedIn ? (
            <div className="kitchen-login-socials" style={{ alignItems: "flex-start", gap: 24 }}>
              <div>
                <h3 className="kitchen-auth-kicker">Create real Clerk user</h3>
                <SignUp
                  routing="hash"
                  signInUrl="/dev/clerk-auth"
                  forceRedirectUrl="/dev/clerk-auth"
                />
              </div>
              <div>
                <h3 className="kitchen-auth-kicker">Sign in with Clerk</h3>
                <SignIn
                  routing="hash"
                  signUpUrl="/dev/clerk-auth"
                  forceRedirectUrl="/dev/clerk-auth"
                />
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
