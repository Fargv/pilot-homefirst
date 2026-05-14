import React from "react";
import { usePwaInstallPrompt } from "../hooks/usePwaInstallPrompt";

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PhoneDownloadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v5m0 0-2-2m2 2 2-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="18.5" r="0.8" fill="currentColor" />
    </svg>
  );
}

function ShareIosIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "inline", verticalAlign: "middle", margin: "0 1px" }}>
      <path d="M12 3v12M8 7l4-4 4 4M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Floating bottom banner that suggests installing the PWA.
 * Renders null on desktop, standalone mode, already-installed, or dismissed.
 */
export default function PwaInstallPrompt() {
  const { shouldShow, isIos, canInstall, promptInstall, dismiss } = usePwaInstallPrompt();

  // On Android/Chrome we need the deferred prompt; on iOS we always show the guide.
  if (!shouldShow) return null;
  if (!isIos && !canInstall) return null;

  return (
    <div className="pwa-prompt" role="complementary" aria-label="Instalar aplicación">
      <div className="pwa-prompt-card">
        <div className="pwa-prompt-header">
          <div className="pwa-prompt-icon-wrap">
            <PhoneDownloadIcon />
          </div>
          <div className="pwa-prompt-title-wrap">
            <strong className="pwa-prompt-title">Instala Lunchfy en tu móvil</strong>
            <span className="pwa-prompt-subtitle">Ábrela como una app, sin buscarla en el navegador.</span>
          </div>
          <button
            type="button"
            className="pwa-prompt-close"
            aria-label="Cerrar"
            onClick={() => dismiss(false)}
          >
            <CloseIcon />
          </button>
        </div>

        {isIos ? (
          <div className="pwa-prompt-body">
            <ol className="pwa-prompt-steps">
              <li className="pwa-prompt-step">
                Toca el botón <strong>Compartir</strong> <ShareIosIcon /> en Safari
              </li>
              <li className="pwa-prompt-step">
                Elige <strong>"Añadir a pantalla de inicio"</strong>
              </li>
              <li className="pwa-prompt-step">
                Confirma tocando <strong>"Añadir"</strong>
              </li>
            </ol>
            <div className="pwa-prompt-actions">
              <button type="button" className="kitchen-button secondary" onClick={() => dismiss(true)}>
                No mostrar de nuevo
              </button>
              <button type="button" className="kitchen-button" onClick={() => dismiss(false)}>
                Entendido
              </button>
            </div>
          </div>
        ) : (
          <div className="pwa-prompt-body">
            <div className="pwa-prompt-actions">
              <button type="button" className="kitchen-button secondary" onClick={() => dismiss(false)}>
                Ahora no
              </button>
              <button type="button" className="kitchen-button" onClick={promptInstall}>
                Instalar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Settings block for manual PWA install guidance.
 * Always shows if on mobile and not yet installed/standalone (ignores dismiss state).
 */
export function PwaInstallSettingsBlock() {
  const { isStandalone, isIos, isMobile, canInstall, promptInstall } = usePwaInstallPrompt({ ignoreDismissed: true });

  if (!isMobile) return null;

  if (isStandalone) {
    return (
      <div className="settings-block">
        <div className="settings-coming-row">
          <span>Instalar Lunchfy</span>
          <span className="kitchen-pill">Ya instalada</span>
        </div>
        <p className="kitchen-muted">La app ya está instalada en este dispositivo como aplicación.</p>
      </div>
    );
  }

  return (
    <div className="settings-block">
      <h3 className="settings-subtitle">Instalar Lunchfy en este dispositivo</h3>
      {isIos ? (
        <>
          <p className="kitchen-muted">Para instalar Lunchfy en tu iPhone o iPad, sigue estos pasos desde Safari:</p>
          <ol className="pwa-settings-steps">
            <li>Toca el botón <strong>Compartir</strong> <ShareIosIcon /> en la barra de Safari</li>
            <li>Elige <strong>"Añadir a pantalla de inicio"</strong></li>
            <li>Confirma tocando <strong>"Añadir"</strong></li>
          </ol>
        </>
      ) : canInstall ? (
        <>
          <p className="kitchen-muted">Instala la app en tu dispositivo para abrirla directamente sin el navegador.</p>
          <button type="button" className="kitchen-button" style={{ marginTop: "8px" }} onClick={promptInstall}>
            Instalar ahora
          </button>
        </>
      ) : (
        <p className="kitchen-muted">
          Para instalar Lunchfy, ábrela desde Chrome o Edge en Android y busca la opción "Instalar app" en el menú del navegador.
        </p>
      )}
    </div>
  );
}
