import React, { useEffect, useState } from "react";
import { UserButton, useAuth as useClerkAuth, useClerk, useUser } from "@clerk/react";
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
              Back to login
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
              Back to login
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
  const { user, loading, onboardingRequired, lastAuthError, clearSession, refreshUser } = useAuth();
  const { isLoaded, isSignedIn } = useClerkAuth();
  const clerk = useClerk();
  const { user: clerkUser } = useUser();
  const [mappingError, setMappingError] = useState("");
  const [lastAction, setLastAction] = useState("waiting");
  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress || clerkUser?.emailAddresses?.[0]?.emailAddress || "";
  const clerkIdentity = clerkEmail || clerkUser?.username || clerkUser?.id || "Unknown Clerk user";

  const signOutForTesting = async () => {
    clearSession();
    setLastAction("signed-out");
    await clerk.signOut({ redirectUrl: "/dev/clerk-auth" });
  };

  const openAppAfterClerkAuth = async () => {
    setMappingError("");
    setLastAction("bootstrap-started");
    console.info("[clerk][dev] Manual DEV handoff requested from /dev/clerk-auth", { isSignedIn, email: clerkEmail });
    const nextUser = await refreshUser({ authMode: "clerk" });

    if (nextUser?.onboardingRequired || onboardingRequired) {
      setLastAction("onboarding-required");
      console.info("[clerk][dev] Manual DEV handoff requires onboarding", { email: clerkEmail });
      navigate("/onboarding/clerk");
      return;
    }

    if (nextUser?.id) {
      setLastAction("mapped");
      console.info("[clerk][dev] Manual DEV handoff resolved Mongo user", {
        userId: nextUser.id,
        email: nextUser.email,
        householdId: nextUser.householdId
      });
      navigate("/kitchen/semana");
      return;
    }

    setLastAction("mapping-failed");
    setMappingError(
      nextUser?.error
        ? `${nextUser.error.code || "AUTH_ERROR"} (${nextUser.error.status || "sin status"}): ${nextUser.error.message}`
        : "No se pudo resolver el usuario interno de Mongo. Revisa la consola del backend."
    );
  };

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setLastAction("auto-bootstrap-started");
    void refreshUser({ authMode: "clerk" }).then((nextUser) => {
      if (nextUser?.onboardingRequired) {
        setLastAction("onboarding-required");
        return;
      }
      if (nextUser?.id) {
        setLastAction("mapped");
        return;
      }
      setLastAction("not-mapped");
    });
  }, [isLoaded, isSignedIn, refreshUser]);

  return (
    <div className="kitchen-app">
      <div className="kitchen-container kitchen-login-wrap">
        <Card className="kitchen-auth-card">
          <p className="kitchen-auth-kicker">DEV ONLY - Clerk diagnostics</p>
          <h2 className="kitchen-login-title">Clerk auth test hub</h2>
          <p className="kitchen-login-subtitle">
            This page no longer mounts competing Clerk forms. Use the dedicated routes below so sign-up, verification, and sign-in each have a stable path.
          </p>
          <div className="kitchen-alert info">
            `/dev/clerk-auth` is diagnostics only. `/auth/clerk/sign-up` creates real Clerk users, and `/auth/clerk/sign-in` signs them in.
            `/login` and `/register` remain the email/password Mongo/JWT pages.
          </div>

          <div className="kitchen-actions" style={{ marginBottom: 16 }}>
            <button type="button" className="kitchen-button" onClick={() => navigate("/auth/clerk/sign-up")}>
              Test Clerk sign-up
            </button>
            <button type="button" className="kitchen-button secondary" onClick={() => navigate("/auth/clerk/sign-in")}>
              Test Clerk sign-in
            </button>
            <button type="button" className="kitchen-button secondary" onClick={() => navigate("/auth/clerk/complete")}>
              Resume Clerk handoff
            </button>
          </div>

          <div className="kitchen-actions" style={{ marginBottom: 16 }}>
            <button type="button" className="kitchen-button secondary" onClick={() => navigate("/login")}>
              Email login
            </button>
            <button type="button" className="kitchen-button secondary" onClick={() => navigate("/register")}>
              Email register
            </button>
            <button type="button" className="kitchen-button" onClick={openAppAfterClerkAuth} disabled={!isSignedIn}>
              Open app after Clerk auth
            </button>
          </div>

          {mappingError ? <div className="kitchen-alert error">{mappingError}</div> : null}

          {isSignedIn ? (
            <div className="kitchen-auth-card" style={{ marginTop: 16 }}>
              <p className="kitchen-auth-kicker">Signed-in section</p>
              <h3 className="kitchen-login-title" style={{ fontSize: 24 }}>Clerk session is active</h3>
              <p className="kitchen-login-subtitle">
                The sign-in form is hidden because Clerk already has an active session. Sign out here to test another account.
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
                <button type="button" className="kitchen-button secondary" onClick={() => refreshUser({ authMode: "clerk" })}>
                  Refresh Mongo mapping
                </button>
                <button type="button" className="kitchen-button secondary" onClick={signOutForTesting}>
                  Sign out to test another account
                </button>
                <button type="button" className="kitchen-button" onClick={openAppAfterClerkAuth}>
                  Open app after Clerk auth
                </button>
              </div>
            </div>
          ) : (
            <div className="kitchen-auth-card" style={{ marginTop: 16 }}>
              <p className="kitchen-auth-kicker">Signed-out section</p>
              <h3 className="kitchen-login-title" style={{ fontSize: 24 }}>Start a Clerk flow</h3>
              <p className="kitchen-login-subtitle">
                Choose sign-up to create a real Clerk user. Choose sign-in for an existing Clerk account.
              </p>
            </div>
          )}

          <div className="kitchen-auth-card" style={{ marginTop: 16 }}>
            <p className="kitchen-auth-kicker">DEV debug</p>
            <div className="kitchen-alert info">
              <strong>Clerk auth state:</strong> {isLoaded ? (isSignedIn ? "signed in" : "signed out") : "loading"}
              <br />
              <strong>Clerk identity:</strong> {isSignedIn ? clerkIdentity : "none"}
              <br />
              <strong>Mongo mapping state:</strong>{" "}
              {loading ? "resolving" : user?.email ? `mapped to ${user.email}` : mappingError ? "mapping failed" : "not resolved"}
              <br />
              <strong>Onboarding state:</strong> {onboardingRequired ? "required" : user?.id ? "complete" : "unknown"}
              <br />
              <strong>Last backend auth error:</strong>{" "}
              {lastAuthError ? `${lastAuthError.code} / ${lastAuthError.status}: ${lastAuthError.message}` : "none"}
              <br />
              <strong>Last action:</strong> {lastAction}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
