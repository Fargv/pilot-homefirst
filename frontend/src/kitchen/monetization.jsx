import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "./api.js";
import { useAuth } from "./auth.jsx";
import { applySubscriptionsEnabled, isSubscriptionsFlagResolved } from "./monetizationState.js";

const MonetizationContext = createContext(null);

export function MonetizationProvider({ children }) {
  const { loading: authLoading } = useAuth();
  const [subscriptionsEnabled, setSubscriptionsEnabled] = useState(null);

  useEffect(() => {
    if (authLoading) return undefined;

    let active = true;
    setSubscriptionsEnabled(null);
    apiRequest("/api/users/bootstrap-needed", { authMode: "none" })
      .then((data) => {
        if (active) {
          setSubscriptionsEnabled((current) => applySubscriptionsEnabled(current, data?.subscriptionsEnabled));
        }
      })
      .catch(() => {
        // Keep the UI hidden while the public flag is unresolved. A later
        // authenticated /me response can still provide the definitive value.
      });

    return () => {
      active = false;
    };
  }, [authLoading]);

  const value = useMemo(
    () => ({
      subscriptionsEnabled,
      setSubscriptionsEnabled,
      subscriptionsFlagLoaded: isSubscriptionsFlagResolved(subscriptionsEnabled)
    }),
    [subscriptionsEnabled]
  );

  return <MonetizationContext.Provider value={value}>{children}</MonetizationContext.Provider>;
}

export function useMonetization() {
  const context = useContext(MonetizationContext);
  if (!context) throw new Error("MonetizationProvider faltante");
  return context;
}

export function useSubscriptionsEnabled() {
  return useMonetization().subscriptionsEnabled;
}
