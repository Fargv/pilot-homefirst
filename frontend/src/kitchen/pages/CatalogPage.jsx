import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, createCheckoutSession } from "../api.js";

const STRIPE_ENABLED = import.meta.env.VITE_STRIPE_ENABLED === "true";
const IS_DEV = import.meta.env.DEV;
import KitchenLayout from "../Layout.jsx";
import { useAuth } from "../auth.jsx";
import { canUseDietRandomization } from "../subscription.js";
import { resolvePackCoverImageUrl } from "../utils/packImages.js";
import BitesIcon from "../components/BitesIcon.jsx";

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

// ─── Bites Wallet Panel ───────────────────────────────────────────────────────

function CatalogBitesWallet({ wallet, plan, bitesConfig, onBuyBites }) {
  if (!wallet) return null;

  const { freeBitesBalance = 0, purchasedBitesBalance = 0, totalBites = 0, daysUntilNextGrant = null } = wallet;
  const monthlyGrant = bitesConfig?.monthlyGrant ?? 0;

  const breakdownParts = [];
  if (freeBitesBalance > 0) breakdownParts.push(`${freeBitesBalance} incluidos en tu plan`);
  if (purchasedBitesBalance > 0) breakdownParts.push(`${purchasedBitesBalance} comprados`);

  return (
    <div className="catalog-bites-wallet">
      <div className="catalog-bites-wallet-top">
        <span className="catalog-bites-wallet-eyebrow">Bites disponibles</span>
      </div>

      <div className="catalog-bites-wallet-hero">
        <BitesIcon size={36} color="#4338ca" decorative />
        <span className="catalog-bites-wallet-hero-count">{totalBites}</span>
      </div>

      <div className="catalog-bites-wallet-meta">
        {breakdownParts.length > 0 && (
          <span className="catalog-bites-wallet-breakdown">{breakdownParts.join(" · ")}</span>
        )}
        {daysUntilNextGrant !== null && monthlyGrant > 0 && (
          <span className="catalog-bites-wallet-recharge">
            Próxima recarga en {daysUntilNextGrant} {daysUntilNextGrant === 1 ? "día" : "días"}
          </span>
        )}
      </div>

      <button
        type="button"
        className="catalog-bites-buy-cta"
        onClick={onBuyBites}
      >
        <BitesIcon size={14} color="#fff" decorative />
        Comprar Bites
      </button>
    </div>
  );
}

// ─── Bites Store ─────────────────────────────────────────────────────────────

function CatalogBitesStore({ bundles, onClose, onBuyBundle }) {
  return (
    <div className="kitchen-modal-overlay" onClick={onClose}>
      <div className="kitchen-modal catalog-bites-store-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="kitchen-modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        <h2 className="catalog-bites-store-title">
          <BitesIcon size={20} /> Comprar Bites
        </h2>
        <p className="catalog-bites-store-subtitle">
          Los Bites comprados no caducan.
        </p>

        <div className="catalog-bites-bundles-grid">
          {(bundles || []).length ? (bundles || []).map((bundle) => (
            <div
              key={String(bundle._id || bundle.id || bundle.name)}
              className={`catalog-bites-bundle ${bundle.highlighted ? "highlighted" : ""}`}
            >
              {bundle.badge && (
                <span className="catalog-bites-bundle-badge">{bundle.badge}</span>
              )}
              <div className="catalog-bites-bundle-name">{bundle.name}</div>
              <div className="catalog-bites-bundle-amount">
                <BitesIcon size={18} /> {bundle.bitesAmount} Bites
              </div>
              <div className="catalog-bites-bundle-price">
                {Number(bundle.price).toFixed(2).replace(".", ",")} €
              </div>
              <div className="catalog-bites-bundle-per">
                {Number(bundle.bitesAmount) > 0 ? `${(bundle.price / bundle.bitesAmount * 100).toFixed(2).replace(".", ",")} €/100 Bites` : "Precio por Bite no disponible"}
              </div>
              <button
                type="button"
                className={`kitchen-btn catalog-bites-bundle-btn ${bundle.highlighted ? "primary" : ""}`}
                onClick={() => onBuyBundle(bundle)}
              >
                Comprar
              </button>
            </div>
          )) : (
            <div className="catalog-bites-store-empty">No hay bundles activos ahora mismo.</div>
          )}
        </div>

        <p className="catalog-bites-store-note">
          La pasarela de pago todavía no está conectada.
        </p>
      </div>
    </div>
  );
}

// ─── Insufficient Bites modal ─────────────────────────────────────────────────

function InsufficientBitesModal({ pack, onClose, onBuyBites, onPayDirect }) {
  const bitesCost = Number(pack?.bitesCost ?? pack?.entitlement?.bitesCost ?? 0);
  const canPayDirect = Boolean(pack?.entitlement?.canPayDirect) && Number(pack?.entitlement?.priceBasic || pack?.priceBasic || 0) > 0;
  const directPrice = pack?.entitlement?.priceBasic || pack?.priceBasic;
  return (
    <div className="kitchen-modal-overlay" onClick={onClose}>
      <div className="kitchen-modal catalog-purchase-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="kitchen-modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        <div className="catalog-purchase-modal-icon"><PackIcon /></div>
        <h2 className="catalog-purchase-modal-title">No tienes Bites suficientes</h2>
        <p className="catalog-purchase-modal-text">
          Este pack cuesta <strong><BitesIcon size={15} decorative /> {bitesCost} {bitesCost === 1 ? "Bite" : "Bites"}</strong>.
          Consigue más Bites para desbloquearlo.
        </p>
        {pack?.title && (
          <p className="catalog-purchase-modal-pack">Pack: <strong>{pack.title}</strong></p>
        )}
        <div className="catalog-purchase-modal-actions">
          <button type="button" className="kitchen-btn primary" onClick={onBuyBites}>
            <BitesIcon size={15} decorative /> Comprar Bites
          </button>
          {canPayDirect ? (
            <button type="button" className="kitchen-btn" onClick={() => onPayDirect(pack)}>
              Pagar {formatPrice(directPrice)}
            </button>
          ) : null}
          <button type="button" className="kitchen-btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Entitlement badge ────────────────────────────────────────────────────────

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
  if (entitlement.canUnlockWithBites || entitlement.needsBitesPurchase || entitlement.requiresPurchase) {
    const cost = Number(entitlement.bitesCost || 0);
    const priceLine = getPackPriceLine(entitlement);
    return (
      <span className="catalog-badge catalog-badge-bites">
        {cost > 0 ? <BitesIcon size={12} decorative /> : null} {priceLine || formatPrice(entitlement.priceBasic)}
      </span>
    );
  }
  return <span className="catalog-badge catalog-badge-price">{formatPrice(entitlement.priceBasic)}</span>;
}

function formatPrice(price) {
  if (!price || price <= 0) return "Gratis";
  return `${Number(price).toFixed(2).replace(".", ",")} €`;
}

function getPackPriceLine(entitlement = {}) {
  const bitesCost = Number(entitlement.bitesCost || 0);
  const directPrice = Number(entitlement.priceBasic || 0);
  const canRedeemWithBites = bitesCost > 0 && entitlement.canUnlockWithBites;
  const hasBites = bitesCost > 0 && (canRedeemWithBites || entitlement.needsBitesPurchase || !entitlement.canPayDirect);
  const hasDirect = directPrice > 0 && entitlement.canPayDirect;
  if (canRedeemWithBites) return `${bitesCost} ${bitesCost === 1 ? "Bite" : "Bites"}`;
  if (hasBites && hasDirect) return `${bitesCost} ${bitesCost === 1 ? "Bite" : "Bites"} · o ${formatPrice(directPrice)}`;
  if (hasBites) return `${bitesCost} ${bitesCost === 1 ? "Bite" : "Bites"}`;
  if (hasDirect) return formatPrice(directPrice);
  return "";
}

function PackPriceLine({ entitlement }) {
  const bitesCost = Number(entitlement?.bitesCost || 0);
  const directPrice = Number(entitlement?.priceBasic || 0);
  const canRedeemWithBites = bitesCost > 0 && entitlement?.canUnlockWithBites;
  const hasBites = bitesCost > 0 && (canRedeemWithBites || entitlement?.needsBitesPurchase || !entitlement?.canPayDirect);
  const hasDirect = directPrice > 0 && entitlement?.canPayDirect;
  if (canRedeemWithBites) return <><BitesIcon size={13} decorative /> {bitesCost} {bitesCost === 1 ? "Bite" : "Bites"}</>;
  if (hasBites && hasDirect) {
    return <><BitesIcon size={13} decorative /> {bitesCost} {bitesCost === 1 ? "Bite" : "Bites"} · o {formatPrice(directPrice)}</>;
  }
  if (hasBites) return <><BitesIcon size={13} decorative /> {bitesCost} {bitesCost === 1 ? "Bite" : "Bites"}</>;
  if (hasDirect) return <>{formatPrice(directPrice)}</>;
  return null;
}

// ─── Pack card ────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }}>
      <path d="M2.5 8l4 4 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function PackCard({ pack, onAction, onBuyBites, onUninstall }) {
  const { entitlement } = pack;
  const [loading, setLoading] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const coverUrl = resolvePackCoverImageUrl(pack.coverImage);

  useEffect(() => {
    setCoverFailed(false);
  }, [coverUrl]);

  const handleAction = async (paymentMethod) => {
    if (loading) return;
    setLoading(true);
    try {
      await onAction(pack, paymentMethod);
    } finally {
      setLoading(false);
    }
  };

  const handleUninstall = async () => {
    if (uninstalling || loading) return;
    if (!window.confirm(`¿Desinstalar "${pack.title}"? Se eliminarán sus platos de tu biblioteca. Podrás reinstalarlo gratis en el futuro.`)) return;
    setUninstalling(true);
    try {
      await onUninstall(pack);
    } finally {
      setUninstalling(false);
    }
  };

  const bitesCost = Number(entitlement.bitesCost || 0);
  const hasBitesPrice = Number(bitesCost || 0) > 0;
  const canShowDirect = Number(entitlement.priceBasic || 0) > 0;
  const priceLine = getPackPriceLine(entitlement);

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
            <div>
              {pack.dishPreview.map((d, i) => (
                <div key={i} className="catalog-pack-dish-preview-item">
                  <span className="catalog-pack-dish-preview-dot" aria-hidden="true">·</span>
                  <span className="catalog-pack-dish-preview-name">{d.name}</span>
                  {d.teaser && <span className="catalog-pack-dish-preview-teaser"> — {d.teaser}</span>}
                </div>
              ))}
            </div>
            {pack.dishCount > pack.dishPreview.length && (
              <div className="catalog-pack-dish-preview-more">
                +{pack.dishCount - pack.dishPreview.length} platos más incluidos
              </div>
            )}
          </div>
        )}

        <div className="catalog-pack-footer">
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
            {priceLine ? <span className="catalog-pack-price-line"><PackPriceLine entitlement={entitlement} /></span> : null}
            {pack.tags && pack.tags.length > 0 && (
              <div className="catalog-pack-tags">
                {pack.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="catalog-pack-tag">{tag}</span>
                ))}
              </div>
            )}
          </div>

          {(() => {
            if (entitlement.installed) {
              return (
                <>
                  <button type="button" className="kitchen-btn catalog-pack-action installed" disabled>
                    <CheckIcon /> Ya instalado
                  </button>
                  <button type="button" className="catalog-pack-uninstall" onClick={handleUninstall} disabled={uninstalling}>
                    {uninstalling ? "Desinstalando..." : "Desinstalar"}
                  </button>
                </>
              );
            }
            if (entitlement.owned || entitlement.isFree || entitlement.canClaimWithPlan) {
              return (
                <button
                  type="button"
                  className="kitchen-btn catalog-pack-action primary"
                  onClick={() => handleAction("install")}
                  disabled={loading}
                >
                  {loading ? "Procesando..." : entitlement.isFree ? "Instalar gratis" : "Instalar"}
                </button>
              );
            }
            if (entitlement.canUnlockWithBites) {
              return (
                <button
                  type="button"
                  className="kitchen-btn catalog-pack-action bites"
                  onClick={() => handleAction("bites")}
                  disabled={loading}
                >
                  {loading ? "Procesando..." : <><BitesIcon size={14} decorative /> Canjear {bitesCost} {bitesCost === 1 ? "Bite" : "Bites"}</>}
                </button>
              );
            }
            return (
              <div className={`catalog-pack-actions-row ${!hasBitesPrice || !canShowDirect ? "single" : ""}`}>
                {canShowDirect && (
                  <button
                    type="button"
                    className="kitchen-btn catalog-pack-action catalog-pack-action-direct"
                    onClick={() => handleAction("direct")}
                    disabled={loading}
                  >
                    {loading ? "..." : `Pagar ${formatPrice(entitlement.priceBasic)}`}
                  </button>
                )}
                {hasBitesPrice ? (
                  <button
                    type="button"
                    className="kitchen-btn catalog-pack-action bites"
                    onClick={() => onBuyBites(pack)}
                    disabled={loading}
                  >
                    <BitesIcon size={14} decorative /> Comprar Bites
                  </button>
                ) : null}
              </div>
            );
          })()}

          {IS_DEV && (entitlement.isPaid || entitlement.stripePriceId) && (
            <details style={{ marginTop: 8, fontSize: 11, color: "#6b7280", borderTop: "1px dashed #e0e7ff", paddingTop: 6 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, color: "#7c3aed" }}>💳 DEV: payment config</summary>
              <div style={{ marginTop: 4, display: "grid", gap: 2 }}>
                <div>isPaid: <strong>{String(entitlement.isPaid)}</strong></div>
                <div>paymentMode: <strong>{entitlement.paymentMode || "none"}</strong></div>
                <div>stripePriceId: <strong>{entitlement.stripePriceId ? "✓ set" : "✗ missing"}</strong></div>
                <div>canBuyWithStripe: <strong style={{ color: entitlement.canBuyWithStripe ? "#16a34a" : "#b91c1c" }}>{String(entitlement.canBuyWithStripe)}</strong></div>
                <div>VITE_STRIPE_ENABLED: <strong>{String(STRIPE_ENABLED)}</strong></div>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Diet pack modal ──────────────────────────────────────────────────────────

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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [packs, setPacks] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [bitesConfig, setBitesConfig] = useState(null);
  const [plan, setPlan] = useState("basic");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [bitesStoreOpen, setBitesStoreOpen] = useState(false);
  const [insufficientBitesPack, setInsufficientBitesPack] = useState(null);
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
      setPlan(data.plan || "basic");
      if (data.wallet) setWallet(data.wallet);
      if (data.bitesConfig) setBitesConfig(data.bitesConfig);
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

  const anyModalOpen = bitesStoreOpen || Boolean(insufficientBitesPack) || Boolean(dietInstallModal);

  useEffect(() => {
    if (!anyModalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (bitesStoreOpen) setBitesStoreOpen(false);
      else if (insufficientBitesPack) setInsufficientBitesPack(null);
      else if (dietInstallModal) setDietInstallModal(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [anyModalOpen, bitesStoreOpen, insufficientBitesPack, dietInstallModal]);

  const handlePackAction = useCallback(async (pack, paymentMethod) => {
    const { entitlement } = pack;

    if (entitlement.installed) return;

    if (paymentMethod === "buy-bites") {
      setBitesStoreOpen(true);
      return;
    }

    if (paymentMethod === "direct") {
      // If pack has Stripe checkout configured, redirect to Stripe
      if (pack.entitlement?.canBuyWithStripe) {
        if (!STRIPE_ENABLED) {
          showToast("Los pagos no están activados en este entorno (VITE_STRIPE_ENABLED).", "info");
          return;
        }
        try {
          const result = await createCheckoutSession({
            type: "pack",
            targetId: String(pack.id),
            targetName: pack.title
          });
          if (result?.url) {
            window.location.href = result.url;
          }
        } catch (err) {
          if (err.body?.code === "PACK_ALREADY_OWNED") {
            showToast("Ya tienes este pack activo.", "info");
          } else if (err.body?.code === "PAYMENTS_DISABLED") {
            showToast("Los pagos no están activados en el servidor. Activa PAYMENTS_ENABLED=true.", "error");
          } else {
            showToast(err.message || "No se pudo iniciar el pago.", "error");
          }
        }
        return;
      }

      // canBuyWithStripe is false — show a specific reason in DEV
      const e = pack.entitlement || {};
      if (IS_DEV) {
        if (!e.isPaid) {
          showToast("[DEV] Pack no marcado como de pago (isPaid=false). Actívalo en el panel admin.", "error");
        } else if (e.paymentMode !== "stripe") {
          showToast(`[DEV] Modo de pago es "${e.paymentMode}", debe ser "stripe". Cámbialo en el panel admin.`, "error");
        } else if (!e.stripePriceId) {
          showToast("[DEV] Falta el Stripe Price ID. Añádelo en el panel admin.", "error");
        } else {
          showToast("[DEV] La pasarela de pago está desactivada en el servidor (PAYMENTS_ENABLED).", "error");
        }
      } else {
        showToast("La pasarela de pago todavía no está conectada.", "info");
      }
      return;
    }

    if (entitlement.needsBitesPurchase || entitlement.requiresPurchase) {
      setBitesStoreOpen(true);
      return;
    }

    if (entitlement.canUnlockWithBites && !entitlement.owned) {
      try {
        const result = await apiRequest(`/api/kitchen/catalog/packs/${pack.id}/unlock`, {
          method: "POST",
          body: JSON.stringify({ paymentMethod: "bites" })
        });
        if (result.newWallet) setWallet((prev) => ({ ...prev, ...result.newWallet }));
      } catch (err) {
        if (err.body?.code === "INSUFFICIENT_BITES" || err.message?.includes("INSUFFICIENT_BITES") || err.message?.includes("Bites suficientes")) {
          setInsufficientBitesPack(pack);
          return;
        }
        showToast(err.message || "Error al desbloquear el pack.", "error");
        return;
      }
    } else if (!entitlement.owned && entitlement.canClaimWithPlan) {
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
        showToast("Has agotado tus Bites para este mes.", "error");
      } else if (err.message?.includes("NOT_ENTITLED") || err.message?.includes("acceso")) {
        showToast("No tienes acceso a este pack.", "error");
      } else {
        showToast(err.message || "Error al instalar el pack.", "error");
      }
    }
  }, [loadCatalog, showToast, plan, user]);

  const handleBuyBundle = useCallback((_bundle) => {
    const bundle = _bundle || {};
    const canBuyWithStripe = Boolean(bundle.isPaid)
      && bundle.paymentMode === "stripe"
      && String(bundle.stripePriceId || "").startsWith("price_");
    if (!canBuyWithStripe) {
      showToast("La pasarela de pago todavía no está conectada.", "info");
      return;
    }
    if (!STRIPE_ENABLED) {
      showToast("Los pagos no están activados en este entorno (VITE_STRIPE_ENABLED).", "info");
      return;
    }
    createCheckoutSession({
      type: "bites",
      targetId: String(bundle._id || bundle.id),
      targetName: bundle.name
    })
      .then((result) => {
        if (result?.url) window.location.href = result.url;
      })
      .catch((err) => {
        showToast(err.message || "No se pudo iniciar el pago.", "error");
      });
  }, [showToast]);

  const handleUninstall = useCallback(async (pack) => {
    try {
      const result = await apiRequest(`/api/kitchen/catalog/packs/${pack.id}/install`, { method: "DELETE" });
      showToast(`Pack desinstalado. ${result.dishesRemoved} platos eliminados de tu biblioteca.`, "success");
      await loadCatalog();
    } catch (err) {
      showToast(err.message || "Error al desinstalar el pack.", "error");
    }
  }, [loadCatalog, showToast]);

  return (
    <KitchenLayout>
      <div className="catalog-page">
        <div className="catalog-header">
          <h1 className="catalog-title">Catálogo</h1>
          <p className="catalog-subtitle">Packs de platos listos para añadir a tu hogar</p>
        </div>

        <CatalogBitesWallet
          wallet={wallet}
          plan={plan}
          bitesConfig={bitesConfig}
          onBuyBites={() => setBitesStoreOpen(true)}
        />

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
                onBuyBites={() => setBitesStoreOpen(true)}
                onUninstall={handleUninstall}
              />
            ))}
          </div>
        )}
      </div>

      {bitesStoreOpen && (
        <CatalogBitesStore
          bundles={bitesConfig?.bundles || []}
          onClose={() => setBitesStoreOpen(false)}
          onBuyBundle={handleBuyBundle}
        />
      )}

      {insufficientBitesPack && (
        <InsufficientBitesModal
          pack={insufficientBitesPack}
          onClose={() => setInsufficientBitesPack(null)}
          onBuyBites={() => {
            setInsufficientBitesPack(null);
            setBitesStoreOpen(true);
          }}
          onPayDirect={(pack) => {
            setInsufficientBitesPack(null);
            handlePackAction(pack, "direct");
          }}
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
