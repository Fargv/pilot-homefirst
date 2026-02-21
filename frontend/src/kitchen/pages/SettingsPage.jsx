import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";
import { useAuth } from "../auth";
import { apiRequest } from "../api.js";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [inviteLink, setInviteLink] = useState("");
  const [householdCode, setHouseholdCode] = useState("");
  const [placeholderName, setPlaceholderName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoryName, setCategoryName] = useState("");
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [masterStores, setMasterStores] = useState([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storeName, setStoreName] = useState("");

  const isOwner = user?.role === "owner" || user?.role === "admin";
  const isDiod = user?.globalRole === "diod";
  const isDiodGlobalMode = isDiod && !user?.activeHouseholdId;
  const canManageCategories = isDiod || isOwner;
  const canManageHousehold = isOwner && !isDiodGlobalMode;

  const categoriesTitle = useMemo(() => (
    isDiod ? "Categorías MASTER" : "Categorías del hogar"
  ), [isDiod]);

  const loadCategories = async () => {
    if (!canManageCategories) {
      setCategories([]);
      return;
    }
    setCategoriesLoading(true);
    try {
      const data = await apiRequest("/api/categories");
      setCategories(data.categories || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar las categorías.");
    } finally {
      setCategoriesLoading(false);
    }
  };

  const loadMasterStores = async () => {
    if (!isDiod) {
      setMasterStores([]);
      return;
    }
    setStoresLoading(true);
    try {
      const data = await apiRequest("/api/kitchen/shopping/stores/master");
      setMasterStores(data.stores || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los supermercados master.");
    } finally {
      setStoresLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      if (!isDiodGlobalMode) {
        const membersResponse = await apiRequest("/api/kitchen/users/members");
        setMembers(membersResponse.users || []);
      } else {
        setMembers([]);
      }

      if (canManageHousehold) {
        const [inviteResponse, codeResponse] = await Promise.all([
          apiRequest("/api/kitchen/household/invitations"),
          apiRequest("/api/kitchen/household/invite-code")
        ]);
        setInvitations(inviteResponse.invitations || []);
        setHouseholdCode(codeResponse.inviteCode || "");
      } else {
        setInvitations([]);
        setHouseholdCode("");
      }

      await Promise.all([loadCategories(), loadMasterStores()]);
    } catch (err) {
      setError(err.message || "No se pudo cargar la configuración del hogar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [canManageHousehold, canManageCategories, isDiodGlobalMode]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  const generateInvite = async () => {
    setError("");
    setSuccess("");
    try {
      const data = await apiRequest("/api/kitchen/household/invitations", { method: "POST" });
      setInviteLink(data.inviteLink || "");
      setSuccess("Enlace de invitación generado correctamente.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo generar la invitación.");
    }
  };

  const copyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setSuccess("Enlace copiado al portapapeles.");
    } catch {
      setError("No pudimos copiar el enlace automáticamente.");
    }
  };


  const generateHouseholdCode = async () => {
    setError("");
    setSuccess("");
    try {
      const data = await apiRequest("/api/kitchen/household/invite-code", { method: "POST" });
      setHouseholdCode(data.inviteCode || "");
      setSuccess("Código de hogar generado correctamente.");
    } catch (err) {
      setError(err.message || "No se pudo generar el código del hogar.");
    }
  };

  const copyHouseholdCode = async () => {
    if (!householdCode) return;
    try {
      await navigator.clipboard.writeText(householdCode);
      setSuccess("Código copiado al portapapeles.");
    } catch {
      setError("No pudimos copiar el código automáticamente.");
    }
  };

  const createPlaceholder = async () => {
    const safeName = placeholderName.trim();
    if (!safeName) {
      setError("Debes indicar un nombre para el comensal.");
      return;
    }

    setError("");
    setSuccess("");
    try {
      await apiRequest("/api/kitchen/household/placeholders", {
        method: "POST",
        body: JSON.stringify({ displayName: safeName })
      });
      setPlaceholderName("");
      setSuccess("Comensal sin cuenta creado correctamente.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo crear el comensal.");
    }
  };


  const createCategory = async () => {
    const safeName = categoryName.trim();
    if (!safeName) return;
    setError("");
    setSuccess("");
    try {
      await apiRequest("/api/categories", {
        method: "POST",
        body: JSON.stringify({
          name: safeName,
          ...(isDiod ? { scope: "master" } : {})
        })
      });
      setCategoryName("");
      setSuccess("Categoría guardada correctamente.");
      await Promise.all([loadCategories(), loadMasterStores()]);
    } catch (err) {
      setError(err.message || "No se pudo crear la categoría.");
    }
  };

  const updateCategory = async (category) => {
    const nextName = window.prompt("Nuevo nombre de la categoría", category.name || "");
    if (!nextName || !nextName.trim()) return;
    setError("");
    setSuccess("");
    try {
      await apiRequest(`/api/categories/${category._id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: nextName.trim(),
          colorBg: category.colorBg,
          colorText: category.colorText,
          active: category.active
        })
      });
      setSuccess("Categoría actualizada correctamente.");
      await Promise.all([loadCategories(), loadMasterStores()]);
    } catch (err) {
      setError(err.message || "No se pudo actualizar la categoría.");
    }
  };

  const removeCategory = async (category) => {
    const confirmed = window.confirm(`¿Eliminar la categoría “${category.name}”?`);
    if (!confirmed) return;
    setError("");
    setSuccess("");
    try {
      await apiRequest(`/api/categories/${category._id}`, { method: "DELETE" });
      setSuccess("Categoría eliminada correctamente.");
      await Promise.all([loadCategories(), loadMasterStores()]);
    } catch (err) {
      setError(err.message || "No se pudo eliminar la categoría.");
    }
  };

  const createMasterStore = async () => {
    const safeName = storeName.trim();
    if (!safeName) return;
    setError("");
    setSuccess("");
    try {
      await apiRequest("/api/kitchen/shopping/stores/master", {
        method: "POST",
        body: JSON.stringify({ name: safeName })
      });
      setStoreName("");
      setSuccess("Supermercado master guardado.");
      await loadMasterStores();
    } catch (err) {
      setError(err.message || "No se pudo guardar el supermercado master.");
    }
  };

  const editMasterStore = async (store) => {
    const nextName = window.prompt("Nombre del supermercado", store.name || "");
    if (!nextName || !nextName.trim()) return;
    setError("");
    try {
      await apiRequest(`/api/kitchen/shopping/stores/master/${store._id}`, {
        method: "PUT",
        body: JSON.stringify({ name: nextName.trim() })
      });
      await loadMasterStores();
    } catch (err) {
      setError(err.message || "No se pudo actualizar el supermercado.");
    }
  };

  const archiveMasterStore = async (store) => {
    if (!window.confirm(`¿Archivar ${store.name}?`)) return;
    setError("");
    try {
      await apiRequest(`/api/kitchen/shopping/stores/master/${store._id}`, { method: "DELETE" });
      await loadMasterStores();
    } catch (err) {
      setError(err.message || "No se pudo archivar el supermercado.");
    }
  };

  const moveMasterStore = async (store, direction) => {
    const sorted = [...masterStores];
    const index = sorted.findIndex((item) => item._id === store._id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) return;
    [sorted[index], sorted[targetIndex]] = [sorted[targetIndex], sorted[index]];
    try {
      await Promise.all(sorted.map((item, idx) => apiRequest(`/api/kitchen/shopping/stores/master/${item._id}`, {
        method: "PUT",
        body: JSON.stringify({ order: idx + 1 })
      })));
      await loadMasterStores();
    } catch (err) {
      setError(err.message || "No se pudo reordenar.");
    }
  };

  return (
    <KitchenLayout>
      <div className="kitchen-card kitchen-block-gap">
        <h2>Configuración</h2>
        <p className="kitchen-muted">Gestiona tu hogar y tus miembros.</p>
        {error ? <div className="kitchen-alert error">{error}</div> : null}
        {success ? <div className="kitchen-alert success">{success}</div> : null}
        {isDiodGlobalMode ? (
          <div className="kitchen-alert">Modo global DIOD activo: selecciona un hogar para configuración de miembros e invitaciones.</div>
        ) : null}

        <h3>Mi Hogar</h3>
        {loading ? <p className="kitchen-muted">Cargando miembros...</p> : null}
        {!loading ? (
          <ul className="kitchen-list">
            {members.map((member) => (
              <li key={member.id}>
                <strong>{member.displayName}</strong>{" "}
                {member.isPlaceholder ? "(comensal sin cuenta)" : member.email ? `(${member.email})` : ""}
              </li>
            ))}
            {members.length === 0 ? <li className="kitchen-muted">Todavía no hay miembros.</li> : null}
          </ul>
        ) : null}

        {canManageHousehold ? (
          <>
            <h3>Invitar miembros</h3>
            <div className="kitchen-actions">
              <button
                type="button"
                className="kitchen-button secondary"
                onClick={copyHouseholdCode}
                disabled={!householdCode}
              >
                Copiar código
              </button>
              <button type="button" className="kitchen-button" onClick={generateHouseholdCode}>
                {householdCode ? "Regenerar código" : "Generar código"}
              </button>
            </div>
            <p className="kitchen-muted">
              Código del hogar: <strong>{householdCode || "No generado"}</strong>
            </p>

            <div className="kitchen-actions">
              <button type="button" className="kitchen-button" onClick={generateInvite}>
                Generar enlace
              </button>
              <button
                type="button"
                className="kitchen-button secondary"
                onClick={copyInvite}
                disabled={!inviteLink}
              >
                Copiar enlace
              </button>
            </div>
            {inviteLink ? <p className="kitchen-muted">{inviteLink}</p> : null}

            {invitations.length > 0 ? (
              <ul className="kitchen-list">
                {invitations.map((invitation) => (
                  <li key={invitation.id}>
                    Invitación activa hasta {new Date(invitation.expiresAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            ) : null}

            <h3>Añadir comensal (sin cuenta)</h3>
            <div className="kitchen-actions">
              <input
                type="text"
                className="kitchen-input"
                placeholder="Nombre del comensal"
                value={placeholderName}
                onChange={(event) => setPlaceholderName(event.target.value)}
              />
              <button type="button" className="kitchen-button secondary" onClick={createPlaceholder}>
                Añadir comensal sin cuenta
              </button>
            </div>
          </>
        ) : null}

        {canManageCategories ? (
          <>
            <h3>{categoriesTitle}</h3>
            <p className="kitchen-muted">
              {isDiod
                ? "Gestiona las categorías globales del catálogo MASTER."
                : "Puedes crear categorías del hogar y sobrescribir las categorías master."}
            </p>
            <div className="kitchen-actions">
              <input
                type="text"
                className="kitchen-input"
                placeholder="Nombre de categoría"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
              />
              <button type="button" className="kitchen-button" onClick={createCategory} disabled={!categoryName.trim()}>
                Añadir categoría
              </button>
            </div>
            {categoriesLoading ? <p className="kitchen-muted">Cargando categorías...</p> : null}
            {!categoriesLoading ? (
              <ul className="kitchen-list">
                {categories.map((category) => (
                  <li key={category._id}>
                    <strong>{category.name}</strong> <span className="kitchen-muted">({category.scope || "household"})</span>
                    <div className="kitchen-actions" style={{ marginTop: 8 }}>
                      <button type="button" className="kitchen-button secondary" onClick={() => updateCategory(category)}>
                        Editar
                      </button>
                      <button type="button" className="kitchen-button secondary" onClick={() => removeCategory(category)}>
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
                {categories.length === 0 ? <li className="kitchen-muted">No hay categorías disponibles.</li> : null}
              </ul>
            ) : null}
          </>
        ) : null}


        {isDiod ? (
          <>
            <h3>Supermercados (master)</h3>
            <div className="kitchen-actions">
              <input
                type="text"
                className="kitchen-input"
                placeholder="Nombre de supermercado"
                value={storeName}
                onChange={(event) => setStoreName(event.target.value)}
              />
              <button type="button" className="kitchen-button" onClick={createMasterStore} disabled={!storeName.trim()}>
                Añadir supermercado
              </button>
            </div>
            {storesLoading ? <p className="kitchen-muted">Cargando supermercados...</p> : null}
            {!storesLoading ? (
              <ul className="kitchen-list">
                {masterStores.map((store) => (
                  <li key={store._id}>
                    <strong>{store.name}</strong> <span className="kitchen-muted">#{store.order ?? "-"} · {store.active ? "activo" : "archivado"}</span>
                    <div className="kitchen-actions" style={{ marginTop: 8 }}>
                      <button type="button" className="kitchen-button secondary" onClick={() => moveMasterStore(store, -1)}>↑</button>
                      <button type="button" className="kitchen-button secondary" onClick={() => moveMasterStore(store, 1)}>↓</button>
                      <button type="button" className="kitchen-button secondary" onClick={() => editMasterStore(store)}>Editar</button>
                      <button type="button" className="kitchen-button secondary" onClick={() => archiveMasterStore(store)}>Archivar</button>
                    </div>
                  </li>
                ))}
                {masterStores.length === 0 ? <li className="kitchen-muted">No hay supermercados master.</li> : null}
              </ul>
            ) : null}
          </>
        ) : null}

        <button type="button" className="kitchen-button secondary" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>
    </KitchenLayout>
  );
}
