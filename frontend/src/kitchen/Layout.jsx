import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import Header from "./components/ui/Header";
import BottomNav from "./components/ui/BottomNav";
import { useAuth } from "./auth";
import { apiRequest } from "./api.js";
import { getUserColorById } from "./utils/userColors.js";
import { getUserInitialsFromProfile } from "./utils/userInitials.js";
import lunchfyIcon from "../assets/brand/Lunchfy_icon.png";
import lunchfyLogo from "../assets/brand/Lunchfy_logo1.png";
import OnboardingBanner from "./components/onboarding/OnboardingBanner.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

function CalendarIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function UtensilsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        stroke="none"
        d="m10.8 3.9l-6 4.5c-.5.38-.8.97-.8 1.6v9c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-9c0-.63-.3-1.22-.8-1.6l-6-4.5a2.01 2.01 0 0 0-2.4 0m1.7 8.6c0 .83-.67 1.5-1.5 1.5v3.5c0 .28-.22.5-.5.5s-.5-.22-.5-.5V14c-.83 0-1.5-.67-1.5-1.5V10c0-.28.22-.5.5-.5s.5.22.5.5v2.5h.5V10c0-.28.22-.5.5-.5s.5.22.5.5v2.5h.5V10c0-.28.22-.5.5-.5s.5.22.5.5zm2 5.5c-.28 0-.5-.22-.5-.5v-3h-.5c-.28 0-.5-.22-.5-.5v-2.5c0-.88.57-1.63 1.36-1.89c.31-.11.64.14.64.48v7.41c0 .28-.22.5-.5.5"
      />
    </svg>
  );
}

function ListIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4" cy="6" r="1.5" />
      <circle cx="4" cy="12" r="1.5" />
      <circle cx="4" cy="18" r="1.5" />
    </svg>
  );
}

function SettingsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        stroke="none"
        d="M19.14 12.94c.04-.3.06-.61.06-.94c0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6s3.6 1.62 3.6 3.6s-1.62 3.6-3.6 3.6"
      />
    </svg>
  );
}

function CatalogIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 8h10M7 12h7M7 16h8" strokeLinecap="round" />
    </svg>
  );
}

function CreditCardIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function LogoutIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

function UserIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8M4 20a8 8 0 0 1 16 0" />
    </svg>
  );
}

function ShareIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M7 12h10" />
      <path d="m12 7 5 5-5 5" />
      <path d="M7 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function ChevronDownIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="m6 9l6 6l6-6" />
    </svg>
  );
}

/* ── Theme row icons ──────────────────────────────────────────── */
function AppearanceIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function SystemThemeIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 1.5a6.5 6.5 0 0 1 0 13V1.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SunThemeIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" />
    </svg>
  );
}

function MoonThemeIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path d="M14 10.58A6 6 0 0 1 5.42 2a7 7 0 1 0 8.58 8.58z" />
    </svg>
  );
}

function getFirstName(displayName = "") {
  return String(displayName).trim().split(/\s+/)[0] || "";
}

export default function KitchenLayout({ children, containerClassName = "" }) {
  const { user, logout, refreshUser, setUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const [households, setHouseholds] = useState([]);
  const [switchingHousehold, setSwitchingHousehold] = useState(false);
  const [householdError, setHouseholdError] = useState("");
  const activeHouseholdRequestKeyRef = useRef("");
  const pendingActiveHouseholdRef = useRef(null);
  const isDiod = user?.globalRole === "diod";

  useEffect(() => {
    if (!isDiod || !user?.id) return;
    const requestKey = `${user.id}`;
    if (activeHouseholdRequestKeyRef.current === requestKey) return;

    let active = true;
    activeHouseholdRequestKeyRef.current = requestKey;

    apiRequest("/api/kitchen/admin/active-household")
      .then((data) => {
        if (!active) return;
        const nextActiveHouseholdId = data.activeHouseholdId || null;
        localStorage.setItem("kitchen_active_household_id", nextActiveHouseholdId || "");
        setUser((prevUser) => {
          if (!prevUser || prevUser.id !== user.id) return prevUser;
          if ((prevUser.activeHouseholdId || null) === nextActiveHouseholdId) return prevUser;
          return { ...prevUser, activeHouseholdId: nextActiveHouseholdId };
        });
      })
      .catch((error) => {
        if (!active) return;
        setHouseholdError(error.message || "No se pudo obtener el hogar activo.");
      });

    return () => {
      active = false;
    };
  }, [isDiod, setUser, user?.id]);

  const navLinks = useMemo(
    () => [
      { to: "/kitchen/semana", label: "Semana" },
      { to: "/kitchen/platos", label: "Platos" },
      { to: "/kitchen/compra", label: "Lista de la compra" },
      { to: "/kitchen/catalogo", label: "Catálogo" }
    ],
    []
  );

  const bottomNavLinks = useMemo(
    () => [
      { to: "/kitchen/semana", label: "Semana", icon: CalendarIcon },
      { to: "/kitchen/platos", label: "Platos", icon: UtensilsIcon },
      { to: "/kitchen/compra", label: "Lista", icon: ListIcon },
      { to: "/kitchen/catalogo", label: "Catálogo", icon: CatalogIcon }
    ],
    []
  );

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!userMenuRef.current?.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target.closest("button");
      if (!target || target.disabled) return;
      if (target.closest(".is-leaving")) return;
      if (target.classList.contains("shopping-check")) return;
      target.classList.remove("btn-spring");
      void target.offsetWidth;
      target.classList.add("btn-spring");
    };
    const handleAnimationEnd = (event) => {
      if (event.animationName === "btnSpring") {
        event.target.classList.remove("btn-spring");
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("animationend", handleAnimationEnd);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("animationend", handleAnimationEnd);
    };
  }, []);

  useEffect(() => {
    if (!isDiod || !userMenuOpen) return;
    let active = true;
    setHouseholdError("");

    apiRequest("/api/kitchen/admin/households")
      .then((data) => {
        if (!active) return;
        setHouseholds(data.households || []);
      })
      .catch((error) => {
        if (!active) return;
        setHouseholdError(error.message || "No se pudieron cargar los hogares.");
      });

    return () => {
      active = false;
    };
  }, [isDiod, userMenuOpen]);

  const onChangeActiveHousehold = async (event) => {
    const nextHouseholdId = event.target.value;
    const normalizedCurrentHousehold = user?.activeHouseholdId || "";
    if (switchingHousehold) return;
    if (nextHouseholdId === normalizedCurrentHousehold) {
      setUserMenuOpen(false);
      return;
    }
    if (pendingActiveHouseholdRef.current === nextHouseholdId) return;

    pendingActiveHouseholdRef.current = nextHouseholdId;
    setSwitchingHousehold(true);
    setHouseholdError("");
    try {
      await apiRequest("/api/kitchen/admin/active-household", {
        method: "POST",
        body: JSON.stringify({ activeHouseholdId: nextHouseholdId || null })
      });
      localStorage.setItem("kitchen_active_household_id", nextHouseholdId || "");
      await refreshUser();
      setUserMenuOpen(false);
      navigate("/kitchen/platos");
    } catch (error) {
      setHouseholdError(error.message || "No se pudo actualizar el hogar activo.");
    } finally {
      pendingActiveHouseholdRef.current = null;
      setSwitchingHousehold(false);
    }
  };

  const onLogout = async () => {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
    setUserMenuOpen(false);
  };

  const onNavigate = () => {
    setUserMenuOpen(false);
  };

  const userName = getFirstName(user?.displayName || "");
  const userInitials = getUserInitialsFromProfile(
    user?.initials,
    user?.id || user?.email || user?.username || "",
    user?.displayName || ""
  );
  const userColors = getUserColorById(user?.colorId, user?.id || user?.email || user?.username || "");

  return (
    <div className="kitchen-app">
      <Header
        left={(
          <div className="kitchen-brand">
            <Link className="kitchen-brand-link" to="/kitchen/semana" onClick={onNavigate}>
              <img className="kitchen-brand-icon" src={lunchfyIcon} alt="Lunchfy" />
              <img className="kitchen-brand-logo" src={lunchfyLogo} alt="Lunchfy" />
            </Link>
          </div>
        )}
        center={(
          <nav className="kitchen-nav-desktop">
            {navLinks.map((link) => (
              <NavLink key={link.to} to={link.to} onClick={onNavigate}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}
        right={user ? (
          <div className="kitchen-user" ref={userMenuRef}>
            <button
              className="kitchen-user-chip"
              type="button"
              onClick={() => setUserMenuOpen((open) => !open)}
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
            >
              <span
                className="kitchen-user-avatar"
                style={{ background: userColors.background, color: userColors.text }}
              >
                {userInitials}
              </span>
              <span className="kitchen-user-name">{userName}</span>
              {user?.subscriptionPlan && (
                <span className={`kitchen-user-plan-badge plan-${String(user.subscriptionPlan).toLowerCase()}`}>
                  {String(user.subscriptionPlan).toLowerCase() === "premium" ? "Premium" : String(user.subscriptionPlan).toLowerCase() === "pro" ? "Pro" : "Basic"}
                </span>
              )}
              <ChevronDownIcon className="kitchen-user-chevron" />
            </button>
            {userMenuOpen ? (
              <div className="kitchen-user-menu" role="menu" onPointerDown={(event) => event.stopPropagation()}>
                {isDiod ? (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { navigate("/admin"); onNavigate(); }}
                      className="kitchen-user-menu-admin"
                    >
                      🛠 Panel de administrador
                    </button>
                    <label className="kitchen-user-menu-household">
                      <span>Hogar activo</span>
                      <select
                        className="kitchen-input"
                        value={user?.activeHouseholdId || ""}
                        onChange={onChangeActiveHousehold}
                        disabled={switchingHousehold}
                      >
                        <option value="">Sin hogar (modo global)</option>
                        {households.map((household) => (
                          <option key={household.id} value={household.id}>{household.name}</option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
                {householdError ? <div className="kitchen-alert error">{householdError}</div> : null}
                <button type="button" role="menuitem" onClick={() => { navigate("/kitchen/configuracion?section=perfil"); onNavigate(); }}>
                  <UserIcon className="kitchen-user-menu-icon" />
                  Perfil
                </button>
                {(user?.role === "owner" || user?.role === "admin" || isDiod) ? (
                  <button type="button" role="menuitem" onClick={() => { navigate("/kitchen/configuracion?section=share"); onNavigate(); }}>
                    <ShareIcon className="kitchen-user-menu-icon" />
                    Compartir
                  </button>
                ) : null}
                <button type="button" role="menuitem" onClick={() => { navigate("/kitchen/configuracion"); onNavigate(); }}>
                  <SettingsIcon className="kitchen-user-menu-icon" />
                  Configuración
                </button>
                <button type="button" role="menuitem" onClick={() => { navigate("/kitchen/upgrade"); onNavigate(); }}>
                  <CreditCardIcon className="kitchen-user-menu-icon" />
                  Suscripción / Plan
                </button>
                <div className="kitchen-user-menu-theme-row" role="group" aria-label="Apariencia">
                  <span className="kitchen-user-menu-theme-label">
                    <AppearanceIcon className="kitchen-user-menu-icon" />
                    Tema
                  </span>
                  <div className="kitchen-user-menu-theme-options">
                    <button
                      type="button"
                      className={`kitchen-user-menu-theme-btn${theme === "system" ? " is-active" : ""}`}
                      onClick={() => setTheme("system")}
                      title="Sistema"
                      aria-pressed={theme === "system"}
                    >
                      <SystemThemeIcon className="kitchen-user-menu-theme-icon" />
                    </button>
                    <button
                      type="button"
                      className={`kitchen-user-menu-theme-btn${theme === "light" ? " is-active" : ""}`}
                      onClick={() => setTheme("light")}
                      title="Claro"
                      aria-pressed={theme === "light"}
                    >
                      <SunThemeIcon className="kitchen-user-menu-theme-icon" />
                    </button>
                    <button
                      type="button"
                      className={`kitchen-user-menu-theme-btn${theme === "dark" ? " is-active" : ""}`}
                      onClick={() => setTheme("dark")}
                      title="Oscuro"
                      aria-pressed={theme === "dark"}
                    >
                      <MoonThemeIcon className="kitchen-user-menu-theme-icon" />
                    </button>
                  </div>
                </div>
                <button type="button" role="menuitem" onClick={onLogout}>
                  <LogoutIcon className="kitchen-user-menu-icon" />
                  Cerrar sesión
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="kitchen-user-placeholder" />
        )}
      />
      <div className={`kitchen-container ${containerClassName}`.trim()}>
        <OnboardingBanner />
        {children}
      </div>
      <BottomNav links={bottomNavLinks} onNavigate={onNavigate} />
    </div>
  );
}
