import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";
import { useAuth } from "../auth";
import { apiRequest } from "../api.js";
import ModalSheet from "../components/ui/ModalSheet.jsx";
import { getColorPalette, getUserColorById, getUserColorPreference, setUserColorPreference } from "../utils/userColors.js";
import { getUserInitialsPreference, setUserInitialsPreference } from "../utils/userInitials.js";

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

function clampAvoidRepeatWeeks(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(12, Math.max(1, Math.round(parsed)));
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, setUser, refreshUser, logout } = useAuth();
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
  const [avoidRepeatsEnabled, setAvoidRepeatsEnabled] = useState(false);
  const [avoidRepeatsWeeks, setAvoidRepeatsWeeks] = useState(1);
  const [avoidRepeatsInfoOpen, setAvoidRepeatsInfoOpen] = useState(false);
  const [householdPrefsSaving, setHouseholdPrefsSaving] = useState(false);
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

  const isOwner = user?.role === "owner" || user?.role === "admin";
  const isDiod = user?.globalRole === "diod";
  const canViewHousehold = Boolean(user?.activeHouseholdId || user?.householdId) && !(isDiod && !user?.activeHouseholdId);
  const canManageCategories = isDiod || isOwner;
  const canManageHousehold = isOwner && !(isDiod && !user?.activeHouseholdId);
  const canManageDeleted = isDiod || isOwner;

  const activePanel = (searchParams.get("section") || "").toLowerCase();
  const isHub = !activePanel;
  const userInitials = (user?.initials || getUserInitialsPreference(user?.id) || initialsFromName(user?.displayName || "")).slice(0, 3);
  const selectedColor = useMemo(
    () => palette.find((item) => item.id === selectedColorId) || palette[0],
    [palette, selectedColorId]
  );

  const setPanel = (panel) => {
    if (!panel) {
      setSearchParams({});
      navigate("/kitchen/configuracion");
      return;
    }
    navigate(`/kitchen/configuracion?section=${panel}`);
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
      setAvoidRepeatsEnabled(Boolean(householdData?.household?.avoidRepeatsEnabled));
      setAvoidRepeatsWeeks(clampAvoidRepeatWeeks(householdData?.household?.avoidRepeatsWeeks));
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
      const [dishesData, sidesData, ingredientsData] = await Promise.all([
        apiRequest("/api/kitchen/dishes?includeInactive=true"),
        apiRequest("/api/kitchen/dishes?sidedish=true&includeInactive=true"),
        apiRequest("/api/kitchenIngredients?includeInactive=true&limit=0")
      ]);
      setDeletedItems({
        dishes: (dishesData?.dishes || []).filter((item) => item?.active === false),
        sides: (sidesData?.dishes || []).filter((item) => item?.active === false),
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
    const nextWeeks = clampAvoidRepeatWeeks(
      Object.prototype.hasOwnProperty.call(nextValues, "avoidRepeatsWeeks")
        ? nextValues.avoidRepeatsWeeks
        : avoidRepeatsWeeks
    );

    setHouseholdPrefsSaving(true);
    try {
      const data = await apiRequest("/api/kitchen/household/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          avoidRepeatsEnabled: nextEnabled,
          dinnersEnabled: nextDinnersEnabled,
          avoidRepeatsWeeks: Number(nextWeeks)
        })
      });
      setDinnersEnabled(Boolean(data?.household?.dinnersEnabled));
      setAvoidRepeatsEnabled(Boolean(data?.household?.avoidRepeatsEnabled));
      setAvoidRepeatsWeeks(clampAvoidRepeatWeeks(data?.household?.avoidRepeatsWeeks));
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
      await apiRequest("/api/kitchen/users/me", {
        method: "DELETE",
        body: JSON.stringify(body)
      });
      logout();
      navigate("/login?deleted=1", { replace: true });
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

  const generateInvite = async () => {
    try {
      const data = await apiRequest("/api/kitchen/household/invitations", { method: "POST" });
      setInviteLink(data.inviteLink || "");
      updateSuccess("Invitacion generada.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo generar la invitacion.");
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

  useEffect(() => {
    if (activePanel !== "household-invitations") return;
    if (!canManageHousehold) return;
    if (inviteLink) return;
    void generateInvite();
  }, [activePanel, canManageHousehold, inviteLink]);

  const openInvitesPanel = async () => {
    setPanel("household-invitations");
    if (inviteLink) return;
    await generateInvite();
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
        await apiRequest(`/api/kitchen/users/members/${member.id}`, { method: "DELETE" });
        closeMemberModal();
        updateSuccess("Usuario eliminado.");
        await loadData();
      }
    });
  };

  const createDiner = async () => {
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
      setError(err.message || "No se pudo crear el comensal.");
    }
  };

  const convertPlaceholder = async () => {
    if (!convertModal.memberId) return;
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

  const CardButton = ({ title, subtitle, onClick, icon = ">" }) => (
    <button type="button" className="settings-hub-card" onClick={onClick}>
      <div className="settings-hub-card-main">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <span className="settings-hub-card-arrow">{icon}</span>
    </button>
  );

  const ProfilePanel = (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <button type="button" className="kitchen-button secondary" onClick={() => setPanel("")}>Volver</button>
        <h2>Perfil</h2>
      </div>
      <div className="settings-block">
        <div className="settings-inline-heading">
          <h3 className="settings-subtitle">Profile details</h3>
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
          <p className="kitchen-muted">Puede asignarse automaticamente como cocinero en randomizacion.</p>
        </label>
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
        <p className="kitchen-muted">Email: {user?.email || "Sin email"}</p>
      </div>
      <div className="settings-block">
        <button type="button" className="kitchen-button secondary" onClick={() => setPasswordModalOpen(true)}>Cambiar contrasena</button>
      </div>
      <div className="settings-block danger">
        <h3 className="settings-subtitle">Zona de peligro</h3>
        <p className="settings-danger-text">Esta accion puede eliminar tu cuenta o todo el household si eres el ultimo owner.</p>
        <button type="button" className="kitchen-button secondary danger" onClick={openDeleteProfileFlow}>Eliminar mi perfil</button>
      </div>
    </div>
  );

  const PreferencesPanel = (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <button type="button" className="kitchen-button secondary" onClick={() => setPanel("")}>Volver</button>
        <h2>Preferencias</h2>
      </div>
      <div className="settings-block">
        <div className="settings-coming-row"><span>Idioma</span><span className="kitchen-pill">Coming soon</span></div>
        <div className="settings-coming-row"><span>Dark mode</span><span className="kitchen-pill">Coming soon</span></div>
        <div className="settings-coming-row"><span>Notificaciones</span><span className="kitchen-pill">Coming soon</span></div>
      </div>
    </div>
  );

  const HouseholdMembersPanel = (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <button type="button" className="kitchen-button secondary" onClick={() => setPanel("")}>Volver</button>
        <h2>Miembros del {householdName || "household"}</h2>
        {canManageHousehold && householdNameEditing ? (
          <button type="button" className="settings-icon-only" onClick={saveHouseholdName} aria-label="Guardar nombre del household">
            <SaveIcon />
          </button>
        ) : canManageHousehold ? (
          <button type="button" className="settings-icon-only" onClick={() => setHouseholdNameEditing(true)} aria-label="Editar nombre del household">
            <PencilIcon />
          </button>
        ) : null}
      </div>
      <div className="settings-block">
        {householdNameEditing ? (
          <input className="kitchen-input" value={householdNameDraft} onChange={(event) => setHouseholdNameDraft(event.target.value)} />
        ) : null}
        <p className="settings-counter">Miembros ({members.length})</p>
        {canManageHousehold ? (
          <div className="settings-members-actions">
            <button type="button" className="kitchen-button" onClick={openInvitesPanel}>Invitar</button>
            <button type="button" className="kitchen-button secondary" onClick={() => setDinerModal({ open: true, form: { displayName: "", initials: "", colorId: "lavender", active: true, canCook: false, dinnerActive: true, dinnerCanCook: false } })}>Crear comensal</button>
          </div>
        ) : null}
      </div>
      <div className="settings-block">
        {members.map((member) => {
          const colors = getUserColorById(member.colorId, member.id);
          const initials = (member.initials || initialsFromName(member.displayName || "")).slice(0, 3);
          const isSelf = String(member.id) === String(user?.id);
          return (
            <button type="button" key={member.id} className="settings-member-row" onClick={() => openMemberModal(member)} disabled={!canManageHousehold && !isSelf}>
              <span className="settings-member-avatar" style={{ background: colors.background, color: colors.text }}>{initials}</span>
              <span className="settings-member-text">
                <strong>{member.displayName}{isSelf ? " (Tu)" : ""}</strong>
                <span>{memberRoleLabel(member)} · {member.active === false ? "No incluido por defecto" : "Incluido por defecto"} · {member.canCook === false ? "No cocina" : "Puede cocinar"}</span>
              </span>
              <span className="settings-member-arrow">{">"}</span>
            </button>
          );
        })}
        {!members.length ? <p className="kitchen-muted">No hay miembros.</p> : null}
      </div>
      {canManageHousehold ? (
        <div className="settings-block">
        <div className="settings-inline-heading">
          <h3 className="settings-subtitle">Preferencias del household</h3>
        </div>
        <div className="settings-household-pref-row">
          <div className="settings-household-pref-main">
            <div className="settings-household-pref-title">
              <span>Planificar tambien cenas</span>
            </div>
            <p className="kitchen-muted">Si esta activado, cada semana incluira tambien planificacion de cenas.</p>
          </div>
          <label className="kitchen-toggle" aria-label="Planificar cenas">
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
            <p className="kitchen-muted">Regla best-effort de randomizacion semanal.</p>
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
            <p>Evita, en lo posible, platos usados en las ultimas X semanas al randomizar la semana actual.</p>
            <p>Es una regla best-effort: no bloquea la planificacion y puede relajarse si faltan platos.</p>
            <p>Ejemplo: con X=3 y solo 10 platos, el sistema intentara evitar repetidos y completara la semana igualmente.</p>
          </div>
        ) : null}
        </div>
      ) : null}
    </div>
  );

  const HouseholdInvitesPanel = (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <button type="button" className="kitchen-button secondary" onClick={() => setPanel("")}>Volver</button>
        <h2>Invitar usuario</h2>
      </div>
      <div className="settings-block">
        <p className="kitchen-muted">
          Comparte el codigo con otra persona: se registra o inicia sesion y lo introduce para unirse al household.
          Tambien puedes compartir el enlace directo.
        </p>
        <div className="settings-copy-box">
          <span>{inviteLink || "Sin enlace generado"}</span>
          <button type="button" className={`settings-mini-icon ${copiedField === "inviteLink" ? "is-copied" : ""}`} onClick={() => copyText(inviteLink, "Enlace", "inviteLink")} disabled={!inviteLink} aria-label="Copiar enlace">
            <CopyIcon />
          </button>
        </div>
        {!householdCode ? <button type="button" className="kitchen-button secondary" onClick={generateHouseholdCode}>Generar codigo</button> : null}
        <div className="settings-copy-box">
          <span>{householdCode || "Sin codigo generado"}</span>
          <button type="button" className={`settings-mini-icon ${copiedField === "householdCode" ? "is-copied" : ""}`} onClick={() => copyText(householdCode, "Codigo", "householdCode")} disabled={!householdCode} aria-label="Copiar codigo">
            <CopyIcon />
          </button>
        </div>
        {invitations.length > 0 ? (
          <ul className="kitchen-list">
            {invitations.map((invitation) => (
              <li key={invitation.id}>Invitacion activa hasta {new Date(invitation.expiresAt).toLocaleString()}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );

  const CategoriesPanel = (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <button type="button" className="kitchen-button secondary" onClick={() => setPanel("")}>Volver</button>
        <h2>Categorias</h2>
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
              <span>Categorias de ingredientes</span>
            </button>
            <button type="button" className="settings-mini-icon" onClick={() => openCreateCategoryModal("ingredient")} aria-label="Nueva categoria de ingrediente">+</button>
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
                    <button type="button" className="settings-mini-icon" onClick={() => openEditCategoryModal("ingredient", category)} aria-label="Editar categoria de ingrediente"><PencilIcon /></button>
                    <button type="button" className="settings-mini-icon danger" onClick={() => removeCategory("ingredient", category)} aria-label="Eliminar categoria de ingrediente"><TrashIcon /></button>
                  </div>
                </div>
              ))}
              {!categories.length ? <p className="kitchen-muted">No hay categorias de ingredientes.</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  const DeletedPanel = (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <button type="button" className="kitchen-button secondary" onClick={() => setPanel("")}>Volver</button>
        <h2>Eliminados</h2>
      </div>
      <div className="settings-block">
        <div className="kitchen-dishes-tabs" role="tablist" aria-label="Secciones eliminadas">
          <button type="button" className={`kitchen-tab-button ${deletedTab === "dishes" ? "is-active" : ""}`} onClick={() => setDeletedTab("dishes")}>Platos eliminados</button>
          <button type="button" className={`kitchen-tab-button ${deletedTab === "sides" ? "is-active" : ""}`} onClick={() => setDeletedTab("sides")}>Guarniciones eliminadas</button>
          <button type="button" className={`kitchen-tab-button ${deletedTab === "ingredients" ? "is-active" : ""}`} onClick={() => setDeletedTab("ingredients")}>Ingredientes eliminados</button>
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
        {!deletedLoading && deletedTab === "sides" && deletedItems.sides.map((dish) => (
          <div key={dish._id} className="settings-row-card">
            <div>
              <strong>{dish.name}</strong>
              <p className="kitchen-muted">Guarnicion eliminada</p>
            </div>
            <div className="settings-row-actions">
              <button type="button" className="settings-mini-button" onClick={() => restoreDeletedItem("side", dish._id)}>Recuperar</button>
            </div>
          </div>
        ))}
        {!deletedLoading && deletedTab === "ingredients" && deletedItems.ingredients.map((ingredient) => (
          <div key={ingredient._id} className="settings-row-card">
            <div>
              <strong>{ingredient.name}</strong>
              <p className="kitchen-muted">Ingrediente eliminado</p>
            </div>
            <div className="settings-row-actions">
              <button type="button" className="settings-mini-button" onClick={() => restoreDeletedItem("ingredient", ingredient._id)}>Recuperar</button>
            </div>
          </div>
        ))}
        {!deletedLoading && deletedTab === "dishes" && !deletedItems.dishes.length ? <p className="kitchen-muted">No hay platos eliminados.</p> : null}
        {!deletedLoading && deletedTab === "sides" && !deletedItems.sides.length ? <p className="kitchen-muted">No hay guarniciones eliminadas.</p> : null}
        {!deletedLoading && deletedTab === "ingredients" && !deletedItems.ingredients.length ? <p className="kitchen-muted">No hay ingredientes eliminados.</p> : null}
      </div>
    </div>
  );

  return (
    <KitchenLayout>
      <div className="kitchen-card kitchen-block-gap">
        <div className="settings-header">
          <div className="settings-header-avatar" style={{ background: selectedColor.background, color: selectedColor.text }}>{userInitials}</div>
          <h1>Settings</h1>
          <p className="settings-header-name">{user?.displayName || "Usuario"}</p>
          <p className="settings-header-meta">{roleLabel(user, isOwner, householdName || user?.householdName || "Mi household")}</p>
        </div>

        {error ? <div className="kitchen-alert error">{error}</div> : null}
        {success ? <div className="kitchen-alert success">{success}</div> : null}
        {loading ? <p className="kitchen-muted">Cargando configuracion...</p> : null}

        {!loading && isHub ? (
          <div className="settings-hub-grid">
            <CardButton title="Perfil" subtitle="Informacion personal, password y color." onClick={() => setPanel("perfil")} />
            <CardButton title="Preferencias" subtitle="Idioma, dark mode y notificaciones." onClick={() => setPanel("preferencias")} />
            {canViewHousehold ? <CardButton title="Household" subtitle="Miembros e invitaciones." onClick={() => setPanel("household-members")} /> : null}
            {canManageCategories ? <CardButton title="Categorias" subtitle="Gestion de categorias." onClick={() => setPanel("categorias")} /> : null}
            {canManageDeleted ? <CardButton title="Eliminados" subtitle="Recupera platos, guarniciones e ingredientes." onClick={() => setPanel("eliminados")} /> : null}
            <div className="settings-upgrade-card">
              <h3>Upgrade to Pro</h3>
              <p className="kitchen-muted">Funciones premium proximamente:</p>
              <ul className="kitchen-list">
                <li>Sugerencias automaticas</li>
                <li>Estadisticas de cocina</li>
                <li>Planificacion inteligente</li>
              </ul>
              <button type="button" className="kitchen-button secondary" disabled>Upgrade (coming soon)</button>
            </div>
          </div>
        ) : null}

        {!loading && activePanel === "perfil" ? ProfilePanel : null}
        {!loading && activePanel === "preferencias" ? PreferencesPanel : null}
        {!loading && activePanel === "household-members" && canViewHousehold ? HouseholdMembersPanel : null}
        {!loading && activePanel === "household-invitations" && canManageHousehold ? HouseholdInvitesPanel : null}
        {!loading && activePanel === "categorias" && canManageCategories ? CategoriesPanel : null}
        {!loading && activePanel === "eliminados" && canManageDeleted ? DeletedPanel : null}
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
            <p className="kitchen-muted">Puede asignarse automaticamente como cocinero en randomizacion.</p>
          </label>
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
          {!memberModal.member?.isPlaceholder && canManageHousehold && String(memberModal.member?.id) !== String(user?.id) ? <button type="button" className="kitchen-button secondary" onClick={() => askDeleteMember(memberModal.member)}>Eliminar usuario</button> : null}
          {memberModal.member?.isPlaceholder ? (
            <div className="settings-block">
              <h4 className="settings-subtitle">Convertir en usuario</h4>
              <button
                type="button"
                className="kitchen-button secondary"
                onClick={() => setConvertModal({ open: true, memberId: memberModal.member.id, email: "", password: "" })}
              >
                Convertir en usuario
              </button>
            </div>
          ) : null}
        </div>
      </ModalSheet>

      <ModalSheet open={dinerModal.open} title="Crear comensal" onClose={() => setDinerModal({ open: false, form: { displayName: "", initials: "", colorId: "lavender", active: true, canCook: false, dinnerActive: true, dinnerCanCook: false } })} actions={<><button type="button" className="kitchen-button secondary" onClick={() => setDinerModal({ open: false, form: { displayName: "", initials: "", colorId: "lavender", active: true, canCook: false, dinnerActive: true, dinnerCanCook: false } })}>Cancelar</button><button type="button" className="kitchen-button" onClick={createDiner}>Guardar</button></>}>
        <div className="kitchen-actions">
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
        </div>
      </ModalSheet>

      <ModalSheet
        open={categoryModal.open}
        title={categoryModal.mode === "edit"
          ? `Editar categoria de ${categoryModal.kind === "dish" ? "plato" : "ingrediente"}`
          : `Nueva categoria de ${categoryModal.kind === "dish" ? "plato" : "ingrediente"}`}
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
        actions={<><button type="button" className="kitchen-button secondary" onClick={() => setConvertModal({ open: false, memberId: "", email: "", password: "" })}>Cancelar</button><button type="button" className="kitchen-button" onClick={convertPlaceholder} disabled={!convertFormIsValid}>Confirmar</button></>}
      >
        <div className="kitchen-actions">
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
