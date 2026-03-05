const USER_INITIALS_OVERRIDES_KEY = "kitchen_user_initials_overrides";

function defaultInitials(displayName = "") {
  const parts = String(displayName).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function readOverrides() {
  try {
    const raw = localStorage.getItem(USER_INITIALS_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeOverrides(nextOverrides) {
  localStorage.setItem(USER_INITIALS_OVERRIDES_KEY, JSON.stringify(nextOverrides));
}

export function getUserInitialsPreference(userId) {
  if (!userId) return "";
  const overrides = readOverrides();
  return overrides[String(userId)] || "";
}

export function setUserInitialsPreference(userId, initials) {
  if (!userId) return;
  const overrides = readOverrides();
  const safeInitials = String(initials || "").trim().slice(0, 3).toUpperCase();
  if (!safeInitials) {
    delete overrides[String(userId)];
  } else {
    overrides[String(userId)] = safeInitials;
  }
  writeOverrides(overrides);
}

export function getUserInitials(userId, displayName) {
  const custom = getUserInitialsPreference(userId);
  if (custom) return custom;
  return defaultInitials(displayName);
}

export function getUserInitialsFromProfile(initials, userId, displayName) {
  const safeInitials = String(initials || "").trim().slice(0, 3).toUpperCase();
  if (safeInitials) return safeInitials;
  return getUserInitials(userId, displayName);
}
