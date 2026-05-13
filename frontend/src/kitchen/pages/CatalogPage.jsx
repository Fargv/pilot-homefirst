import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api.js";
import KitchenLayout from "../Layout.jsx";
import { useAuth } from "../auth.jsx";
import { canUseDietRandomization } from "../subscription.js";
import { resolvePackCoverImageUrl } from "../utils/packImages.js";

const TABS = [
  { id: "all", label: "Todos" },
  { id: "included", label: "En mi plan" },
  { id: "diet", label: "Dieta" },
  { id: "new", label: "Nuevos" },
  { id: "healthy", label: "Saludables" },
  { id: "quick", label: "Rápidos" },
  { id: "special", label: "Especiales" }
];

const HEALTHY_TAGS = ["saludable", "healthy", "ligero", "light", "vegano", "vegetariano"];
const QUICK_TAGS = ["rápido", "quick", "fácil", "easy", "15min", "30min"];
const SPECIAL_TAGS = ["especial", "special", "festivo", "gourmet"];

function isNew(pack) {
  if (!pack.releaseDate) return false;
  const release = new Date(pack.releaseDate);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  return release >= cutoff;
}

function getFreeUntilDaysLeft(isFreeUntil) {
  if (!isFreeUntil) return null;
  const diff = new Date(isFreeUntil) - new Date();
  if (diff <= 0) return null;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function matchesTab(pack, tab) {
  if (tab === "all") return true;
  if (tab === "included") return pack.entitlement?.includedInPlan;
  if (tab === "diet") return Boolean(pack.isDietPack);
  if (tab === "new") return isNew(pack);
  const tags = (pack.tags || []).map((t) => t.toLowerCase());
  if (tab === "healthy") return tags.some((t) => HEALTHY_TAGS.includes(t));
  if (tab === "quick") return tags.some((t) => QUICK_TAGS.includes(t));
  if (tab === "special") return tags.some((t) => SPECIAL_TAGS.includes(t));
  return true;
}

function matchesSearch(pack, search) {
  if (!search) return true;
  const q = search.toLowerCase();
  return (
    (pack.title || "").toLowerCase().includes(q) ||
    (pack.subtitle || "").toLowerCase().includes(q) ||
    (pack.description || "").toLowerCase().includes(q) ||
    (pack.dietLabel || "").toLowerCase().includes(q)
  );
}

function PackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 40, height: 40 }}>
      <rect x="3" y="3" width="18" height="18" rx="4" fill="var(--color-primary, #6366f1)" opacity="0.12" />
      <path d="M8 9h8M8 12h5M8 15h6" stroke="var(--color-primary, #6366f1)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }}>
      <path d="M8 1l1.85 3.74L14 5.5l-3 2.92.71 4.13L8 10.5l-3.71 1.95.71-4.13L2 5.5l4.15-.76L8 1z" fill="#f59e0b" />
    </svg>
  );
}

function daysUntilMonthReset() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

function CatalogCreditsPanel({ plan, credits }) {
  const planLabel = { basic: "Basic", pro: "Pro", premium: "Premium" }[plan] || plan;
  const daysLeft = daysUntilMonthReset();

  if (!credits || credits.total === 0) {
    return (
      <div className="kitchen-card catalog-credits-panel catalog-credits-none">
        <span className="catalog-credits-plan">{planLabel}</span>
        <span className="catalog-credits-text">Tu plan no incluye packs mensuales</span>
        <a href="/kitchen/upgrade" className="kitchen-link catalog-credits-upgrade">Ver planes</a>
      </div>
    );
  }

  return (
    <div className="kitchen-card catalog-credits-panel">
      <span className="catalog-credits-plan">{planLabel}</span>
      <span className="catalog-credits-text">
        {credits.remaining === 0
          ? "Has usado todos tus packs de este mes"
          : credits.remaining === 1
            ? "Te queda 1 pack este mes"
            : `Te quedan ${credits.remaining} packs este mes`}
      </span>
      <span className="catalog-credits-dots">
        {Array.from({ length: credits.total }, (_, i) => (
          <span
            key={i}
            className={`catalog-credits-dot ${i < credits.remaining ? "active" : ""}`}
          />
        ))}
      </span>
      {credits.remaining < credits.total && (
        <span className="catalog-credits-reset">
          Se recarga en {daysLeft} {daysLeft === 1 ? "día" : "días"}
        </span>
      )}
      {credits.remaining === credits.total && (
        <span className="catalog-credits-reset">
          Recarga en {daysLeft} {daysLeft === 1 ? "día" : "días"}
        </span>
      )}
    </div>
  );
}

function EntitlementBadge({ entitlement }) {
  if (entitlement.installed) {
    return <span className="catalog-badge catalog-badge-installed">Ya instalado</span>;
  }
  if (entitlement.owned) {
    return <span className="catalog-badge catalog-badge-owned">En tu biblioteca</span>;
  }
  const daysLeft = getFreeUntilDaysLeft(entitlement.isFreeUntil);
  if (daysLeft !== null) {
    return <span className="catalog-badge catalog-badge-free-until">Gratis · {daysLeft}d</span>;
  }
  if (entitlement.isFree) {
    return <span className="catalog-badge catalog-badge-free">Gratis</span>;
  }
  if (entitlement.includedInPlan) {
    return <span className="catalog-badge catalog-badge-included">Incluido en tu plan</span>;
  }
  return <span className="catalog-badge catalog-badge-price">{formatPrice(entitlement.priceBasic)}</span>;
}

function formatPrice(price) {
  if (!price || price <= 0) return "Gratis";
  return `${Number(price).toFixed(2).replace(".", ",")} €`;
}

function PackCard({ pack, onAction }) {
  const { entitlement } = pack;
  const [loading, setLoading] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const coverUrl = resolvePackCoverImageUrl(pack.coverImage);

  useEffect(() => {
    setCoverFailed(false);
  }, [coverUrl]);

  const handleAction = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onAction(pack);
    } finally {
      setLoading(false);
    }
  };

  const actionLabel = (() => {
    if (entitlement.installed) return "Ya instalado";
    if (entitlement.owned) return "Instalar";
    if (entitlement.isFree) return "Instalar gratis";
    if (entitlement.canClaimWithPlan) return "Usar crédito mensual";
    if (entitlement.requiresPurchase) return `Comprar ${formatPrice(entitlement.priceBasic)}`;
    return "Instalar";
  })();

  const actionDisabled = entitlement.installed;
  const actionStyle = entitlement.requiresPurchase ? "purchase" : "primary";

  return (
    <div className={`kitchen-card catalog-pack-card ${pack.featured ? "catalog-pack-featured" : ""}`}>
      <div className="catalog-pack-cover">
        {coverUrl && !coverFailed
          ? <img src={coverUrl} alt={pack.title} className="catalog-pack-cover-img" onError={() => setCoverFailed(true)} />
          : <div className="catalog-pack-cover-placeholder"><PackIcon /></div>}
        {pack.featured && (
          <span className="catalog-pack-featured-badge"><StarIcon /> Destacado</span>
        )}
      </div>

      <div className="catalog-pack-body">
        <div className="catalog-pack-header">
          <h3 className="catalog-pack-title">{pack.title}</h3>
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            <EntitlementBadge entitlement={entitlement} />
          </div>
        </div>

        {pack.subtitle && <p className="catalog-pack-subtitle">{pack.subtitle}</p>}
        {pack.description && <p className="catalog-pack-description">{pack.description}</p>}

        {Array.isArray(pack.dishPreview) && pack.dishPreview.length > 0 && (
          <div className="catalog-pack-dish-preview">
            {pack.dishPreview.map((d, i) => (
              <div key={i} className="catalog-pack-dish-preview-item">
                <span className="catalog-pack-dish-preview-dot" aria-hidden="true">·</span>
                <span className="catalog-pack-dish-preview-name">{d.name}</span>
                {d.teaser && <span className="catalog-pack-dish-preview-teaser"> — {d.teaser}</span>}
              </div>
            ))}
            {pack.dishCount > pack.dishPreview.length && (
              <div className="catalog-pack-dish-preview-more">
                +{pack.dishCount - pack.dishPreview.length} platos más incluidos
              </div>
            )}
          </div>
        )}

        {(() => {
          const days = getFreeUntilDaysLeft(pack.entitlement?.isFreeUntil);
          return days !== null ? (
            <div className="catalog-pack-free-countdown">
              ⏳ Gratis todavía {days} {days === 1 ? "día" : "días"} más
            </div>
          ) : null;
        })()}

        <div className="catalog-pack-meta">
          <span className="catalog-pack-dish-count">{pack.dishCount} platos</span>
          {pack.tags && pack.tags.length > 0 && (
            <div className="catalog-pack-tags">
              {pack.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="catalog-pack-tag">{tag}</span>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className={`kitchen-btn catalog-pack-action ${actionStyle} ${actionDisabled ? "disabled" : ""}`}
          onClick={handleAction}
          disabled={actionDisabled || loading}
        >
          {loading ? "Procesando..." : actionLabel}
        </button>
      </div>
    </div>
  );
}

function PurchasePlaceholderModal({ pack, onClose }) {
  return (
    <div className="kitchen-modal-overlay" onClick={onClose}>
      <div className="kitchen-modal catalog-purchase-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="kitchen-modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        <div className="catalog-purchase-modal-icon">
          <PackIcon />
        </div>
        <h2 className="catalog-purchase-modal-title">Compra próximamente</h2>
        <p className="catalog-purchase-modal-text">
          La compra de packs individuales estará disponible próximamente. Por ahora, con el plan Pro o Premium
          puedes acceder a packs incluidos usando tus créditos mensuales.
        </p>
        <p className="catalog-purchase-modal-pack">Pack: <strong>{pack?.title}</strong></p>
        <div className="catalog-purchase-modal-actions">
          <a href="/kitchen/upgrade" className="kitchen-btn primary">Ver planes</a>
          <button type="button" className="kitchen-btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`kitchen-toast catalog-toast catalog-toast-${type}`}>
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="Cerrar">×</button>
    </div>
  );
}

function getDietPackDismissKey(packId) {
  return `diet_pack_modal_dismissed_${packId}`;
}

function isDietPackModalDismissed(packId) {
  try {
    return localStorage.getItem(getDietPackDismissKey(packId)) === "1";
  } catch {
    return false;
  }
}

function markDietPackModalDismissed(packId) {
  try {
    localStorage.setItem(getDietPackDismissKey(packId), "1");
  } catch {}
}

function DietPackInstallModal({ pack, onUseAsDefault, onDecline }) {
  const label = pack.dietLabel || pack.title;
  return (
    <div className="kitchen-modal-overlay" onClick={onDecline}>
      <div className="kitchen-modal catalog-purchase-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="kitchen-modal-close" onClick={onDecline} aria-label="Cerrar">×</button>
        <div className="catalog-purchase-modal-icon">
          <PackIcon />
        </div>
        <h2 className="catalog-purchase-modal-title">¿Usar esta dieta por defecto?</h2>
        <p className="catalog-purchase-modal-text">
          <strong>{label}</strong> está instalado. ¿Quieres usarlo por defecto al aleatorizar días y semanas?
        </p>
        <div className="catalog-purchase-modal-actions">
          <button type="button" className="kitchen-btn primary" onClick={onUseAsDefault}>Usar por defecto</button>
          <button type="button" className="kitchen-btn" onClick={onDecline}>Ahora no</button>
        </div>
        <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8, textAlign: "center" }}>
          Puedes cambiar esto más tarde en Configuración &rsaquo; Aleatorización por dieta.
        </p>
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [packs, setPacks] = useState([]);
  const [credits, setCredits] = useState(null);
  const [plan, setPlan] = useState("basic");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [purchaseModalPack, setPurchaseModalPack] = useState(null);
  const [dietInstallModal, setDietInstallModal] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const loadCatalog = useCallback(async () => {
    setError("");
    try {
      const data = await apiRequest("/api/kitchen/catalog/packs");
      setPacks(data.packs || []);
      setCredits(data.credits || null);
      setPlan(data.plan || "basic");
    } catch (err) {
      setError(err.message || "No se pudo cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const visiblePacks = useMemo(() => {
    const filtered = packs.filter((p) => matchesTab(p, activeTab) && matchesSearch(p, search));
    return [...filtered].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  }, [packs, activeTab, search]);

  const handlePackAction = useCallback(async (pack) => {
    const { entitlement } = pack;

    if (entitlement.installed) return;

    if (entitlement.requiresPurchase) {
      setPurchaseModalPack(pack);
      return;
    }

    if (!entitlement.owned && entitlement.canClaimWithPlan) {
      try {
        await apiRequest(`/api/kitchen/catalog/packs/${pack.id}/claim`, { method: "POST" });
      } catch (err) {
        if (!err.message?.includes("ya está en tu biblioteca")) {
          showToast(err.message || "Error al reclamar el pack.", "error");
          return;
        }
      }
    }

    try {
      const result = await apiRequest(`/api/kitchen/catalog/packs/${pack.id}/install`, { method: "POST" });

      if (result.alreadyInstalled) {
        showToast("Este pack ya estaba instalado.", "info");
      } else {
        showToast(`¡Pack instalado! ${result.dishesCreated} platos añadidos a tu biblioteca.`, "success");
        // Show diet-pack modal for Pro/Premium owners/admins if not already dismissed
        if (result.isDietPack && canUseDietRandomization(plan) && !isDietPackModalDismissed(String(pack.id))) {
          const isOwnerOrAdmin = String(user?.role || "").toLowerCase() === "owner"
            || String(user?.globalRole || "").toLowerCase() === "diod";
          if (isOwnerOrAdmin) {
            setDietInstallModal({ pack: { ...pack, dietLabel: result.dietLabel || pack.dietLabel } });
          }
        }
      }

      await loadCatalog();
    } catch (err) {
      if (err.message?.includes("NO_CREDITS_REMAINING") || err.message?.includes("crédito")) {
        showToast("Has agotado tus créditos mensuales para este plan.", "error");
      } else if (err.message?.includes("NOT_ENTITLED") || err.message?.includes("acceso")) {
        showToast("No tienes acceso a este pack. Actualiza tu suscripción.", "error");
      } else {
        showToast(err.message || "Error al instalar el pack.", "error");
      }
    }
  }, [loadCatalog, showToast, plan, user]);

  return (
    <KitchenLayout>
      <div className="catalog-page">
        <div className="catalog-header">
          <h1 className="catalog-title">Catálogo</h1>
          <p className="catalog-subtitle">Packs de platos listos para añadir a tu hogar</p>
        </div>

        <CatalogCreditsPanel plan={plan} credits={credits} />

        <div className="catalog-search-row">
          <input
            type="search"
            className="kitchen-input catalog-search-input"
            placeholder="Buscar packs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar packs"
          />
        </div>

        <div className="catalog-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`catalog-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="catalog-loading">
            <div className="kitchen-spinner" />
            <span>Cargando catálogo...</span>
          </div>
        )}

        {!loading && error && (
          <div className="kitchen-alert error catalog-error">{error}</div>
        )}

        {!loading && !error && visiblePacks.length === 0 && (
          <div className="catalog-empty">
            <PackIcon />
            <p>No hay packs disponibles en esta categoría.</p>
          </div>
        )}

        {!loading && !error && visiblePacks.length > 0 && (
          <div className="catalog-grid">
            {visiblePacks.map((pack) => (
              <PackCard
                key={String(pack.id)}
                pack={pack}
                onAction={handlePackAction}
              />
            ))}
          </div>
        )}
      </div>

      {purchaseModalPack && (
        <PurchasePlaceholderModal
          pack={purchaseModalPack}
          onClose={() => setPurchaseModalPack(null)}
        />
      )}

      {dietInstallModal && (
        <DietPackInstallModal
          pack={dietInstallModal.pack}
          onUseAsDefault={async () => {
            const packId = String(dietInstallModal.pack.id);
            markDietPackModalDismissed(packId);
            setDietInstallModal(null);
            try {
              await apiRequest("/api/kitchen/household/preferences", {
                method: "PATCH",
                body: JSON.stringify({
                  randomizationUseDietFilter: true,
                  randomizationDefaultDietPackIds: [packId]
                })
              });
              showToast("Dieta activada por defecto para la aleatorización.", "success");
            } catch {
              showToast("No se pudo activar la dieta por defecto.", "error");
            }
          }}
          onDecline={() => {
            markDietPackModalDismissed(String(dietInstallModal.pack.id));
            setDietInstallModal(null);
          }}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={dismissToast}
        />
      )}
    </KitchenLayout>
  );
}
