import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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

function roleLabel(user, isOwner, isDiod) {
  if (isDiod) return "DIOD";
  if (isOwner) return "Household Owner/Admin";
  return "Regular User";
}

function memberRoleLabel(member) {
  if (member?.isPlaceholder) return "COMENSAL";
  const role = String(member?.role || "").toLowerCase();
  if (role === "owner" || role === "admin") return "OWNER";
  return "USER";
}

export default function SettingsPage() {
  const { user, setUser, refreshUser, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const palette = getColorPalette();
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [inviteLink, setInviteLink] = useState("");
  const [householdCode, setHouseholdCode] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoryName, setCategoryName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [profileInitials, setProfileInitials] = useState(user?.initials || getUserInitialsPreference(user?.id) || initialsFromName(user?.displayName || ""));
  const [selectedColorId, setSelectedColorId] = useState(user?.colorId || getUserColorPreference(user?.id) || "lavender");
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [memberSearch, setMemberSearch] = useState("");
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [categoryModal, setCategoryModal] = useState({ open: false, mode: "create", category: null, name: "" });
  const [memberModal, setMemberModal] = useState({ open: false, member: null, form: { displayName: "", initials: "", colorId: "lavender", role: "member" } });
  const [dinerModal, setDinerModal] = useState({ open: false, form: { displayName: "", initials: "", colorId: "lavender" } });
  const [confirmModal, setConfirmModal] = useState({ open: false, title: "", message: "", onConfirm: null, dangerLabel: "Confirmar" });

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

  const filteredMembers = useMemo(() => {
    const needle = memberSearch.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((member) => {
      const text = `${member.displayName || ""} ${member.email || ""}`.toLowerCase();
      return text.includes(needle);
    });
  }, [members, memberSearch]);

  const setPanel = (panel) => {
    if (!panel) {
      setSearchParams({});
      return;
    }
    setSearchParams({ section: panel });
  };

  const updateSuccess = (message) => {
    setSuccess(message);
    setError("");
  };

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const requests = [apiRequest("/api/categories")];
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

      const [categoryData, memberData, invitationData, codeData] = await Promise.all(requests);
      setCategories(categoryData.categories || []);
      setMembers(memberData.users || []);
      setInvitations(invitationData.invitations || []);
      setHouseholdCode(codeData.inviteCode || "");
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

  const createCategory = async (sourceName) => {
    const safeName = String(sourceName ?? categoryName).trim();
    if (!safeName) return;
    try {
      await apiRequest("/api/categories", {
        method: "POST",
        body: JSON.stringify({ name: safeName, ...(isDiod ? { scope: "master" } : {}) })
      });
      setCategoryName("");
      setCategoryModal({ open: false, mode: "create", category: null, name: "" });
      updateSuccess("Categoria creada.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo crear categoria.");
    }
  };

  const editCategory = async (category, nextName) => {
    const safeName = String(nextName || "").trim();
    if (!safeName) return;
    try {
      await apiRequest(`/api/categories/${category._id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: safeName,
          colorBg: category.colorBg,
          colorText: category.colorText,
          active: category.active,
          forRecipes: category.forRecipes
        })
      });
      setCategoryModal({ open: false, mode: "create", category: null, name: "" });
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
        <label className="kitchen-label" htmlFor="settings-display-name">Nombre</label>
        <input id="settings-display-name" className="kitchen-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        <p className="kitchen-muted">Email: {user?.email || "Sin email"}</p>
        <label className="kitchen-label" htmlFor="settings-initials">Iniciales</label>
        <input
          id="settings-initials"
          className="kitchen-input"
          maxLength={3}
          value={profileInitials}
          onChange={(event) => setProfileInitials(event.target.value.toUpperCase())}
          placeholder="FR"
        />
      </div>
      <div className="settings-block">
        <h3 className="settings-subtitle">Color del usuario</h3>
        <div className="settings-color-grid">
          {palette.map((color) => (
            <button
              key={color.id}
              type="button"
              className={`settings-color-swatch ${selectedColorId === color.id ? "is-selected" : ""}`}
              style={{ background: color.background, color: color.text }}
              onClick={() => setSelectedColorId(color.id)}
            >
              {color.label}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-block">
        <button type="button" className="kitchen-button secondary" onClick={() => setPasswordModalOpen(true)}>Cambiar contrasena</button>
      </div>
      <button type="button" className="kitchen-button" onClick={saveProfile}>Guardar perfil</button>
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
        <p className="settings-counter">Miembros ({members.length})</p>
        <input className="kitchen-input" placeholder="Buscar usuario" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} />
        <div className="settings-members-actions">
          <button type="button" className="kitchen-button" onClick={() => setPanel("household-invitations")}>Invitar</button>
          <button type="button" className="kitchen-button secondary" onClick={() => setDinerModal({ open: true, form: { displayName: "", initials: "", colorId: "lavender" } })}>Crear comensal</button>
        </div>
      </div>
      <div className="settings-block">
        {filteredMembers.map((member) => {
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
        {!filteredMembers.length ? <p className="kitchen-muted">No hay miembros que coincidan.</p> : null}
      </div>
    </div>
  );

  const HouseholdInvitesPanel = (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <button type="button" className="kitchen-button secondary" onClick={() => setPanel("household-members")}>Volver</button>
        <h2>Invitar usuario</h2>
      </div>
      <div className="settings-block">
        <p className="kitchen-muted">
          Comparte este codigo o enlace con tus companeros.
          Cuando se registren podran introducirlo y entraran directamente en tu household.
        </p>
        <div className="kitchen-actions-inline">
          <button type="button" className="kitchen-button" onClick={generateInvite}>Generar enlace</button>
          <button type="button" className="kitchen-button secondary" onClick={() => copyText(inviteLink, "Enlace")} disabled={!inviteLink}>Copiar enlace</button>
        </div>
        {inviteLink ? <p className="kitchen-muted">{inviteLink}</p> : null}
        <div className="kitchen-actions-inline">
          <button type="button" className="kitchen-button" onClick={generateHouseholdCode}>{householdCode ? "Regenerar codigo" : "Generar codigo"}</button>
          <button type="button" className="kitchen-button secondary" onClick={() => copyText(householdCode, "Codigo")} disabled={!householdCode}>Copiar codigo</button>
        </div>
        <p className="kitchen-muted"><strong>{householdCode || "Sin codigo generado"}</strong></p>
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
        <div className="kitchen-actions-inline">
          <input className="kitchen-input" placeholder="Nombre de categoria" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
          <button type="button" className="kitchen-button" onClick={() => setCategoryModal({ open: true, mode: "create", category: null, name: categoryName })} disabled={!categoryName.trim()}>Nueva categoria</button>
        </div>
      </div>
      <div className="settings-block">
        {categories.map((category) => (
          <div key={category._id} className="settings-row-card">
            <div>
              <strong>{category.name}<span className="settings-category-dot">●</span></strong>
              <p className="kitchen-muted">{category.scope || "household"}</p>
            </div>
            <div className="settings-row-actions">
              <button type="button" className="kitchen-button secondary" onClick={() => setCategoryModal({ open: true, mode: "edit", category, name: category.name })}>Editar</button>
              <button type="button" className="kitchen-button secondary" onClick={() => removeCategory(category)}>Eliminar</button>
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
          <p className="settings-header-meta">{roleLabel(user, isOwner, isDiod)} · {user?.activeHouseholdId ? "Household activo" : "Sin household activo"}</p>
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
        </div>
      </ModalSheet>

      <ModalSheet open={dinerModal.open} title="Crear comensal" onClose={() => setDinerModal({ open: false, form: { displayName: "", initials: "", colorId: "lavender" } })} actions={<><button type="button" className="kitchen-button secondary" onClick={() => setDinerModal({ open: false, form: { displayName: "", initials: "", colorId: "lavender" } })}>Cancelar</button><button type="button" className="kitchen-button" onClick={createDiner}>Guardar</button></>}>
        <div className="kitchen-actions">
          <label className="kitchen-field"><span className="kitchen-label">Nombre</span><input className="kitchen-input" value={dinerModal.form.displayName} onChange={(event) => setDinerModal((prev) => ({ ...prev, form: { ...prev.form, displayName: event.target.value } }))} /></label>
          <label className="kitchen-field"><span className="kitchen-label">Iniciales</span><input className="kitchen-input" maxLength={3} value={dinerModal.form.initials} onChange={(event) => setDinerModal((prev) => ({ ...prev, form: { ...prev.form, initials: event.target.value.toUpperCase() } }))} /></label>
          <div className="settings-color-grid">{palette.map((color) => <button key={color.id} type="button" className={`settings-color-swatch ${dinerModal.form.colorId === color.id ? "is-selected" : ""}`} style={{ background: color.background, color: color.text }} onClick={() => setDinerModal((prev) => ({ ...prev, form: { ...prev.form, colorId: color.id } }))}>{color.label}</button>)}</div>
        </div>
      </ModalSheet>

      <ModalSheet open={categoryModal.open} title={categoryModal.mode === "edit" ? "Editar categoria" : "Nueva categoria"} onClose={() => setCategoryModal({ open: false, mode: "create", category: null, name: "" })} actions={<><button type="button" className="kitchen-button secondary" onClick={() => setCategoryModal({ open: false, mode: "create", category: null, name: "" })}>Cancelar</button><button type="button" className="kitchen-button" onClick={() => (categoryModal.mode === "edit" ? editCategory(categoryModal.category, categoryModal.name) : createCategory(categoryModal.name))}>Guardar</button></>}>
        <label className="kitchen-field"><span className="kitchen-label">Nombre</span><input className="kitchen-input" value={categoryModal.name} onChange={(event) => setCategoryModal((prev) => ({ ...prev, name: event.target.value }))} placeholder="Verduras" /></label>
      </ModalSheet>

      <ModalSheet open={confirmModal.open} title={confirmModal.title} onClose={() => setConfirmModal({ open: false, title: "", message: "", onConfirm: null, dangerLabel: "Confirmar" })} actions={<><button type="button" className="kitchen-button secondary" onClick={() => setConfirmModal({ open: false, title: "", message: "", onConfirm: null, dangerLabel: "Confirmar" })}>Cancelar</button><button type="button" className="kitchen-button" onClick={async () => { try { if (typeof confirmModal.onConfirm === "function") await confirmModal.onConfirm(); setConfirmModal({ open: false, title: "", message: "", onConfirm: null, dangerLabel: "Confirmar" }); } catch (err) { setError(err.message || "No se pudo completar la accion."); } }}>{confirmModal.dangerLabel}</button></>}>
        <p className="kitchen-muted">{confirmModal.message}</p>
      </ModalSheet>
    </KitchenLayout>
  );
}
