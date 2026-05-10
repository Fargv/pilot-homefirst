import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth.jsx";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import Input from "../components/ui/Input.jsx";

const PLANS = ["free", "basic", "pro", "premium"];

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
              <option value="off">off (desactivar)</option>
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
            { key: "quick", label: "Cambio rápido" }
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
        ) : (
          <QuickSubscriptionPanel />
        )}
      </div>
    </div>
  );
}
