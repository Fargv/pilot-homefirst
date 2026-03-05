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
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [profileInitials, setProfileInitials] = useState(user?.initials || getUserInitialsPreference(user?.id) || initialsFromName(user?.displayName || ""));
  const [selectedColorId, setSelectedColorId] = useState(user?.colorId || getUserColorPreference(user?.id) || "lavender");
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [profileEditingMain, setProfileEditingMain] = useState(false);
  const [profileEditingColor, setProfileEditingColor] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [categoryModal, setCategoryModal] = useState({
    open: false,
    mode: "create",
    category: null,
    name: "",
    colorBg: CATEGORY_COLORS[0].colorBg,
    colorText: CATEGORY_COLORS[0].colorText
  });
  const [memberModal, setMemberModal] = useState({ open: false, member: null, form: { displayName: "", initials: "", colorId: "lavender", role: "member" } });
  const [convertForm, setConvertForm] = useState({ email: "", password: "" });
  const [dinerModal, setDinerModal] = useState({ open: false, form: { displayName: "", initials: "", colorId: "lavender" } });
  const [confirmModal, setConfirmModal] = useState({ open: false, title: "", message: "", onConfirm: null, dangerLabel: "Confirmar" });
  const [deleteProfileModal, setDeleteProfileModal] = useState({
    open: false,
    loading: false,
    preview: null,
    promoteUserId: "",
    confirmDeleteHousehold: false
  });

  const isOwner = user?.role === "owner" || user?.role === "admin";
  const isDiod = user?.globalRole === "diod";
  const canManageCategories = isDiod || isOwner;
  const canManageHousehold = isOwner && !(isDiod && !user?.activeHouseholdId);

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

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const householdSummaryRequest = (!isDiod || user?.activeHouseholdId)
        ? apiRequest("/api/kitchen/household/summary")
        : Promise.resolve({ household: { name: "", inviteCode: "" } });
      const requests = [apiRequest("/api/categories"), householdSummaryRequest];
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

      const [categoryData, householdData, memberData, invitationData, codeData] = await Promise.all(requests);
      setCategories(categoryData.categories || []);
      setHouseholdName(householdData?.household?.name || "");
      setHouseholdNameDraft(householdData?.household?.name || "");
      setMembers(memberData.users || []);
      setInvitations(invitationData.invitations || []);
      setHouseholdCode(codeData.inviteCode || householdData?.household?.inviteCode || "");
      setDisplayName(user?.displayName || "");
      setProfileInitials(user?.initials || getUserInitialsPreference(user?.id) || initialsFromName(user?.displayName || ""));
      setSelectedColorId(user?.colorId || getUserColorPreference(user?.id) || "lavender");
    } catch (err) {
      setError(err.message || "No se pudo cargar configuracion.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [isDiod, canManageHousehold, user?.activeHouseholdId]);

  const saveProfile = async () => {
    const safeDisplayName = displayName.trim();
    if (!safeDisplayName) {
      setError("El nombre visible es obligatorio.");
      return;
    }
    try {
      const safeInitials = (profileInitials.trim().toUpperCase() || initialsFromName(safeDisplayName)).slice(0, 3);
      const data = await apiRequest("/api/kitchen/users/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName: safeDisplayName, initials: safeInitials, colorId: selectedColorId })
      });
      if (data?.user) setUser((prev) => ({ ...prev, ...data.user }));
      setUserInitialsPreference(user?.id, safeInitials);
      setUserColorPreference(user?.id, selectedColorId);
      await refreshUser();
      setProfileEditingMain(false);
      setProfileEditingColor(false);
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
      navigate("/kitchen/login");
    } catch (err) {
      setError(err.message || "No se pudo eliminar el perfil.");
    }
  };

  const copyText = async (value, label) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      updateSuccess(`${label} copiado.`);
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

  const openMemberModal = (member) => {
    if (!canManageHousehold && String(member.id) !== String(user?.id)) return;
    setConvertForm({ email: member.email || "", password: "" });
    setMemberModal({
      open: true,
      member,
      form: {
        displayName: member.displayName || "",
        initials: (member.initials || initialsFromName(member.displayName || "")).slice(0, 3),
        colorId: member.colorId || "lavender",
        role: member.role || "member"
      }
    });
  };

  const saveMember = async () => {
    if (!memberModal.member) return;
    try {
      await apiRequest(`/api/kitchen/users/members/${memberModal.member.id}`, {
        method: "PUT",
        body: JSON.stringify({
          displayName: memberModal.form.displayName.trim(),
          initials: memberModal.form.initials.trim().toUpperCase().slice(0, 3),
          colorId: memberModal.form.colorId,
          role: memberModal.form.role
        })
      });
      setMemberModal({ open: false, member: null, form: { displayName: "", initials: "", colorId: "lavender", role: "member" } });
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
          colorId: dinerModal.form.colorId
        })
      });
      setDinerModal({ open: false, form: { displayName: "", initials: "", colorId: "lavender" } });
      updateSuccess("Comensal creado.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo crear el comensal.");
    }
  };

  const convertPlaceholder = async () => {
    if (!memberModal.member) return;
    const email = convertForm.email.trim().toLowerCase();
    if (!email) {
      setError("El email es obligatorio para convertir.");
      return;
    }
    try {
      await apiRequest(`/api/kitchen/household/placeholders/${memberModal.member.id}/convert`, {
        method: "POST",
        body: JSON.stringify({
          email,
          ...(convertForm.password.trim() ? { password: convertForm.password.trim() } : {})
        })
      });
      updateSuccess("Comensal convertido en usuario.");
      setMemberModal({ open: false, member: null, form: { displayName: "", initials: "", colorId: "lavender", role: "member" } });
      setConvertForm({ email: "", password: "" });
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo convertir el comensal.");
    }
  };

  const createCategory = async (sourceName, colorBg, colorText) => {
    const safeName = String(sourceName || "").trim();
    if (!safeName) return;
    try {
      await apiRequest("/api/categories", {
        method: "POST",
        body: JSON.stringify({
          name: safeName,
          colorBg,
          colorText,
          ...(isDiod ? { scope: "master" } : {})
        })
      });
      setCategoryModal({
        open: false,
        mode: "create",
        category: null,
        name: "",
        colorBg: CATEGORY_COLORS[0].colorBg,
        colorText: CATEGORY_COLORS[0].colorText
      });
      notifyCatalogInvalidated();
      updateSuccess("Categoria creada.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo crear categoria.");
    }
  };

  const editCategory = async (category, nextName, colorBg, colorText) => {
    const safeName = String(nextName || "").trim();
    if (!safeName) return;
    try {
      await apiRequest(`/api/categories/${category._id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: safeName,
          colorBg,
          colorText,
          active: category.active,
          forRecipes: category.forRecipes
        })
      });
      setCategoryModal({
        open: false,
        mode: "create",
        category: null,
        name: "",
        colorBg: CATEGORY_COLORS[0].colorBg,
        colorText: CATEGORY_COLORS[0].colorText
      });
      notifyCatalogInvalidated();
      updateSuccess("Categoria actualizada.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo editar categoria.");
    }
  };

  const removeCategory = async (category) => {
    setConfirmModal({
      open: true,
      title: "Eliminar categoria",
      message: `Se eliminara la categoria "${category.name}".`,
      dangerLabel: "Eliminar",
      onConfirm: async () => {
        await apiRequest(`/api/categories/${category._id}`, { method: "DELETE" });
        notifyCatalogInvalidated();
        updateSuccess("Categoria eliminada.");
        await loadData();
      }
    });
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
          <h3 className="settings-subtitle">Informacion personal</h3>
          <button type="button" className="settings-mini-button" onClick={() => setProfileEditingMain((value) => !value)}>
            {profileEditingMain ? "Cancelar" : "Editar"}
          </button>
        </div>
        <div className="settings-readonly-grid two-cols">
          <label className="kitchen-field">
            <span className="kitchen-label">Nombre</span>
            <input id="settings-display-name" className="kitchen-input" value={displayName} readOnly={!profileEditingMain} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label className="kitchen-field">
            <span className="kitchen-label">Iniciales</span>
            <input id="settings-initials" className="kitchen-input" maxLength={3} value={profileInitials} readOnly={!profileEditingMain} onChange={(event) => setProfileInitials(event.target.value.toUpperCase())} placeholder="FR" />
          </label>
        </div>
        {profileEditingMain ? <button type="button" className="settings-mini-button" onClick={saveProfile}>Guardar</button> : null}
        <p className="kitchen-muted">Email: {user?.email || "Sin email"}</p>
      </div>
      <div className="settings-block">
        <div className="settings-inline-heading">
          <h3 className="settings-subtitle">Color del usuario</h3>
          <button type="button" className="settings-mini-button" onClick={() => setProfileEditingColor((value) => !value)}>
            {profileEditingColor ? "Cancelar" : "Editar"}
          </button>
        </div>
        <div className="settings-color-grid">
          {palette.map((color) => (
            <button
              key={color.id}
              type="button"
              className={`settings-color-swatch ${selectedColorId === color.id ? "is-selected" : ""}`}
              style={{ background: color.background, color: color.text }}
              onClick={() => profileEditingColor && setSelectedColorId(color.id)}
              disabled={!profileEditingColor}
            >
              {color.label}
            </button>
          ))}
        </div>
        {profileEditingColor ? <button type="button" className="settings-mini-button" onClick={saveProfile}>Guardar</button> : null}
      </div>
      <div className="settings-block">
        <button type="button" className="kitchen-button secondary" onClick={() => setPasswordModalOpen(true)}>Cambiar contrasena</button>
      </div>
      <div className="settings-block danger">
        <h3 className="settings-subtitle">Zona de peligro</h3>
        <button type="button" className="kitchen-button secondary" onClick={openDeleteProfileFlow}>Eliminar mi perfil</button>
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
        <h2>Miembros del hogar</h2>
      </div>
      <div className="settings-block">
        <div className="settings-inline-heading">
          <p className="settings-counter">Household: {householdName || "Mi household"}</p>
          {householdNameEditing ? (
            <button type="button" className="settings-mini-button" onClick={saveHouseholdName}>Guardar</button>
          ) : (
            <button type="button" className="settings-mini-button" onClick={() => setHouseholdNameEditing(true)}>Editar</button>
          )}
        </div>
        {householdNameEditing ? (
          <input className="kitchen-input" value={householdNameDraft} onChange={(event) => setHouseholdNameDraft(event.target.value)} />
        ) : null}
        <p className="settings-counter">Miembros ({members.length})</p>
        <div className="settings-members-actions">
          <button type="button" className="kitchen-button" onClick={() => setPanel("household-invitations")}>Invitar</button>
          <button type="button" className="kitchen-button secondary" onClick={() => setDinerModal({ open: true, form: { displayName: "", initials: "", colorId: "lavender" } })}>Crear comensal</button>
        </div>
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
                <span>{memberRoleLabel(member)}</span>
              </span>
              <span className="settings-member-arrow">{">"}</span>
            </button>
          );
        })}
        {!members.length ? <p className="kitchen-muted">No hay miembros.</p> : null}
      </div>
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
        {!inviteLink ? <button type="button" className="kitchen-button" onClick={generateInvite}>Generar enlace</button> : null}
        <div className="settings-copy-box">
          <span>{inviteLink || "Sin enlace generado"}</span>
          <button type="button" className="settings-mini-icon" onClick={() => copyText(inviteLink, "Enlace")} disabled={!inviteLink}>Copiar</button>
        </div>
        {!householdCode ? <button type="button" className="kitchen-button secondary" onClick={generateHouseholdCode}>Generar codigo</button> : null}
        <div className="settings-copy-box">
          <span>{householdCode || "Sin codigo generado"}</span>
          <button type="button" className="settings-mini-icon" onClick={() => copyText(householdCode, "Codigo")} disabled={!householdCode}>Copiar</button>
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
        <h2>{isDiod ? "Categorias master" : "Categorias de ingredientes"}</h2>
      </div>
      <div className="settings-block">
        <button
          type="button"
          className="kitchen-button"
          onClick={() => setCategoryModal({
            open: true,
            mode: "create",
            category: null,
            name: "",
            colorBg: CATEGORY_COLORS[0].colorBg,
            colorText: CATEGORY_COLORS[0].colorText
          })}
        >
          Nueva categoria
        </button>
      </div>
      <div className="settings-block">
        {categories.map((category) => (
          <div key={category._id} className="settings-row-card">
            <div>
              <strong>{category.name}<span className="settings-category-dot" style={{ color: category.colorText, background: category.colorBg }}>●</span></strong>
              <p className="kitchen-muted">{category.scope || "household"}</p>
            </div>
            <div className="settings-row-actions">
              <button
                type="button"
                className="settings-mini-icon"
                onClick={() => setCategoryModal({
                  open: true,
                  mode: "edit",
                  category,
                  name: category.name,
                  colorBg: category.colorBg || CATEGORY_COLORS[0].colorBg,
                  colorText: category.colorText || CATEGORY_COLORS[0].colorText
                })}
              >
                Editar
              </button>
              <button type="button" className="settings-mini-icon danger" onClick={() => removeCategory(category)}>Eliminar</button>
            </div>
          </div>
        ))}
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
            {canManageHousehold ? <CardButton title="Household" subtitle="Miembros e invitaciones." onClick={() => setPanel("household-members")} /> : null}
            {canManageCategories ? <CardButton title="Categorias" subtitle="Gestion de categorias." onClick={() => setPanel("categorias")} /> : null}
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
        {!loading && activePanel === "household-members" && canManageHousehold ? HouseholdMembersPanel : null}
        {!loading && activePanel === "household-invitations" && canManageHousehold ? HouseholdInvitesPanel : null}
        {!loading && activePanel === "categorias" && canManageCategories ? CategoriesPanel : null}

        <button type="button" className="kitchen-button secondary" onClick={logout}>Cerrar sesion</button>
      </div>

      <ModalSheet open={passwordModalOpen} title="Cambiar contrasena" onClose={() => setPasswordModalOpen(false)} actions={<><button type="button" className="kitchen-button secondary" onClick={() => setPasswordModalOpen(false)}>Cancelar</button><button type="button" className="kitchen-button" onClick={savePassword}>Guardar</button></>}>
        <div className="kitchen-actions">
          <input className="kitchen-input" type="password" placeholder="Contrasena actual" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))} />
          <input className="kitchen-input" type="password" placeholder="Nueva contrasena" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))} />
          <input className="kitchen-input" type="password" placeholder="Repetir contrasena" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))} />
        </div>
      </ModalSheet>

      <ModalSheet open={memberModal.open} title="Editar usuario" onClose={() => setMemberModal({ open: false, member: null, form: { displayName: "", initials: "", colorId: "lavender", role: "member" } })} actions={<><button type="button" className="kitchen-button secondary" onClick={() => setMemberModal({ open: false, member: null, form: { displayName: "", initials: "", colorId: "lavender", role: "member" } })}>Cancelar</button><button type="button" className="kitchen-button" onClick={saveMember}>Guardar</button></>}>
        <div className="kitchen-actions">
          <label className="kitchen-field"><span className="kitchen-label">Nombre</span><input className="kitchen-input" value={memberModal.form.displayName} onChange={(event) => setMemberModal((prev) => ({ ...prev, form: { ...prev.form, displayName: event.target.value } }))} /></label>
          <label className="kitchen-field"><span className="kitchen-label">Iniciales</span><input className="kitchen-input" maxLength={3} value={memberModal.form.initials} onChange={(event) => setMemberModal((prev) => ({ ...prev, form: { ...prev.form, initials: event.target.value.toUpperCase() } }))} /></label>
          <div className="settings-color-grid">{palette.map((color) => <button key={color.id} type="button" className={`settings-color-swatch ${memberModal.form.colorId === color.id ? "is-selected" : ""}`} style={{ background: color.background, color: color.text }} onClick={() => setMemberModal((prev) => ({ ...prev, form: { ...prev.form, colorId: color.id } }))}>{color.label}</button>)}</div>
          {!memberModal.member?.isPlaceholder ? <label className="kitchen-field"><span className="kitchen-label">Rol</span><select className="kitchen-select" value={memberModal.form.role} onChange={(event) => setMemberModal((prev) => ({ ...prev, form: { ...prev.form, role: event.target.value } }))}><option value="owner">Owner</option><option value="member">User</option></select></label> : null}
          {!memberModal.member?.isPlaceholder && canManageHousehold && String(memberModal.member?.id) !== String(user?.id) ? <button type="button" className="kitchen-button secondary" onClick={() => askDeleteMember(memberModal.member)}>Eliminar usuario</button> : null}
          {memberModal.member?.isPlaceholder ? (
            <div className="settings-block">
              <h4 className="settings-subtitle">Convertir en usuario</h4>
              <label className="kitchen-field"><span className="kitchen-label">Email</span><input className="kitchen-input" type="email" value={convertForm.email} onChange={(event) => setConvertForm((prev) => ({ ...prev, email: event.target.value }))} /></label>
              <label className="kitchen-field"><span className="kitchen-label">Contraseña (opcional)</span><input className="kitchen-input" type="password" value={convertForm.password} onChange={(event) => setConvertForm((prev) => ({ ...prev, password: event.target.value }))} /></label>
              <button type="button" className="kitchen-button secondary" onClick={convertPlaceholder}>Convertir en usuario</button>
            </div>
          ) : null}
        </div>
      </ModalSheet>

      <ModalSheet open={dinerModal.open} title="Crear comensal" onClose={() => setDinerModal({ open: false, form: { displayName: "", initials: "", colorId: "lavender" } })} actions={<><button type="button" className="kitchen-button secondary" onClick={() => setDinerModal({ open: false, form: { displayName: "", initials: "", colorId: "lavender" } })}>Cancelar</button><button type="button" className="kitchen-button" onClick={createDiner}>Guardar</button></>}>
        <div className="kitchen-actions">
          <label className="kitchen-field"><span className="kitchen-label">Nombre</span><input className="kitchen-input" value={dinerModal.form.displayName} onChange={(event) => setDinerModal((prev) => ({ ...prev, form: { ...prev.form, displayName: event.target.value } }))} /></label>
          <label className="kitchen-field"><span className="kitchen-label">Iniciales</span><input className="kitchen-input" maxLength={3} value={dinerModal.form.initials} onChange={(event) => setDinerModal((prev) => ({ ...prev, form: { ...prev.form, initials: event.target.value.toUpperCase() } }))} /></label>
          <div className="settings-color-grid">{palette.map((color) => <button key={color.id} type="button" className={`settings-color-swatch ${dinerModal.form.colorId === color.id ? "is-selected" : ""}`} style={{ background: color.background, color: color.text }} onClick={() => setDinerModal((prev) => ({ ...prev, form: { ...prev.form, colorId: color.id } }))}>{color.label}</button>)}</div>
        </div>
      </ModalSheet>

      <ModalSheet
        open={categoryModal.open}
        title={categoryModal.mode === "edit" ? "Editar categoria" : "Nueva categoria"}
        onClose={() => setCategoryModal({ open: false, mode: "create", category: null, name: "", colorBg: CATEGORY_COLORS[0].colorBg, colorText: CATEGORY_COLORS[0].colorText })}
        actions={<><button type="button" className="kitchen-button secondary" onClick={() => setCategoryModal({ open: false, mode: "create", category: null, name: "", colorBg: CATEGORY_COLORS[0].colorBg, colorText: CATEGORY_COLORS[0].colorText })}>Cancelar</button><button type="button" className="kitchen-button" onClick={() => (categoryModal.mode === "edit" ? editCategory(categoryModal.category, categoryModal.name, categoryModal.colorBg, categoryModal.colorText) : createCategory(categoryModal.name, categoryModal.colorBg, categoryModal.colorText))}>Guardar</button></>}
      >
        <label className="kitchen-field"><span className="kitchen-label">Nombre</span><input className="kitchen-input" value={categoryModal.name} onChange={(event) => setCategoryModal((prev) => ({ ...prev, name: event.target.value }))} placeholder="Verduras" /></label>
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
        open={deleteProfileModal.open}
        title="Eliminar mi perfil"
        onClose={() => setDeleteProfileModal({ open: false, loading: false, preview: null, promoteUserId: "", confirmDeleteHousehold: false })}
        actions={<><button type="button" className="kitchen-button secondary" onClick={() => setDeleteProfileModal({ open: false, loading: false, preview: null, promoteUserId: "", confirmDeleteHousehold: false })}>Cancelar</button><button type="button" className="kitchen-button" onClick={confirmDeleteProfile}>Eliminar</button></>}
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
              <label className="kitchen-muted">
                <input type="checkbox" checked={deleteProfileModal.confirmDeleteHousehold} onChange={(event) => setDeleteProfileModal((prev) => ({ ...prev, confirmDeleteHousehold: event.target.checked }))} />
                {" "}Confirmo la eliminacion completa del household
              </label>
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
