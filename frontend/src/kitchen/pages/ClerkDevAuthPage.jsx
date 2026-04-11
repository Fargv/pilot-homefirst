import React, { useEffect } from "react";
import { SignIn, SignUp, UserButton, useAuth as useClerkAuth, useClerk, useUser } from "@clerk/react";
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
  const { user, loading, clearSession, refreshUser } = useAuth();
  const { isSignedIn } = useClerkAuth();
  const clerk = useClerk();
  const { user: clerkUser } = useUser();
  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress || clerkUser?.emailAddresses?.[0]?.emailAddress || "";
  const clerkIdentity = clerkEmail || clerkUser?.username || clerkUser?.id || "Unknown Clerk user";

  const signOutForTesting = async () => {
    clearSession();
    await clerk.signOut({ redirectUrl: "/dev/clerk-auth" });
  };

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
            `/dev/clerk-auth` is the Clerk testing path. `/login` and `/register` remain the legacy Mongo/JWT pages.
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
            <div className="kitchen-auth-card" style={{ marginTop: 16 }}>
              <p className="kitchen-auth-kicker">Signed-in section</p>
              <h3 className="kitchen-login-title" style={{ fontSize: 24 }}>Clerk session is active</h3>
              <p className="kitchen-login-subtitle">
                The Clerk sign-in form is hidden because you are already signed in. Sign out here to test another Clerk login.
              </p>
              <div className="kitchen-alert success">
                <strong>Clerk identity:</strong> {clerkIdentity}
              </div>
              <div className="kitchen-alert info">
                <strong>Mongo mapping:</strong>{" "}
                {loading ? "Resolving Mongo user..." : user?.email ? `${user.email} (${user.role || "role unknown"})` : "not resolved yet"}
              </div>
              <div className="kitchen-actions" style={{ alignItems: "center" }}>
                <UserButton afterSignOutUrl="/dev/clerk-auth" />
                <button type="button" className="kitchen-button secondary" onClick={() => refreshUser()}>
                  Refresh Mongo mapping
                </button>
                <button type="button" className="kitchen-button secondary" onClick={signOutForTesting}>
                  Sign out to test another Clerk account
                </button>
                <button type="button" className="kitchen-button" onClick={() => navigate("/kitchen/semana")}>
                  Open app after Clerk auth
                </button>
              </div>
            </div>
          ) : null}

          {!isSignedIn ? (
            <div className="kitchen-auth-card" style={{ marginTop: 16 }}>
              <p className="kitchen-auth-kicker">Signed-out section</p>
              <h3 className="kitchen-login-title" style={{ fontSize: 24 }}>Create or sign in with Clerk</h3>
              <p className="kitchen-login-subtitle">
                Use these Clerk components to create real Clerk users. The backend will then resolve the Clerk session back to Mongo by email.
              </p>
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
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
