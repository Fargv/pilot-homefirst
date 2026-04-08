import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";
import { apiRequest } from "../api.js";
import WeekNavigator from "../components/ui/WeekNavigator.jsx";
import { useActiveWeek } from "../weekContext.jsx";
import { normalizeWeekParam } from "../deepLinks.js";

function addDaysToISO(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  return amount.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatPurchaseDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

export default function ShoppingBudgetPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeWeek } = useActiveWeek();
  const defaultWeek = useMemo(() => normalizeWeekParam(activeWeek, new Date().toISOString().slice(0, 10)), [activeWeek]);
  const selectedWeek = normalizeWeekParam(searchParams.get("week"), defaultWeek);
  const origin = searchParams.get("origin") || "settings";
  const returnWeek = normalizeWeekParam(searchParams.get("returnWeek"), selectedWeek);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [budget, setBudget] = useState({
    monthlyBudget: 0,
    cycleStartDay: 1,
    weeklyBudget: 0,
    spent: 0,
    available: 0
  });
  const [purchases, setPurchases] = useState([]);

  const setWeek = (nextWeek) => {
    const normalizedWeek = normalizeWeekParam(nextWeek, selectedWeek);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("week", normalizedWeek);
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    let active = true;
    const loadBudgetWeek = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiRequest(`/api/kitchen/shopping/${selectedWeek}/budget`);
        if (!active) return;
        setBudget({
          monthlyBudget: Number(data?.budget?.monthlyBudget) || 0,
          cycleStartDay: Number(data?.budget?.cycleStartDay) || 1,
          weeklyBudget: Number(data?.budget?.weeklyBudget) || 0,
          spent: Number(data?.budget?.spent) || 0,
          available: Number.isFinite(Number(data?.budget?.available)) ? Number(data.budget.available) : 0
        });
        setPurchases(Array.isArray(data?.purchases) ? data.purchases : []);
      } catch (err) {
        if (!active) return;
        setBudget({
          monthlyBudget: 0,
          cycleStartDay: 1,
          weeklyBudget: 0,
          spent: 0,
          available: 0
        });
        setPurchases([]);
        setError(err.message || "No se pudo cargar el presupuesto semanal.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadBudgetWeek();
    return () => {
      active = false;
    };
  }, [selectedWeek]);

  const handleBack = () => {
    if (origin === "shopping") {
      navigate(`/kitchen/compra?week=${encodeURIComponent(returnWeek)}`);
      return;
    }
    navigate("/kitchen/configuracion");
  };

  return (
    <KitchenLayout>
      <div className="kitchen-page shopping-budget-page">
        <div className="kitchen-page-hero shopping-budget-hero">
          <div className="shopping-budget-hero-top">
            <button type="button" className="kitchen-button secondary" onClick={handleBack}>
              Volver
            </button>
            <WeekNavigator
              className="shopping-budget-week-nav"
              value={selectedWeek}
              onChange={setWeek}
              onPrevious={() => setWeek(addDaysToISO(selectedWeek, -7))}
              onNext={() => setWeek(addDaysToISO(selectedWeek, 7))}
              ariaLabel="Cambiar semana del presupuesto"
              inputAriaLabel="Semana del presupuesto"
            />
          </div>

          <div className="shopping-budget-summary-grid">
            <div className="shopping-budget-summary-card">
              <span className="shopping-budget-label">Budget semanal</span>
              <strong>{loading ? "--" : formatCurrency(budget.weeklyBudget)}</strong>
            </div>
            <div className="shopping-budget-summary-card">
              <span className="shopping-budget-label">Gastado</span>
              <strong>{loading ? "--" : formatCurrency(budget.spent)}</strong>
            </div>
            <div className="shopping-budget-summary-card">
              <span className="shopping-budget-label">Disponible</span>
              <strong>{loading ? "--" : formatCurrency(budget.available)}</strong>
            </div>
          </div>
        </div>

        <div className="kitchen-card shopping-budget-history-card">
          <div className="shopping-budget-history-head">
            <div>
              <h3>Compras registradas</h3>
              <p className="kitchen-muted">Solo suman las compras confirmadas de esta semana.</p>
            </div>
            <strong className="shopping-budget-history-total">
              {loading ? "--" : formatCurrency(budget.spent)}
            </strong>
          </div>

          {error ? <div className="kitchen-alert error">{error}</div> : null}

          {loading ? (
            <p className="kitchen-muted">Cargando presupuesto semanal...</p>
          ) : purchases.length === 0 ? (
            <div className="shopping-budget-empty">
              <h4>Sin compras registradas</h4>
              <p className="kitchen-muted">Cuando confirmes una compra aparecerá aquí con su supermercado e importe.</p>
            </div>
          ) : (
            <div className="shopping-budget-purchase-list">
              {purchases.map((purchase) => (
                <div key={purchase.id} className="shopping-budget-purchase-item">
                  <div className="shopping-budget-purchase-main">
                    <strong>{purchase.storeName || "Supermercado no definido"}</strong>
                    <span className="kitchen-muted">{formatPurchaseDate(purchase.completedAt)}</span>
                  </div>
                  <div className="shopping-budget-purchase-meta">
                    <strong>{formatCurrency(purchase.amount)}</strong>
                    {Number(purchase.itemCount) > 0 ? (
                      <span className="kitchen-muted">{purchase.itemCount} items</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </KitchenLayout>
  );
}
