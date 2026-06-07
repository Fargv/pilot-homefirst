import React, { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api.js";
import { buildClerkInviteCodeShareUrl, buildClerkInviteShareUrl, buildInviteShareUrl } from "../deepLinks.js";
import ShareWhatsAppButton from "./ShareWhatsAppButton.jsx";
import { isUserLimitReachedError } from "../subscription.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(rawValue) {
  return String(rawValue || "")
    .split(/[\s,;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export default function SettingsSharePanel({
  isDiod,
  user,
  householdName,
  initialHouseholdCode,
  canAddUsers = true,
  userLimitMessage = "",
  onBack
}) {
  const [emails, setEmails] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [inlineError, setInlineError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState([]);
  const [households, setHouseholds] = useState([]);
  const [householdsLoading, setHouseholdsLoading] = useState(false);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState(user?.activeHouseholdId || "");
  const [householdCode, setHouseholdCode] = useState(initialHouseholdCode || "");
  const [loadingCode, setLoadingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedClerkLink, setCopiedClerkLink] = useState(false);
  const [recentInvitations, setRecentInvitations] = useState([]);
  const [shareInvite, setShareInvite] = useState(null);

  const shareHouseholdId = isDiod ? selectedHouseholdId : (user?.activeHouseholdId || user?.householdId || "");
  const selectedHousehold = useMemo(
    () => households.find((item) => String(item.id) === String(selectedHouseholdId)) || null,
    [households, selectedHouseholdId]
  );
  const shareHouseholdName = isDiod ? selectedHousehold?.name || "household" : (householdName || "household");
  const canSend = emails.length > 0 && (!isDiod || Boolean(selectedHouseholdId)) && !sending && canAddUsers;

  const addEmails = (rawValue) => {
    const candidates = parseEmails(rawValue);
    if (!candidates.length) return;

    const invalid = candidates.filter((email) => !EMAIL_RE.test(email));
    if (invalid.length) {
      setInlineError(`Revisa estos emails: ${invalid.join(", ")}`);
      return;
    }

    const deduped = [];
    const existing = new Set(emails);
    for (const email of candidates) {
      if (existing.has(email)) continue;
      existing.add(email);
      deduped.push(email);
    }

    if (!deduped.length) {
      setInlineError("Esos emails ya están en la lista.");
      return;
    }

    setEmails((prev) => [...prev, ...deduped]);
    setInputValue("");
    setInlineError("");
    setSubmitError("");
  };

  const removeEmail = (emailToRemove) => {
    setEmails((prev) => prev.filter((email) => email !== emailToRemove));
  };

  const onInputKeyDown = (event) => {
    if (event.key === "Enter" || event.key === "," || event.key === ";" || event.key === "Tab") {
      const hasCandidate = parseEmails(inputValue).length > 0;
      if (!hasCandidate) return;
      event.preventDefault();
      addEmails(inputValue);
    }
    if (event.key === "Backspace" && !inputValue && emails.length) {
      event.preventDefault();
      removeEmail(emails[emails.length - 1]);
    }
  };

  const loadShareContext = async (targetHouseholdId) => {
    if (!targetHouseholdId) {
      setHouseholdCode("");
      setRecentInvitations([]);
      return;
    }

    setLoadingCode(true);
    setSubmitError("");
    try {
      const query = isDiod ? `?householdId=${encodeURIComponent(targetHouseholdId)}` : "";
      const [codeData, invitationData] = await Promise.all([
        apiRequest(`/api/kitchen/household/invite-code${query}`),
        apiRequest(`/api/kitchen/household/invitations${query}`)
      ]);
      setHouseholdCode(codeData?.inviteCode || "");
      setRecentInvitations((invitationData?.invitations || []).slice(0, 5));
    } catch (error) {
      setSubmitError(error.message || "No se pudo cargar la información para compartir.");
      setHouseholdCode("");
      setRecentInvitations([]);
    } finally {
      setLoadingCode(false);
    }
  };

  useEffect(() => {
    if (!isDiod) return;
    let active = true;
    setHouseholdsLoading(true);
    apiRequest("/api/kitchen/admin/households")
      .then((data) => {
        if (!active) return;
        const nextHouseholds = data?.households || [];
        setHouseholds(nextHouseholds);
        setSelectedHouseholdId((current) => {
          if (current && nextHouseholds.some((item) => String(item.id) === String(current))) return current;
          return data?.activeHouseholdId || "";
        });
      })
      .catch((error) => {
        if (!active) return;
        setSubmitError(error.message || "No se pudieron cargar los households.");
      })
      .finally(() => {
        if (active) setHouseholdsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isDiod]);

  useEffect(() => {
    if (!isDiod) {
      setHouseholdCode(initialHouseholdCode || "");
    }
  }, [initialHouseholdCode, isDiod]);

  useEffect(() => {
    if (!shareHouseholdId) {
      if (isDiod) {
        setHouseholdCode("");
        setRecentInvitations([]);
      }
      return;
    }
    void loadShareContext(shareHouseholdId);
  }, [isDiod, shareHouseholdId]);

  useEffect(() => {
    if (!copiedCode) return;
    const timer = setTimeout(() => setCopiedCode(false), 900);
    return () => clearTimeout(timer);
  }, [copiedCode]);

  useEffect(() => {
    if (!copiedClerkLink) return;
    const timer = setTimeout(() => setCopiedClerkLink(false), 900);
    return () => clearTimeout(timer);
  }, [copiedClerkLink]);

  const generateCode = async () => {
    if (!shareHouseholdId) {
      setSubmitError("Selecciona primero el household al que quieres invitar.");
      return;
    }
    setLoadingCode(true);
    setSubmitError("");
    try {
      const data = await apiRequest("/api/kitchen/household/invite-code", {
        method: "POST",
        body: JSON.stringify(isDiod ? { householdId: shareHouseholdId } : {})
      });
      setHouseholdCode(data?.inviteCode || "");
      setSuccessMessage("Código de household listo para compartir.");
    } catch (error) {
      setSubmitError(error.message || "No se pudo generar el código del household.");
    } finally {
      setLoadingCode(false);
    }
  };

  const copyCode = async () => {
    if (!householdCode) return;
    try {
      await navigator.clipboard.writeText(householdCode);
      setCopiedCode(true);
    } catch {
      setSubmitError("No se pudo copiar el código.");
    }
  };

  const copyClerkInviteCodeLink = async () => {
    if (!householdCode) return;
    try {
      await navigator.clipboard.writeText(buildClerkInviteCodeShareUrl(householdCode));
      setCopiedClerkLink(true);
    } catch {
      setSubmitError("No se pudo copiar el link de Clerk.");
    }
  };

  const prepareInviteShare = async () => {
    if (!shareHouseholdId) {
      setSubmitError("Selecciona primero el household al que quieres invitar.");
      return;
    }
    if (!canAddUsers) {
      setSubmitError(userLimitMessage || "You have reached the user limit for your current license.");
      return;
    }
    setSubmitError("");
    try {
      const data = await apiRequest("/api/kitchen/household/invitations", {
        method: "POST",
        body: JSON.stringify(isDiod ? { householdId: shareHouseholdId } : {})
      });
      const inviteUrl = data?.inviteLink || buildInviteShareUrl(data?.token || "");
      const clerkInviteUrl = data?.clerkInviteLink || buildClerkInviteShareUrl(data?.token || "");
      setShareInvite({
        id: "household-invite",
        label: "Invitar al hogar",
        description: "Comparte un acceso con token seguro. La otra persona puede crear cuenta con Clerk y unirse al hogar.",
        url: clerkInviteUrl || inviteUrl,
        message: `Join my household in HomeFirst: ${clerkInviteUrl || inviteUrl}`
      });
      await loadShareContext(shareHouseholdId);
    } catch (error) {
      if (isUserLimitReachedError(error)) {
        setSubmitError(userLimitMessage || "You have reached the user limit for your current license.");
        return;
      }
      setSubmitError(error.message || "No se pudo preparar la invitacion para compartir.");
    }
  };

  const sendInvitations = async () => {
    if (!canSend) return;
    setSending(true);
    setSubmitError("");
    setSuccessMessage("");
    setResults([]);
    try {
      const payload = {
        emails,
        ...(isDiod ? { householdId: shareHouseholdId } : {})
      };
      const data = await apiRequest("/api/kitchen/household/invitations/email", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setResults(data?.results || []);
      setSuccessMessage(
        data?.failedCount
          ? `Se enviaron ${data.sentCount} invitaciones y ${data.failedCount} quedaron pendientes.`
          : `Invitaciones enviadas a ${data?.sentCount || emails.length} personas.`
      );
      setEmails((prev) => prev.filter((email) => (data?.results || []).some((result) => result.email === email && !result.ok)));
      setInputValue("");
      setHouseholdCode(data?.household?.inviteCode || householdCode);
      await loadShareContext(shareHouseholdId);
    } catch (error) {
      if (isUserLimitReachedError(error)) {
        setSubmitError(userLimitMessage || "You have reached the user limit for your current license.");
        return;
      }
      setSubmitError(error.message || "No se pudieron enviar las invitaciones.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <button type="button" className="kitchen-button secondary" onClick={onBack}>Volver</button>
        <h2>Compartir</h2>
      </div>

      <div className="settings-share-hero">
        <div>
          <span className="settings-share-eyebrow">Invitaciones por email</span>
          <h3>Invita a alguien a {shareHouseholdName}</h3>
          <p>
            El camino principal ahora es simple: escribe uno o varios emails y Lunchfy enviará una invitación bonita,
            clara y con acceso directo. El código del household sigue aquí como plan B.
          </p>
        </div>
        <div className="settings-share-hero-actions">
          <button type="button" className="kitchen-button secondary" onClick={() => void prepareInviteShare()} disabled={!canAddUsers}>
            Preparar link
          </button>
          <ShareWhatsAppButton
            iconOnly
            buttonLabel="Compartir invitacion"
            title="Invitar al hogar"
            items={shareInvite ? [shareInvite] : []}
          />
        </div>
      </div>

      <div className="settings-block">
        {!canAddUsers ? (
          <div className="settings-budget-locked-card">
            <p className="kitchen-muted">{userLimitMessage || "You have reached the user limit for your current license."}</p>
            <button type="button" className="kitchen-button secondary" onClick={() => window.location.assign("/kitchen/upgrade")}>Upgrade your license</button>
          </div>
        ) : null}
        {isDiod ? (
          <label className="kitchen-field">
            <span className="kitchen-label">Household de destino</span>
            <select
              className="kitchen-select"
              value={selectedHouseholdId}
              onChange={(event) => setSelectedHouseholdId(event.target.value)}
              disabled={householdsLoading}
            >
              <option value="">Selecciona un household</option>
              {households.map((household) => (
                <option key={household.id} value={household.id}>
                  {household.name}{household.isActive ? " · activo" : ""}
                </option>
              ))}
            </select>
            <p className="kitchen-muted">
              {householdsLoading ? "Cargando households..." : "DIOD puede invitar a cualquier household, pero debe elegirlo aquí primero."}
            </p>
          </label>
        ) : null}

        <div className="settings-share-composer">
          <label className="kitchen-label" htmlFor="share-email-input">Emails</label>
          <div className={`settings-email-composer ${inlineError ? "has-error" : ""}`}>
            <div className="settings-email-chip-list">
              {emails.map((email) => (
                <span key={email} className="settings-email-chip">
                  {email}
                  <button type="button" onClick={() => removeEmail(email)} aria-label={`Quitar ${email}`}>×</button>
                </span>
              ))}
              <input
                id="share-email-input"
                className="settings-email-input"
                type="email"
                value={inputValue}
                disabled={!canAddUsers}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="ana@email.com, luis@email.com"
              />
            </div>
            <button type="button" className="kitchen-button secondary" onClick={() => addEmails(inputValue)} disabled={!canAddUsers}>
              Añadir
            </button>
          </div>
          <p className="kitchen-muted">Pulsa Enter, coma o tab para añadir varios emails sin fricción.</p>
          {inlineError ? <div className="kitchen-alert error">{inlineError}</div> : null}
        </div>

        <div className="settings-share-actions">
          <button type="button" className="kitchen-button" disabled={!canSend} onClick={sendInvitations}>
            {sending ? "Enviando invitaciones..." : `Enviar ${emails.length ? `(${emails.length})` : ""}`}
          </button>
        </div>

        {submitError ? <div className="kitchen-alert error">{submitError}</div> : null}
        {successMessage ? <div className="kitchen-alert success">{successMessage}</div> : null}
      </div>

      <div className="settings-share-grid">
        <div className="settings-block">
          <div className="settings-inline-heading">
            <h3 className="settings-subtitle">Opción 2: código de household</h3>
            {!householdCode ? (
              <button type="button" className="settings-mini-button" onClick={generateCode} disabled={loadingCode}>
                {loadingCode ? "Preparando..." : "Generar"}
              </button>
            ) : null}
          </div>
          <p className="kitchen-muted">
            Si alguien prefiere registrarse manualmente, puede usar este código durante el alta.
          </p>
          <div className="settings-share-code-card">
            <strong>{loadingCode ? "Cargando..." : (householdCode || "Sin código generado")}</strong>
            <button
              type="button"
              className={`settings-mini-icon ${copiedCode ? "is-copied" : ""}`}
              onClick={copyCode}
              disabled={!householdCode}
              aria-label="Copiar código de household"
            >
              {copiedCode ? "OK" : "Copiar"}
            </button>
            <button
              type="button"
              className={`settings-mini-icon ${copiedClerkLink ? "is-copied" : ""}`}
              onClick={copyClerkInviteCodeLink}
              disabled={!householdCode}
              aria-label="Copiar link de invitacion con Clerk"
            >
              {copiedClerkLink ? "OK" : "Link Clerk"}
            </button>
          </div>
          <p className="kitchen-muted">
            El link Clerk abre el alta segura y pre-rellena este codigo para unirse al hogar.
          </p>
        </div>

        <div className="settings-block">
          <div className="settings-inline-heading">
            <h3 className="settings-subtitle">Actividad reciente</h3>
            <span className="kitchen-pill">{recentInvitations.length} activas</span>
          </div>
          {recentInvitations.length ? (
            <ul className="settings-share-activity">
              {recentInvitations.map((invitation) => (
                <li key={invitation.id}>
                  <strong>{invitation.recipientEmail || "Invitación manual"}</strong>
                  <span>Caduca {new Date(invitation.expiresAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="kitchen-muted">Todavía no hay invitaciones activas para este household.</p>
          )}
        </div>
      </div>

      {results.length ? (
        <div className="settings-block">
          <div className="settings-inline-heading">
            <h3 className="settings-subtitle">Resultado del envío</h3>
          </div>
          <ul className="settings-share-results">
            {results.map((result) => (
              <li key={result.email} className={result.ok ? "is-success" : "is-error"}>
                <strong>{result.email}</strong>
                <span>{result.ok ? "Invitación enviada" : (result.error || "No se pudo enviar")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
