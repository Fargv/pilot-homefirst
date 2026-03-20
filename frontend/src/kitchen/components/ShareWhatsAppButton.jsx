import React, { useMemo, useState } from "react";
import ModalSheet from "./ui/ModalSheet.jsx";
import WhatsAppIconButton, { WhatsAppIcon } from "./WhatsAppIconButton.jsx";

function CopyIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

async function copyText(value) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  throw new Error("No se pudo copiar el enlace.");
}

function buildWhatsAppHref(message) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export default function ShareWhatsAppButton({
  items,
  buttonLabel = "Compartir",
  title = "Compartir",
  className = "",
  iconOnly = false,
  size = 22
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const shareSupported = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const safeItems = useMemo(
    () => (Array.isArray(items) ? items.filter((item) => item?.url && item?.message) : []),
    [items]
  );

  const handleCopy = async (item) => {
    try {
      await copyText(item.url);
      setStatus(`Enlace copiado: ${item.label}`);
    } catch (error) {
      setStatus(error.message || "No se pudo copiar el enlace.");
    }
  };

  const handleNativeShare = async (item) => {
    if (!shareSupported) return;
    try {
      await navigator.share({
        title: item.label,
        text: item.message,
        url: item.url
      });
      setStatus(`Compartido: ${item.label}`);
    } catch (error) {
      if (error?.name === "AbortError") return;
      setStatus(error.message || "No se pudo compartir.");
    }
  };

  if (!safeItems.length) return null;

  return (
    <>
      {iconOnly ? (
        <WhatsAppIconButton
          className={className}
          ariaLabel={buttonLabel}
          title={buttonLabel}
          size={size}
          onClick={() => {
            setStatus("");
            setOpen(true);
          }}
        />
      ) : (
        <button
          type="button"
          className={`kitchen-share-trigger ${className}`.trim()}
          aria-label={buttonLabel}
          title={buttonLabel}
          onClick={() => {
            setStatus("");
            setOpen(true);
          }}
        >
          <WhatsAppIcon className="kitchen-share-trigger-icon" size={size} />
          <span>{buttonLabel}</span>
        </button>
      )}
      <ModalSheet
        open={open}
        title={title}
        onClose={() => setOpen(false)}
        actions={(
          <button type="button" className="kitchen-button secondary" onClick={() => setOpen(false)}>
            Cerrar
          </button>
        )}
      >
        <div className="kitchen-share-sheet">
          {safeItems.map((item) => (
            <div key={item.id || item.label} className="kitchen-share-option-card">
              <div className="kitchen-share-option-copy">
                <h4>{item.label}</h4>
                {item.description ? <p className="kitchen-muted">{item.description}</p> : null}
              </div>
              <div className="kitchen-share-option-actions">
                <a
                  className="kitchen-button kitchen-share-action"
                  href={buildWhatsAppHref(item.message)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <WhatsAppIcon className="kitchen-share-action-icon" />
                  WhatsApp
                </a>
                {shareSupported ? (
                  <button type="button" className="kitchen-button secondary kitchen-share-action" onClick={() => void handleNativeShare(item)}>
                    Compartir
                  </button>
                ) : null}
                <button type="button" className="kitchen-button secondary kitchen-share-action" onClick={() => void handleCopy(item)}>
                  <CopyIcon className="kitchen-share-action-icon" />
                  Copiar link
                </button>
              </div>
            </div>
          ))}
          {status ? <div className="kitchen-alert success">{status}</div> : null}
        </div>
      </ModalSheet>
    </>
  );
}
