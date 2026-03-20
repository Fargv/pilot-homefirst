import React, { useMemo, useState } from "react";
import ModalSheet from "./ui/ModalSheet.jsx";

function ShareIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M15 8.5a3.5 3.5 0 1 0-6.8 1.2L4.7 12.1a3.2 3.2 0 0 0 0-.1 3.5 3.5 0 1 0 1 2.4l3.5-2.4a3.5 3.5 0 0 0 5.6 0l3.5 2.3a3.5 3.5 0 1 0 .8-1.2l-3.4-2.3A3.5 3.5 0 0 0 15 8.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WhatsAppIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 3.8a8.2 8.2 0 0 0-7 12.5L4 20l3.9-1A8.2 8.2 0 1 0 12 3.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.4 8.9c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.4-.2.3-.8.8-.8 1.9s.8 2.1.9 2.3c.1.1 1.5 2.3 3.7 3.1 1.8.7 2.2.6 2.6.6.4-.1 1.3-.5 1.5-1 .2-.6.2-1 .1-1.1-.1-.1-.4-.2-.9-.5s-1-.5-1.1-.5c-.2-.1-.3-.1-.5.1-.1.2-.6.7-.7.8-.1.1-.3.1-.5 0-.2-.1-1-.4-1.8-1.2-.7-.7-1.2-1.6-1.4-1.8-.1-.2 0-.3.1-.4.1-.1.2-.3.4-.4.1-.1.2-.3.3-.4.1-.2 0-.3 0-.5-.1-.1-.5-1.2-.7-1.7Z" fill="currentColor" />
    </svg>
  );
}

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
  iconOnly = false
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
      <button
        type="button"
        className={`kitchen-share-trigger ${iconOnly ? "is-icon-only" : ""} ${className}`.trim()}
        aria-label={buttonLabel}
        title={buttonLabel}
        onClick={() => {
          setStatus("");
          setOpen(true);
        }}
      >
        <ShareIcon className="kitchen-share-trigger-icon" />
        {!iconOnly ? <span>{buttonLabel}</span> : null}
      </button>
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
