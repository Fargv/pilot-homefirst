export function getEffectiveHouseholdId(user) {
  if (!user) return null;

  if (user.globalRole === "diod") {
    if (!user.activeHouseholdId) {
      const error = new Error("DIOD debe seleccionar un hogar activo para operar.");
      error.code = "DIOD_ACTIVE_HOUSEHOLD_REQUIRED";
      throw error;
    }
    return user.activeHouseholdId;
  }

  if (!user.householdId) {
    const error = new Error("El usuario no tiene hogar asignado.");
    error.code = "HOUSEHOLD_REQUIRED";
    throw error;
  }

  return user.householdId;
}

export function handleHouseholdError(res, error) {
  if (error?.code === "DIOD_ACTIVE_HOUSEHOLD_REQUIRED" || error?.code === "HOUSEHOLD_REQUIRED") {
    return res.status(400).json({ ok: false, error: error.message });
  }

  return null;
}

export function buildHouseholdFilter(effectiveHouseholdId) {
  if (!effectiveHouseholdId) {
    const error = new Error("householdId efectivo es obligatorio.");
    error.code = "HOUSEHOLD_REQUIRED";
    throw error;
  }

  return { householdId: effectiveHouseholdId };
}

export function buildScopedFilter(effectiveHouseholdId, extraFilter = {}) {
  return {
    ...extraFilter,
    ...buildHouseholdFilter(effectiveHouseholdId)
  };
}
