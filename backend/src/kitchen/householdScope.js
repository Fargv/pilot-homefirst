function legacyHouseholdCondition() {
  return [{ householdId: { $exists: false } }, { householdId: null }];
}

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

  return user.householdId ?? null;
}

export function handleHouseholdError(res, error) {
  if (error?.code === "DIOD_ACTIVE_HOUSEHOLD_REQUIRED") {
    return res.status(400).json({ ok: false, error: error.message });
  }

  return null;
}

export function buildHouseholdFilter(effectiveHouseholdId, { includeLegacy = false } = {}) {
  if (effectiveHouseholdId) {
    return { householdId: effectiveHouseholdId };
  }

  if (includeLegacy) {
    return { $or: legacyHouseholdCondition() };
  }

  return {};
}

export function buildScopedFilter(effectiveHouseholdId, extraFilter = {}, { includeLegacy = false } = {}) {
  const householdFilter = buildHouseholdFilter(effectiveHouseholdId, { includeLegacy });

  if (!Object.keys(householdFilter).length) {
    return { ...extraFilter };
  }

  if (!Object.keys(extraFilter).length) {
    return householdFilter;
  }

  if (householdFilter.$or) {
    return { $and: [extraFilter, householdFilter] };
  }

  return { ...extraFilter, ...householdFilter };
}

export function shouldUseLegacyFallback(effectiveHouseholdId) {
  return !effectiveHouseholdId;
}
