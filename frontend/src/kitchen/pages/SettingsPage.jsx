import React, { useEffect, useMemo, useState } from "react";
import { useTheme } from "../../context/ThemeContext.jsx";
import { useNavigate, useSearchParams } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";
import { useAuth } from "../auth";
import { apiRequest, undoCancelSubscription } from "../api.js";
import ModalSheet from "../components/ui/ModalSheet.jsx";
import SettingsSharePanel from "../components/SettingsSharePanel.jsx";
import PushNotificationsPanel from "../components/PushNotificationsPanel.jsx";
import { PwaInstallSettingsBlock } from "../components/PwaInstallPrompt.jsx";
import { useActiveWeek } from "../weekContext.jsx";
import {
  buildLicenseState,
  canUseBasicsFeature,
  canUseBudgetFeature,
  canUseDietRandomization,
  canUseDinnersFeature,
  countLicenseUsage,
  isNonUserDinerLimitReachedError,
  isUnlimitedLicenseLimit,
  isUserLimitReachedError
} from "../subscription.js";
import { getColorPalette, getUserColorById, getUserColorPreference, setUserColorPreference } from "../utils/userColors.js";
import { getUserInitialsPreference, setUserInitialsPreference } from "../utils/userInitials.js";
import { ProBadge } from "../components/ui/ProBadge.jsx";
import { useOnboarding } from "../contexts/OnboardingContext.jsx";
import { useWeeklyChallenge } from "../contexts/WeeklyChallengeContext.jsx";
import { IngredientSearchAdd } from "../components/BasicsPopup.jsx";
import PageHeader from "../components/PageHeader.jsx";

function initialsFromName(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function roleLabel(user, isOwner, householdName) {
  const safeHousehold = householdName || "Mi household";
  if (user?.globalRole === "diod") return `DIOD - ${safeHousehold}`;
  if (isOwner) return `Household Owner/Admin - ${safeHousehold}`;
  return `Regular User - ${safeHousehold}`;
}

function memberRoleLabel(member) {
  if (member?.isPlaceholder) return "COMENSAL";
  const role = String(member?.role || "").toLowerCase();
  if (role === "owner" || role === "admin") return "OWNER";
  return "USER";
}

const CATEGORY_COLORS = [
  { colorBg: "#E8F1FF", colorText: "#1D4ED8" },
  { colorBg: "#FDECEC", colorText: "#B42318" },
  { colorBg: "#EAFBF1", colorText: "#067647" },
  { colorBg: "#FFF4E5", colorText: "#B54708" },
  { colorBg: "#F2EDFF", colorText: "#5B3CC4" },
  { colorBg: "#E6FAFA", colorText: "#0E7490" },
  { colorBg: "#FFF0F7", colorText: "#BE185D" },
  { colorBg: "#EEF2F6", colorText: "#344054" },
  { colorBg: "#ECFCCB", colorText: "#3F6212" },
  { colorBg: "#FCE7F3", colorText: "#9D174D" },
  { colorBg: "#E0F2FE", colorText: "#075985" },
  { colorBg: "#FFEDD5", colorText: "#9A3412" }
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16.862 4.487a2.25 2.25 0 0 1 3.182 3.182l-9.19 9.19a2.25 2.25 0 0 1-1.06.592l-3.293.823.823-3.293a2.25 2.25 0 0 1 .592-1.06l9.19-9.19Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.75 5.625 18.375 8.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4h11l3 3v13H5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 4v6h8V4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m8 16 2.2 2.2L16 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M10 11v6m4-6v6M9 4h6l1 2H8l1-2Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 10.2v5.1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="7.2" r="1" fill="currentColor" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function getBitesLabel(tx) {
  if (tx.metadata?.source === "welcome_bonus") return "Bienvenida a Lunchfy";
  if (tx.metadata?.source === "onboarding_challenge" && tx.reason) return tx.reason;
  switch (tx.type) {
    case "monthly_grant": return "Bites mensuales";
    case "purchase": return "Compra de Bites";
    case "pack_unlock": return tx.reason || "Pack desbloqueado";
    case "admin_grant": return tx.reason || "Ajuste";
    case "admin_remove": return tx.reason || "Deducción";
    case "refund": return tx.reason || "Reembolso";
    case "adjustment": return tx.reason || "Ajuste";
    default: return tx.reason || "Movimiento";
  }
}

function clampAvoidRepeatWeeks(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(12, Math.max(1, Math.round(parsed)));
}

function formatLicenseLimit(limit, singularLabel, pluralLabel) {
  if (isUnlimitedLicenseLimit(limit)) {
    return `Unlimited ${pluralLabel}`;
  }
  const safeLimit = Number(limit || 0);
  return `Up to ${safeLimit} ${safeLimit === 1 ? singularLabel : pluralLabel}`;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { activeWeek } = useActiveWeek();
  const { user, setUser, refreshUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { notify: notifyOnboarding } = useOnboarding();
  const { notify: notifyWeekly } = useWeeklyChallenge();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { notifyOnboarding("visit_settings"); }, []);
  const [searchParams, setSearchParams] = useSearchParams();

  const palette = getColorPalette();
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [inviteLink, setInviteLink] = useState("");
  const [householdCode, setHouseholdCode] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [householdNameDraft, setHouseholdNameDraft] = useState("");
  const [householdNameEditing, setHouseholdNameEditing] = useState(false);
  const [dinnersEnabled, setDinnersEnabled] = useState(false);
  const [dinnersIncludeInShopping, setDinnersIncludeInShopping] = useState(false);
  const [avoidRepeatsEnabled, setAvoidRepeatsEnabled] = useState(false);
  const [avoidRepeatsWeeks, setAvoidRepeatsWeeks] = useState(1);
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [cycleStartDay, setCycleStartDay] = useState(1);
  const [subscriptionPlan, setSubscriptionPlan] = useState("basic");
  const [subscriptionStatus, setSubscriptionStatus] = useState("inactive");
  const [subscriptionRequestedPlan, setSubscriptionRequestedPlan] = useState("");
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState(null);
  const [householdPlanSource, setHouseholdPlanSource] = useState("");
  const [householdBetaProActive, setHouseholdBetaProActive] = useState(false);
  const [pendingDowngradeAt, setPendingDowngradeAt] = useState(null);
  const [undoCancelLoading, setUndoCancelLoading] = useState(false);
  const [avoidRepeatsInfoOpen, setAvoidRepeatsInfoOpen] = useState(false);
  const [householdPrefsSaving, setHouseholdPrefsSaving] = useState(false);
  const [dietFilterEnabled, setDietFilterEnabled] = useState(false);
  const [dietDefaultPackIds, setDietDefaultPackIds] = useState([]);
  const [installedDietPacks, setInstalledDietPacks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [dishCategories, setDishCategories] = useState([]);
  const [categoriesAccordion, setCategoriesAccordion] = useState({
    dishes: false,
    ingredients: false
  });
  const [deletedTab, setDeletedTab] = useState("dishes");
  const [deletedItems, setDeletedItems] = useState({ dishes: [], sides: [], ingredients: [] });
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [profileInitials, setProfileInitials] = useState(user?.initials || getUserInitialsPreference(user?.id) || initialsFromName(user?.displayName || ""));
  const [selectedColorId, setSelectedColorId] = useState(user?.colorId || getUserColorPreference(user?.id) || "lavender");
  const [profileActive, setProfileActive] = useState(user?.active !== false);
  const [profileCanCook, setProfileCanCook] = useState(user?.canCook !== false);
  const [profileDinnerActive, setProfileDinnerActive] = useState(user?.dinnerActive !== false);
  const [profileDinnerCanCook, setProfileDinnerCanCook] = useState(user?.dinnerCanCook !== false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [profileEditingMain, setProfileEditingMain] = useState(false);
  const [profileSnapshot, setProfileSnapshot] = useState({
    displayName: "",
    initials: "",
    colorId: "lavender",
    active: true,
    canCook: true,
    dinnerActive: true,
    dinnerCanCook: true
  });
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [categoryModal, setCategoryModal] = useState({
    open: false,
    kind: "ingredient",
    mode: "create",
    category: null,
    name: "",
    colorBg: CATEGORY_COLORS[0].colorBg,
    colorText: CATEGORY_COLORS[0].colorText,
    active: true
  });
  const [memberModal, setMemberModal] = useState({
    open: false,
    member: null,
    form: {
      displayName: "",
      initials: "",
      colorId: "lavender",
      role: "member",
      active: true,
      canCook: true,
      dinnerActive: true,
      dinnerCanCook: true
    }
  });
  const [convertModal, setConvertModal] = useState({ open: false, memberId: "", email: "", password: "" });
  const [dinerModal, setDinerModal] = useState({
    open: false,
    form: {
      displayName: "",
      initials: "",
      colorId: "lavender",
      active: true,
      canCook: false,
      dinnerActive: true,
      dinnerCanCook: false
    }
  });
  const [confirmModal, setConfirmModal] = useState({ open: false, title: "", message: "", onConfirm: null, dangerLabel: "Confirmar" });
  const [deleteProfileModal, setDeleteProfileModal] = useState({
    open: false,
    loading: false,
    preview: null,
    promoteUserId: "",
    confirmDeleteHousehold: false
  });
  const [copiedField, setCopiedField] = useState("");
  const [bitesHistory, setBitesHistory] = useState([]);
  const [bitesHistoryLoading, setBitesHistoryLoading] = useState(false);
  const [bitesSummary, setBitesSummary] = useState({ free: 0, purchased: 0 });
  const [basics, setBasics] = useState([]);
  const [basicsLoading, setBasicsLoading] = useState(false);
  const [basicsError, setBasicsError] = useState("");

  const isOwner = user?.role === "owner" || user?.role === "admin";
  const isDiod = user?.globalRole === "diod";
  const canViewHousehold = Boolean(user?.activeHouseholdId || user?.householdId) && !(isDiod && !user?.activeHouseholdId);
  const canManageCategories = isDiod || isOwner;
  const canManageHousehold = isOwner && !(isDiod && !user?.activeHouseholdId);
  const canAccessShare = isOwner || isDiod;
  const canManageDeleted = isDiod || isOwner;

  const activePanel = ((searchParams.get("section") || "").toLowerCase() === "household-invitations"
    ? "share"
    : (searchParams.get("section") || "").toLowerCase());
  const isHub = !activePanel;
  const userInitials = (user?.initials || getUserInitialsPreference(user?.id) || initialsFromName(user?.displayName || "")).slice(0, 3);
  const selectedColor = useMemo(
    () => palette.find((item) => item.id === selectedColorId) || palette[0],
    [palette, selectedColorId]
  );
  const subscriptionAccess = useMemo(
    () => ({
      subscriptionPlan,
      planSource: householdPlanSource || user?.planSource,
      betaProActive: householdBetaProActive || user?.betaProActive,
      betaPro: user?.betaPro
    }),
    [subscriptionPlan, householdPlanSource, householdBetaProActive, user?.planSource, user?.betaProActive, user?.betaPro]
  );
  const budgetFeatureEnabled = canUseBudgetFeature(subscriptionAccess);
  const basicsFeatureEnabled = canUseBasicsFeature(subscriptionAccess);
  const canUseDinners = canUseDinnersFeature(subscriptionAccess);
  const licenseActionLabel = subscriptionPlan === "premium" ? "Change Subscription" : "Upgrade License";
  const memberUsage = useMemo(() => countLicenseUsage(members), [members]);
  const licenseState = useMemo(
    () => buildLicenseState(subscriptionPlan, memberUsage),
    [memberUsage, subscriptionPlan]
  );
  const canAddMoreUsers = licenseState.capabilities.canAddUser;
  const canAddMoreNonUserDiners = licenseState.capabilities.canAddNonUserDiner;
  const userLimitMessage = "You have reached the user limit for your current license.";
  const nonUserDinerLimitMessage = "You have reached the non-user diner limit for your current license.";

  const formatSubscriptionPlanLabel = (plan) => {
    const normalizedPlan = String(plan || "basic").toLowerCase();
    if (normalizedPlan === "premium") return "PREMIUM";
    if (normalizedPlan === "pro") return "PRO";
    return "BASIC";
  };

  const formatSubscriptionStatusLabel = (status) => {
    const normalizedStatus = String(status || "inactive").toLowerCase();
    if (normalizedStatus === "active") return "ACTIVE";
    if (normalizedStatus === "trial") return "TRIAL";
    if (normalizedStatus === "pending") return "PENDING";
    return "INACTIVE";
  };

  const formatDowngradeDate = (date) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  };

  const handleUndoCancelFromSettings = async () => {
    setUndoCancelLoading(true);
    try {
      const data = await undoCancelSubscription();
      setPendingDowngradeAt(null);
      setSubscriptionEndsAt(data?.household?.subscriptionEndsAt || subscriptionEndsAt);
    } catch (err) {
      setError(err.message || "No se pudo reactivar la suscripción.");
    } finally {
      setUndoCancelLoading(false);
    }
  };

  const subscriptionBadgeClassName = (plan) => {
    const normalizedPlan = String(plan || "basic").toLowerCase();
    if (normalizedPlan === "premium") return "settings-subscription-badge premium";
    if (normalizedPlan === "pro") return "settings-subscription-badge pro";
    return "settings-subscription-badge basic";
  };

  const setPanel = (panel) => {
    if (!panel) {
      setSearchParams({});
      navigate("/kitchen/configuracion");
      return;
    }
    navigate(`/kitchen/configuracion?section=${panel}`);
  };

  const openBudgetPanel = () => {
    if (!budgetFeatureEnabled) {
      navigate("/kitchen/upgrade");
      return;
    }
    navigate(`/kitchen/compra/presupuesto?week=${encodeURIComponent(activeWeek || new Date().toISOString().slice(0, 10))}&origin=settings`);
  };

  const updateSuccess = (message) => {
    setSuccess(message);
    setError("");
  };

  const notifyCatalogInvalidated = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("kitchen:catalog-invalidated"));
  };

  const buildClosedCategoryModal = () => ({
    open: false,
    kind: "ingredient",
    mode: "create",
    category: null,
    name: "",
    colorBg: CATEGORY_COLORS[0].colorBg,
    colorText: CATEGORY_COLORS[0].colorText,
    active: true
  });

  const openCreateCategoryModal = (kind) => {
    setCategoryModal({
      open: true,
      kind,
      mode: "create",
      category: null,
      name: "",
      colorBg: CATEGORY_COLORS[0].colorBg,
      colorText: CATEGORY_COLORS[0].colorText,
      active: true
    });
  };

  const openEditCategoryModal = (kind, category) => {
    setCategoryModal({
      open: true,
      kind,
      mode: "edit",
      category,
      name: category?.name || "",
      colorBg: category?.colorBg || CATEGORY_COLORS[0].colorBg,
      colorText: category?.colorText || CATEGORY_COLORS[0].colorText,
      active: category?.active !== false
    });
  };

  const enterProfileEdit = () => {
    setProfileSnapshot({
      displayName,
      initials: profileInitials,
      colorId: selectedColorId,
      active: profileActive,
      canCook: profileCanCook,
      dinnerActive: profileDinnerActive,
      dinnerCanCook: profileDinnerCanCook
    });
    setProfileEditingMain(true);
  };

  const cancelProfileEdit = () => {
    setDisplayName(profileSnapshot.displayName);
    setProfileInitials(profileSnapshot.initials);
    setSelectedColorId(profileSnapshot.colorId);
    setProfileActive(profileSnapshot.active);
    setProfileCanCook(profileSnapshot.canCook);
    setProfileDinnerActive(profileSnapshot.dinnerActive);
    setProfileDinnerCanCook(profileSnapshot.dinnerCanCook);
    setProfileEditingMain(false);
  };

  const canConfirmDeleteProfile = useMemo(() => {
    const preview = deleteProfileModal.preview;
    if (!preview) return false;
    if (preview.mustTransferOwner && !deleteProfileModal.promoteUserId) return false;
    if (preview.willDeleteHousehold && deleteProfileModal.confirmDeleteHousehold !== true) return false;
    return true;
  }, [deleteProfileModal]);

  const convertFormIsValid = useMemo(() => {
    if (!convertModal.open) return false;
    return EMAIL_RE.test(String(convertModal.email || "").trim().toLowerCase())
      && String(convertModal.password || "").trim().length >= 8;
  }, [convertModal]);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const householdSummaryRequest = (!isDiod || user?.activeHouseholdId)
        ? apiRequest("/api/kitchen/household/summary")
        : Promise.resolve({ household: { name: "", inviteCode: "" } });
      const requests = [
        apiRequest("/api/categories?includeInactive=true"),
        apiRequest("/api/kitchen/dish-categories?includeInactive=true"),
        householdSummaryRequest
      ];
      if (!isDiod || user?.activeHouseholdId) {
        requests.push(apiRequest("/api/kitchen/users/members"));
      } else {
        requests.push(Promise.resolve({ users: [] }));
      }
      if (canManageHousehold) {
        requests.push(apiRequest("/api/kitchen/household/invitations"));
        requests.push(apiRequest("/api/kitchen/household/invite-code"));
      } else {
        requests.push(Promise.resolve({ invitations: [] }));
        requests.push(Promise.resolve({ inviteCode: "" }));
      }

      const [categoryData, dishCategoryData, householdData, memberData, invitationData, codeData] = await Promise.all(requests);
      setCategories(categoryData.categories || []);
      setDishCategories(dishCategoryData.categories || []);
      setHouseholdName(householdData?.household?.name || "");
      setHouseholdNameDraft(householdData?.household?.name || "");
      setDinnersEnabled(Boolean(householdData?.household?.dinnersEnabled));
      setDinnersIncludeInShopping(Boolean(householdData?.household?.dinnersIncludeInShopping));
      setAvoidRepeatsEnabled(Boolean(householdData?.household?.avoidRepeatsEnabled));
      setAvoidRepeatsWeeks(clampAvoidRepeatWeeks(householdData?.household?.avoidRepeatsWeeks));
      setMonthlyBudget(householdData?.household?.monthlyBudget === null || householdData?.household?.monthlyBudget === undefined ? "" : String(householdData.household.monthlyBudget));
      setCycleStartDay(Number(householdData?.household?.cycleStartDay) || 1);
      setSubscriptionPlan(String(householdData?.household?.subscriptionPlan || "basic").toLowerCase());
      setSubscriptionStatus(String(householdData?.household?.subscriptionStatus || "inactive").toLowerCase());
      setSubscriptionRequestedPlan(String(householdData?.household?.subscriptionRequestedPlan || "").toLowerCase());
      setSubscriptionEndsAt(householdData?.household?.subscriptionEndsAt || null);
      setHouseholdPlanSource(String(householdData?.household?.planSource || ""));
      setHouseholdBetaProActive(Boolean(householdData?.household?.betaProActive));
      setPendingDowngradeAt(householdData?.household?.pendingDowngradeAt || null);
      setDietFilterEnabled(Boolean(householdData?.household?.randomizationUseDietFilter));
      setDietDefaultPackIds(Array.isArray(householdData?.household?.randomizationDefaultDietPackIds) ? householdData.household.randomizationDefaultDietPackIds : []);
      setMembers(memberData.users || []);
      setInvitations(invitationData.invitations || []);
      setHouseholdCode(codeData.inviteCode || householdData?.household?.inviteCode || "");
      setDisplayName(user?.displayName || "");
      setProfileInitials(user?.initials || getUserInitialsPreference(user?.id) || initialsFromName(user?.displayName || ""));
      setSelectedColorId(user?.colorId || getUserColorPreference(user?.id) || "lavender");
      setProfileActive(user?.active !== false);
      setProfileCanCook(user?.canCook !== false);
      setProfileDinnerActive(user?.dinnerActive !== false);
      setProfileDinnerCanCook(user?.dinnerCanCook !== false);
      setProfileSnapshot({
        displayName: user?.displayName || "",
        initials: user?.initials || getUserInitialsPreference(user?.id) || initialsFromName(user?.displayName || ""),
        colorId: user?.colorId || getUserColorPreference(user?.id) || "lavender",
        active: user?.active !== false,
        canCook: user?.canCook !== false,
        dinnerActive: user?.dinnerActive !== false,
        dinnerCanCook: user?.dinnerCanCook !== false
      });
    } catch (err) {
      setError(err.message || "No se pudo cargar configuracion.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [isDiod, canManageHousehold, user?.activeHouseholdId]);

  useEffect(() => {
    if (!canManageHousehold) return;
    apiRequest("/api/kitchen/catalog/packs")
      .then((data) => {
        const dietPacks = (data.packs || []).filter((p) => p.isDietPack && p.entitlement?.installed);
        setInstalledDietPacks(dietPacks);
      })
      .catch(() => {});
  }, [canManageHousehold, user?.activeHouseholdId]);

  useEffect(() => {
    if (!copiedField) return;
    const timer = setTimeout(() => setCopiedField(""), 700);
    return () => clearTimeout(timer);
  }, [copiedField]);

  const loadDeletedItems = async () => {
    if (!canManageDeleted) return;
    if (isDiod && !user?.activeHouseholdId) {
      setDeletedItems({ dishes: [], sides: [], ingredients: [] });
      return;
    }
    setDeletedLoading(true);
    try {
      const [dishesData, ingredientsData] = await Promise.all([
        apiRequest("/api/kitchen/dishes?includeInactive=true"),
        apiRequest("/api/kitchenIngredients?includeInactive=true&limit=0")
      ]);
      setDeletedItems({
        dishes: (dishesData?.dishes || []).filter((item) => item?.active === false),
        sides: [],
        ingredients: (ingredientsData?.ingredients || []).filter((item) => item?.active === false)
      });
    } catch (err) {
      setError(err.message || "No se pudieron cargar los eliminados.");
    } finally {
      setDeletedLoading(false);
    }
  };

  useEffect(() => {
    if (activePanel !== "eliminados") return;
    void loadDeletedItems();
  }, [activePanel, canManageDeleted, isDiod, user?.activeHouseholdId]);

  const loadBitesHistory = async () => {
    setBitesHistoryLoading(true);
    try {
      const data = await apiRequest("/api/kitchen/household/bites-history");
      setBitesHistory(data?.transactions || []);
      setBitesSummary({ free: data?.freeBitesBalance ?? 0, purchased: data?.purchasedBitesBalance ?? 0 });
    } catch (err) {
      setError(err.message || "No se pudo cargar el historial de Bites.");
    } finally {
      setBitesHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activePanel !== "bites") return;
    void loadBitesHistory();
  }, [activePanel, user?.activeHouseholdId]);

  const loadBasics = async () => {
    setBasicsLoading(true);
    setBasicsError("");
    try {
      const data = await apiRequest("/api/kitchen/basics");
      setBasics(data.basics || []);
    } catch (err) {
      setBasicsError(err.message || "No se pudieron cargar los básicos.");
    } finally {
      setBasicsLoading(false);
    }
  };

  useEffect(() => {
    if (activePanel !== "basicos") return;
    void loadBasics();
  }, [activePanel, user?.activeHouseholdId]);

  const handleBasicAdded = async (/* newBasic */) => {
    await loadBasics();
  };

  const deleteBasic = async (id) => {
    setBasicsError("");
    try {
      await apiRequest(`/api/kitchen/basics/${id}`, { method: "DELETE" });
      await loadBasics();
    } catch (err) {
      setBasicsError(err.message || "No se pudo eliminar el básico.");
    }
  };

  const toggleBasicActive = async (id, currentActive) => {
    setBasicsError("");
    try {
      await apiRequest(`/api/kitchen/basics/${id}`, {
        method: "PUT",
        body: JSON.stringify({ active: !currentActive })
      });
      await loadBasics();
    } catch (err) {
      setBasicsError(err.message || "No se pudo actualizar el básico.");
    }
  };

  const saveProfile = async () => {
    const safeDisplayName = displayName.trim();
    if (!safeDisplayName) {
      setError("El nombre visible es obligatorio.");
      return;
    }
    try {
      const safeInitials = (profileInitials.trim().toUpperCase() || initialsFromName(safeDisplayName)).slice(0, 3);
      const canEditOwnActive = isOwner || isDiod;
      const data = await apiRequest("/api/kitchen/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: safeDisplayName,
          initials: safeInitials,
          colorId: selectedColorId,
          canCook: profileCanCook,
          dinnerCanCook: profileDinnerCanCook,
          dinnerActive: profileDinnerActive,
          ...(canEditOwnActive ? { active: profileActive } : {})
        })
      });
      if (data?.user) setUser((prev) => ({ ...prev, ...data.user }));
      setUserInitialsPreference(user?.id, safeInitials);
      setUserColorPreference(user?.id, selectedColorId);
      await refreshUser();
      setProfileEditingMain(false);
      updateSuccess("Perfil actualizado.");
    } catch (err) {
      setError(err.message || "No se pudo guardar el perfil.");
    }
  };

  const savePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setError("Completa todos los campos de contrasena.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError("La nueva contrasena y su confirmacion no coinciden.");
      return;
    }
    try {
      await apiRequest("/api/kitchen/users/me/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword })
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordModalOpen(false);
      updateSuccess("Contrasena actualizada.");
    } catch (err) {
      setError(err.message || "No se pudo cambiar la contrasena.");
    }
  };

  const saveHouseholdName = async () => {
    const safeName = householdNameDraft.trim();
    if (!safeName) {
      setError("El nombre del household es obligatorio.");
      return;
    }
    try {
      const data = await apiRequest("/api/kitchen/household/name", {
        method: "PATCH",
        body: JSON.stringify({ name: safeName })
      });
      setHouseholdName(data?.household?.name || safeName);
      setHouseholdNameEditing(false);
      updateSuccess("Nombre del household actualizado.");
      notifyOnboarding("update_household");
      await refreshUser();
    } catch (err) {
      setError(err.message || "No se pudo actualizar el household.");
    }
  };

  const saveHouseholdPreferences = async (nextValues = {}) => {
    if (!canManageHousehold) return;
    const nextEnabled = Object.prototype.hasOwnProperty.call(nextValues, "avoidRepeatsEnabled")
      ? Boolean(nextValues.avoidRepeatsEnabled)
      : Boolean(avoidRepeatsEnabled);
    const nextDinnersEnabled = Object.prototype.hasOwnProperty.call(nextValues, "dinnersEnabled")
      ? Boolean(nextValues.dinnersEnabled)
      : Boolean(dinnersEnabled);
    const nextDinnersIncludeInShopping = Object.prototype.hasOwnProperty.call(nextValues, "dinnersIncludeInShopping")
      ? Boolean(nextValues.dinnersIncludeInShopping)
      : Boolean(dinnersIncludeInShopping);
    const nextWeeks = clampAvoidRepeatWeeks(
      Object.prototype.hasOwnProperty.call(nextValues, "avoidRepeatsWeeks")
        ? nextValues.avoidRepeatsWeeks
        : avoidRepeatsWeeks
    );
    const nextMonthlyBudget = Object.prototype.hasOwnProperty.call(nextValues, "monthlyBudget")
      ? nextValues.monthlyBudget
      : monthlyBudget;
    const nextCycleStartDay = Math.min(
      28,
      Math.max(
        1,
        Number.parseInt(String(
          Object.prototype.hasOwnProperty.call(nextValues, "cycleStartDay")
            ? nextValues.cycleStartDay
            : cycleStartDay
        ), 10) || 1
      )
    );
    const dietEnabled = canUseDietRandomization(subscriptionAccess);
    const nextDietFilterEnabled = Object.prototype.hasOwnProperty.call(nextValues, "randomizationUseDietFilter")
      ? Boolean(nextValues.randomizationUseDietFilter)
      : Boolean(dietFilterEnabled);
    const nextDietDefaultPackIds = Object.prototype.hasOwnProperty.call(nextValues, "randomizationDefaultDietPackIds")
      ? nextValues.randomizationDefaultDietPackIds
      : dietDefaultPackIds;

    setHouseholdPrefsSaving(true);
    try {
      const data = await apiRequest("/api/kitchen/household/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          avoidRepeatsEnabled: nextEnabled,
          dinnersEnabled: nextDinnersEnabled,
          ...(canUseDinners ? { dinnersIncludeInShopping: nextDinnersIncludeInShopping } : {}),
          avoidRepeatsWeeks: Number(nextWeeks),
          ...(budgetFeatureEnabled
            ? {
                monthlyBudget: nextMonthlyBudget === "" ? null : Number(nextMonthlyBudget),
                cycleStartDay: nextCycleStartDay
              }
            : {}),
          ...(dietEnabled
            ? {
                randomizationUseDietFilter: nextDietFilterEnabled,
                randomizationDefaultDietPackIds: nextDietDefaultPackIds
              }
            : {})
        })
      });
      setDinnersEnabled(Boolean(data?.household?.dinnersEnabled));
      setDinnersIncludeInShopping(Boolean(data?.household?.dinnersIncludeInShopping));
      setAvoidRepeatsEnabled(Boolean(data?.household?.avoidRepeatsEnabled));
      setAvoidRepeatsWeeks(clampAvoidRepeatWeeks(data?.household?.avoidRepeatsWeeks));
      setMonthlyBudget(data?.household?.monthlyBudget === null || data?.household?.monthlyBudget === undefined ? "" : String(data.household.monthlyBudget));
      setCycleStartDay(Number(data?.household?.cycleStartDay) || 1);
      setSubscriptionPlan(String(data?.household?.subscriptionPlan || "basic").toLowerCase());
      setSubscriptionStatus(String(data?.household?.subscriptionStatus || "inactive").toLowerCase());
      setSubscriptionRequestedPlan(String(data?.household?.subscriptionRequestedPlan || "").toLowerCase());
      setHouseholdPlanSource(String(data?.household?.planSource || ""));
      setHouseholdBetaProActive(Boolean(data?.household?.betaProActive));
      setDietFilterEnabled(Boolean(data?.household?.randomizationUseDietFilter));
      setDietDefaultPackIds(Array.isArray(data?.household?.randomizationDefaultDietPackIds) ? data.household.randomizationDefaultDietPackIds : []);
      // Weekly challenge: budget configured when a non-empty, non-zero budget was saved
      if (budgetFeatureEnabled && nextMonthlyBudget !== "" && Number(nextMonthlyBudget) > 0) {
        notifyWeekly("budget_configured");
      }
      updateSuccess("Preferencia del household actualizada.");
    } catch (err) {
      setError(err.message || "No se pudieron guardar las preferencias del household.");
    } finally {
      setHouseholdPrefsSaving(false);
    }
  };

  const openDeleteProfileFlow = async () => {
    setDeleteProfileModal({
      open: true,
      loading: true,
      preview: null,
      promoteUserId: "",
      confirmDeleteHousehold: false
    });
    try {
      const data = await apiRequest("/api/kitchen/users/me/delete-preview");
      setDeleteProfileModal((prev) => ({
        ...prev,
        loading: false,
        preview: data.preview || null
      }));
    } catch (err) {
      setDeleteProfileModal((prev) => ({ ...prev, loading: false }));
      setError(err.message || "No se pudo cargar la vista previa de eliminacion.");
    }
  };

  const confirmDeleteProfile = async () => {
    if (!deleteProfileModal.preview) return;
    try {
      const body = {};
      if (deleteProfileModal.preview.mustTransferOwner) {
        body.promoteUserId = deleteProfileModal.promoteUserId;
      }
      if (deleteProfileModal.preview.willDeleteHousehold) {
        body.confirmDeleteHousehold = deleteProfileModal.confirmDeleteHousehold;
      }
      const data = await apiRequest("/api/kitchen/users/me", {
        method: "DELETE",
        body: JSON.stringify(body)
      });
      if (data?.clerkDeletionWarning) {
        console.warn("[clerk] Profile deleted in Mongo but Clerk cleanup needs attention", data);
      }
      logout();
      navigate(data?.clerkDeletionWarning ? `/login?deleted=1&warning=${encodeURIComponent(data.clerkDeletionWarning)}` : "/login?deleted=1", { replace: true });
    } catch (err) {
      setError(err.message || "No se pudo eliminar el perfil.");
    }
  };

  const copyText = async (value, label, key = "") => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      if (key) setCopiedField(key);
      updateSuccess("Copiado al portapapeles");
    } catch {
      setError(`No se pudo copiar ${label.toLowerCase()}.`);
    }
  };

  const generateHouseholdCode = async () => {
    try {
      const data = await apiRequest("/api/kitchen/household/invite-code", { method: "POST" });
      setHouseholdCode(data.inviteCode || "");
      updateSuccess("Codigo generado.");
    } catch (err) {
      setError(err.message || "No se pudo generar el codigo.");
    }
  };

  const openInvitesPanel = async () => {
    if (!canAddMoreUsers) {
      setError(userLimitMessage);
      navigate("/kitchen/upgrade");
      return;
    }
    setPanel("share");
  };

  const openMemberModal = (member) => {
    if (!canManageHousehold && String(member.id) !== String(user?.id)) return;
    setMemberModal({
      open: true,
      member,
      form: {
        displayName: member.displayName || "",
        initials: (member.initials || initialsFromName(member.displayName || "")).slice(0, 3),
        colorId: member.colorId || "lavender",
        role: member.role || "member",
        active: member.active !== false,
        canCook: member.canCook !== false,
        dinnerActive: member.dinnerActive !== false,
        dinnerCanCook: member.dinnerCanCook !== false
      }
    });
  };

  const closeMemberModal = () => {
    setMemberModal({
      open: false,
      member: null,
      form: {
        displayName: "",
        initials: "",
        colorId: "lavender",
        role: "member",
        active: true,
        canCook: true,
        dinnerActive: true,
        dinnerCanCook: true
      }
    });
  };

  const saveMember = async () => {
    if (!memberModal.member) return;
    try {
      const isSelf = String(memberModal.member.id) === String(user?.id);
      const payload = canManageHousehold
        ? {
          displayName: memberModal.form.displayName.trim(),
          initials: memberModal.form.initials.trim().toUpperCase().slice(0, 3),
          colorId: memberModal.form.colorId,
          role: memberModal.form.role,
          active: memberModal.form.active,
          canCook: memberModal.form.canCook,
          dinnerActive: memberModal.form.dinnerActive,
          dinnerCanCook: memberModal.form.dinnerCanCook
        }
        : (isSelf ? { canCook: memberModal.form.canCook, dinnerCanCook: memberModal.form.dinnerCanCook } : {});
      const data = await apiRequest(`/api/kitchen/users/members/${memberModal.member.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      if (String(memberModal.member.id) === String(user?.id) && data?.user) {
        setUser((prev) => ({ ...prev, ...data.user }));
      }
      closeMemberModal();
      updateSuccess("Usuario actualizado.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo actualizar el usuario.");
    }
  };

  const askDeleteMember = (member) => {
    setConfirmModal({
      open: true,
      title: "Eliminar usuario",
      message: `Seguro que quieres eliminar a ${member.displayName} del household?`,
      dangerLabel: "Eliminar",
      onConfirm: async () => {
        const data = await apiRequest(`/api/kitchen/users/members/${member.id}`, { method: "DELETE" });
        closeMemberModal();
        updateSuccess(data?.clerkDeletionWarning || "Usuario eliminado.");
        await loadData();
      }
    });
  };

  const createDiner = async () => {
    if (!canAddMoreNonUserDiners) {
      setError(nonUserDinerLimitMessage);
      navigate("/kitchen/upgrade");
      return;
    }
    const safeName = dinerModal.form.displayName.trim();
    if (!safeName) {
      setError("El nombre del comensal es obligatorio.");
      return;
    }
    try {
      await apiRequest("/api/kitchen/household/placeholders", {
        method: "POST",
        body: JSON.stringify({
          displayName: safeName,
          initials: dinerModal.form.initials.trim().toUpperCase().slice(0, 3),
          colorId: dinerModal.form.colorId,
          active: dinerModal.form.active,
          canCook: dinerModal.form.canCook,
          dinnerActive: dinerModal.form.dinnerActive,
          dinnerCanCook: dinerModal.form.dinnerCanCook
        })
      });
      setDinerModal({
        open: false,
        form: {
          displayName: "",
          initials: "",
          colorId: "lavender",
          active: true,
          canCook: false,
          dinnerActive: true,
          dinnerCanCook: false
        }
      });
      updateSuccess("Comensal creado.");
      await loadData();
    } catch (err) {
      if (isNonUserDinerLimitReachedError(err)) {
        setError(nonUserDinerLimitMessage);
        return;
      }
      setError(err.message || "No se pudo crear el comensal.");
    }
  };

  const convertPlaceholder = async () => {
    if (!convertModal.memberId) return;
    if (!canAddMoreUsers) {
      setError(userLimitMessage);
      navigate("/kitchen/upgrade");
      return;
    }
    const email = convertModal.email.trim().toLowerCase();
    const password = convertModal.password.trim();
    if (!EMAIL_RE.test(email) || password.length < 8) {
      setError("Email o contrasena no validos para convertir.");
      return;
    }
    try {
      await apiRequest(`/api/kitchen/household/placeholders/${convertModal.memberId}/convert`, {
        method: "POST",
        body: JSON.stringify({
          email,
          password
        })
      });
      updateSuccess("Comensal convertido en usuario.");
      setConvertModal({ open: false, memberId: "", email: "", password: "" });
      closeMemberModal();
      await loadData();
    } catch (err) {
      if (isUserLimitReachedError(err)) {
        setError(userLimitMessage);
        return;
      }
      setError(err.message || "No se pudo convertir el comensal.");
    }
  };

  const createCategory = async (kind, sourceName, colorBg, colorText, active) => {
    const safeName = String(sourceName || "").trim();
    if (!safeName) return;
    try {
      const endpoint = kind === "dish" ? "/api/kitchen/dish-categories" : "/api/categories";
      const payload = kind === "dish"
        ? {
            name: safeName,
            colorBg,
            colorText,
            active: active !== false
          }
        : {
            name: safeName,
            colorBg,
            colorText,
            active: active !== false,
            ...(isDiod ? { scope: "master" } : {})
          };
      await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setCategoryModal(buildClosedCategoryModal());
      notifyCatalogInvalidated();
      updateSuccess("Categoria creada.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo crear categoria.");
    }
  };

  const editCategory = async (kind, category, nextName, colorBg, colorText, active) => {
    const safeName = String(nextName || "").trim();
    if (!safeName) return;
    try {
      const endpoint = kind === "dish"
        ? `/api/kitchen/dish-categories/${category._id}`
        : `/api/categories/${category._id}`;
      const payload = kind === "dish"
        ? {
            name: safeName,
            colorBg,
            colorText,
            active: active !== false
          }
        : {
            name: safeName,
            colorBg,
            colorText,
            active: active !== false,
            forRecipes: category.forRecipes
          };
      await apiRequest(endpoint, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setCategoryModal(buildClosedCategoryModal());
      notifyCatalogInvalidated();
      updateSuccess("Categoria actualizada.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo editar categoria.");
    }
  };

  const removeCategory = async (kind, category) => {
    setConfirmModal({
      open: true,
      title: "Eliminar categoria",
      message: `Se eliminara la categoria "${category.name}".`,
      dangerLabel: "Eliminar",
      onConfirm: async () => {
        const endpoint = kind === "dish"
          ? `/api/kitchen/dish-categories/${category._id}`
          : `/api/categories/${category._id}`;
        await apiRequest(endpoint, { method: "DELETE" });
        notifyCatalogInvalidated();
        updateSuccess("Categoria eliminada.");
        await loadData();
      }
    });
  };

  const restoreDeletedItem = async (kind, id) => {
    try {
      if (kind === "ingredient") {
        await apiRequest(`/api/kitchenIngredients/${id}/restore`, { method: "POST" });
      } else {
        await apiRequest(`/api/kitchen/dishes/${id}/restore`, { method: "POST" });
      }
      updateSuccess("Elemento recuperado.");
      await Promise.all([loadDeletedItems(), loadData()]);
    } catch (err) {
      setError(err.message || "No se pudo recuperar el elemento.");
    }
  };

  const CardButton = ({ title, subtitle, onClick, icon = ">", className = "" }) => (
    <button type="button" className={`settings-hub-card ${className}`.trim()} onClick={onClick}>
      <div className="settings-hub-card-main">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <span className="settings-hub-card-arrow">{icon}</span>
    </button>
  );

  const ProfilePanel = (
    <div className="settings-panel">
      <div className="settings-panel-heading">
        <button type="button" className="settings-back-btn" onClick={() => setPanel("")}>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Volver
        </button>
        <h2 className="settings-panel-title">Tu perfil</h2>
        <p className="settings-panel-sub">Identidad visual y disponibilidad de cocinero</p>
      </div>
      <div className="settings-block">
        <p className="settings-section-label" style={{ marginBottom: 12 }}>Información personal</p>
        <div className="settings-inline-heading">
          <h3 className="settings-subtitle">Nombre y color</h3>
          {!profileEditingMain ? (
            <button type="button" className="settings-icon-only" onClick={enterProfileEdit} aria-label="Editar perfil">
              <PencilIcon />
            </button>
          ) : (
            <div className="settings-icon-row">
              <button type="button" className="settings-icon-only" onClick={saveProfile} aria-label="Guardar perfil">
                <SaveIcon />
              </button>
              <button type="button" className="settings-icon-only" onClick={cancelProfileEdit} aria-label="Cancelar edición">
                <CloseIcon />
              </button>
            </div>
          )}
        </div>
        <div className={`settings-readonly-grid two-cols ${profileEditingMain ? "" : "is-view-mode"}`}>
          <label className="kitchen-field">
            <span className="kitchen-label">Nombre</span>
            <input id="settings-display-name" className={`kitchen-input ${profileEditingMain ? "" : "is-readonly-field"}`} value={displayName} readOnly={!profileEditingMain} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label className="kitchen-field">
            <span className="kitchen-label">Iniciales</span>
            <input id="settings-initials" className={`kitchen-input ${profileEditingMain ? "" : "is-readonly-field"}`} maxLength={3} value={profileInitials} readOnly={!profileEditingMain} onChange={(event) => setProfileInitials(event.target.value.toUpperCase())} placeholder="FR" />
          </label>
        </div>
        <div className="settings-color-grid">
          {palette.map((color) => (
            <button
              key={color.id}
              type="button"
              className={`settings-color-swatch ${selectedColorId === color.id ? "is-selected" : ""}`}
              style={{ background: color.background, color: color.text }}
              onClick={() => profileEditingMain && setSelectedColorId(color.id)}
              disabled={!profileEditingMain}
            >
              {color.label}
            </button>
          ))}
        </div>
        <label className="kitchen-field kitchen-toggle-field">
          <div className="kitchen-toggle-row">
            <span className="kitchen-label">Incluir como comensal por defecto</span>
            <label className="kitchen-toggle">
              <input
                type="checkbox"
                className="kitchen-toggle-input"
                checked={profileActive}
                disabled={!profileEditingMain || (!isOwner && !isDiod)}
                onChange={(event) => setProfileActive(event.target.checked)}
              />
              <span className="kitchen-toggle-track" />
            </label>
          </div>
          <p className="kitchen-muted">Si está activado, esta persona aparecerá automáticamente como comensal cuando se planifique un plato.</p>
        </label>
        <label className="kitchen-field kitchen-toggle-field">
          <div className="kitchen-toggle-row">
            <span className="kitchen-label">Puede cocinar</span>
            <label className="kitchen-toggle">
              <input
                type="checkbox"
                className="kitchen-toggle-input"
                checked={profileCanCook}
                disabled={!profileEditingMain}
                onChange={(event) => setProfileCanCook(event.target.checked)}
              />
              <span className="kitchen-toggle-track" />
            </label>
          </div>
          <p className="kitchen-muted">Puede asignarse automáticamente como cocinero al randomizar.</p>
        </label>
        {/* Dinner preferences — only visible when household plan supports dinners AND dinners are enabled */}
        {canUseDinners && dinnersEnabled ? (
          <>
            <label className="kitchen-field kitchen-toggle-field">
              <div className="kitchen-toggle-row">
                <span className="kitchen-label">Incluir como comensal por defecto en cenas</span>
                <label className="kitchen-toggle">
                  <input
                    type="checkbox"
                    className="kitchen-toggle-input"
                    checked={profileDinnerActive}
                    disabled={!profileEditingMain || (!isOwner && !isDiod)}
                    onChange={(event) => setProfileDinnerActive(event.target.checked)}
                  />
                  <span className="kitchen-toggle-track" />
                </label>
              </div>
              <p className="kitchen-muted">Si está activado, aparecerá automáticamente como comensal en cenas.</p>
            </label>
            <label className="kitchen-field kitchen-toggle-field">
              <div className="kitchen-toggle-row">
                <span className="kitchen-label">Puede cocinar cenas</span>
                <label className="kitchen-toggle">
                  <input
                    type="checkbox"
                    className="kitchen-toggle-input"
                    checked={profileDinnerCanCook}
                    disabled={!profileEditingMain}
                    onChange={(event) => setProfileDinnerCanCook(event.target.checked)}
                  />
                  <span className="kitchen-toggle-track" />
                </label>
              </div>
              <p className="kitchen-muted">Si está activado, podrá asignarse automáticamente para cocinar cenas.</p>
            </label>
          </>
        ) : null}
        <p className="kitchen-muted">Email: {user?.email || "Sin email"}</p>
      </div>
      <div className="settings-block">
        <p className="settings-section-label" style={{ marginBottom: 12 }}>Seguridad</p>
        <button type="button" className="kitchen-button secondary" onClick={() => setPasswordModalOpen(true)}>Cambiar contraseña</button>
      </div>
      <div className="settings-block danger">
        <p className="settings-section-label" style={{ marginBottom: 8, color: "var(--danger-text)" }}>Zona de peligro</p>
        <p className="settings-danger-text">Esta accion puede eliminar tu cuenta o todo el household si eres el ultimo owner.</p>
        <button type="button" className="kitchen-button secondary danger" onClick={openDeleteProfileFlow}>Eliminar mi perfil</button>
      </div>
    </div>
  );

  const PreferencesPanel = (
    <div className="settings-panel">
      <div className="settings-panel-heading">
        <button type="button" className="settings-back-btn" onClick={() => setPanel("")}>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Volver
        </button>
        <h2 className="settings-panel-title">Preferencias</h2>
        <p className="settings-panel-sub">Apariencia, notificaciones y más</p>
      </div>

      {/* App */}
      <div className="settings-block">
        <p className="settings-section-label" style={{ marginBottom: 12 }}>App</p>
        <div className="settings-coming-row"><span>Idioma</span><span className="kitchen-pill">Próximamente</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--hf-text)" }}>Apariencia</span>
          <div className="theme-selector">
            <button
              type="button"
              className={`theme-selector-option${theme === "system" ? " is-active" : ""}`}
              onClick={() => setTheme("system")}
            >
              <svg className="theme-selector-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
              Sistema
            </button>
            <button
              type="button"
              className={`theme-selector-option${theme === "light" ? " is-active" : ""}`}
              onClick={() => setTheme("light")}
            >
              <svg className="theme-selector-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
              Claro
            </button>
            <button
              type="button"
              className={`theme-selector-option${theme === "dark" ? " is-active" : ""}`}
              onClick={() => setTheme("dark")}
            >
              <svg className="theme-selector-icon" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: 1.6 }}>
                <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" />
              </svg>
              Oscuro
            </button>
          </div>
        </div>
      </div>

      {/* Notificaciones */}
      <div className="settings-block">
        <p className="settings-section-label" style={{ marginBottom: 12 }}>Notificaciones e instalación</p>
        <PushNotificationsPanel refreshKey={user?.id || ""} />
        <PwaInstallSettingsBlock />
      </div>
    </div>
  );

  const HouseholdMembersPanel = (
    <div className="settings-panel">
      <div className="settings-panel-heading">
        <button type="button" className="settings-back-btn" onClick={() => setPanel("")}>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Volver
        </button>
        <h2 className="settings-panel-title">{householdName || "Mi hogar"}</h2>
        <p className="settings-panel-sub">Miembros, comensales y ajustes del hogar</p>
      </div>
      {/* 1 · Household summary card */}
      <div className="hh-summary-card">
        <div className="hh-summary-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
            <path d="M3 12.5L12 4l9 8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M6 11v7a1 1 0 001 1h4v-4h2v4h4a1 1 0 001-1v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className="hh-summary-body">
          {householdNameEditing ? (
            <div className="hh-summary-edit">
              <input
                className="kitchen-input"
                value={householdNameDraft}
                onChange={(e) => setHouseholdNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveHouseholdName();
                  if (e.key === "Escape") { setHouseholdNameDraft(householdName || ""); setHouseholdNameEditing(false); }
                }}
                autoFocus
                style={{ marginBottom: 8 }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="settings-mini-button" onClick={saveHouseholdName}>Guardar</button>
                <button type="button" className="settings-mini-button" onClick={() => { setHouseholdNameDraft(householdName || ""); setHouseholdNameEditing(false); }}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="hh-summary-name-row">
              <span className="hh-summary-name">{householdName || "Mi hogar"}</span>
              {canManageHousehold ? (
                <button
                  type="button"
                  className="settings-icon-only hh-summary-edit-btn"
                  onClick={() => { setHouseholdNameDraft(householdName || ""); setHouseholdNameEditing(true); }}
                  aria-label="Editar nombre del hogar"
                >
                  <PencilIcon />
                </button>
              ) : null}
            </div>
          )}
          <p className="hh-summary-meta">
            {members.length} {members.length === 1 ? "miembro" : "miembros"}
            {" · "}
            <span className={subscriptionBadgeClassName(subscriptionPlan)}>{formatSubscriptionPlanLabel(subscriptionPlan)}</span>
          </p>
          {(() => {
            const owner = members.find((m) => !m.isPlaceholder && (m.role === "owner" || m.role === "admin"));
            if (!owner) return null;
            const isSelf = String(owner.id) === String(user?.id);
            return <p className="hh-summary-owner">Owner: <strong>{isSelf ? "Tú" : owner.displayName}</strong></p>;
          })()}
        </div>
      </div>

      {/* 2 · Acciones del hogar */}
      {canManageHousehold ? (
        <div className="settings-block">
          <p className="settings-section-label" style={{ marginBottom: 12 }}>Acciones del hogar</p>
          <div className="hh-actions-row">
            <button type="button" className="hh-action-btn" onClick={openInvitesPanel} disabled={!canAddMoreUsers}>
              <span className="hh-action-icon">
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                  <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M2 16c0-2.761 2.686-5 6-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M15 11v6M12 14h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </span>
              <span className="hh-action-label">Invitar miembro</span>
            </button>
            <button
              type="button"
              className="hh-action-btn"
              onClick={() => setDinerModal({ open: true, form: { displayName: "", initials: "", colorId: "lavender", active: true, canCook: false, dinnerActive: true, dinnerCanCook: false } })}
              disabled={!canAddMoreNonUserDiners}
            >
              <span className="hh-action-icon">
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                  <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M4 16c0-2.761 2.686-5 6-5s6 2.239 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
              <span className="hh-action-label">Crear comensal</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* 3 · Plan limit notice */}
      {canManageHousehold && (!canAddMoreUsers || !canAddMoreNonUserDiners) ? (
        <div className="hh-plan-status">
          <div className="hh-plan-status-head">
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true">
              <path d="M10 2l2.5 5h5l-4 3 1.5 5.5L10 12.5 5 15.5 6.5 10l-4-3h5L10 2z" stroke="#d97706" strokeWidth="1.4" strokeLinejoin="round"/>
            </svg>
            <span className="hh-plan-status-title">Plan {formatSubscriptionPlanLabel(subscriptionPlan)}</span>
            <button type="button" className="kitchen-button secondary" style={{ marginLeft: "auto", fontSize: "0.79rem", padding: "5px 12px" }} onClick={() => navigate("/kitchen/upgrade")}>Mejorar plan</button>
          </div>
          {!canAddMoreUsers ? <p className="hh-plan-status-msg">Has alcanzado el límite de usuarios de tu plan.</p> : null}
          {!canAddMoreNonUserDiners ? <p className="hh-plan-status-msg">Has alcanzado el límite de comensales de tu plan.</p> : null}
        </div>
      ) : null}

      {/* 4 · Members grouped */}
      {(() => {
        const owners = members.filter((m) => !m.isPlaceholder && (m.role === "owner" || m.role === "admin"));
        const otherMembers = members.filter((m) => m.isPlaceholder || (m.role !== "owner" && m.role !== "admin"));
        const renderMember = (member) => {
          const colors = getUserColorById(member.colorId, member.id);
          const initials = (member.initials || initialsFromName(member.displayName || "")).slice(0, 3);
          const isSelf = String(member.id) === String(user?.id);
          const caps = [];
          if (member.active !== false) caps.push("Incluido por defecto");
          if (member.canCook !== false) caps.push("Puede cocinar");
          return (
            <button
              type="button"
              key={member.id}
              className="hh-member-row"
              onClick={() => openMemberModal(member)}
              disabled={!canManageHousehold && !isSelf}
            >
              <span className="hh-member-avatar" style={{ background: colors.background, color: colors.text }}>{initials}</span>
              <span className="hh-member-info">
                <span className="hh-member-name">
                  {member.displayName}
                  {isSelf ? <span className="hh-member-self"> · Tú</span> : null}
                </span>
                <span className="hh-member-role-badge">{memberRoleLabel(member)}</span>
                {caps.length > 0 ? <span className="hh-member-caps">{caps.join(" · ")}</span> : null}
              </span>
              <svg className="hh-member-chevron" viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          );
        };
        return (
          <>
            {owners.length > 0 ? (
              <div className="settings-block">
                <p className="settings-section-label" style={{ marginBottom: 10 }}>Owner</p>
                {owners.map(renderMember)}
              </div>
            ) : null}
            {otherMembers.length > 0 ? (
              <div className="settings-block">
                <p className="settings-section-label" style={{ marginBottom: 10 }}>Miembros ({otherMembers.length})</p>
                {otherMembers.map(renderMember)}
              </div>
            ) : null}
            {!members.length ? <p className="kitchen-muted" style={{ padding: "0 4px" }}>No hay miembros.</p> : null}
          </>
        );
      })()}
      {canManageHousehold ? (
        <div className="settings-block">
        <p className="settings-section-label" style={{ marginBottom: 12 }}>Preferencias de planificación</p>

        {/* ── Dinner activation toggle ────────────────────────────────── */}
        <div className="settings-household-pref-row settings-dinner-activation-row">
          <div className="settings-household-pref-main">
            <div className="settings-household-pref-title">
              <span>🌙 Planificar cenas</span>
              {!canUseDinners ? (
                <span className="dinner-gate-pro-badge">PRO</span>
              ) : null}
            </div>
            <p className="kitchen-muted">
              {canUseDinners
                ? (dinnersEnabled
                    ? "Las cenas están activas. Se muestran en la planificación semanal."
                    : "Activa las cenas para planificar comidas y cenas en tu semana.")
                : "Disponible en los planes Pro y Premium."}
            </p>
          </div>
          {canUseDinners ? (
            <label className="kitchen-toggle" aria-label="Activar cenas">
              <input
                type="checkbox"
                className="kitchen-toggle-input"
                checked={dinnersEnabled}
                disabled={householdPrefsSaving}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setDinnersEnabled(checked);
                  void saveHouseholdPreferences({ dinnersEnabled: checked });
                }}
              />
              <span className="kitchen-toggle-track" />
            </label>
          ) : (
            <button
              type="button"
              className="kitchen-button secondary"
              style={{ fontSize: "0.79rem", padding: "5px 10px", flexShrink: 0 }}
              onClick={() => navigate("/kitchen/upgrade?from=dinner-household")}
            >
              Mejorar plan
            </button>
          )}
        </div>

        {/* ── Dinner shopping inclusion toggle ─────────────────────────── */}
        {canUseDinners && dinnersEnabled ? (
          <div className="settings-household-pref-row">
            <div className="settings-household-pref-main">
              <div className="settings-household-pref-title">
                <span>🛒 Incluir cenas en la lista de la compra</span>
              </div>
              <p className="kitchen-muted">
                {dinnersIncludeInShopping
                  ? "Los ingredientes de cenas se añaden automáticamente a la lista semanal."
                  : "Las cenas no generan productos en la lista de la compra."}
              </p>
            </div>
            <label className="kitchen-toggle" aria-label="Incluir cenas en la lista de la compra">
              <input
                type="checkbox"
                className="kitchen-toggle-input"
                checked={dinnersIncludeInShopping}
                disabled={householdPrefsSaving}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setDinnersIncludeInShopping(checked);
                  void saveHouseholdPreferences({ dinnersIncludeInShopping: checked });
                }}
              />
              <span className="kitchen-toggle-track" />
            </label>
          </div>
        ) : null}

        <div className="settings-household-pref-input-row">
          {budgetFeatureEnabled ? (
            <>
              <label className="kitchen-field">
                <span className="kitchen-label">Budget mensual</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="kitchen-input"
                  value={monthlyBudget}
                  disabled={householdPrefsSaving}
                  onChange={(event) => setMonthlyBudget(event.target.value)}
                  onBlur={() => void saveHouseholdPreferences()}
                  placeholder="0.00"
                />
              </label>
              <label className="kitchen-field">
                <span className="kitchen-label">Día de inicio del ciclo</span>
                <input
                  type="number"
                  min={1}
                  max={28}
                  step={1}
                  className="kitchen-input"
                  value={cycleStartDay}
                  disabled={householdPrefsSaving}
                  onChange={(event) => setCycleStartDay(Math.min(28, Math.max(1, Number.parseInt(event.target.value || "1", 10) || 1)))}
                  onBlur={() => void saveHouseholdPreferences()}
                />
              </label>
            </>
          ) : (
            <div className="settings-budget-locked-card">
              <strong>Budget</strong>
              <p className="kitchen-muted">Upgrade your license to enable budgets.</p>
              <button type="button" className="kitchen-button secondary" onClick={() => navigate("/kitchen/upgrade")}>Upgrade your license</button>
            </div>
          )}
        </div>
        <div className="settings-household-pref-row">
          <div className="settings-household-pref-main">
            <div className="settings-household-pref-title">
              <span>No repetir plato en X semanas</span>
              <button
                type="button"
                className="settings-mini-icon"
                aria-label="Informacion sobre no repetir plato"
                onClick={() => setAvoidRepeatsInfoOpen((prev) => !prev)}
              >
                <InfoIcon />
              </button>
            </div>
            <p className="kitchen-muted">Regla best-effort para la planificación automática.</p>
          </div>
          <label className="kitchen-toggle" aria-label="Activar no repetir plato por semanas">
            <input
              type="checkbox"
              className="kitchen-toggle-input"
              checked={avoidRepeatsEnabled}
              disabled={householdPrefsSaving}
              onChange={(event) => {
                const checked = event.target.checked;
                setAvoidRepeatsEnabled(checked);
                void saveHouseholdPreferences({ avoidRepeatsEnabled: checked });
              }}
            />
            <span className="kitchen-toggle-track" />
          </label>
        </div>
        <div className="settings-household-pref-input-row">
          <label className="kitchen-field">
            <span className="kitchen-label">Semanas (X)</span>
            <input
              type="number"
              min={1}
              max={12}
              step={1}
              className="kitchen-input"
              value={avoidRepeatsWeeks}
              disabled={!avoidRepeatsEnabled || householdPrefsSaving}
              onChange={(event) => setAvoidRepeatsWeeks(clampAvoidRepeatWeeks(event.target.value))}
              onBlur={() => void saveHouseholdPreferences()}
            />
          </label>
        </div>
        {avoidRepeatsInfoOpen ? (
          <div className="settings-household-pref-popover" role="dialog" aria-modal="false">
            <div className="settings-household-pref-popover-header">
              <strong>No repetir plato en X semanas</strong>
              <button
                type="button"
                className="settings-mini-icon"
                aria-label="Cerrar informacion"
                onClick={() => setAvoidRepeatsInfoOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>
            <p>Evita, en lo posible, platos usados en las últimas X semanas al randomizar la semana actual.</p>
            <p>Es una regla best-effort: no bloquea la planificacion y puede relajarse si faltan platos.</p>
            <p>Ejemplo: con X=3 y solo 10 platos, el sistema intentara evitar repetidos y completara la semana igualmente.</p>
          </div>
        ) : null}

        <div style={{ marginTop: 8, padding: "14px 0 4px", borderTop: "1px solid var(--border-soft)" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", marginBottom: 2 }}>Filtro por dieta</div>
          <p className="kitchen-muted" style={{ marginBottom: 10 }}>Usa por defecto platos de las dietas descargadas al randomizar días o semanas.</p>
          {canUseDietRandomization(subscriptionAccess) ? (
            <>
              <div className="settings-household-pref-row">
                <div className="settings-household-pref-main">
                  <div className="settings-household-pref-title">
                    <span>Usar dietas por defecto al randomizar</span>
                  </div>
                </div>
                <label className="kitchen-toggle" aria-label="Activar filtro de dieta">
                  <input
                    type="checkbox"
                    className="kitchen-toggle-input"
                    checked={dietFilterEnabled}
                    disabled={householdPrefsSaving}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setDietFilterEnabled(checked);
                      void saveHouseholdPreferences({ randomizationUseDietFilter: checked });
                    }}
                  />
                  <span className="kitchen-toggle-track" />
                </label>
              </div>
              {dietFilterEnabled ? (
                installedDietPacks.length === 0 ? (
                  <p className="kitchen-muted" style={{ fontSize: 13, marginTop: 6 }}>
                    No tienes packs de dieta instalados. Descarga uno desde el Catálogo.
                  </p>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Selecciona las dietas para la randomización:</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {installedDietPacks.map((pack) => {
                        const isSelected = dietDefaultPackIds.includes(String(pack.id));
                        return (
                          <label key={String(pack.id)} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={householdPrefsSaving}
                              onChange={() => {
                                const nextIds = isSelected
                                  ? dietDefaultPackIds.filter((id) => id !== String(pack.id))
                                  : [...dietDefaultPackIds, String(pack.id)];
                                setDietDefaultPackIds(nextIds);
                                void saveHouseholdPreferences({ randomizationDefaultDietPackIds: nextIds });
                              }}
                            />
                            <span style={{ fontWeight: 500 }}>{pack.dietLabel || pack.title}</span>
                            <span className="kitchen-muted" style={{ fontSize: 11 }}>{pack.title}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )
              ) : null}
            </>
          ) : (
            <div className="settings-budget-locked-card">
              <p className="kitchen-muted" style={{ fontSize: 13 }}>
                Disponible en Pro y Premium. Puedes descargar dietas, pero la selección automática por defecto requiere mejorar el plan.
              </p>
              <button type="button" className="kitchen-button secondary" onClick={() => navigate("/kitchen/upgrade")}>
                Mejorar plan
              </button>
            </div>
          )}
        </div>
        </div>
      ) : null}
    </div>
  );

  const BitesPanel = (
    <div className="settings-panel">
      <div className="settings-panel-heading">
        <button type="button" className="settings-back-btn" onClick={() => setPanel("")}>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Volver
        </button>
        <h2 className="settings-panel-title">Bites</h2>
        <p className="settings-panel-sub">Saldo y movimientos de tu moneda interna</p>
      </div>
      <div className="settings-block">
        <p className="settings-section-label" style={{ marginBottom: 12 }}>Saldo actual</p>
        <div className="settings-subscription-row">
          <span className="kitchen-muted">Gratuitos</span>
          <strong>{bitesSummary.free}</strong>
        </div>
        <div className="settings-subscription-row">
          <span className="kitchen-muted">De compra</span>
          <strong>{bitesSummary.purchased}</strong>
        </div>
      </div>
      <div className="settings-block">
        <p className="settings-section-label" style={{ marginBottom: 12 }}>Historial de movimientos</p>
        {bitesHistoryLoading ? (
          <p className="kitchen-muted">Cargando...</p>
        ) : !bitesHistory.length ? (
          <p className="kitchen-muted">Aún no hay movimientos de Bites.</p>
        ) : (
          <>
            {bitesHistory.map((tx) => {
              const isSpend = tx.amount < 0 || tx.type === "pack_unlock" || tx.type === "admin_remove";
              const label = getBitesLabel(tx);
              const dateStr = new Date(tx.createdAt).toLocaleDateString("es-ES", {
                day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
              });
              return (
                <div
                  key={tx._id}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border-soft)" }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isSpend ? "var(--danger-bg)" : "var(--success-bg)",
                    color: isSpend ? "var(--danger-text)" : "var(--success-text)",
                    fontWeight: 700, fontSize: 16
                  }}>
                    {isSpend ? "−" : "+"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {label}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{dateStr}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", color: isSpend ? "var(--danger-text)" : "var(--success-text)", flexShrink: 0 }}>
                    {isSpend ? "" : "+"}{tx.amount}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );

  const HouseholdInvitesPanel = (
    <SettingsSharePanel
      isDiod={isDiod}
      user={user}
      householdName={householdName}
      initialHouseholdCode={householdCode}
      canAddUsers={canAddMoreUsers}
      userLimitMessage={userLimitMessage}
      onBack={() => setPanel("")}
    />
  );

  const CategoriesPanel = (
    <div className="settings-panel">
      <div className="settings-panel-heading">
        <button type="button" className="settings-back-btn" onClick={() => setPanel("")}>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Volver
        </button>
        <h2 className="settings-panel-title">Categorías</h2>
        <p className="settings-panel-sub">Organiza platos y productos por tipo</p>
      </div>
      <div className="settings-block settings-accordion-stack">
        <div className={`settings-accordion ${categoriesAccordion.dishes ? "is-open" : ""}`}>
          <div className="settings-accordion-header">
            <button
              type="button"
              className="settings-accordion-trigger"
              onClick={() => setCategoriesAccordion((prev) => ({ ...prev, dishes: !prev.dishes }))}
              aria-expanded={categoriesAccordion.dishes}
            >
              <span className="settings-accordion-chevron">{categoriesAccordion.dishes ? "▾" : "▸"}</span>
              <span>Categorias de platos</span>
            </button>
            <button type="button" className="settings-mini-icon" onClick={() => openCreateCategoryModal("dish")} aria-label="Nueva categoria de plato">+</button>
          </div>
          {categoriesAccordion.dishes ? (
            <div className="settings-accordion-content">
              {dishCategories.map((category) => (
                <div key={category._id} className="settings-row-card">
                  <div>
                    <strong>
                      <span className="settings-category-dot-solid" style={{ background: category.colorText || "#344054" }} />
                      {category.name}
                    </strong>
                    <p className="kitchen-muted">{category.active === false ? "Inactiva" : "Activa"}</p>
                  </div>
                  <div className="settings-row-actions">
                    <button type="button" className="settings-mini-icon" onClick={() => openEditCategoryModal("dish", category)} aria-label="Editar categoria de plato"><PencilIcon /></button>
                    <button type="button" className="settings-mini-icon danger" onClick={() => removeCategory("dish", category)} aria-label="Eliminar categoria de plato"><TrashIcon /></button>
                  </div>
                </div>
              ))}
              {!dishCategories.length ? <p className="kitchen-muted">No hay categorias de platos.</p> : null}
            </div>
          ) : null}
        </div>

        <div className={`settings-accordion ${categoriesAccordion.ingredients ? "is-open" : ""}`}>
          <div className="settings-accordion-header">
            <button
              type="button"
              className="settings-accordion-trigger"
              onClick={() => setCategoriesAccordion((prev) => ({ ...prev, ingredients: !prev.ingredients }))}
              aria-expanded={categoriesAccordion.ingredients}
            >
              <span className="settings-accordion-chevron">{categoriesAccordion.ingredients ? "▾" : "▸"}</span>
              <span>Categorías de productos</span>
            </button>
            <button type="button" className="settings-mini-icon" onClick={() => openCreateCategoryModal("ingredient")} aria-label="Nueva categoría de producto">+</button>
          </div>
          {categoriesAccordion.ingredients ? (
            <div className="settings-accordion-content">
              {categories.map((category) => (
                <div key={category._id} className="settings-row-card">
                  <div>
                    <strong>
                      <span className="settings-category-dot-solid" style={{ background: category.colorText || "#344054" }} />
                      {category.name}
                    </strong>
                    <p className="kitchen-muted">{category.scope || "household"} · {category.active === false ? "Inactiva" : "Activa"}</p>
                  </div>
                  <div className="settings-row-actions">
                    <button type="button" className="settings-mini-icon" onClick={() => openEditCategoryModal("ingredient", category)} aria-label="Editar categoría de producto"><PencilIcon /></button>
                    <button type="button" className="settings-mini-icon danger" onClick={() => removeCategory("ingredient", category)} aria-label="Eliminar categoría de producto"><TrashIcon /></button>
                  </div>
                </div>
              ))}
              {!categories.length ? <p className="kitchen-muted">No hay categorías de productos.</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  const DeletedPanel = (
    <div className="settings-panel">
      <div className="settings-panel-heading">
        <button type="button" className="settings-back-btn" onClick={() => setPanel("")}>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Volver
        </button>
        <h2 className="settings-panel-title">Eliminados</h2>
        <p className="settings-panel-sub">Recupera platos y productos eliminados</p>
      </div>
      <div className="settings-block">
        <div className="kitchen-dishes-tabs" role="tablist" aria-label="Secciones eliminadas">
          <button type="button" className={`kitchen-tab-button ${deletedTab === "dishes" ? "is-active" : ""}`} onClick={() => setDeletedTab("dishes")}>Platos eliminados</button>
          <button type="button" className={`kitchen-tab-button ${deletedTab === "ingredients" ? "is-active" : ""}`} onClick={() => setDeletedTab("ingredients")}>Productos eliminados</button>
        </div>
      </div>
      <div className="settings-block">
        {deletedLoading ? <p className="kitchen-muted">Cargando eliminados...</p> : null}
        {!deletedLoading && deletedTab === "dishes" && deletedItems.dishes.map((dish) => (
          <div key={dish._id} className="settings-row-card">
            <div>
              <strong>{dish.name}</strong>
              <p className="kitchen-muted">Plato eliminado</p>
            </div>
            <div className="settings-row-actions">
              <button type="button" className="settings-mini-button" onClick={() => restoreDeletedItem("dish", dish._id)}>Recuperar</button>
            </div>
          </div>
        ))}
        {!deletedLoading && deletedTab === "ingredients" && deletedItems.ingredients.map((ingredient) => (
          <div key={ingredient._id} className="settings-row-card">
            <div>
              <strong>{ingredient.name}</strong>
              <p className="kitchen-muted">Producto eliminado</p>
            </div>
            <div className="settings-row-actions">
              <button type="button" className="settings-mini-button" onClick={() => restoreDeletedItem("ingredient", ingredient._id)}>Recuperar</button>
            </div>
          </div>
        ))}
        {!deletedLoading && deletedTab === "dishes" && !deletedItems.dishes.length ? <p className="kitchen-muted">No hay platos eliminados.</p> : null}
        {!deletedLoading && deletedTab === "ingredients" && !deletedItems.ingredients.length ? <p className="kitchen-muted">No hay productos eliminados.</p> : null}
      </div>
    </div>
  );

  const BasicsPanel = (
    <div className="settings-panel">
      <div className="settings-panel-heading">
        <button type="button" className="settings-back-btn" onClick={() => setPanel("")}>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Volver
        </button>
        <h2 className="settings-panel-title">Básicos de compra</h2>
        <p className="settings-panel-sub">Artículos que sueles añadir a la lista cada semana</p>
      </div>

      {!basicsFeatureEnabled ? (
        <div className="settings-block basics-locked-block">
          <div className="basics-locked-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" width="36" height="36">
              <rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <p className="basics-locked-title">Disponible en Pro y Premium</p>
          <p className="basics-locked-desc">
            Guarda los artículos que compras cada semana y añádelos a la lista con un solo toque.
          </p>
          <button type="button" className="kitchen-button basics-upgrade-btn" onClick={() => navigate("/kitchen/upgrade")}>Ver planes</button>
        </div>
      ) : (
        <>
          {canManageHousehold ? (
            <div className="settings-block">
              <p className="settings-section-label" style={{ marginBottom: "10px" }}>Añadir básico</p>
              <IngredientSearchAdd
                placeholder="Buscar ingrediente, producto, limpieza…"
                onAdded={handleBasicAdded}
                householdId={user?.activeHouseholdId || user?.householdId}
              />
            </div>
          ) : null}

          <div className="settings-block">
            <p className="settings-section-label" style={{ marginBottom: "10px" }}>Tus básicos</p>
            {basicsLoading && <p className="kitchen-muted">Cargando…</p>}
            {basicsError && <div className="kitchen-alert error">{basicsError}</div>}
            {!basicsLoading && basics.length === 0 && (
              <p className="kitchen-muted">
                Todavía no tienes básicos configurados. Usa el buscador de arriba para añadir tus primeros artículos.
              </p>
            )}
            {!basicsLoading && basics.map((basic) => (
              <div key={basic.id} className={`settings-row-card basics-row-card${!basic.active ? " is-inactive" : ""}`}>
                <div className="basics-row-main">
                  {basic.emoji ? <span className="basics-row-emoji" aria-hidden="true">{basic.emoji}</span> : null}
                  <span className="basics-row-name">{basic.name}</span>
                  {!basic.active && <span className="basics-row-inactive-badge">Inactivo</span>}
                </div>
                {canManageHousehold ? (
                  <div className="settings-row-actions basics-row-icon-actions">
                    <button
                      type="button"
                      className="settings-icon-only"
                      onClick={() => toggleBasicActive(basic.id, basic.active)}
                      aria-label={basic.active ? "Ocultar básico" : "Activar básico"}
                      title={basic.active ? "Ocultar" : "Activar"}
                    >
                      {basic.active ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                    <button
                      type="button"
                      className="settings-icon-only danger"
                      onClick={() => {
                        if (window.confirm(`¿Eliminar "${basic.name}"?`)) void deleteBasic(basic.id);
                      }}
                      aria-label={`Eliminar "${basic.name}"`}
                      title="Eliminar"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <KitchenLayout>
      <PageHeader
        title="Configuración"
        subtitle="Gestiona tu cuenta y preferencias"
        leading={
          <div
            className="settings-header-avatar"
            style={{ background: selectedColor.background, color: selectedColor.text }}
          >
            {userInitials}
          </div>
        }
        className="settings-header"
      />
      <div className="kitchen-card kitchen-block-gap">

        {error ? <div className="kitchen-alert error">{error}</div> : null}
        {success ? <div className="kitchen-alert success">{success}</div> : null}
        {loading ? <p className="kitchen-muted">Cargando configuracion...</p> : null}

        {!loading && pendingDowngradeAt && (
          <div className="settings-downgrade-banner">
            <span className="settings-downgrade-banner-icon" aria-hidden="true">
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <div className="settings-downgrade-banner-body">
              <p className="settings-downgrade-banner-title">Tu plan vuelve a Basic el {formatDowngradeDate(pendingDowngradeAt)}</p>
              <p className="settings-downgrade-banner-desc">Hasta entonces sigues disfrutando de todas las funciones.</p>
              <div className="settings-downgrade-banner-actions">
                <button type="button" className="kitchen-button secondary" onClick={handleUndoCancelFromSettings} disabled={undoCancelLoading}>
                  {undoCancelLoading ? "Reactivando..." : "Reactivar suscripción"}
                </button>
                <button type="button" className="kitchen-button secondary" onClick={() => navigate("/kitchen/upgrade")}>Ver planes</button>
              </div>
            </div>
          </div>
        )}

        {!loading && isHub ? (
          <div className="settings-hub">

            {/* ── Sección 1: Tu cuenta ─────────────────────────── */}
            <div className="settings-section">
              <p className="settings-section-label">Tu cuenta</p>
              <div className="settings-section-group">
                <button type="button" className="settings-nav-row" onClick={() => setPanel("perfil")}>
                  <span className="settings-nav-row-icon settings-nav-icon-account" aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                      <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="settings-nav-row-main">
                    <span className="settings-nav-row-title">Perfil</span>
                    <span className="settings-nav-row-sub">Nombre, color e iniciales</span>
                  </span>
                  <span className="settings-nav-row-end">
                    <svg className="settings-nav-row-chevron" viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                </button>
                <button type="button" className="settings-nav-row" onClick={() => setPanel("preferencias")}>
                  <span className="settings-nav-row-icon settings-nav-icon-prefs" aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                      <path d="M4 5h12M4 10h12M4 15h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="7" cy="5" r="1.5" fill="currentColor" />
                      <circle cx="13" cy="10" r="1.5" fill="currentColor" />
                      <circle cx="7" cy="15" r="1.5" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="settings-nav-row-main">
                    <span className="settings-nav-row-title">Preferencias</span>
                    <span className="settings-nav-row-sub">Notificaciones, idioma y más</span>
                  </span>
                  <span className="settings-nav-row-end">
                    <svg className="settings-nav-row-chevron" viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                </button>
              </div>
            </div>

            {/* ── Sección 2: Tu hogar ──────────────────────────── */}
            {(canViewHousehold || canManageCategories) ? (
              <div className="settings-section">
                <p className="settings-section-label">Tu hogar</p>
                <div className="settings-section-group">
                  {canViewHousehold ? (
                    <button type="button" className="settings-nav-row" onClick={() => setPanel("household-members")}>
                      <span className="settings-nav-row-icon settings-nav-icon-household" aria-hidden="true">
                        <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                          <path d="M3 10.5L10 3l7 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M5 9v7a1 1 0 001 1h3v-4h2v4h3a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span className="settings-nav-row-main">
                        <span className="settings-nav-row-title">{householdName || "Hogar"}</span>
                        <span className="settings-nav-row-sub">Miembros y ajustes del hogar</span>
                      </span>
                      <span className="settings-nav-row-end">
                        <svg className="settings-nav-row-chevron" viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </span>
                    </button>
                  ) : null}
                  {canAccessShare ? (
                    <button type="button" className="settings-nav-row" onClick={() => setPanel("share")}>
                      <span className="settings-nav-row-icon settings-nav-icon-share" aria-hidden="true">
                        <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                          <circle cx="5" cy="10" r="2" stroke="currentColor" strokeWidth="1.4" />
                          <circle cx="15" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" />
                          <circle cx="15" cy="15" r="2" stroke="currentColor" strokeWidth="1.4" />
                          <path d="M7 9l6-3M7 11l6 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                      </span>
                      <span className="settings-nav-row-main">
                        <span className="settings-nav-row-title">Compartir</span>
                        <span className="settings-nav-row-sub">Invitaciones y código de acceso</span>
                      </span>
                      <span className="settings-nav-row-end">
                        <svg className="settings-nav-row-chevron" viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </span>
                    </button>
                  ) : null}
                  {canManageCategories ? (
                    <button type="button" className="settings-nav-row" onClick={() => setPanel("categorias")}>
                      <span className="settings-nav-row-icon settings-nav-icon-cats" aria-hidden="true">
                        <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                          <path d="M3 6h4.5l1.5-2.5H17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M3 10.5h14M3 15h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                      </span>
                      <span className="settings-nav-row-main">
                        <span className="settings-nav-row-title">Categorías</span>
                        <span className="settings-nav-row-sub">Platos y productos</span>
                      </span>
                      <span className="settings-nav-row-end">
                        <svg className="settings-nav-row-chevron" viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </span>
                    </button>
                  ) : null}
                  {canViewHousehold ? (
                    <button type="button" className={`settings-nav-row${!basicsFeatureEnabled ? " settings-nav-row-locked" : ""}`} onClick={() => setPanel("basicos")}>
                      <span className="settings-nav-row-icon settings-nav-icon-basics" aria-hidden="true">
                        <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                          <path d="M4 8l1.5-4h9L16 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M3.5 8h13l-1.5 8a1 1 0 0 1-1 .9H6a1 1 0 0 1-1-.9z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                          <path d="M8 12l1 1.5 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span className="settings-nav-row-main">
                        <span className="settings-nav-row-title">Básicos de compra</span>
                        <span className="settings-nav-row-sub">{basicsFeatureEnabled ? "Artículos recurrentes de tu lista" : "Disponible en Pro y Premium"}</span>
                      </span>
                      <span className="settings-nav-row-end">
                        {!basicsFeatureEnabled ? <ProBadge /> : null}
                        <svg className="settings-nav-row-chevron" viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </span>
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* ── Sección 3: Plan y beneficios ─────────────────── */}
            <div className="settings-section">
              <p className="settings-section-label">Plan y beneficios</p>
              <div className="settings-section-group">
                <button type="button" className={`settings-nav-row${!budgetFeatureEnabled ? " settings-nav-row-locked" : ""}`} onClick={openBudgetPanel}>
                  <span className="settings-nav-row-icon settings-nav-icon-budget" aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                      <rect x="2" y="5" width="16" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M2 9h16" stroke="currentColor" strokeWidth="1.4" />
                      <circle cx="6" cy="13" r="1.2" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="settings-nav-row-main">
                    <span className="settings-nav-row-title">Presupuesto</span>
                    <span className="settings-nav-row-sub">{budgetFeatureEnabled ? "Resumen e historial semanal" : "Disponible en Pro y Premium"}</span>
                  </span>
                  <span className="settings-nav-row-end">
                    {!budgetFeatureEnabled ? <ProBadge /> : null}
                    <svg className="settings-nav-row-chevron" viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                </button>
                <button type="button" className="settings-nav-row" onClick={() => setPanel("bites")}>
                  <span className="settings-nav-row-icon settings-nav-icon-bites" aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                      <path d="M10 2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 12.5l-4.2 2.5.8-4.7L3.2 7l4.7-.7L10 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="settings-nav-row-main">
                    <span className="settings-nav-row-title">Bites</span>
                    <span className="settings-nav-row-sub">Saldo y movimientos</span>
                  </span>
                  <span className="settings-nav-row-end">
                    <svg className="settings-nav-row-chevron" viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                </button>
                <button type="button" className="settings-nav-row settings-nav-row-upgrade" onClick={() => navigate("/kitchen/upgrade")}>
                  <span className="settings-nav-row-icon settings-nav-icon-upgrade" aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                      <path d="M10 3l2.5 5h5l-4 3 1.5 5.5L10 13.5 5 16.5 6.5 11l-4-3h5L10 3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="settings-nav-row-main">
                    <span className="settings-nav-row-title">{licenseActionLabel}</span>
                    <span className="settings-nav-row-sub">Plan actual: <strong>{formatSubscriptionPlanLabel(subscriptionPlan)}</strong></span>
                  </span>
                  <span className="settings-nav-row-end">
                    <span className={subscriptionBadgeClassName(subscriptionPlan)}>{formatSubscriptionPlanLabel(subscriptionPlan)}</span>
                    <svg className="settings-nav-row-chevron" viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                </button>
              </div>
            </div>

            {/* ── Sección 4: Sistema ───────────────────────────── */}
            {canManageDeleted ? (
              <div className="settings-section">
                <p className="settings-section-label">Sistema</p>
                <div className="settings-section-group">
                  <button type="button" className="settings-nav-row" onClick={() => setPanel("eliminados")}>
                    <span className="settings-nav-row-icon settings-nav-icon-deleted" aria-hidden="true">
                      <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                        <path d="M4 7h12M10 11v4m-2-4v4m4-4v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        <path d="M8 4h4l1 2H7L8 4zM5 7l1 10h8l1-10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="settings-nav-row-main">
                      <span className="settings-nav-row-title">Eliminados</span>
                      <span className="settings-nav-row-sub">Recupera platos y productos</span>
                    </span>
                    <span className="settings-nav-row-end">
                      <svg className="settings-nav-row-chevron" viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                  </button>
                </div>
              </div>
            ) : null}

          </div>
        ) : null}

        {!loading && activePanel === "perfil" ? ProfilePanel : null}
        {!loading && activePanel === "preferencias" ? PreferencesPanel : null}
        {!loading && activePanel === "household-members" && canViewHousehold ? HouseholdMembersPanel : null}
        {!loading && activePanel === "share" && canAccessShare ? HouseholdInvitesPanel : null}
        {!loading && activePanel === "categorias" && canManageCategories ? CategoriesPanel : null}
        {!loading && activePanel === "eliminados" && canManageDeleted ? DeletedPanel : null}
        {!loading && activePanel === "bites" ? BitesPanel : null}
        {!loading && activePanel === "basicos" && canViewHousehold ? BasicsPanel : null}
      </div>

      <ModalSheet open={passwordModalOpen} title="Cambiar contrasena" onClose={() => setPasswordModalOpen(false)} actions={<><button type="button" className="kitchen-button secondary" onClick={() => setPasswordModalOpen(false)}>Cancelar</button><button type="button" className="kitchen-button" onClick={savePassword}>Guardar</button></>}>
        <div className="kitchen-actions">
          <input className="kitchen-input" type="password" placeholder="Contrasena actual" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))} />
          <input className="kitchen-input" type="password" placeholder="Nueva contrasena" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))} />
          <input className="kitchen-input" type="password" placeholder="Repetir contrasena" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))} />
        </div>
      </ModalSheet>

      <ModalSheet open={memberModal.open} title="Editar usuario" onClose={closeMemberModal} actions={<><button type="button" className="kitchen-button secondary" onClick={closeMemberModal}>Cancelar</button><button type="button" className="kitchen-button" onClick={saveMember}>Guardar</button></>}>
        <div className="kitchen-actions">
          <label className="kitchen-field"><span className="kitchen-label">Nombre</span><input className="kitchen-input" value={memberModal.form.displayName} disabled={!canManageHousehold} onChange={(event) => setMemberModal((prev) => ({ ...prev, form: { ...prev.form, displayName: event.target.value } }))} /></label>
          <label className="kitchen-field"><span className="kitchen-label">Iniciales</span><input className="kitchen-input" maxLength={3} disabled={!canManageHousehold} value={memberModal.form.initials} onChange={(event) => setMemberModal((prev) => ({ ...prev, form: { ...prev.form, initials: event.target.value.toUpperCase() } }))} /></label>
          <div className="settings-color-grid">{palette.map((color) => <button key={color.id} type="button" className={`settings-color-swatch ${memberModal.form.colorId === color.id ? "is-selected" : ""}`} style={{ background: color.background, color: color.text }} disabled={!canManageHousehold} onClick={() => setMemberModal((prev) => ({ ...prev, form: { ...prev.form, colorId: color.id } }))}>{color.label}</button>)}</div>
          {!memberModal.member?.isPlaceholder && canManageHousehold ? <label className="kitchen-field"><span className="kitchen-label">Rol</span><select className="kitchen-select" value={memberModal.form.role} onChange={(event) => setMemberModal((prev) => ({ ...prev, form: { ...prev.form, role: event.target.value } }))}><option value="owner">Owner</option><option value="member">User</option></select></label> : null}
          <label className="kitchen-field kitchen-toggle-field">
            <div className="kitchen-toggle-row">
              <span className="kitchen-label">Incluir como comensal por defecto</span>
              <label className="kitchen-toggle">
                <input
                  type="checkbox"
                  className="kitchen-toggle-input"
                  checked={memberModal.form.active}
                  disabled={!canManageHousehold}
                  onChange={(event) => setMemberModal((prev) => ({ ...prev, form: { ...prev.form, active: event.target.checked } }))}
                />
                <span className="kitchen-toggle-track" />
              </label>
            </div>
            <p className="kitchen-muted">Si está activado, esta persona aparecerá automáticamente como comensal cuando se planifique un plato.</p>
          </label>
          <label className="kitchen-field kitchen-toggle-field">
            <div className="kitchen-toggle-row">
              <span className="kitchen-label">Puede cocinar</span>
              <label className="kitchen-toggle">
                <input
                  type="checkbox"
                  className="kitchen-toggle-input"
                  checked={memberModal.form.canCook}
                  disabled={!canManageHousehold && String(memberModal.member?.id) !== String(user?.id)}
                  onChange={(event) => setMemberModal((prev) => ({ ...prev, form: { ...prev.form, canCook: event.target.checked } }))}
                />
                <span className="kitchen-toggle-track" />
              </label>
            </div>
            <p className="kitchen-muted">Puede asignarse automáticamente como cocinero al randomizar.</p>
          </label>
          {/* Dinner fields in member modal — only when dinners enabled */}
          {canUseDinners && dinnersEnabled ? (
            <>
              <label className="kitchen-field kitchen-toggle-field">
                <div className="kitchen-toggle-row">
                  <span className="kitchen-label">Incluir como comensal por defecto en cenas</span>
                  <label className="kitchen-toggle">
                    <input
                      type="checkbox"
                      className="kitchen-toggle-input"
                      checked={memberModal.form.dinnerActive}
                      disabled={!canManageHousehold}
                      onChange={(event) => setMemberModal((prev) => ({ ...prev, form: { ...prev.form, dinnerActive: event.target.checked } }))}
                    />
                    <span className="kitchen-toggle-track" />
                  </label>
                </div>
                <p className="kitchen-muted">Si está activado, esta persona aparecerá automáticamente como comensal en cenas.</p>
              </label>
              <label className="kitchen-field kitchen-toggle-field">
                <div className="kitchen-toggle-row">
                  <span className="kitchen-label">Puede cocinar cenas</span>
                  <label className="kitchen-toggle">
                    <input
                      type="checkbox"
                      className="kitchen-toggle-input"
                      checked={memberModal.form.dinnerCanCook}
                      disabled={!canManageHousehold && String(memberModal.member?.id) !== String(user?.id)}
                      onChange={(event) => setMemberModal((prev) => ({ ...prev, form: { ...prev.form, dinnerCanCook: event.target.checked } }))}
                    />
                    <span className="kitchen-toggle-track" />
                  </label>
                </div>
                <p className="kitchen-muted">Si está activado, podrá asignarse automáticamente para cocinar cenas.</p>
              </label>
            </>
          ) : null}
          {!memberModal.member?.isPlaceholder && canManageHousehold && String(memberModal.member?.id) !== String(user?.id) ? <button type="button" className="kitchen-button secondary" onClick={() => askDeleteMember(memberModal.member)}>Eliminar usuario</button> : null}
          {memberModal.member?.isPlaceholder ? (
            <div className="settings-block">
              <h4 className="settings-subtitle">Convertir en usuario</h4>
              <button
                type="button"
                className="kitchen-button secondary"
                onClick={() => setConvertModal({ open: true, memberId: memberModal.member.id, email: "", password: "" })}
                disabled={!canAddMoreUsers}
              >
                Convertir en usuario
              </button>
              {!canAddMoreUsers ? <p className="kitchen-muted">{userLimitMessage}</p> : null}
            </div>
          ) : null}
        </div>
      </ModalSheet>

      <ModalSheet open={dinerModal.open} title="Crear comensal" onClose={() => setDinerModal({ open: false, form: { displayName: "", initials: "", colorId: "lavender", active: true, canCook: false, dinnerActive: true, dinnerCanCook: false } })} actions={<><button type="button" className="kitchen-button secondary" onClick={() => setDinerModal({ open: false, form: { displayName: "", initials: "", colorId: "lavender", active: true, canCook: false, dinnerActive: true, dinnerCanCook: false } })}>Cancelar</button><button type="button" className="kitchen-button" onClick={createDiner} disabled={!canAddMoreNonUserDiners}>Guardar</button></>}>
        <div className="kitchen-actions">
          {!canAddMoreNonUserDiners ? (
            <div className="settings-budget-locked-card">
              <p className="kitchen-muted">{nonUserDinerLimitMessage}</p>
              <button type="button" className="kitchen-button secondary" onClick={() => navigate("/kitchen/upgrade")}>Upgrade your license</button>
            </div>
          ) : null}
          <label className="kitchen-field"><span className="kitchen-label">Nombre</span><input className="kitchen-input" value={dinerModal.form.displayName} onChange={(event) => setDinerModal((prev) => ({ ...prev, form: { ...prev.form, displayName: event.target.value } }))} /></label>
          <label className="kitchen-field"><span className="kitchen-label">Iniciales</span><input className="kitchen-input" maxLength={3} value={dinerModal.form.initials} onChange={(event) => setDinerModal((prev) => ({ ...prev, form: { ...prev.form, initials: event.target.value.toUpperCase() } }))} /></label>
          <div className="settings-color-grid">{palette.map((color) => <button key={color.id} type="button" className={`settings-color-swatch ${dinerModal.form.colorId === color.id ? "is-selected" : ""}`} style={{ background: color.background, color: color.text }} onClick={() => setDinerModal((prev) => ({ ...prev, form: { ...prev.form, colorId: color.id } }))}>{color.label}</button>)}</div>
          <label className="kitchen-field kitchen-toggle-field">
            <div className="kitchen-toggle-row">
              <span className="kitchen-label">Incluir como comensal por defecto</span>
              <label className="kitchen-toggle">
                <input
                  type="checkbox"
                  className="kitchen-toggle-input"
                  checked={dinerModal.form.active}
                  onChange={(event) => setDinerModal((prev) => ({ ...prev, form: { ...prev.form, active: event.target.checked } }))}
                />
                <span className="kitchen-toggle-track" />
              </label>
            </div>
            <p className="kitchen-muted">Si está activado, esta persona aparecerá automáticamente como comensal cuando se planifique un plato.</p>
          </label>
          <label className="kitchen-field kitchen-toggle-field">
            <div className="kitchen-toggle-row">
              <span className="kitchen-label">Puede cocinar</span>
              <label className="kitchen-toggle">
                <input
                  type="checkbox"
                  className="kitchen-toggle-input"
                  checked={dinerModal.form.canCook}
                  onChange={(event) => setDinerModal((prev) => ({ ...prev, form: { ...prev.form, canCook: event.target.checked } }))}
                />
                <span className="kitchen-toggle-track" />
              </label>
            </div>
            <p className="kitchen-muted">Si está activado, podrá ser asignado automáticamente para cocinar.</p>
          </label>
          {/* Dinner fields for diner — only when dinners enabled */}
          {canUseDinners && dinnersEnabled ? (
            <>
              <label className="kitchen-field kitchen-toggle-field">
                <div className="kitchen-toggle-row">
                  <span className="kitchen-label">Incluir como comensal por defecto en cenas</span>
                  <label className="kitchen-toggle">
                    <input
                      type="checkbox"
                      className="kitchen-toggle-input"
                      checked={dinerModal.form.dinnerActive}
                      onChange={(event) => setDinerModal((prev) => ({ ...prev, form: { ...prev.form, dinnerActive: event.target.checked } }))}
                    />
                    <span className="kitchen-toggle-track" />
                  </label>
                </div>
                <p className="kitchen-muted">Si está activado, aparecerá automáticamente como comensal en cenas.</p>
              </label>
              <label className="kitchen-field kitchen-toggle-field">
                <div className="kitchen-toggle-row">
                  <span className="kitchen-label">Puede cocinar cenas</span>
                  <label className="kitchen-toggle">
                    <input
                      type="checkbox"
                      className="kitchen-toggle-input"
                      checked={dinerModal.form.dinnerCanCook}
                      onChange={(event) => setDinerModal((prev) => ({ ...prev, form: { ...prev.form, dinnerCanCook: event.target.checked } }))}
                    />
                    <span className="kitchen-toggle-track" />
                  </label>
                </div>
                <p className="kitchen-muted">Si está activado, podrá asignarse automáticamente para cocinar cenas.</p>
              </label>
            </>
          ) : null}
        </div>
      </ModalSheet>

      <ModalSheet
        open={categoryModal.open}
        title={categoryModal.mode === "edit"
          ? `Editar categoría de ${categoryModal.kind === "dish" ? "plato" : "producto"}`
          : `Nueva categoría de ${categoryModal.kind === "dish" ? "plato" : "producto"}`}
        onClose={() => setCategoryModal(buildClosedCategoryModal())}
        actions={<><button type="button" className="kitchen-button secondary" onClick={() => setCategoryModal(buildClosedCategoryModal())}>Cancelar</button><button type="button" className="kitchen-button" onClick={() => (categoryModal.mode === "edit" ? editCategory(categoryModal.kind, categoryModal.category, categoryModal.name, categoryModal.colorBg, categoryModal.colorText, categoryModal.active) : createCategory(categoryModal.kind, categoryModal.name, categoryModal.colorBg, categoryModal.colorText, categoryModal.active))}>Guardar</button></>}
      >
        <label className="kitchen-field"><span className="kitchen-label">Nombre</span><input className="kitchen-input" value={categoryModal.name} onChange={(event) => setCategoryModal((prev) => ({ ...prev, name: event.target.value }))} placeholder={categoryModal.kind === "dish" ? "Carnes" : "Verduras"} /></label>
        <label className="kitchen-field kitchen-toggle-field">
          <div className="kitchen-toggle-row">
            <span className="kitchen-label">Activa</span>
            <label className="kitchen-toggle">
              <input type="checkbox" className="kitchen-toggle-input" checked={categoryModal.active !== false} onChange={(event) => setCategoryModal((prev) => ({ ...prev, active: event.target.checked }))} />
              <span className="kitchen-toggle-track" />
            </label>
          </div>
        </label>
        <div className="settings-category-color-preview" style={{ background: categoryModal.colorBg, color: categoryModal.colorText }}>Color actual</div>
        <div className="settings-category-color-grid">
          {CATEGORY_COLORS.map((color) => {
            const selected = color.colorBg === categoryModal.colorBg && color.colorText === categoryModal.colorText;
            return (
              <button
                key={`${color.colorBg}-${color.colorText}`}
                type="button"
                className={`settings-category-swatch ${selected ? "is-selected" : ""}`}
                style={{ background: color.colorBg, color: color.colorText }}
                onClick={() => setCategoryModal((prev) => ({ ...prev, colorBg: color.colorBg, colorText: color.colorText }))}
              >
                Aa
              </button>
            );
          })}
        </div>
      </ModalSheet>

      <ModalSheet
        open={convertModal.open}
        title="Convertir en usuario"
        onClose={() => setConvertModal({ open: false, memberId: "", email: "", password: "" })}
        actions={<><button type="button" className="kitchen-button secondary" onClick={() => setConvertModal({ open: false, memberId: "", email: "", password: "" })}>Cancelar</button><button type="button" className="kitchen-button" onClick={convertPlaceholder} disabled={!convertFormIsValid || !canAddMoreUsers}>Confirmar</button></>}
      >
        <div className="kitchen-actions">
          {!canAddMoreUsers ? (
            <div className="settings-budget-locked-card">
              <p className="kitchen-muted">{userLimitMessage}</p>
              <button type="button" className="kitchen-button secondary" onClick={() => navigate("/kitchen/upgrade")}>Upgrade your license</button>
            </div>
          ) : null}
          <label className="kitchen-field"><span className="kitchen-label">Email</span><input className="kitchen-input" type="email" value={convertModal.email} onChange={(event) => setConvertModal((prev) => ({ ...prev, email: event.target.value }))} /></label>
          <label className="kitchen-field"><span className="kitchen-label">Contrasena</span><input className="kitchen-input" type="password" value={convertModal.password} onChange={(event) => setConvertModal((prev) => ({ ...prev, password: event.target.value }))} /></label>
        </div>
      </ModalSheet>

      <ModalSheet
        open={deleteProfileModal.open}
        title="Eliminar mi perfil"
        onClose={() => setDeleteProfileModal({ open: false, loading: false, preview: null, promoteUserId: "", confirmDeleteHousehold: false })}
        actions={<><button type="button" className="kitchen-button secondary" onClick={() => setDeleteProfileModal({ open: false, loading: false, preview: null, promoteUserId: "", confirmDeleteHousehold: false })}>Cancelar</button><button type="button" className="kitchen-button danger" onClick={confirmDeleteProfile} disabled={!canConfirmDeleteProfile}>Eliminar</button></>}
      >
        {deleteProfileModal.loading ? <p className="kitchen-muted">Preparando confirmacion...</p> : null}
        {!deleteProfileModal.loading && deleteProfileModal.preview ? (
          <div className="kitchen-actions">
            <p className="kitchen-muted">Household: <strong>{deleteProfileModal.preview.household?.name || "Mi household"}</strong></p>
            {deleteProfileModal.preview.mustTransferOwner ? (
              <label className="kitchen-field">
                <span className="kitchen-label">Selecciona el nuevo Owner (con email)</span>
                <select className="kitchen-select" value={deleteProfileModal.promoteUserId} onChange={(event) => setDeleteProfileModal((prev) => ({ ...prev, promoteUserId: event.target.value }))}>
                  <option value="">Seleccionar usuario</option>
                  {(deleteProfileModal.preview.promotableCandidates || []).map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.displayName} ({candidate.email})</option>
                  ))}
                </select>
              </label>
            ) : null}
            {deleteProfileModal.preview.willDeleteHousehold ? (
              <div className="settings-delete-disclaimer">
                <p>Atencion: no hay otro usuario con email para heredar ownership. Eliminar este perfil borrara todo el entorno del household.</p>
                <ul className="kitchen-list">
                  {(deleteProfileModal.preview.destructiveScope || []).map((item) => <li key={item}>{item}</li>)}
                </ul>
                <label>
                  <input type="checkbox" checked={deleteProfileModal.confirmDeleteHousehold} onChange={(event) => setDeleteProfileModal((prev) => ({ ...prev, confirmDeleteHousehold: event.target.checked }))} />
                  {" "}Confirmo la eliminacion completa del household (solo datos del household, nunca master/global).
                </label>
              </div>
            ) : null}
          </div>
        ) : null}
      </ModalSheet>

      <ModalSheet open={confirmModal.open} title={confirmModal.title} onClose={() => setConfirmModal({ open: false, title: "", message: "", onConfirm: null, dangerLabel: "Confirmar" })} actions={<><button type="button" className="kitchen-button secondary" onClick={() => setConfirmModal({ open: false, title: "", message: "", onConfirm: null, dangerLabel: "Confirmar" })}>Cancelar</button><button type="button" className="kitchen-button" onClick={async () => { try { if (typeof confirmModal.onConfirm === "function") await confirmModal.onConfirm(); setConfirmModal({ open: false, title: "", message: "", onConfirm: null, dangerLabel: "Confirmar" }); } catch (err) { setError(err.message || "No se pudo completar la accion."); } }}>{confirmModal.dangerLabel}</button></>}>
        <p className="kitchen-muted">{confirmModal.message}</p>
      </ModalSheet>
    </KitchenLayout>
  );
}
