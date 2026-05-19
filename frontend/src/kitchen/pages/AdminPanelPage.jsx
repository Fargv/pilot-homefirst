import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest, buildApiUrl, getToken, getPlansAdminConfig, savePlansAdminConfig } from "../api.js";
import { useAuth } from "../auth.jsx";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import Input from "../components/ui/Input.jsx";
import RecipeEditor from "../components/RecipeEditor.jsx";
import { normalizeIngredientName } from "../utils/normalize.js";
import { resolvePackCoverImageUrl } from "../utils/packImages.js";
import BitesIcon from "../components/BitesIcon.jsx";

// ── Shared admin-light button styles ─────────────────────────────────────────
const ABT = {  // admin button themes
  edit:   { fontSize: 12, padding: "3px 12px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#374151", cursor: "pointer", fontWeight: 500 },
  del:    { fontSize: 12, padding: "3px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff8f8", color: "#b42318", cursor: "pointer", fontWeight: 500 },
  save:   { fontSize: 13, padding: "7px 18px", borderRadius: 6, border: "none", background: "#4338ca", color: "#fff", cursor: "pointer", fontWeight: 600 },
  cancel: { fontSize: 13, padding: "7px 14px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#f1f5f9", color: "#374151", cursor: "pointer" },
  green:  { fontSize: 12, padding: "3px 12px", borderRadius: 6, border: "1px solid #86efac", background: "#f0fdf4", color: "#15803d", cursor: "pointer", fontWeight: 500 }
};

const PLANS = ["basic", "pro", "premium"];

const PLAN_BADGE = {
  free:    { label: "free",    color: "#6b7280" },
  basic:   { label: "basic",   color: "#3b82f6" },
  pro:     { label: "PRO",     color: "#7c3aed" },
  premium: { label: "PREMIUM", color: "#d97706" }
};

const STATUS_BADGE = {
  inactive: { label: "inactivo", color: "#6b7280" },
  trial:    { label: "trial",    color: "#0891b2" },
  active:   { label: "activo",   color: "#16a34a" },
  pending:  { label: "pendiente",color: "#d97706" }
};

function PlanBadge({ plan }) {
  const b = PLAN_BADGE[plan] || PLAN_BADGE.basic;
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: "999px",
      background: b.color,
      color: "#fff",
      fontSize: "11px",
      fontWeight: 700,
      letterSpacing: "0.05em",
      textTransform: "uppercase"
    }}>
      {b.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const b = STATUS_BADGE[status] || STATUS_BADGE.inactive;
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: "999px",
      border: `1px solid ${b.color}`,
      color: b.color,
      fontSize: "11px",
      fontWeight: 600,
      textTransform: "lowercase"
    }}>
      {b.label}
    </span>
  );
}

function HouseholdRow({ household, activeHouseholdId, onSetActive, onChangePlan }) {
  const [localPlan, setLocalPlan] = useState(household.subscriptionPlan || "basic");
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState("");

  useEffect(() => {
    setLocalPlan(household.subscriptionPlan || "basic");
  }, [household.subscriptionPlan]);

  const isActive = String(household.id) === String(activeHouseholdId || "");

  const applyPlan = async (plan) => {
    setSaving(true);
    setRowError("");
    try {
      await onChangePlan(household.id, plan);
      setLocalPlan(plan);
    } catch (err) {
      setRowError(err.message || "Error al cambiar plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr style={{ background: isActive ? "rgba(99,102,241,0.06)" : undefined }}>
      <td style={{ fontWeight: isActive ? 700 : 400 }}>
        {household.name}
        {isActive ? <span style={{ marginLeft: 6, fontSize: 11, color: "#6366f1" }}>● activo</span> : null}
      </td>
      <td style={{ textAlign: "center" }}><PlanBadge plan={localPlan} /></td>
      <td style={{ textAlign: "center" }}><StatusBadge status={household.subscriptionStatus} /></td>
      <td style={{ textAlign: "center" }}>{household.memberCount || 0}</td>
      <td>
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <select
            className="kitchen-select"
            style={{ fontSize: 13, padding: "2px 6px" }}
            value={localPlan}
            disabled={saving}
            onChange={(e) => setLocalPlan(e.target.value)}
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <Button
            variant="primary"
            style={{ fontSize: 12, padding: "4px 10px" }}
            disabled={saving || localPlan === household.subscriptionPlan}
            onClick={() => applyPlan(localPlan)}
          >
            {saving ? "..." : "Aplicar"}
          </Button>
          <Button
            variant="secondary"
            style={{ fontSize: 12, padding: "4px 10px" }}
            disabled={saving}
            onClick={() => applyPlan("off")}
            title="Desactivar suscripción"
          >
            Off
          </Button>
          <Button
            variant="secondary"
            style={{ fontSize: 12, padding: "4px 10px" }}
            disabled={saving}
            onClick={() => onSetActive(isActive ? null : household.id)}
          >
            {isActive ? "Deselect" : "Usar"}
          </Button>
        </div>
        {rowError ? <div style={{ color: "red", fontSize: 12, marginTop: 2 }}>{rowError}</div> : null}
      </td>
    </tr>
  );
}

function HouseholdsSection({ activeHouseholdId, onActiveHouseholdChange }) {
  const [households, setHouseholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/api/admin/households");
      setHouseholds(data.households || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los hogares.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return households;
    return households.filter((h) => h.name.toLowerCase().includes(needle));
  }, [households, query]);

  const onChangePlan = async (householdId, plan) => {
    if (plan === "off") {
      const data = await apiRequest("/api/admin/subscription/deactivate", {
        method: "POST",
        body: JSON.stringify({ householdId })
      });
      setHouseholds((prev) => prev.map((h) =>
        String(h.id) === String(householdId)
          ? { ...h, subscriptionPlan: data.household.subscriptionPlan, subscriptionStatus: data.household.subscriptionStatus }
          : h
      ));
    } else {
      const data = await apiRequest("/api/admin/subscription/activate", {
        method: "POST",
        body: JSON.stringify({ householdId, plan })
      });
      setHouseholds((prev) => prev.map((h) =>
        String(h.id) === String(householdId)
          ? { ...h, subscriptionPlan: data.household.subscriptionPlan, subscriptionStatus: data.household.subscriptionStatus }
          : h
      ));
    }
  };

  const onSetActive = async (householdId) => {
    await apiRequest("/api/admin/active-household", {
      method: "POST",
      body: JSON.stringify({ activeHouseholdId: householdId || null })
    });
    onActiveHouseholdChange(householdId || null);
  };

  return (
    <Card className="kitchen-block-gap">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 className="kitchen-title-no-margin">Households</h2>
          <p className="kitchen-muted">{households.length} hogares registrados</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Input
            id="hh-search"
            placeholder="Buscar household..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 200 }}
          />
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? "..." : "Recargar"}
          </Button>
        </div>
      </div>

      {error ? <div className="kitchen-alert error">{error}</div> : null}

      {loading ? (
        <p className="kitchen-muted">Cargando...</p>
      ) : filtered.length === 0 ? (
        <p className="kitchen-muted">No hay hogares.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="kitchen-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th style={{ textAlign: "center" }}>Plan</th>
                <th style={{ textAlign: "center" }}>Estado</th>
                <th style={{ textAlign: "center" }}>Miembros</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => (
                <HouseholdRow
                  key={h.id}
                  household={h}
                  activeHouseholdId={activeHouseholdId}
                  onSetActive={onSetActive}
                  onChangePlan={onChangePlan}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function UsersSection() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    apiRequest("/api/admin/users")
      .then((data) => setUsers(data.users || []))
      .catch((err) => setError(err.message || "No se pudieron cargar usuarios."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) =>
      (u.email || "").toLowerCase().includes(needle) ||
      (u.displayName || "").toLowerCase().includes(needle)
    );
  }, [users, query]);

  return (
    <Card className="kitchen-block-gap">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 className="kitchen-title-no-margin">Usuarios</h2>
          <p className="kitchen-muted">{users.length} usuarios registrados</p>
        </div>
        <Input
          id="user-search"
          placeholder="Buscar usuario..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 200 }}
        />
      </div>
      {error ? <div className="kitchen-alert error">{error}</div> : null}
      {loading ? (
        <p className="kitchen-muted">Cargando...</p>
      ) : filtered.length === 0 ? (
        <p className="kitchen-muted">Sin resultados.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="kitchen-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Global</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>{u.displayName || "—"}</td>
                  <td style={{ fontSize: 13, color: "#6b7280" }}>{u.email || "—"}</td>
                  <td>{u.role || "member"}</td>
                  <td>{u.globalRole || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function QuickSubscriptionPanel() {
  const [householdId, setHouseholdId] = useState("");
  const [plan, setPlan] = useState("pro");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const apply = async (e) => {
    e.preventDefault();
    if (!householdId.trim()) { setError("Introduce el ID del household."); return; }
    setSaving(true);
    setError("");
    setResult(null);
    try {
      let data;
      if (plan === "off") {
        data = await apiRequest("/api/admin/subscription/deactivate", {
          method: "POST",
          body: JSON.stringify({ householdId: householdId.trim() })
        });
      } else {
        data = await apiRequest("/api/admin/subscription/activate", {
          method: "POST",
          body: JSON.stringify({ householdId: householdId.trim(), plan })
        });
      }
      setResult(data.household);
    } catch (err) {
      setError(err.message || "Error al aplicar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="kitchen-block-gap">
      <h2 className="kitchen-title-no-margin">Cambio rápido de suscripción</h2>
      <p className="kitchen-muted">Introduce el ID del household directamente si ya lo tienes.</p>
      <form onSubmit={apply} className="kitchen-form kitchen-form-compact">
        <div className="kitchen-grid">
          <Input
            id="quick-hh-id"
            label="Household ID (MongoDB ObjectId)"
            value={householdId}
            onChange={(e) => setHouseholdId(e.target.value)}
            placeholder="6649a..."
          />
          <label>
            <span className="kitchen-label">Plan</span>
            <select
              className="kitchen-select"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            >
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              <option value="off">— desactivar</option>
            </select>
          </label>
        </div>
        {error ? <div className="kitchen-alert error">{error}</div> : null}
        {result ? (
          <div className="kitchen-alert success">
            ✓ {result.name} → <strong>{result.subscriptionPlan}</strong> ({result.subscriptionStatus})
          </div>
        ) : null}
        <div className="kitchen-actions">
          <Button type="submit" disabled={saving}>{saving ? "Aplicando..." : "Aplicar"}</Button>
        </div>
      </form>
    </Card>
  );
}

// ─── Master Catalog ──────────────────────────────────────────────────────────

function DishForm({ item, sidedish, dishCategories, onSave, onCancel }) {
  const isEdit = Boolean(item._id);

  // ── Basic fields ────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: item.name || "",
    active: item.active !== false,
    isDinner: Boolean(item.isDinner),
    special: Boolean(item.special),
    allowRandom: item.allowRandom !== false,
    dishCategoryId: item.dishCategoryId?._id || item.dishCategoryId || ""
  });

  // ── Dish-level ingredients (shopping list) ──────────────────────────────────
  const [dishIngredients, setDishIngredients] = useState(
    (item.ingredients || []).map((i) => ({
      ingredientId: i.ingredientId,
      displayName: i.displayName || i.name || "",
      canonicalName: i.canonicalName || ""
    }))
  );
  const [ingSearch, setIngSearch] = useState("");
  const [ingResults, setIngResults] = useState([]);
  const [ingSearching, setIngSearching] = useState(false);
  const [showCreateIng, setShowCreateIng] = useState(false);
  const [newIngName, setNewIngName] = useState("");
  const [createIngErr, setCreateIngErr] = useState("");
  const [creatingIng, setCreatingIng] = useState(false);
  const ingDropdownRef = useRef(null);

  // ── Recipe ──────────────────────────────────────────────────────────────────
  const [showRecipe, setShowRecipe] = useState(false);
  const [recipe, setRecipe] = useState({
    ingredients: item.recipe?.ingredients || [],
    steps: item.recipe?.steps ?? null,
    servings: item.recipe?.servings ?? null
  });

  // ── Save state ──────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Ingredient search ───────────────────────────────────────────────────────
  useEffect(() => {
    const q = ingSearch.trim();
    if (!q) { setIngResults([]); return; }
    const t = setTimeout(async () => {
      setIngSearching(true);
      try {
        const d = await apiRequest(`/api/kitchenIngredients?global=1&q=${encodeURIComponent(q)}&limit=10`);
        setIngResults(d.ingredients || []);
      } catch { setIngResults([]); } finally { setIngSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [ingSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e) => {
      if (ingDropdownRef.current && !ingDropdownRef.current.contains(e.target)) setIngSearch("");
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const addIngredient = (ing) => {
    const name = ing.displayName || ing.canonicalName;
    if (dishIngredients.some((i) => (i.displayName || "").toLowerCase() === name.toLowerCase())) return;
    setDishIngredients((prev) => [...prev, {
      ingredientId: ing._id,
      displayName: name,
      canonicalName: ing.canonicalName || name.toLowerCase()
    }]);
    setIngSearch(""); setIngResults([]);
  };

  const createAndAdd = async () => {
    if (!newIngName.trim() || creatingIng) return;
    setCreatingIng(true); setCreateIngErr("");
    try {
      const d = await apiRequest("/api/kitchenIngredients", {
        method: "POST",
        body: JSON.stringify({ name: newIngName.trim(), scope: "master" })
      });
      const ing = d.ingredient;
      addIngredient({ _id: ing._id, displayName: ing.displayName || ing.canonicalName, canonicalName: ing.canonicalName });
      setNewIngName(""); setShowCreateIng(false);
    } catch (err) { setCreateIngErr(err.message || "Error al crear."); }
    finally { setCreatingIng(false); }
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("El nombre es obligatorio."); return; }
    setSaving(true); setError("");
    try {
      await onSave({ _id: item._id, ...form, ingredients: dishIngredients, recipe });
    } catch (err) { setError(err.message || "Error al guardar."); }
    finally { setSaving(false); }
  };

  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const dishIngredientNames = dishIngredients.map((i) => (i.displayName || "").toLowerCase());

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #c7d2fe", borderRadius: 10, padding: 20, marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 14px", fontSize: 15, color: "#1e293b", fontWeight: 700 }}>
        {isEdit ? `✏️ Editar: ${item.name}` : `➕ Nuevo ${sidedish ? "guarnición" : "plato"} master`}
      </h4>
      <form onSubmit={handleSubmit}>

        {/* ── Basic info ── */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Información básica</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 200px" }}>
              <Input id="df-name" label="Nombre" value={form.name} onChange={set("name")} required />
            </div>
            {!sidedish && (
              <div style={{ flex: "1 1 160px" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span className="kitchen-label">Categoría de plato</span>
                  <select className="kitchen-select" value={form.dishCategoryId} onChange={set("dishCategoryId")}>
                    <option value="">Sin categoría</option>
                    {dishCategories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
            {[
              ["active", "Activo"],
              ...(!sidedish ? [["isDinner", "Es cena"]] : []),
              ["special", "Especial (no random)"],
              ["allowRandom", "Permitir random"]
            ].map(([key, label]) => (
              <label key={key} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", color: "#374151" }}>
                <input type="checkbox" checked={Boolean(form[key])} onChange={set(key)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* ── Dish ingredients ── */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Ingredientes del plato <span style={{ fontWeight: 400, color: "#9ca3af", fontSize: 11 }}>(lista de la compra)</span>
          </div>

          {/* Chips */}
          {dishIngredients.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {dishIngredients.map((ing, idx) => (
                <span key={idx} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: "#eff6ff", border: "1px solid #bfdbfe",
                  color: "#1d4ed8", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 500
                }}>
                  {ing.displayName}
                  <button
                    type="button"
                    onClick={() => setDishIngredients((prev) => prev.filter((_, i) => i !== idx))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#93c5fd", padding: 0, marginLeft: 2, fontSize: 15, lineHeight: 1 }}
                  >×</button>
                </span>
              ))}
            </div>
          )}

          {/* Search */}
          <div ref={ingDropdownRef} style={{ position: "relative" }}>
            <input
              type="text"
              value={ingSearch}
              onChange={(e) => { setIngSearch(e.target.value); setShowCreateIng(false); }}
              placeholder="🔍 Buscar ingrediente para añadir..."
              style={{ width: "100%", boxSizing: "border-box", padding: "7px 11px", fontSize: 13, borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", outline: "none" }}
            />
            {ingSearch.trim() && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, marginTop: 2,
                background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                boxShadow: "0 6px 20px rgba(0,0,0,0.12)", zIndex: 50, maxHeight: 200, overflowY: "auto"
              }}>
                {ingSearching && <div style={{ padding: "10px 14px", fontSize: 12, color: "#9ca3af" }}>Buscando...</div>}
                {!ingSearching && ingResults.map((ing) => (
                  <button
                    key={ing._id}
                    type="button"
                    onMouseDown={() => addIngredient(ing)}
                    style={{ width: "100%", textAlign: "left", padding: "8px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "#1e293b", display: "block" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#f1f5f9"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                  >
                    {ing.displayName || ing.canonicalName}
                  </button>
                ))}
                {!ingSearching && ingResults.length === 0 && (
                  <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>Sin resultados</span>
                    <button
                      type="button"
                      onMouseDown={() => { setShowCreateIng(true); setNewIngName(ingSearch.trim()); setIngSearch(""); setIngResults([]); }}
                      style={ABT.green}
                    >+ Crear "{ingSearch.trim()}"</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Create inline form */}
          {showCreateIng && (
            <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", padding: 10, background: "#f0fdf4", borderRadius: 6, border: "1px solid #86efac" }}>
              <input
                type="text"
                value={newIngName}
                onChange={(e) => setNewIngName(e.target.value)}
                placeholder="Nombre del ingrediente"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createAndAdd(); } }}
                style={{ flex: 1, padding: "5px 8px", fontSize: 13, borderRadius: 5, border: "1px solid #d1d5db", outline: "none" }}
              />
              <button type="button" onClick={createAndAdd} disabled={creatingIng || !newIngName.trim()}
                style={{ ...ABT.save, padding: "5px 12px", fontSize: 12, background: "#16a34a" }}>
                {creatingIng ? "..." : "Crear y añadir"}
              </button>
              <button type="button" onClick={() => setShowCreateIng(false)}
                style={{ ...ABT.del, padding: "5px 10px" }}>✕</button>
              {createIngErr && <span style={{ fontSize: 11, color: "#dc2626" }}>{createIngErr}</span>}
            </div>
          )}
        </div>

        {/* ── Recipe ── */}
        <div style={{ marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setShowRecipe((v) => !v)}
            style={{
              fontSize: 13, fontWeight: 600, color: showRecipe ? "#3730a3" : "#4338ca",
              background: showRecipe ? "#e0e7ff" : "#eef2ff",
              border: "1px solid #c7d2fe", borderRadius: 7,
              padding: "7px 16px", cursor: "pointer",
              width: "100%", textAlign: "left"
            }}
          >
            {showRecipe ? "▲ Ocultar receta" : "▼ Editar receta"}
            {(item.recipe?.steps || (item.recipe?.ingredients?.length > 0)) && (
              <span style={{ marginLeft: 8, fontSize: 11, background: "#818cf8", color: "#fff", borderRadius: 4, padding: "1px 6px" }}>tiene receta</span>
            )}
          </button>

          {showRecipe && (
            <div style={{ background: "#fff", border: "1px solid #c7d2fe", borderRadius: "0 0 8px 8px", padding: 14, borderTop: "none" }}>
              <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>
                  Raciones:
                </label>
                <input
                  type="number"
                  min={1}
                  value={recipe.servings ?? ""}
                  onChange={(e) => setRecipe((p) => ({ ...p, servings: e.target.value ? Number(e.target.value) : null }))}
                  style={{ width: 70, padding: "4px 8px", borderRadius: 5, border: "1px solid #d1d5db", fontSize: 13 }}
                />
              </div>
              <RecipeEditor
                recipeIngredients={recipe.ingredients || []}
                recipeSteps={recipe.steps}
                recipeServings={recipe.servings}
                dishIngredientNames={dishIngredientNames}
                onAddIngredientToDish={(name) => {
                  if (!name) return;
                  if (dishIngredients.some((i) => (i.displayName || "").toLowerCase() === name.toLowerCase())) return;
                  setDishIngredients((prev) => [...prev, { displayName: name, canonicalName: name.toLowerCase() }]);
                }}
                onChange={setRecipe}
                readOnly={false}
              />
            </div>
          )}
        </div>

        {error ? <div className="kitchen-alert error" style={{ marginBottom: 10 }}>{error}</div> : null}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving} style={{ ...ABT.save, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear"}
          </button>
          <button type="button" onClick={onCancel} style={ABT.cancel}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function MasterDishesPanel({ sidedish, dishCategories }) {
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editItem, setEditItem] = useState(null);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const url = `/api/kitchen/dishes?global=1&includeInactive=true${sidedish ? "&sidedish=true" : ""}`;
      const data = await apiRequest(url);
      setDishes(data.dishes || []);
    } catch (err) {
      setError(err.message || "Error al cargar.");
    } finally {
      setLoading(false);
    }
  }, [sidedish]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? dishes.filter((d) => d.name.toLowerCase().includes(q)) : dishes;
  }, [dishes, search]);

  const handleSave = async (form) => {
    const body = {
      name: form.name,
      scope: "master",
      sidedish,
      active: form.active,
      isDinner: form.isDinner,
      special: form.special,
      allowRandom: form.allowRandom,
      dishCategoryId: form.dishCategoryId || null,
      ingredients: (form.ingredients || []).map((i) => ({
        displayName: i.displayName || i.name || "",
        canonicalName: i.canonicalName || (i.displayName || i.name || "").toLowerCase(),
        ...(i.ingredientId ? { ingredientId: i.ingredientId } : {})
      }))
    };

    let dishId = form._id;
    if (form._id) {
      const result = await apiRequest(`/api/kitchen/dishes/${form._id}`, { method: "PUT", body: JSON.stringify(body) });
      dishId = result.dish?._id || form._id;
    } else {
      const result = await apiRequest("/api/kitchen/dishes", { method: "POST", body: JSON.stringify(body) });
      dishId = result.dish?._id;
    }

    // Save recipe separately via /recipe endpoint
    if (form.recipe && dishId) {
      await apiRequest(`/api/kitchen/dishes/${dishId}/recipe`, {
        method: "PUT",
        body: JSON.stringify(form.recipe)
      });
    }

    setEditItem(null);
    await load();
  };

  const handleDelete = async (dish) => {
    if (!window.confirm(`¿Eliminar "${dish.name}"? Se ocultará para todos los hogares.`)) return;
    setDeletingId(dish._id);
    try {
      await apiRequest(`/api/kitchen/dishes/${dish._id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message || "Error al eliminar.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Input
          id="dish-search"
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 200, fontSize: 13 }}
        />
        <button type="button" style={{ ...ABT.save, padding: "6px 14px", fontSize: 13 }} onClick={() => setEditItem({})}>
          + Nuevo {sidedish ? "guarnición" : "plato"}
        </button>
        <button type="button" style={ABT.edit} onClick={load} disabled={loading}>
          {loading ? "..." : "↺ Recargar"}
        </button>
      </div>

      {editItem !== null && (
        <DishForm
          item={editItem}
          sidedish={sidedish}
          dishCategories={dishCategories}
          onSave={handleSave}
          onCancel={() => setEditItem(null)}
        />
      )}

      {error ? <div className="kitchen-alert error">{error}</div> : null}

      {loading ? <p className="kitchen-muted">Cargando...</p> : filtered.length === 0 ? (
        <p className="kitchen-muted">No hay {sidedish ? "guarniciones" : "platos"} master.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="kitchen-table">
            <thead>
              <tr>
                <th>Nombre</th>
                {!sidedish && <th>Categoría</th>}
                <th style={{ textAlign: "center" }}>Activo</th>
                {!sidedish && <th style={{ textAlign: "center" }}>Cena</th>}
                <th style={{ textAlign: "center" }}>Special</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((dish) => (
                <tr key={dish._id} style={{ opacity: dish.active === false ? 0.5 : 1 }}>
                  <td style={{ fontWeight: 500 }}>{dish.name}</td>
                  {!sidedish && <td style={{ fontSize: 12, color: "#6b7280" }}>{dish.dishCategoryId?.name || "—"}</td>}
                  <td style={{ textAlign: "center" }}>{dish.active !== false ? "✓" : "✗"}</td>
                  {!sidedish && <td style={{ textAlign: "center" }}>{dish.isDinner ? "✓" : "—"}</td>}
                  <td style={{ textAlign: "center" }}>{dish.special ? "★" : "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" style={ABT.edit} onClick={() => setEditItem(dish)}>Editar</button>
                      <button
                        type="button"
                        style={{ ...ABT.del, opacity: deletingId === dish._id ? 0.6 : 1 }}
                        disabled={deletingId === dish._id}
                        onClick={() => handleDelete(dish)}
                      >
                        {deletingId === dish._id ? "..." : "Eliminar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="kitchen-muted" style={{ fontSize: 12, marginTop: 6 }}>{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</p>
        </div>
      )}
    </div>
  );
}

function IngredientForm({ item, ingredientCategories, onSave, onCancel }) {
  const isEdit = Boolean(item._id);
  const [form, setForm] = useState({
    name: item.name || "",
    active: item.active !== false,
    categoryId: item.categoryId?._id || item.categoryId || ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("El nombre es obligatorio."); return; }
    setSaving(true);
    setError("");
    try {
      await onSave({ _id: item._id, ...form });
    } catch (err) {
      setError(err.message || "Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #c7d2fe", borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 12px", fontSize: 14, color: "#1e293b" }}>
        {isEdit ? `Editar: ${item.name}` : "Nuevo ingrediente master"}
      </h4>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <Input id="if-name" label="Nombre" value={form.name} onChange={set("name")} required />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span className="kitchen-label">Categoría</span>
              <select className="kitchen-select" value={form.categoryId} onChange={set("categoryId")}>
                <option value="">Sin categoría</option>
                {ingredientCategories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <label style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 13, cursor: "pointer", paddingBottom: 4 }}>
            <input type="checkbox" checked={Boolean(form.active)} onChange={set("active")} />
            Activo
          </label>
        </div>
        {error ? <div className="kitchen-alert error" style={{ marginBottom: 8 }}>{error}</div> : null}
        <div style={{ display: "flex", gap: 6 }}>
          <button type="submit" disabled={saving} style={{ ...ABT.save, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear"}
          </button>
          <button type="button" onClick={onCancel} style={ABT.cancel}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function MasterIngredientsPanel({ ingredientCategories }) {
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editItem, setEditItem] = useState(null);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest(`/api/kitchenIngredients?global=1&limit=0${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ""}`);
      setIngredients(data.ingredients || []);
    } catch (err) {
      setError(err.message || "Error al cargar.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const handleSave = async (form) => {
    if (form._id) {
      await apiRequest(`/api/kitchenIngredients/${form._id}`, {
        method: "PUT",
        body: JSON.stringify({ name: form.name, categoryId: form.categoryId || undefined, active: form.active })
      });
    } else {
      await apiRequest("/api/kitchenIngredients", {
        method: "POST",
        body: JSON.stringify({ name: form.name, categoryId: form.categoryId || undefined, scope: "master" })
      });
    }
    setEditItem(null);
    await load();
  };

  const handleDelete = async (ingredient) => {
    if (!window.confirm(`¿Eliminar "${ingredient.name}"? Se desactivará para todos los hogares.`)) return;
    setDeletingId(ingredient._id);
    try {
      await apiRequest(`/api/kitchenIngredients/${ingredient._id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message || "Error al eliminar.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Input
          id="ing-search"
          placeholder="Buscar ingrediente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 220, fontSize: 13 }}
        />
        <button type="button" style={{ ...ABT.save, padding: "6px 14px", fontSize: 13 }} onClick={() => setEditItem({})}>+ Nuevo ingrediente</button>
        <button type="button" style={ABT.edit} onClick={load} disabled={loading}>{loading ? "..." : "↺ Recargar"}</button>
      </div>

      {editItem !== null && (
        <IngredientForm
          item={editItem}
          ingredientCategories={ingredientCategories}
          onSave={handleSave}
          onCancel={() => setEditItem(null)}
        />
      )}

      {error ? <div className="kitchen-alert error">{error}</div> : null}

      {loading ? <p className="kitchen-muted">Cargando...</p> : ingredients.length === 0 ? (
        <p className="kitchen-muted">No hay ingredientes master{search.trim() ? " con ese criterio" : ""}.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="kitchen-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Categoría</th>
                <th style={{ textAlign: "center" }}>Activo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ing) => (
                <tr key={ing._id} style={{ opacity: ing.active === false ? 0.45 : 1 }}>
                  <td style={{ fontWeight: 500 }}>{ing.name}</td>
                  <td style={{ fontSize: 12, color: "#6b7280" }}>{ing.categoryId?.name || "—"}</td>
                  <td style={{ textAlign: "center" }}>{ing.active !== false ? "✓" : "✗"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" style={ABT.edit} onClick={() => setEditItem(ing)}>Editar</button>
                      <button
                        type="button"
                        style={{ ...ABT.del, opacity: deletingId === ing._id ? 0.6 : 1 }}
                        disabled={deletingId === ing._id}
                        onClick={() => handleDelete(ing)}
                      >
                        {deletingId === ing._id ? "..." : "Eliminar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="kitchen-muted" style={{ fontSize: 12, marginTop: 6 }}>{ingredients.length} ingrediente{ingredients.length !== 1 ? "s" : ""}</p>
        </div>
      )}
    </div>
  );
}

function MasterCatalogSection() {
  const [subTab, setSubTab] = useState("dishes");
  const [dishCategories, setDishCategories] = useState([]);
  const [ingredientCategories, setIngredientCategories] = useState([]);

  useEffect(() => {
    apiRequest("/api/kitchen/dish-categories")
      .then((d) => setDishCategories(d.categories || []))
      .catch(() => {});
    apiRequest("/api/categories")
      .then((d) => setIngredientCategories(d.categories || []))
      .catch(() => {});
  }, []);

  const subTabs = [
    { key: "dishes", label: "Platos" },
    { key: "sides", label: "Guarniciones" },
    { key: "ingredients", label: "Ingredientes" }
  ];

  return (
    <Card className="kitchen-block-gap">
      <div style={{ marginBottom: 16 }}>
        <h2 className="kitchen-title-no-margin">Catálogo Master</h2>
        <p className="kitchen-muted">Platos, guarniciones e ingredientes que aparecen en todos los hogares. Los cambios aquí afectan a todo el mundo.</p>
      </div>

      <div style={{
        display: "inline-flex", background: "#f1f5f9", borderRadius: 8, padding: 3, gap: 2, marginBottom: 20
      }}>
        {subTabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            style={{
              padding: "5px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: subTab === key ? "#fff" : "transparent",
              color: subTab === key ? "#1e293b" : "#64748b",
              boxShadow: subTab === key ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === "dishes" && <MasterDishesPanel sidedish={false} dishCategories={dishCategories} />}
      {subTab === "sides" && <MasterDishesPanel sidedish={true} dishCategories={dishCategories} />}
      {subTab === "ingredients" && <MasterIngredientsPanel ingredientCategories={ingredientCategories} />}
    </Card>
  );
}

// ─── Catalog Packs Admin ─────────────────────────────────────────────────────

const INCLUDED_PLANS_OPTIONS = ["basic", "pro", "premium"];

const FS = { width: "100%", boxSizing: "border-box", padding: "5px 8px", fontSize: 12, borderRadius: 4, border: "1px solid #d1d5db" };

function IngredientSearchInput({ value, onChange }) {
  const [query, setQuery] = useState(value?.displayName || "");
  const [results, setResults] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [ingCategories, setIngCategories] = useState([]);
  const [createName, setCreateName] = useState(value?.displayName || "");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [duplicateIngredient, setDuplicateIngredient] = useState(null);
  const timerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    apiRequest("/api/kitchen/catalog/master/ingredient-categories")
      .then((d) => setIngCategories(d.categories || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onDown = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) { setResults([]); setShowCreate(false); } };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const search = (q) => {
    setQuery(q);
    setCreateError("");
    setCreateSuccess("");
    setDuplicateIngredient(null);
    clearTimeout(timerRef.current);
    if (!q.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const data = await apiRequest(`/api/kitchen/catalog/master/ingredients?q=${encodeURIComponent(q)}`);
        setResults(data.ingredients || []);
      } catch { setResults([]); }
    }, 280);
  };

  const select = (ing) => {
    onChange({ displayName: ing.name, canonicalName: ing.canonicalName, ingredientId: ing.id, categoryId: ing.categoryId || null });
    setQuery(ing.name);
    setResults([]);
    setShowCreate(false);
    setCreateError("");
    setDuplicateIngredient(null);
    setCreateSuccess(`Vinculado a ${ing.name}`);
  };

  const createNew = async () => {
    const name = createName.trim();
    setCreateError("");
    setCreateSuccess("");
    setDuplicateIngredient(null);
    if (!name) { setCreateError("El nombre del ingrediente es obligatorio."); return; }
    if (!newCategoryId) { setCreateError("Selecciona una categoria para continuar."); return; }
    setCreating(true);
    try {
      const data = await apiRequest("/api/kitchen/catalog/master/ingredients", { method: "POST", body: JSON.stringify({ name, categoryId: newCategoryId }) });
      select(data.ingredient);
      setCreateSuccess(`Ingrediente creado y vinculado a ${data.ingredient.name}`);
      setNewCategoryId("");
    } catch (e) {
      const existing = e?.body?.ingredient;
      if (e?.body?.code === "DUPLICATE_MASTER_INGREDIENT" && existing) {
        setDuplicateIngredient(existing);
        setCreateError(`Ya existe "${existing.name}" con el mismo nombre normalizado. Puedes vincularlo sin crear duplicados.`);
      } else {
        setCreateError(e.message || "No se pudo crear el ingrediente.");
      }
    } finally {
      setCreating(false);
    }
  };

  const isLinked = Boolean(value?.ingredientId);
  const hasName = Boolean(value?.canonicalName);
  const isSelected = isLinked || results.some((ing) => String(ing.id) === String(value?.ingredientId || ""));
  const borderColor = isLinked ? "#6366f1" : (hasName ? "#f59e0b" : "#d1d5db");
  const bgColor = isLinked ? "#f5f3ff" : (hasName ? "#fffbeb" : "#fff");

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        style={{ ...FS, borderColor, background: bgColor }}
        placeholder="Buscar ingrediente master..."
        value={query}
        onChange={(e) => { search(e.target.value); if (isLinked || hasName) onChange({ displayName: e.target.value, canonicalName: "", ingredientId: null }); }}
      />
      {isLinked && <span style={{ fontSize: 10, color: "#6366f1", display: "block", marginTop: 1 }}>✓ {value.canonicalName}</span>}
      {!isLinked && hasName && <span style={{ fontSize: 10, color: "#b45309", display: "block", marginTop: 1 }}>⚠ sin vincular al master</span>}
      {createSuccess ? <span style={{ fontSize: 10, color: "#047857", display: "block", marginTop: 2 }}>{createSuccess}</span> : null}
      {results.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, zIndex: 20, maxHeight: 160, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
          {results.map((ing) => (
            <div key={String(ing.id)} onMouseDown={() => select(ing)}
              style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid #f3f4f6" }}>
              <strong>{ing.name}</strong> <span style={{ color: "#9ca3af", fontSize: 11 }}>{ing.canonicalName}</span>
            </div>
          ))}
        </div>
      )}
      {query.trim() && results.length === 0 && !isSelected && !showCreate && (
        <button type="button" onMouseDown={(event) => { event.preventDefault(); setCreateName(query.trim()); setShowCreate(true); setCreateError(""); setCreateSuccess(""); setDuplicateIngredient(null); }}
          style={{ fontSize: 11, marginTop: 3, padding: "2px 8px", background: "#fef3c7", border: "1px solid #fbbf24", color: "#92400e", borderRadius: 4, cursor: "pointer", display: "block" }}>
          No encontrado — Crear &quot;{query}&quot;
        </button>
      )}
      {showCreate && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: 8, marginTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Crear ingrediente master</div>
          <input
            style={{ ...FS, marginBottom: 4 }}
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Nombre del ingrediente"
          />
          <select style={{ ...FS, marginBottom: 4 }} value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value)}>
            <option value="">— Categoría de ingrediente —</option>
            {ingCategories.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.name}</option>)}
          </select>
          {createError ? <div style={{ color: "#b42318", fontSize: 11, marginBottom: 5 }}>{createError}</div> : null}
          {duplicateIngredient ? (
            <button type="button" onMouseDown={(event) => { event.preventDefault(); select(duplicateIngredient); }}
              style={{ fontSize: 11, padding: "3px 10px", background: "#fff", color: "#4338ca", border: "1px solid #c7d2fe", borderRadius: 4, cursor: "pointer", marginBottom: 5 }}>
              Vincular a {duplicateIngredient.name}
            </button>
          ) : null}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" disabled={creating || !newCategoryId || !createName.trim()} onMouseDown={(event) => { event.preventDefault(); createNew(); }}
              style={{ fontSize: 11, padding: "3px 10px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", opacity: (!newCategoryId || !createName.trim()) ? 0.5 : 1 }}>
              {creating ? "Creando..." : "Crear"}
            </button>
            <button type="button" onMouseDown={(event) => { event.preventDefault(); setShowCreate(false); setCreateError(""); setDuplicateIngredient(null); }}
              style={{ fontSize: 11, padding: "3px 8px", background: "transparent", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DishTemplateEditor({ dishes, onChange, defaults = {}, compositionLocked = false }) {
  const [expanded, setExpanded] = useState(null);
  const [dishCategories, setDishCategories] = useState([]);

  useEffect(() => {
    apiRequest("/api/kitchen/dish-categories")
      .then((d) => setDishCategories(d.categories || []))
      .catch(() => {});
  }, []);

  const addDish = () => {
    const next = [...dishes, {
      name: "", teaser: "", sidedish: false, isDinner: false,
      special: Boolean(defaults.defaultSpecial),
      allowRandom: defaults.defaultAllowRandom !== false,
      dishCategoryId: null, ingredients: [],
      recipe: { ingredients: [], steps: null, servings: null }
    }];
    onChange(next);
    setExpanded(next.length - 1);
  };

  const removeDish = (i) => {
    onChange(dishes.filter((_, idx) => idx !== i));
    setExpanded((ex) => ex === i ? null : ex > i ? ex - 1 : ex);
  };

  const updateDish = (i, updates) => onChange(dishes.map((d, idx) => idx === i ? { ...d, ...updates } : d));

  const addIng = (i) => updateDish(i, { ingredients: [...dishes[i].ingredients, { displayName: "", canonicalName: "" }] });
  const removeIng = (i, j) => updateDish(i, { ingredients: dishes[i].ingredients.filter((_, idx) => idx !== j) });
  const setIng = (i, j, newIng) => {
    const current = dishes[i]?.ingredients?.[j] || {};
    const currentKey = normalizeIngredientName(current.canonicalName || current.displayName || "");
    if (newIng?.ingredientId && currentKey) {
      onChange(dishes.map((dish) => ({
        ...dish,
        ingredients: (dish.ingredients || []).map((item, index) => {
          const itemKey = normalizeIngredientName(item.canonicalName || item.displayName || "");
          if (itemKey === currentKey) return { ...item, ...newIng };
          return item;
        })
      })));
      return;
    }
    updateDish(i, { ingredients: dishes[i].ingredients.map((x, idx) => idx === j ? newIng : x) });
  };

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Platos del pack ({dishes.length})
        </div>
        {!compositionLocked ? (
          <button type="button" onClick={addDish}
            style={{ fontSize: 12, padding: "4px 10px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
            + Añadir plato
          </button>
        ) : null}
      </div>
      {dishes.length === 0 && (
        <div style={{ padding: "10px 0", color: "#9ca3af", fontSize: 12, textAlign: "center" }}>
          {compositionLocked ? "Este pack publicado no tiene platos." : "Sin platos - pulsa \"+ Añadir plato\" para empezar"}
        </div>
      )}
      {dishes.map((dish, i) => (
        <div key={i} style={{ border: "1px solid #e0e7ff", borderRadius: 8, marginBottom: 6, background: "#fafbff" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", cursor: "pointer", gap: 8 }}
            onClick={() => setExpanded((ex) => ex === i ? null : i)}>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: expanded === i ? "#6366f1" : "#1e293b" }}>
              {dish.name || <em style={{ color: "#9ca3af" }}>Plato sin nombre</em>}
            </span>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              {(dish.ingredients || []).length} ing.
            </span>
            {!compositionLocked ? (
              <button type="button" onClick={(e) => { e.stopPropagation(); removeDish(i); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontWeight: 700, fontSize: 16, padding: "0 4px" }}>×</button>
            ) : null}
          </div>
          {expanded === i && (
            <div style={{ padding: "0 12px 12px", borderTop: "1px solid #e0e7ff" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10, marginBottom: 6 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, fontWeight: 500 }}>
                  Nombre del plato *
                  <input style={FS} value={dish.name} onChange={(e) => updateDish(i, { name: e.target.value })} placeholder="Tacos de pollo" />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, fontWeight: 500 }}>
                  Categoría de plato
                  <select style={FS} value={dish.dishCategoryId || ""} onChange={(e) => updateDish(i, { dishCategoryId: e.target.value || null })}>
                    <option value="">— Sin categoría —</option>
                    {dishCategories.map((c) => <option key={String(c._id || c.id)} value={String(c._id || c.id)}>{c.name}</option>)}
                  </select>
                </label>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
                Teaser (descripción corta visible antes de instalar)
                <input style={FS} value={dish.teaser || ""} onChange={(e) => updateDish(i, { teaser: e.target.value })} placeholder="Ensalada fresca con tomate, pepino y aceitunas" maxLength={120} />
                <span style={{ fontSize: 10, color: "#9ca3af" }}>Máx. 120 caracteres. Se muestra como preview comercial — no reveles la receta completa.</span>
              </label>
              <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
                {[["sidedish", "Acompañamiento"], ["isDinner", "Cena"], ["special", "Especial"], ["allowRandom", "Aleatorio"]].map(([key, label]) => (
                  <label key={key} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={Boolean(dish[key])} onChange={(e) => updateDish(i, { [key]: e.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                  Ingredientes — lista de la compra
                </div>
                {(dish.ingredients || []).map((ing, j) => (
                  <div key={j} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4, marginBottom: 4 }}>
                    <IngredientSearchInput value={ing} onChange={(newIng) => setIng(i, j, newIng)} />
                    <button type="button" onClick={() => removeIng(i, j)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontWeight: 700, alignSelf: "start", paddingTop: 6 }}>×</button>
                  </div>
                ))}
                <button type="button" onClick={() => addIng(i)}
                  style={{ fontSize: 11, padding: "3px 8px", background: "transparent", border: "1px solid #6366f1", color: "#6366f1", borderRadius: 4, cursor: "pointer", marginTop: 4 }}>
                  + Ingrediente
                </button>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Receta</div>
                <RecipeEditor
                  recipeIngredients={dish.recipe?.ingredients || []}
                  recipeSteps={dish.recipe?.steps ?? null}
                  recipeServings={dish.recipe?.servings ?? null}
                  onChange={(updater) => {
                    const prev = dish.recipe || { ingredients: [], steps: null, servings: null };
                    const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
                    updateDish(i, { recipe: next });
                  }}
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PackForm({ item, onSave, onCancel, onPaymentSaved, baseBitePrice = 1.99 }) {
  const isEdit = Boolean(item.id || item._id);
  const isPublished = item.status === "published";

  const freeUntilDefault = item.freeUntil ? new Date(item.freeUntil).toISOString().split("T")[0] : "";

  const toDateStr = (v) => (v ? new Date(v).toISOString().split("T")[0] : "");

  const normDishes = (raw) => (raw || []).map((d) => ({
    dishTemplateId: d.dishTemplateId || null,
    name: d.name || "",
    teaser: d.teaser || "",
    sidedish: Boolean(d.sidedish),
    isDinner: Boolean(d.isDinner),
    special: Boolean(d.special),
    allowRandom: d.allowRandom !== false,
    dishCategoryId: d.dishCategoryId ? String(d.dishCategoryId) : null,
    ingredients: Array.isArray(d.ingredients) ? d.ingredients.map((ing) => ({
      displayName: ing.displayName || "",
      canonicalName: ing.canonicalName || "",
      ingredientId: ing.ingredientId || null,
      categoryId: ing.categoryId || null
    })) : [],
    recipe: {
      ingredients: Array.isArray(d.recipe?.ingredients) ? d.recipe.ingredients : [],
      steps: d.recipe?.steps ?? null,
      servings: d.recipe?.servings ?? null
    }
  }));

  const [form, setForm] = useState({
    slug: item.slug || "",
    title: item.title || "",
    subtitle: item.subtitle || "",
    description: item.description || "",
    coverImage: item.coverImage || "",
    tags: (item.tags || []).join(", "),
    cuisineType: item.cuisineType || "",
    active: item.active !== false,
    featured: Boolean(item.featured),
    priceBasic: item.priceBasic != null ? String(item.priceBasic) : "1.99",
    includedPlans: item.includedPlans || ["pro", "premium"],
    monthlyCreditCost: item.monthlyCreditCost != null ? String(item.monthlyCreditCost) : "100",
    sortOrder: item.sortOrder != null ? String(item.sortOrder) : "0",
    freeUntil: freeUntilDefault,
    activeFrom: toDateStr(item.activeFrom),
    activeUntil: toDateStr(item.activeUntil),
    color: item.color || "#6366f1",
    defaultSpecial: Boolean(item.defaultSpecial),
    defaultAllowRandom: item.defaultAllowRandom !== false,
    isDietPack: Boolean(item.isDietPack),
    dietLabel: item.dietLabel || ""
  });
  const [dishes, setDishes] = useState(() => normDishes(item.dishes));
  const [propagateCatalogUpdates, setPropagateCatalogUpdates] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Payment config (separate save via PATCH)
  const [paymentForm, setPaymentForm] = useState({
    isPaid: Boolean(item.isPaid),
    priceAmount: item.priceAmount != null ? String(item.priceAmount) : "",
    currency: item.currency || "eur",
    stripePriceId: item.stripePriceId || "",
    paymentMode: item.paymentMode || "none",
    purchasedCount: item.purchasedCount || 0
  });
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState("");
  // pricing sync: track which field was last manually edited; stop auto-sync once both touched
  const [pricingSync, setPricingSync] = useState({ priceTouched: false, bitesTouched: false, lastField: null });

  const packId = item.id || item._id;

  const handleCoverUpload = async (file) => {
    if (!file || !packId) return;
    setCoverUploading(true);
    setCoverUploadError("");
    try {
      const fd = new FormData();
      fd.append("cover", file);
      const token = getToken();
      const resp = await fetch(buildApiUrl(`/api/kitchen/catalog/packs/${packId}/cover`), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || "Error al subir imagen.");
      setForm((p) => ({ ...p, coverImage: data.coverImage }));
    } catch (err) {
      setCoverUploadError(err.message || "Error al subir imagen.");
    } finally {
      setCoverUploading(false);
    }
  };

  const handleCoverRemove = async () => {
    if (!packId) { setForm((p) => ({ ...p, coverImage: "" })); return; }
    try {
      await apiRequest(`/api/kitchen/catalog/packs/${packId}/cover`, { method: "DELETE" });
      setForm((p) => ({ ...p, coverImage: "" }));
    } catch (err) {
      setCoverUploadError(err.message || "Error al eliminar imagen.");
    }
  };

  const set = (key) => (e) => setForm((p) => ({
    ...p,
    [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value
  }));

  const togglePlan = (plan) => setForm((p) => ({
    ...p,
    includedPlans: p.includedPlans.includes(plan)
      ? p.includedPlans.filter((x) => x !== plan)
      : [...p.includedPlans, plan]
  }));

  const serializeDishes = () => dishes.map((d) => ({
    dishTemplateId: d.dishTemplateId || null,
    name: d.name.trim(),
    teaser: d.teaser?.trim() || "",
    sidedish: d.sidedish,
    isDinner: d.isDinner,
    special: d.special,
    allowRandom: d.allowRandom,
    dishCategoryId: d.dishCategoryId || null,
    ingredients: (d.ingredients || []).filter((x) => x.displayName?.trim() || x.canonicalName?.trim()),
    recipe: {
      ingredients: (d.recipe?.ingredients || []).filter((x) => x.name?.trim()),
      steps: d.recipe?.steps ?? null,
      servings: d.recipe?.servings ? parseInt(d.recipe.servings, 10) : null
    }
  })).filter((d) => d.name);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.slug.trim() || !form.title.trim()) { setError("slug y título son obligatorios."); return; }
    setSaving(true); setError("");
    try {
      await onSave({
        ...form,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        priceBasic: parseFloat(form.priceBasic) || 0,
        monthlyCreditCost: parseInt(form.monthlyCreditCost, 10) || 1,
        sortOrder: parseInt(form.sortOrder, 10) || 0,
        coverImage: form.coverImage.trim() || null,
        freeUntil: form.freeUntil || null,
        activeFrom: form.activeFrom || null,
        activeUntil: form.activeUntil || null,
        color: form.color || null,
        defaultSpecial: form.defaultSpecial,
        defaultAllowRandom: form.defaultAllowRandom,
        isDietPack: form.isDietPack,
        dietLabel: form.isDietPack ? form.dietLabel.trim() : "",
        dishes: serializeDishes(),
        propagateCatalogUpdates
      });
      if (isEdit) {
        const priceIdTrimmed = paymentForm.stripePriceId.trim();
        await apiRequest(`/api/kitchen/catalog/packs/${packId}/payment`, {
          method: "PATCH",
          body: JSON.stringify({
            isPaid: paymentForm.isPaid,
            priceAmount: Math.round((parseFloat(form.priceBasic) || 0) * 100),
            currency: paymentForm.currency || "eur",
            stripePriceId: priceIdTrimmed || null,
            paymentMode: paymentForm.paymentMode
          })
        });
        if (onPaymentSaved) onPaymentSaved();
      }
    } catch (err) { setError(err.message || "Error al guardar."); }
    finally { setSaving(false); }
  };

  const fieldStyle = { width: "100%", boxSizing: "border-box", padding: "7px 10px", fontSize: 13, borderRadius: 6, border: "1px solid #d1d5db", outline: "none" };
  const labelStyle = { display: "flex", flexDirection: "column", gap: 3, fontSize: 13, color: "#374151", fontWeight: 500 };
  const coverPreviewUrl = resolvePackCoverImageUrl(form.coverImage);

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #c7d2fe", borderRadius: 10, padding: 20, marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 16px", fontSize: 15, color: "#1e293b", fontWeight: 700 }}>
        {isEdit ? `✏️ Editar: ${item.title}` : "➕ Nuevo pack de catálogo"}
      </h4>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
          <label style={labelStyle}>
            Slug (único)
            <input style={fieldStyle} value={form.slug} onChange={set("slug")} placeholder="mexican-pack-vol1" required disabled={isEdit} />
          </label>
          <label style={labelStyle}>
            Título
            <input style={fieldStyle} value={form.title} onChange={set("title")} placeholder="10 platos mexicanos" required />
          </label>
          <label style={labelStyle}>
            Subtítulo
            <input style={fieldStyle} value={form.subtitle} onChange={set("subtitle")} placeholder="Sabores auténticos de México" />
          </label>
          <label style={labelStyle}>
            Tipo de cocina
            <input style={fieldStyle} value={form.cuisineType} onChange={set("cuisineType")} placeholder="mexicana" />
          </label>
          <label style={labelStyle}>
            Precio (€)
            <input
              style={fieldStyle}
              type="number"
              step="0.01"
              min="0"
              value={form.priceBasic}
              onChange={(e) => {
                const newPrice = e.target.value;
                setPricingSync((ps) => ({ ...ps, priceTouched: true, lastField: "price" }));
                if (!pricingSync.bitesTouched) {
                  const parsed = parseFloat(newPrice) || 0;
                  // baseBitePrice is price per 100 Bites; divide by 100 to get EUR/Bite
                  const calcBites = parsed > 0 ? Math.max(1, Math.round(parsed * 100 / baseBitePrice)) : parseInt(form.monthlyCreditCost, 10) || 100;
                  setForm((p) => ({ ...p, priceBasic: newPrice, monthlyCreditCost: String(calcBites) }));
                } else {
                  setForm((p) => ({ ...p, priceBasic: newPrice }));
                }
              }}
            />
          </label>
          <label style={labelStyle}>
            Coste en Bites
            <input
              style={fieldStyle}
              type="number"
              min="1"
              value={form.monthlyCreditCost}
              onChange={(e) => {
                const newBites = e.target.value;
                setPricingSync((ps) => ({ ...ps, bitesTouched: true, lastField: "bites" }));
                if (!pricingSync.priceTouched) {
                  const parsed = parseInt(newBites, 10) || 0;
                  // baseBitePrice is price per 100 Bites; multiply bites by (baseBitePrice/100)
                  const calcPrice = parsed > 0 ? parseFloat((parsed * baseBitePrice / 100).toFixed(2)) : parseFloat(form.priceBasic) || 0;
                  setForm((p) => ({ ...p, monthlyCreditCost: newBites, priceBasic: String(calcPrice) }));
                } else {
                  setForm((p) => ({ ...p, monthlyCreditCost: newBites }));
                }
              }}
            />
            <span style={{ fontSize: 11, color: "#6b7280" }}>
              Se calcula usando {Number(baseBitePrice).toFixed(2).replace(".", ",")} €/100 Bites. Puedes ajustar ambos valores manualmente.
            </span>
          </label>
          <label style={labelStyle}>
            Orden (sortOrder)
            <input style={fieldStyle} type="number" value={form.sortOrder} onChange={set("sortOrder")} />
          </label>

          {isEdit && (
            <>
              <label style={{ ...labelStyle, gridColumn: "1 / -1", borderTop: "1px dashed #e0e7ff", paddingTop: 10, marginTop: 4 }}>
                <span style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={paymentForm.isPaid} onChange={(e) => setPaymentForm((p) => ({ ...p, isPaid: e.target.checked, paymentMode: e.target.checked ? (p.paymentMode === "none" ? "stripe" : p.paymentMode) : "none" }))} />
                  <span style={{ fontWeight: 600 }}>💳 Paquete de pago (Stripe)</span>
                </span>
              </label>
              <label style={labelStyle}>
                Modo de pago
                <select style={fieldStyle} value={paymentForm.paymentMode} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentMode: e.target.value, isPaid: e.target.value === "stripe" ? true : p.isPaid }))}>
                  <option value="none">Ninguno</option>
                  <option value="stripe">Stripe</option>
                </select>
              </label>
              <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
                <span style={{ fontWeight: 600 }}>Stripe Price ID</span>
                <input
                  style={{ ...fieldStyle, fontFamily: "monospace", borderColor: paymentForm.stripePriceId && !paymentForm.stripePriceId.startsWith("price_") ? "#ef4444" : "#d1d5db" }}
                  value={paymentForm.stripePriceId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPaymentForm((p) => ({
                      ...p,
                      stripePriceId: value,
                      ...(value.trim().startsWith("price_") ? { isPaid: true, paymentMode: "stripe", currency: p.currency || "eur" } : {})
                    }));
                  }}
                  placeholder="price_1abc..."
                />
                {paymentForm.paymentMode === "stripe" && !paymentForm.stripePriceId && (
                  <span style={{ fontSize: 11, color: "#dc2626" }}>Obligatorio cuando modo=stripe.</span>
                )}
                {paymentForm.stripePriceId && !paymentForm.stripePriceId.startsWith("price_") && (
                  <span style={{ fontSize: 11, color: "#dc2626" }}>Debe comenzar con price_</span>
                )}
                <span style={{ fontSize: 11, color: "#6b7280" }}>Crea el producto/precio en Stripe y pega aquí el ID.</span>
              </label>
            </>
          )}
        </div>

        <label style={{ ...labelStyle, marginBottom: 12 }}>
          Descripción
          <textarea style={{ ...fieldStyle, minHeight: 64, resize: "vertical" }} value={form.description} onChange={set("description")} placeholder="Descripción del pack..." />
        </label>

        <label style={{ ...labelStyle, marginBottom: 12 }}>
          Tags (separados por coma)
          <input style={fieldStyle} value={form.tags} onChange={set("tags")} placeholder="mexicano, familia, picante" />
        </label>

        <div style={{ marginBottom: 14 }}>
          <span style={{ ...labelStyle, marginBottom: 6 }}>Imagen de portada</span>
          {coverPreviewUrl && (
            <div style={{ marginBottom: 8, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <img
                src={coverPreviewUrl}
                alt="portada"
                style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid #d1d5db" }}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
              <button type="button" onClick={handleCoverRemove} style={{ ...ABT.del, alignSelf: "flex-start" }}>Quitar</button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input style={{ ...fieldStyle, flex: 1, minWidth: 160 }} value={form.coverImage} onChange={set("coverImage")} placeholder="https://... o sube un archivo" />
            {isEdit && (
              <label style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, ...ABT.edit }}>
                {coverUploading ? "Subiendo…" : "📁 Subir"}
                <input type="file" accept="image/*" style={{ display: "none" }} disabled={coverUploading} onChange={(e) => handleCoverUpload(e.target.files?.[0])} />
              </label>
            )}
          </div>
          {coverUploadError && <p style={{ color: "#b42318", fontSize: 11, margin: "4px 0 0" }}>{coverUploadError}</p>}
          {!isEdit && <p style={{ fontSize: 11, color: "#64748b", margin: "3px 0 0" }}>Guarda el pack primero para poder subir una imagen.</p>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
          <label style={labelStyle}>
            Gratis hasta (fecha)
            <input style={fieldStyle} type="date" value={form.freeUntil} onChange={set("freeUntil")} />
          </label>
          <label style={labelStyle}>
            Activo desde
            <input style={fieldStyle} type="date" value={form.activeFrom} onChange={set("activeFrom")} />
          </label>
          <label style={labelStyle}>
            Activo hasta
            <input style={fieldStyle} type="date" value={form.activeUntil} onChange={set("activeUntil")} />
          </label>
        </div>
        <p style={{ fontSize: 11, color: "#64748b", margin: "-8px 0 14px" }}>
          Activo desde/hasta: programa cuándo aparece en el catálogo (ej. pack navideño del 1-dic al 6-ene). Vacío = siempre activo.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 12, alignItems: "start", marginBottom: 14 }}>
          <label style={labelStyle}>
            Color del pack
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="color" value={form.color || "#6366f1"} onChange={set("color")} style={{ width: 36, height: 32, padding: 2, border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer" }} />
              <span style={{ fontSize: 12, color: "#64748b" }}>{form.color || "#6366f1"}</span>
            </div>
          </label>
          <label style={{ ...labelStyle, justifyContent: "flex-end", paddingBottom: 6 }}>
            <span style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={Boolean(form.defaultSpecial)} onChange={set("defaultSpecial")} />
              Especiales por defecto (no entran en randomización)
            </span>
          </label>
          <label style={{ ...labelStyle, justifyContent: "flex-end", paddingBottom: 6 }}>
            <span style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={Boolean(form.defaultAllowRandom)} onChange={set("defaultAllowRandom")} />
              Aleatorios por defecto
            </span>
          </label>
        </div>

        <div style={{ background: "#fdf4ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Dieta / Régimen</div>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer", marginBottom: 8 }}>
            <input type="checkbox" checked={Boolean(form.isDietPack)} onChange={set("isDietPack")} />
            <span>Pack de dieta / régimen</span>
          </label>
          {form.isDietPack ? (
            <label style={labelStyle}>
              Nombre de la dieta (visible para el usuario)
              <input
                style={fieldStyle}
                value={form.dietLabel}
                onChange={set("dietLabel")}
                placeholder="Ej: Dieta mediterránea, Keto, etc."
              />
            </label>
          ) : null}
        </div>

        {isPublished ? (
          <div className="kitchen-alert warning" style={{ marginBottom: 12 }}>
            Este pack ya está publicado. Puedes corregir recetas y preferencias de los platos, pero no añadir ni eliminar platos del pack.
          </div>
        ) : null}

        <DishTemplateEditor
          dishes={dishes}
          onChange={setDishes}
          defaults={{ defaultSpecial: form.defaultSpecial, defaultAllowRandom: form.defaultAllowRandom }}
          compositionLocked={isPublished}
        />

        {isPublished ? (
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer", margin: "12px 0 14px" }}>
            <input type="checkbox" checked={propagateCatalogUpdates} onChange={(e) => setPropagateCatalogUpdates(e.target.checked)} />
            Actualizar también en hogares donde no se haya personalizado
          </label>
        ) : null}

        <div style={{ marginBottom: 14, marginTop: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Planes incluidos</div>
          <div style={{ display: "flex", gap: 12 }}>
            {INCLUDED_PLANS_OPTIONS.map((plan) => (
              <label key={plan} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.includedPlans.includes(plan)}
                  onChange={() => togglePlan(plan)}
                />
                {plan}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
          {[["active", "Activo"], ["featured", "Destacado"]].map(([key, label]) => (
            <label key={key} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={Boolean(form[key])} onChange={set(key)} />
              {label}
            </label>
          ))}
        </div>

        {error ? <div className="kitchen-alert error" style={{ marginBottom: 10 }}>{error}</div> : null}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving} style={{ ...ABT.save, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear pack"}
          </button>
          <button type="button" onClick={onCancel} style={ABT.cancel}>Cancelar</button>
        </div>
      </form>

    </div>
  );
}

function PackStatusBadge({ status }) {
  const map = {
    none: { label: "Sin estado", bg: "#f8fafc", color: "#64748b" },
    draft: { label: "draft", bg: "#f1f5f9", color: "#475569" },
    needs_review: { label: "needs review", bg: "#fff7ed", color: "#c2410c" },
    ready: { label: "ready", bg: "#ecfdf5", color: "#047857" },
    published: { label: "published", bg: "#eef2ff", color: "#4338ca" }
  };
  const item = status ? (map[status] || map.needs_review) : map.none;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800, background: item.bg, color: item.color, textTransform: "uppercase" }}>
      {item.label}
    </span>
  );
}

function IngredientSearchSelector({ onSelect, disabled }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);

  const search = (value) => {
    setQ(value);
    clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiRequest(`/api/kitchen/catalog/master/ingredients?q=${encodeURIComponent(value.trim())}`);
        setResults(data.ingredients || []);
        setOpen(true);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
  };

  const pick = (ing) => {
    setQ("");
    setResults([]);
    setOpen(false);
    onSelect(ing);
  };

  return (
    <div style={{ position: "relative", minWidth: 160 }}>
      <input
        style={{ ...FS, paddingRight: loading ? 24 : 8 }}
        placeholder="Buscar en BD..."
        value={q}
        onChange={(e) => search(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        disabled={disabled}
      />
      {loading && <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#94a3b8" }}>...</span>}
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, zIndex: 20, maxHeight: 180, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
          {results.length === 0
            ? <div style={{ padding: "8px 10px", fontSize: 12, color: "#94a3b8" }}>Sin resultados</div>
            : results.map((ing) => (
              <button
                key={ing.id}
                type="button"
                style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", fontSize: 12, background: "none", border: "none", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                onMouseDown={() => pick(ing)}
              >
                {ing.name} <span style={{ color: "#94a3b8", fontSize: 11 }}>{ing.canonicalName}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function PackReviewPanel({ pack, onClose, onPackUpdated }) {
  const [ingredientCategories, setIngredientCategories] = useState([]);
  const [dishCategories, setDishCategories] = useState([]);
  const [creating, setCreating] = useState({});
  const [busyKeys, setBusyKeys] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const setRowBusy = (key, val) => setBusyKeys((prev) => ({ ...prev, [key]: Boolean(val) }));
  const isRowBusy = (key) => Boolean(busyKeys[key]);
  const anyBusy = Object.values(busyKeys).some(Boolean);

  useEffect(() => {
    apiRequest("/api/kitchen/catalog/master/ingredient-categories")
      .then((d) => setIngredientCategories(d.categories || []))
      .catch(() => {});
    apiRequest("/api/kitchen/catalog/master/dish-categories")
      .then((d) => setDishCategories(d.categories || []))
      .catch(() => {});
  }, []);

  const summary = pack.validationSummary || {};
  const issues = pack.reviewIssues || [];
  const ingredientIssues = useMemo(() => {
    const relevant = issues.filter((issue) => ["missing_ingredient_mapping", "ambiguous_ingredient_match", "invalid_ingredient_mapping", "missing_ingredient_category"].includes(issue.type));
    const byName = new Map();
    relevant.forEach((issue) => {
      const key = issue.normalizedName || issue.key;
      if (!byName.has(key)) byName.set(key, issue);
    });
    return [...byName.values()];
  }, [issues]);
  const dishIssues = issues.filter((issue) => issue.type === "missing_dish_category");
  const duplicateIssues = issues.filter((issue) => issue.type === "duplicate_ingredient_name");
  const unresolved = Number(summary.unresolvedIssues || 0);
  const canPublish = pack.status !== "published" && unresolved === 0;

  const updatePack = (nextPack) => {
    if (nextPack) onPackUpdated(nextPack);
  };

  const revalidate = async () => {
    setRowBusy("revalidate", true); setError(""); setNotice("");
    try {
      const data = await apiRequest(`/api/kitchen/catalog/packs/${pack.id}/revalidate`, { method: "POST" });
      updatePack(data.pack);
    } catch (err) { setError(err.message || "No se pudo validar."); }
    finally { setRowBusy("revalidate", false); }
  };

  const mapIngredient = async (issue, ingredientId) => {
    const busyKey = `map-${issue.key}`;
    setRowBusy(busyKey, true); setError(""); setNotice("");
    try {
      const data = await apiRequest(`/api/kitchen/catalog/packs/${pack.id}/normalize/ingredient`, {
        method: "POST",
        body: JSON.stringify({ normalizedName: issue.normalizedName, ingredientId })
      });
      updatePack(data.pack);
      setNotice(`Vinculado a ${data.ingredient?.name || "ingrediente master"}.`);
    } catch (err) { setError(err.message || "No se pudo mapear el ingrediente."); }
    finally { setRowBusy(busyKey, false); }
  };

  const createIngredient = async (issue) => {
    const form = creating[issue.normalizedName] || {};
    if (!form.name?.trim() || !form.categoryId) {
      setError("Nombre y categoria son obligatorios para crear ingrediente master.");
      return;
    }
    const busyKey = `create-${issue.key}`;
    setRowBusy(busyKey, true); setError(""); setNotice("");
    try {
      const data = await apiRequest(`/api/kitchen/catalog/packs/${pack.id}/normalize/ingredient`, {
        method: "POST",
        body: JSON.stringify({
          normalizedName: issue.normalizedName,
          create: { name: form.name.trim(), categoryId: form.categoryId }
        })
      });
      updatePack(data.pack);
      setNotice(data.duplicateMatched
        ? `Ya existia "${data.ingredient?.name}". Se ha vinculado sin crear duplicados.`
        : `Ingrediente creado y vinculado a ${data.ingredient?.name || form.name.trim()}.`);
    } catch (err) { setError(err.message || "No se pudo crear el ingrediente."); }
    finally { setRowBusy(busyKey, false); }
  };

  const setDishCategory = async (issue, categoryId) => {
    if (!categoryId) return;
    const busyKey = `dish-${issue.key}`;
    setRowBusy(busyKey, true); setError(""); setNotice("");
    try {
      const data = await apiRequest(`/api/kitchen/catalog/packs/${pack.id}/normalize/dish-category`, {
        method: "POST",
        body: JSON.stringify({ dishIndex: issue.dishIndex, categoryId })
      });
      updatePack(data.pack);
      setNotice("Categoria de plato asignada.");
    } catch (err) { setError(err.message || "No se pudo asignar categoria."); }
    finally { setRowBusy(busyKey, false); }
  };

  const publish = async () => {
    setRowBusy("publish", true); setError(""); setNotice("");
    try {
      const data = await apiRequest(`/api/kitchen/catalog/packs/${pack.id}/publish`, { method: "POST" });
      updatePack(data.pack);
    } catch (err) { setError(err.message || "No se pudo publicar."); }
    finally { setRowBusy("publish", false); }
  };

  const metricStyle = { padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" };
  const labelStyle = { fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.04em" };
  const valueStyle = { fontSize: 20, color: "#111827", fontWeight: 800, marginTop: 3 };

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #c7d2fe", borderRadius: 10, padding: 18, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 17 }}>Revision editorial: {pack.title}</h3>
            <PackStatusBadge status={pack.status} />
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{pack.slug}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" style={ABT.edit} onClick={revalidate} disabled={anyBusy}>{isRowBusy("revalidate") ? "Validando..." : "Revalidar"}</button>
          <button type="button" style={{ ...ABT.green, opacity: canPublish ? 1 : 0.45 }} onClick={publish} disabled={!canPublish || anyBusy}>
            {pack.status === "published" ? "Publicado" : isRowBusy("publish") ? "Publicando..." : "Publicar"}
          </button>
          <button type="button" style={ABT.cancel} onClick={onClose}>Cerrar</button>
        </div>
      </div>

      <div style={{ height: 8, borderRadius: 999, background: "#e5e7eb", overflow: "hidden", marginBottom: 12 }}>
        <div style={{ height: "100%", width: `${summary.totalIngredients ? Math.round((Number(summary.normalizedIngredients || 0) / Number(summary.totalIngredients || 1)) * 100) : 0}%`, background: unresolved ? "#f59e0b" : "#16a34a" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 14 }}>
        <div style={metricStyle}><div style={labelStyle}>Normalizados</div><div style={valueStyle}>{summary.normalizedIngredients || 0}/{summary.totalIngredients || 0}</div></div>
        <div style={metricStyle}><div style={labelStyle}>Mapeos pendientes</div><div style={valueStyle}>{summary.missingIngredientMappings || 0}</div></div>
        <div style={metricStyle}><div style={labelStyle}>Ambiguos</div><div style={valueStyle}>{summary.ambiguousMatches || 0}</div></div>
        <div style={metricStyle}><div style={labelStyle}>Categorias ing.</div><div style={valueStyle}>{summary.missingIngredientCategories || 0}</div></div>
        <div style={metricStyle}><div style={labelStyle}>Categorias plato</div><div style={valueStyle}>{summary.missingDishCategories || 0}</div></div>
      </div>

      {error ? <div className="kitchen-alert error" style={{ marginBottom: 12 }}>{error}</div> : null}
      {notice ? <div className="kitchen-alert success" style={{ marginBottom: 12 }}>{notice}</div> : null}
      {unresolved === 0 ? <div className="kitchen-alert success" style={{ marginBottom: 12 }}>Validacion limpia. El pack puede publicarse.</div> : null}

      {ingredientIssues.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Ingredientes por resolver</h4>
          <div style={{ overflowX: "auto" }}>
            <table className="kitchen-table">
              <thead><tr><th>Original</th><th>Asignar existente</th><th>Crear nuevo master</th></tr></thead>
              <tbody>
                {ingredientIssues.map((issue) => {
                  const rowKey = `map-${issue.key}`;
                  const createKey = `create-${issue.key}`;
                  const rowBusy = isRowBusy(rowKey) || isRowBusy(createKey);
                  const createForm = creating[issue.normalizedName] || { name: issue.originalName || issue.normalizedName, categoryId: "" };
                  return (
                    <tr key={issue.key}>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{issue.originalName || issue.normalizedName}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{issue.normalizedName}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{issue.message}</div>
                      </td>
                      <td>
                        {(issue.suggestedMatches || []).length > 0 && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                            {issue.suggestedMatches.map((match) => (
                              <button key={match.id} type="button" style={ABT.edit} disabled={rowBusy} onClick={() => mapIngredient(issue, match.id)}>
                                {match.name}
                              </button>
                            ))}
                          </div>
                        )}
                        <IngredientSearchSelector
                          disabled={rowBusy}
                          onSelect={(ing) => mapIngredient(issue, ing.id)}
                        />
                        {rowBusy && isRowBusy(rowKey) && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>Vinculando...</div>}
                      </td>
                      <td>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1fr) minmax(130px, 1fr) auto", gap: 6 }}>
                          <input style={FS} value={createForm.name || ""} onChange={(e) => setCreating((prev) => ({ ...prev, [issue.normalizedName]: { ...createForm, name: e.target.value } }))} />
                          <select style={FS} value={createForm.categoryId || ""} onChange={(e) => setCreating((prev) => ({ ...prev, [issue.normalizedName]: { ...createForm, categoryId: e.target.value } }))}>
                            <option value="">Categoria</option>
                            {ingredientCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                          </select>
                          <button type="button" style={{ ...ABT.save, padding: "5px 10px", opacity: createForm.categoryId && !rowBusy ? 1 : 0.5 }} disabled={!createForm.categoryId || rowBusy} onClick={() => createIngredient(issue)}>
                            {isRowBusy(createKey) ? "..." : "Crear"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dishIssues.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Categorias de plato pendientes</h4>
          <div style={{ display: "grid", gap: 8 }}>
            {dishIssues.map((issue) => {
              const dishBusy = isRowBusy(`dish-${issue.key}`);
              return (
                <div key={issue.key} style={{ display: "grid", gridTemplateColumns: "1fr minmax(180px, 260px)", gap: 10, alignItems: "center", padding: 10, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{issue.dishName}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>Plato #{Number(issue.dishIndex) + 1}</div>
                  </div>
                  <select className="kitchen-select" defaultValue="" disabled={dishBusy} onChange={(e) => setDishCategory(issue, e.target.value)}>
                    <option value="">{dishBusy ? "Guardando..." : "Asignar categoria"}</option>
                    {dishCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {duplicateIssues.length > 0 && (
        <div>
          <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Avisos de nombres inconsistentes</h4>
          {duplicateIssues.map((issue) => (
            <div key={issue.key} style={{ padding: 10, border: "1px solid #fde68a", borderRadius: 8, background: "#fffbeb", fontSize: 12, color: "#92400e", marginBottom: 6 }}>
              {issue.normalizedName}: {(issue.names || []).join(", ")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GrantModal({ pack, households, onGrant, onClose }) {
  const [householdId, setHouseholdId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handle = async () => {
    if (!householdId.trim()) { setError("Selecciona o introduce un household ID."); return; }
    setSaving(true); setError(""); setSuccess("");
    try {
      await onGrant(String(pack.id), householdId.trim());
      setSuccess("Pack concedido correctamente.");
      setHouseholdId("");
    } catch (err) { setError(err.message || "Error al conceder."); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: 420, maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Conceder pack a un hogar</h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>Pack: <strong>{pack.title}</strong></p>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, marginBottom: 10 }}>
          Seleccionar household
          <select
            className="kitchen-select"
            value={householdId}
            onChange={(e) => setHouseholdId(e.target.value)}
          >
            <option value="">— Elige un hogar —</option>
            {(households || []).map((h) => (
              <option key={h.id} value={h.id}>{h.name} ({h.subscriptionPlan})</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, marginBottom: 14 }}>
          O introduce el ID directamente
          <input
            style={{ padding: "7px 10px", fontSize: 13, borderRadius: 6, border: "1px solid #d1d5db", outline: "none" }}
            value={householdId}
            onChange={(e) => setHouseholdId(e.target.value)}
            placeholder="MongoDB ObjectId..."
          />
        </label>

        {error ? <div className="kitchen-alert error" style={{ marginBottom: 8 }}>{error}</div> : null}
        {success ? <div className="kitchen-alert success" style={{ marginBottom: 8 }}>{success}</div> : null}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={saving} onClick={handle} style={{ ...ABT.save, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Concediendo..." : "Conceder"}
          </button>
          <button type="button" onClick={onClose} style={ABT.cancel}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function CatalogPacksSection() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editItem, setEditItem] = useState(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(() => ({
    packType: window.localStorage.getItem("lunchfy.admin.catalog.packType") === "diet" ? "diet" : "all"
  }));
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [grantModal, setGrantModal] = useState(null);
  const [households, setHouseholds] = useState([]);
  const [reviewPack, setReviewPack] = useState(null);
  const [saveNotice, setSaveNotice] = useState("");
  const [baseBitePrice, setBaseBitePrice] = useState(1.99);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (filters.packType === "diet") params.set("isDietPack", "true");
      const query = params.toString();
      const data = await apiRequest(`/api/kitchen/catalog/packs/admin-all${query ? `?${query}` : ""}`);
      setPacks(data.packs || []);
    } catch (err) { setError(err.message || "Error al cargar packs."); }
    finally { setLoading(false); }
  }, [filters.packType]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    window.localStorage.setItem("lunchfy.admin.catalog.packType", filters.packType);
  }, [filters.packType]);

  useEffect(() => {
    apiRequest("/api/admin/households")
      .then((d) => setHouseholds(d.households || []))
      .catch(() => {});
    apiRequest("/api/kitchen/bites/admin/config")
      .then((d) => setBaseBitePrice(d.config?.baseBitePrice ?? 1.99))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? packs.filter((p) => String(p.title || "").toLowerCase().includes(q) || String(p.slug || "").toLowerCase().includes(q)) : packs;
  }, [packs, search]);

  const onlyDiets = filters.packType === "diet";

  const handleSave = async (form) => {
    const packId = editItem?.id;
    setSaveNotice("");
    if (packId) {
      const data = await apiRequest(`/api/kitchen/catalog/packs/${packId}`, {
        method: "PUT",
        body: JSON.stringify(form)
      });
      if (data.syncSummary) {
        const s = data.syncSummary;
        setSaveNotice(`Pack actualizado. ${s.synced || 0} platos instalados sincronizados, ${s.skippedCustomized || 0} omitidos por personalizacion, ${s.skippedAmbiguous || 0} omitidos por coincidencia ambigua.`);
      }
    } else {
      await apiRequest("/api/kitchen/catalog/packs", {
        method: "POST",
        body: JSON.stringify(form)
      });
    }
    setEditItem(null);
    await load();
  };

  const handleToggle = async (pack, field) => {
    if (togglingId) return;
    setTogglingId(`${pack.id}-${field}`);
    try {
      await apiRequest(`/api/kitchen/catalog/packs/${pack.id}`, {
        method: "PUT",
        body: JSON.stringify({ [field]: field === "active" ? !(pack.active !== false) : !pack[field] })
      });
      await load();
    } catch (err) { setError(err.message || "Error."); }
    finally { setTogglingId(null); }
  };

  const handleSetFree = async (pack) => {
    if (togglingId) return;
    const newPrice = pack.priceBasic > 0 ? 0 : 1.99;
    setTogglingId(`${pack.id}-price`);
    try {
      await apiRequest(`/api/kitchen/catalog/packs/${pack.id}`, {
        method: "PUT",
        body: JSON.stringify({ priceBasic: newPrice, includedPlans: newPrice === 0 ? ["basic", "pro", "premium"] : ["pro", "premium"] })
      });
      await load();
    } catch (err) { setError(err.message || "Error."); }
    finally { setTogglingId(null); }
  };

  const handleDelete = async (pack) => {
    if (!window.confirm(`¿Eliminar el pack "${pack.title}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(pack.id);
    try {
      await apiRequest(`/api/kitchen/catalog/packs/${pack.id}`, { method: "DELETE" });
      await load();
    } catch (err) { setError(err.message || "Error al eliminar."); }
    finally { setDeletingId(null); }
  };

  const handleGrant = async (packId, targetHouseholdId) => {
    await apiRequest(`/api/kitchen/catalog/packs/${packId}/admin-grant`, {
      method: "POST",
      body: JSON.stringify({ targetHouseholdId })
    });
  };

  const handlePublish = async (pack) => {
    if (togglingId) return;
    setTogglingId(`${pack.id}-publish`);
    setError("");
    try {
      const data = await apiRequest(`/api/kitchen/catalog/packs/${pack.id}/publish`, { method: "POST" });
      setPacks((prev) => prev.map((item) => String(item.id) === String(data.pack.id) ? data.pack : item));
      if (reviewPack && String(reviewPack.id) === String(data.pack.id)) setReviewPack(data.pack);
    } catch (err) {
      setError(err.message || "No se pudo publicar el pack.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleSetStatus = async (pack, status) => {
    if (togglingId) return;
    setTogglingId(`${pack.id}-status-${status}`);
    setError("");
    try {
      const data = await apiRequest(`/api/kitchen/catalog/packs/${pack.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status })
      });
      setPacks((prev) => prev.map((item) => String(item.id) === String(data.pack.id) ? data.pack : item));
      if (reviewPack && String(reviewPack.id) === String(data.pack.id)) setReviewPack(data.pack);
    } catch (err) {
      setError(err.message || "No se pudo cambiar el estado del pack.");
    } finally {
      setTogglingId(null);
    }
  };

  const replacePack = (nextPack) => {
    setPacks((prev) => prev.map((pack) => String(pack.id) === String(nextPack.id) ? nextPack : pack));
    setReviewPack(nextPack);
  };

  return (
    <Card className="kitchen-block-gap">
      <div style={{ marginBottom: 16 }}>
        <h2 className="kitchen-title-no-margin">Catálogo de packs</h2>
        <p className="kitchen-muted">Crea, edita y gestiona los packs de platos del catálogo de Lunchfy.</p>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <input
          style={{ padding: "7px 10px", fontSize: 13, borderRadius: 6, border: "1px solid #d1d5db", width: 220, outline: "none" }}
          placeholder="Buscar por título o slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" style={{ ...ABT.save, padding: "7px 16px" }} onClick={() => setEditItem({})}>
          + Nuevo pack
        </button>
        <button type="button" style={ABT.edit} onClick={load} disabled={loading}>
          {loading ? "..." : "↺ Recargar"}
        </button>
        <button
          type="button"
          aria-pressed={onlyDiets}
          onClick={() => setFilters((prev) => ({ ...prev, packType: prev.packType === "diet" ? "all" : "diet" }))}
          style={{
            ...ABT.edit,
            borderColor: onlyDiets ? "#86efac" : "#cbd5e1",
            background: onlyDiets ? "#f0fdf4" : "#f8fafc",
            color: onlyDiets ? "#15803d" : "#374151",
            fontWeight: 700
          }}
        >
          <span style={{ marginRight: 5 }}>{onlyDiets ? "✓" : "○"}</span>
          Only diets
        </button>
        <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 4 }}>
          {filtered.length}{search.trim() ? ` de ${packs.length}` : ""} packs{onlyDiets ? " de dieta" : " en total"}
        </span>
      </div>

      {reviewPack && (
        <PackReviewPanel
          pack={reviewPack}
          onClose={() => setReviewPack(null)}
          onPackUpdated={replacePack}
        />
      )}

      {editItem !== null && (
        <PackForm
          item={editItem}
          onSave={handleSave}
          onCancel={() => setEditItem(null)}
          onPaymentSaved={() => load()}
          baseBitePrice={baseBitePrice}
        />
      )}

      {error ? <div className="kitchen-alert error">{error}</div> : null}
      {saveNotice ? <div className="kitchen-alert success">{saveNotice}</div> : null}

      {loading ? <p className="kitchen-muted">Cargando packs...</p> : filtered.length === 0 ? (
        <p className="kitchen-muted">No hay packs{search.trim() ? " con ese criterio" : ". Crea el primero."}.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="kitchen-table">
            <thead>
              <tr>
                <th>Pack</th>
                <th style={{ textAlign: "center" }}>Platos</th>
                <th style={{ textAlign: "center" }}>Precio</th>
                <th style={{ textAlign: "center" }}>Planes</th>
                <th style={{ textAlign: "center" }}>Estado</th>
                <th style={{ textAlign: "center" }}>Revision</th>
                <th style={{ textAlign: "center" }}>Concedido</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((pack) => {
                const isFree = !pack.priceBasic || pack.priceBasic <= 0;
                const togId = togglingId;
                const unresolved = Number(pack.validationSummary?.unresolvedIssues || 0);
                const canPublishPack = pack.status !== "published" && unresolved === 0;
                return (
                  <tr key={pack.id} style={{ opacity: pack.active !== false ? 1 : 0.45 }}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {pack.featured ? <span style={{ color: "#f59e0b", marginRight: 4 }}>★</span> : null}
                        {pack.title}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{pack.slug}</div>
                      {pack.tags?.length > 0 && (
                        <div style={{ marginTop: 3, display: "flex", gap: 3, flexWrap: "wrap" }}>
                          {pack.tags.slice(0, 3).map((t) => (
                            <span key={t} style={{ fontSize: 10, background: "#eef2ff", color: "#6366f1", borderRadius: 4, padding: "1px 5px" }}>{t}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>{pack.dishCount}</td>
                    <td style={{ textAlign: "center" }}>
                      {isFree
                        ? <span style={{ fontSize: 11, background: "#dcfce7", color: "#166534", borderRadius: 5, padding: "2px 7px", fontWeight: 700 }}>Gratis</span>
                        : <span style={{ fontSize: 12, fontWeight: 600 }}>{Number(pack.priceBasic).toFixed(2)} €</span>}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
                        {(pack.includedPlans || []).map((p) => (
                          <span key={p} style={{ fontSize: 10, background: "#f0f4ff", color: "#4338ca", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>{p}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {pack.active !== false
                        ? <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>● Activo</span>
                        : <span style={{ fontSize: 11, color: "#94a3b8" }}>○ Inactivo</span>}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <PackStatusBadge status={pack.status} />
                      {!pack.status ? (
                        <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>legacy</span>
                      ) : pack.validationSummary?.unresolvedIssues > 0 ? (
                          <span style={{ fontSize: 11, color: "#c2410c", fontWeight: 700 }}>{pack.validationSummary.unresolvedIssues} pendientes</span>
                        ) : (
                          <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>validado</span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: "center", fontSize: 12, color: "#6b7280" }}>
                      {pack.ownedByCount > 0
                        ? <span style={{ fontWeight: 600, color: "#374151" }}>{pack.ownedByCount} hogares</span>
                        : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        <button type="button" style={ABT.edit} onClick={() => setEditItem(pack)}>Editar</button>
                        <button
                          type="button"
                          style={{ ...ABT.edit, color: pack.active !== false ? "#b45309" : "#166534", borderColor: pack.active !== false ? "#fcd34d" : "#86efac" }}
                          disabled={togId === `${pack.id}-active`}
                          onClick={() => handleToggle(pack, "active")}
                        >
                          {pack.active !== false ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          type="button"
                          style={{ ...ABT.edit, color: pack.featured ? "#6b7280" : "#d97706", borderColor: pack.featured ? "#e5e7eb" : "#fcd34d" }}
                          disabled={togId === `${pack.id}-featured`}
                          onClick={() => handleToggle(pack, "featured")}
                        >
                          {pack.featured ? "Quitar destaque" : "Destacar"}
                        </button>
                        <button
                          type="button"
                          style={{ ...ABT.edit, color: isFree ? "#7c3aed" : "#166534", borderColor: isFree ? "#ddd6fe" : "#86efac" }}
                          disabled={togId === `${pack.id}-price`}
                          onClick={() => handleSetFree(pack)}
                        >
                          {isFree ? "Poner precio" : "Poner gratis"}
                        </button>
                        <button
                          type="button"
                          style={{ ...ABT.edit, color: "#4338ca", borderColor: "#c7d2fe" }}
                          onClick={() => setReviewPack(pack)}
                        >
                          Revisar
                        </button>
                        {pack.status === "published" ? (
                          <button
                            type="button"
                            style={{ ...ABT.edit, color: "#7c2d12", borderColor: "#fed7aa" }}
                            disabled={togId === `${pack.id}-status-ready`}
                            onClick={() => handleSetStatus(pack, "ready")}
                          >
                            Despublicar
                          </button>
                        ) : (
                          <button
                            type="button"
                            title={!canPublishPack ? "Resuelve la revision antes de publicar" : "Publicar pack"}
                            style={{ ...ABT.green, opacity: canPublishPack ? 1 : 0.45 }}
                            disabled={!canPublishPack || togId === `${pack.id}-publish`}
                            onClick={() => handlePublish(pack)}
                          >
                            {togId === `${pack.id}-publish` ? "..." : "Publicar"}
                          </button>
                        )}
                        {pack.status !== "needs_review" ? (
                          <button
                            type="button"
                            style={{ ...ABT.edit, color: "#c2410c", borderColor: "#fed7aa" }}
                            disabled={togId === `${pack.id}-status-needs_review`}
                            onClick={() => handleSetStatus(pack, "needs_review")}
                          >
                            Mandar a revision
                          </button>
                        ) : null}
                        <button
                          type="button"
                          style={{ ...ABT.green }}
                          onClick={() => setGrantModal(pack)}
                        >
                          Conceder
                        </button>
                        <button
                          type="button"
                          style={{ ...ABT.del, opacity: deletingId === pack.id ? 0.6 : 1 }}
                          disabled={deletingId === pack.id}
                          onClick={() => handleDelete(pack)}
                        >
                          {deletingId === pack.id ? "..." : "Eliminar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {grantModal && (
        <GrantModal
          pack={grantModal}
          households={households}
          onGrant={handleGrant}
          onClose={() => setGrantModal(null)}
        />
      )}
    </Card>
  );
}

// ─── Bites Economy section ───────────────────────────────────────────────────

function BitesEconomySection() {
  const [config, setConfig] = useState(null);
  const [bundles, setBundles] = useState([]);
  const [households, setHouseholds] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [configDraft, setConfigDraft] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const [bundleForm, setBundleForm] = useState(null);
  const [savingBundle, setSavingBundle] = useState(false);

  const [grantForm, setGrantForm] = useState({ householdId: "", amount: 1, bucket: "free", reason: "" });
  const [savingGrant, setSavingGrant] = useState(false);
  const [grantMsg, setGrantMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cfgRes, hhRes, txRes] = await Promise.all([
        apiRequest("/api/kitchen/bites/admin/config"),
        apiRequest("/api/admin/households"),
        apiRequest("/api/kitchen/bites/admin/transactions?limit=20")
      ]);
      const c = cfgRes.config || {};
      setConfig(c);
      setConfigDraft({
        basic: c.monthlyGrantByPlan?.basic ?? 100,
        pro: c.monthlyGrantByPlan?.pro ?? 300,
        premium: c.monthlyGrantByPlan?.premium ?? 1000,
        maxBasic: c.maxFreeCarryOverByPlan?.basic ?? 500,
        maxPro: c.maxFreeCarryOverByPlan?.pro ?? 1000,
        maxPremium: c.maxFreeCarryOverByPlan?.premium ?? 5000,
        baseBitePrice: c.baseBitePrice ?? 1.99
      });
      setBundles(c.bundles || []);
      setHouseholds(hhRes.households || []);
      setTransactions(txRes.transactions || []);
    } catch (err) {
      setError(err.message || "Error al cargar la economía de Bites.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      await apiRequest("/api/kitchen/bites/admin/config", {
        method: "PUT",
        body: JSON.stringify({
          monthlyGrantByPlan: { basic: Number(configDraft.basic), pro: Number(configDraft.pro), premium: Number(configDraft.premium) },
          maxFreeCarryOverByPlan: { basic: Number(configDraft.maxBasic), pro: Number(configDraft.maxPro), premium: Number(configDraft.maxPremium) },
          baseBitePrice: Number(configDraft.baseBitePrice)
        })
      });
      await load();
    } catch (err) {
      setError(err.message || "Error al guardar la configuración.");
    } finally {
      setSavingConfig(false);
    }
  };

  const saveBundle = async () => {
    setSavingBundle(true);
    try {
      if (bundleForm._id) {
        await apiRequest(`/api/kitchen/bites/admin/bundles/${bundleForm._id}`, {
          method: "PUT",
          body: JSON.stringify(bundleForm)
        });
      } else {
        await apiRequest("/api/kitchen/bites/admin/bundles", {
          method: "POST",
          body: JSON.stringify(bundleForm)
        });
      }
      setBundleForm(null);
      await load();
    } catch (err) {
      setError(err.message || "Error al guardar el bundle.");
    } finally {
      setSavingBundle(false);
    }
  };

  const deleteBundle = async (bundleId) => {
    if (!window.confirm("¿Eliminar este bundle?")) return;
    try {
      await apiRequest(`/api/kitchen/bites/admin/bundles/${bundleId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message || "Error al eliminar.");
    }
  };

  const submitGrant = async () => {
    setSavingGrant(true);
    setGrantMsg("");
    try {
      const res = await apiRequest("/api/kitchen/bites/admin/grant", {
        method: "POST",
        body: JSON.stringify({
          householdId: grantForm.householdId,
          amount: Number(grantForm.amount),
          bucket: grantForm.bucket,
          reason: grantForm.reason
        })
      });
      setGrantMsg(`OK — libre: ${res.wallet?.freeBitesBalance ?? "?"}, comprados: ${res.wallet?.purchasedBitesBalance ?? "?"}`);
      await load();
    } catch (err) {
      setGrantMsg(`Error: ${err.message}`);
    } finally {
      setSavingGrant(false);
    }
  };

  if (loading) return <div style={{ padding: 24 }}>Cargando...</div>;

  const cdNum = (key) => Number(configDraft?.[key] ?? 0);

  return (
    <Card style={{ maxWidth: 900 }}>
      <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
        <BitesIcon size={22} decorative /> Bites Economy
      </h2>

      {error && <div style={{ color: "#b91c1c", background: "#fef2f2", padding: "8px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {/* ── Base price ── */}
      <section style={{ marginBottom: 24, background: "#f0f4ff", border: "1px solid #c7d2fe", borderRadius: 8, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <BitesIcon size={15} decorative /> Precio base por 100 Bites
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className="kitchen-input"
              style={{ fontSize: 14, fontWeight: 700, padding: "5px 10px", width: 90, textAlign: "right" }}
              value={configDraft?.baseBitePrice ?? 1.99}
              onChange={(e) => setConfigDraft((d) => ({ ...d, baseBitePrice: e.target.value }))}
            />
            <span style={{ fontSize: 13, color: "#6b7280" }}>€ / 100 Bites</span>
          </div>
          <span style={{ fontSize: 12, color: "#6366f1" }}>
            Equivalencia base: 100 Bites = {Number(configDraft?.baseBitePrice ?? 1.99).toFixed(2).replace(".", ",")} €. Usado para sugerir precios en packs y bundles. No modifica precios guardados existentes.
          </span>
        </div>
      </section>

      {/* ── Plan config ── */}
      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>
          <BitesIcon size={16} decorative /> Bites mensuales por plan
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
          {[
            { key: "basic", label: "Basic", maxKey: "maxBasic" },
            { key: "pro", label: "Pro", maxKey: "maxPro" },
            { key: "premium", label: "Premium", maxKey: "maxPremium" }
          ].map(({ key, label, maxKey }) => (
            <div key={key} style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 14px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{label}</div>
              <label style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}><BitesIcon size={13} decorative /> Bites/mes</label>
              <input
                type="number"
                min="0"
                className="kitchen-input"
                style={{ fontSize: 13, padding: "4px 8px", width: "100%" }}
                value={cdNum(key)}
                onChange={(e) => setConfigDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginTop: 8, marginBottom: 4 }}>Máx. acumulados</label>
              <input
                type="number"
                min="0"
                className="kitchen-input"
                style={{ fontSize: 13, padding: "4px 8px", width: "100%" }}
                value={cdNum(maxKey)}
                onChange={(e) => setConfigDraft((d) => ({ ...d, [maxKey]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <button type="button" style={ABT.save} onClick={saveConfig} disabled={savingConfig}>
          {savingConfig ? "Guardando..." : "Guardar configuración"}
        </button>
      </section>

      {/* ── Bundles ── */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#374151", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <BitesIcon size={16} decorative /> Bundles de Bites
          </h3>
          <button
            type="button"
            style={ABT.save}
            onClick={() => {
              const bbp = Number(configDraft?.baseBitePrice ?? 1.99);
              const amt = 1000;
              const disc = 25;
              // bbp is price per 100 Bites; divide by 100 to get EUR/Bite
              const suggestedPrice = parseFloat((amt * (bbp / 100) * (1 - disc / 100)).toFixed(2));
              setBundleForm({ name: "", bitesAmount: amt, price: suggestedPrice, discountPercent: disc, badge: "", highlighted: false, active: true, sortOrder: 0, isPaid: false, paymentMode: "none", currency: "eur", stripePriceId: "", _priceManuallySet: false });
            }}
          >
            + Nuevo bundle
          </button>
        </div>

        {bundleForm && (() => {
          const bbp = Number(configDraft?.baseBitePrice ?? 1.99);
          // bbp is price per 100 Bites; eurPerBite = bbp / 100
          const eurPerBite = bbp / 100;
          const bundleAmt = Number(bundleForm.bitesAmount) || 0;
          const bundleDisc = Number(bundleForm.discountPercent ?? 0);
          const baseValue = parseFloat((bundleAmt * eurPerBite).toFixed(2));
          const suggestedPrice = bundleAmt > 0 ? parseFloat((baseValue * (1 - bundleDisc / 100)).toFixed(2)) : 0;
          const finalPrice = Number(bundleForm.price) || 0;
          const perBite = bundleAmt > 0 ? (finalPrice / bundleAmt).toFixed(4) : "—";
          const per100Bites = bundleAmt > 0 ? (finalPrice / bundleAmt * 100).toFixed(2) : "—";
          const actualDiscount = baseValue > 0 ? Math.round((1 - finalPrice / baseValue) * 100) : 0;

          const handleBundleBitesChange = (e) => {
            const newAmt = Number(e.target.value);
            setBundleForm((f) => {
              if (f._priceManuallySet) return { ...f, bitesAmount: newAmt };
              const newPrice = parseFloat((newAmt * eurPerBite * (1 - (f.discountPercent ?? 0) / 100)).toFixed(2));
              return { ...f, bitesAmount: newAmt, price: newPrice };
            });
          };

          const handleBundleDiscountChange = (e) => {
            const newDisc = Number(e.target.value);
            setBundleForm((f) => {
              if (f._priceManuallySet) return { ...f, discountPercent: newDisc };
              const newPrice = parseFloat((Number(f.bitesAmount) * eurPerBite * (1 - newDisc / 100)).toFixed(2));
              return { ...f, discountPercent: newDisc, price: newPrice };
            });
          };

          const handleBundlePriceChange = (e) => {
            setBundleForm((f) => ({ ...f, price: Number(e.target.value), _priceManuallySet: true }));
          };

          return (
            <div style={{ background: "#f0f4ff", border: "1px solid #c7d2fe", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>Nombre</label>
                  <input className="kitchen-input" style={{ fontSize: 13, padding: "4px 8px", width: "100%" }}
                    value={bundleForm.name} onChange={(e) => setBundleForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}><BitesIcon size={13} decorative /> Bites</label>
                  <input type="number" min="1" className="kitchen-input" style={{ fontSize: 13, padding: "4px 8px", width: "100%" }}
                    value={bundleForm.bitesAmount} onChange={handleBundleBitesChange} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>
                    Descuento (%)
                  </label>
                  <input type="number" min="0" max="95" className="kitchen-input" style={{ fontSize: 13, padding: "4px 8px", width: "100%" }}
                    value={bundleForm.discountPercent ?? 0} onChange={handleBundleDiscountChange} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>
                    Precio final (€)
                    {!bundleForm._priceManuallySet && bundleAmt > 0 && (
                      <span style={{ fontSize: 11, color: "#6366f1", marginLeft: 4 }}>auto</span>
                    )}
                  </label>
                  <input type="number" step="0.01" min="0" className="kitchen-input" style={{ fontSize: 13, padding: "4px 8px", width: "100%" }}
                    value={bundleForm.price} onChange={handleBundlePriceChange} />
                  {bundleForm._priceManuallySet && (
                    <button type="button" style={{ fontSize: 11, color: "#6366f1", background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}
                      onClick={() => setBundleForm((f) => ({ ...f, price: suggestedPrice, _priceManuallySet: false }))}>
                      ↺ Recalcular
                    </button>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>Badge</label>
                  <input className="kitchen-input" style={{ fontSize: 13, padding: "4px 8px", width: "100%" }}
                    value={bundleForm.badge} onChange={(e) => setBundleForm((f) => ({ ...f, badge: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>Sort order</label>
                  <input type="number" className="kitchen-input" style={{ fontSize: 13, padding: "4px 8px", width: "100%" }}
                    value={bundleForm.sortOrder} onChange={(e) => setBundleForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, paddingTop: 18 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={bundleForm.highlighted} onChange={(e) => setBundleForm((f) => ({ ...f, highlighted: e.target.checked }))} />
                    Destacado
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={bundleForm.active} onChange={(e) => setBundleForm((f) => ({ ...f, active: e.target.checked }))} />
                    Activo
                  </label>
                </div>
                <div style={{ gridColumn: "1 / -1", background: "#fff", border: "1px solid #e0e7ff", borderRadius: 6, padding: "10px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(bundleForm.isPaid)}
                      onChange={(e) => setBundleForm((f) => ({
                        ...f,
                        isPaid: e.target.checked,
                        paymentMode: e.target.checked ? (f.paymentMode === "none" ? "stripe" : f.paymentMode) : "none"
                      }))}
                    />
                    Este bundle es de pago
                  </label>
                  <div>
                    <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>Modo de pago</label>
                    <select
                      className="kitchen-select"
                      style={{ fontSize: 13, padding: "4px 6px", width: "100%" }}
                      value={bundleForm.paymentMode || "none"}
                      onChange={(e) => setBundleForm((f) => ({ ...f, paymentMode: e.target.value, isPaid: e.target.value === "stripe" ? true : f.isPaid }))}
                    >
                      <option value="none">none</option>
                      <option value="stripe">stripe</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>Moneda</label>
                    <input className="kitchen-input" style={{ fontSize: 13, padding: "4px 8px", width: "100%" }}
                      value={bundleForm.currency || "eur"} onChange={(e) => setBundleForm((f) => ({ ...f, currency: e.target.value }))} />
                  </div>
                  {bundleForm.isPaid && bundleForm.paymentMode !== "stripe" && (
                    <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#b45309" }}>
                      Para vender este bundle, activa el bundle de pago y selecciona Stripe como modo de pago.
                    </div>
                  )}
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3, fontWeight: 600 }}>
                    💳 Stripe Price ID
                  </label>
                  <input
                    className="kitchen-input"
                    style={{
                      fontSize: 13, padding: "4px 8px", width: "100%", fontFamily: "monospace",
                      borderColor: bundleForm.stripePriceId && !bundleForm.stripePriceId.startsWith("price_") ? "#ef4444" : undefined
                    }}
                    value={bundleForm.stripePriceId || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setBundleForm((f) => ({
                        ...f,
                        stripePriceId: value,
                        ...(value.trim().startsWith("price_") ? { isPaid: true, paymentMode: "stripe", currency: f.currency || "eur" } : {})
                      }));
                    }}
                    placeholder="price_1abc... (opcional)"
                  />
                  {bundleForm.stripePriceId && !bundleForm.stripePriceId.startsWith("price_") && (
                    <span style={{ fontSize: 11, color: "#dc2626" }}>Debe comenzar con price_</span>
                  )}
                </div>
                {bundleAmt > 0 && (
                  <div style={{ gridColumn: "1 / -1", background: "#fff", border: "1px solid #e0e7ff", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#374151", display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span><strong>{bundleAmt} Bites</strong></span>
                    <span>Valor base: <strong>{baseValue.toFixed(2).replace(".", ",")} €</strong></span>
                    <span>Precio final: <strong>{finalPrice.toFixed(2).replace(".", ",")} €</strong></span>
                    <span>€/100 Bites: <strong>{per100Bites.replace(".", ",")} €</strong></span>
                    {actualDiscount > 0 && <span style={{ color: "#16a34a", fontWeight: 700 }}>Ahorra {actualDiscount}%</span>}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" style={ABT.save} disabled={savingBundle} onClick={saveBundle}>
                  {savingBundle ? "..." : "Guardar"}
                </button>
                <button type="button" style={ABT.cancel} onClick={() => setBundleForm(null)}>Cancelar</button>
              </div>
            </div>
          );
        })()}

        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280", fontSize: 12 }}>Nombre</th>
              <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280", fontSize: 12 }}><BitesIcon size={13} decorative /> Bites</th>
              <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280", fontSize: 12 }}>Precio</th>
              <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280", fontSize: 12 }}>€/100 Bites</th>
              <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280", fontSize: 12 }}>Descuento</th>
              <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280", fontSize: 12 }}>Badge</th>
              <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280", fontSize: 12 }}>Activo</th>
              <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280", fontSize: 12 }} />
            </tr>
          </thead>
          <tbody>
            {bundles.map((b) => {
              const bbp = Number(configDraft?.baseBitePrice ?? 1.99);
              // bbp is price per 100 Bites
              const baseVal = Number(b.bitesAmount) * (bbp / 100);
              const discPct = Number(b.discountPercent ?? 0);
              const actualSaving = baseVal > 0 ? Math.round((1 - Number(b.price) / baseVal) * 100) : 0;
              return (
                <tr key={String(b._id)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "6px 8px", fontWeight: b.highlighted ? 700 : 400 }}>{b.name}</td>
                  <td style={{ padding: "6px 8px" }}><BitesIcon size={14} decorative /> {b.bitesAmount}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <div>{Number(b.price).toFixed(2).replace(".", ",")} €</div>
                    {baseVal > 0 && <div style={{ fontSize: 11, color: "#9ca3af" }}>base {baseVal.toFixed(2).replace(".", ",")} €</div>}
                  </td>
                  <td style={{ padding: "6px 8px", color: "#6b7280" }}>{Number(b.bitesAmount) > 0 ? (b.price / b.bitesAmount * 100).toFixed(2).replace(".", ",") : "—"} €</td>
                  <td style={{ padding: "6px 8px" }}>
                    {discPct > 0 && <span style={{ fontSize: 11, background: "#dcfce7", color: "#166534", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>-{discPct}%</span>}
                    {actualSaving > 0 && actualSaving !== discPct && <span style={{ fontSize: 11, color: "#16a34a", marginLeft: 4 }}>({actualSaving}% real)</span>}
                    {discPct === 0 && "—"}
                  </td>
                  <td style={{ padding: "6px 8px" }}>{b.badge || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <span style={{ color: b.active ? "#16a34a" : "#9ca3af", fontWeight: 600 }}>{b.active ? "Sí" : "No"}</span>
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" style={ABT.edit} onClick={() => setBundleForm({ ...b, _id: b._id, _priceManuallySet: true })}>Editar</button>
                      <button type="button" style={ABT.del} onClick={() => deleteBundle(b._id)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {bundles.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 16, color: "#9ca3af", textAlign: "center" }}>Sin bundles configurados</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ── Manual grant ── */}
      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <BitesIcon size={16} decorative /> Conceder / quitar Bites manualmente
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 2fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>Hogar</label>
            <select
              className="kitchen-select"
              style={{ fontSize: 13, padding: "4px 6px", width: "100%" }}
              value={grantForm.householdId}
              onChange={(e) => setGrantForm((f) => ({ ...f, householdId: e.target.value }))}
            >
              <option value="">Seleccionar hogar...</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>{h.name} ({h.subscriptionPlan})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>Amount (+/-)</label>
            <input type="number" className="kitchen-input" style={{ fontSize: 13, padding: "4px 8px", width: "100%" }}
              value={grantForm.amount} onChange={(e) => setGrantForm((f) => ({ ...f, amount: Number(e.target.value) }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>Bolsillo</label>
            <select className="kitchen-select" style={{ fontSize: 13, padding: "4px 6px", width: "100%" }}
              value={grantForm.bucket} onChange={(e) => setGrantForm((f) => ({ ...f, bucket: e.target.value }))}>
              <option value="free">Incluidos (plan)</option>
              <option value="purchased">Comprados</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>Razón (obligatorio)</label>
            <input className="kitchen-input" style={{ fontSize: 13, padding: "4px 8px", width: "100%" }}
              value={grantForm.reason} onChange={(e) => setGrantForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" style={ABT.save} disabled={savingGrant || !grantForm.householdId || !grantForm.reason} onClick={submitGrant}>
            {savingGrant ? "..." : "Aplicar"}
          </button>
          {grantMsg && <span style={{ fontSize: 12, color: grantMsg.startsWith("Error") ? "#b91c1c" : "#16a34a" }}>{grantMsg}</span>}
        </div>
      </section>

      {/* ── Recent transactions ── */}
      <section>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <BitesIcon size={16} decorative /> Últimas transacciones
        </h3>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
              {["Fecha", "Hogar", "Tipo", "Amount", "Libre tras", "Comprado tras", "Razón"].map((h) => (
                <th key={h} style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280", fontSize: 11 }}>
                  {["Amount", "Libre tras", "Comprado tras"].includes(h) ? <BitesIcon size={12} decorative /> : null} {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={String(tx._id)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "5px 8px", color: "#6b7280" }}>
                  {new Date(tx.createdAt).toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                </td>
                <td style={{ padding: "5px 8px", color: "#6b7280", fontFamily: "monospace", fontSize: 10 }}>
                  {String(tx.householdId).slice(-6)}
                </td>
                <td style={{ padding: "5px 8px" }}>
                  <span style={{
                    padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                    background: tx.type === "monthly_grant" ? "#ede9fe" : tx.type === "pack_unlock" ? "#fef9c3" : tx.type.includes("admin") ? "#dcfce7" : "#f1f5f9",
                    color: tx.type === "monthly_grant" ? "#6d28d9" : tx.type === "pack_unlock" ? "#854d0e" : tx.type.includes("admin") ? "#166534" : "#374151"
                  }}>
                    {tx.type}
                  </span>
                </td>
                <td style={{ padding: "5px 8px", fontWeight: 600, color: tx.amount > 0 ? "#16a34a" : "#b91c1c" }}>
                  {tx.amount > 0 ? "+" : ""}<BitesIcon size={13} decorative /> {tx.amount}
                </td>
                <td style={{ padding: "5px 8px" }}><BitesIcon size={13} decorative /> {tx.balanceAfterFree}</td>
                <td style={{ padding: "5px 8px" }}><BitesIcon size={13} decorative /> {tx.balanceAfterPurchased}</td>
                <td style={{ padding: "5px 8px", color: "#6b7280", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tx.reason || "—"}
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 16, color: "#9ca3af", textAlign: "center" }}>Sin transacciones aún</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </Card>
  );
}

// ─── PlansSection ─────────────────────────────────────────────────────────────

const PLAN_KEYS = ["basic", "pro", "premium"];
const PLAN_DISPLAY = { basic: "Basic", pro: "Pro", premium: "Premium" };

const fieldStyle = {
  width: "100%", padding: "6px 10px", borderRadius: 6,
  border: "1px solid #e2e8f0", fontSize: 13, boxSizing: "border-box"
};

function PlansSection() {
  const [cfg, setCfg] = useState(null);
  const [env, setEnv] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getPlansAdminConfig();
        setCfg(data.config);
        setEnv(data.env);
        setForm({
          basic: { ...data.config.basic },
          pro: { ...data.config.pro },
          premium: { ...data.config.premium }
        });
      } catch (err) {
        setError(err.message || "Error cargando configuración de planes.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await savePlansAdminConfig(form);
      setSuccess("Configuración guardada.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message || "Error guardando configuración.");
    } finally {
      setSaving(false);
    }
  };

  const setField = (planKey, field, value) => {
    setForm((prev) => ({ ...prev, [planKey]: { ...prev[planKey], [field]: value } }));
  };

  if (loading) return <div style={{ padding: 32, color: "#6366f1" }}>Cargando...</div>;
  if (!form) return <div style={{ padding: 32, color: "#ef4444" }}>{error || "Error."}</div>;

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Planes de suscripción</h2>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
        Configura el precio, plataforma de pago y Price ID de Stripe para cada plan.
      </p>

      {env && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, background: env.paymentsEnabled ? "#dcfce7" : "#fee2e2", color: env.paymentsEnabled ? "#15803d" : "#b91c1c", fontWeight: 600 }}>
            Pagos: {env.paymentsEnabled ? "ON" : "OFF"}
          </span>
          <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, background: "#e0e7ff", color: "#3730a3", fontWeight: 600 }}>
            Modo: {env.stripeMode || "—"}
          </span>
          {env.allowTestEntitlements && (
            <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, background: "#fef9c3", color: "#854d0e", fontWeight: 600 }}>
              Test entitlements ON
            </span>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 20 }}>
        {PLAN_KEYS.map((planKey) => {
          const entry = form[planKey];
          const envPriceId = cfg?.[planKey]?.envStripePriceId || "";
          return (
            <div key={planKey} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 18, background: "#fafafa" }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: "#312e81" }}>
                {PLAN_DISPLAY[planKey]}
              </div>

              <label style={{ display: "block", marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 3 }}>Precio visible</div>
                <input
                  style={fieldStyle}
                  value={entry.displayPrice}
                  onChange={(e) => setField(planKey, "displayPrice", e.target.value)}
                  placeholder="Gratis / €4.99/mes..."
                />
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={entry.isPaid}
                  onChange={(e) => setField(planKey, "isPaid", e.target.checked)}
                />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Plan de pago</span>
              </label>

              <label style={{ display: "block", marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 3 }}>Plataforma</div>
                <select style={fieldStyle} value={entry.paymentMode} onChange={(e) => setField(planKey, "paymentMode", e.target.value)}>
                  <option value="none">Ninguna</option>
                  <option value="stripe">Stripe</option>
                </select>
              </label>

              <label style={{ display: "block" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 3 }}>
                  Stripe Price ID
                  {envPriceId && <span style={{ marginLeft: 6, fontWeight: 400, color: "#9ca3af", fontFamily: "monospace", fontSize: 11 }}>env: {envPriceId}</span>}
                </div>
                <input
                  style={{ ...fieldStyle, fontFamily: "monospace", borderColor: entry.stripePriceId && !entry.stripePriceId.startsWith("price_") ? "#ef4444" : "#e2e8f0" }}
                  value={entry.stripePriceId}
                  onChange={(e) => setField(planKey, "stripePriceId", e.target.value)}
                  placeholder="price_1abc..."
                />
                {entry.stripePriceId && !entry.stripePriceId.startsWith("price_") && (
                  <div style={{ color: "#ef4444", fontSize: 11, marginTop: 2 }}>Debe comenzar con "price_"</div>
                )}
              </label>
            </div>
          );
        })}
      </div>

      {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {success && <div style={{ color: "#16a34a", fontSize: 13, marginBottom: 8 }}>{success}</div>}

      <button
        type="button"
        style={{ ...ABT.save, opacity: saving ? 0.7 : 1 }}
        disabled={saving}
        onClick={handleSave}
      >
        {saving ? "Guardando..." : "Guardar planes"}
      </button>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AdminPanelPage() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [activeHouseholdId, setActiveHouseholdId] = useState(null);
  const [tab, setTab] = useState("households");

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/admin/login", { replace: true }); return; }
    if (user.globalRole !== "diod") { navigate("/kitchen/semana", { replace: true }); }
  }, [loading, navigate, user]);

  useEffect(() => {
    if (user?.activeHouseholdId !== undefined) {
      setActiveHouseholdId(user.activeHouseholdId);
    }
  }, [user?.activeHouseholdId]);

  if (loading || !user || user.globalRole !== "diod") return null;

  const onLogout = async () => {
    await logout();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="kitchen-app">
      <div style={{
        background: "#1e1b4b",
        color: "#e0e7ff",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em" }}>
            🛠 Lunchfy Admin
          </span>
          <span style={{ fontSize: 12, opacity: 0.6 }}>
            {user?.email || user?.displayName}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => navigate("/kitchen/semana")}
            style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#e0e7ff", padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
          >
            ← Volver a la app
          </button>
          <button
            type="button"
            onClick={onLogout}
            style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#e0e7ff", padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      <div style={{ padding: "0 0 8px", background: "#312e81" }}>
        <div style={{ display: "flex", gap: 0, paddingLeft: 16 }}>
          {[
            { key: "households", label: "Households" },
            { key: "users", label: "Usuarios" },
            { key: "quick", label: "Cambio rápido" },
            { key: "master", label: "Master" },
            { key: "catalog_packs", label: "Catálogo" },
            { key: "bites_economy", label: "Bites" },
            { key: "plans", label: "Planes" }
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                background: tab === key ? "#fff" : "transparent",
                color: tab === key ? "#312e81" : "#c7d2fe",
                border: "none",
                padding: "8px 18px",
                cursor: "pointer",
                fontWeight: tab === key ? 700 : 400,
                fontSize: 14,
                borderRadius: "6px 6px 0 0"
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="kitchen-container" style={{ paddingTop: 24 }}>
        {tab === "households" ? (
          <HouseholdsSection
            activeHouseholdId={activeHouseholdId}
            onActiveHouseholdChange={setActiveHouseholdId}
          />
        ) : tab === "users" ? (
          <UsersSection />
        ) : tab === "master" ? (
          <MasterCatalogSection />
        ) : tab === "catalog_packs" ? (
          <CatalogPacksSection />
        ) : tab === "bites_economy" ? (
          <BitesEconomySection />
        ) : tab === "plans" ? (
          <PlansSection />
        ) : (
          <QuickSubscriptionPanel />
        )}
      </div>
    </div>
  );
}
