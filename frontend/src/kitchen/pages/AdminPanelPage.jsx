import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth.jsx";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import Input from "../components/ui/Input.jsx";
import RecipeEditor from "../components/RecipeEditor.jsx";

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

function PackForm({ item, onSave, onCancel }) {
  const isEdit = Boolean(item.id || item._id);
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
    monthlyCreditCost: item.monthlyCreditCost != null ? String(item.monthlyCreditCost) : "1",
    sortOrder: item.sortOrder != null ? String(item.sortOrder) : "0"
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
        coverImage: form.coverImage.trim() || null
      });
    } catch (err) { setError(err.message || "Error al guardar."); }
    finally { setSaving(false); }
  };

  const fieldStyle = { width: "100%", boxSizing: "border-box", padding: "7px 10px", fontSize: 13, borderRadius: 6, border: "1px solid #d1d5db", outline: "none" };
  const labelStyle = { display: "flex", flexDirection: "column", gap: 3, fontSize: 13, color: "#374151", fontWeight: 500 };

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
            Precio básico (€)
            <input style={fieldStyle} type="number" step="0.01" min="0" value={form.priceBasic} onChange={set("priceBasic")} />
          </label>
          <label style={labelStyle}>
            Crédito mensual
            <input style={fieldStyle} type="number" min="1" value={form.monthlyCreditCost} onChange={set("monthlyCreditCost")} />
          </label>
          <label style={labelStyle}>
            Orden (sortOrder)
            <input style={fieldStyle} type="number" value={form.sortOrder} onChange={set("sortOrder")} />
          </label>
        </div>

        <label style={{ ...labelStyle, marginBottom: 12 }}>
          Descripción
          <textarea style={{ ...fieldStyle, minHeight: 64, resize: "vertical" }} value={form.description} onChange={set("description")} placeholder="Descripción del pack..." />
        </label>

        <label style={{ ...labelStyle, marginBottom: 12 }}>
          Tags (separados por coma)
          <input style={fieldStyle} value={form.tags} onChange={set("tags")} placeholder="mexicano, familia, picante" />
        </label>

        <label style={{ ...labelStyle, marginBottom: 12 }}>
          URL imagen de portada
          <input style={fieldStyle} value={form.coverImage} onChange={set("coverImage")} placeholder="https://..." />
        </label>

        <div style={{ marginBottom: 14 }}>
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
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [grantModal, setGrantModal] = useState(null);
  const [households, setHouseholds] = useState([]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await apiRequest("/api/kitchen/catalog/packs/admin-all");
      setPacks(data.packs || []);
    } catch (err) { setError(err.message || "Error al cargar packs."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiRequest("/api/admin/households")
      .then((d) => setHouseholds(d.households || []))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? packs.filter((p) => p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)) : packs;
  }, [packs, search]);

  const handleSave = async (form) => {
    const packId = editItem?.id;
    if (packId) {
      await apiRequest(`/api/kitchen/catalog/packs/${packId}`, {
        method: "PUT",
        body: JSON.stringify(form)
      });
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
        body: JSON.stringify({ [field]: !pack[field] })
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
        <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 4 }}>{packs.length} packs en total</span>
      </div>

      {editItem !== null && (
        <PackForm
          item={editItem}
          onSave={handleSave}
          onCancel={() => setEditItem(null)}
        />
      )}

      {error ? <div className="kitchen-alert error">{error}</div> : null}

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
                <th style={{ textAlign: "center" }}>Concedido</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((pack) => {
                const isFree = !pack.priceBasic || pack.priceBasic <= 0;
                const togId = togglingId;
                return (
                  <tr key={pack.id} style={{ opacity: pack.active ? 1 : 0.45 }}>
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
                      {pack.active
                        ? <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>● Activo</span>
                        : <span style={{ fontSize: 11, color: "#94a3b8" }}>○ Inactivo</span>}
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
                          style={{ ...ABT.edit, color: pack.active ? "#b45309" : "#166534", borderColor: pack.active ? "#fcd34d" : "#86efac" }}
                          disabled={togId === `${pack.id}-active`}
                          onClick={() => handleToggle(pack, "active")}
                        >
                          {pack.active ? "Desactivar" : "Activar"}
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
            { key: "catalog_packs", label: "Catálogo" }
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
        ) : (
          <QuickSubscriptionPanel />
        )}
      </div>
    </div>
  );
}
