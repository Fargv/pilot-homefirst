import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";
import { useAuth } from "../auth";
import { apiRequest } from "../api.js";
import ModalSheet from "../components/ui/ModalSheet.jsx";
import {
  getColorPalette,
  getUserColorPreference,
  setUserColorPreference
} from "../utils/userColors.js";
import { getUserInitialsPreference, setUserInitialsPreference } from "../utils/userInitials.js";

function initialsFromName(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function roleLabel(user, isOwner, isDiod) {
  if (isDiod) return "DIOD";
  if (isOwner) return "Household Owner/Admin";
  return "Regular User";
}

export default function SettingsPage() {
  const { user, setUser, refreshUser, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [inviteLink, setInviteLink] = useState("");
  const [householdCode, setHouseholdCode] = useState("");
  const [placeholderName, setPlaceholderName] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoryName, setCategoryName] = useState("");
  const [diodHouseholds, setDiodHouseholds] = useState([]);
  const [globalUsers, setGlobalUsers] = useState([]);
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [profileInitials, setProfileInitials] = useState(getUserInitialsPreference(user?.id) || initialsFromName(user?.displayName || ""));
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [selectedColorId, setSelectedColorId] = useState(getUserColorPreference(user?.id));
  const [categoryModal, setCategoryModal] = useState({ open: false, mode: "create", category: null, name: "" });
  const [confirmModal, setConfirmModal] = useState({ open: false, title: "", message: "", onConfirm: null });

  const isOwner = user?.role === "owner" || user?.role === "admin";
  const isDiod = user?.globalRole === "diod";
  const canManageCategories = isDiod || isOwner;
  const canManageHousehold = isOwner && !(isDiod && !user?.activeHouseholdId);
  const palette = getColorPalette();

  const activePanel = (searchParams.get("section") || "").toLowerCase();
  const isHub = !activePanel;

  const userInitials = (getUserInitialsPreference(user?.id) || initialsFromName(user?.displayName || "")).slice(0, 3);
  const selectedColor = useMemo(
    () => palette.find((item) => item.id === selectedColorId) || palette[0],
    [palette, selectedColorId]
  );

  const setPanel = (panel) => {
    if (!panel) {
      setSearchParams({});
      return;
    }
    setSearchParams({ section: panel });
  };

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const requests = [];

      requests.push(apiRequest("/api/categories"));
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

      if (isDiod) {
        requests.push(apiRequest("/api/kitchen/admin/households"));
        requests.push(apiRequest("/api/kitchen/admin/users"));
      } else {
        requests.push(Promise.resolve({ households: [] }));
        requests.push(Promise.resolve({ users: [] }));
      }

      const [categoryData, memberData, invitationData, codeData, householdData, globalUserData] = await Promise.all(requests);

      setCategories(categoryData.categories || []);
      setMembers(memberData.users || []);
      setInvitations(invitationData.invitations || []);
      setHouseholdCode(codeData.inviteCode || "");
      setDiodHouseholds(householdData.households || []);
      setGlobalUsers(globalUserData.users || []);
      setDisplayName(user?.displayName || "");
      setProfileInitials(getUserInitialsPreference(user?.id) || initialsFromName(user?.displayName || ""));
      setSelectedColorId(getUserColorPreference(user?.id));
    } catch (err) {
      setError(err.message || "No se pudo cargar configuracion.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [isDiod, canManageHousehold, user?.activeHouseholdId]);

  const updateSuccess = (message) => {
    setSuccess(message);
    setError("");
  };

  const saveProfile = async () => {
    const safeDisplayName = displayName.trim();
    if (!safeDisplayName) {
      setError("El nombre visible es obligatorio.");
      return;
    }
    try {
      const data = await apiRequest("/api/kitchen/users/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName: safeDisplayName })
      });
      if (data?.user) {
        setUser((prev) => ({ ...prev, ...data.user }));
      }
      setUserInitialsPreference(user?.id, profileInitials);
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
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordModalOpen(false);
      updateSuccess("Contrasena actualizada.");
    } catch (err) {
      setError(err.message || "No se pudo cambiar la contrasena.");
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

  const copyText = async (value, label) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      updateSuccess(`${label} copiado.`);
    } catch {
      setError(`No se pudo copiar ${label.toLowerCase()}.`);
    }
  };

  const createPlaceholder = async () => {
    const safeName = placeholderName.trim();
    if (!safeName) {
      setError("Introduce nombre para el comensal.");
      return;
    }
    try {
      await apiRequest("/api/kitchen/household/placeholders", {
        method: "POST",
        body: JSON.stringify({ displayName: safeName })
      });
      setPlaceholderName("");
      updateSuccess("Comensal creado.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo crear el comensal.");
    }
  };

  const updateMemberRole = async (memberId, nextRole) => {
    try {
      await apiRequest(`/api/kitchen/users/members/${memberId}`, {
        method: "PUT",
        body: JSON.stringify({ role: nextRole })
      });
      updateSuccess("Rol actualizado.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo actualizar el rol.");
    }
  };

  const removeMember = async (member) => {
    setConfirmModal({
      open: true,
      title: "Eliminar miembro",
      message: `Se eliminara a ${member.displayName} del household.`,
      onConfirm: async () => {
        await apiRequest(`/api/kitchen/users/members/${member.id}`, { method: "DELETE" });
        updateSuccess("Miembro eliminado.");
        await loadData();
      }
    });
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
      onConfirm: async () => {
        await apiRequest(`/api/categories/${category._id}`, { method: "DELETE" });
        updateSuccess("Categoria eliminada.");
        await loadData();
      }
    });
  };

  const createHousehold = async (isTest = false) => {
    const baseName = newHouseholdName.trim();
    const name = baseName || (isTest ? `Test Household ${new Date().toLocaleString()}` : "");
    if (!name) {
      setError("Introduce nombre del household.");
      return;
    }
    try {
      await apiRequest("/api/kitchen/admin/households", {
        method: "POST",
        body: JSON.stringify({ name })
      });
      setNewHouseholdName("");
      updateSuccess(isTest ? "Test household creado." : "Household creado.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo crear el household.");
    }
  };

  const deleteHousehold = async (household) => {
    setConfirmModal({
      open: true,
      title: "Eliminar household",
      message: `Se eliminara el household "${household.name}" y sus datos.`,
      onConfirm: async () => {
        await apiRequest(`/api/kitchen/admin/households/${household.id}`, { method: "DELETE" });
        updateSuccess("Household eliminado.");
        await loadData();
      }
    });
  };

  const assignOwner = async (household, ownerUserId) => {
    if (!ownerUserId) return;
    try {
      await apiRequest(`/api/kitchen/admin/households/${household.id}/owner`, {
        method: "PUT",
        body: JSON.stringify({ ownerUserId })
      });
      updateSuccess("Owner asignado.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo asignar owner.");
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
        <label className="kitchen-label" htmlFor="settings-display-name">Display name</label>
        <input
          id="settings-display-name"
          className="kitchen-input"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
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
        <p className="kitchen-muted">Selecciona uno de 8 colores pastel para tus iniciales.</p>
        <div className="settings-color-grid">
          {palette.map((color) => (
            <button
              key={color.id}
              type="button"
              className={`settings-color-swatch ${selectedColorId === color.id ? "is-selected" : ""}`}
              style={{ background: color.background, color: color.text }}
              onClick={() => setSelectedColorId(color.id)}
              aria-label={color.label}
            >
              {color.label}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-block">
        <h3 className="settings-subtitle">Cambiar contrasena</h3>
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

  const HouseholdPanel = (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <button type="button" className="kitchen-button secondary" onClick={() => setPanel("")}>Volver</button>
        <h2>Household</h2>
      </div>
      <div className="settings-block">
        <h3 className="settings-subtitle">Gestion de miembros</h3>
        {members.map((member) => (
          <div key={member.id} className="settings-row-card">
            <div>
              <strong>{member.displayName}</strong>
              <p className="kitchen-muted">{member.email || "Comensal sin cuenta"}</p>
            </div>
            <div className="settings-row-actions">
              <select
                className="kitchen-select"
                value={member.role || "member"}
                onChange={(event) => updateMemberRole(member.id, event.target.value)}
                disabled={String(member.id) === String(user?.id)}
              >
                <option value="member">User</option>
                <option value="owner">Owner/Admin</option>
              </select>
              <button
                type="button"
                className="kitchen-button secondary"
                onClick={() => removeMember(member)}
                disabled={String(member.id) === String(user?.id)}
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="settings-block">
        <h3 className="settings-subtitle">Invitaciones</h3>
        <p className="kitchen-muted">
          Invita a alguien al household compartiendo enlace o codigo.
          Cuando se registren podran entrar directamente en tu household.
        </p>
        <div className="kitchen-actions-inline">
          <button type="button" className="kitchen-button" onClick={generateHouseholdCode}>
            {householdCode ? "Regenerar codigo" : "Generar codigo"}
          </button>
          <button type="button" className="kitchen-button secondary" onClick={() => copyText(householdCode, "Codigo")} disabled={!householdCode}>Copiar</button>
        </div>
        <p className="kitchen-muted">Codigo: <strong>{householdCode || "No generado"}</strong></p>
        <div className="kitchen-actions-inline">
          <button type="button" className="kitchen-button" onClick={generateInvite}>Generar enlace</button>
          <button type="button" className="kitchen-button secondary" onClick={() => copyText(inviteLink, "Enlace")} disabled={!inviteLink}>Copiar</button>
        </div>
        {inviteLink ? <p className="kitchen-muted">{inviteLink}</p> : null}
        {invitations.length > 0 ? (
          <ul className="kitchen-list">
            {invitations.map((invitation) => (
              <li key={invitation.id}>Valida hasta {new Date(invitation.expiresAt).toLocaleString()}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="settings-block">
        <h3 className="settings-subtitle">Anadir comensal sin cuenta</h3>
        <div className="kitchen-actions-inline">
          <input
            className="kitchen-input"
            placeholder="Nombre del comensal"
            value={placeholderName}
            onChange={(event) => setPlaceholderName(event.target.value)}
          />
          <button type="button" className="kitchen-button secondary" onClick={createPlaceholder}>Crear</button>
        </div>
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
          <input
            className="kitchen-input"
            placeholder="Nombre de categoria"
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
          />
          <button
            type="button"
            className="kitchen-button"
            onClick={() => setCategoryModal({ open: true, mode: "create", category: null, name: categoryName })}
            disabled={!categoryName.trim()}
          >
            Nueva categoria
          </button>
        </div>
      </div>
      <div className="settings-block">
        {categories.map((category) => (
          <div key={category._id} className="settings-row-card">
            <div>
              <strong>
                {category.name}
                <span
                  className="settings-category-dot"
                  style={{ background: category.colorBg || "#E8F1FF", color: category.colorText || "#1D4ED8" }}
                >
                  ●
                </span>
              </strong>
              <p className="kitchen-muted">{category.scope || "household"}</p>
            </div>
            <div className="settings-row-actions">
              <button
                type="button"
                className="kitchen-button secondary"
                onClick={() => setCategoryModal({ open: true, mode: "edit", category, name: category.name })}
              >
                Editar
              </button>
              <button type="button" className="kitchen-button secondary" onClick={() => removeCategory(category)}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const DiodPanel = (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <button type="button" className="kitchen-button secondary" onClick={() => setPanel("")}>Volver</button>
        <h2>DIOD Administration</h2>
      </div>
      <div className="settings-block">
        <h3 className="settings-subtitle">Households</h3>
        <div className="kitchen-actions-inline">
          <input
            className="kitchen-input"
            placeholder="Nombre del household"
            value={newHouseholdName}
            onChange={(event) => setNewHouseholdName(event.target.value)}
          />
          <button type="button" className="kitchen-button" onClick={() => createHousehold(false)}>Crear</button>
          <button type="button" className="kitchen-button secondary" onClick={() => createHousehold(true)}>Crear test</button>
        </div>
        {diodHouseholds.map((household) => (
          <div key={household.id} className="settings-row-card">
            <div>
              <strong>{household.name}</strong>
              <p className="kitchen-muted">{household.isActive ? "Activo" : "Inactivo"}</p>
            </div>
            <div className="settings-row-actions">
              <select
                className="kitchen-select"
                defaultValue=""
                onChange={(event) => assignOwner(household, event.target.value)}
              >
                <option value="">Asignar owner</option>
                {globalUsers.map((globalUser) => (
                  <option key={globalUser.id} value={globalUser.id}>
                    {globalUser.displayName || globalUser.email}
                  </option>
                ))}
              </select>
              <button type="button" className="kitchen-button secondary" onClick={() => deleteHousehold(household)}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
      <div className="settings-block">
        <h3 className="settings-subtitle">Global users</h3>
        {globalUsers.map((globalUser) => (
          <div key={globalUser.id} className="settings-row-card">
            <div>
              <strong>{globalUser.displayName || "Sin nombre"}</strong>
              <p className="kitchen-muted">{globalUser.email || "Sin email"} · {globalUser.globalRole || globalUser.role}</p>
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
            <CardButton title="Perfil" subtitle="Informacion personal, password y color de usuario." onClick={() => setPanel("perfil")} />
            <CardButton title="Preferencias" subtitle="Idioma, dark mode y notificaciones." onClick={() => setPanel("preferencias")} />
            {canManageHousehold ? (
              <CardButton title="Household" subtitle="Miembros, invitaciones, roles y permisos." onClick={() => setPanel("household")} />
            ) : null}
            {canManageCategories ? (
              <CardButton title="Categorias" subtitle="Gestion de categorias en pantalla dedicada." onClick={() => setPanel("categorias")} />
            ) : null}
            {isDiod ? (
              <CardButton title="DIOD Administration" subtitle="Households, usuarios globales y categorias master." onClick={() => setPanel("administracion")} />
            ) : null}
            <div className="settings-upgrade-card">
              <h3>Upgrade to Pro</h3>
              <p className="kitchen-muted">Funciones premium proximamente:</p>
              <ul className="kitchen-list">
                <li>Planificacion inteligente</li>
                <li>Sugerencias de menu</li>
                <li>Estadisticas de cocina</li>
              </ul>
              <button type="button" className="kitchen-button secondary" disabled>Upgrade (coming soon)</button>
            </div>
          </div>
        ) : null}

        {!loading && activePanel === "perfil" ? ProfilePanel : null}
        {!loading && activePanel === "preferencias" ? PreferencesPanel : null}
        {!loading && activePanel === "household" && canManageHousehold ? HouseholdPanel : null}
        {!loading && activePanel === "categorias" && canManageCategories ? CategoriesPanel : null}
        {!loading && activePanel === "administracion" && isDiod ? DiodPanel : null}

        <button type="button" className="kitchen-button secondary" onClick={logout}>Cerrar sesion</button>
      </div>

      <ModalSheet
        open={passwordModalOpen}
        title="Cambiar contrasena"
        onClose={() => setPasswordModalOpen(false)}
        actions={(
          <>
            <button type="button" className="kitchen-button secondary" onClick={() => setPasswordModalOpen(false)}>Cancelar</button>
            <button type="button" className="kitchen-button" onClick={savePassword}>Guardar</button>
          </>
        )}
      >
        <div className="kitchen-actions">
          <input
            className="kitchen-input"
            type="password"
            placeholder="Contrasena actual"
            value={passwordForm.currentPassword}
            onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
          />
          <input
            className="kitchen-input"
            type="password"
            placeholder="Nueva contrasena"
            value={passwordForm.newPassword}
            onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
          />
          <input
            className="kitchen-input"
            type="password"
            placeholder="Repetir contrasena"
            value={passwordForm.confirmPassword}
            onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
          />
        </div>
      </ModalSheet>

      <ModalSheet
        open={categoryModal.open}
        title={categoryModal.mode === "edit" ? "Editar categoria" : "Nueva categoria"}
        onClose={() => setCategoryModal({ open: false, mode: "create", category: null, name: "" })}
        actions={(
          <>
            <button
              type="button"
              className="kitchen-button secondary"
              onClick={() => setCategoryModal({ open: false, mode: "create", category: null, name: "" })}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="kitchen-button"
              onClick={() => (categoryModal.mode === "edit"
                ? editCategory(categoryModal.category, categoryModal.name)
                : createCategory(categoryModal.name))}
            >
              Guardar
            </button>
          </>
        )}
      >
        <label className="kitchen-field">
          <span className="kitchen-label">Nombre</span>
          <input
            className="kitchen-input"
            value={categoryModal.name}
            onChange={(event) => setCategoryModal((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Verduras"
          />
        </label>
      </ModalSheet>

      <ModalSheet
        open={confirmModal.open}
        title={confirmModal.title}
        onClose={() => setConfirmModal({ open: false, title: "", message: "", onConfirm: null })}
        actions={(
          <>
            <button
              type="button"
              className="kitchen-button secondary"
              onClick={() => setConfirmModal({ open: false, title: "", message: "", onConfirm: null })}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="kitchen-button"
              onClick={async () => {
                try {
                  if (typeof confirmModal.onConfirm === "function") {
                    await confirmModal.onConfirm();
                  }
                  setConfirmModal({ open: false, title: "", message: "", onConfirm: null });
                } catch (err) {
                  setError(err.message || "No se pudo completar la accion.");
                }
              }}
            >
              Confirmar
            </button>
          </>
        )}
      >
        <p className="kitchen-muted">{confirmModal.message}</p>
      </ModalSheet>
    </KitchenLayout>
  );
}
