import React from "react";
import "./DevEnvironmentBanner.css";

const isDevelopmentEnvironment =
  import.meta.env.DEV && import.meta.env.VITE_APP_ENV === "development";

export default function DevEnvironmentBanner() {
  if (!isDevelopmentEnvironment) {
    return null;
  }

  return (
    <>
      <div className="dev-environment-banner" role="status" aria-live="polite">
        <span className="dev-environment-banner__text">
          ⚠ DEV ENVIRONMENT — HomeFirst Development
        </span>
      </div>
      <div className="dev-environment-banner-spacer" aria-hidden="true" />
    </>
  );
}
